# Scheduled sweeps without full collection scans

Use this pattern when one recurring function must revisit a large collection.
Run one function every minute, but never enumerate the whole target collection
in one invocation.

Candidate selection has three inputs:

1. Due-row queries select state transitions that must run now.
2. A dirty collection coalesces user activity into one flag per entity.
3. A fixed-size cursor page gives every entity eventual background coverage.

Deduplicate the three inputs by entity id, process each entity independently,
then advance the cursor. The cursor page is bounded by `SWEEP_LIMIT`. Due and
dirty inputs are selective, but can still grow during a burst. Add page caps or
backpressure if those inputs can exceed the function timeout.

## Schedule and service identity

Attach `schedule` to an offchain collection. Its `run` names a top-level
function. A scheduled run is authorized by the deployed schedule and does not
pass through the function's direct-call `auth` rule. Set `actAs` so
`ctx.bounded` reads and writes as a fixed service identity. Keep an admin `auth`
rule for direct invocation and for the privileged function declaration.

Deploy the function before, or with, the policy that schedules it.

This is a compact policy shape. Replace both service-address placeholders with
the same address. Keep the bootstrap-safe admin collection from your app.

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
      "create": "@user.id != null && (get(/admins/@user.id) != null || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id) != null",
      "delete": "@user.id != null && get(/admins/@user.id) != null && $userId != @const.FOUNDER"
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
      "delete": "@user.address == @const.SWEEPER"
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
      "auth": "@user.id != null && get(/admins/@user.id) != null",
      "entry": "functions/tick.ts",
      "actAs": "<service-address>",
      "timeout": 60
    }
  }
}
```

Any signed-in identity may create or refresh `dirty/$slug`. Only the sweeper
may delete it. A false flag causes a truthful recomputation, not an authorized
state change. The time check rejects stale or far-future flag timestamps.

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

  const dirtyRows = await readAll(ctx, "dirty");
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
- Coalesce activity into `dirty/<entityId>`.
- Let signed-in actors flag. Let only the service identity clear.
- Read one ordered cursor page with a fixed `SWEEP_LIMIT`.
- Store the opaque cursor in service-only `tickstate/sweep`.
- Deduplicate all candidates before processing.
- Catch errors per item.
- Make every transition and side effect retry-safe.
- Build merge payloads from a field allowlist.

See [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) for schedule
semantics, [functions.md](functions.md) for `ctx.bounded`, and
[queries.md](queries.md) for filters and cursor pagination.
