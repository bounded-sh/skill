# Launch economics

A successful CCA sale allocates 5% of the net USDC raise according to the app's fee split, which locks when the sale starts.
Direct Meteora launches deposit 30% into the pool.
Meteora curve launches buy the tokens bidders won within that same 30% budget.
On a venue with the v11 Pump launch policy, Pump also buys only the tokens bidders won within 30%, leaving at least 65% in Treasury.
Pump's opening price follows that purchase, and its minimum raise must cover the advertised bidder-token purchase within the launch budget.
Both launch choices use the venue's fundraising target unless an operator sets a sale-specific minimum before Start; Pump's purchase requirement still sets a lower bound.
Starting a sale does not require six months of operating funds or an upfront creator deposit.
Read the minimum, bidding window and other terms from the sale before bidding.
A direct Meteora token can charge the transfer fee set when requesting the Autonomous Public Offering (APO) (0% to 5%, default 1%); Pump and Meteora curve launches have no token transfer fee.
Collected transfer fees and fees from the designated Meteora launch position follow the app's fee split.
Additional app positions earn entirely for the app.
Existing launches retain their sealed model.
Accrued transfer fees appear as pending token claims; they are not spendable USDC or prepaid Bounded credits.
The treasury policy fixes the withdrawal authority and destination; Bounded supplies collection infrastructure, transaction signing and credit billing.
On a publicly owned app the agent collects them into the treasury with its `collect_token_fees` action, without a holder proposal, and chooses only the most the collection may charge the app's credits.

See [token transfer fees](../../bounded-onchain/docs/token-transfer-fees.md) for collection and pending balances.

## Bidding and completion

The opening countdown starts after existing backings have converted successfully into auction orders.
Every new sale reserves the first 1/24 of the bidding window for those backers, as described in [the lifecycle](lifecycle.md#backing-before-the-sale).
No order can be placed before bidding opens, and an order cannot be cancelled.
An order is an amount of USDC with an optional maximum market cap, and its whole escrow buys along the schedule.
Without a maximum it buys until bidding closes; with one, it stops buying once the clearing market cap passes it.
Whatever an order does not spend comes back at settlement.
An order without a maximum sits at the top of the sale's price grid; when all 512 price levels are in use it joins the highest level in use instead, and the funding form names that maximum.
When a checkpoint moves the clearing market cap past an order's maximum, the sale page and the app's notification bell say the order stopped at its maximum, and a wallet that keeps sale emails on is emailed from the app's own mailbox.

In **Your funding**, **Add funds** creates another order with the existing order's maximum; it does not rewrite an order that already has fills.
For example, adding 50 USDC to a 100 USDC order produces two orders with that maximum.
**Set maximum** or **Change maximum** applies to the original order's unfilled balance and preserves what it has already bought; leaving it empty removes the maximum, so the rest buys until bidding closes.
Neither action is available after bidding closes.

Once bidding has closed and the raise and Gauntlet requirements are satisfied, launch completion creates the token, creates the pool, and transfers the creator allocation and venue fee.
Meteora creates the pool; the separate payout step completes the sale's creator and venue allocations.
The platform progresses these steps automatically, and a recovery control can resume an interrupted completion.

## Operating credits and the treasury

The agent's runs and the app's own infra (functions, hosting, the app's AI calls) spend the app's prepaid Bounded credits, one pool.
Keeping that pool funded is the agent's job: the platform keeps no credits buffer and never sells treasury assets on its own.
When the credits run short before or during one of the agent's runs, the platform tops them up from the treasury's USDC, one per-run chunk at a time within the agent's daily limit (below); the top-up draws only USDC, and the host credits only a verified USDC transfer.
For everything else the agent refills the credits itself with `refill_operating_credits`: from the treasury's USDC within the same daily limit, or from its own wallet with no limit and no proposal.
This works the same on Owned and publicly owned apps.
Devnet test tokens cannot buy Bounded credits, and Devnet venues do not offer mainnet swaps or perps.

Every 15 minutes the automatic check reads the app's measured daily spending, and wakes the agent once when the credits will not last until its next look and once a day when the day's use passes 80% of the limit.
When the app needs more than the treasury may pay under the limit, the agent chooses early: a higher daily limit proposed ahead of a lasting need, a credits proposal for a one-off need, or credits paid from its own wallet now, which also bridges the wait for an approval.
It shares its wallet's address with the creator or the holders when the wallet needs funding.
Every draw is recorded on the venue with its reason; the agent reads them with `read_treasury_history`.
Until 2026-10-12 the platform also sold treasury SOL and app tokens on its own to keep a publicly owned app funded; those sales are retired, and their records stay readable as history.

## The agent's daily limit

The agent has one daily limit on everything it takes from the treasury on its own authority: its refills of the app's credits, the platform's top-ups for its runs, and the trades approved on the spot (swaps of SOL or the app's own token into USDC, and perp margins).
The venue counts all three in one counter and refuses anything past the limit; approved proposals sit outside it, and money from the agent's own wallet counts against nothing.
It starts at $20 a UTC day and can be raised to $1,000 at most.
It lives on chain, on the app's `treasurycontrols` record (`dailyLimitMicroUsd`), not in the platform's AI settings: an Owned app's creator changes it from the settings page with a wallet-signed write, and a publicly owned app changes it only through an approved `constitution_change` with section `ai` whose payload carries `dailyLimitMicroUsd` beside the settings.
On an Owned app that payload field is refused (`constitution_change_daily_limit_owner_only`), so the agent asks the creator instead.

A `propose_action` swap that sells SOL or the app token for the venue's USDC with at most 5% slippage, or a perp whose margin fits what is left of the limit today, is approved by the venue the moment it is filed, with no review and no vote, and executes within minutes.
A sale counts the USDC the venue quotes for it, and the swap hook holds the USDC actually returned to within the slippage band of that quote; a perp counts its margin.
A trade that does not fit the day's room, buys with USDC, or sells another asset is an ordinary proposal for the creator or the holders, and the answer says why.
Liquidity in or out of the app token pool is never under the limit: from the treasury it is a governed `action` proposal (`add_liquidity`, `remove_liquidity`), and from the agent's own browser wallet it needs nothing, like any trade of its own money.

The creator's per-run figure is a chunk, not a stop: a run is authorized for up to the daily limit, and the platform refills its credits one chunk at a time from the treasury's USDC while the day has room.
A run stops when its credits are spent and no refill can come, or when it has spent the most one run may, the daily limit; credits already in the pot pay for runs whatever the day's room.
