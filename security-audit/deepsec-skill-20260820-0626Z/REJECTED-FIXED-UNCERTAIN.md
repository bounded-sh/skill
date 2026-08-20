# Rejected, fixed, and uncertain candidates

Known-false-positive details are intentionally excluded. One candidate was excluded by the accepted register before validation.

## Rejected - 17

1. **Preset role descriptions understate authority.** Actual role grants are visible to the trusted app administrator, and no independent lower-privilege High-impact path was established.
2. **Admin-or-owner rules let admins act on owner data.** This is the documented trusted-admin model, not an authentication or privilege bypass.
3. **Revoked administrator retains build authority.** The current origin/role gate fails closed after revocation; the proposed path did not reach a privileged build.
4. **Manager payout authority is too broad.** No exact attacker-controlled destination and complete unauthorized High-impact payout path was validated.
5. **`flowBound` can be applied to unrelated records.** No reachable fund-moving or privileged operation connected the primitive concern to qualifying impact.
6. **Token-2022 badge collection is publicly writable.** The page intentionally defines a public badge use case; no protected private asset was crossed.
7. **Token-2022 creator authorities are forgeable.** The effective authority remains the explicit creator/owner identity; attacker substitution was rejected by active rules.
8. **Historical tokenomics material suggests an unsafe current path.** The inspected material is inactive historical evidence and not agent-reachable current guidance.
9. **Pooled server custody example lacks isolation.** It is a partial pattern with an explicit surrounding custody warning, not a complete production starting point.
10. **Reserve should be captured at market open.** The cited block is partial and surrounding configuration owns the reserve source; no complete attacker path survived contextual review.
11. **Whole-token transfer wording magnifies base units.** The named helper and containing page disambiguate the operation; a reproducible lower-privilege High-impact path was not shown.
12. **Documented arithmetic rewrite changes an inequality.** The correctness mismatch reproduced, but no active accepted policy and attacker-controlled fund path met the severity gate. The scaled-payment agent evaluation used safe ceiling arithmetic.
13. **Randomness bets can create aggregate insolvency.** Aggregate liability reproduced locally, but no deterministic attacker advantage or practical attacker-driven unauthorized loss met the High gate under the documented randomness trust model.
14. **Failed Poofnet operations leave misleading state.** The impact is reliability and state reporting, not a confirmed unauthorized security-boundary crossing.
15. **A poisoned token-launch identifier can block a launch.** The effect is deployment/availability failure and does not enable takeover or theft.
16. **Provider response can reflect a configured secret.** Exploitation requires the trusted configured provider to return the secret it was entrusted with; the accepted provider boundary was not crossed.
17. **Founder bootstrap or recovery identity has broad authority.** The path is explicit trusted bootstrap/recovery behavior and no external or lower-privileged attacker path was established.

## Fixed - 1

- **Missing-row payout validation.** The current `dueRows` validator fails closed, so the historical candidate's active path is not reachable at the pinned baseline.

## Uncertain - 0

No candidate remains uncertain. Candidates without complete evidence were rejected rather than promoted.
