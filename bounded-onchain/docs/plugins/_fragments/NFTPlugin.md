## Conventions for every call

- **Custody:** `sourceAddress`/`destinationAddress` follow the uniform rule - wallet, `@contract.address` escrow, or account id (named app PDA). An escrowed NFT sale holds the asset in a named PDA exactly like an escrowed token balance. See [custody and PDAs](../custody-and-pdas.md).
- Bounded-managed assets (created through `createCollection`/`mintNFT`) are update-authority-signed by the program; for those, royalty updates ignore the passed authority argument. Externally created assets need the real authority wallet to sign.
- `assetId`/`collectionId` are app-scoped id strings (mint derivation inputs), not addresses; read the derived addresses with `getTokenMintAddress`/`getCollectionMintAddress`.
