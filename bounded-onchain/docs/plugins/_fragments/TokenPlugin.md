## Conventions for every call

- **Custody:** `sourceAddress`/`destinationAddress` follow the uniform rule - wallet address (that wallet signs), `@contract.address` (shared app escrow, program-signed), or an account id (named app PDA, program-signed). See [custody and PDAs](../custody-and-pdas.md).
- **Amounts are integers in base units** (lamports for SOL, the mint's smallest unit for tokens). Use `@TokenPlugin.SOL` for native SOL; `@TokenPlugin.USDC` is mainnet-only.
- A transfer to a recipient with no token account creates the recipient's ATA; the transaction payer funds that rent.
- `getBalance` accepts the same three source forms, which makes it the natural rule guard for named-PDA pots: `@TokenPlugin.getBalance($marketId, @TokenPlugin.SOL) >= @newData.payout`.
- Mint identity for `createToken`/`mint` is the app-scoped `tokenId`; `getTokenMintAddress` derives the mint address without a live read.
  **Its argument form MUST match the seed mode of the function that created the mint.**
  The 1-arg `getTokenMintAddress(tokenId)` (id-only seed) pairs ONLY with Pump.fun creates that passed `{seedMode: "idOnly"}`.
  Classic TokenPlugin creates (`createToken`/`createToken2022`) and `@DeFiPlugin.createMeteoraVirtualPool` always use the legacy seed, so they require the 3-arg `getTokenMintAddress(tokenId, name, symbol)`.
  A mismatched form derives a different, nonexistent address, and the write later fails with `onchain account not found`.
