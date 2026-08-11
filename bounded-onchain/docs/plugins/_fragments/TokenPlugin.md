## Conventions for every call

- **Custody:** `sourceAddress`/`destinationAddress` follow the uniform rule - wallet address (that wallet signs), `@contract.address` (shared app escrow, program-signed), or an account id (named app PDA, program-signed). See [custody and PDAs](../custody-and-pdas.md).
- **Amounts are integers in base units** (lamports for SOL, the mint's smallest unit for tokens). Use `@TokenPlugin.SOL` for native SOL; `@TokenPlugin.USDC` is mainnet-only.
- A transfer to a recipient with no token account creates the recipient's ATA; the transaction payer funds that rent.
- `getBalance` accepts the same three source forms, which makes it the natural rule guard for named-PDA pots: `@TokenPlugin.getBalance($marketId, @TokenPlugin.SOL) >= @newData.payout`.
- Mint identity for `createToken`/`mint` is the app-scoped `tokenId`; `getTokenMintAddress(tokenId)` (or the legacy `(tokenId, name, symbol)` form) derives the mint address without a live read.
