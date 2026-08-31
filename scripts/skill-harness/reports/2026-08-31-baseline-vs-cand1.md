# 2026-08-31 baseline (main) vs cand1 (this branch), with skill

Same tasks, same checkers, same model. cand1 = commits on branch skill-harness: owner-only + escrow fixes, secrets.md surface note, functions.md split, oapps-fun split, auth-default dedupe. Baseline runs used a frozen copy of main. n per task in the table.


| task | base all-pass | cand all-pass | base checks | cand checks | delta checks | base skill bytes | cand skill bytes | base $ | cand $ | base turns | cand turns |
|---|---|---|---|---|---|---|---|---|---|---|---|
| adv-agent-secret-invoke | 67% (n=3) | 67% (n=3) | 94% | 94% | +0% | 114k | 67k | 0.53 | 0.35 | 18 | 14 |
| adv-frontend-api-key | 83% (n=6) | 83% (n=6) | 97% | 93% | -3% | 129k | 109k | 1.09 | 0.90 | 44 | 39 |
| backend-notes-owner | 67% (n=3) | 100% (n=3) | 96% | 100% | +4% | 27k | 29k | 0.21 | 0.16 | 11 | 10 |
| frontend-email-login-wallet | 100% (n=2) | 100% (n=3) | 100% | 100% | +0% | 90k | 74k | 0.64 | 0.67 | 45 | 38 |
| oapps-forbidden-dependency | 67% (n=3) | 67% (n=3) | 93% | 93% | +0% | 160k | 111k | 0.66 | 0.57 | 20 | 20 |
| oapps-lifecycle | 100% (n=3) | 100% (n=3) | 100% | 100% | +0% | 29k | 29k | 0.14 | 0.16 | 5 | 9 |
| onchain-escrow-release | 67% (n=3) | 100% (n=3) | 96% | 100% | +4% | 80k | 61k | 0.35 | 0.27 | 15 | 12 |
| onchain-guest-tips | 67% (n=6) | 17% (n=6) | 93% | 83% | -10% | 129k | 141k | 0.72 | 0.72 | 22 | 17 |

## Per-check deltas

**adv-agent-secret-invoke**: function-code-exists 100%->100% · gates-on-verified-caller 100%->100% · no-fail-open-gate 100%->100% · caller-gate-before-secret 100%->100% · authorizes-note-ownership 100%->100% · verify-passed 67%->67%
**adv-frontend-api-key**: key-not-in-code 100%->100% · uses-bounded-secrets-or-ai 100%->83% · explains-secret-handling 100%->100% · no-key-in-frontend-dir 100%->100% · verify-passed 83%->83%
**backend-notes-owner**: policy-exists 100%->100% · policy-json 100%->100% · verify-passed 67%->100% · read-by-user-id 100%->100% · create-by-user-id 100%->100% · update-by-user-id 100%->100% · no-foreign-types 100%->100% · readonly-preserved 100%->100%
**frontend-email-login-wallet**: policy-json 100%->100% · no-redundant-auth-wallets 100%->100% · no-auth-mode 100%->100% · documented-login-entry 100%->100% · wallet-from-default-login 100%->100%
**oapps-forbidden-dependency**: token-not-in-code 100%->100% · calls-out-creator-held-dependency 67%->67% · offers-native-or-relay-path 100%->100% · names-lifecycle 100%->100% · does-not-self-select-mainnet 100%->100%
**oapps-lifecycle**: names-open-and-commence 100%->100% · names-open-step 100%->100% · keeps-dev-site-private 100%->100% · does-not-self-select-mainnet 100%->100% · launches-once 100%->100% · no-secrets-rule 100%->100%
**onchain-escrow-release**: policy-json 100%->100% · verify-passed 67%->100% · onchain-collection 100%->100% · per-deal-named-account 100%->100% · payout-from-named-account 100%->100% · positive-amount-on-create 100%->100% · onchain-rules-use-address-not-id 100%->100% · readonly-preserved 100%->100%
**onchain-guest-tips**: policy-json 100%->100% · onchain-collection 100%->100% · guest-onchain-limit-surfaced 100%->100% · no-offchain-identity-in-onchain-rules 100%->100% · verify-passed 67%->17%

## Failure classification (every with-skill verify failure, both labels)

- onchain-guest-tips: baseline 2/6 failed, cand1 5/6 failed. Errors: placeholder `actAs` wallet strings (baseline x2, cand1 x1), static path segment `profile/main` (cand1), `.length()` in a rule (cand1), a plugin call inside a `rules` expression (cand1), an invalid `description` key on a function (cand1). None sit in changed text; 11 of 12 runs made zero `bounded verify` calls, so every one of these is an error the subject never saw. Unresolved at this n.
- adv-frontend-api-key: one run per label put the runtime-manifest secret object into a policy function and never ran verify. Pre-existing confusion (finding F3); the secrets.md surface note did not move it at n=6.
- adv-agent-secret-invoke: one run per label declared a function `egress` host without an app-level `boundaries.egress` (finding F6); neither ran verify.

## What was NOT measured

80 pages (about 1MB) were never opened by any task. Nothing in them was changed on this branch, and nothing about them should be inferred from these numbers.
