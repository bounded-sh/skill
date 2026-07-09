# Quality Checklist

Run this before `bounded deploy`. A policy that verifies clean can still be a *bad*
policy — green but hollow (no invariants on money), or green but leaky (a write
rule that an unauthenticated caller satisfies). This checklist is distilled from
the eval rubrics that grade generated policies; it catches the difference between
"compiles" and "correct."

## The self-check

### Auth — every collection, every action

- [ ] **Every collection has an explicit rule for `read`, `create`, `update`,
  `delete`.** Omitted = deny, but write it out so "deny" is a decision, not an
  oversight.
- [ ] **Every write rule leads with `@user.id != null`** (unless the write is
  genuinely public). Without it, `@newData.owner == @user.id` is satisfied by
  an unauthenticated caller writing `owner: null`.
- [ ] **Ownership / role is actually checked**, not just referenced. "Only the
  owner updates" → `@data.owner == @user.id`. "Only an admin" →
  `get(/.../members/@user.id).role == "admin"`.
- [ ] **Sensitive reads are scoped.** A user's private data uses `$userId ==
  @user.id` or a membership `get()`, not `read: "true"`.
- [ ] **Identity uses `@user.id`, not `@user.address`.** `@user.id` is the
  universal stable identity, always present for an authenticated user (the wallet
  address for wallet logins, the account identity for email/social logins).
  `@user.address` is a real onchain wallet address — present for wallet logins,
  `null` for email-only logins — so reserve it for onchain / wallet semantics. In
  `onchain: true` collections only `@user.address` is allowed; `@user.id`,
  `@user.email`, and `@user.isAnonymous` are forbidden there.

### No trivial, dead, or unsatisfiable rules

- [ ] **No accidental `"true"` on a write** that should be gated. `bounded verify`
  flags always-true rules — treat each as a question.
- [ ] **No dead rules** (contradictions that silently deny everything). The
  satisfiability obligation surfaces these; a rule you meant to allow something
  that can never be true is a bug.
- [ ] **No always-false `update`/`delete` you actually need.** `"false"` is correct
  for immutable/append-only data — make sure you meant it.

### Boundaries covered by invariants

- [ ] **Every money / balance / supply field is under a `conserve`** if its total
  must be preserved. A balance field with no conservation invariant means any write
  can mint value.
- [ ] **Every quota / budget / rate field is under a `rollingSum`** with the right
  window and limit; add `scopeVariable` for per-actor caps.
- [ ] **Every multi-tenant collection has a `tenantTag`**, and every cross-tenant
  reference has a `tenantEdge` (with both ends tagged).
- [ ] **You did step 4 of generation.** If the description involves spending,
  balances, tenancy, or limits and you have zero invariants, you missed a
  non-negotiable. (See [policy-generation-guide.md](policy-generation-guide.md).)
- [ ] **Invariants are named** like error codes — the name is the `409`.

### Types match intent

- [ ] **`rollingSum` fields are `UInt`**; **`conserve` fields are `Int`/`UInt`**;
  **tenant tag fields are `String`.**
- [ ] **Set-once fields are `!`** (owner, author, tenant) so immutability is
  proven, not hoped.
- [ ] **Optional fields used in numeric/comparison rules are null-guarded** — or
  made required. Otherwise the `null` counterexample appears.

### Tiers justified

- [ ] **`durable` for anything an invariant protects** (and for final results). Not
  optional: `rollingSum` / materialized `conserve` reject non-durable at deploy.
- [ ] **`ephemeral` / `checkpointed` only where the loss window is acceptable** —
  presence, cursors, in-flight game state. Don't put a ledger on `ephemeral`.

### Onchain only where needed

- [ ] **Default offchain.** Mark `"onchain": true` only when the description needs
  a blockchain guarantee. Onchain adds cost and constraints (`read: "true"`, no
  `Float`, no offchain `get()`).
- [ ] **No `onchainSupported` overclaim.** Only direct `conserve`, `tenantTag`, and
  `rollingSum` are enforced onchain; the verifier rejects claims beyond that.

### Extras are warranted

- [ ] **Hooks use the right plugin** — `@DocumentPlugin` for offchain side effects;
  onchain plugins only in `hooks.onchain` on onchain collections.
- [ ] **`enforceRules` is deliberate.** Default-privileged hooks bypass per-actor
  rules; set `enforceRules` when a hook's fan-out should be caller-bound. (Never
  affects invariants.)
- [ ] **Webhooks are verified server-side** with `verifyWebhook` before acting.
- [ ] **Search declares only fields you search**; storage collections scope file
  access by path.

### Verify passes clean

- [ ] **`bounded verify` reports 0 failed obligations.**
- [ ] **Every DISPROVED was fixed by strengthening the policy**, never by deleting
  the property or weakening the rule.
- [ ] **You re-ran verify after the last edit.**
- [ ] **Policy tests cover each sensitive seam's allow AND deny.** A green
  `verify` alone doesn't catch a trivially-true rule or a `rollingSum`/`conserve`
  that never actually fires on the real write path — those hide behind passing
  proof obligations. `bounded tests run` a concrete scenario to catch both. See
  [policy-tests.md](policy-tests.md).

## The two failures that hide in green policies

1. **Hollow** — compiles, but a money/quota/tenant property has no invariant.
   Nothing is actually protected. Fix: do step 4; add the invariant.
2. **Leaky** — compiles, but a write rule is satisfiable by an unauthenticated or
   wrong caller (`@user.id == null` matching a `null` owner, missing role check).
   Fix: lead with the auth guard; check ownership/role concretely. `bounded verify`'s
   `requires authentication` obligation catches the first; your own review catches
   the second.

## Is the product real? (don't ship a stub)

A proven backend under a faked product is **not done** — and it's a worse outcome
than no app, because it *looks* finished. The policy can be flawless while the thing
the user actually wanted is hollow. Before you call it done:

- [ ] **The core value is real, not simulated.** No `Math.random()` or hard-coded
  placeholder standing in for the product's actual job (real prices, real matches,
  real analysis, real results) — unless the user explicitly asked for a mock.
- [ ] **AI / LLM features call `ctx.ai.run`** — real inference, no API key needed —
  not templated strings pretending to reason. See
  [functions.md](functions.md#ctxai--real-ai-no-api-keys).
- [ ] **External integrations are wired** (broker, payments, data feed, third-party
  API) via a function `fetch` — or explicitly deferred *with the user told plainly*
  which parts are stubbed and why.
- [ ] **Money flows through real rails.** Selling credit or charging users → route
  through **Bounded billing** (`/billing/checkout`, x402) or the owner's
  `bounded link` + top-up — not a hand-rolled fake checkout.
- [ ] **You stated the honest scope.** If something is a placeholder, say so up
  front; never present a demo as a finished product.

> The proofs are the *guarantee* layer: they make a real app unbreakable, but they
> do not make a stub real. Build the product, then let the invariants bound it.

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — the method that produces this by construction
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — the obligations behind these checks
- [invariants.md](invariants.md) — RULES vs INVARIANTS, so the right things are covered
