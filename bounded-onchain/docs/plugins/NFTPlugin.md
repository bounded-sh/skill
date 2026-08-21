<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@NFTPlugin`

Metaplex Core NFTs: collections, mints, transfers, burns, royalties.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Conventions for every call

- **Custody:** `sourceAddress`/`destinationAddress` follow the uniform rule - wallet, `@contract.address` escrow, or account id (named app PDA). An escrowed NFT sale holds the asset in a named PDA exactly like an escrowed token balance. See [custody and PDAs](../custody-and-pdas.md).
- **Update authority governs transfer/burn/royalty** for a Bounded-managed asset - the program grants the Transfer and Burn delegates to whoever holds it at mint. A **collection** asset inherits its collection's program-derived authority PDA; a **standalone** `mintNFT` (null `collectionAddress`) gets its own per-NFT program authority PDA, so your policy - not whoever paid for the mint - governs it. Royalty updates ignore the passed authority argument for these; externally created assets need the real authority wallet to sign.
- **Standalone update authority is not retroactive.** Standalone NFTs minted before the per-NFT-authority fix carry the *payer* as update authority (mpl-core's default when none is set), which let the payer transfer or burn an asset another wallet owns. A policy that assumes the program holds the authority is true only for newly minted standalone assets - do not mint a standalone NFT for a third-party owner on a runtime older than that fix.
- `assetId`/`collectionId` are app-scoped id strings (mint derivation inputs), not addresses; read the derived addresses with `getTokenMintAddress`/`getCollectionMintAddress`.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `NFTPlugin.burn`

```
@NFTPlugin.burn(sourceAddress, mintAddress, collectionAddress?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `mintAddress` | string | yes | - | The mint address of the NFT to burn |
| `collectionAddress` | string | no | - | Optional: The address of the collection to burn the NFT from. It is required if the NFT belongs to a collection. |

### `NFTPlugin.createCollection`

```
@NFTPlugin.createCollection(collectionId, name, metadataUri)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `collectionId` | string | yes | - | Unique identifier for the collection within the app |
| `name` | string | yes | - | The name of the collection |
| `metadataUri` | string | yes | - | The URI of the collection metadata |

### `NFTPlugin.mintNFT`

```
@NFTPlugin.mintNFT(nftId, name, metadataUri, destinationAddress, collectionAddress?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `nftId` | string | yes | - | Unique identifier for the NFT within the app |
| `name` | string | yes | - | The name of the NFT |
| `metadataUri` | string | yes | - | The URI of the NFT metadata |
| `destinationAddress` | string | yes | - | The address of the destination account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `collectionAddress` | string | no | - | Optional: The address of the collection to create the NFT in. It is required if the NFT belongs to a collection. |

### `NFTPlugin.transfer`

```
@NFTPlugin.transfer(sourceAddress, destinationAddress, mintAddress, collectionAddress)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `destinationAddress` | string | yes | - | The address of the destination account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `mintAddress` | string | yes | - | The mint address of the NFT to transfer |
| `collectionAddress` | string | no | - | Optional: The address of the collection to transfer the NFT to. It is required if the NFT belongs to a collection. |

### `NFTPlugin.updateCollectionRoyalties`

```
@NFTPlugin.updateCollectionRoyalties(collectionAddress, updateAuthority, basisPoints, creators?) - Update the royalties plugin on a collection. If creators is omitted or null, existing on-chain creators are preserved and only basisPoints changes. SECURITY: When updateAuthority is a Bounded-signed PDA (@contract.address, an @AccountPlugin account, or the collection's Bounded PDA), Bounded signs via invoke_signed - you MUST gate the policy path with `rules` (e.g. rules.create: '@user.address == <admin>') to prevent unauthorized callers. Wallet authorities are natively enforced by Metaplex Core.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `collectionAddress` | string | yes | - | The address of the collection whose royalties are being updated |
| `updateAuthority` | string | yes | **yes** | The update authority address. For Bounded-managed collections this is ignored (PDA signs). For externally-managed collections, pass the wallet/account that owns the update authority. |
| `basisPoints` | number | yes | - | The new royalty amount in basis points (e.g. 500 = 5%, max 10000 = 100%) |
| `creators` | array | no | - | Optional: Array of {address: string, percentage: number} objects. Percentages must sum to 100. If omitted or null, existing on-chain creators are preserved. |

### `NFTPlugin.updateRoyalties`

```
@NFTPlugin.updateRoyalties(nftAddress, collectionAddress, updateAuthority, basisPoints, creators?) - Update the royalties plugin on an NFT. If creators is omitted or null, existing on-chain creators are preserved and only basisPoints changes. SECURITY: When updateAuthority is a Bounded-signed PDA (@contract.address, an @AccountPlugin account, or the collection's Bounded PDA), Bounded signs via invoke_signed - you MUST gate the policy path with `rules` (e.g. rules.create: '@user.address == <admin>') to prevent unauthorized callers. Wallet authorities are natively enforced by Metaplex Core.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `nftAddress` | string | yes | - | The mint address of the NFT whose royalties are being updated |
| `collectionAddress` | string | no | - | Optional: The address of the collection the NFT belongs to. Pass null for standalone NFTs. |
| `updateAuthority` | string | yes | **yes** | The update authority address. For Bounded-managed assets this is ignored (PDA signs). For externally-managed assets, pass the wallet/account that owns the update authority. |
| `basisPoints` | number | yes | - | The new royalty amount in basis points (e.g. 500 = 5%, max 10000 = 100%) |
| `creators` | array | no | - | Optional: Array of {address: string, percentage: number} objects. Percentages must sum to 100. If omitted or null, existing on-chain creators are preserved. |

## Read-only

### `NFTPlugin.getCollectionMintAddress`

```
@NFTPlugin.getCollectionMintAddress(collectionId, name)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `collectionId` | string | yes | - | Unique identifier for the collection within the app |
| `name` | string | yes | - | The name of the collection |

### `NFTPlugin.getOwner`

```
@NFTPlugin.getOwner(nftAddress) - Returns the current on-chain owner of a Metaplex Core NFT asset. Only valid for asset addresses (not collections - collections have no owner). For Bounded-held NFTs the return value is the raw escrow PDA (e.g. @contract.address or an @AccountPlugin account PDA); callers should compare against the expected address explicitly. Errors on-chain for collections or unknown accounts; returns null in offchain simulation when the asset is unknown.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `nftAddress` | string | yes | - | The mint/asset address of the NFT to look up the owner for |

### `NFTPlugin.getTokenMintAddress`

```
@NFTPlugin.getTokenMintAddress(nftId, name)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `nftId` | string | yes | - | Unique identifier for the NFT within the app |
| `name` | string | yes | - | The name of the NFT |

### `NFTPlugin.getUpdateAuthority`

```
@NFTPlugin.getUpdateAuthority(nftOrCollectionAddress) - Returns the actual on-chain update authority of an NFT or collection. For NFTs that inherit from their collection (UpdateAuthority::Collection), recursively resolves to the collection's on-chain authority. For Bounded-managed assets, returns the Bounded collection-authority PDA. For externally-managed assets, returns the wallet or account that owns the authority.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `address` | string | yes | - | The address of an NFT asset or collection to look up the update authority for |
