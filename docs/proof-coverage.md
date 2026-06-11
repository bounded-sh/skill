# Proof Coverage — The Two-Layer Model

Two distinct layers carry formal claims, with different runtime coverage.
Knowing which layer a guarantee lives in tells you exactly where it is
enforced — and what a policy is allowed to claim.

## Layer A — rule properties: both runtimes, one semantics

Auth-required, field immutability, dead-rule/satisfiability, implication and
tautology/counterexample analysis are proven once by the Z3 engine against
the policy expressions — and enforced identically everywhere, because the
**same compiled rule bytecode** executes in the realtime runtime and in the
onchain program. Nothing is ported between runtimes, so nothing can drift.

## Layer B — invariants: full offchain, verified subset onchain

| Invariant | Offchain (realtime) | Onchain |
|---|---|---|
| `conserve` (direct) | enforced | enforced |
| `conserve` (materialized) | enforced | **fails closed** |
| `conserve` (sharded) | enforced | **fails closed** |
| `rollingSum` | enforced (exact window) | enforced (epoch-bucketed) |
| `tenantTag` | enforced | enforced |
| `tenantEdge` | enforced | **fails closed** |

"Fails closed" means two things, both load-bearing:

1. A policy claiming `onchainSupported` for those rows is **rejected at
   verify time** — declarations cannot overclaim.
2. An onchain runtime receiving invariant metadata it does not support
   rejects the write rather than skipping the check.

## Onchain rolling caps: epoch-bucketed, conservative by proof

The onchain runtime tracks each rolling window with 64 epoch buckets in a
circular array (one state account per app/path/field/window). The tracked
bucket sum **dominates** the exact in-window event sum: a spend can be
counted for up to one extra bucket width past the window, never less. So the
onchain cap can only **over-enforce** relative to the declared window —
reject near the boundary — and never under-enforce.

That safety direction is not an argument; it is an obligation: the verifier
emits an SMT-proved **epoch-bucket conservatism** check for every
`onchainSupported` rollingSum. And the bucket mechanism itself is verified
with Kani (model-checked Rust harnesses, part of a 263-harness matrix). Two
earlier bucket-width formulas were refuted by Kani with boundary
counterexamples before the shipped one verified — the tooling caught the
off-by-one that review missed.

Operational notes for capped onchain collections:

- `windowSeconds` is part of the state account derivation, so one field can
  carry several independent windows (hourly + daily) with separate states.
- Changing a window cuts over to fresh (cold) bucket state; the always-warm
  offchain enforcement shields stack-mediated writes during the cold start.
- Capped collections reject updates and deletes onchain too — the
  append-only contract is the same on both runtimes.

## What is NOT claimed

Keep these scope edges in mind when describing guarantees to a user:

- Proofs cover **declared** constraints. An invariant you didn't declare
  isn't proven; `bounded verify` proposes candidates, the human arbitrates.
- The proofs are about the policy and its enforcement algebra, not about
  application code being bug-free. Frontends and agents can still be wrong —
  they just can't corrupt the constraints.
- Liveness is not claimed: rejecting all invalid writes is proven; accepting
  every valid write shape is not.
- Rolling caps account exactly the events written to the declared
  append-only scope. Spending that bypasses the collection is outside the
  statement.
- Tenant isolation claims are about the declared relationship graph; the
  opt-in coverage/depth/induction gates exist precisely to force every real
  edge into the declared set before an isolation claim is made.

## Related

- [verify-and-counterexamples.md](verify-and-counterexamples.md) — the obligations that back this table
- [invariants.md](invariants.md) — declaring `onchain` coverage per invariant
