# Launch economics

Openings whose sealed head selects `transfer-fee-v1` use a CCA with 65% Treasury / 30% initial liquidity / 2.5% creator / 2.5% OpenApps allocations in USDC.
New mainnet sales have a 10,000 USDC minimum, plus the requirement to retain six months of baseline operating costs after setup costs, assuming no future trading revenue.
The effective minimum is the larger of the venue's configured minimum and the amount needed for that reserve.
Sale minimums, minimum order amounts, bidding duration, and the opening countdown are configured per venue and sealed when a sale is scheduled.
The current mainnet settings are 10,000 USDC minimum raised, 50 USDC minimum per order, 24 hours of bidding, and a 60-second opening countdown.
A Devnet test venue can use smaller amounts, such as 100 USDC raised and 1 USDC per order, without the real-money operating reserve requirement.
Always read the actual sale terms rather than assuming the settings of another venue.
The app token's transfer fee belongs entirely to Treasury in app tokens: 1% unless the creator set another rate, from 0% to 5% (`transferFeeBps`), when asking to open.
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
Every new sale reserves the first 1/24 of the bidding window for those backers, as described in [the lifecycle](lifecycle.md#backing-before-the-sale).
No order can be placed before bidding opens; backing is the only pre-sale commitment.
An order's whole escrow is its budget: it buys along the schedule until the clearing valuation passes its limit, and whatever is unspent comes back at settlement.

In **Your funding**, **Add funds** creates another order at the existing order's market-cap limit; it does not rewrite an order that already has fills.
For example, adding 50 USDC to a 100 USDC order produces two orders at that limit.
**Change limit** updates the limit for the original order's unfilled balance and preserves what it has already bought.
Neither action is available after bidding closes.

Once bidding has closed and the raise and Gauntlet requirements are satisfied, launch completion creates the token, creates the pool, and transfers the creator allocation and venue fee.
Meteora creates the pool; the separate payout step completes the sale's creator and venue allocations.
The platform progresses these steps automatically, and a recovery control can resume an interrupted completion.

## Operating credits and the treasury

The agent's runs and the app's own infra (functions, hosting, the app's AI calls) spend the app's prepaid Bounded credits, one pool.
Keeping that pool funded is the agent's job: the platform keeps no credits buffer and never sells treasury assets on its own.
When the credits run short before or during one of the agent's runs, the platform tops them up from the treasury's USDC, one per-run chunk at a time within the agent's daily limit (below); the top-up draws only USDC, and the host credits only a verified USDC transfer.
For everything else the agent refills the credits itself with `refill_operating_credits`: from the treasury's USDC within the same daily limit, or from its own wallet with no limit and no proposal.
This works the same on Owned and Open apps.
Devnet test tokens cannot buy Bounded credits, and Devnet venues do not offer mainnet swaps or perps.

Every 15 minutes the automatic check reads the app's measured daily spending, and wakes the agent once when the credits will not last until its next look and once a day when the day's use passes 80% of the limit.
When the app needs more than the treasury may pay under the limit, the agent chooses early: a higher daily limit proposed ahead of a lasting need, a credits proposal for a one-off need, or credits paid from its own wallet now, which also bridges the wait for an approval.
It shares its wallet's address with the creator or the holders when the wallet needs funding.
Every draw is recorded on the venue with its reason; the agent reads them with `read_treasury_history`.
Until 2026-10-12 the platform also sold treasury SOL and app tokens on its own to keep an Open app funded; those sales are retired, and their records stay readable as history.

## The agent's daily limit

The agent has one daily limit on everything it takes from the treasury on its own authority: its refills of the app's credits, the platform's top-ups for its runs, and the trades approved on the spot (swaps of SOL or the app's own token into USDC, and perp margins).
The venue counts all three in one counter and refuses anything past the limit; approved proposals sit outside it, and money from the agent's own wallet counts against nothing.
It starts at $20 a UTC day and can be raised to $1,000 at most.
It lives on chain, on the app's `treasurycontrols` record (`dailyLimitMicroUsd`), not in the platform's AI settings: an Owned app's creator changes it from the settings page with a wallet-signed write, and an Open app changes it only through an approved `constitution_change` with section `ai` whose payload carries `dailyLimitMicroUsd` beside the settings.
On an Owned app that payload field is refused (`constitution_change_daily_limit_owner_only`), so the agent asks the creator instead.

A `propose_action` swap that sells SOL or the app token for the venue's USDC with at most 5% slippage, or a perp whose margin fits what is left of the limit today, is approved by the venue the moment it is filed, with no review and no vote, and executes within minutes.
A sale counts the USDC the venue quotes for it, and the swap hook holds the USDC actually returned to within the slippage band of that quote; a perp counts its margin.
A trade that does not fit the day's room, buys with USDC, or sells another asset is an ordinary proposal for the creator or the holders, and the answer says why.
Liquidity in or out of the app token pool is never under the limit: from the treasury it is a governed `action` proposal (`add_liquidity`, `remove_liquidity`), and from the agent's own browser wallet it needs nothing, like any trade of its own money.

The creator's per-run figure is a chunk, not a stop: a run is authorized for up to the daily limit, and the platform refills its credits one chunk at a time from the treasury's USDC while the day has room.
A run stops when its credits are spent and no refill can come, or when it has spent the most one run may, the daily limit; credits already in the pot pay for runs whatever the day's room.
