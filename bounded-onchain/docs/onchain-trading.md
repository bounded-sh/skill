# Onchain trading - Phoenix perps & DEX swaps (server-signed execution)

**What's in here / when to read this:** you want an app to actually *trade* onchain
- open/close a leveraged perp (long or short), swap one token for another (spot),
read live position size / mark price / unrealized PnL, and do it under **server
(service-key) custody** so the backend executes without a user signing each order.
This is the execution layer for trading agents, copy-trading, treasury/DCA bots,
and autonomous desks. For plain token movement and the onchain basics (protocols,
`onchain:true`, the eventual-consistency mirror, server-signed vs client-signed
settlement) read [onchain.md](onchain.md) first - this builds on it.

> The compiler and runtime contain these trading functions, but current devnet support is constrained.
> Jupiter and Phoenix are unavailable on devnet.
> Meteora is not blocked: the replacement DAMM v2 config `BQS7mc9ouPRb29BKMkZj3pA5yP4Yu6AKHL4MaaYG5YTG` was adopted on 2026-07-29 and the deployed runtime targets it, so the Meteora rows are unverified pending live proof rather than externally blocked.
> Source presence, Poofnet behavior, and local cloned-program tests are not live support evidence.
> Check [solana-capability-status.md](solana-capability-status.md) before using any function in this guide.

## Current devnet status

| Integration | Devnet support | Live verification |
|---|---|---|
| Jupiter swap and quote | unsupported | not run |
| Phoenix perps and reads | unsupported | not run |
| DFlow prediction order and KYC | unsupported | not run |
| Kamino descriptor CPI | unsupported | not run |
| Meteora, DAMM v2, and CP-AMM | unverified | no retained live proof |
| Pump.fun and PumpSwap | unverified | no retained live proof |
| Tensor | unverified | no retained live proof |

## The model: a plugin call in an onchain hook

A trade is a **document write** to an `"onchain": true` collection whose policy
declares a `hooks.onchain` plugin call. When the write lands, Bounded builds and
**server-signs** the Solana transaction (the app's sponsor wallet pays gas and the
escrow PDA is the trading authority). Same mechanism as any other onchain hook.

```json
{
  "trades/$id": {
    "onchain": true,
    "fields": { "market": "String", "size": "Number" },
    "rules": { "read": "true", "create": "@user.address != null", "update": "false", "delete": "false" },
    "hooks": {
      "onchain": { "create": "@PhoenixPerpsPlugin.placeLong(@contract.address, @newData.market, @newData.size)" }
    }
  }
}
```

### `source` - who holds the position (custody)

The first argument to every trading function is the **source** (the trading
authority / fund owner):

| `source` value | Custody model | Use for |
|---|---|---|
| `@contract.address` | **Server custody, ONE shared fund** - a program-ID sentinel that this built-in plugin resolves to the app escrow PDA - the app's single shared fund - under its server-signed contract. The backend trades autonomously; no user signature per order. | trading agents, desks, treasury/DCA bots, a single pooled fund |
| **any other string** (an account id) | **Server custody, ONE fund PER NAME** - the string is treated as a Bounded account id and resolved to its own named PDA. The program signs for it exactly as it does for the escrow. | per-market, per-launch, per-round, or per-tenant funds that must not share a balance |
| `@newData.source` (a user wallet) | The user's own wallet is the authority (client-signed path). | self-custody trading where the user signs |

### Named escrow accounts - the third custody model (read this before pooling funds)

The rule is uniform and it is decided **by the shape of the string**, in the
program's own source resolver:

1. the value parses as a pubkey **and equals the program ID** -> the app escrow PDA, program-signed;
2. the value parses as a pubkey -> that wallet, no program signing (the user signs);
3. **the value does not parse as a pubkey -> it is an account id**, resolved to
   `hash("tarobase_pda" + appId + accountId)`, and the program signs for it with those seeds.

Branch 3 is the one people miss, because most examples only ever show branch 1.
It applies only when that function's existing manifest description lists wallet,
`@contract.address`, and account-id forms. Those descriptions confirm the forms for
`@TokenPlugin.transfer`, `@DeFiPlugin.createPool`, `claimMeteoraPoolFees`,
`claimDammV2PoolFees`, `swapInMeteoraVirtualPool`, and `closeCpAmmPosition`; do
not generalize the resolver to an unlisted source, owner, creator, or destination.
Create the account once with
`@AccountPlugin.createAccount("<id>")` and read its address with
`@AccountPlugin.getAccountAddress("<id>")`.

**Why this is a design decision, not a detail.** With `@contract.address`, every
market/launch/round in your app shares ONE balance, so isolation between them is
only as good as your accounting: nothing on-chain stops one from drawing down
another's funds, and the failure surfaces as an unrelated user's withdrawal
reverting for insufficient funds. With a per-entity account id, isolation is
**physical and chain-enforced** - a hook for entity A structurally cannot name
entity B's account.

`createAccount` is idempotent, so the safe idiom is one atomic hook that creates the
account and funds it. Mutating plugin calls live only in `hooks.onchain` - `rules`
stay pure boolean gates:

```json
"hooks": { "onchain": {
  "create": "@AccountPlugin.createAccount($marketId) && @TokenPlugin.transfer(@user.address, $marketId, @TokenPlugin.SOL, @newData.amount)"
} }
```

Paying out of that market only, from a later collection's hook (the program signs
for the named PDA; gate the amount against the pot's real balance in the rule):

```json
"rules": { "create": "@TokenPlugin.getBalance($marketId, @TokenPlugin.SOL) >= @newData.payout" },
"hooks": { "onchain": {
  "create": "@TokenPlugin.transfer($marketId, @newData.winner, @TokenPlugin.SOL, @newData.payout)"
} }
```

Account ids must not parse as a Solana pubkey, and the id namespace is app-global -
see [custody and PDAs](custody-and-pdas.md) for the full hygiene rules.

Choose the shared escrow when the app genuinely is one fund. Choose named
accounts whenever separate pots of user money coexist in one app - escrows,
auctions, prize pools, per-tenant balances. Retrofitting the split later means
migrating live balances, so decide it before the first deposit lands.

For an **autonomous desk** (acts every cycle with no per-trade human gate),
`@contract.address` is the plugin-source syntax: the resolved escrow PDA is the fund, the backend is the
only writer, and access rules + invariants on the collection are the guardrails.
The sentinel itself evaluates to the Bounded program ID in a direct query.
The separate `@AccountPlugin.getAccountAddress(@contract.address)` composition is unsupported on the current deployed Devnet runtime.
When the concrete escrow public key is needed outside a documented plugin source argument, use the current Devnet program-ID string literal documented in [policy-primitives.md](policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address).

## Phoenix perps - `@PhoenixPerpsPlugin`

Phoenix is unsupported on current devnet.
The function list below documents the discovered source contract and must not be presented as a runnable devnet flow.

Leveraged long/short on Phoenix. Collateral is **PhUSD** (bridge USDC ↔ PhUSD with
the ember calls). Sizes are in **base lots** of the market. `subaccountIndex`:
omit / `0` = cross-margin, `1`–`100` = isolated-margin subaccounts.

**Lifecycle / write functions** (used in `hooks.onchain`):

| Function | Signature | Does |
|---|---|---|
| `registerTrader` | `(source, subaccountIndex?)` | One-time: create the trader PDA after the source authority is Phoenix-onboarded. |
| `emberDeposit` | `(source, amount)` | Bridge USDC → PhUSD (collateral currency). |
| `emberWithdraw` | `(source, amount)` | Bridge PhUSD → USDC. |
| `depositFunds` | `(source, amount, subaccountIndex?)` | Deposit PhUSD collateral into the margin account. |
| `withdrawFunds` | `(source, amount, subaccountIndex?)` | Withdraw collateral. |
| `placeLong` | `(source, market, sizeBaseLots, subaccountIndex?)` | Open/add a **long**. |
| `placeShort` | `(source, market, sizeBaseLots, subaccountIndex?)` | Open/add a **short**. |
| `closePosition` | `(source, market, sizeBaseLots, side, subaccountIndex?)` | Reduce/close. `side`: `1` = close a long (ask), `0` = close a short (bid). |
| `transferToIsolated` | `(source, amount, subaccountIndex)` | Move collateral cross → isolated. |
| `transferToCross` | `(source, subaccountIndex)` | Sweep collateral isolated → cross. |
| `syncParentToChild` | `(source, subaccountIndex)` | Copy capabilities to an isolated subaccount (run before its first deposit). |

**Read functions** (live position state - for monitors, sizing, stop/target logic):

| Function | Signature | Returns |
|---|---|---|
| `getMarkPrice` | `(market)` | Current mark price. |
| `getPositionSize` | `(source, market, subaccountIndex?)` | Open size (signed: + long / − short). |
| `getUnrealizedPnl` | `(source, market, subaccountIndex?)` | Live unrealized PnL. |
| `getCollateralBalance` | `(source, subaccountIndex?)` | Deposited collateral. |
| `getPortfolioValue` | `(source, subaccountIndex?)` | Collateral + unrealized PnL. |
| `hasPosition` | `(source, market, subaccountIndex?)` | Bool. |
| `isRegistered` | `(source, subaccountIndex?)` | Bool - trader PDA exists. |

There is no `getPhUSDBalance` function in the current manifest or compiler catalog.

> On Poofnet, Phoenix registration and onboarding are simulated.
> On live Solana, Phoenix onboarding is a separate prerequisite for each new authority, including a new app escrow PDA.
> Use Phoenix's current [build/send registration flow](https://docs.phoenix.trade/sdk/register); `registerTrader` cannot auto-whitelist an authority.
> These facts do not change the current devnet classification of unsupported.

> `market` is a Phoenix **market address** (e.g. the SOL market
> `71Si24E4uc3oCaPbPZTozC1ptSNNqygjjebxSmErSsC2`). "Leverage" is expressed as
> position size relative to deposited collateral - size big vs collateral = more
> leverage; the margin account enforces maintenance.

### Minimal perp flow

This is a source-contract sequence only.
It is not a runnable current-devnet recipe.

```
registerTrader(@contract.address)
emberDeposit(@contract.address, <usdc>)         // → PhUSD
depositFunds(@contract.address, <phusd>)         // collateral in
placeLong(@contract.address, "<market>", <lots>) // open
  … monitor getUnrealizedPnl / getMarkPrice …
closePosition(@contract.address, "<market>", <lots>, 1)  // close the long
withdrawFunds(@contract.address, <phusd>)
```

## DEX swaps - `@DeFiPlugin`

Spot swaps and liquidity (Meteora / cp-AMM pools), incl. tokenized assets.
The Jupiter rows are unsupported on devnet.
The Meteora and CP-AMM rows are unverified pending live proof; nothing about them is externally blocked.

| Function | Signature | Does |
|---|---|---|
| `swap` | `(source, tokenInMint, tokenOutMint, amountIn)` | Swap spot, in → out. |
| `getSwapQuote` | `(tokenInMint, tokenOutMint, amountIn)` | Expected out (size before you swap). |
| `getMeteoraSwapQuote` | `(tokenMintAddress, tokenToSwapInMintAddress, tokenAmount)` | Quote against a Meteora pool. **Offchain-only** - the compiler rejects it inside an onchain hook. |
| `swapInMeteoraVirtualPool` | `(source, poolTokenMint, tokenMint, amount, minimumAmountOut?)` | Swap against a Meteora virtual pool. **Pass the fifth argument** - it is the slippage floor (see below). |
| `createPool` / `createMeteoraVirtualPool` | [full contracts](plugins/DeFiPlugin.md) | Create liquidity pools; `source` follows the uniform custody rule, so a per-entity account id gives each launch its own pot. |
| `createCpAmmPosition` / `addCpAmmLiquidity` / `removeCpAmmLiquidity` / `lockCpAmmPosition` / `closeCpAmmPosition` | [full contracts](plugins/DeFiPlugin.md) | cp-AMM position lifecycle; `source`/`owner` follows the uniform custody rule. |
| `getMeteoraVirtualPoolAddress` / `getDammV2PoolAddress` / `getCpAmmPoolAddress` | [full contracts](plugins/DeFiPlugin.md) | Resolve the corresponding pool address. |

`@TokenPlugin.SOL` is the native-token alias.
`@TokenPlugin.USDC` is mainnet-only and must not be used in a devnet TokenPlugin flow.
Create an app-owned devnet mint for token scenarios.

### `swapInMeteoraVirtualPool` takes a slippage floor - use it

```
@DeFiPlugin.swapInMeteoraVirtualPool(source, poolTokenMint, tokenMint, amount, minimumAmountOut?, slippageBps?) -> Bool
```

`minimumAmountOut` is the **minimum output in the output token's smallest units**.
The swap fails rather than filling when the pool would return less, which is the slippage protection for a bonding-curve trade.
Omitting it does **not** leave the trade unprotected: the builder then derives the floor from a fresh on-chain quote using `slippageBps`, which **defaults to 500 (5%)**.
Still pass an explicit floor on any trade carrying value - a derived 5% band is a backstop, not a price you chose.
Compute the floor where you can quote - `@DeFiPlugin.getMeteoraSwapQuote` is offchain-only, so quote in a function or on the client, write the resulting minimum as a document field, and have `rules` constrain it (for example `@newData.minOut >= @MathPlugin.mulDivFloor(@newData.quotedOut, 9900, 10000)`) before the hook passes `@newData.minOut` through.

Two limits worth knowing before you design around it:

- **There is no deadline parameter.** The underlying Meteora DBC `swap2` has none either, so this is a missing protocol capability, not a missing Bounded exposure. A stale queued write cannot be time-bounded at the swap; bound it in policy instead (for example, reject a write whose `@newData.quotedAt` is older than N seconds against `@time.now`).
- **The swap returns `Bool`, not the output amount.** A successful call tells you the floor was met, not what you received. Read the resulting balance (or the mirror) afterwards if you need the figure.

```json
"hooks": { "onchain": { "create":
  "@DeFiPlugin.swap(@contract.address, @TokenPlugin.SOL, @const.APP_DEVNET_MINT, @newData.amountIn)" } }
```

The snippet shows source syntax only because the Jupiter-backed `swap` function is unsupported on devnet.

## Making it safe (the Bounded part)

Plugin **bodies are trusted** (they build the Solana tx), but everything *around*
the trade is provable on the collection - that's where you put the guardrails:

- **Who can trade** → `rules.create` (owner-only; the desk's backend identity for an autonomous desk).
- **What/where** → `rules` + field validation on `market`, `side`, `size` (e.g. only whitelisted markets, `size <= cap`).
- **Loss / spend ceilings** → a `rollingSum` cap (rolling-24h daily-loss) on a
  per-desk loss collection, so the desk stops trading at the cap. The naive version
  caps *realized-loss rows the code writes at close* - which only binds losses your
  code chooses to record, not the real onchain outcome. The robust version is the
  **reserve-at-open** pattern below, which makes the proven cap bind the realized
  onchain loss as an upper bound. See [invariants.md](../../bounded-backend/docs/invariants.md) and
  [proof-coverage.md](../../bounded-backend/docs/proof-coverage.md) for what the proof boundary reaches once
  execution is on-chain.

## Reserve-at-open loss cap / making the proven cap bind the *real* onchain loss

This section documents a policy safety pattern.
It does not make the currently unsupported Phoenix integration available on devnet.

**The gap (B-2).** A `rollingSum` daily-loss cap is only as honest as the rows fed
into it. If you record a loss row *after* a trade settles (`closePosition` →
`getUnrealizedPnl` → write the realized loss), the cap sees only the losses your
code chooses to write. A crashed runtime, a skipped writeback, or a trade that blows
through its stop between cycles can all produce a real onchain loss that **never
hits the proven window**. The prover proves "the recorded sum never exceeds the cap"
- a true statement about a number that may not equal the money that actually left
the escrow. That's a proof of the wrong quantity.

**The fix: reserve the worst case at OPEN, reconcile to realized at CLOSE.** For an
**isolated-margin** perp (Phoenix subaccount `1`–`100`), the committed margin *is*
the maximum the position can lose - liquidation closes it at the margin, so
`realized_loss ≤ committed_margin` **always**. So at open we append **one proven
write** to the loss collection reserving exactly that margin as the worst-case loss.
The `rollingSum` cap rejects that write - and therefore the whole atomic batch,
including the `hooks.onchain` order - if it would push the 24h reserved-loss window
over the cap. The cap is now enforced **before** the trade exists, against the
*worst case*, not after the fact against a hopeful realized number.

### The lifecycle: reserve → submit → reconcile

```
OPEN     setMany([
           positions/$id   { ...,  reservedMicro: margin, status: "open" },   // the trade
           lossReservations/$resId { reservedMicro: margin, kind: "reserve" } // worst-case loss, SAME batch
         ])
         │  rollingSum(reservedMicro, 24h, cap) is checked on the reservation write.
         │  Over cap → 409 → the WHOLE setMany rolls back → no position, no order. ← CAP ENFORCED HERE (proven)
         ▼
SUBMIT   hooks.onchain on positions/$id fires placeLong/placeShort(@contract.address, market, lots, subaccount)
         │  The escrow PDA opens the isolated position. Committed margin == reservedMicro.
         ▼
CLOSE    hooks.onchain fires closePosition(...); realized = -getUnrealizedPnl(...) at fill (≤ margin).
         setMany([
           positions/$id           { status: "closed", ... },
           lossReservations/$resId2 { reservedMicro: <margin minus realized>, kind: "release" }  // negative-delta release
         ])
         │  Reconcile INTO THE SAME 24h window: realized ≤ reserved, so the net window can only shrink.
         ▼
         Window stays ≤ cap for every sequence - proven.
```

Because `reservedMicro` is `UInt` (the cap field can't go negative), the *release*
leg is modeled as a second append that **lowers the desk's effective reserved loss
back toward the realized number** - e.g. credit the unused margin to a separate
`releases` field/window, or (simplest, proven) just never release and let the
reservation expire out of the 24h window on its own. Either way the invariant only
ever sees **nonnegative reserved amounts whose window sum ≤ cap**, which is exactly
what the prover discharges. The release is an *optimization* (frees budget sooner);
the *safety* (window ≤ cap) holds without it.

### The proven policy (verified)

```json
{
  "desks/$deskId/lossReservations/$resId": {
    "description": "Reserve-at-open loss floor. OPEN appends the worst-case loss = committed isolated margin. The PROVEN rolling-24h cap rejects any open that would breach the daily-loss cap. CLOSE reconciles realized (≤ reserved) into the same window. Append-only.",
    "fields": { "reservedMicro": "UInt!", "positionId": "String?", "kind": "String?", "at": "UInt!" },
    "tier": "durable",
    "rules": {
      "read":   "@user.id != null && get(/desks/$deskId).owner == @user.id",
      "create": "@user.id != null && get(/desks/$deskId).owner == @user.id",
      "update": "false", "delete": "false"
    },
    "invariants": [
      { "type": "rollingSum", "name": "reserved_daily_loss_cap",
        "field": "reservedMicro", "windowSeconds": 86400, "limit": 500000, "scopeVariable": "$deskId" }
    ]
  }
}
```

`bounded verify` on this (with the parent `desks/$deskId` collection) proves the cap
verbatim:

```
[PASS] the running total can never exceed the cap - for every possible sequence of writes
       Declared invariant "reserved_daily_loss_cap" has an SMT-proved offchain
       append-only rolling-limit postcondition algebra per $deskId partition: if the
       runtime admits only nonnegative appended records and the projected window sum
       is within the declared limit, the resulting window sum is within that limit.

✓ Proven - every [PASS] guarantee holds for all possible inputs. Safe to deploy.
```

### What is PROVEN vs what is trusted (state it honestly)

- **PROVEN (Z3, every possible input):** no accepted sequence of opens can make the
  24h *reserved*-loss window exceed the cap, per desk. Since for isolated margin
  `realized_loss ≤ reserved_margin`, the proven cap is a **provable upper bound on
  the realized onchain loss**: `realized ≤ reserved ≤ cap`. An over-cap open is
  rejected `409` and - because the reservation and the `hooks.onchain` order ride
  one atomic `setMany` - the onchain order never fires. The cap binds *before* the
  trade exists.
- **TRUSTED (imperative, not proven):** the hook body itself - `placeLong` /
  `closePosition` building and server-signing the Solana tx - is trusted plugin code
  (as all plugin bodies are). The proof says no *accepted* open can over-reserve; it
  does not prove the chain executed the tx, nor that the fill matched the intent.
- **RESIDUAL needing a live onchain fill to confirm e2e:** that the hook actually
  fires on the reservation write and that the realized-PnL writeback lands in the
  same window on a *real* Phoenix fill (margin committed == `reservedMicro`, and
  `realized ≤ margin` holding through liquidation). That's an integration test
  against a supported live market, not an SMT obligation.
  Current devnet cannot close this residual because Phoenix is unavailable there.

This is the resolution to **B-2**: the cap no longer binds only the losses the code
remembers to write; it binds the worst case at the moment of opening, which the
isolated-margin guarantee (`realized ≤ margin`) turns into a proven ceiling on the
real money that can leave the escrow in any 24h window.

## Notes & gotchas

- **Eventual consistency:** confirm the transaction first, then poll the expected Bounded postcondition with a bounded deadline.
  The Phoenix read helpers are offchain-only source functions and are currently unsupported on devnet.
- **Custody key safety:** the app escrow PDA resolved by the built-in plugin is the fund for `@contract.address` trades.
  The sentinel itself is not the fund address.
  Treat access to that server-signed policy path as fund authority.
- **Collateral currency is PhUSD** for Phoenix; bridge with `emberDeposit`/`emberWithdraw`.
- Function name aliases exist as numeric ids (e.g. `placeLong` = `128`); always use the
  named form in policies.
