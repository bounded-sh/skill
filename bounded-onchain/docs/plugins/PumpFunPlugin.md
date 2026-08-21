<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@PumpFunPlugin`

Pump.fun token launches, buys, creator fees, and PumpSwap liquidity.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Conventions for every call

The complete launch/buy/fee lifecycle, with the custody rule for `source`/`creator` arguments and worked policies, lives in [pump-fun.md](../pump-fun.md). Short version: `creator` is the fee recipient and follows the uniform custody rule (wallet, `@contract.address` escrow, or account id); `tokenId` is the app-scoped mint derivation input; every mutating call returns `Bool`, so read balances or the mirror for amounts.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `PumpFunPlugin.buyExactSolIn`

```
@PumpFunPlugin.buyExactSolIn(source, mint, solAmount, minTokensOut) - Buy tokens with exact SOL amount, reverting unless at least minTokensOut tokens are received
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - provides SOL |
| `mint` | string | yes | - | Token mint address |
| `solAmount` | string | yes | - | Amount of SOL to spend (in lamports) |
| `minTokensOut` | string | yes | - | Absolute minimum tokens the buy must yield or it reverts. Quote it with @PumpFunPlugin.getPumpBuyQuote(mint, solAmount) and subtract your own slippage (e.g. quote * 9500 / 10000 for 5%). Must be positive; the program never re-derives this floor for you, so a stale or manipulated curve cannot shrink your fill below it. |

### `PumpFunPlugin.collectCreatorFee`

```
@PumpFunPlugin.collectCreatorFee(creator) - Collect accumulated creator fees from vault to creator wallet (permissionless)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `creator` | string | yes | - | Creator address (wallet, @contract.address for escrow, or account ID) - validated against bonding curve on-chain |

### `PumpFunPlugin.createFeeSharingConfig`

```
@PumpFunPlugin.createFeeSharingConfig(source, mint) - Create fee sharing config for a token (source pays rent and becomes admin)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - pays rent and becomes admin |
| `mint` | string | yes | - | Token mint address |

### `PumpFunPlugin.createToken`

```
@PumpFunPlugin.createToken(tokenId, name, symbol, uri, creator, {seedMode: "idOnly"}) - Creates a new token on pump.fun with bonding curve. Optional config with seedMode: "idOnly" derives mint PDA from appId+tokenId only (enables vanity addresses).
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | yes | - |  |
| `symbol` | string | yes | - |  |
| `uri` | string | yes | - |  |
| `creator` | string | yes | - | Creator address (wallet, @contract.address for escrow, or account ID) - receives creator fees |
| `config` | object | no | - | Optional config object. Supports {seedMode: "idOnly"} to derive mint PDA from appId+tokenId only. |

Fields of `config`:

| Field | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `seedMode` | string | conditional | - | Seed derivation mode. "idOnly" derives mint PDA from appId+tokenId (no name/symbol). Omit for legacy derivation. |

### `PumpFunPlugin.createTokenV2`

```
@PumpFunPlugin.createTokenV2(tokenId, name, symbol, uri, creator, isMayhemMode, {seedMode: "idOnly"}) - Creates a Token-2022 (SPL-22) token on pump.fun with optional mayhem mode and optional config.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | yes | - |  |
| `symbol` | string | yes | - |  |
| `uri` | string | yes | - |  |
| `creator` | string | yes | - | Creator address (wallet, @contract.address for escrow, or account ID) - receives creator fees |
| `isMayhemMode` | boolean | yes | - | Enable mayhem mode for token (default: false) |
| `config` | object | no | - | Optional config object. Supports {seedMode: "idOnly"} to derive mint PDA from appId+tokenId only. |

Fields of `config`:

| Field | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `seedMode` | string | conditional | - | Seed derivation mode. "idOnly" derives mint PDA from appId+tokenId (no name/symbol). Omit for legacy derivation. |

### `PumpFunPlugin.distributeCreatorFees`

```
@PumpFunPlugin.distributeCreatorFees(mint) - Distribute creator fees to shareholders (permissionless)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mint` | string | yes | - | Token mint address |

### `PumpFunPlugin.pumpswapDeposit`

```
@PumpFunPlugin.pumpswapDeposit(source, mint, lpTokenAmountOut, maxBaseAmountIn, maxQuoteAmountIn) - Deposit liquidity into a PumpSwap AMM pool. Mints LP tokens in exchange for base (token) and quote (SOL) deposits.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - provides tokens and receives LP tokens |
| `mint` | string | yes | - | Base token mint address (the graduated pump.fun token) |
| `lpTokenAmountOut` | string | yes | - | Exact amount of LP tokens to mint (in smallest units) |
| `maxBaseAmountIn` | string | yes | - | Maximum base tokens to deposit (slippage protection, in smallest units) |
| `maxQuoteAmountIn` | string | yes | - | Maximum quote (SOL) to deposit (slippage protection, in lamports) |

### `PumpFunPlugin.pumpswapWithdraw`

```
@PumpFunPlugin.pumpswapWithdraw(source, mint, lpTokenAmountIn, minBaseAmountOut, minQuoteAmountOut) - Withdraw liquidity from a PumpSwap AMM pool. Burns LP tokens and returns proportional base (token) and quote (SOL).
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - provides LP tokens and receives base/quote tokens |
| `mint` | string | yes | - | Base token mint address (the graduated pump.fun token) |
| `lpTokenAmountIn` | string | yes | - | Amount of LP tokens to burn (in smallest units) |
| `minBaseAmountOut` | string | yes | - | Minimum base tokens to receive (slippage protection, in smallest units) |
| `minQuoteAmountOut` | string | yes | - | Minimum quote (SOL) to receive (slippage protection, in lamports) |

### `PumpFunPlugin.transferCreatorFeesToPump`

```
@PumpFunPlugin.transferCreatorFeesToPump(mint) - Transfer AMM creator fees to pump creator vault (permissionless, for graduated tokens)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mint` | string | yes | - | Token mint address |

### `PumpFunPlugin.updateShareholders`

```
@PumpFunPlugin.updateShareholders(source, mint, [{addr: @wallet1, bps: 5000}, ...]) - Set all shareholders atomically
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Authority address (wallet, @contract.address for escrow, or account ID) - must be admin |
| `mint` | string | yes | - | Token mint address |
| `shareholders` | array | yes | - | Array of {addr: address, bps: number} objects. Total BPS must equal 10000. Max 10 shareholders. |

## Read-only

### `PumpFunPlugin.getBondingCurveProgress`

```
@PumpFunPlugin.getBondingCurveProgress(tokenAddress)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenAddress` | string | yes | - |  |

### `PumpFunPlugin.getCreatorFee`

```
@PumpFunPlugin.getCreatorFee(mint) - Get accumulated native SOL creator fees from bonding curve vault. Automatically resolves the correct vault from bonding curve creator (handles pre/post fee-sharing migration).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mint` | string | yes | - | Token mint address |

### `PumpFunPlugin.getPumpBuyQuote`

```
@PumpFunPlugin.getPumpBuyQuote(mint, solAmount) - returns the tokens a solAmount (lamports) buy would ACTUALLY yield against the live bonding curve, AFTER the pump buy fee (so it matches what buyExactSolIn delivers, not the raw pre-fee curve amount). Derive minTokensOut as quote * (1 - slippageBps / 10000), where slippage only needs to cover PRICE MOVEMENT between quote and buy, not the fee.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PUMP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mint` | string | yes | - | Token mint address |
| `solAmount` | number | yes | - | SOL amount in lamports to quote a buy for |
