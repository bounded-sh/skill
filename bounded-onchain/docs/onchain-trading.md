# Onchain trading — Phoenix perps & DEX swaps (server-signed execution)

**What's in here / when to read this:** you want an app to actually *trade* onchain
— open/close a leveraged perp (long or short), swap one token for another (spot),
read live position size / mark price / unrealized PnL, and do it under **server
(service-key) custody** so the backend executes without a user signing each order.
This is the execution layer for trading agents, copy-trading, treasury/DCA bots,
and autonomous desks. For plain token movement and the onchain basics (protocols,
`onchain:true`, the eventual-consistency mirror, server-signed vs client-signed
settlement) read [onchain.md](onchain.md) first — this builds on it.

> These primitives are **real and shipped** (covered by on-chain e2e tests against
> Phoenix + the DeFi DEX plugins). They run through the same server-signed hook path
> as `@TokenPlugin.transfer` — an onchain collection whose `hooks.onchain` invokes a
> plugin function, signed by the app's sponsor wallet.

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
    "rules": { "read": "true", "create": "@user.id == @owner", "update": "false", "delete": "false" },
    "hooks": {
      "onchain": { "create": "@PhoenixPerpsPlugin.placeLong(@contract.address, @newData.market, @newData.size)" }
    }
  }
}
```

### `source` — who holds the position (custody)

The first argument to every trading function is the **source** (the trading
authority / fund owner):

| `source` value | Custody model | Use for |
|---|---|---|
| `@contract.address` | **Server custody** — the app's escrow PDA, signed by the sponsor wallet. The backend trades autonomously; no user signature per order. | trading agents, desks, treasury/DCA bots, pooled funds |
| `@newData.source` (a user wallet) | The user's own wallet is the authority (client-signed path). | self-custody trading where the user signs |

For an **autonomous desk** (acts every cycle with no per-trade human gate),
`@contract.address` is the model: the escrow PDA is the fund, the backend is the
only writer, and access rules + invariants on the collection are the guardrails.

## Phoenix perps — `@PhoenixPerpsPlugin`

Leveraged long/short on Phoenix. Collateral is **PhUSD** (bridge USDC ↔ PhUSD with
the ember calls). Sizes are in **base lots** of the market. `subaccountIndex`:
omit / `0` = cross-margin, `1`–`100` = isolated-margin subaccounts.

**Lifecycle / write functions** (used in `hooks.onchain`):

| Function | Signature | Does |
|---|---|---|
| `registerTrader` | `(source, subaccountIndex?)` | One-time: create the trader PDA. Auto-whitelists for deposits. |
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

**Read functions** (live position state — for monitors, sizing, stop/target logic):

| Function | Signature | Returns |
|---|---|---|
| `getMarkPrice` | `(market)` | Current mark price. |
| `getPositionSize` | `(source, market, subaccountIndex?)` | Open size (signed: + long / − short). |
| `getUnrealizedPnl` | `(source, market, subaccountIndex?)` | Live unrealized PnL. |
| `getCollateralBalance` | `(source, subaccountIndex?)` | Deposited collateral. |
| `getPortfolioValue` | `(source, subaccountIndex?)` | Collateral + unrealized PnL. |
| `getPhUSDBalance` | `(source)` | PhUSD balance. |
| `hasPosition` | `(source, market, subaccountIndex?)` | Bool. |
| `isRegistered` | `(source, subaccountIndex?)` | Bool — trader PDA exists. |

> `market` is a Phoenix **market address** (e.g. the SOL market
> `71Si24E4uc3oCaPbPZTozC1ptSNNqygjjebxSmErSsC2`). "Leverage" is expressed as
> position size relative to deposited collateral — size big vs collateral = more
> leverage; the margin account enforces maintenance.

### Minimal perp flow

```
registerTrader(@contract.address)
emberDeposit(@contract.address, <usdc>)         // → PhUSD
depositFunds(@contract.address, <phusd>)         // collateral in
placeLong(@contract.address, "<market>", <lots>) // open
  … monitor getUnrealizedPnl / getMarkPrice …
closePosition(@contract.address, "<market>", <lots>, 1)  // close the long
withdrawFunds(@contract.address, <phusd>)
```

## DEX swaps — `@DeFiPlugin`

Spot swaps and liquidity (Meteora / cp-AMM pools), incl. tokenized assets.

| Function | Signature | Does |
|---|---|---|
| `swap` | `(source, tokenInMint, tokenOutMint, amountIn)` | Swap spot, in → out. |
| `getSwapQuote` | `(tokenInMint, tokenOutMint, amountIn)` | Expected out (size before you swap). |
| `getMeteoraSwapQuote` | `(pool, amountIn)` | Quote against a Meteora pool. |
| `swapInMeteoraVirtualPool` | `(source, pool, amountIn, …)` | Swap against a Meteora virtual pool. |
| `createPool` / `createMeteoraVirtualPool` | … | Create liquidity pools. |
| `addCpAmmLiquidity` / `removeCpAmmLiquidity` | … | LP in/out of a cp-AMM. |
| `getPoolAddress` / `getCpAmmPoolAddress` | … | Resolve pool addresses. |

`@TokenPlugin.SOL` and `@TokenPlugin.USDC` are built-in mint constants; pass any
SPL mint address for other tokens.

```json
"hooks": { "onchain": { "create":
  "@DeFiPlugin.swap(@contract.address, @TokenPlugin.SOL, @TokenPlugin.USDC, @newData.amountIn)" } }
```

## Making it safe (the Bounded part)

Plugin **bodies are trusted** (they build the Solana tx), but everything *around*
the trade is provable on the collection — that's where you put the guardrails:

- **Who can trade** → `rules.create` (owner-only; the desk's backend identity for an autonomous desk).
- **What/where** → `rules` + field validation on `market`, `side`, `size` (e.g. only whitelisted markets, `size <= cap`).
- **Loss / spend ceilings** → a `rollingSum` cap (rolling-24h daily-loss) on a
  per-desk loss collection, so the desk stops trading at the cap. The naive version
  caps *realized-loss rows the code writes at close* — which only binds losses your
  code chooses to record, not the real onchain outcome. The robust version is the
  **reserve-at-open** pattern below, which makes the proven cap bind the realized
  onchain loss as an upper bound. See [invariants.md](../../bounded-backend/docs/invariants.md) and
  [proof-coverage.md](../../bounded-backend/docs/proof-coverage.md) for what the proof boundary reaches once
  execution is on-chain.

## Reserve-at-open loss cap — making the proven cap bind the *real* onchain loss

**The gap (B-2).** A `rollingSum` daily-loss cap is only as honest as the rows fed
into it. If you record a loss row *after* a trade settles (`closePosition` →
`getUnrealizedPnl` → write the realized loss), the cap sees only the losses your
code chooses to write. A crashed runtime, a skipped writeback, or a trade that blows
through its stop between cycles can all produce a real onchain loss that **never
hits the proven window**. The prover proves "the recorded sum never exceeds the cap"
— a true statement about a number that may not equal the money that actually left
the escrow. That's a proof of the wrong quantity.

**The fix: reserve the worst case at OPEN, reconcile to realized at CLOSE.** For an
**isolated-margin** perp (Phoenix subaccount `1`–`100`), the committed margin *is*
the maximum the position can lose — liquidation closes it at the margin, so
`realized_loss ≤ committed_margin` **always**. So at open we append **one proven
write** to the loss collection reserving exactly that margin as the worst-case loss.
The `rollingSum` cap rejects that write — and therefore the whole atomic batch,
including the `hooks.onchain` order — if it would push the 24h reserved-loss window
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
         Window stays ≤ cap for every sequence — proven.
```

Because `reservedMicro` is `UInt` (the cap field can't go negative), the *release*
leg is modeled as a second append that **lowers the desk's effective reserved loss
back toward the realized number** — e.g. credit the unused margin to a separate
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
[PASS] the running total can never exceed the cap — for every possible sequence of writes
       Declared invariant "reserved_daily_loss_cap" has an SMT-proved offchain
       append-only rolling-limit postcondition algebra per $deskId partition: if the
       runtime admits only nonnegative appended records and the projected window sum
       is within the declared limit, the resulting window sum is within that limit.

✓ Proven — every [PASS] guarantee holds for all possible inputs. Safe to deploy.
```

### What is PROVEN vs what is trusted (state it honestly)

- **PROVEN (Z3, every possible input):** no accepted sequence of opens can make the
  24h *reserved*-loss window exceed the cap, per desk. Since for isolated margin
  `realized_loss ≤ reserved_margin`, the proven cap is a **provable upper bound on
  the realized onchain loss**: `realized ≤ reserved ≤ cap`. An over-cap open is
  rejected `409` and — because the reservation and the `hooks.onchain` order ride
  one atomic `setMany` — the onchain order never fires. The cap binds *before* the
  trade exists.
- **TRUSTED (imperative, not proven):** the hook body itself — `placeLong` /
  `closePosition` building and server-signing the Solana tx — is trusted plugin code
  (as all plugin bodies are). The proof says no *accepted* open can over-reserve; it
  does not prove the chain executed the tx, nor that the fill matched the intent.
- **RESIDUAL needing a live onchain fill to confirm e2e:** that the hook actually
  fires on the reservation write and that the realized-PnL writeback lands in the
  same window on a *real* Phoenix fill (margin committed == `reservedMicro`, and
  `realized ≤ margin` holding through liquidation). That's an integration test
  against a live market, not an SMT obligation — the one part of the loop the prover
  structurally can't reach.

This is the resolution to **B-2**: the cap no longer binds only the losses the code
remembers to write; it binds the worst case at the moment of opening, which the
isolated-margin guarantee (`realized ≤ margin`) turns into a proven ceiling on the
real money that can leave the escrow in any 24h window.

## Notes & gotchas

- **Eventual consistency:** don't read-after-write the onchain doc; use the read
  functions (`getPositionSize`, `getUnrealizedPnl`) for authoritative live state.
- **Custody key safety:** the sponsor/escrow wallet IS the fund for `@contract.address`
  trades — treat it like the owner key.
- **Collateral currency is PhUSD** for Phoenix; bridge with `emberDeposit`/`emberWithdraw`.
- Function name aliases exist as numeric ids (e.g. `placeLong` = `128`); always use the
  named form in policies.
