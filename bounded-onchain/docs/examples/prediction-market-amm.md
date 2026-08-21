# Prediction market (one-sided AMM)

A YES-only prediction market: collateral sits in a per-market named PDA, prices come from `@PredictionMarketPlugin` constant-product quotes, and all bookkeeping is staged from hooks so clients can never write balances directly.

Status: every function used here (`@PredictionMarketPlugin.*`, `@TokenPlugin.transfer`/`getBalance`, `@AccountPlugin.createAccount`, `@DocumentPlugin.updateField`, `get`) is currently **unverified (LIVE-PENDING)** in [solana-capability-status.md](../solana-capability-status.md) - source parity only, not live-proven.

Collateral is `@TokenPlugin.SOL`; `@TokenPlugin.USDC` is mainnet-only and must not be used in a devnet flow. Quotes are floored exactly as documented: `getYesTokenOutAmm(in, x, y) = floor(in*y/(x+in))`, `getCollateralOutAmm(yesIn, x, y) = floor(x*yesIn/(y+yesIn))`. This example charges no fee; a fee variant applies `@PredictionMarketPlugin.applyFee` to the quoted integer.

## Policy

```json
{
  "auth": { "wallets": true },
  "constants": { "MIN_SEED_LAMPORTS": 10000000, "MAX_CLAIM_WINDOW_SEC": 2592000 },
  "pmMarkets/$marketId": {
    "onchain": true,
    "description": "Market config plus live AMM pool state. yesSupply is the pool's YES inventory; seedSupply is the immutable initial seed. creator is hook-derived.",
    "operationDetails": { "create": "Send collateralReserve == yesSupply == seedSupply and omit creator. $marketId must not parse as a Solana pubkey (use ids like m_abc; the id namespace is app-global). The hook creates the market pot and pulls the seed from the caller's wallet." },
    "fields": {
      "creator": "Address?",
      "question": "String!",
      "expiryTs": "UInt!",
      "claimWindowSec": "UInt!",
      "seedSupply": "UInt!",
      "collateralReserve": "UInt",
      "yesSupply": "UInt"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.creator == null && @newData.expiryTs > @time.now && @newData.claimWindowSec > 0 && @newData.claimWindowSec <= @const.MAX_CLAIM_WINDOW_SEC && @newData.collateralReserve >= @const.MIN_SEED_LAMPORTS && @newData.yesSupply == @newData.collateralReserve && @newData.seedSupply == @newData.collateralReserve",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@AccountPlugin.createAccount($marketId) && @TokenPlugin.transfer(@user.address, $marketId, @TokenPlugin.SOL, @newData.collateralReserve) && @DocumentPlugin.updateField(/pmMarkets/$marketId, 'creator', @user.address)"
    } }
  },
  "pmPositions/$marketId/holders/$holderId": {
    "onchain": true,
    "description": "One YES position per holder id. owner is hook-derived; balance starts at zero and only hooks move it.",
    "fields": { "owner": "Address?", "yesBalance": "UInt" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.owner == null && @newData.yesBalance == 0 && get(/pmMarkets/$marketId) != null && get(/pmResolves/$marketId) == null && get(/pmMarkets/$marketId).expiryTs > @time.now",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@DocumentPlugin.updateField(/pmPositions/$marketId/holders/$holderId, 'owner', @user.address)"
    } }
  },
  "pmPositions/$marketId/holders/$holderId/buys/$orderId": {
    "onchain": true,
    "isPassthrough": true,
    "description": "Buy YES with collateral at the floored AMM quote. Passthrough: effects persist in the market and position, not in an order document.",
    "fields": { "amountIn": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.amountIn > 0 && get(/pmMarkets/$marketId) != null && get(/pmResolves/$marketId) == null && get(/pmMarkets/$marketId).expiryTs > @time.now && get(/pmPositions/$marketId/holders/$holderId) != null && get(/pmPositions/$marketId/holders/$holderId).owner == @user.address && @PredictionMarketPlugin.getYesTokenOutAmm(@newData.amountIn, get(/pmMarkets/$marketId).collateralReserve, get(/pmMarkets/$marketId).yesSupply) > 0",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@TokenPlugin.transfer(@user.address, $marketId, @TokenPlugin.SOL, @newData.amountIn) && @DocumentPlugin.updateField(/pmMarkets/$marketId, 'collateralReserve', get(/pmMarkets/$marketId).collateralReserve + @newData.amountIn) && @DocumentPlugin.updateField(/pmMarkets/$marketId, 'yesSupply', get(/pmMarkets/$marketId).yesSupply - @PredictionMarketPlugin.getYesTokenOutAmm(@newData.amountIn, get(/pmMarkets/$marketId).collateralReserve, get(/pmMarkets/$marketId).yesSupply)) && @DocumentPlugin.updateField(/pmPositions/$marketId/holders/$holderId, 'yesBalance', get(/pmPositions/$marketId/holders/$holderId).yesBalance + @PredictionMarketPlugin.getYesTokenOutAmm(@newData.amountIn, get(/pmMarkets/$marketId).collateralReserve, get(/pmMarkets/$marketId).yesSupply))"
    } }
  },
  "pmPositions/$marketId/holders/$holderId/sells/$orderId": {
    "onchain": true,
    "isPassthrough": true,
    "description": "Sell YES back to the pool at the floored AMM quote, gated by the pot's real balance.",
    "fields": { "yesIn": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.yesIn > 0 && get(/pmMarkets/$marketId) != null && get(/pmResolves/$marketId) == null && get(/pmMarkets/$marketId).expiryTs > @time.now && get(/pmPositions/$marketId/holders/$holderId) != null && get(/pmPositions/$marketId/holders/$holderId).owner == @user.address && getAfter(/pmPositions/$marketId/holders/$holderId).yesBalance >= @newData.yesIn && @PredictionMarketPlugin.getCollateralOutAmm(@newData.yesIn, getAfter(/pmMarkets/$marketId).collateralReserve, getAfter(/pmMarkets/$marketId).yesSupply) > 0 && @TokenPlugin.getBalance($marketId, @TokenPlugin.SOL) >= @PredictionMarketPlugin.getCollateralOutAmm(@newData.yesIn, getAfter(/pmMarkets/$marketId).collateralReserve, getAfter(/pmMarkets/$marketId).yesSupply)",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@TokenPlugin.transfer($marketId, @user.address, @TokenPlugin.SOL, @PredictionMarketPlugin.getCollateralOutAmm(@newData.yesIn, getAfter(/pmMarkets/$marketId).collateralReserve, getAfter(/pmMarkets/$marketId).yesSupply)) && @DocumentPlugin.updateField(/pmMarkets/$marketId, 'collateralReserve', getAfter(/pmMarkets/$marketId).collateralReserve - @PredictionMarketPlugin.getCollateralOutAmm(@newData.yesIn, getAfter(/pmMarkets/$marketId).collateralReserve, getAfter(/pmMarkets/$marketId).yesSupply)) && @DocumentPlugin.updateField(/pmMarkets/$marketId, 'yesSupply', getAfter(/pmMarkets/$marketId).yesSupply + @newData.yesIn) && @DocumentPlugin.updateField(/pmPositions/$marketId/holders/$holderId, 'yesBalance', getAfter(/pmPositions/$marketId/holders/$holderId).yesBalance - @newData.yesIn)"
    } }
  },
  "pmResolves/$marketId": {
    "onchain": true,
    "description": "Creator-only resolution record. Its existence closes trading. winningSupply (outstanding YES = seedSupply - yesSupply, or 0 on NO) is hook-derived and decremented by redemptions.",
    "fields": { "outcome": "String!", "winningSupply": "UInt?" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/pmMarkets/$marketId) != null && @user.address == get(/pmMarkets/$marketId).creator && @time.now >= get(/pmMarkets/$marketId).expiryTs && @time.now <= get(/pmMarkets/$marketId).expiryTs + get(/pmMarkets/$marketId).claimWindowSec && (@newData.outcome == 'YES' || @newData.outcome == 'NO') && @newData.winningSupply == null",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "((@newData.outcome == 'YES' && @DocumentPlugin.updateField(/pmResolves/$marketId, 'winningSupply', get(/pmMarkets/$marketId).seedSupply - get(/pmMarkets/$marketId).yesSupply)) || (@newData.outcome == 'NO' && @DocumentPlugin.updateField(/pmResolves/$marketId, 'winningSupply', 0)))"
    } }
  },
  "pmPositions/$marketId/holders/$holderId/redeems/$claimId": {
    "onchain": true,
    "description": "Durable redemption receipt. YES pays 1 collateral unit per share; NO zeroes the position. amount must be pinned exactly.",
    "operationDetails": { "create": "amount must equal the position's yesBalance on a YES outcome and 0 on NO. The claim window is expiryTs + claimWindowSec (no mutable resolvedAt: @time.now is not a hook mutation value)." },
    "fields": { "amount": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && $claimId == 'claim' && get(/pmMarkets/$marketId) != null && get(/pmResolves/$marketId) != null && @time.now <= get(/pmMarkets/$marketId).expiryTs + get(/pmMarkets/$marketId).claimWindowSec && get(/pmPositions/$marketId/holders/$holderId) != null && get(/pmPositions/$marketId/holders/$holderId).owner == @user.address && get(/pmPositions/$marketId/holders/$holderId).yesBalance > 0 && ((get(/pmResolves/$marketId).outcome == 'YES' && @newData.amount == get(/pmPositions/$marketId/holders/$holderId).yesBalance && get(/pmResolves/$marketId).winningSupply != null && get(/pmResolves/$marketId).winningSupply >= @newData.amount && @TokenPlugin.getBalance($marketId, @TokenPlugin.SOL) >= @newData.amount) || (get(/pmResolves/$marketId).outcome == 'NO' && @newData.amount == 0))",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "((get(/pmResolves/$marketId).outcome == 'YES' && @TokenPlugin.transfer($marketId, @user.address, @TokenPlugin.SOL, @newData.amount) && @DocumentPlugin.updateField(/pmMarkets/$marketId, 'collateralReserve', get(/pmMarkets/$marketId).collateralReserve - @newData.amount) && @DocumentPlugin.updateField(/pmResolves/$marketId, 'winningSupply', get(/pmResolves/$marketId).winningSupply - @newData.amount) && @DocumentPlugin.updateField(/pmPositions/$marketId/holders/$holderId, 'yesBalance', 0)) || (get(/pmResolves/$marketId).outcome == 'NO' && @DocumentPlugin.updateField(/pmPositions/$marketId/holders/$holderId, 'yesBalance', 0)))"
    } }
  },
  "pmWithdrawals/$marketId": {
    "onchain": true,
    "description": "Create-once creator sweep of the exact remaining reserve, after all winners redeem (winningSupply == 0) or the claim window closes.",
    "fields": { "amount": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/pmMarkets/$marketId) != null && @user.address == get(/pmMarkets/$marketId).creator && get(/pmResolves/$marketId) != null && get(/pmMarkets/$marketId).collateralReserve > 0 && @newData.amount == get(/pmMarkets/$marketId).collateralReserve && @TokenPlugin.getBalance($marketId, @TokenPlugin.SOL) >= @newData.amount && @time.now > get(/pmMarkets/$marketId).expiryTs + get(/pmMarkets/$marketId).claimWindowSec",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@TokenPlugin.transfer($marketId, @user.address, @TokenPlugin.SOL, @newData.amount) && @DocumentPlugin.updateField(/pmMarkets/$marketId, 'collateralReserve', 0)"
    } }
  }
}
```

## Operations

1. **Create market** - `pmMarkets/<marketId>` with `collateralReserve == yesSupply == seedSupply >= 0.01 SOL`, `creator` omitted. The hook idempotently creates the `<marketId>` named PDA and pulls the seed from the creator's wallet (user-signed), then stages `creator`.
2. **Open position** - `pmPositions/<marketId>/holders/<holderId>` with `yesBalance: 0`; the hook stages `owner`.
3. **Buy YES** - `.../buys/<orderId>` with `amountIn`. Hook: wallet -> pot transfer, reserve up, pool `yesSupply` down by the floored quote, position up by the same quote (all `get()` reads are consistent pre-state).
4. **Sell YES** - `.../sells/<orderId>` with `yesIn`; pot -> wallet at the floored `getCollateralOutAmm` quote (program-signed source).
5. **Resolve** - `pmResolves/<marketId>` by the creator with `outcome` `'YES'` or `'NO'`; the hook stages `winningSupply`. Trading is closed from this write on.
6. **Redeem** - `.../redeems/<claimId>` with `amount` pinned to the position balance (YES) or 0 (NO); pays 1 collateral unit per share and zeroes the position.
7. **Creator sweep** - `pmWithdrawals/<marketId>` with `amount` pinned to the exact remaining reserve.

## Why it holds

- **Physical fund isolation.** Collateral lives in the per-market named PDA `$marketId` (raw id as source and destination, never `getAccountAddress` in a signer position). A hook for market A structurally cannot name market B's pot. Ids must not parse as a pubkey and the namespace is app-global; this is the only collection minting account ids here.
- **Solvent 1:1 redemption.** Quotes round down, so the product `x*y` never decreases; with equal seeding (`x0 = y0 = seed`), `x >= seed^2/y >= 2*seed - y`, i.e. reserve always covers outstanding YES (`seedSupply - yesSupply`) at 1 unit per share - `(seed - y)^2 >= 0`. `winningSupply` accounting plus the `getBalance` gate stops over-redemption even so.
- **Clients cannot forge state.** `update`/`delete` are `false` everywhere; reserves and balances move only via hook-staged `updateField`. Hook-derived fields (`creator`, `owner`, `winningSupply`) must be `null`/omitted at create, so a caller cannot inject them.
- **No trading after resolution.** Buys, sells, and position opens all require `get(/pmResolves/$marketId) == null`; the resolution document is create-once.
- **One redeem per position, by construction.** The redeem id is pinned to the literal `claim`, so a duplicate redeem - even bundled in the same atomic batch - targets the same path, becomes an update, and is denied by `update: "false"`. The sweep is likewise a create-once document pinned to the reserve.
- **Batched sells read post-batch state.** The sell rule's balance gate and quote, and the sell hook, read with `getAfter` rather than `get`. So a second sell for the same position bundled in one `setMany` sees the first sell's staged balance and reserve decrements: if the two together over-spend the position, the second fails its `getAfter` balance gate, and because `setMany` is atomic the whole batch reverts. A `get()` here reads committed pre-batch state, so both sells would pass against the same balance and each stage a full payout - one position sold twice. The pinned redeem is protected differently: its id is the literal `claim`, so a duplicate becomes an update and is denied by `update: "false"`. Rule of thumb when adapting this policy: if two writes in one batch could both spend the same balance, read it with `getAfter`, not `get` - and do not weaken the pinned-id pattern either.
- **Trust boundary.** The creator is the oracle, but the *timing* is fixed by the market, not the creator. Resolution is accepted only once expiry has passed and before the claim window closes (`@time.now >= expiryTs && @time.now <= expiryTs + claimWindowSec`), so a market cannot be resolved early against its only trader, nor resolved so late that it time-bars redemptions. The creator sweep requires the claim window to have fully closed (`@time.now > expiryTs + claimWindowSec`), regardless of winning supply - so a zero-winner resolution cannot race a live market to the reserve. A creator who never resolves within that window strands the pot permanently (redeem and sweep both require the resolution document) - add a refund path if that risk is unacceptable. Do not drop the expiry gate to make local testing easier: it is exactly what stops resolve-early-and-sweep.

## Related

- [policy-primitives.md](../policy-primitives.md) - AMM quote rounding, staged `updateField` contract, `get`/`getAfter`
- [custody-and-pdas.md](../custody-and-pdas.md) - named-PDA custody, account-id hygiene, balance-gated payouts
- [plugins/PredictionMarketPlugin.md](../plugins/PredictionMarketPlugin.md) - quote function contracts
- [solana-capability-status.md](../solana-capability-status.md) - live support state of every function used here
