```json
{
  "auth": {
    "wallets": true
  },
  "escrows/$escrowId": {
    "description": "SOL escrow using a dedicated named PDA. Escrow IDs must be globally unique, prefixed with esc_, and must not parse as Solana public keys.",
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
        "description": "Returns the named escrow PDA address for display or verification; the raw escrow ID remains the signing capability.",
        "returnType": "String",
        "query": "@AccountPlugin.getAccountAddress($escrowId)"
      }
    },
    "operationDetails": {
      "read": "Public escrow inspection.",
      "create": "Buyer submits seller, amount, and released=false while omitting buyer. Account creation, funding, and buyer stamping execute atomically.",
      "update": "Buyer releases by submitting the patch {released:true}. Readonly fields should be omitted.",
      "delete": "Escrow records cannot be deleted."
    }
  }
}
```

Security rationale:

- Each escrow uses an isolated named PDA, preventing pooled-fund or cross-escrow accounting failures.
- Creation atomically deposits `amount` from the caller’s signing wallet and stamps that wallet as `buyer`; clients cannot nominate a different buyer.
- Release requires the authenticated wallet to equal the stored buyer and permits only the one-way `false → true` transition.
- Buyer, seller, and amount are pinned during release, preventing payout redirection or resizing.
- The hook transfers exactly the immutable escrow amount-not the entire PDA balance-to the seller. A real-balance check prevents underfunded release.
- Hook failure reverts the release transaction, keeping payout and document state atomic.

No policy placeholders are missing. `$escrowId`, `seller`, and `amount` are runtime inputs; use globally unique `esc_…` IDs and lamports for `amount`.

Production caveat: the pinned local capability snapshot marks `AccountPlugin`, `TokenPlugin`, `DocumentPlugin.updateField`, and the SOL alias as `LIVE-PENDING`. The policy should not be promoted to mainnet until it passes `bounded verify` and retained live deposit/release/second-release-denial acceptance tests on the intended runtime.