<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@OraclePlugin`

ORAO verifiable randomness (request + reveal reads).

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Reveal contract

`requestRandomness(uniqueId, revealPath)` needs `revealPath` to point at a fieldless reveal collection; the fulfillment lands through a server-driven reveal write with no user context (so that path's hooks cannot use payer-funded calls such as `@AccountPlugin.createAccount`). Read results with `getRandomNumber(uniqueId, lowerBound, upperBound)` - the upper bound is exclusive. The full flow, including anti-cheat sequencing, is in [randomness.md](../randomness.md).

## Transactional

Callable only from `hooks.onchain` on `"onchain": true` collections (exceptions noted per function). A `false` return or thrown error aborts the entire Solana write.

### `OraclePlugin.requestRandomness`

```
@OraclePlugin.requestRandomness(uniqueId, revealPath)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-ORAO-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `uniqueId` | string | yes | no | - | Th unique identifier for the random number, this must be globally unique in your app |
| `revealPath` | string | yes | no | - | The reveal path of the random number to be called after the randomness is fulfilled |

## Read-only

### `OraclePlugin.getRandomNumber`

```
@OraclePlugin.getRandomNumber(uniqueId, lowerBound, upperBound)
```

- Callable from: rules, named queries, and hooks (read-only)
- Status: **unverified** (source parity only); markers: LIVE-ORAO-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `uniqueId` | string | yes | no | - | A unique identifier for the random number, this must be globally unique in your app |
| `lowerBound` | number | yes | no | - | The lower bound of the random number (inclusive) |
| `upperBound` | number | yes | no | - | The upper bound of the random number (exclusive) |

### `OraclePlugin.getVRFAddress`

```
@OraclePlugin.getVRFAddress(randomId)
```

- Callable from: rules, named queries, and hooks (read-only)
- Status: **unverified** (source parity only); markers: LIVE-ORAO-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `randomId` | string | yes | no | - | The random ID to get the VRF address for |
