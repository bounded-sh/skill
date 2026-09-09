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

Use the treasury's named account id as `source` when it is the mint's withdrawal authority.
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

OpenApps supplies its sealed mint and fixed treasury policy binding to the generic Bounded collector.
Its brain's `collect_token_fees` tool supplies a maximum Bounded credit spend.
Collection needs no holder proposal because it only consolidates funds already owed to the fixed treasury.
The credit payer still requires authenticated authorization; a permissionless onchain trigger does not authorize spending someone else's Bounded credits.

Bounded quotes measured transaction batches and applies a separately adjustable collection markup to raw gas plus declared provider and infrastructure work allowances.
It does not charge a percentage of token value.
The quote varies with account count, policy overhead and network costs, and execution stays within the authorized ceiling.
Poofnet uses simulated token fees and policy execution with infrastructure billing; it does not invent real-network gas charges.

Show held tokens and pending claims separately in the treasury breakdown.
An estimated total can include both, but pending claims are neither spendable tokens nor USDC operating cash.
Collection changes pending tokens into held tokens without creating new treasury value.
Token conversion and app spending remain separate, policy-governed actions.
