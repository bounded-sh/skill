<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@TensorPlugin`

Tensor NFT marketplace buys and listings.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `TensorPlugin.buyNft`

```
@TensorPlugin.buyNft(assetAddress, maxAmount)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-TENSOR-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `assetAddress` | string | yes | - | The address of the NFT asset to buy |
| `maxAmount` | number | yes | - | The maximum amount in lamports willing to pay for the NFT |

### `TensorPlugin.listNft`

```
@TensorPlugin.listNft(assetAddress, amount?, expireInSec?, currency?, privateTaker?, makerBroker?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-TENSOR-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `assetAddress` | string | yes | - | The address of the NFT asset to list |
| `amount` | number | no | - | The listing amount in lamports (optional, defaults to 0) |
| `expireInSec` | number | no | - | Expiration time in seconds (optional) |
| `currency` | string | no | - | Currency for the listing (optional) |
| `privateTaker` | string | no | - | Private taker address (optional) |
| `makerBroker` | string | no | - | Maker broker address (optional) |
