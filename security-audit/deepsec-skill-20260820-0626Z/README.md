# DeepSec audit of bounded-sh/skill

## Outcome

This six-hour discovery-only defensive audit independently confirmed **0 Critical and 9 High** vulnerabilities at the pinned baseline. It rejected 17 candidates, classified 1 candidate as fixed, left 0 uncertain, and excluded 1 item through the accepted known-false-positive register. Known-false-positive details are intentionally absent from human reports.

Start with [`SUMMARY.md`](SUMMARY.md), then [`findings/all-confirmed.md`](findings/all-confirmed.md). [`TEAMMATE-HANDOFF.md`](TEAMMATE-HANDOFF.md) contains only validated remediation work.

## Immutable baseline and isolation

| Item | Value |
|---|---|
| Public repository | `bounded-sh/skill` |
| Source checkout | `/Users/athar/Desktop/workspace/poof-new/skill` |
| Remote | `git@github.com:bounded-sh/skill.git` |
| Pinned commit | `54b05647169d6ed8b011db0c7a7cc9cc91cc0c53` |
| Pinned tree | `8dc36e42d1123ce3643fefe61b1e66088c2a3e99` |
| Isolated worktree | `/Users/athar/Desktop/workspace/poof-new/bounded-skill-deepsec.kf3zFH` |
| Audit branch | `audit/deepsec-skill-20260820-0626Z` |
| Initial status | clean |
| Started | `2026-08-20T06:26:53Z` |
| Discovery cutoff | `2026-08-20T09:56:53Z` |
| Validation cutoff | `2026-08-20T11:41:53Z` |
| Deadline | `2026-08-20T12:26:53Z` |

`origin/main` was fetched once to establish this commit. Discovery remained pinned and did not follow later remote movement. Product code and documentation were not changed.

Discovery stopped at `2026-08-20T09:57:42Z`, the first cutoff monitor after the scheduled `09:56:53Z` boundary. No new discovery started after the scheduled boundary. Independent validation stopped at the scheduled `2026-08-20T11:41:53Z` boundary; the monitor entered report-only finalization at `11:42:01Z`.

## Supporting repositories

Supporting repositories were fetched, pinned in separate clean worktrees, and inspected only for concrete behavior required to validate a skill candidate.

| Repository | Remote | Commit | Tree |
|---|---|---|---|
| bounded-monorepo | `git@github.com:poofdotnew/bounded-monorepo.git` | `8e7f1e25b53e8f0575ea0f2336640d68761d60a9` | `532d8765ebbd1622cac3fb48d8d604579a52046c` |
| bounded-cli | `git@github.com:poofdotnew/bounded-cli.git` | `755dd6b1cdf2d810fd119c0d95616f1ff7871730` | `c84818b32cb40ed1308f6d75c8124a869dec9d3a` |

Inspected monorepo surfaces were limited to policy evaluation and hooks, runtime-agent admission and capabilities, analytics sanitization/access, domain/origin/session handling, onchain interpreters, locked plugin dependencies, local-stack controls, and the deploy verifier. CLI inspection was limited to environment resolution, deployment, upload collection/ignore behavior, and the required test and local-stack paths.

## Scope preparation and accepted-risk handling

The complete monorepo known-false-positive register and available skill security-history material were read before discovery. An internal index captured identifier, affected paths, root cause, behavior, and trust assumptions. Every candidate was checked before validation and again before confirmation. One matching item was excluded immediately and its details are not retained in human findings, rejected, summary, or handoff reports.

Historical audit state was used only for deduplication, regression status, and fixed/open classification. Every current finding was independently traced through the pinned skill and owning implementation.

## Complete file coverage

All **161 of 161** active tracked baseline files have exactly one disposition in `file-coverage.json`:

| Disposition | Files |
|---|---:|
| Supported-language DeepSec scan | 7 |
| Forced-format security review | 113 |
| Generated artifact verified against authoritative source and hash | 21 |
| Test or fixture reviewed as security-contract evidence | 20 |
| Excluded or inactive | 0 |

All 161 stored SHA-256 values were independently recomputed from `git show <pinned-commit>:<path>` with zero mismatches. The 21 generated plugin-reference files were checked against `bounded-onchain/data/plugin-catalog.json` and curated `_fragments`; generation and extraction parity gates passed. Deep review was performed once at canonical sources rather than repeatedly across identical generated output.

DeepSec analyzed the other **140 unique baseline paths** in six non-overlapping partitions: routers/editor instructions 12, backend 43, frontend 8, deploy 9, onchain 43, and publication supply chain 25. The manifest union had zero duplicates and exactly matched all 140 non-generated paths. DeepSec status later listed four pending files because audit bookkeeping files were created after baseline capture; those files are outside the pinned tracked set and were not credited.

## Complete example coverage

`example-coverage.json` inventories **646 of 646** public examples: 641 fenced code blocks and 5 downloadable artifacts. Independent delimiter counting found 1,282 balanced fence delimiters, and all extracted hashes were recomputed with zero mismatches.

| Classification | Examples |
|---|---:|
| Complete | 111 |
| Partial | 66 |
| Executable | 267 |
| Conceptual | 52 |
| Generated | 150 |

For every entry the inventory records file and line, language, intended use, trust model, canonical source or duplicate hash, security sensitivity, validation, owning implementation inspected, result, and limitations. Seventeen exact-content duplicates were assigned canonical hashes. Every prospective issue was reviewed in the full containing page with prerequisites, warnings, actor model, and downstream defenses before confirmation.

## DeepSec execution

The official `vercel-labs/deepsec` harness version 2.3.6 ran with Codex, `gpt-5.6-sol`, high discovery reasoning, initial batch size 5, concurrency 5 increased to 6 after stable throughput, and an approximate 35 to 40 turn ceiling per batch. Validation used `gpt-5.6-sol`, xhigh reasoning.

Discovery produced 130 raw machine findings: 0 Critical, 28 High, 34 Medium, 16 HighBug, and 52 Bug. Raw severity was not trusted. Discovery consumed 7,289,740 input tokens, 575,239 output tokens, and 124,353,024 cache-read tokens through the requester's subscription, with recorded API cost 0. The final xhigh set contains 22 persisted verdicts: 20 true-positive, 1 false-positive, and 1 fixed. All 12 raw findings mapped to the nine normalized confirmed High findings received xhigh true-positive verdicts and were also manually retraced.

Complete available machine state is retained under `deepsec-state/data/bounded-skill/`, including per-file analyses, run state, revalidation invocations, setup state, diagnostics, and `reports/report.json`. Dependency caches are excluded. The harness's unfiltered Markdown rendering is excluded from publication in favor of filtered exports under `deepsec-filtered/`. Text artifacts are normalized from typographic dash characters to plain hyphens solely to satisfy repository publication conventions; machine fields and identifiers are otherwise preserved.

## Required repository gates

These self-contained gates passed against the pinned worktree and were rerun after report assembly:

```sh
node scripts/validate.mjs
node scripts/extract-plugin-catalog.mjs --check
node scripts/generate-plugin-catalog.mjs --check
```

The full local platform doctor reported **79 checks passed** after focused reproductions.

## Policy validation

The required command used the pinned CLI binary and pinned monorepo:

```sh
BOUNDED_CLI_BIN=/tmp/bounded-audit-cli-755dd6b1 \
BOUNDED_MONOREPO=/Users/athar/Desktop/workspace/poof-new/bounded-monorepo-audit.2CUS9x \
node scripts/policy-e2e/run.mjs --require
```

All 11 specs ran with **121 steps, 72 passed, 49 failed, 0 skipped**. The 49 failures were fail-closed wallet-auth setup failures in six page policies; no failed operation was accepted. Escrow, isolated vault, prediction market, staking, and treasury passed every step. The raw and parsed results are retained.

Because that suite does not fully prove cross-user authorization, an audit-only victim/attacker suite injected wallet auth only as transport and changed no policy rule or security parameter. It passed **10 of 10** applicable checks with distinct identities, including private read denial, owner-path write denial, scoped cap protection, and signer/authority confinement. Denied reads were correctly evaluated as empty successful responses. Focused reproductions additionally validated the two prediction fund-loss paths, runtime-agent admission, standalone NFT authority proof, deployment/environment issues, source-ignore mismatch, analytics scrubbing, origin reclaim, and Pump price protection.

See [`policy-e2e-results.md`](policy-e2e-results.md), `policy-e2e-required-summary.json`, `policy-cross-user-results.json`, and `focused-validation-results.json`.

## Agent-behavior evaluations

Twelve representative high-risk tasks were evaluated with the pinned installed skill and `gpt-5.6-sol` at high reasoning: conserved ledger, marketplace, escrow, treasury, delegated spend cap, multi-tenant SaaS, wallet auth, server signing, token launch, swap, service-key-backed function, and scaled payment. All 12 completed and their prompts, events, stderr, and final outputs are retained. The token-launch evaluation independently reproduced H006's execution-time slippage shape. The other outputs did not meet the strict skill-causality and accepted-dangerous-path gate.

See [`agent-behavior-evals.md`](agent-behavior-evals.md).

## Errors and recovery

- The clean pinned monorepo worktree initially lacked installed Wrangler dependencies and built layers. Lockfile-pinned worker dependencies were installed and layers built; the platform then passed 79 health checks.
- The first policy E2E attempt selected a non-pinned sibling CLI. It was marked invalid, not credited, and every spec was rerun using the pinned CLI with isolated app/session state.
- Early deploy and publication DeepSec batches were intentionally interrupted during concurrency tuning. Their partial output was not credited; the complete non-overlapping manifests were rerun.
- The xhigh in-process event stream reported 464 dropped display events. All 22 requested verdicts persisted in harness state, and every reported High was independently validated.
- Direct execution of two TypeScript source proofs could not resolve source-style imports. The exact pinned source and audit entrypoint were bundled with the monorepo's installed esbuild and then executed successfully.

## Limitations

- Several xhigh agents consulted dirty sibling checkouts or globally installed skill copies despite pinned manifest instructions. Their cross-repository claims were not trusted; every confirmed path was independently retraced against the clean pinned support worktrees.
- Six required example policies fail their authenticated test steps because the page artifact omits wallet auth. The audit-only transport injection provided cross-user security evidence but does not convert those pages into self-contained passing examples.
- No live-network onchain transaction was attempted. Onchain validation used the local platform, deploy verifier, exact pinned runtime logic, transaction construction, and locked dependency contracts.
- Agent-behavior evaluations are representative rather than exhaustive across all prompts.
- The audit reports only independently confirmed Critical and High issues under the requested impact gate. It deliberately omits lower-severity correctness, reliability, stale-copy, and theoretical concerns.
- This audit does not guarantee that the repository, platform, or applications generated from the skill are free of every vulnerability.

## Artifact map

- `findings/all-confirmed.md`: full evidence for nine High findings
- `REJECTED-FIXED-UNCERTAIN.md`: non-KFP candidate disposition
- `TEAMMATE-HANDOFF.md`: validated remediation only
- `file-coverage.json`: complete tracked-file inventory
- `example-coverage.json`: complete code-block and artifact inventory
- `coverage-state.json`: machine-readable timing, counts, commands, errors, and limitations
- `policy-e2e-results.md`: required and attacker/victim suite interpretation
- `agent-behavior-evals.md`: 12 evaluation outcomes
- `deepsec-state/`: complete available raw machine state, excluding dependencies and unfiltered Markdown publication output
- `deepsec-filtered/`: confirmed-only and triage-summary machine and Markdown exports
- `reproductions/`: audit-only local proofs and regression sources
