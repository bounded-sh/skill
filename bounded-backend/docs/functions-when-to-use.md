# When to use a Function (and when NOT)

**What's in here / when to read this:** the decision guide — the
declarative-to-imperative hierarchy and concrete use/don't-use calls. Read it
*before* adding a function.

A function is **imperative, un-proven logic**. Its *writes* are still bounded by
enforced authorization rules and proved invariant obligations, and its
*invocation* is policy-gated — but its **logic is not proven**. So the
agent-facing rule is blunt:

> **Use the least-powerful tool that works. Do NOT reach for a function if a
> rule, an invariant, or a hook can do the job.** A function is the escape hatch,
> not the default.

## The hierarchy (most declarative → most imperative)

| Tier | What it is | Proven? | Reach for it when… |
|---|---|---|---|
| **1. Rules + invariants** | Declarative access control + provable constraints (caps, conservation, isolation, ownership) | Authorization rules are **enforced** atomically. Declared invariants and generated safety obligations are **proved where supported** by Z3 at deploy. | **Always first.** Any access decision; any constraint that must hold across every write. |
| **2. Hooks** | In-DB bytecode side-effects *inside* the boundary (derive a field, cascade a write) | Not proven, but **can't leave the DB**: no external calls, no secrets; writes still answer to invariants | A simple reactive side-effect that only *reacts* to a write and stays in-boundary. |
| **3. Functions** | Imperative code that may **leave the boundary** (external API, secrets, complex multi-step logic, scheduled external work) | **Logic NOT proven.** Writes still go through invariants; invocation still gated by the `auth` rule | **Only** when you must pull from / push to the outside world, or run imperative logic the declarative tiers can't express. |

Climb this ladder top-down. Stop at the first rung that works. You only get to
rung 3 when rungs 1 and 2 genuinely cannot do it — because rung 3 is the only one
whose body a proof never sees.

## The deciding question

> **Does the logic have to LEAVE the boundary?** (call an external API, read a
> secret, do imperative multi-step work that rules/hooks can't express.)
>
> - **No** → it's access control or an in-boundary constraint/side-effect →
>   **rule / invariant / hook**.
> - **Yes** → it's a **function**.

If it only *reacts to a write* and stays inside the DB, it's a hook. If it must
*pull from or push to the outside world*, it's a function.

## Concrete calls

| Scenario | Right tool | Why |
|---|---|---|
| "Only an admin may hide a post" | **rule** — `get(/admins/@user.id) != null` on `update` | Pure access control. A function here would duplicate an authorization rule the runtime already enforces. |
| "Balances are never minted or destroyed" | **invariant** — `conserve` on the balance field | A cross-write guarantee. Only an invariant *proves* it; a function can't (and its own writes still answer to it anyway). |
| "A buyer should one-click buy a listed good from another user" | **rule + invariant + proof declaration** — `proofs.transferAuthority` for the good's `holder`, `conserve` on the wallet balance, one `setMany` | No external call needed. The buyer can invoke the atomic batch directly, or through a caller-scoped function, without `actAs`. Put the sale predicate in `defs` and reference it from both the update rule and the proof. |
| "An agent spends at most $5000/day" | **invariant** — `rollingSum` window cap | Provable quota. Never enforce a cap in function code — put it where it's proven, then even a function's writes obey it. |
| "When a message is posted, bump the room's `lastMessageAt`" | **hook** — `hooks.offchain.create` → `updateField` | In-boundary cascade, reacts to a write, no external call. |
| "Charge a card via Stripe, then mark the order paid" | **function** | Must call an external API with a secret. Declarative policy can't `fetch`. |
| "Enrich a new lead from a third-party data API" | **function** | External pull + transform, then write back through the boundary. |
| "Summarize a document with an LLM and store the summary" | **function** | External LLM call + secret. The *write* still obeys your rules/invariants. |
| "Every night, pull FX rates from an API and write a rollup" | **function on a `schedule`** | Scheduled **external** work. (A nightly reset that touches only local docs is a scheduled **hook**, not a function — stay on rung 2.) |

Notice the symmetry: every "use a function" row crosses the boundary (Stripe,
Clearbit, an LLM, an FX API). Every "don't" row is access control, a provable
constraint, or an in-boundary cascade — declarative or contained tiers that a
function would only weaken.

## The trap to avoid

Re-implementing access control or a cap *inside* a function ("the function checks
the caller is an admin", "the function refuses if the total would exceed 100") is
the anti-pattern. That logic is now **un-proven** and bypassable by any other
write path. Push authorization into the function's `auth` rule and the constraint
into an invariant; keep the function body to the part that genuinely needs to
leave the boundary.

## Current proof boundary

A function is **un-proven logic contained by an enforced policy boundary**: its
writes must pass runtime authorization rules and proved invariant obligations,
and its invocation is gated by the function `auth` rule. Normal functions write
as the caller; `actAs` functions write as a service identity and must be
admin-gated. Keep guaranteed properties in declared invariants and keep
authorization in policy rules, not inside function code.

## Related

- [functions-graduation.md](functions-graduation.md) — start simple, then graduate from Bounded functions to the Bounded runtime or your own server when needed
- [functions.md](functions.md) — declare, write, deploy, invoke, secrets, limits
- [invariants.md](invariants.md) — the declared, verifier-reported obligations a function's writes still obey
- [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) — rung 2 (in-boundary hooks) vs notify-out webhooks
- [policy-generation-guide.md](policy-generation-guide.md) — the method that defaults to enforced rules and proved invariants first
