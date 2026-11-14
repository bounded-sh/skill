<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests).
     Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@PumpFunPlugin`

Pump.fun token launches, buys, creator fees, and PumpSwap liquidity.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Conventions for every call

The complete launch/buy/fee lifecycle, with the custody rule for `source`/`creator` arguments and worked policies, lives in [pump-fun.md](../pump-fun.md). Short version: `creator` is the fee recipient and follows the uniform custody rule (wallet, `@contract.address` escrow, or account id); `tokenId` is the app-scoped mint derivation input; every mutating call returns `Bool`, so read balances or the mirror for amounts.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `PumpFunPlugin.buyExactSolIn`

```
@PumpFunPlugin.buyExactSolIn(source, mint, solAmount, slippageBps) - Legacy exact-amount buy in the coin's quote. Kept for deployed-policy compatibility; use buyExactSolInWithMinimumOutput for a caller-committed price floor.
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - provides the coin's quote: SOL, or its token account of the quote token for a token-paired coin |
| `mint` | string | yes | - | Token mint address |
| `solAmount` | string | yes | - | Amount of the coin's quote to spend: lamports for a SOL-paired coin; raw quote units, fees included, for a token-paired coin (runtime v12) |
| `slippageBps` | string | yes | - | Legacy slippage tolerance in basis points. New policies should use buyExactSolInWithMinimumOutput so the accepted price is committed before execution. |

### `PumpFunPlugin.buyExactSolInWithMinimumOutput`

```
@PumpFunPlugin.buyExactSolInWithMinimumOutput(source, mint, solAmount, minTokensOut) - Buy with an exact amount of the coin's quote (SOL, or on runtime v12 the token a token-paired coin trades against, fees included), reverting unless at least minTokensOut tokens are received
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - provides the coin's quote: SOL, or its token account of the quote token for a token-paired coin |
| `mint` | string | yes | - | Token mint address |
| `solAmount` | string | yes | - | Amount of the coin's quote to spend: lamports for a SOL-paired coin; raw quote units, fees included, for a token-paired coin (runtime v12) |
| `minTokensOut` | string | yes | - | Required absolute minimum output in smallest units. Derive it from getPumpBuyQuote and the user's slippage tolerance. |

### `PumpFunPlugin.collectCreatorFee`

```
@PumpFunPlugin.collectCreatorFee(creator, mint?) - Collect accumulated creator fees from vault to creator wallet (permissionless). With the coin's mint (runtime v11) it first sweeps the creator fee that newer trades keep on the bonding curve, and on the PumpSwap pool once the coin has graduated, then pays it all to the creator in the coin's quote: SOL, or the creator's quote token account (e.g. USDC) for a token-paired coin. Single-creator coins only (no fee sharing config).
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `creator` | string | yes | - | Creator address (wallet, @contract.address for escrow, or account ID) - validated against bonding curve on-chain |
| `mint` | string | no | - | The coin's mint. Required to collect a token-paired coin's fees (e.g. USDC) and the fees newer trades keep on the curve or pool. |

### `PumpFunPlugin.createFeeSharingConfig`

```
@PumpFunPlugin.createFeeSharingConfig(source, mint) - Create fee sharing config for a token (source pays rent and becomes admin)
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - pays rent and becomes admin |
| `mint` | string | yes | - | Token mint address |

### `PumpFunPlugin.createToken`

```
@PumpFunPlugin.createToken(tokenId, name, symbol, uri, creator, {seedMode: "idOnly"}) - Creates a new token on pump.fun with bonding curve. Optional config with seedMode: "idOnly" derives mint PDA from appId+tokenId only (enables vanity addresses).
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | yes | - |  |
| `symbol` | string | yes | - |  |
| `uri` | string | yes | - |  |
| `creator` | string | yes | - | Creator address (wallet, @contract.address for escrow, or account ID) - receives creator fees and pays the Pump create (mint, bonding curve, and metadata rent). The platform sponsor and attestation keys are refused (pump_create_reserved_creator). |
| `config` | object | no | - | Optional config object. Supports {seedMode: "idOnly"} to derive mint PDA from appId+tokenId only. |

Fields of `config`:

| Field | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `seedMode` | string | conditional | - | Seed derivation mode. "idOnly" derives mint PDA from appId+tokenId (no name/symbol). Omit for legacy derivation. |

### `PumpFunPlugin.createTokenV2`

```
@PumpFunPlugin.createTokenV2(tokenId, name, symbol, uri, creator, isMayhemMode, {seedMode: "idOnly"}) - Creates a Token-2022 token on pump.fun. On v11, quoteMint, buyAmount and maxQuoteCost support an atomic first buy, and feeReceiver sends creator fees to another account. On v12, quoteMint may be a custom pair (a quote pump lists, such as PUMP, or another pump coin) and creatorFeeBps sets such a coin's own creator fee: {quoteMint: "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", creatorFeeBps: 100, feeReceiver: "treasury"}.
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | yes | - |  |
| `symbol` | string | yes | - |  |
| `uri` | string | yes | - |  |
| `creator` | string | yes | - | Pays for the create and receives creator fees unless config.feeReceiver names another receiver. On v11 a non-Mayhem PDA creator making its first buy in a classic SPL quote token such as USDC pays the quote; the transaction rent funder covers approved creation rent. Other launches charge the creator SOL. Reserved platform signers are refused. |
| `isMayhemMode` | boolean | yes | - | Enable mayhem mode for token (default: false) |
| `config` | object | no | - | Optional config object: seedMode, quoteMint, buyAmount with maxQuoteCost, feeReceiver and creatorFeeBps. |

Fields of `config`:

| Field | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `seedMode` | string | conditional | - | Seed derivation mode. "idOnly" derives mint PDA from appId+tokenId (no name/symbol). Omit for legacy derivation. |
| `quoteMint` | string | conditional | - | Quote mint the coin trades against: @TokenPlugin.USDC, a custom-pair quote pump lists (such as PUMP, pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn; runtime v12), or another pump coin (runtime v12; pump limits how deep such a chain of coins may go and refuses a mayhem-mode coin). Omit (or pass wrapped SOL) for a SOL-paired coin. Every other PumpFunPlugin call follows the pair: amounts are then in this quote's raw units. |
| `buyAmount` | number | conditional | - | Base tokens (raw units, 6 decimals) the creator buys in the same instruction, paying in quoteMint from its own quote token account. Requires quoteMint and maxQuoteCost; a buy past what the curve holds continues into pump.fun's synthetic migration. |
| `maxQuoteCost` | number | conditional | - | Most quote (raw units) the creator's buy may cost, fees included; the whole create fails if the buy would cost more. |
| `feeReceiver` | string | conditional | - | On v11, the wallet or account id Pump records as the coin's creator and pays creator fees to, instead of the creator that pays for the create. |
| `creatorFeeBps` | number | conditional | - | On v12, the coin's own creator fee in basis points of every trade, paid to feeReceiver (or the creator) and collected with collectCreatorFee(creator, mint). It applies only to a custom pair (a quote other than SOL or USDC), where pump accepts from its standard rate (30) up to its configured maximum (Global.max_configurable_creator_fee_bps, 100 in November 2026) and refuses the create otherwise; 0 or omitted keeps the standard rate. SOL- and USDC-paired coins ignore it and use pump's standard fee schedule. |

### `PumpFunPlugin.distributeCreatorFees`

```
@PumpFunPlugin.distributeCreatorFees(mint) - Distribute creator fees to shareholders (permissionless). On runtime v12 a token-paired coin pays them in its quote, sweeping the fee newer trades keep on the curve first and creating a shareholder's quote token account when missing.
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mint` | string | yes | - | Token mint address |

### `PumpFunPlugin.pumpswapDeposit`

```
@PumpFunPlugin.pumpswapDeposit(source, mint, lpTokenAmountOut, maxBaseAmountIn, maxQuoteAmountIn) - Deposit liquidity into a graduated coin's PumpSwap pool. Mints LP tokens in exchange for base (token) and quote deposits; the quote is SOL, or on runtime v12 the token a token-paired coin trades against.
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - provides tokens and receives LP tokens |
| `mint` | string | yes | - | Base token mint address (the graduated pump.fun token) |
| `lpTokenAmountOut` | string | yes | - | Exact amount of LP tokens to mint (in smallest units) |
| `maxBaseAmountIn` | string | yes | - | Maximum base tokens to deposit (slippage protection, in smallest units) |
| `maxQuoteAmountIn` | string | yes | - | Maximum quote to deposit (slippage protection): lamports for a SOL-paired coin, raw quote units for a token-paired coin |

### `PumpFunPlugin.pumpswapWithdraw`

```
@PumpFunPlugin.pumpswapWithdraw(source, mint, lpTokenAmountIn, minBaseAmountOut, minQuoteAmountOut) - Withdraw liquidity from a graduated coin's PumpSwap pool. Burns LP tokens and returns proportional base (token) and quote: SOL, or on runtime v12 the token a token-paired coin trades against.
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | Source address (wallet, @contract.address for escrow, or account ID) - provides LP tokens and receives base/quote tokens |
| `mint` | string | yes | - | Base token mint address (the graduated pump.fun token) |
| `lpTokenAmountIn` | string | yes | - | Amount of LP tokens to burn (in smallest units) |
| `minBaseAmountOut` | string | yes | - | Minimum base tokens to receive (slippage protection, in smallest units) |
| `minQuoteAmountOut` | string | yes | - | Minimum quote to receive (slippage protection): lamports for a SOL-paired coin, raw quote units for a token-paired coin |

### `PumpFunPlugin.transferCreatorFeesToPump`

```
@PumpFunPlugin.transferCreatorFeesToPump(mint) - Transfer AMM creator fees to pump creator vault (permissionless, for graduated tokens). On runtime v12 a token-paired coin moves them in its quote.
```

- Callable from: `hooks.onchain`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mint` | string | yes | - | Token mint address |

### `PumpFunPlugin.updateShareholders`

```
@PumpFunPlugin.updateShareholders(source, mint, [{addr: @wallet1, bps: 5000}, ...]) - Set all shareholders atomically. Pending fees go to the current shareholders first; on runtime v12 a token-paired coin pays them in its quote.
```

- Callable from: `hooks.onchain`

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

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenAddress` | string | yes | - |  |

### `PumpFunPlugin.getCreatorFee`

```
@PumpFunPlugin.getCreatorFee(mint) - Get accumulated native SOL creator fees from bonding curve vault. Automatically resolves the correct vault from bonding curve creator (handles pre/post fee-sharing migration). For a token-paired coin (e.g. USDC) on runtime v11 it answers, in quote units, what @PumpFunPlugin.collectCreatorFee(creator, mint) pays: the fee held on the curve and in the creator vault, plus the pool's once the coin has graduated.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mint` | string | yes | - | Token mint address |

### `PumpFunPlugin.getPumpBuyQuote`

```
@PumpFunPlugin.getPumpBuyQuote(mint, solAmount) - returns a conservative tokens-out quote against the live bonding curve for an amount of the coin's quote, net of pump's fees and, on runtime v12, of the coin's own creator fee. Derive minTokensOut as quote * (10000 - slippageBps) / 10000 and pass it to buyExactSolInWithMinimumOutput.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `mint` | string | yes | - | Token mint address |
| `solAmount` | number | yes | - | Amount of the coin's quote to quote a buy for: lamports for a SOL-paired coin, raw quote units for a token-paired coin |
