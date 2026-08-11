# Onchain troubleshooting

Real-network failure lookup for `"onchain": true` collections: what broke, why, and the fix. Budgets and proof-vs-network boundaries live in [policy-primitives.md](policy-primitives.md#real-network-resource-budget); custody semantics in [custody and PDAs](custody-and-pdas.md).

## Error to cause to fix

| Symptom | Likely cause | Fix |
|---|---|---|
| `403` on write | A `rules` predicate denied it. Onchain rules see only `@user.address`, path variables, onchain `get()`s, and fields. | Check auth and the exact rule; remember an omitted rule denies. |
| `409` + invariant name | The write would violate a declared invariant. | Fix state or the policy; this is the invariant working. |
| `FieldReadOnly` (Anchor error) | An update payload resent a `!` field - onchain updates are patches and resending the key is a field operation even with an unchanged value. | Omit every `!` field from update payloads. See [onchain.md](onchain.md#onchain-updates-are-patches). |
| Create/Update/Delete hook failed (Anchor error names like `CreateHookFailed`) | A `hooks.onchain` expression returned `false` or a plugin call errored; the whole transaction reverts. | Read the program log for the failing call; treat the live Anchor error name as authoritative ([onchain.md](onchain.md#diagnose-custom-errors-by-the-live-anchor-log-name)). |
| Write reverts with insufficient funds on a payout | The source pot (escrow or named PDA) holds less than the transfer amount - often another entity drained a shared pot. | Gate the rule on `@TokenPlugin.getBalance(<source>, <mint>) >= amount`; use per-entity named PDAs so pots cannot mix. |
| First transfer to a new recipient fails or costs extra | Recipient's ATA does not exist; creating it consumes rent paid by the transaction payer. | Leave the payer enough SOL; expect the first send to a fresh wallet to carry ATA rent. |
| Account creation fails on rent | `@AccountPlugin.createAccount` / `@Solana.createAccount` needs rent-exempt lamports from the payer. | Query `@Solana.rentExemption(space)` live and fund the exact amount; never reuse an old estimate. |
| Transaction too large / too many accounts | The builder fails before signing above 1,232 serialized bytes or 64 account locks; compute is simulated with a 20% margin up to 1.4M CU. | Split the batch; account-heavy hooks may need the platform lookup table ([onchain.md](onchain.md)). |
| Build-time refusal naming a character in a string argument | Plugin string arguments cannot contain `,` `{` `}` `[` `]` - the rendered call line would be re-parsed wrong. | Sanitize or encode the value (`@Bytes.utf8`), or store free text offchain. |
| Plugin call rejected at compile for the onchain target | Offchain-only construct (`@user.id`, `@origin.*`, `@StringUtils` in an onchain rule), an address atom where a string account id is required, or an unsupported composition such as `getAccountAddress(@contract.address)`. | Use `@user.address`; pass string account ids; resolve the escrow with the program-ID string literal ([policy-primitives.md](policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address)). |
| Deploy refuses a function with `NEEDS-RUNTIME-V4` | The function's runtime is newer than the deployed program's recorded runtime version. | Check [solana-capability-status.md](solana-capability-status.md); do not ship that path until the runtime is live. |
| Write succeeds but the mirror shows nothing yet | Mirror ingestion is eventually consistent. | Poll the mirror for the exact expected postcondition; never treat an immediate read (or its absence) as proof. |

## Confirmation behavior

A mutating receipt deliberately contains only `{"transactionId": "<signature>", "chain": "..."}`. Confirm independently: poll `getSignatureStatuses` until finalized, then fetch the transaction at finalized commitment and require `meta.err` to match expectations; a client preflight or simulation rejection is not proof of an onchain denial. The full evidence discipline (including denial verification) is in [policy-primitives.md](policy-primitives.md#verification-checklist).

## Environment differences

| Environment | What runs | Watch out |
|---|---|---|
| Poofnet / local platform | Offchain simulation of the same policy bytecode; onchain hooks simulate, no validator | Poofnet success proves logic, not funding, rent, transaction fit, or external programs. |
| Devnet | Real Solana; the deployed Bounded program (runtime version per [capability table](solana-capability-status.md)) | `@TokenPlugin.USDC` is mainnet-only - create an app-owned devnet mint. Jupiter (`@DeFiPlugin.swap`), Phoenix, and DFlow are absent on devnet (`NO-DEVNET-*` markers). The program-ID string literal used to resolve the escrow is deployment-specific. |
| Mainnet | Real value; mainnet permits are required and policy changes may need onchain authority permits | Never deploy or upgrade mainnet as an incidental step; rehearse on a local validator, then devnet. |

Graduation between them changes no policy source - the same collections compile per target - but every real-network budget above starts applying the moment a protocol is `realtime_devnet` or `realtime_mainnet`.
