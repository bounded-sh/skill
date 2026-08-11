<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@NFTPlugin`

Metaplex Core NFTs: collections, mints, transfers, burns, royalties.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Conventions for every call

- **Custody:** `sourceAddress`/`destinationAddress` follow the uniform rule - wallet, `@contract.address` escrow, or account id (named app PDA). An escrowed NFT sale holds the asset in a named PDA exactly like an escrowed token balance. See [custody and PDAs](../custody-and-pdas.md).
- Bounded-managed assets (created through `createCollection`/`mintNFT`) are update-authority-signed by the program; for those, royalty updates ignore the passed authority argument. Externally created assets need the real authority wallet to sign.
- `assetId`/`collectionId` are app-scoped id strings (mint derivation inputs), not addresses; read the derived addresses with `getTokenMintAddress`/`getCollectionMintAddress`.

## Transactional

Callable only from `hooks.onchain` on `"onchain": true` collections (exceptions noted per function). A `false` return or thrown error aborts the entire Solana write.

### `NFTPlugin.burn`

```
@NFTPlugin.burn(sourceAddress, mintAddress, collectionAddress?)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `mintAddress` | string | yes | no | - | The mint address of the NFT to burn |
| `collectionAddress` | string | no | no | - | Optional: The address of the collection to burn the NFT from. It is required if the NFT belongs to a collection. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `NFTPlugin.createCollection`

```
@NFTPlugin.createCollection(collectionId, name, metadataUri)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `collectionId` | string | yes | no | - | Unique identifier for the collection within the app |
| `name` | string | yes | no | - | The name of the collection |
| `metadataUri` | string | yes | no | - | The URI of the collection metadata |

### `NFTPlugin.mintNFT`

```
@NFTPlugin.mintNFT(nftId, name, metadataUri, destinationAddress, collectionAddress?)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `nftId` | string | yes | no | - | Unique identifier for the NFT within the app |
| `name` | string | yes | no | - | The name of the NFT |
| `metadataUri` | string | yes | no | - | The URI of the NFT metadata |
| `destinationAddress` | string | yes | no | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The address of the destination account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `collectionAddress` | string | no | no | - | Optional: The address of the collection to create the NFT in. It is required if the NFT belongs to a collection. |

The manifest does not declare signer metadata for this function's custody arguments; the custody rule still applies - a wallet source must sign the transaction, while `@contract.address` and account-id sources are program-signed. See [custody and PDAs](../custody-and-pdas.md).

### `NFTPlugin.transfer`

```
@NFTPlugin.transfer(sourceAddress, destinationAddress, mintAddress, collectionAddress)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `destinationAddress` | string | yes | no | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The address of the destination account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `mintAddress` | string | yes | no | - | The mint address of the NFT to transfer |
| `collectionAddress` | string | no | no | - | Optional: The address of the collection to transfer the NFT to. It is required if the NFT belongs to a collection. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `NFTPlugin.updateCollectionRoyalties`

```
@NFTPlugin.updateCollectionRoyalties(collectionAddress, updateAuthority, basisPoints, creators?) - Update the royalties plugin on a collection. If creators is omitted or null, existing on-chain creators are preserved and only basisPoints changes. SECURITY: When updateAuthority is a Bounded-signed PDA (@contract.address, an @AccountPlugin account, or the collection's Bounded PDA), Bounded signs via invoke_signed - you MUST gate the policy path with `rules` (e.g. rules.create: '@user.address == <admin>') to prevent unauthorized callers. Wallet authorities are natively enforced by Metaplex Core.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `collectionAddress` | string | yes | no | - | The address of the collection whose royalties are being updated |
| `updateAuthority` | string | yes | **yes** | wallet address | The update authority address. For Bounded-managed collections this is ignored (PDA signs). For externally-managed collections, pass the wallet/account that owns the update authority. |
| `basisPoints` | number | yes | no | - | The new royalty amount in basis points (e.g. 500 = 5%, max 10000 = 100%) |
| `creators` | array | no | no | - | Optional: Array of {address: string, percentage: number} objects. Percentages must sum to 100. If omitted or null, existing on-chain creators are preserved. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `NFTPlugin.updateRoyalties`

```
@NFTPlugin.updateRoyalties(nftAddress, collectionAddress, updateAuthority, basisPoints, creators?) - Update the royalties plugin on an NFT. If creators is omitted or null, existing on-chain creators are preserved and only basisPoints changes. SECURITY: When updateAuthority is a Bounded-signed PDA (@contract.address, an @AccountPlugin account, or the collection's Bounded PDA), Bounded signs via invoke_signed - you MUST gate the policy path with `rules` (e.g. rules.create: '@user.address == <admin>') to prevent unauthorized callers. Wallet authorities are natively enforced by Metaplex Core.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `nftAddress` | string | yes | no | - | The mint address of the NFT whose royalties are being updated |
| `collectionAddress` | string | no | no | - | Optional: The address of the collection the NFT belongs to. Pass null for standalone NFTs. |
| `updateAuthority` | string | yes | **yes** | wallet address | The update authority address. For Bounded-managed assets this is ignored (PDA signs). For externally-managed assets, pass the wallet/account that owns the update authority. |
| `basisPoints` | number | yes | no | - | The new royalty amount in basis points (e.g. 500 = 5%, max 10000 = 100%) |
| `creators` | array | no | no | - | Optional: Array of {address: string, percentage: number} objects. Percentages must sum to 100. If omitted or null, existing on-chain creators are preserved. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

## Read-only

### `NFTPlugin.getCollectionMintAddress`

```
@NFTPlugin.getCollectionMintAddress(collectionId, name)
```

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `collectionId` | string | yes | no | - | Unique identifier for the collection within the app |
| `name` | string | yes | no | - | The name of the collection |

### `NFTPlugin.getOwner`

```
@NFTPlugin.getOwner(nftAddress) - Returns the current on-chain owner of a Metaplex Core NFT asset. Only valid for asset addresses (not collections - collections have no owner). For Bounded-held NFTs the return value is the raw escrow PDA (e.g. @contract.address or an @AccountPlugin account PDA); callers should compare against the expected address explicitly. Errors on-chain for collections or unknown accounts; returns null in offchain simulation when the asset is unknown.
```

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `nftAddress` | string | yes | no | - | The mint/asset address of the NFT to look up the owner for |

### `NFTPlugin.getTokenMintAddress`

```
@NFTPlugin.getTokenMintAddress(nftId, name)
```

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `nftId` | string | yes | no | - | Unique identifier for the NFT within the app |
| `name` | string | yes | no | - | The name of the NFT |

### `NFTPlugin.getUpdateAuthority`

```
@NFTPlugin.getUpdateAuthority(nftOrCollectionAddress) - Returns the actual on-chain update authority of an NFT or collection. For NFTs that inherit from their collection (UpdateAuthority::Collection), recursively resolves to the collection's on-chain authority. For Bounded-managed assets, returns the Bounded collection-authority PDA. For externally-managed assets, returns the wallet or account that owns the authority.
```

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `address` | string | yes | no | - | The address of an NFT asset or collection to look up the update authority for |
