<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@DflowPlugin`

DFlow prediction-market orders and KYC status.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Transactional

Callable only from `hooks.onchain` on `"onchain": true` collections (exceptions noted per function). A `false` return or thrown error aborts the entire Solana write.

### `DflowPlugin.openPredictionMarketOrder`

```
@DflowPlugin.openPredictionMarketOrder(source, inputMint, outputMint, amount, slippageBps?)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-DFLOW.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `inputMint` | string | yes | no | - | The mint address of the input token |
| `outputMint` | string | yes | no | - | The mint address of the output token |
| `amount` | number | yes | no | - | The amount of input tokens to escrow |
| `slippageBps` | number | no | no | - | Max allowed slippage in basis points (optional, defaults to 50 = 0.5%) |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

## Read-only

### `DflowPlugin.getKycStatus`

```
@DflowPlugin.getKycStatus(address) - Check KYC verification status for a wallet address
```

- Callable from: `hooks.offchain` only
- Returns: `boolean`
- Status: **unsupported** (not run); markers: NO-DEVNET-DFLOW.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `address` | string | yes | no | wallet address | The wallet address to check KYC status for |
