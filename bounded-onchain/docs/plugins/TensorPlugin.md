<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@TensorPlugin`

Tensor NFT marketplace buys and listings.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Transactional

Callable only from `hooks.onchain` on `"onchain": true` collections (exceptions noted per function). A `false` return or thrown error aborts the entire Solana write.

### `TensorPlugin.buyNft`

```
@TensorPlugin.buyNft(assetAddress, maxAmount)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-TENSOR-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `assetAddress` | string | yes | no | - | The address of the NFT asset to buy |
| `maxAmount` | number | yes | no | - | The maximum amount in lamports willing to pay for the NFT |

### `TensorPlugin.listNft`

```
@TensorPlugin.listNft(assetAddress, amount?, expireInSec?, currency?, privateTaker?, makerBroker?)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-TENSOR-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `assetAddress` | string | yes | no | - | The address of the NFT asset to list |
| `amount` | number | no | no | - | The listing amount in lamports (optional, defaults to 0) |
| `expireInSec` | number | no | no | - | Expiration time in seconds (optional) |
| `currency` | string | no | no | - | Currency for the listing (optional) |
| `privateTaker` | string | no | no | - | Private taker address (optional) |
| `makerBroker` | string | no | no | - | Maker broker address (optional) |
