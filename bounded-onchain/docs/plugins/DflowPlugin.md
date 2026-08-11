<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@DflowPlugin`

DFlow prediction-market orders and KYC status.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `DflowPlugin.openPredictionMarketOrder`

```
@DflowPlugin.openPredictionMarketOrder(source, inputMint, outputMint, amount, slippageBps?)
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-DEVNET-DFLOW.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `inputMint` | string | yes | - | The mint address of the input token |
| `outputMint` | string | yes | - | The mint address of the output token |
| `amount` | number | yes | - | The amount of input tokens to escrow |
| `slippageBps` | number | no | - | Max allowed slippage in basis points (optional, defaults to 50 = 0.5%) |

## Read-only

### `DflowPlugin.getKycStatus`

```
@DflowPlugin.getKycStatus(address) - Check KYC verification status for a wallet address
```

- Callable from: offchain rules, offchain named queries
- Returns: `boolean`
- Status: **unsupported** (not run); markers: NO-DEVNET-DFLOW.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `address` | string | yes | - | The wallet address to check KYC status for |
