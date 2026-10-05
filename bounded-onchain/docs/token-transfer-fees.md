# Token-2022 transfer-fee collection

A Token-2022 transfer fee is withheld in the receiving token account.
That includes ordinary wallet token accounts and compatible pool vaults.
It is separate from a pool's swap fee and is not a spendable treasury balance until collected.

## Authority and destination

Set the mint's withdrawal authority to the treasury's named Bounded PDA.
A PDA has no private key.
The transaction payer signs the outer Solana transaction, and the Bounded program signs for its PDA only while executing an allowed policy hook.
Bound the mint, source authority and destination in that policy.
If every allowed collection sends only to Treasury, the trigger may be permissionless without giving its caller control of the funds.
Do not accept an arbitrary withdrawal destination from the caller.

The registered generic CPI collection primitives are:

- `@CPI.token2022RevokeFeeAuthority(source, mint)` removes the authority to change the transfer-fee rate.
- `@CPI.token2022HarvestFees(source, mint, accounts)` harvests a pipe-separated list of actual token-account addresses into the mint accumulator.
- `@CPI.token2022WithdrawMintFees(source, mint)` withdraws the mint accumulator into the source authority's Token-2022 associated token account.
- `@CPI.token2022WithdrawMintFeesTo(source, mint, recipient)` withdraws the mint accumulator into the recipient's Token-2022 associated token account while `source` signs as the withdrawal authority.

Prefer a dedicated named account as the mint's withdrawal authority and `token2022WithdrawMintFeesTo` with the treasury as `recipient`.
The authority then holds nothing and can only move withheld tax, and the treasury never signs a fee withdrawal, including the withdrawals that run inside user transactions such as fee-neutral staking.
Use the treasury's own named account id as `source` only when it is itself the withdrawal authority; the self-paying variant sends the fees to whoever signs.

`@TokenPlugin.withdrawWithheldTokens(mint, authority, receiverOwner, sourceOwner)` withdraws one account's withheld fees to any owner's associated token account, and with `sourceOwner == receiverOwner` it converts an account's own withheld fees back into its spendable balance.
That is how a fee-neutral payout works: sweep the receiver's older fees to the treasury, transfer exactly the amount, convert the fee that transfer withheld back in place, and refuse unless the receiver landed exactly at its prior balance plus the amount.
These are mutating onchain hook calls; confirm their exact signatures and target-environment availability in the [plugin catalog](plugins.md).
A harvest by another caller does not change the withdrawal authority.
An already-empty source, or one that closed between discovery and execution, must not invalidate an otherwise valid harvest.
Mint, authority, destination and arithmetic failures remain errors.
Skip harvesting for an empty source list and still allow withdrawal of fees already in the mint.

## Inventory and transaction planning

Discover actual Token-2022 accounts for the mint, including non-ATA pool vaults, and read their withheld-fee extensions.
Wallet-owner asset listings alone do not provide that complete inventory.
Add the mint's withheld accumulator and guard against a harvest racing the scan, so the same fees are not counted twice.
Publish the observation time and distinguish unavailable inventory from a verified zero.

Batch from the complete serialized transaction, including policy accounts, payer, authority, mint, destination, programs and any ATA creation.
On a v1-enabled cluster the packet can hold 4096 bytes, but the complete transaction still has a 64-account limit.
The number of source accounts is therefore less than 64 and varies with policy overhead.
Construct and measure before signing, then retain the exact signed transaction and receipt for retry reconciliation.
Rebuilding and signing a second transaction after an uncertain response can collect twice or bill twice.

## Managed OpenApps usage

The OpenApps venue policy fixes the sealed mint, the fee-authority PDA that signs the withdrawal, and the app's treasury as the only destination.
Collection opens once the app is Open (its token sale graduated) and its trading pool exists, for a token whose sealed launch selects `transfer-fee-v1`.
From then on any signed-in wallet can create a collection batch, and the caller chooses no recipient, amount or credit payer.
Collection needs no holder proposal because it only consolidates funds already owed to the fixed treasury.

The app's own agent collects with its `collect_token_fees` action, and names only a credit ceiling: the most the collection may charge the app's own Bounded credits, from 1 to 100,000,000 microUSD ($100).
Bounded's collector finds the accounts holding the fees, sends the transactions, and charges what they cost to the app's credits, never more than that ceiling; a collection that would cost more collects and charges nothing (`token_fee_credit_ceiling_exceeded`).
The action is refused with `token_fees_open_only` while the app is Owned or on sale.
A collection through the generic Bounded collector always has an authenticated credit payer; a permissionless onchain trigger does not authorize spending someone else's Bounded credits.

Bounded quotes measured transaction batches and applies a separately adjustable collection markup to raw gas plus declared provider and infrastructure work allowances.
It does not charge a percentage of token value.
The quote varies with account count, policy overhead and network costs, and execution stays within the authorized ceiling.
Poofnet uses simulated token fees and policy execution with infrastructure billing; it does not invent real-network gas charges.

Show held tokens and pending claims separately in the treasury breakdown.
An estimated total can include both, but pending claims are neither spendable tokens nor USDC operating cash.
Collection changes pending tokens into held tokens without creating new treasury value.
Token conversion and app spending remain separate, policy-governed actions.
