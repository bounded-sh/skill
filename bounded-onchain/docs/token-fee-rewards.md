# Token transfer fees and holder rewards

Use Token-2022 transfer fees when a consumer app needs a fee on transfers across compatible venues, including ordinary wallet transfers.
These are token-level fees, separate from a DEX's trading fee and from locking liquidity against withdrawal.

## Creation and authority boundaries

`@TokenPlugin.createToken2022(tokenId, name, symbol, uri, decimals, extensions)` supports `feeBasisPoints`, `maxFee`, `transferFeeAuthority`, and `withdrawWithheldAuthority`.
Use an app-controlled named account for collection, and pin the rate and cap in policy rather than accepting them in every collection request.
The existing constructor requires a fee-config authority; setting it to the app account does not itself make the rate immutable.

`@CPI.token2022RevokeFeeAuthority(source, mint)` revokes that authority permanently.
It preserves the already configured current and scheduled rates and the separate withdrawal authority.
Calling it again fails; use a create-only policy operation if retries should not repeat it.
It does not revoke minting or freeze authority, seal metadata, or make the policy itself immutable.
Fee sealing does not certify every extension or issuer permission on an arbitrary quote token; pin reviewed assets separately.
Source accepts the current authority's wallet, app escrow sentinel, or named account.

### Fixed supply (runtime v7, not deployed)

`@TokenPlugin.revokeMintAuthority(tokenId, name, symbol)` removes the authority used to mint a Bounded-created SPL or Token-2022 token.
Mint the intended supply first, then seal it in the same launch hook.
It accepts the exact creation arguments and uses the existing `getTokenMintAddress(tokenId, name, symbol)` derivation.
It requires the canonical 24-character lowercase-hex platform app ID and cannot revoke an unrelated external mint's authority.
Manually provisioned noncanonical legacy app namespaces are unsupported; do not claim isolation across arbitrary administrator-created prefix aliases.
Further minting, including a zero amount, and repeated revocation fail; transfers and burns remain possible.
This does not revoke metadata or transfer-fee authorities, so fee configuration needs its separate sealing operation.

The source compiler gates this operation to runtime v7; devnet and mainnet currently remain recorded at v6.
Do not deploy a recipe using it until the serving runtime supports it.
Legacy token seeds concatenate the identifier, name, and symbol without separators, so their tuple boundaries are not collision-resistant.
Pin creation metadata and identifiers in policy rather than treating different text partitions as separate token identities.

## Collection

Fees initially accumulate on receiving token accounts.
`@TokenPlugin.withdrawWithheldTokens(mint, authority, receiverOwner, sourceOwner)` collects from an individual source account.

A consumer can permissionlessly harvest fees from token accounts into the mint with the SPL Token SDK.
`@CPI.token2022WithdrawMintFees(source, mint)` then withdraws that mint accumulator into the withdrawal authority's own associated token account, creating it if needed.
This operation succeeds with zero fees, but never redirects funds to a caller-selected recipient.
It returns Bool, not the amount collected; use actual before/after balances for accounting.
The source must match the mint's withdraw-withheld authority even when the accumulator is zero.

The new descriptor functions are cataloged as live-unverified.
Check the capability status and the serving function contract before relying on them in a deployed app.

## Consumer-owned rewards

Holder indexing and reward calculations belong in the consumer backend function.
Use Helius or another indexer to discover token accounts, aggregate balances by owner, apply exclusions, and compute the allocation.
Bounded does not require staking or a transfer hook to implement this pattern.

Use ordinary policy collections and transfers to authorize the allocation, cap payouts by the funded pot, and reject duplicate payout identifiers.
A Merkle distributor is an optional scaling choice, not a prerequisite.
A Merkle proof verifies inclusion in a committed allocation, not the accuracy of the indexer's holder data.

Collected fees remain denominated in the launched token.
If holders receive another asset, convert first and allocate the actual net proceeds.
Include transfer taxes and output bounds in trade accounting, and persist the transaction outcome before retrying a payout or buyback.
Keep principal, holder fees, and platform income in separate named accounts when their spending rules differ.

### Record actual proceeds inside the transaction

Use optional receipt fields `balanceBefore: "UInt?"` and `received: "UInt?"` on a create-only operation document.
The hook writes both values itself, so caller-supplied receipt values cannot determine the amount moved.
This authoring helper wraps a collection or swap expression using ordinary policy operations:

```js
const quote = JSON.stringify;
function captureProceeds(path, mint, effect) {
  return `@DocumentPlugin.updateField(${path}, "balanceBefore", ` +
    `@TokenPlugin.getBalance(@contract.address, ${quote(mint)})) && ` +
    `(${effect}) && ` +
    `@DocumentPlugin.updateField(${path}, "received", ` +
    `@TokenPlugin.getBalance(@contract.address, ${quote(mint)}) - ` +
    `getAfter(${path}).balanceBefore)`;
}
```

For collection, wrap `@CPI.token2022WithdrawMintFees(@contract.address, "MINT")` and measure that mint.
For conversion, wrap the generated swap expression and measure its output mint.
Only use an author-controlled collection path and expression in this helper.

To pay all newly received quote proceeds in the same transaction, append:

```text
&& @TokenPlugin.transfer(@contract.address, "FIXED_RECIPIENT", "QUOTE_MINT", getAfter(/payouts/$id).received)
```

Require the authorized allocator in the create rule, bind `$id` to the intended one-use allocation, and forbid updates and deletion of the operation record.
Before conversion, require its fixed input amount to be within the recorded fee receipt assigned to that allocation.
A replay must reuse the same operation ID; a fresh ID is a new authorization decision, not retry recovery.
For multiple payouts from one receipt, the consumer must maintain a reservation/debit ledger or commit the complete allocation; a per-payment ID alone does not prevent oversubscribing that receipt.
This pattern has local-validator coverage for one bounded conversion and payout, exact received-amount accounting, and duplicate/alternate-ID refusal.
The recipient and allocation remain consumer choices.

For a buyback, measure the purchased mint and append a burn of that receipt:

```text
&& @TokenPlugin.burn(@contract.address, "PURCHASED_MINT", getAfter(/buybacks/$id).received)
```

This preserves any token inventory the treasury held before the swap.
Bind the input budget, output mint, net-output floor, deadline, and one-use operation ID in the authorized policy.
The integrated CPMM validator scenario passes in both mint orderings: it preserves preexisting treasury inventory, reduces supply by the exact net receipt, spends the fixed input, and rejects replay of the operation ID.

## Liquidity and upgrades

A transfer fee does not prevent a liquidity provider from withdrawing their position or competitors from creating another pool.
A permanent liquidity lock requires the venue's actual lock operation.
The experimental [Raydium policy authoring tool](raydium-policy-recipes.md) generates CLMM pool, position, lock, and fee-claim expressions using existing runtime primitives.
A vesting lock and a policy promise are not equivalent to an irreversible external lock.

Revoking a token's fee-config authority does not prevent a later policy update from changing how collected fees are spent.
Choose policy upgrade governance that matches the consumer's promises.
