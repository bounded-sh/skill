# NFT collection with creator-gated minting

A user creates a Metaplex Core collection onchain, then only that collection's creator can mint NFTs into it, delivered straight to any recipient wallet.

Status: `@NFTPlugin.createCollection`, `@NFTPlugin.mintNFT`, `@NFTPlugin.getCollectionMintAddress`, `@NFTPlugin.getTokenMintAddress`, and policy `get()` are currently **unverified** (LIVE-PENDING) in [solana-capability-status.md](../solana-capability-status.md).

## Policy

```json
{
  "collections/$collectionId": {
    "description": "NFT collection definitions, one document per Metaplex Core collection",
    "onchain": true,
    "fields": {
      "creator": "Address!",
      "name": "String!",
      "uri": "String!",
      "createdAt": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.creator == @user.address",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@NFTPlugin.createCollection($collectionId, @newData.name, @newData.uri)"
      }
    },
    "operationDetails": {
      "read": "Anyone can view collections.",
      "create": "Creates the Metaplex Core collection onchain in the same atomic write; the caller's wallet is recorded as creator.",
      "update": "Disabled - collection identity is immutable, so no readonly-preservation clauses are needed."
    }
  },
  "nfts/$nftId": {
    "description": "Individual NFTs, one document per minted asset",
    "onchain": true,
    "fields": {
      "collectionId": "String!",
      "owner": "Address!",
      "name": "String!",
      "uri": "String!",
      "mintedAt": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/collections/@newData.collectionId) != null && get(/collections/@newData.collectionId).creator == @user.address",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@NFTPlugin.mintNFT($nftId, @newData.name, @newData.uri, @newData.owner, @NFTPlugin.getCollectionMintAddress(@newData.collectionId, get(/collections/@newData.collectionId).name))"
      }
    },
    "operationDetails": {
      "read": "Anyone can view NFTs.",
      "create": "Only the collection's creator can mint. The NFT lands directly in the `owner` wallet (self-custody per the uniform custody rule; a non-pubkey account id here would instead escrow the asset in a named app PDA).",
      "update": "Disabled - mint records are immutable."
    }
  }
}
```

## Operations

1. **Create a collection** - write `collections/<collectionId>` with `creator` set to your own wallet address plus `name`, `uri`, `createdAt`. The onchain hook creates the Metaplex Core collection atomically with the document; if the chain write fails, the document write reverts too.
2. **Mint an NFT** - write `nfts/<nftId>` with the parent `collectionId`, the recipient wallet as `owner`, plus `name`, `uri`, `mintedAt`. The hook derives the collection's mint address from its id and stored name via `getCollectionMintAddress`, then mints the asset into the collection with `owner` as the destination.
3. **Read** - both collections are world-readable (`"read": "true"`, required on onchain collections). Derived addresses come from `@NFTPlugin.getCollectionMintAddress` / `@NFTPlugin.getTokenMintAddress`.

Updates and deletes are disabled on both paths, so there are no patch payloads here; all `!` fields are set once at create.

## Why it holds

- **Creator identity cannot be forged**: `@newData.creator == @user.address` binds the stored creator to the authenticated wallet, so a caller cannot register a collection under someone else's address.
- **Mint gating is anchored to stored state, not client input**: the mint rule re-reads `/collections/<id>` and compares its `creator` to `@user.address`, so no payload field can grant mint rights, and minting into a nonexistent collection is denied by the `!= null` check.
- **Metadata cannot drift from chain**: `update` and `delete` are `"false"` on both collections, so the `Address!`/`String!`/`UInt!` fields recorded at create time stay exactly what the hook used onchain.
- **Custody is explicit at the destination**: `mintNFT`'s `destinationAddress` follows the uniform custody rule - `@newData.owner` is a wallet address, so the recipient self-custodies the asset from the first slot; nothing is parked in the app escrow.
- **Atomicity**: rules are pure boolean gates proven by `bounded verify`; the mutating calls live only in `hooks.onchain.create`, and a hook failure reverts the whole write.

## Related

- [NFTPlugin reference](../plugins/NFTPlugin.md)
- [Custody and PDAs](../custody-and-pdas.md)
- [Plugin catalog](../plugins.md)
- [Solana capability status](../solana-capability-status.md)
