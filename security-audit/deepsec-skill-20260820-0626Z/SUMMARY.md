# Security audit summary

## Result

- Confirmed Critical: **0**
- Confirmed High: **9**
- Rejected candidates: **17**
- Fixed candidate: **1**
- Uncertain candidates: **0**
- Aggregate known-false-positive exclusions: **1**

The confirmed High findings are:

1. Vanity-slug release and reclaim can produce browser session and domain takeover.
2. A bare deploy can promote an environment-specific staging authority into production.
3. Source sync can upload Git-ignored credentials because its ignore matcher differs from Git.
4. A prediction-market creator can resolve early and sweep unrelated users' collateral.
5. Two distinct prediction-market sell paths in one batch can drain pooled collateral.
6. Pump buy slippage is recomputed from attacker-moved execution reserves instead of a signed minimum.
7. Analytics viewer access can reveal reset credentials and bearer tokens retained by the sanitizer.
8. Any authenticated app user can invoke secret-bearing agent capabilities without action authorization.
9. A standalone NFT payer becomes update authority despite the program-managed authority claim.

Full evidence is in [`findings/all-confirmed.md`](findings/all-confirmed.md).

## Baseline

- Repository: `git@github.com:bounded-sh/skill.git`
- Commit: `54b05647169d6ed8b011db0c7a7cc9cc91cc0c53`
- Tree: `8dc36e42d1123ce3643fefe61b1e66088c2a3e99`
- Audit window: `2026-08-20T06:26:53Z` to `2026-08-20T12:26:53Z`

## Coverage

- 161 of 161 pinned tracked files inventoried and hash-reconciled.
- 140 non-generated files covered by six non-overlapping DeepSec partitions.
- 21 generated files verified against the canonical catalog and curated fragments.
- File dispositions: 7 supported-language scan, 113 forced-format security review, 21 generated parity, and 20 test/fixture security-contract review.
- 646 of 646 public examples inventoried: 641 fenced blocks and 5 downloadable artifacts.
- Example classes: 111 complete, 66 partial, 267 executable, 52 conceptual, and 150 generated.
- 17 exact example duplicates were reviewed through canonical content hashes.
- 12 of 12 representative agent-behavior evaluations completed.

## Validation

The required policy suite ran every one of its 11 specifications without skips: 72 of 121 steps passed and 49 failed closed because six page policies omit the wallet-auth transport required by the harness. A separate audit-only two-identity suite passed all 10 applicable authorization checks. All nine normalized High findings have focused local or exact code-level evidence and official DeepSec xhigh true-positive verdict coverage.

This audit is evidence at the pinned commits, not a guarantee that the skill or generated applications contain no other vulnerabilities.
