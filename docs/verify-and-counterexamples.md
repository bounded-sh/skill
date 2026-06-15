# `bounded verify` — Proof Reports & Counterexamples

`bounded verify` compiles the policy into proof obligations and discharges
them with an SMT solver (Z3). It is the local fast loop; `bounded deploy`
runs the same gate server-side and **fails closed** — an unprovable policy
never replaces the previous good one.

## Verdicts

- **PROVED** — holds over *all* inputs (every document state, payload,
  caller). A proof certificate (expression, obligation, solver result,
  integrity hash) is kept for the audit trail.
- **DISPROVED** — a concrete counterexample exists, and the report gives it
  to you: the exact variable assignments that break the property.
- **FAILS CLOSED / UNSUPPORTED** — the policy claims something the runtime
  cannot enforce (e.g. an unsupported onchain invariant, or a `bound` invariant —
  the proof engine does not support `bound`). Deploy is rejected rather than
  silently weakened. **Exception:** a **bare-string attestation** is `UNSUPPORTED`
  but **non-blocking** — surfaced as a "NOT proven (advisory) — bind to prove"
  TODO, never counted as proven, and it does not fail the gate (see the
  attestation row below).

A clean run:

```
$ bounded verify

policy.json — 1 collection, 1 invariant

  create rule is satisfiable                                PROVED   (38ms)
  create requires authentication                            PROVED   (41ms)
  read requires authentication                              PROVED   (40ms)
  transaction postcondition spend_cap
    append-only rolling limit algebra                       PROVED  (106ms)

4 obligations · 0 failed · proof certificates written to .bounded/proofs/
```

## Reading counterexamples

A DISPROVED is not a vague warning — it is the breaking scenario, with
assignments:

```
checkTautology(amount <= 100 || amount > 100)        DISPROVED  (89ms)
  counterexample: @newData.amount = null

checkAuthRequired(create)                            DISPROVED  (52ms)
  counterexample: @user.address = null,
                  @newData.ownerId = null
  null == null satisfies "ownerId == @user.address"
  suggestion: add "@user.address != null" before the ownership check
```

How to act on the two above (these are the canonical patterns):

1. **The `null` counterexample.** "x ≤ 100 or x > 100" reads like a tautology
   until a field is missing. Fix: make the field required (drop the `?`), or
   guard it (`@newData.amount != null && @newData.amount <= 100`). Do not
   "fix" it by removing the check.
2. **The `null == null` auth bypass.** An ownership rule like
   `@newData.ownerId == @user.address` is satisfied by an unauthenticated
   caller writing `ownerId: null`. Fix: prepend `@user.address != null &&`.
   The verifier's suggestion line literally tells you this.

The fix loop is mechanical: read the assignment → reproduce the intent the
policy *should* have had → strengthen the expression → re-run `bounded
verify`. Never weaken the property to make the proof pass; the
counterexample is showing you a write that production would have accepted.

## The obligations list

**Rule-property obligations** (generated per collection from `rules`):

| Obligation | Proves |
|---|---|
| `<action> rule is satisfiable` | The rule can be true at all — dead rules (contradictions that silently deny everything) are surfaced |
| `<action> requires authentication` | No assignment with `@user.address = null` passes a write rule, incl. the `null == null` bypass |
| `field immutability` | Fields marked `!` can never be rewritten by any payload satisfying the update rule |
| `implication` / `equivalence` | Relations between rules (e.g. everything update admits, create admits) — feeds dead-rule and auth-consistency analysis |
| `tautology` / `contradiction` | Always-true rules (no protection) and always-false rules (dead code), with witnesses |
| `read rule uses no getAfter()` | Read rules see committed state only |
| `ownership field exists in schema` | A rule referencing a missing field fails the gate, not the runtime |
| `<action> rule runtime safety` (advisory) | Division/exponent expressions that can trap (divide by zero) get a suggested guard; advisory, non-blocking |

**Invariant obligations** (the `transaction postcondition <name> ...` checks;
failing any blocks deploy):

| Obligation | Proves |
|---|---|
| `... conservation algebra` | Two SMT proofs per `conserve`: the runtime postcondition is *equivalent* to "affected after-sum == affected before-sum" (delta equivalence) plus an induction step over arbitrary multi-document write sets |
| `... append-only rolling limit algebra` | If the runtime admits only nonnegative appended records and the projected window sum is within `limit`, the resulting sum is within `limit`. With `scopeVariable`, the same obligation holds independently per partition |
| `... onchain epoch-bucket conservatism` | (Onchain rollingSum only) the bucketed window sum **dominates** the exact event sum, so accepting against the bucket sum implies the exact rolling sum respects the limit — the approximation can only over-enforce, never under-enforce |
| `... tenant tag binding` | If the generated runtime postcondition accepts, the tag field equals the declared path variable (modeled with an explicit `runtimeAccepts` variable, not a degenerate tautology) |
| `... tenant edge preservation` | An accepted reference write implies source and target tenant tags match |
| `tenant isolation relationship edge coverage` | (Opt-in) every declared relationship edge is covered by source tag + target tag + matching `tenantEdge` invariants, or deploy fails |
| `tenant isolation relationship depth <= k` / `declared graph induction` | (Opt-in) bounded-depth isolation (acyclic within k ≤ 10 hops) or inductive isolation over any finite declared path, cycles included |
| `combined declared DSL formal claim` | One policy-level conjunctive check (`__policy__/formalClaims`) composing every generated obligation into a single verdict |
| `attestation: <claim> — <sub-check>` | A GLOBAL top-level [`attestations`](invariants.md#attestations--global-policy-wide-claims) entry, under the `__policy__/attestations` scope. The human `claim` is echoed verbatim, followed by the discharged obligation (a `roleGatedRead` exposure sweep, `authorityClosure` step, or rolling-limit algebra). A **bare-string** claim with no bound `kind` shows as `UNSUPPORTED` (non-blocking advisory, "NOT proven — bind to prove") — never counted as proven, never blocks deploy |

**Function-auth obligations** (generated per declared Bounded Function from `functions[<name>].auth` — the imperative escape hatch):

| Obligation | Proves |
|---|---|
| `function <name>: only admin can call` | The function's `auth` rule **implies** the admin predicate — i.e. every caller who can invoke it is an admin (`get(/admins/@user.address) != null` where the policy declares an `admins/$address` role scope, else `hasRole("admin")`). An over-permissive hatch (`auth: "true"` or `"@user.address != null"`) is **disproved with a non-admin counterexample** and fails the gate; an `auth: "false"` proves vacuously (unreachable). This catches a function that quietly grants more than admin-only access at **deploy**, not runtime. `auth.*`/`args.*` in the rule are modeled as the caller's `@user.*` / call `@data.*`. |

> **Roadmap — negative/global authority.** Today the function-auth obligation proves a *lower bound* ("only admin can call"). A complementary *upper-bound* capability — "this role can do X and **nothing else**" (closure over the full action set) — is planned; it extends the authority-closure sweep so a policy can prove a role's total reach, not just gate individual rules.

## Staging-verified worked examples

These transcripts are from the staging environment; use them as the expected
behavior contract.

**Spend cap** — `rollingSum(amount), windowSeconds 3600, limit 100, name
spend_cap` on `agents/$agentId/spend/$spendId`:

```
set amount=60   → ✓ committed            (window 60/100)
set amount=60   → ✗ 409 spend_cap        (60+60 = 120 > 100; nothing committed)
set amount=40   → ✓ committed            (window 100/100 — exactly at cap)
set amount=1    → ✗ 409 spend_cap        (100+1 = 101 > 100)
```

The second 60 is identical to the first and still rejected — the cap is about
the window sum, not the write. There is no payload that lands the window
above 100: that is the property the prover discharged at deploy.

**Conserve + set-many** — `conserve(balance), name no_minting`; alice=100,
bob=100:

```
balanced   [{alice: 50}, {bob: 150}]  → ✓ committed (total 200 preserved)
unbalanced [{alice: 50}, {bob: 140}]  → ✗ 409 no_minting
                                         (write-set sum 190 != 200;
                                          neither document changed)
```

**In-batch composition** — see [data-plane.md](data-plane.md#in-batch-composition)
for the allowlist example (guard + gated write in one atomic batch).

## Human-in-the-loop findings

`bounded verify` also renders findings as questions a human can answer:
"create requires no auth — intentional?", "update rule is dead code —
intentional?", "field `balance` has no conservation — should the total be
fixed?". As the agent: propose invariants from schema shape (money-like
fields → conserve/cap candidates; tenant-ish path variables → tenantTag),
let the human arbitrate intent, then regenerate the proof report. Agent
drafts → engine proves or refutes with counterexamples → human decides.

> **Literal `"false"` rules and bare-string attestations are NON-BLOCKING
> advisories.** An append-only / immutable / server-authoritative collection uses
> `"update": "false"` / `"delete": "false"` / `"create": "false"` on purpose —
> this is the supported deny idiom (see
> [invariants.md](invariants.md#rollingsum--caps-over-time-windows) and
> [policy-examples.md](policy-examples.md)). `verify` surfaces these as advisories
> (an intentional-deny note); it does **not** report them as `unsatisfiable (dead
> code)`, does **not** fail the run, and does **not** exit non-zero. A
> bare-string / claim-only attestation is likewise advisory: shown `UNSUPPORTED`
> with a "NOT proven (advisory) — bind to prove" note, never counted as proven
> (soundness), and **non-blocking**. So a policy whose only non-passing items are
> literal-`false` rules or bare-string attestation TODOs **verifies (exit 0) and
> deploys**. Reserve concern for `DISPROVED` lines that carry a **counterexample**
> (concrete variable assignments) — those are the ones that block deploy. Don't
> loop trying to "fix" an intentional `false` rule.

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — generating the policy you verify
- [quality-checklist.md](quality-checklist.md) — the pre-deploy self-check
- [invariants.md](invariants.md) — the invariants behind the postcondition obligations
- [data-plane.md](data-plane.md) — the same examples at runtime
