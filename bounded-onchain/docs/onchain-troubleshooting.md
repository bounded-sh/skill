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
| `validate pre-built transaction: SOLANA_DEVNET_RPC_URL is required for pre-built transaction network "solana_devnet"` | The CLI submits onchain writes itself and has no RPC endpoint configured. The platform built the transaction correctly; submission never started. | Set `SOLANA_DEVNET_RPC_URL` (or `SOLANA_MAINNET_RPC_URL`) in the shell running `bounded`. See [CLI submission needs an explicit RPC endpoint](#cli-submission-needs-an-explicit-rpc-endpoint). |

## CLI submission needs an explicit RPC endpoint

On an onchain write the platform builds and returns a pre-built transaction.
The CLI signs it locally with your credential and submits it to Solana itself, so the CLI needs its own RPC endpoint, and it reads one only from the environment:

```sh
export SOLANA_DEVNET_RPC_URL="https://<your-devnet-endpoint>"    # solana_devnet apps
export SOLANA_MAINNET_RPC_URL="https://<your-mainnet-endpoint>"  # solana_mainnet apps
```

There is no `--rpc-url` flag, no config-file setting, and no fallback to a public Solana RPC.
That is deliberate: confirmation and simulation results are only as trustworthy as the endpoint returning them, so the endpoint has to be one you chose.
The check runs before signing, so an unset variable fails the write with `validate pre-built transaction: ...` and never reaches the network.

Set it in whatever shell runs `bounded`; it applies per shell, so add it to your shell profile if you want it to persist.
A public endpoint such as `https://api.devnet.solana.com` is enough to get a development write through, but it is rate-limited and is not a trusted source for the evidence described in [Confirmation behavior](#confirmation-behavior); use a dedicated provider endpoint for anything you intend to rely on.
Never echo, log, commit, or retain a secret RPC URL.

## Confirmation behavior

A mutating receipt deliberately contains only `{"transactionId": "<signature>", "chain": "..."}`. Confirm independently: poll `getSignatureStatuses` until finalized, then fetch the transaction at finalized commitment and require `meta.err` to match expectations; a client preflight or simulation rejection is not proof of an onchain denial. The full evidence discipline (including denial verification) is in [policy-primitives.md](policy-primitives.md#verification-checklist).

## Environment differences

| Environment | What runs | Watch out |
|---|---|---|
| Poofnet / local platform | Offchain simulation of the same policy bytecode; onchain hooks simulate, no validator | Poofnet success proves logic, not funding, rent, transaction fit, or external programs. |
| Devnet | Real Solana; the deployed Bounded program (runtime version per [capability table](solana-capability-status.md)) | `@TokenPlugin.USDC` is mainnet-only - create an app-owned devnet mint. Jupiter (`@DeFiPlugin.swap`), Phoenix, and DFlow are absent on devnet (`NO-DEVNET-*` markers). The program-ID string literal used to resolve the escrow is deployment-specific. |
| Mainnet | Real value; mainnet permits are required and policy changes may need onchain authority permits | Never deploy or upgrade mainnet as an incidental step; rehearse on a local validator, then devnet. |

Graduation between them changes no policy source - the same collections compile per target - but every real-network budget above starts applying the moment a protocol is `realtime_devnet` or `realtime_mainnet`.
