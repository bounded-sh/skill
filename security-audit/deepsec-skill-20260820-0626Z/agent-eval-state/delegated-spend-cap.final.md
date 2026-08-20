```json
{
  "auth": {
    "wallets": true
  },
  "constants": {
    "DELEGATED_24H_CAP_MINOR_UNITS": 0
  },
  "delegations/$ownerId": {
    "description": "One owner-controlled delegation and spending cap.",
    "tier": "durable",
    "fields": {
      "ownerId": "String!",
      "agentId": "String",
      "enabled": "Bool",
      "capMinor": "UInt!"
    },
    "rules": {
      "read": "@user.id != null && (@data.ownerId == @user.id || @data.agentId == @user.id)",
      "create": "@user.id != null && $ownerId == @user.id && @newData.ownerId == @user.id && @newData.agentId != null && @newData.capMinor == @const.DELEGATED_24H_CAP_MINOR_UNITS",
      "update": "@user.id != null && $ownerId == @user.id && @data.ownerId == @user.id && @newData.ownerId == @data.ownerId && @newData.capMinor == @data.capMinor",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "delegation_owner_binding",
        "field": "ownerId",
        "pathVariable": "$ownerId"
      }
    ]
  },
  "delegations/$ownerId/spends/$spendId": {
    "description": "Append-only delegated-spend authorization ledger.",
    "tier": "durable",
    "fields": {
      "ownerId": "String!",
      "agentId": "String!",
      "amountMinor": "UInt!",
      "reference": "String!"
    },
    "rules": {
      "read": "@user.id != null && (get(/delegations/$ownerId).ownerId == @user.id || get(/delegations/$ownerId).agentId == @user.id)",
      "create": "@user.id != null && get(/delegations/$ownerId).enabled == true && get(/delegations/$ownerId).ownerId == $ownerId && get(/delegations/$ownerId).agentId == @user.id && @newData.ownerId == $ownerId && @newData.agentId == @user.id && @newData.amountMinor > 0",
      "update": "false",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "spend_owner_binding",
        "field": "ownerId",
        "pathVariable": "$ownerId"
      },
      {
        "type": "rollingSum",
        "name": "delegated_spend_24h_cap",
        "field": "amountMinor",
        "windowSeconds": 86400,
        "limit": "@const.DELEGATED_24H_CAP_MINOR_UNITS",
        "scopeVariable": "$ownerId"
      }
    ]
  }
}
```

Security rationale:

- Replace the fail-closed `DELEGATED_24H_CAP_MINOR_UNITS: 0` placeholder with the required cap in the currency’s smallest unit before verification.
- The rolling sum is partitioned by `$ownerId`, so an agent serving several owners receives independent budgets; activity for one owner cannot consume another owner’s cap.
- Only the owner can create, rotate, enable, or disable their delegation. Only the currently delegated agent can append spend beneath that owner.
- Owner tags are path-bound by `tenantTag`; spend records are durable and append-only, preventing ownership reassignment or historical reductions that would reopen budget.
- Bounded uses trusted record creation time for the atomic 86,400-second rolling window, avoiding client-clock and read-check-write races.
- For actual payments, the trusted executor must treat a committed record as the sole authorization and execute exactly `amountMinor`; the policy cannot validate an external payment if execution occurs outside the governed transaction.