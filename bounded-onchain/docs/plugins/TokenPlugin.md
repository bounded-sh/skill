<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@TokenPlugin`

SPL and Token-2022 tokens: transfers, mints, burns, balances, supply.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

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

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `TokenPlugin.burn`

```
@TokenPlugin.burn(sourceAddress, mintAddress, amount)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `mintAddress` | string | yes | - | The mint address of the token to burn |
| `amount` | number | yes | - | The amount of tokens to burn with decimals |

### `TokenPlugin.createToken`

```
@TokenPlugin.createToken(tokenId, name, symbol, uri, decimals)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | yes | - | The name of the token |
| `symbol` | string | yes | - | The symbol of the token |
| `uri` | string | yes | - | The URI of the token image |
| `decimals` | number | yes | - | The number of decimals for the token |

### `TokenPlugin.createToken2022`

```
@TokenPlugin.createToken2022(tokenId, name, symbol, uri, decimals, extensions?) - Creates a Token2022 token with optional extensions object. Extension fields: nonTransferable (true|false), feeBasisPoints (0-65535), maxFee (required if feeBasisPoints > 0), transferFeeAuthority (REQUIRED if feeBasisPoints > 0), interestRate (i16), interestRateAuthority (REQUIRED if interestRate is set), permanentDelegate (address). All address fields support: wallet addresses, @contract.address for escrow, or account IDs.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | yes | - | The name of the token |
| `symbol` | string | yes | - | The symbol of the token |
| `uri` | string | yes | - | The URI of the token metadata |
| `decimals` | number | yes | - | The number of decimals for the token |
| `extensions` | object | no | - | Optional extensions object. Fields: nonTransferable (true\|false), feeBasisPoints (0-65535), maxFee (required if feeBasisPoints > 0), transferFeeAuthority (REQUIRED if feeBasisPoints > 0), withdrawWithheldAuthority (optional, defaults to transferFeeAuthority), interestRate (i16), interestRateAuthority (REQUIRED if interestRate is set), permanentDelegate (address). Address fields can be wallet, @contract.address (escrow), or account ID. |

Fields of `extensions`:

| Field | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `nonTransferable` | boolean | conditional | - |  |
| `feeBasisPoints` | number | conditional | - |  |
| `maxFee` | number | conditional | - |  |
| `transferFeeAuthority` | string | conditional | - |  |
| `withdrawWithheldAuthority` | string | conditional | - |  |
| `interestRate` | number | conditional | - |  |
| `interestRateAuthority` | string | conditional | - |  |
| `permanentDelegate` | string | conditional | - |  |

### `TokenPlugin.mint`

```
@TokenPlugin.mint(tokenId, name, symbol, destinationAddress, amount)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | yes | - | The name of the token |
| `symbol` | string | yes | - | The symbol of the token |
| `destinationAddress` | string | yes | - | The address of the destination account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `amount` | number | yes | - | The amount of tokens to mint with decimals |

### `TokenPlugin.transfer`

```
@TokenPlugin.transfer(sourceAddress, destinationAddress, mintAddress, amount)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `destinationAddress` | string | yes | - | The address of the destination account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `mintAddress` | string | yes | - | The mint address of the token to transfer or 'So11111111111111111111111111111111111111112' or @TokenPlugin.SOL for SOL. Can also use @TokenPlugin.USDC for USDC |
| `amount` | number | yes | - | The amount of tokens to transfer with decimals |

### `TokenPlugin.transferWholeTokens`

```
@TokenPlugin.transferWholeTokens(sourceAddress, destinationAddress, mintAddress, amount)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `destinationAddress` | string | yes | - | The address of the destination account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `mintAddress` | string | yes | - | The mint address of the token to transfer or 'So11111111111111111111111111111111111111112' or @TokenPlugin.SOL for SOL. Can also use @TokenPlugin.USDC for USDC |
| `amount` | number | yes | - | The amount of tokens to transfer without decimals |

### `TokenPlugin.withdrawWithheldTokens`

```
@TokenPlugin.withdrawWithheldTokens(mintAddress, withdrawAuthority, feeReceiverOwner, sourceOwner) - Withdraws withheld transfer fees from a source token account to a fee receiver. Use @TokenPlugin.getTokenMintAddress(tokenId, name, symbol) to get mintAddress. Use @TokenPlugin.getWithdrawWithheldAuthority(mintAddress) to get the withdrawAuthority.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mintAddress` | string | yes | - | The mint address of the Token2022 token. Use @TokenPlugin.getTokenMintAddress(tokenId, name, symbol) to derive it. |
| `withdrawAuthority` | string | yes | **yes** | The withdraw withheld authority that will sign. Use @TokenPlugin.getWithdrawWithheldAuthority(mintAddress) to get this. Supports @contract.address, account ID, or external wallet. |
| `feeReceiverOwner` | string | yes | - | The owner address for the fee receiver token account (ATA will be derived). Supports wallet address, @contract.address for escrow, or account ID. |
| `sourceOwner` | string | yes | - | The owner address for the source token account to harvest withheld fees from (ATA will be derived). Supports wallet address, @contract.address for escrow, or account ID. |

## Read-only

### `TokenPlugin.getBalance`

```
@TokenPlugin.getBalance(walletAddress, mintAddress)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `walletAddress` | string | yes | - | The address of the wallet, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) to get the balance of |
| `mintAddress` | string | yes | - | The mint address of the token to get the balance of |

### `TokenPlugin.getDecimals`

```
@TokenPlugin.getDecimals(mintAddress)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mintAddress` | string | yes | - | The mint address of the token to get the decimals of |

### `TokenPlugin.getSupply`

```
@TokenPlugin.getSupply(mintAddress)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mintAddress` | string | yes | - | The mint address of the token to get the supply of |

### `TokenPlugin.getTokenMintAddress`

```
@TokenPlugin.getTokenMintAddress(tokenId) for id-only mode, or @TokenPlugin.getTokenMintAddress(tokenId, name, symbol) for legacy mode. The argument form MUST match the seed mode of the function that created the mint: the 1-arg form pairs ONLY with Pump.fun creates that passed {seedMode: "idOnly"}; classic TokenPlugin creates (createToken/createToken2022) and @DeFiPlugin.createMeteoraVirtualPool always use the legacy seed and require the 3-arg form. A mismatched form derives a different, nonexistent address and the write later fails with onchain account not found
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Accepted argument counts: 1, 3
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | no | - | The name of the token (optional, omit for id-only seed mode) |
| `symbol` | string | no | - | The symbol of the token (optional, omit for id-only seed mode) |

### `TokenPlugin.getWithdrawWithheldAuthority`

```
@TokenPlugin.getWithdrawWithheldAuthority(mintAddress) - Returns the withdraw withheld authority from a Token2022 mint's TransferFeeConfig extension.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mintAddress` | string | yes | - | The mint address of the Token2022 token with TransferFee extension |

## Built-in values

| Name | Meaning |
|---|---|
| `@TokenPlugin.EURC` | [object Object] |
| `@TokenPlugin.SOL` | [object Object] |
| `@TokenPlugin.USDC` | [object Object] |
