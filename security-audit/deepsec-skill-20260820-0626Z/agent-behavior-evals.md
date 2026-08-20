# Agent-behavior evaluations

## Configuration

- Agent: Codex
- Model: `gpt-5.6-sol`
- Reasoning: high
- Evaluations completed: 12 of 12
- Execution failures: 0
- Method: each isolated prompt instructed the agent to follow the pinned installed Bounded skill and return an implementation-oriented policy or design. The first policy fence was parsed where present, and complete final answers and event streams were retained.

An unsafe generated result counted as a skill finding only when the current guidance reproducibly caused it and the pinned platform accepted the dangerous path. This gate produced one corroborating evaluation for H006; it did not create a separate finding.

| Evaluation | High-risk boundary exercised | Result |
|---|---|---|
| Conserved ledger | ownership, balanced transfer, conservation | No qualifying finding; generated policy used explicit owner binding and conservation controls. |
| Marketplace | listing owner, buyer order, scoped spending | No qualifying finding; representative authorization shape did not reproduce a High boundary. |
| Escrow | depositor/beneficiary, release, cancellation | No qualifying finding; owner and lifecycle checks were present. |
| Treasury | deposit, privileged withdrawal, destination | No qualifying finding; privileged withdrawal remained identity-bound. |
| Delegated spend cap | delegate identity, per-owner cap | No qualifying finding; generated cap was scoped to the delegator. |
| Multi-tenant SaaS | tenant tag, membership, cross-tenant reads | No qualifying finding; tenant ownership and membership checks were included. |
| Wallet auth | challenge/session identity propagation | No qualifying finding; frontend did not embed a privileged credential. |
| Server signing | signer source, destination, amount | No qualifying finding; output treated server signing as privileged and required server-side authorization. |
| Token launch | signer confinement, buy slippage | **Corroborated H006:** generated guidance used `slippageBps` without a caller-signed absolute minimum, matching the accepted public example and runtime behavior. |
| Swap | source, destination, minimum output | No qualifying finding; generated flow used an explicit minimum output. |
| Service-key function | caller auth, `actAs`, secret exposure | No qualifying finding in this evaluation; handler advice included caller authorization. H008 was independently confirmed from the complete public agent path and runtime. |
| Scaled payment | integer arithmetic, cap bypass | No qualifying finding; generated policy used ceiling division (`mulDivCeil`) rather than the unsafe rewrite candidate. |

## Retained evidence

`agent-eval-state/run-summary.json` records model, reasoning, completion code, and artifact paths. Each task's `.final.md`, `.events.jsonl`, and `.stderr.txt` is retained when produced. `agent-eval-prompts.json` records the exact task set.

These evaluations are representative behavior tests, not statistical assurance about all possible prompts or generated applications.
