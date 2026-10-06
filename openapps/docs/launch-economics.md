# Launch economics

Openings whose sealed head selects `transfer-fee-v1` use a CCA with 65% Treasury / 30% initial liquidity / 2.5% creator / 2.5% OpenApps allocations in USDC.
New mainnet sales have a 10,000 USDC minimum, plus the requirement to retain six months of baseline operating costs after setup costs, assuming no future trading revenue.
The effective minimum is the larger of the venue's configured minimum and the amount needed for that reserve.
Sale minimums, minimum order amounts, bidding duration, and the opening countdown are configured per venue and sealed when a sale is scheduled.
The current mainnet settings are 10,000 USDC minimum raised, 50 USDC minimum per order, 30 minutes of bidding, and a 60-second opening countdown.
A Devnet test venue can use smaller amounts, such as 100 USDC raised and 1 USDC per order, without the real-money operating reserve requirement.
Always read the actual sale terms rather than assuming the settings of another venue.
The app token's transfer fee belongs entirely to Treasury in app tokens: 1% unless the owner set another rate, from 0% to 5% (`transferFeeBps`), when asking to open.
The canonical DAMM v2 pool has a separate fixed 0.5% USDC fee with OnlyB and dynamic fees disabled.
After Meteora's 20% protocol share, actual net receipts of the designated launch position split 50% creator / 50% OpenApps.
Additional app positions earn for the app, and product revenue belongs entirely to the app.
Existing launches retain their sealed model.
Accrued transfer fees appear as pending token claims; they are not spendable USDC or prepaid Bounded credits.
The treasury policy fixes the withdrawal authority and destination; Bounded supplies collection infrastructure, transaction signing and credit billing.
On an Open app the agent collects them into the treasury with its `collect_token_fees` action, without a holder proposal, and chooses only the most the collection may charge the app's credits.
Holder-governed reserve conversions target six months of baseline USDC expenses and start below three months by default.

See [token transfer fees](../../bounded-onchain/docs/token-transfer-fees.md) for collection and pending balances.

## Bidding and completion

The opening countdown starts after existing backings have converted successfully into auction orders.
The owner can reserve the first 1/24 of the bidding window for those backers, as described in [the lifecycle](lifecycle.md#backing-before-the-sale).
The policy allows early orders with longer countdowns until one hour before bidding opens, subject to that backer reservation.
The normal 60-second countdown has no early-order period.

In **Your funding**, **Add funds** creates another order at the existing order's market-cap limit; it does not rewrite an order that already has fills.
For example, adding 50 USDC to a 100 USDC order produces two orders at that limit.
**Change limit** updates the limit for the original order's unfilled balance and preserves what it has already bought.
Neither action is available after bidding closes.

Once bidding has closed and the raise and Gauntlet requirements are satisfied, launch completion creates the token, creates the pool, and transfers the creator allocation and venue fee.
Meteora creates the pool; the separate payout step completes the sale's creator and venue allocations.
The platform progresses these steps automatically, and a recovery control can resume an interrupted completion.

## Operating credits and the treasury

The agent's runs spend the app's prepaid Bounded credits.
When the credits run short before a run, the platform tops them up from the treasury's USDC, within the agent's per-run and daily AI limits.
The top-up draws only USDC; the host credits only a verified USDC transfer.
Devnet test tokens cannot buy Bounded credits, and Devnet venues do not offer mainnet swaps, perps, or real-money top-ups.
A treasury that holds SOL can also convert it automatically, but only after the owner turns on "Convert SOL for credit top-ups" on the treasury page; it is off by default.
The conversion exists only to fund that credit top-up: it cannot pay for anything else, and it does not change treasury swap proposals, withdrawals or payouts.
With it on, a top-up that needs more USDC than the treasury holds first sells SOL for the shortfall as a separate step, and the top-up draws only after that sale has landed.
While the sale is still landing the run starts on the credits it already has, and the next run draws the converted USDC.
Each sale is at least $5 of SOL (a smaller shortfall still sells $5, and the surplus stays in the treasury as USDC), unless all the SOL above the floor is worth less, in which case it sells all of it.
The venue policy bounds every conversion: at most 0.5 SOL per UTC day, at most 1% slippage, never under 0.01 SOL, always keeping 0.01 SOL in the treasury, never asking for more than 3% over the larger of the shortfall and $5, and never at a price under $50 per SOL.
No proposal is needed for a conversion.
A conversion that fails leaves the top-up drawing the USDC the treasury has, and no conversion is tried for that app for the next hour.
App tokens are never sold for a credit top-up; the holder-governed reserve conversion stays a separate policy.
Once a launch head exists, only the venue's governance can change the switch.
Read the switch, today's remaining SOL allowance and the latest conversion from the treasury read the agent already has; no agent tool, proposal or data script can start a conversion or write the switch.
