# Scheduled sweeps without full collection scans

Use this pattern when one recurring function must revisit a large collection.
Run one function every minute, but never enumerate the whole target collection
in one invocation.

Candidate selection has three inputs:

1. Due-row queries select state transitions that must run now.
2. A dirty collection coalesces user activity into one flag per entity.
3. A fixed-size cursor page gives every entity eventual background coverage.

Deduplicate the three inputs by entity id, process each entity independently,
then advance the cursor. The cursor page and the dirty page are both bounded by
`SWEEP_LIMIT`, so no single invocation enumerates the whole collection. Due
queries are selective by status/time; add a page cap or backpressure to them too
if they can grow past the function timeout during a burst.

## Schedule and service identity

Attach `schedule` to an offchain collection. Its `run` names a top-level
function. A scheduled run is authorized by the deployed schedule and does not
pass through the function's direct-call `auth` rule. Set `actAs` so
`ctx.bounded` reads and writes as a fixed service identity. Keep an admin `auth`
rule for direct invocation and for the privileged function declaration.

Deploy the function before, or with, the policy that schedules it.

This is a compact policy shape. Replace both service-address placeholders with
the same address — the address of a **service identity whose key the platform
holds**, never a person's wallet. The sweeper keypair is provisioned for the
function's `actAs` identity and stays in the server/platform environment that
runs the schedule; it must never be the founder's wallet (the `FOUNDER`
constant sits directly above and is the wrong guess), an end user's wallet, or
any key a human can sign with. Whoever holds the sweeper key can write
`launches/`, `dirty/`, and `tickstate/` directly through the data plane,
bypassing every invariant the `tick` function enforces. Keep the
bootstrap-safe admin collection from your app.

`@user.address` is the right guard key here, and nowhere else in this shape:
an `actAs` service identity is an address, not an account, so it cannot be
keyed on `@user.id`. This is the service-identity exception to the family rule
(bounded-frontend SKILL) that ownership, membership, and auth guards for human
principals key on `@user.id` and reach for `@user.address` only for
wallet/onchain semantics.

```json
{
  "constants": {
    "FOUNDER": "<founder-user-id>",
    "SWEEPER": "<service-address>"
  },
  "launches/$slug": {
    "tier": "durable",
    "fields": {
      "name": "String!",
      "slug": "String!",
      "createdAt": "UInt!",
      "status": "String",
      "launchAt": "UInt?",
      "liveAt": "UInt?",
      "score": "Int?"
    },
    "rules": {
      "read": "true",
      "create": "@user.address == @const.SWEEPER",
      "update": "@user.address == @const.SWEEPER",
      "delete": "@user.address == @const.SWEEPER"
    },
    "schedule": {
      "every": "1m",
      "run": "tick"
    }
  },
  "admins/$userId": {
    "tier": "durable",
    "fields": {
      "active": "Bool"
    },
    "rules": {
      "read": "@user.id != null",
      "create": "@user.id != null && (get(/admins/@user.id).active == true || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id).active == true",
      "delete": "@user.id != null && get(/admins/@user.id).active == true && $userId != @const.FOUNDER"
    }
  },
  "dirty/$slug": {
    "tier": "durable",
    "fields": {
      "at": "UInt"
    },
    "rules": {
      "read": "@user.id != null",
      "create": "@user.id != null && @newData.at >= @time.now - 120 && @newData.at <= @time.now + 120",
      "update": "@user.id != null && @newData.at >= @time.now - 120 && @newData.at <= @time.now + 120",
      "delete": "@user.address == @const.SWEEPER && @data.at <= get(/tickstate/sweep).at"
    }
  },
  "tickstate/$key": {
    "tier": "durable",
    "fields": {
      "cursor": "String?",
      "at": "UInt?"
    },
    "rules": {
      "read": "@user.address == @const.SWEEPER",
      "create": "@user.address == @const.SWEEPER",
      "update": "@user.address == @const.SWEEPER",
      "delete": "@user.address == @const.SWEEPER"
    }
  },
  "functions": {
    "tick": {
      "auth": "@user.id != null && get(/admins/@user.id).active == true",
      "entry": "functions/tick.ts",
      "actAs": "<service-address>",
      "timeout": 60
    }
  }
}
```

> **Founder self-deactivation trap - do not disable the founder here.** This variant
> makes the founder row **undeletable** (`$userId != @const.FOUNDER` on `delete`) while
> `update` requires `.active == true`. So if the founder's own `admins/<FOUNDER>` row is
> ever written `active: false`, it can be **neither** deleted **nor** reactivated (the
> genesis `create` clause only fires on a *non-existent* row) - the founder is locked out
> with no recovery path. Do not deactivate the founder in this shape; keep at least one
> **other** active admin for routine revocation. If you genuinely need delete-based founder
> recovery, drop the `$userId != @const.FOUNDER` delete-guard (then an active admin can
> delete the founder row and the founder re-creates it via the genesis clause).

Any signed-in identity may create or refresh `dirty/$slug`. Only the sweeper
may delete it. A false flag causes a truthful recomputation, not an authorized
state change. The time check rejects stale or far-future flag timestamps.

The delete rule is **delete-if-unchanged**: it also requires the flag's current
`at` to be no newer than the pass-start timestamp the tick stamps into
`tickstate/sweep` before processing. This closes the **read-then-delete race**:
the tick reads `dirty/` at T0 and deletes after processing at T1, and any flag
re-created by user activity in between carries a fresh `at`, so the delete is
denied and the flag survives for the next pass instead of being wiped without
its item ever being processed. Without the guard that lost update has no error
surface; the only backstop is the round-robin cursor, which can take hours to
reach the entity on a large collection (`SWEEP_LIMIT` per minute). The stamp
must land before the deletes (the reference code writes `tickstate/sweep`
first); if that write fails, the rule denies every delete and the flags are
retried next pass — fail-closed.

Write the flag in the same atomic batch as the activity when both writes use the
same data plane:

```ts
await setMany([
  {
    path: `launches/${slug}/votes/${userId}`,
    document: { value, at: nowSec },
  },
  {
    path: `dirty/${slug}`,
    document: { at: nowSec },
  },
]);
```

The dirty id is the entity id. Repeated activity updates one flag instead of
adding one queue row per event.

## Selection code shape

`ctx.bounded.get(collection, { filter, sort, limit, cursor })` returns a page
when `limit` is present. Pass `nextCursor` back unchanged. Treat an empty stored
cursor as the first page.

```ts
const SWEEP_LIMIT = 40;
const PAGE_LIMIT = 500;

function asRows(raw: any): any[] {
  return Array.isArray(raw) ? raw : raw?.data || raw?.documents || [];
}

function rowId(row: any): string {
  return row.id || row._id?.split("/").pop() || "";
}

async function readAll(ctx: any, path: string, opts: any = {}): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const page: any = await ctx.bounded.get(path, {
      ...opts,
      limit: PAGE_LIMIT,
      cursor,
    });
    rows.push(...asRows(page));
    cursor = page?.nextCursor || undefined;
  } while (cursor);
  return rows;
}

export default async function tick(_args: any, ctx: any) {
  const now = Math.floor(Date.now() / 1000);
  const errors: Array<{ slug: string; error: string }> = [];

  const dueCountdown = await readAll(ctx, "launches", {
    filter: { status: "countdown", launchAt: { $lte: now } },
  });
  const dueLive = await readAll(ctx, "launches", {
    filter: { status: "live", liveAt: { $lte: now - 3600 } },
  });

  // Cap the dirty input the same way as the round-robin sweep below: one bounded
  // page (SWEEP_LIMIT), oldest-first. Excess flags stay for the next pass and the
  // cursor sweep is the eventual backstop, so a burst of dirty writes can never
  // make one invocation enumerate the whole collection.
  const dirtyPage: any = await ctx.bounded.get("dirty", {
    sort: { at: 1 },
    limit: SWEEP_LIMIT,
  });
  const dirtyRows = asRows(dirtyPage);
  const dirtySlugs = dirtyRows.map(rowId).filter(Boolean);

  const state = await ctx.bounded.get("tickstate/sweep").catch(() => null);
  const sweepPage: any = await ctx.bounded.get("launches", {
    sort: { createdAt: 1 },
    limit: SWEEP_LIMIT,
    cursor: state?.cursor || undefined,
  });
  const sweepRows = asRows(sweepPage);
  const nextCursor = sweepPage?.nextCursor || "";

  await ctx.bounded
    .set("tickstate/sweep", { cursor: nextCursor, at: now })
    .catch(() => {});

  const candidates = new Map<string, any>();
  for (const row of [...dueCountdown, ...dueLive, ...sweepRows]) {
    if (row?.slug) candidates.set(row.slug, row);
  }
  for (const slug of dirtySlugs) {
    if (candidates.has(slug)) continue;
    const row = await ctx.bounded.get(`launches/${slug}`).catch(() => null);
    if (row?.slug) candidates.set(slug, row);
  }

  for (const [slug, row] of candidates) {
    try {
      await processLaunch(row, slug, now, ctx);
    } catch (error: any) {
      errors.push({ slug, error: error?.message || String(error) });
    }
  }

  for (const slug of dirtySlugs) {
    // Delete-if-unchanged: the rule compares the flag's CURRENT `at` against
    // the pass start stamped in tickstate/sweep, so a flag refreshed by user
    // activity since the T0 read is denied here and survives for the next
    // pass. The catch absorbs that expected denial.
    await ctx.bounded.delete(`dirty/${slug}`).catch(() => {});
  }

  return {
    ok: errors.length === 0,
    processed: candidates.size,
    swept: sweepRows.length,
    sweepMore: Boolean(nextCursor),
    errors,
  };
}
```

The empty cursor restarts the ordered walk on the next run. If the cursor-state
write fails, the previous page repeats. Item processing must therefore be safe
to repeat.

One item failure must not stop the rest of the fleet. The reference pattern
clears dirty flags after the pass and uses the round-robin sweep as the retry
backstop. If failed dirty work needs a prompt retry, clear only flags whose item
completed successfully.

## Idempotent merge-writes

Build each scheduled write from an explicit field allowlist. Do not spread the
raw read result into a write. Leave hook-owned and runtime-owned fields out of
the scheduled writer's field set.

```ts
const LAUNCH_FIELDS = [
  "name",
  "slug",
  "createdAt",
  "status",
  "launchAt",
  "liveAt",
  "score",
];

function pick(source: any, fields: string[]): any {
  const out: any = {};
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null) {
      out[field] = source[field];
    }
  }
  return out;
}

async function processLaunch(row: any, slug: string, now: number, ctx: any) {
  const next = pick(row, LAUNCH_FIELDS);
  let changed = false;

  if (row.status === "countdown" && row.launchAt <= now) {
    next.status = "live";
    next.liveAt = now;
    changed = true;
  }

  const score = await recomputeScoreFromAuthoritativeRows(slug, now, ctx);
  if (next.score !== score) {
    next.score = score;
    changed = true;
  }

  if (changed) await ctx.bounded.set(`launches/${slug}`, next);
}
```

The transition is retry-safe because a live row no longer matches the countdown
branch. Derived values are recomputed from authoritative rows, not incremented
from a possibly stale denormalized value. Use create-once operation ids or one
atomic `setMany` for side effects that must occur exactly once.

## Checklist

- Schedule one function with `every: "1m"`.
- Give it a narrow `actAs` identity. Gate manual invocation with admin auth.
- Query due states with structured filters.
- Coalesce activity into `dirty/<entityId>`, and read it back capped at
  `SWEEP_LIMIT` (never a full-collection scan).
- Let signed-in actors flag. Let only the service identity clear, and clear
  delete-if-unchanged (flag `at` no newer than pass start) so a flag refreshed
  mid-pass survives for the next pass.
- Read one ordered cursor page with a fixed `SWEEP_LIMIT`.
- Store the opaque cursor in service-only `tickstate/sweep`.
- Deduplicate all candidates before processing.
- Catch errors per item.
- Make every transition and side effect retry-safe.
- Build merge payloads from a field allowlist.

See [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) for schedule
semantics, [functions.md](functions.md) for `ctx.bounded`, and
[queries.md](queries.md) for filters and cursor pagination.
