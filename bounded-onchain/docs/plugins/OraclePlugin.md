<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@OraclePlugin`

ORAO verifiable randomness (request + reveal reads).

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Reveal contract

`requestRandomness(uniqueId, revealPath)` needs `revealPath` to point at a fieldless reveal collection; the fulfillment lands through a server-driven reveal write with no user context (so that path's hooks cannot use payer-funded calls such as `@AccountPlugin.createAccount`). Read results with `getRandomNumber(uniqueId, lowerBound, upperBound)` - the upper bound is exclusive. The full flow, including anti-cheat sequencing, is in [randomness.md](../randomness.md).

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `OraclePlugin.requestRandomness`

```
@OraclePlugin.requestRandomness(uniqueId, revealPath)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-ORAO-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `uniqueId` | string | yes | - | Th unique identifier for the random number, this must be globally unique in your app |
| `revealPath` | string | yes | - | The reveal path of the random number to be called after the randomness is fulfilled |

## Read-only

### `OraclePlugin.getRandomNumber`

```
@OraclePlugin.getRandomNumber(uniqueId, lowerBound, upperBound)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Status: **unverified** (source parity only); markers: LIVE-ORAO-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `uniqueId` | string | yes | - | A unique identifier for the random number, this must be globally unique in your app |
| `lowerBound` | number | yes | - | The lower bound of the random number (inclusive) |
| `upperBound` | number | yes | - | The upper bound of the random number (exclusive) |

### `OraclePlugin.getVRFAddress`

```
@OraclePlugin.getVRFAddress(randomId)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Status: **unverified** (source parity only); markers: LIVE-ORAO-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `randomId` | string | yes | - | The random ID to get the VRF address for |
