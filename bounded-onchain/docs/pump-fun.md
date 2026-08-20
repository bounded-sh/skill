# Pump.fun and PumpSwap - `@PumpFunPlugin` reference

**What's in here / when to read this:** you are writing a `hooks.onchain` call
against Pump.fun (bonding-curve token launches, creator fees, fee sharing) or
PumpSwap (the AMM a graduated token trades on), and you need the exact argument
names, types, units, and return values. For the launch mechanics of a Meteora DBC
instead, read [meteora-token-launch.md](meteora-token-launch.md); for the `source`
custody model that every call here inherits, read
[onchain-trading.md](onchain-trading.md) first.

> **Status: unverified.** All twelve functions below are present in the deployed
> runtime and reachable from an onchain hook, and none has a retained live
> acceptance receipt. Source parity, proof contracts, and a local validator run are
> not live evidence. Confirm any transaction you send and poll for the expected
> Bounded postcondition rather than assuming it. See
> [solana-capability-status.md](solana-capability-status.md).

## Conventions that apply to every call

- **`source` / `creator` follow the standard custody rule.** A value that parses as
  a pubkey and equals the program ID (`@contract.address`) resolves to the app
  escrow PDA and is program-signed; any other pubkey is that wallet (the user
  signs); **any string that is not a pubkey is an account id**, resolved to its own
  program-signed PDA. See
  [named escrow accounts](onchain-trading.md#named-escrow-accounts---the-third-custody-model-read-this-before-pooling-funds).
- **Every mutating call returns `Bool`.** It tells you the instruction was built and
  executed, never how much moved. Read balances or the mirror afterwards for
  amounts.
- **Amounts are integers in base units.** SOL amounts are lamports; token amounts
  are the mint's smallest units. The buy's `minTokensOut` is an absolute token
  floor in those same units, not a basis-points slippage.
- **Mutating calls require an authenticated caller.** The three read functions
  (`getBondingCurveProgress`, `getCreatorFee`, `getPumpBuyQuote`) are pure and do not.

## Launching a token

```
@PumpFunPlugin.createToken(tokenId, name, symbol, uri, creator, config?) -> Bool
@PumpFunPlugin.createTokenV2(tokenId, name, symbol, uri, creator, isMayhemMode, config?) -> Bool
```

`createTokenV2` is the Token-2022 (SPL-22) variant and adds one required argument.

| Arg | Type | Meaning |
|---|---|---|
| `tokenId` | `String` | App-unique id for the token. Part of the mint PDA derivation. |
| `name` | `String` | Token name. |
| `symbol` | `String` | Token symbol. |
| `uri` | `String` | The Metaplex metadata JSON URL. It must be permanent and public - see [the metadata hosting note](meteora-token-launch.md#the-uri-must-be-a-metaplex-metadata-json-not-an-image), which applies identically here. |
| `creator` | `Address` | **The address that RECEIVES creator fees - and the account that PAYS the whole `Create`.** A wallet, the `@contract.address` sentinel (the app escrow PDA), or an account id. This is the only place the fee recipient is chosen, and Pump.fun's `Create` bills this same account for mint rent (1,461,600 lamports), metadata rent (~5,616,720), and bonding-curve/ATA setup - about 0.025 SOL total. |
| `isMayhemMode` | `Bool` | `createTokenV2` only. Enables Pump.fun mayhem mode. Pass `false` for the ordinary launch. |
| `config?` | object | Optional. `{seedMode: "idOnly"}` derives the mint PDA from `appId + tokenId` alone (no name/symbol), which is what enables vanity addresses. Omit for the legacy derivation. |

`creator` is genuinely a parameter here, unlike Meteora's virtual-pool creator,
which is hardwired to the pool-creation signer. Point it at an escrow or a named
account when the app, not an individual, should collect the fees.

Because `creator` also pays, an app-custody creator (a named account id) must
already hold the whole `Create` cost when the hook runs - `createAccount` alone
leaves only its own rent minimum (~0.00089 SOL), and the signing user's wallet
balance is irrelevant to this transfer.
Fund it in the same hook, before `createToken`:

```
"create": "@AccountPlugin.createAccount('launch_fee_pot') && @TokenPlugin.transfer(@user.address, 'launch_fee_pot', @TokenPlugin.SOL, 25000000) && @PumpFunPlugin.createToken($tokenId, @newData.name, @newData.symbol, @newData.uri, 'launch_fee_pot', {seedMode: 'idOnly'})"
```

An underfunded creator fails after the user signs, with `Transfer: insufficient
lamports ... need 1461600` (the mint) or a shortfall under `IX: Create Metadata
Accounts v3` - both rows are in the
[troubleshooting table](onchain-troubleshooting.md#error-to-cause-to-fix).

## Buying on the curve

```
@PumpFunPlugin.buyExactSolIn(source, mint, solAmount, minTokensOut) -> Bool
@PumpFunPlugin.getPumpBuyQuote(mint, solAmount) -> Int            (read)
```

| Arg | Type | Meaning |
|---|---|---|
| `source` | `Address` | Who spends the SOL and receives the tokens. |
| `mint` | `Address` | The token mint. |
| `solAmount` | `Int` | SOL to spend, **in lamports** (`1 SOL` = `1000000000`). |
| `minTokensOut` | `Int` | Absolute minimum tokens the buy must yield, in the mint's smallest units. The buy reverts if it would return less. |

`minTokensOut` is required and must be positive.
It is an absolute floor, not a basis-points slippage.
Quote it first with `@PumpFunPlugin.getPumpBuyQuote(mint, solAmount)` - which returns the tokens a buy would yield against the current bonding curve, using the same math `buyExactSolIn` checks its floor against - then subtract your own tolerance, e.g. `quote * 9500 // 10000` for 5%.
The program checks the floor you pass verbatim and never re-derives one, so a curve an attacker moved between quote and buy cannot shrink your fill below the amount you priced.
There is no matching sell primitive and no "exact tokens out" variant.

## Creator fees

```
@PumpFunPlugin.collectCreatorFee(creator) -> Bool
@PumpFunPlugin.transferCreatorFeesToPump(mint) -> Bool
@PumpFunPlugin.getCreatorFee(mint) -> Int            (pure)
```

| Function | Arg | Meaning |
|---|---|---|
| `collectCreatorFee` | `creator: Address` | Sweeps the accumulated creator-fee vault to the creator. **Permissionless** - anyone may trigger it, and the destination is validated against the bonding curve on chain, so a wrong `creator` fails rather than misdirecting funds. |
| `transferCreatorFeesToPump` | `mint: Address` | Moves AMM-side creator fees back into the pump creator vault. **Permissionless**, and only meaningful for a graduated token. |
| `getCreatorFee` | `mint: Address` | Returns the **distributable lamports** currently in the creator vault: the vault balance minus the rent-exempt minimum. It resolves the real creator from the bonding curve, so it works both before and after a fee-sharing migration. |

> **`getCreatorFee` returns `0` for "no accounts available" as well as for "no
> fees".** When the bonding-curve or vault account is not present in the
> transaction's accounts, the handler returns `0` rather than failing. Do not treat
> `0` as proof that a launch earned nothing.

## Fee sharing (splitting creator fees between several parties)

```
@PumpFunPlugin.createFeeSharingConfig(source, mint) -> Bool
@PumpFunPlugin.updateShareholders(source, mint, shareholders) -> Bool
@PumpFunPlugin.distributeCreatorFees(mint) -> Bool
```

| Function | Args | Meaning |
|---|---|---|
| `createFeeSharingConfig` | `source: Address`, `mint: Address` | Creates the fee-sharing config account for the mint. **`source` pays the rent AND becomes the config's admin** - it is the authority for every later `updateShareholders`, so choose it deliberately (an escrow or named account, not a throwaway wallet). |
| `updateShareholders` | `source: Address`, `mint: Address`, `shareholders: array` | Replaces the whole shareholder set atomically. `source` **must be the admin** established at config creation. |
| `distributeCreatorFees` | `mint: Address` | Pays out accrued creator fees to the configured shareholders. **Permissionless crank** - any caller may turn it, which is what lets a keeper or an ordinary user trigger settlement. |

`shareholders` is an array of `{addr, bps}` objects with hard on-chain limits:

- **1 to 10 entries.** Eleven or more is rejected.
- **The `bps` values must total exactly `10000`.** Not "at most"; exactly. `9999`
  fails.
- `addr` accepts the same forms as `source`: a wallet, the `@contract.address`
  sentinel, or an account id.

```json
"hooks": {
  "onchain": {
    "create": "@PumpFunPlugin.updateShareholders(@contract.address, @const.MINT, [{addr: @const.TREASURY, bps: 6000}, {addr: @const.CREATOR, bps: 4000}])"
  }
}
```

Because the split lives in the on-chain config rather than in your policy, changing
it is an `updateShareholders` transaction by the admin, not a policy redeploy - so
if you want the split to be provably fixed, prove the *rule* that decides who may
call `updateShareholders` and with what literals.

## PumpSwap liquidity (after graduation)

```
@PumpFunPlugin.pumpswapDeposit(source, mint, lpTokenAmountOut, maxBaseAmountIn, maxQuoteAmountIn) -> Bool
@PumpFunPlugin.pumpswapWithdraw(source, mint, lpTokenAmountIn, minBaseAmountOut, minQuoteAmountOut) -> Bool
```

| Arg | Type | Meaning |
|---|---|---|
| `source` | `Address` | Provides the deposit (or the LP tokens) and receives what comes back. |
| `mint` | `Address` | The **base** token mint - the graduated Pump.fun token. |
| `lpTokenAmountOut` / `lpTokenAmountIn` | `Int` | Exact LP tokens to mint, or to burn, in smallest units. |
| `maxBaseAmountIn` / `minBaseAmountOut` | `Int` | Base-token slippage bound, in the token's smallest units. |
| `maxQuoteAmountIn` / `minQuoteAmountOut` | `Int` | Quote-side slippage bound, **in lamports** (the quote is SOL). |

Both calls are exact-LP-amount operations with bounded token legs: you name the LP
quantity and cap (deposit) or floor (withdraw) what the two token legs may be.

## Reading curve state

```
@PumpFunPlugin.getBondingCurveProgress(tokenAddress) -> Int   (pure)
```

Returns bonding-curve progress as a **whole-number percentage, 0 to 100** (not
basis points, not a fraction). It is `100` once the curve is marked complete. Like
`getCreatorFee`, it returns `0` when the bonding-curve account is unavailable, so
`0` means "no progress **or** nothing to read".

## What this surface cannot do

- No sell primitive and no "exact tokens in/out" buy variant; `buyExactSolIn` is the
  only trade exposed.
- No deadline or expiry argument anywhere - bound staleness in policy against
  `@time.now` if it matters.
- No getter for the configured shareholder set, the config admin, or a per-recipient
  claimed amount, so any app-level attribution ledger is caller-asserted convention
  rather than something Bounded reads back from chain.
