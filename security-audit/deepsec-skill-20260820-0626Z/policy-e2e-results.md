# Policy example E2E results

## Required suite

The required command was run against the pinned local monorepo stack and pinned CLI binary:

```sh
BOUNDED_CLI_BIN=/tmp/bounded-audit-cli-755dd6b1 \
BOUNDED_MONOREPO=/Users/athar/Desktop/workspace/poof-new/bounded-monorepo-audit.2CUS9x \
node scripts/policy-e2e/run.mjs --require
```

Result: 11 specs, 121 steps, 72 passed, 49 failed, and 0 skipped. Every policy extracted, deployed, and verified. Escrow, isolated vault, prediction market, staking, and treasury completed every step. CP-AMM liquidity, marketplace, NFT collection, randomness, token launch, and Token-2022 then failed closed at authenticated operations because those public page policies omit `auth.wallets`; the harness identity could not establish app authentication. None of these failures admitted an unauthorized operation. They are correctness or executable-context limitations, not confirmed High or Critical security findings.

| Specification | Passed | Failed | Skipped |
|---|---:|---:|---:|
| escrow-per-escrow-pda | 13 | 0 | 0 |
| isolated-vault | 9 | 0 | 0 |
| cp-amm-liquidity-positions | 2 | 9 | 0 |
| marketplace-listings-orders-spend-cap | 2 | 11 | 0 |
| nft-collection | 2 | 7 | 0 |
| prediction-market-amm | 19 | 0 | 0 |
| randomness-coin-flip | 3 | 6 | 0 |
| staking-lock-vault | 13 | 0 | 0 |
| token-launch | 2 | 7 | 0 |
| token2022-extensions | 2 | 9 | 0 |
| treasury | 5 | 0 | 0 |
| **Total** | **72** | **49** | **0** |

An earlier run was discarded because the local wrapper selected an unpinned sibling CLI. It is retained only as an environment-isolation error and is not counted above.

## Audit-only victim and attacker suite

The focused suite used two unrelated local authenticated wallet identities. It injected wallet authentication only as transport for examples that omitted it, without changing any policy rule, hook, invariant, signer, source, destination, amount, or authority condition.

Result: 10 of 10 applicable checks passed:

- owner paths accepted during setup;
- unrelated user could not rewrite a victim listing;
- unrelated user could not consume the victim's scoped cap;
- unrelated user could not read the victim's private order;
- unrelated user could not release escrow, withdraw a vault or liquidity position, mint into a victim collection, resolve a victim market, unstake a victim position, or select a victim fee-withdrawal authority.

Denied reads were treated according to Bounded semantics: an empty successful response with no document counted as denial. Intentionally public reads and intentionally public deposit or crank operations were classified as not applicable rather than tested as private.

Machine-readable results are in `policy-cross-user-results.json`; the runner is in `tools/policy-cross-user-e2e.mjs`.

The distinct-identity suite was rerun after focused validation and again passed 10 of 10 checks. The retained machine result records the complete earlier clean run; the final command record records the repeat.

## Additional focused policy and runtime reproductions

- Early creator resolution and sweep reproduced on a future-dated prediction market.
- Two distinct same-batch sell paths reproduced a physical payout greater than the final recorded reserve decrement.
- The aggregate randomness liability case reproduced but did not meet the audit's attacker-driven High-impact gate.
- A lower-privileged authenticated app user reached a secret-bearing runtime agent handler while direct and downstream policy writes remained denied.
- A standalone NFT mint policy passed deployment verification; exact runtime and locked dependency inspection established the unexpected payer update authority.

Raw required-suite output is retained in `policy-e2e-required-raw.txt`, its parsed result in `policy-e2e-required-summary.json`, focused results in `focused-validation-results.json`, and reproduction sources under `reproductions/`.
