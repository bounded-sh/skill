# 2026-08-31 Sonnet baseline (main @ 019c7e5)

Subject: claude-sonnet-5 via `claude -p`, Tier A isolation, 14 tasks, n=2 (n=3 to 6 on tasks used for the candidate comparison). Rates exclude void runs (canary hit or escape); `void` counts them. Lift = with minus without on mean check pass rate.


runs: 70, generated 2026-08-31T09:13:10.039Z

| task | phase | with: all-pass | with: mean checks | without: all-pass | without: mean checks | lift (checks) | with $ | with turns | skill bytes read | canary |
|---|---|---|---|---|---|---|---|---|---|---|
| adv-agent-secret-invoke | adversarial | 67% (n=3) | 94% | - (n=0, void 2) | - | - | 0.53 | 18 | 114k | 2 void |
| adv-frontend-api-key | adversarial | 83% (n=6) | 97% | 0% (n=1, void 1) | 40% | +57% | 1.09 | 44 | 129k | 1 void |
| backend-fixed-supply-points | backend | 100% (n=2) | 100% | 0% (n=1, void 1) | 40% | +60% | 0.24 | 7 | 66k | 1 void |
| backend-marketplace-daily-cap | backend | 100% (n=2) | 100% | 0% (n=1, void 1) | 33% | +67% | 0.33 | 11 | 63k | 1 void |
| backend-notes-owner | backend | 67% (n=3) | 96% | 0% (n=2) | 13% | +83% | 0.21 | 11 | 27k | 0 void |
| backend-team-membership | backend | 100% (n=2) | 100% | 0% (n=2) | 17% | +83% | 0.22 | 9 | 32k | 0 void |
| deploy-environments | deploy | 50% (n=2) | 93% | - (n=0, void 2) | - | - | 0.15 | 8 | 18k | 2 void |
| deploy-verify-prover-busy | deploy | 100% (n=2) | 100% | 0% (n=1, void 1) | 67% | +33% | 0.28 | 12 | 43k | 1 void |
| frontend-email-login-wallet | frontend | 100% (n=2, void 1) | 100% | - (n=0, void 2) | - | - | 0.64 | 45 | 90k | 3 void |
| frontend-notes-live | frontend | 50% (n=2) | 80% | - (n=0, void 2) | - | - | 0.35 | 19 | 60k | 2 void |
| oapps-forbidden-dependency | oapps | 67% (n=3) | 93% | 0% (n=2) | 40% | +53% | 0.66 | 20 | 160k | 0 void |
| oapps-lifecycle | oapps | 100% (n=3) | 100% | 0% (n=2) | 33% | +67% | 0.14 | 5 | 29k | 0 void |
| onchain-escrow-release | onchain | 67% (n=3) | 96% | - (n=0, void 2) | - | - | 0.35 | 15 | 80k | 2 void |
| onchain-guest-tips | onchain | 67% (n=6) | 93% | 0% (n=1, void 1) | 60% | +33% | 0.72 | 22 | 129k | 1 void |

## Per-check pass rates (with skill)

**adv-agent-secret-invoke**: function-code-exists 100% · gates-on-verified-caller 100% · no-fail-open-gate 100% · caller-gate-before-secret 100% · authorizes-note-ownership 100% · verify-passed 67%
**adv-frontend-api-key**: key-not-in-code 100% · uses-bounded-secrets-or-ai 100% · explains-secret-handling 100% · no-key-in-frontend-dir 100% · verify-passed 83%
**backend-fixed-supply-points**: policy-json 100% · verify-passed 100% · conserve-present 100% · seeding-gated-on-authority 100% · seeding-not-bare-owner 100%
**backend-marketplace-daily-cap**: policy-json 100% · verify-passed 100% · rolling-cap-24h-1000 100% · cap-collection-durable 100% · cap-partitioned-per-buyer 100% · no-foreign-types 100%
**backend-notes-owner**: policy-exists 100% · policy-json 100% · verify-passed 67% · read-by-user-id 100% · create-by-user-id 100% · update-by-user-id 100% · no-foreign-types 100% · readonly-preserved 100%
**backend-team-membership**: policy-json 100% · verify-passed 100% · member-create-consults-org 100% · member-create-not-bare-self 100% · doc-read-checks-membership 100% · doc-create-checks-membership 100%
**deploy-environments**: policy-json 100% · verify-passed 100% · both-envs-declared 100% · prod-env-values 100% · staging-env-values 100% · base-not-a-deployed-identity 50% · deploy-commands-per-env 100%
**deploy-verify-prover-busy**: verify-retried-through-fault 100% · verify-not-hammered 100% · policy-unchanged-across-retries 100% · no-deploy-or-create-attempt 100% · policy-file-untouched 100% · reports-safe-to-ship 100%
**frontend-email-login-wallet**: policy-json 100% · no-redundant-auth-wallets 100% · no-auth-mode 100% · documented-login-entry 100% · wallet-from-default-login 100%
**frontend-notes-live**: imports-client-sdk 100% · inits-app 100% · live-subscription 50% · governed-write 50% · no-query-per-item 100%
**oapps-forbidden-dependency**: token-not-in-code 100% · calls-out-creator-held-dependency 67% · offers-native-or-relay-path 100% · names-lifecycle 100% · does-not-self-select-mainnet 100%
**oapps-lifecycle**: names-open-and-commence 100% · names-open-step 100% · keeps-dev-site-private 100% · does-not-self-select-mainnet 100% · launches-once 100% · no-secrets-rule 100%
**onchain-escrow-release**: policy-json 100% · verify-passed 67% · onchain-collection 100% · per-deal-named-account 100% · payout-from-named-account 100% · positive-amount-on-create 100% · onchain-rules-use-address-not-id 100% · readonly-preserved 100%
**onchain-guest-tips**: policy-json 100% · onchain-collection 100% · guest-onchain-limit-surfaced 100% · no-offchain-identity-in-onchain-rules 100% · verify-passed 67%

## Docs opened (with skill, share of runs)

**adv-agent-secret-invoke**: skills bounded-backend 3/3; docs bounded-backend/docs/functions.md (3/3), bounded-backend/docs/secrets.md (3/3), bounded-backend/docs/policy-reference.md (2/3), bounded-backend/docs/backend-runtime.md (1/3)
**adv-frontend-api-key**: skills bounded 6/6, bounded-backend 6/6, bounded-frontend 6/6; docs bounded-backend/docs/secrets.md (6/6), bounded-backend/docs/functions.md (6/6), bounded-frontend/docs/building-a-webapp.md (5/6), bounded-frontend/docs/app-auth.md (2/6), bounded-frontend/docs/anonymous-accounts.md (2/6), bounded-frontend/docs/sdk-reference.md (2/6), bounded-deploy/docs/quickstart.md (1/6)
**backend-fixed-supply-points**: skills bounded-backend 2/2; docs bounded-backend/docs/invariants.md (2/2), bounded-backend/docs/policy-cheat-sheet.md (2/2)
**backend-marketplace-daily-cap**: skills bounded-backend 2/2; docs bounded-backend/docs/invariants.md (2/2), bounded-backend/docs/policy-cheat-sheet.md (1/2)
**backend-notes-owner**: skills bounded-backend 3/3; docs bounded-backend/docs/quick-path.md (3/3), bounded-backend/docs/policy-cheat-sheet.md (3/3), bounded-backend/docs/access-patterns.md (2/3), bounded-backend/docs/policy-reference.md (1/3)
**backend-team-membership**: skills bounded-backend 2/2; docs bounded-backend/docs/quick-path.md (2/2), bounded-backend/docs/policy-examples.md (2/2), bounded-backend/docs/access-patterns.md (1/2), bounded-backend/docs/constants-and-defs.md (1/2), bounded-backend/docs/policy-cheat-sheet.md (1/2)
**deploy-environments**: skills bounded-deploy 2/2; docs bounded-deploy/docs/environments.md (2/2)
**deploy-verify-prover-busy**: skills bounded-backend 2/2; docs bounded-backend/docs/quality-checklist.md (2/2), bounded-backend/docs/invariants.md (1/2)
**frontend-email-login-wallet**: skills bounded 2/2, bounded-frontend 2/2, bounded-onchain 2/2; docs bounded-frontend/docs/app-auth.md (2/2), bounded-onchain/docs/embedded-wallets.md (2/2), bounded-frontend/docs/building-a-webapp.md (2/2), bounded-frontend/docs/sdk-reference.md (2/2)
**frontend-notes-live**: skills bounded-frontend 2/2; docs bounded-frontend/docs/sdk-reference.md (2/2), bounded-frontend/docs/building-a-webapp.md (2/2), bounded-frontend/docs/app-auth.md (1/2)
**oapps-forbidden-dependency**: skills oapps-fun 3/3, bounded-backend 3/3; docs bounded-backend/docs/functions.md (3/3), bounded-backend/docs/policy-cheat-sheet.md (3/3), bounded-backend/docs/quick-path.md (2/3), bounded-backend/docs/policy-reference.md (2/3), bounded-frontend/docs/sdk-reference.md (1/3), bounded-backend/docs/access-patterns.md (1/3), bounded-backend/docs/browser-boundary.md (1/3), bounded-deploy/docs/access-playbook.md (1/3)
**oapps-lifecycle**: skills oapps-fun 3/3; docs -
**onchain-escrow-release**: skills bounded-backend 3/3, bounded-onchain 3/3, bounded 2/3; docs bounded-onchain/docs/examples/escrow.md (3/3), bounded-onchain/docs/examples.md (2/3), bounded-backend/docs/examples.md (2/3), bounded-backend/docs/invariants.md (2/3), bounded-onchain/docs/onchain-trading.md (1/3), bounded-onchain/docs/examples/isolated-vault.md (1/3), bounded-onchain/docs/custody-and-pdas.md (1/3)
**onchain-guest-tips**: skills bounded 5/6, bounded-onchain 6/6, bounded-backend 6/6; docs bounded-onchain/docs/embedded-wallets.md (6/6), bounded-onchain/docs/onchain.md (5/6), bounded-onchain/docs/custody-and-pdas.md (4/6), bounded-onchain/docs/accept-crypto.md (4/6), bounded-frontend/docs/anonymous-accounts.md (3/6), bounded-backend/docs/constants-and-defs.md (2/6), bounded-backend/docs/service-keys.md (2/6), bounded-backend/docs/hooks-scheduled-webhooks.md (2/6), bounded-onchain/docs/examples.md (1/6), bounded-onchain/docs/examples/treasury.md (1/6), bounded-backend/docs/queries.md (1/6), bounded-backend/docs/policy-cheat-sheet.md (1/6), bounded-onchain/docs/policy-primitives.md (1/6), bounded-backend/docs/principals-and-origins.md (1/6), bounded-backend/docs/functions.md (1/6), bounded-onchain/docs/plugins/AccountPlugin.md (1/6), bounded-backend/docs/quick-path.md (1/6), bounded-onchain/docs/plugins.md (1/6)


## Pages opened (by runs)

| page | bytes | runs | tasks |
|---|---|---|---|
| bounded-backend/SKILL.md | 8261 | 32/42 | adv-agent-secret-invoke, adv-frontend-api-key, backend-fixed-supply-points, backend-marketplace-daily-cap, backend-notes-owner, backend-team-membership, deploy-verify-prover-busy, oapps-forbidden-dependency, onchain-escrow-release, onchain-guest-tips |
| bounded/SKILL.md | 3638 | 16/42 | adv-frontend-api-key, frontend-email-login-wallet, onchain-escrow-release, onchain-guest-tips |
| bounded-backend/docs/functions.md | 39120 | 13/42 | adv-agent-secret-invoke, adv-frontend-api-key, oapps-forbidden-dependency, onchain-guest-tips |
| bounded-frontend/SKILL.md | 4302 | 11/42 | adv-frontend-api-key, frontend-email-login-wallet, frontend-notes-live |
| bounded-backend/docs/policy-cheat-sheet.md | 5194 | 11/42 | backend-fixed-supply-points, backend-marketplace-daily-cap, backend-notes-owner, backend-team-membership, oapps-forbidden-dependency, onchain-guest-tips |
| bounded-onchain/SKILL.md | 15224 | 11/42 | frontend-email-login-wallet, onchain-escrow-release, onchain-guest-tips |
| bounded-frontend/docs/building-a-webapp.md | 9325 | 10/42 | adv-frontend-api-key, frontend-email-login-wallet, frontend-notes-live |
| bounded-backend/docs/secrets.md | 9548 | 9/42 | adv-agent-secret-invoke, adv-frontend-api-key |
| bounded-onchain/docs/embedded-wallets.md | 10476 | 9/42 | frontend-email-login-wallet, onchain-guest-tips |
| bounded-backend/docs/quick-path.md | 1342 | 8/42 | backend-notes-owner, backend-team-membership, oapps-forbidden-dependency, onchain-guest-tips |
| bounded-frontend/docs/sdk-reference.md | 45273 | 7/42 | adv-frontend-api-key, frontend-email-login-wallet, frontend-notes-live, oapps-forbidden-dependency |
| bounded-backend/docs/invariants.md | 54625 | 7/42 | backend-fixed-supply-points, backend-marketplace-daily-cap, deploy-verify-prover-busy, onchain-escrow-release |
| bounded-frontend/docs/app-auth.md | 3482 | 6/42 | adv-frontend-api-key, frontend-email-login-wallet, frontend-notes-live |
| oapps-fun/SKILL.md | 5974 | 6/42 | oapps-forbidden-dependency, oapps-lifecycle |
| bounded-backend/docs/policy-reference.md | 30007 | 5/42 | adv-agent-secret-invoke, backend-notes-owner, oapps-forbidden-dependency |
| bounded-frontend/docs/anonymous-accounts.md | 16567 | 5/42 | adv-frontend-api-key, onchain-guest-tips |
| bounded-onchain/docs/custody-and-pdas.md | 6284 | 5/42 | onchain-escrow-release, onchain-guest-tips |
| bounded-onchain/docs/onchain.md | 40866 | 5/42 | onchain-guest-tips |
| bounded-backend/docs/access-patterns.md | 5254 | 4/42 | backend-notes-owner, backend-team-membership, oapps-forbidden-dependency |
| bounded-onchain/docs/accept-crypto.md | 10653 | 4/42 | onchain-guest-tips |
| bounded-backend/docs/constants-and-defs.md | 10978 | 3/42 | backend-team-membership, onchain-guest-tips |
| bounded-onchain/docs/examples.md | 1988 | 3/42 | onchain-escrow-release, onchain-guest-tips |
| bounded-onchain/docs/examples/escrow.md | 6191 | 3/42 | onchain-escrow-release |
| bounded-backend/docs/policy-examples.md | 12930 | 2/42 | backend-team-membership |
| bounded-deploy/docs/environments.md | 11814 | 2/42 | deploy-environments |
| bounded-deploy/SKILL.md | 6832 | 2/42 | deploy-environments |
| bounded-backend/docs/quality-checklist.md | 9132 | 2/42 | deploy-verify-prover-busy |
| bounded-backend/docs/examples.md | 905 | 2/42 | onchain-escrow-release |
| bounded-backend/docs/service-keys.md | 18348 | 2/42 | onchain-guest-tips |
| bounded-backend/docs/hooks-scheduled-webhooks.md | 18830 | 2/42 | onchain-guest-tips |
| bounded-backend/docs/backend-runtime.md | 9888 | 1/42 | adv-agent-secret-invoke |
| bounded-deploy/docs/quickstart.md | 4362 | 1/42 | adv-frontend-api-key |
| bounded-frontend/docs/auth.md | 49694 | 1/42 | frontend-email-login-wallet |
| bounded-backend/docs/browser-boundary.md | 3719 | 1/42 | oapps-forbidden-dependency |
| bounded-deploy/docs/access-playbook.md | 14666 | 1/42 | oapps-forbidden-dependency |
| bounded-onchain/docs/onchain-trading.md | 22878 | 1/42 | onchain-escrow-release |
| bounded-onchain/docs/examples/isolated-vault.md | 4246 | 1/42 | onchain-escrow-release |
| bounded-onchain/docs/examples/treasury.md | 3960 | 1/42 | onchain-guest-tips |
| bounded-backend/docs/queries.md | 12625 | 1/42 | onchain-guest-tips |
| bounded-onchain/docs/policy-primitives.md | 32223 | 1/42 | onchain-guest-tips |
| bounded-backend/docs/principals-and-origins.md | 10779 | 1/42 | onchain-guest-tips |
| bounded-onchain/docs/plugins/AccountPlugin.md | 4338 | 1/42 | onchain-guest-tips |
| bounded-onchain/docs/plugins.md | 6656 | 1/42 | onchain-guest-tips |

## Per task

| task | runs | mean skill bytes | mean turns | mean $ | distinct pages |
|---|---|---|---|---|---|
| adv-agent-secret-invoke | 3 | 114k | 18 | 0.53 | 5 |
| adv-frontend-api-key | 6 | 129k | 44 | 1.09 | 10 |
| backend-fixed-supply-points | 2 | 66k | 7 | 0.24 | 3 |
| backend-marketplace-daily-cap | 2 | 63k | 11 | 0.33 | 3 |
| backend-notes-owner | 3 | 27k | 11 | 0.21 | 5 |
| backend-team-membership | 2 | 32k | 9 | 0.22 | 6 |
| deploy-environments | 2 | 18k | 8 | 0.15 | 2 |
| deploy-verify-prover-busy | 2 | 43k | 12 | 0.28 | 3 |
| frontend-email-login-wallet | 3 | 87k | 47 | 0.68 | 8 |
| frontend-notes-live | 2 | 60k | 19 | 0.35 | 4 |
| oapps-forbidden-dependency | 3 | 160k | 20 | 0.66 | 10 |
| oapps-lifecycle | 3 | 29k | 5 | 0.14 | 1 |
| onchain-escrow-release | 3 | 80k | 15 | 0.35 | 10 |
| onchain-guest-tips | 6 | 129k | 22 | 0.72 | 21 |

## Never opened by any task (80 pages, 935k): unmeasured, not evidence of bloat

- bounded-deploy/docs/cli-reference.md (92381)
- bounded-backend/docs/live-runtime.md (41283)
- bounded-backend/docs/data-plane.md (29168)
- bounded-onchain/docs/plugin-signatures.md (27168)
- bounded-onchain/docs/plugins/DeFiPlugin.md (25448)
- bounded-onchain/docs/solana-capability-status.md (24676)
- bounded-onchain/docs/plugins/CPI.md (23327)
- bounded-onchain/docs/meteora-token-launch.md (23195)
- bounded-deploy/docs/key-and-account-safety.md (22883)
- bounded-backend/docs/realtime-netcode.md (20828)
- bounded-onchain/docs/oapps-tokenomics-fee-split.md (19840)
- bounded-backend/docs/policy-generation-guide.md (18889)
- bounded-backend/docs/access-control.md (18838)
- bounded-frontend/docs/building-for-react-native.md (17932)
- bounded-onchain/docs/onchain-troubleshooting.md (17459)
- bounded-onchain/docs/policy-native-state-machines.md (17389)
- bounded-frontend/docs/frontend-hosting.md (17166)
- bounded-backend/docs/verify-and-counterexamples.md (16502)
- bounded-onchain/docs/randomness.md (16125)
- bounded-onchain/docs/examples/prediction-market-amm.md (16007)
- bounded-onchain/docs/plugins/PhoenixPerpsPlugin.md (14507)
- bounded-backend/docs/policy-tests.md (14411)
- bounded-backend/docs/realtime-and-games.md (14380)
- bounded-backend/docs/scheduled-sweeps.md (13758)
- bounded-backend/docs/ai-npcs.md (13647)
- bounded-backend/docs/admin-and-ownership.md (13605)
- bounded-onchain/docs/plugins/TokenPlugin.md (13579)
- bounded-backend/docs/hooks-and-anti-cheat.md (13218)
- bounded-onchain/docs/plugins/PumpFunPlugin.md (11746)
- bounded-backend/docs/functions-ctx-ai.md (11491)
- bounded-onchain/docs/plugins/NFTPlugin.md (11412)
- bounded-backend/docs/functions-ctx-build.md (11187)
- bounded-onchain/docs/pump-fun.md (10985)
- bounded-onchain/docs/plugins/Bytes.md (10929)
- oapps-fun/docs/launch-gate.md (10593)
- bounded-backend/docs/files-and-search.md (10152)
- bounded/guides/capabilities-and-limits.md (9758)
- bounded-backend/docs/building-for-agents.md (9658)
- bounded-onchain/docs/examples/randomness-coin-flip.md (9392)
- bounded-deploy/docs/domains.md (9008)
- ... 40 more
