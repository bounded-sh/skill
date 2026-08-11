# Isolated vault (one pot per entity)

Each vault gets its own program-signed named PDA, so no vault can spend another's funds - isolation is chain-enforced, not bookkeeping. This is the template for escrows, auctions, prize pools, and per-tenant balances; the model is explained in [custody and PDAs](../custody-and-pdas.md).

Devnet status: `@AccountPlugin.createAccount`/`getAccountAddress`, `@TokenPlugin.transfer`/`getBalance`, and the `@TokenPlugin.SOL` alias are currently unverified (source parity only, LIVE-PENDING); see [solana-capability-status.md](../solana-capability-status.md).

Vault ids must not parse as a Solana pubkey (never a wallet address or an `Address` field value) - a pubkey-shaped id silently resolves as a plain wallet instead of a named PDA. Use prefixed ids like `v_...`; the account-id namespace is app-global.

## Policy

```json
{
  "auth": { "wallets": true },
  "vaults/$vaultId": {
    "description": "Vault registry; the vault's funds live in the named PDA for $vaultId.",
    "onchain": true,
    "fields": { "owner": "Address!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.owner == @user.address",
      "update": "false",
      "delete": "false"
    },
    "queries": {
      "vaultAddress": {
        "description": "The vault PDA address, for display and external funding",
        "returnType": "Address",
        "query": "@AccountPlugin.getAccountAddress($vaultId)"
      }
    }
  },
  "vaults/$vaultId/deposits/$depositId": {
    "description": "Anyone can fund a vault; the hook moves SOL into the vault's PDA.",
    "onchain": true,
    "fields": { "amount": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.amount > 0 && get(/vaults/$vaultId) != null",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@AccountPlugin.createAccount($vaultId) && @TokenPlugin.transfer(@user.address, $vaultId, @TokenPlugin.SOL, @newData.amount)"
    } },
    "operationDetails": {
      "create": "Depositor signs; createAccount is idempotent so the first deposit creates the PDA."
    }
  },
  "vaults/$vaultId/withdrawals/$withdrawalId": {
    "description": "Only the vault owner withdraws, and never more than the pot holds.",
    "onchain": true,
    "fields": { "amount": "UInt!", "to": "Address!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/vaults/$vaultId).owner == @user.address && @newData.amount > 0 && @TokenPlugin.getBalance($vaultId, @TokenPlugin.SOL) >= @newData.amount",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@TokenPlugin.transfer($vaultId, @newData.to, @TokenPlugin.SOL, @newData.amount)"
    } },
    "operationDetails": {
      "create": "The program signs for the vault PDA; the balance gate stops overdrafts before the transfer builds."
    }
  }
}
```

## Operations

1. Create `vaults/v1` with `{ "owner": "<your wallet>" }`.
2. Fund it: create `vaults/v1/deposits/d1` with `{ "amount": 1000000 }` - the hook creates the PDA (idempotent) and moves the SOL atomically.
3. Withdraw: create `vaults/v1/withdrawals/w1` with `{ "amount": 500000, "to": "<recipient>" }` - owner-only, balance-gated.

## Why it holds

- The raw `$vaultId` is passed as source and destination, so - because the id does not parse as a pubkey - the program signs for exactly this vault's PDA; a hook on vault `v1` structurally cannot name `v2`'s pot.
- `@TokenPlugin.getBalance($vaultId, ...) >= @newData.amount` gates against the pot's real chain balance, not app bookkeeping.
- All three collections are append-only (`update`/`delete` `"false"`), so history is immutable and `owner` needs no preservation clause.
- Only this template creates accounts from `$vaultId`, so the app-global id namespace cannot alias another collection's pots; prefix the id if you add a second account-creating collection.

## Related

[custody and PDAs](../custody-and-pdas.md) - [AccountPlugin](../plugins/AccountPlugin.md) - [TokenPlugin](../plugins/TokenPlugin.md) - [capability status](../solana-capability-status.md) - [onchain troubleshooting](../onchain-troubleshooting.md)
