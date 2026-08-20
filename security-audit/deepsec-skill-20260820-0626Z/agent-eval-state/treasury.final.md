`policy.json`:

```json
{
  "auth": {
    "wallets": true
  },
  "constants": {
    "TREASURY_ACCOUNT_ID": "bounded_treasury_v1",
    "TREASURER": "<TREASURER_SOLANA_ADDRESS>",
    "WITHDRAWAL_DESTINATION": "<FIXED_WITHDRAWAL_DESTINATION_SOLANA_ADDRESS>",
    "MAX_WITHDRAWAL_LAMPORTS": 1000000000,
    "MAX_24H_WITHDRAWAL_LAMPORTS": 5000000000
  },
  "treasuryDeposits/$depositId": {
    "description": "Public, append-only SOL deposits into the program-signed treasury PDA.",
    "onchain": true,
    "tier": "durable",
    "fields": {
      "depositor": "Address!",
      "amount": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.depositor == @user.address && @newData.amount > 0",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@AccountPlugin.createAccount(@const.TREASURY_ACCOUNT_ID) && @TokenPlugin.transfer(@user.address, @const.TREASURY_ACCOUNT_ID, @TokenPlugin.SOL, @newData.amount)"
      }
    },
    "queries": {
      "treasuryAddress": {
        "description": "The named treasury PDA address.",
        "returnType": "Address",
        "query": "@AccountPlugin.getAccountAddress(@const.TREASURY_ACCOUNT_ID)"
      },
      "treasuryBalance": {
        "description": "The treasury's current SOL balance in lamports.",
        "returnType": "UInt",
        "query": "@TokenPlugin.getBalance(@const.TREASURY_ACCOUNT_ID, @TokenPlugin.SOL)"
      }
    }
  },
  "treasuryWithdrawals/$withdrawalId": {
    "description": "Append-only withdrawals authorized by one treasurer and confined to one destination and bounded amounts.",
    "onchain": true,
    "tier": "durable",
    "fields": {
      "treasurer": "Address!",
      "destination": "Address!",
      "amount": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @user.address == @const.TREASURER && @newData.treasurer == @user.address && @newData.destination == @const.WITHDRAWAL_DESTINATION && @newData.amount > 0 && @newData.amount <= @const.MAX_WITHDRAWAL_LAMPORTS && @TokenPlugin.getBalance(@const.TREASURY_ACCOUNT_ID, @TokenPlugin.SOL) >= @newData.amount",
      "update": "false",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "rollingSum",
        "name": "treasury_24h_withdrawal_cap",
        "field": "amount",
        "windowSeconds": 86400,
        "limit": "@const.MAX_24H_WITHDRAWAL_LAMPORTS",
        "onchain": "onchainSupported"
      }
    ],
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.transfer(@const.TREASURY_ACCOUNT_ID, @const.WITHDRAWAL_DESTINATION, @TokenPlugin.SOL, @newData.amount)"
      }
    }
  }
}
```

Security rationale: deposits are open to any signing wallet and atomically enter a uniquely named, program-signed PDA. Withdrawals require the fixed treasurer, bind the ledger destination to a fixed address, and hardcode that destination again in the transfer hook. Each withdrawal is positive, balance-backed, capped at 1 SOL, and subject to a conservative 5 SOL rolling 24-hour onchain cap. Both ledgers are immutable.

Replace both address placeholders before use. The 1 SOL and 5 SOL limits are illustrative placeholders requiring treasury-owner approval. The pinned capability catalog marks the Account/Token plugin calls as `LIVE-PENDING` and source-parity-only, so live readiness must be established before production use.