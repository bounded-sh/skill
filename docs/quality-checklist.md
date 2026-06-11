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
- [ ] **Every write rule leads with `@user.address != null`** (unless the write is
  genuinely public). Without it, `@newData.owner == @user.address` is satisfied by
  an unauthenticated caller writing `owner: null`.
- [ ] **Ownership / role is actually checked**, not just referenced. "Only the
  owner updates" → `@data.owner == @user.address`. "Only an admin" →
  `get(/.../members/@user.address).role == "admin"`.
- [ ] **Sensitive reads are scoped.** A user's private data uses `$userId ==
  @user.address` or a membership `get()`, not `read: "true"`.

### No trivial, dead, or unsatisfiable rules

- [ ] **No accidental `"true"` on a write** that should be gated. `bounded verify`
  flags always-true rules — treat each as a question.
- [ ] **No dead rules** (contradictions that silently deny everything). The
  satisfiability obligation surfaces these; a rule you meant to allow something
  that can never be true is a bug.
- [ ] **No always-false `update`/`delete` you actually need.** `"false"` is correct
  for immutable/append-only data — make sure you meant it.

### Non-negotiables covered by invariants

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

## The two failures that hide in green policies

1. **Hollow** — compiles, but a money/quota/tenant property has no invariant.
   Nothing is actually protected. Fix: do step 4; add the invariant.
2. **Leaky** — compiles, but a write rule is satisfiable by an unauthenticated or
   wrong caller (`null == null`, missing role check). Fix: lead with the auth
   guard; check ownership/role concretely. `bounded verify`'s
   `requires authentication` obligation catches the first; your own review catches
   the second.

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — the method that produces this by construction
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — the obligations behind these checks
- [invariants.md](invariants.md) — RULES vs INVARIANTS, so the right things are covered
</content>
