# Escrow with a per-escrow named PDA

Buyer funds a dedicated named PDA at create; the buyer alone releases the full amount to the seller, exactly once, with the payout gated on the pot's real balance.

Devnet status: `@AccountPlugin.createAccount`, `@AccountPlugin.getAccountAddress`, `@TokenPlugin.transfer`, `@TokenPlugin.getBalance`, and `@DocumentPlugin.updateField` are all unverified (LIVE-PENDING - source-present, no retained live acceptance receipt yet), and the `@TokenPlugin.SOL` alias is likewise unverified; see [solana-capability-status.md](../solana-capability-status.md).

## Policy

```json
{
  "auth": { "wallets": true },
  "escrows/$escrowId": {
    "description": "One escrow per id, denominated in SOL (lamports). The buyer funds a per-escrow named PDA at create; the buyer alone releases to the seller, exactly once. Escrow ids must not parse as a Solana pubkey and the named-account namespace is app-global, so prefix them (esc_...) to avoid collisions.",
    "onchain": true,
    "fields": {
      "seller": "Address!",
      "amount": "UInt!",
      "buyer": "Address?",
      "released": "Bool"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.amount > 0 && @newData.released == false && @newData.buyer == null",
      "update": "@user.address != null && @user.address == @data.buyer && @data.released == false && @newData.released == true && @newData.buyer == @data.buyer && @newData.seller == @data.seller && @newData.amount == @data.amount && @TokenPlugin.getBalance($escrowId, @TokenPlugin.SOL) >= @data.amount",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@AccountPlugin.createAccount($escrowId) && @TokenPlugin.transfer(@user.address, $escrowId, @TokenPlugin.SOL, @newData.amount) && @DocumentPlugin.updateField(/escrows/$escrowId, 'buyer', @user.address)",
        "update": "@TokenPlugin.transfer($escrowId, @data.seller, @TokenPlugin.SOL, @data.amount)"
      }
    },
    "queries": {
      "getEscrowAddress": {
        "description": "Resolved base58 address of this escrow's named PDA. For display, rules comparisons, and destination arguments - never valid in a signer position.",
        "returnType": "String",
        "query": "@AccountPlugin.getAccountAddress($escrowId)"
      }
    },
    "operationDetails": {
      "read": "Public. Anyone can inspect an escrow's state.",
      "create": "Buyer sends {seller, amount, released: false} and MUST omit buyer; the hook stamps buyer = @user.address after funding. amount is in lamports and the buyer's wallet signs the funding transfer.",
      "update": "Release. Buyer sends the patch {released: true} only - onchain updates are patches, so omit the readonly fields (seller, amount); the preservation clauses deny any patch that tries to change them.",
      "delete": "Never. Escrow records are permanent."
    }
  }
}
```

For a token-denominated escrow, add a `"mint": "Address!"` field, replace `@TokenPlugin.SOL` with `@newData.mint` (create) / `@data.mint` (update), and pin it in the update rule with `@newData.mint == @data.mint`.

## Operations

1. **Create** - buyer writes `escrows/esc_abc123` with `{seller, amount, released: false}` (no `buyer`). One atomic transaction: `createAccount($escrowId)` (idempotent) makes the escrow's own named PDA, the buyer's wallet signs the transfer of `amount` lamports into it, and the hook stamps `buyer = @user.address` on the document via the staged document update contract.
2. **Release** - buyer patches the same document with `{released: true}` and nothing else. The rule checks the caller is the stamped buyer, the escrow is unreleased, and the PDA really holds at least `amount`; the hook then pays `amount` from the raw `$escrowId` account id to `seller`, program-signed.
3. **Read / query** - anyone reads escrow state; `getEscrowAddress` returns the PDA's base58 address for display (chain-backed named queries require an authenticated caller even though the read rule is public).

## Why it holds

- **Isolation is physical, not accounting.** Each escrow's funds live in its own named PDA keyed by `$escrowId`; a release hook structurally cannot name another escrow's pot, so no bug can mix balances between escrows.
- **Buyer identity cannot be forged.** The create rule denies any client-supplied `buyer`; the hook stamps `buyer = @user.address`, and because the funding source is `@user.address`, the buyer's own wallet must sign - the stamp, the account creation, and the deposit are one atomic transaction.
- **Release flips exactly once.** `@data.released == false && @newData.released == true` means the first successful release consumes the only transition; a second release write is denied, so the payout hook can never run twice.
- **Only the buyer releases, only the seller is paid.** `@user.address == @data.buyer` gates the transition, and the preservation clauses (`seller`, `amount`, `buyer` pinned) stop a release patch from redirecting or resizing the payout.
- **Balance-gated payout.** `@TokenPlugin.getBalance($escrowId, @TokenPlugin.SOL) >= @data.amount` in the rule (the proven plane) rejects a release the pot cannot cover instead of letting the transaction revert downstream.
- **The raw id is the signing capability.** `$escrowId` is passed raw as the funding destination and the payout source; `getAccountAddress` output is for display, rules comparisons, and destination arguments, and is statically rejected in signer positions.
- **Rules stay pure.** All value movement lives in `hooks.onchain`; a hook failure aborts the whole write, so the document state and the chain state never diverge.

## Related

- [Custody and PDAs](../custody-and-pdas.md) - the custody rule, named-account idiom, and account-id hygiene this page applies.
- [Plugin catalog](../plugins.md) - signatures for `@AccountPlugin`, `@TokenPlugin`, `@DocumentPlugin`.
- [Policy primitives: onchain staged document updates](../policy-primitives.md#onchain-staged-document-updates) - the `updateField` contract used to stamp `buyer`.
- [Solana capability status](../solana-capability-status.md) - live verification state of every function used here.
