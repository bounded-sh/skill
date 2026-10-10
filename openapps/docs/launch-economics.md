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
On an Open app the platform may also sell the app's own token automatically for USDC, under the holders' daily token cap and slippage cap, only to keep the app's credits funded (see Operating credits and the treasury below).

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

The agent's runs and the app's own infra (functions, hosting, the app's AI calls) spend the app's prepaid Bounded credits, one pool.
When the credits run short before a run, the platform tops them up from the treasury's USDC, within the agent's per-run and daily AI limits; the top-up draws only USDC, and the host credits only a verified USDC transfer.
A treasury short of USDC sells about $10 of SOL first, as a separate step, and the top-up draws only after that sale has landed; while the sale is still landing the run starts on the credits it already has, and the next run draws the converted USDC.
This is always on: no owner switch and no proposal is needed, and it works the same on Owned and Open apps.
Devnet test tokens cannot buy Bounded credits, and Devnet venues do not offer mainnet swaps, perps, or automatic SOL or token sales.

On an Open app the platform also keeps the app itself funded, every 15 minutes, with the same ladder.
It tops the credits up to a buffer sized from the app's measured daily spending (today's rate when it runs higher, or a floor before any day was measured) and keeps seven days of that spending as USDC in the treasury, drawing USDC first, then selling about $10 of SOL, then about $10 of the app's own token while the holders' reserve is on, under their daily token cap and slippage cap, never tokens owed to sale bidders, and never two token sales within an hour.
Automatic draws never exceed half the treasury's value in a UTC day.
Past that guard, or once nothing the platform may sell is left, the agent is woken to decide: a holder-governed swap proposal, less spending, or a word to the holders.
The venue policy bounds every conversion: at most 1% slippage on SOL and the holders' cap on tokens, never under 0.01 SOL, always keeping 0.01 SOL in the treasury, never asking for more than 3% over the $10 chunk, and never at a SOL price under $50.
A conversion that fails leaves the draw taking the USDC the treasury has, and no conversion on that lane is tried for that app for the next hour.
Every draw and conversion is recorded on the venue with its reason and no onchain receipt account; the agent reads them with `read_treasury_history`, and no agent tool, proposal or data script can start a conversion.
