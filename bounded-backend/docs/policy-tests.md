# Policy Tests — Concrete Allow/Deny Examples (`bounded tests`)

Policy tests are files in `policy-tests/*.json` that assert concrete outcomes:
this actor, writing this document, at this time, is **allowed** or **denied**,
and leaves the state you expect. They are the fast, example-based loop that
guides a human or AI toward the right policy. `bounded verify` remains the
exhaustive guarantee — a proof over every possible input. Use both; neither
replaces the other.

## What policy tests are not

Not proofs. `bounded verify` compiles obligations and discharges them with an
SMT solver — "no counterexample exists for this property, over every state and
caller" (see [verify-and-counterexamples.md](verify-and-counterexamples.md)). A
policy test proves nothing about inputs it didn't run; it just runs one
concrete scenario through the real enforcement engine and checks the result.
Tests give you intent-level confidence ("the creator flip actually works, the
rate cap actually trips at write 21"); proofs give you universal confidence
("no assignment of any field bypasses auth"). A policy can pass every proof
obligation and still not do what you meant — see below.

## When to write them

- **Every security seam gets an allow test and a deny test.** "Owner can
  update" is only half specified without "non-owner cannot."
- **After every counterexample fix.** Once `bounded verify` shows a DISPROVED
  and you strengthen the rule, add a test that pins the fixed behavior so it
  can't regress silently.
- **Before trusting a green `verify`.** A green run does not mean the policy
  does what you intended. Two failure modes hide behind green: a **trivially
  true** rule (`"create": "true"`) satisfies "no assignment bypasses auth"
  because there's no auth to bypass, and shows only as a non-blocking
  advisory, not a failure. A **vacuous invariant** (a `rollingSum` whose
  `scopeVariable` never matches real write paths, a `conserve` on a field the
  intended write path never touches) proves its own algebra sound without
  proving it ever fires. A policy test that runs the real 21st write in a
  window, or the real transfer, catches both — the proof can't, because
  neither is a counterexample to the property as stated.
- **The AI edit loop:** edit `policy.json` → `bounded tests run` → read the
  denial verbatim → fix the policy → `bounded verify` → `bounded deploy`.
  Tests are the tight inner loop; verify is the gate before shipping.

`bounded tests run` executes the local policy in a fresh throwaway sandbox and does not modify the target app's deployed policy.
It still needs an existing app ID for authentication and plan context.
For a brand-new project with no app ID, run `bounded verify` first, create and record the app, then run the policy tests before the next deployment.
You may instead pass `--app-id` for another app you administer when you need the local-policy test loop before creating the new app.

## File format

One file per logical concern, `policy-tests/*.json`:

```json
{
  "version": "1",
  "name": "creator can flip private_test to countdown, nobody else",
  "actors": {
    "Alice": "alice-wallet-or-id",
    "Bridge": { "id": "4k5g...", "address": "4k5g..." }
  },
  "constants": { "MAX_LEN": 14 },
  "steps": [
    { "op": "as", "who": "Alice" },
    { "op": "setTime", "epoch": 1800000000 },
    { "op": "set", "path": "launches/demo", "data": { "creator": "$Alice" } },
    { "op": "set", "path": "launches/demo", "data": { "x": 1 }, "shouldFail": true },
    { "op": "expect", "expr": "get(/launches/demo).status == 'countdown'" }
  ]
}
```

- **`actors`** — string sets both `@user.id` and `@user.address` to that value
  (matches wallet login). Object form `{id?, address?, email?}` splits
  identity for email/onchain scenarios. Steps before any `as` run
  **unauthenticated** (`@user.id == null`) — use that to assert anonymous
  denial.
- **`constants`** — merged over the policy's own `constants` block before
  compile. Shrink a cap here to make a limit testable without 21 real writes.
- **`$Actor` substitution** is recursive over string values of the parsed JSON and is applied before execution.
  A write-step `path` is a JSON string, but a `get(/...)` or `getAfter(/...)` path inside `expr` is parsed as an unquoted expression path.
  Literal segments in those expression paths accept only ASCII letters, digits, and `_`.
  A hyphen is not a path-segment character, so an expression such as `get(/runs/run-001)` is invalid even though `"path": "runs/run-001"` is a valid write path.
  If one fixture ID must appear in both a write path and an expectation path, use a grammar-safe value such as `run_001`, not a UUID or run ID containing `-`.
  There is no documented quoted-segment escape for a `get()` expression path.
  When substitution is used as a scalar value in an expression, quote it as a string literal: `"get(/x).owner == '$Alice'"`.

### Ops

| op | fields | does |
|---|---|---|
| `as` | `who` | Switch the caller identity (an `actors` key) for subsequent steps. |
| `setTime` | `epoch` | Set the logical clock to a unix-seconds value. Default: real time at run start. |
| `advanceTime` | `seconds` | Move the logical clock forward — crosses `rollingSum` windows. |
| `set` | `path`, `data`, `shouldFail?` | Write one document through the real rules and invariants. |
| `setMany` | `writes: [{path,data}]`, `shouldFail?` | Atomic batch write. |
| `delete` | `path`, `shouldFail?` | Delete one document. |
| `deleteMany` | `paths`, `shouldFail?` | Delete many documents. |
| `mock` | `function`, `returns` | Stub a plugin function call for all later steps (args ignored). Write the name exactly as a policy hook does - `@AccountPlugin.createAccount`. The `@`, the dots, and case are normalized away, so `accountplugin_createaccount` is equivalent. A name that is not plugin-function shaped fails the file at validation. |
| `ensure` | `expr`, `then?` | If `expr` is truthy, run the nested `then` steps; else skip. Without `then`, behaves like `expect` (idempotency helper). |
| `expect` | `expr` \| `left`+`right` \| `not` | Assert against current sandbox state. Mutually exclusive: `expr` must be truthy; `left`/`right` compare by `JSON.stringify` equality; `not` must be falsy. |
| `invoke` | `function`, `args?`, `shouldFail?` | Run a policy-declared app function in the sandbox as the current actor. The function's `auth` rule is enforced (same actor/clock/mocks); its declared `actAs` applies; its `ctx.bounded` writes run through the real rules + invariants. `shouldFail` passes on an auth denial OR a function error. `bounded tests run` sends your local `functions/*.ts` sources along automatically (deployed-policy runs have no sources, so `invoke` needs the local-policy loop). |
| `snapshot` | `name`, `expectSame?` | Capture the sandbox's FULL document state under a name. With `expectSame`, assert it is identical (per-path document data) to a previously captured snapshot — the mismatch report names the added/removed/changed paths. |

`shouldFail: true` on any write op means the step **passes if the write is
denied** and its denial is recorded — the run only fails if a write that
should have been denied unexpectedly succeeds.

**The setup-twice gate** (oApp setup-function contract): prove a `setup`
function is safe to re-run by invoking it twice around snapshots —

```json
{ "op": "invoke", "function": "setup", "args": { "slug": "x" } },
{ "op": "snapshot", "name": "s1" },
{ "op": "invoke", "function": "setup", "args": { "slug": "x" } },
{ "op": "snapshot", "name": "s2", "expectSame": "s1" }
```

**Limits:** ≤64KB per file, ≤200 steps per file, ≤50 files per run, ≤25
function sources ≤512KB each, 120s wall clock per run.

**`invoke` caveats:** the function's own `Date.now()` is NOT overridden (its
writes evaluate `@time.now` on the test's logical clock, so avoid `setTime`
far from real time in files that invoke functions stamping wall-clock into
time-pinned rules); declared function `secrets` are unavailable in the
sandbox (such invokes fail closed); `ctx.enqueue` intents and `ctx.build`
authority are withheld from sandbox runs. Bootstrap/seeding mode and onchain
`fund` remain out of scope.

## Running

```bash
bounded tests run                                    # policy-tests/*.json against LOCAL policy.json
bounded tests run --deployed-policy                  # against the app's already-deployed policy instead
bounded tests run --file test-votes.json --file test-admins.json
bounded tests push                                   # attach local files to the app (merge by fileName)
bounded tests push --replace                         # overwrite the app's attached set
bounded tests list                                   # what's attached
bounded tests pull --dir policy-tests                # fetch attached files (won't overwrite without --force)
```

`bounded tests run` defaults to `policy-tests/`, sends files inline with your
**local** `policy.json` as the policy under test — the pre-deploy loop, no
push needed. Human output is per-file PASS/FAIL with the failing step's
denial printed verbatim; exit code is 1 on any failure. `--json` gives the
full machine-readable run. Full flag reference:
[cli-reference.md](../../bounded-deploy/docs/cli-reference.md).

The dashboard has a **Policy tests** tab next to Functions: list attached
tests, run one or all, and expand any run into its per-step trace.

## How results read

Each run returns, per file: `status` (`pass`/`fail`/`error` — `error` means
the policy or test file failed to validate/compile, before any step ran),
timing, counts, the sandbox app id, and a `steps[]` trace (`index`, `op`, a
one-line `summary`, `ok`, and — on failure — the engine's rule-denial `error`
verbatim: rule type, path, message). **The executor stops at the first
failing step**; every step before it still has a full trace, so you see
exactly how far the scenario got before the policy diverged from intent.

## Isolation

Every run gets a **fresh sandbox app**, one per test file per run: same engine
as a production app (`realtime_offchain`, the realtime DO, rules plus runtime
invariants — no parallel evaluator), platform-owned, never claimable, deleted
after the run. Because the sandbox runs the offchain engine, an
`onchain: true` path's **onchain hook is simulated in-worker** and its offchain
hook runs after it — both run. Mocks apply everywhere the sandbox evaluates the
function: rules (including read rules), hooks, and named queries. Writes go through the identical enforcement path a real caller
would hit, so a pass means the write really would be allowed in production.
**The Z3 proof gate is deliberately skipped** for sandbox apps — tests are not
proofs, and sandboxes are quarantined precisely so skipping it is safe. Policy
tests never read or write your app's real data, and never gate `bounded
deploy`.

## Related

- [verify-and-counterexamples.md](verify-and-counterexamples.md) — the proof
  loop policy tests complement
- [quality-checklist.md](quality-checklist.md) — where test coverage fits in
  the pre-deploy self-check
- [testing-authed-apps.md](testing-authed-apps.md) — end-to-end browser tests
  against a real deployed app, a different layer than policy tests
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md) — full
  `bounded tests` flags

## A rejection for the wrong reason is a FALSE GREEN

Adversarial suites — the ones where every assertion is "this write must be
refused" — are the suites that catch the bugs a green `verify` does not. They
also fail silently in a way that is worse than no suite at all: **a write can be
refused because your test document was malformed, and be counted as blocked.**

Two ways it happens, both observed:

- **Schema rejection (HTTP 400).** You added a required field to a collection.
  Every hand-written attack document in your suite now lacks it, so the platform
  refuses the *shape* and the rule never runs. The suite still prints "blocked".
- **A broken test.** `ReferenceError`, a renamed helper, a typo in a path. The
  call throws, the harness catches, and it looks like the policy defended you.

Classify the failure instead of trusting it:

```js
if (/status code 400|is not defined|is not a function/.test(msg)) {
  console.log(`${name} ... NOT TESTED - never reached the policy`);
  notTested++;               // count as a GAP, never as a pass
} else {
  blocked++;                 // an actual policy decline
}
```

Two related habits:

- **Assert relatively, not absolutely.** `activeCount === 7` breaks the moment
  the suite runs twice or against a seeded app, and every later run reads as a
  protocol failure. Assert the *delta* your operation caused.
- **A suite that dies in setup reports nothing.** If setup depends on protocol
  state (a queue being clear, an item being live rather than staged), make it
  wait for that state explicitly — otherwise a correct behaviour change looks
  like a broken protocol.
