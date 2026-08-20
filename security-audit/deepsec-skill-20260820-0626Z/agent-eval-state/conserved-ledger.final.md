```json
{
  "auth": {
    "anonymous": false
  },
  "errorDisclosure": "minimal",
  "accounts/$userId": {
    "description": "One durable credit-balance row per authenticated user. Transfers use atomic setMany batches containing a sender debit and recipient credit.",
    "fields": {
      "balance": "UInt"
    },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null",
      "create": "@user.id != null && @user.isAnonymous == false && $userId == @user.id && @newData.balance == 0",
      "update": "@user.id != null && @user.isAnonymous == false && @newData.balance >= 0 && (($userId == @user.id && @newData.balance < @data.balance) || ($userId != @user.id && @newData.balance > @data.balance))",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "conserve",
        "name": "credits_conserved",
        "field": "balance",
        "materialization": "direct"
      }
    ]
  }
}
```

Security rationale:

- Accounts are keyed directly by stable `@user.id`, preventing account-name squatting.
- Only an owner may decrease their balance; other users may only increase it. `UInt` prevents negative balances.
- `credits_conserved` requires the complete atomic batch to have zero net balance change. A lone debit, lone credit, mint, burn, or unequal pair rejects with `409`, committing nothing.
- Account deletion is forbidden, storage is durable, anonymous writes are disabled, and production errors use minimal disclosure.
- Authenticated balance visibility is intentional so clients can construct recipient post-state safely. Recipient accounts must first be initialized at zero.

Fixed-supply genesis must occur before activating this policy: seed `<INITIAL_SUPPLY_UINT>` into `accounts/<MINT_AUTHORITY_USER_ID>` under a temporary authority-only policy, then atomically cut over to this policy. This production policy deliberately contains no mint bypass.