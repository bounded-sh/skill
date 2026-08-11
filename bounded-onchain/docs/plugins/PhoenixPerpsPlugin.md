<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@PhoenixPerpsPlugin`

Phoenix leveraged perps: registration, collateral, positions.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Devnet status

Phoenix is unsupported on current devnet (`NO-DEVNET-PHOENIX`); this page documents the discovered source contract, not a runnable devnet flow. The first argument to every trading function is the uniform custody `source` (wallet, `@contract.address` escrow, or account id); collateral is PhUSD bridged via the ember calls; sizes are base lots. The full trading model, reservation patterns, and risk invariants are in [onchain-trading.md](../onchain-trading.md).

## Transactional

Callable only from `hooks.onchain` on `"onchain": true` collections (exceptions noted per function). A `false` return or thrown error aborts the entire Solana write.

### `PhoenixPerpsPlugin.closePosition`

```
@PhoenixPerpsPlugin.closePosition(source, market, sizeBaseLots, side, subaccountIndex?) - Closes an existing position via a ReduceOnly market order. side: 0=Bid (close short), 1=Ask (close long). subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader address (wallet, @contract.address for escrow, or account ID) |
| `market` | string | yes | no | - | Market orderbook pubkey |
| `sizeBaseLots` | number | yes | no | - | Size to close in base lots |
| `side` | number | yes | no | - | Side: 0=Bid (close short position), 1=Ask (close long position) |
| `subaccountIndex` | number | no | no | - | Subaccount index. 0 (default) = cross-margin, 1-100 = isolated margin. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.depositFunds`

```
@PhoenixPerpsPlugin.depositFunds(source, amount, subaccountIndex?) - Deposits Phoenix tokens into the protocol as margin/collateral. subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader address (wallet, @contract.address for escrow, or account ID) |
| `amount` | number | yes | no | - | Amount of Phoenix tokens to deposit (in smallest units) |
| `subaccountIndex` | number | no | no | - | Subaccount index. 0 (default) = cross-margin, 1-100 = isolated margin. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.emberDeposit`

```
@PhoenixPerpsPlugin.emberDeposit(source, usdcAmount) - Converts USDC to Phoenix tokens via the Ember bridge.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader address (wallet, @contract.address for escrow, or account ID) |
| `usdcAmount` | number | yes | no | - | Amount of USDC to convert (in smallest units) |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.emberWithdraw`

```
@PhoenixPerpsPlugin.emberWithdraw(source, amount?) - Converts Phoenix tokens back to USDC via the Ember bridge. If amount is omitted, withdraws all.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader address (wallet, @contract.address for escrow, or account ID) |
| `amount` | number | no | no | - | Amount of Phoenix tokens to convert to USDC. Omit to withdraw all. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.placeLong`

```
@PhoenixPerpsPlugin.placeLong(source, market, sizeBaseLots, subaccountIndex?) - Opens a long position via a market buy order (ImmediateOrCancel, Side::Bid). subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader address (wallet, @contract.address for escrow, or account ID) |
| `market` | string | yes | no | - | Market orderbook pubkey |
| `sizeBaseLots` | number | yes | no | - | Size of the order in base lots |
| `subaccountIndex` | number | no | no | - | Subaccount index. 0 (default) = cross-margin, 1-100 = isolated margin. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.placeShort`

```
@PhoenixPerpsPlugin.placeShort(source, market, sizeBaseLots, subaccountIndex?) - Opens a short position via a market sell order (ImmediateOrCancel, Side::Ask). subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader address (wallet, @contract.address for escrow, or account ID) |
| `market` | string | yes | no | - | Market orderbook pubkey |
| `sizeBaseLots` | number | yes | no | - | Size of the order in base lots |
| `subaccountIndex` | number | no | no | - | Subaccount index. 0 (default) = cross-margin, 1-100 = isolated margin. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.registerTrader`

```
@PhoenixPerpsPlugin.registerTrader(source, subaccountIndex?) - Registers a new trader account on Phoenix Perps. subaccountIndex 0 (default) = cross-margin (128 positions), 1-100 = isolated margin (1 position each).
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader authority address (wallet, @contract.address for escrow, or account ID) |
| `subaccountIndex` | number | no | no | - | Subaccount index. 0 (default) = cross-margin, 1-100 = isolated margin. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.syncParentToChild`

```
@PhoenixPerpsPlugin.syncParentToChild(source, subaccountIndex) - Activates an isolated subaccount by copying the cross subaccount's capability flags (notably DepositCollateral) into it. Must be called once between registerTrader and the first transferToIsolated for a given subaccount, otherwise Phoenix rejects transfer_collateral with CapabilityDenied. Idempotent on subsequent calls.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader authority address (wallet, @contract.address for escrow, or account ID) |
| `subaccountIndex` | number | yes | no | - | Isolated subaccount index to activate. Must be 1-100. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.transferToCross`

```
@PhoenixPerpsPlugin.transferToCross(source, subaccountIndex) - Sweeps ALL residual collateral + PnL from an isolated subaccount [0,N] back to the cross subaccount [0,0]. No amount field - Phoenix's transfer_collateral_child_to_parent ix always moves the full balance. subaccountIndex must be 1-100.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader authority address (wallet, @contract.address for escrow, or account ID) |
| `subaccountIndex` | number | yes | no | - | Isolated subaccount index to drain back into cross. Must be 1-100. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.transferToIsolated`

```
@PhoenixPerpsPlugin.transferToIsolated(source, amount, subaccountIndex) - Moves collateral from the cross subaccount [0,0] into an isolated subaccount [0,N]. This is the only way to activate an isolated subaccount; direct depositFunds against a frozen isolated PDA is rejected by Phoenix with CapabilityDenied. subaccountIndex must be 1-100. Requires cross subaccount to hold at least `amount` collateral.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader authority address (wallet, @contract.address for escrow, or account ID) |
| `amount` | number | yes | no | - | Amount of Phoenix tokens to move from cross to isolated (in smallest units) |
| `subaccountIndex` | number | yes | no | - | Isolated subaccount index to fund. Must be 1-100. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `PhoenixPerpsPlugin.withdrawFunds`

```
@PhoenixPerpsPlugin.withdrawFunds(source, amount, subaccountIndex?) - Withdraws Phoenix tokens from protocol margin back to trader's token account. subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader address (wallet, @contract.address for escrow, or account ID) |
| `amount` | number | yes | no | - | Amount of Phoenix tokens to withdraw (in smallest units) |
| `subaccountIndex` | number | no | no | - | Subaccount index. 0 (default) = cross-margin, 1-100 = isolated margin. |

A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet's signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).

## Read-only

### `PhoenixPerpsPlugin.getCollateralBalance`

```
@PhoenixPerpsPlugin.getCollateralBalance(source, subaccountIndex?) - Returns the trader's deposited collateral in PhUSD base units (6 decimals). 0 if not registered.
```

- Callable from: `hooks.offchain` only
- Returns: `number`
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | no | - | Trader authority address |
| `subaccountIndex` | number | no | no | - | Subaccount index (default 0). |

### `PhoenixPerpsPlugin.getMarkPrice`

```
@PhoenixPerpsPlugin.getMarkPrice(market) - Returns the mark price for a Phoenix perp market, in PhUSD base units (6 decimals). Sourced from a reference trader's live position data.
```

- Callable from: `hooks.offchain` only
- Returns: `number`
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `market` | string | yes | no | - | Market orderbook pubkey |

### `PhoenixPerpsPlugin.getPortfolioValue`

```
@PhoenixPerpsPlugin.getPortfolioValue(source, subaccountIndex?) - Returns mark-to-market portfolio value including unrealized PnL, in PhUSD base units (6 decimals).
```

- Callable from: `hooks.offchain` only
- Returns: `number`
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | no | - | Trader authority address |
| `subaccountIndex` | number | no | no | - | Subaccount index (default 0). |

### `PhoenixPerpsPlugin.getPositionSize`

```
@PhoenixPerpsPlugin.getPositionSize(source, market, subaccountIndex?) - Returns signed position size in base lots for the given market. Positive for long, negative for short, 0 if no position.
```

- Callable from: `hooks.offchain` only
- Returns: `number`
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | no | - | Trader authority address |
| `market` | string | yes | no | - | Market orderbook pubkey - e.g. 71Si24E4uc3oCaPbPZTozC1ptSNNqygjjebxSmErSsC2 for SOL-PERP. Pass the pubkey, not the symbol. |
| `subaccountIndex` | number | no | no | - | Subaccount index (default 0). |

### `PhoenixPerpsPlugin.getUnrealizedPnl`

```
@PhoenixPerpsPlugin.getUnrealizedPnl(source, subaccountIndex?) - Returns signed unrealized PnL in PhUSD base units (6 decimals). Negative when underwater.
```

- Callable from: `hooks.offchain` only
- Returns: `number`
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | no | - | Trader authority address |
| `subaccountIndex` | number | no | no | - | Subaccount index (default 0). |

### `PhoenixPerpsPlugin.hasPosition`

```
@PhoenixPerpsPlugin.hasPosition(source, market, subaccountIndex?) - Returns true if the trader has a non-zero position in the given market.
```

- Callable from: `hooks.offchain` only
- Returns: `boolean`
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | no | - | Trader authority address |
| `market` | string | yes | no | - | Market orderbook pubkey |
| `subaccountIndex` | number | no | no | - | Subaccount index (default 0). |

### `PhoenixPerpsPlugin.isRegistered`

```
@PhoenixPerpsPlugin.isRegistered(source, subaccountIndex?) - Returns true if the trader PDA has been registered on Phoenix for this subaccount (default 0).
```

- Callable from: `hooks.offchain` only
- Returns: `boolean`
- Status: **unsupported** (not run); markers: NO-DEVNET-PHOENIX.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | no | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Trader authority address (wallet, @contract.address, or account ID) |
| `subaccountIndex` | number | no | no | - | Subaccount index. 0 (default) = cross-margin. |
