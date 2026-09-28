# Launch economics

Openings whose sealed head selects `transfer-fee-v1` use a CCA with 65% Treasury / 30% initial liquidity / 2.5% creator / 2.5% OpenApps allocations in USDC.
The minimum is $5,000 plus the requirement to retain six months of baseline operating costs after setup costs, assuming no future trading revenue.
The app token's fixed 1% transfer fee belongs entirely to Treasury in app tokens.
The canonical DAMM v2 pool has a separate fixed 0.5% USDC fee with OnlyB and dynamic fees disabled.
After Meteora's 20% protocol share, actual net receipts of the designated launch position split 50% creator / 50% OpenApps.
Additional app positions earn for the app, and product revenue belongs entirely to the app.
Existing launches retain their sealed model.
Accrued transfer fees appear as pending token claims; they are not spendable USDC or prepaid Bounded credits.
The managed brain can request fee collection with a credit ceiling without a holder proposal.
The treasury policy fixes the withdrawal authority and destination; Bounded supplies collection infrastructure, transaction signing and credit billing.
Holder-governed reserve conversions target six months of baseline USDC expenses and start below three months by default.

See [token transfer fees](../../bounded-onchain/docs/token-transfer-fees.md) for collection and pending balances.

## Operating credits and the treasury

The agent's runs spend the app's prepaid Bounded credits.
When the credits run short before a run, the platform tops them up from the treasury's USDC, within the owner's per-run and daily AI limits.
The top-up draws only USDC; the host credits only a verified USDC transfer.
A treasury that holds SOL can also convert it automatically, but only after the owner turns on "Convert SOL for credit top-ups" on the treasury page; it is off by default.
The conversion exists only to fund that credit top-up: it cannot pay for anything else, and it does not change treasury swap proposals, withdrawals or payouts.
With it on, a top-up that needs more USDC than the treasury holds first sells SOL for the shortfall as a separate step, and the top-up draws only after that sale has landed.
While the sale is still landing the run starts on the credits it already has, and the next run draws the converted USDC.
Each sale is at least $5 of SOL (a smaller shortfall still sells $5, and the surplus stays in the treasury as USDC), unless all the SOL above the floor is worth less, in which case it sells all of it.
The venue policy bounds every conversion: at most 0.5 SOL per UTC day, at most 1% slippage, never under 0.01 SOL, always keeping 0.01 SOL in the treasury, never asking for more than 3% over the larger of the shortfall and $5, and never at a price under $50 per SOL.
No proposal is needed for a conversion, and one that is never attempted leaves the top-up drawing only the USDC the treasury has.
Once a launch head exists, only the venue's governance can change the switch.
Read the switch, today's remaining SOL allowance and the latest conversion from the treasury read the agent already has; no agent tool, proposal or data script can start a conversion or write the switch.

## Legacy launches

The following terms describe legacy launches without `transfer-fee-v1`, not the transfer-fee model.
The sale is a 24h continuous clearing auction of 65% of supply: each bid pays 3% admission plus the launch's gauntlet fee (0.9% by default), win or lose, and escrows the rest.
The gauntlet fee is the one rate that can differ per launch: the operator may waive it to 0% while the sale still has zero demand, which zeroes the per-bid fee (the gauntlet then runs on fuel top-ups, and a failed sale refunds 100%).
The waiver is one-way and steward-only - a creator cannot set it, and it is never raised.
At settlement the raise pays out of escrow in a fixed waterfall: 3% creator, 2% OpenApps, 30% locked liquidity, and the remainder to the app reserve; the gauntlet draw and fuel tank legs exist in the waterfall but are set to 0% in the current terms.
Pool trading fees are 1% flat; claimed launch-token units split 50% app reserve escrow, 20% founding creator, 20% steward, and the remainder to the venue.
