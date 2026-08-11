# App treasury

One app-operated pot with open deposits and treasurer-only, balance-gated withdrawals. Uses a single named PDA (`app_treasury`) rather than the shared `@contract.address` escrow so the treasury stays separate from any other pooled funds the app may later hold; the trade-offs are in [custody and PDAs](../custody-and-pdas.md).

Devnet status: `@AccountPlugin.createAccount`/`getAccountAddress`, `@TokenPlugin.transfer`/`getBalance`, and the `@TokenPlugin.SOL` alias are currently unverified (source parity only, LIVE-PENDING); see [solana-capability-status.md](../solana-capability-status.md).

## Policy

```json
{
  "auth": { "wallets": true },
  "constants": { "TREASURER": "8jbcCJoDDR4jZBjjE7YkeQfXBqZTGKPT7ZFq2vNerQ8t" },
  "treasuryDeposits/$depositId": {
    "description": "Anyone deposits SOL into the app treasury PDA.",
    "onchain": true,
    "fields": { "amount": "UInt!", "memo": "String?" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.amount > 0",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@AccountPlugin.createAccount('app_treasury') && @TokenPlugin.transfer(@user.address, 'app_treasury', @TokenPlugin.SOL, @newData.amount)"
    } }
  },
  "treasuryWithdrawals/$withdrawalId": {
    "description": "Treasurer-only withdrawals, capped by the pot's real balance.",
    "onchain": true,
    "fields": { "amount": "UInt!", "to": "Address!" },
    "rules": {
      "read": "true",
      "create": "@user.address == @const.TREASURER && @newData.amount > 0 && @TokenPlugin.getBalance('app_treasury', @TokenPlugin.SOL) >= @newData.amount",
      "update": "false",
      "delete": "false"
    },
    "hooks": { "onchain": {
      "create": "@TokenPlugin.transfer('app_treasury', @newData.to, @TokenPlugin.SOL, @newData.amount)"
    } },
    "queries": {
      "treasuryAddress": {
        "description": "The treasury PDA address for external audits",
        "returnType": "Address",
        "query": "@AccountPlugin.getAccountAddress('app_treasury')"
      }
    }
  }
}
```

Replace the `TREASURER` constant with the real treasurer wallet before deploying. To rotate or multi-sig the role later, swap the constant comparison for a data-driven check (`get(/treasurers/@user.address) != null` against an admin-managed onchain registry) - the recipe is in the [access-pattern cookbook](../../../bounded-backend/docs/access-patterns.md#admin).

## Operations

1. Deposit: create `treasuryDeposits/d1` with `{ "amount": 1000000 }` - first deposit creates the PDA (idempotent) and funds it atomically.
2. Withdraw (treasurer wallet only): create `treasuryWithdrawals/w1` with `{ "amount": 250000, "to": "<recipient>" }`.
3. Audit externally: run the `treasuryAddress` named query and watch the PDA on any explorer.

## Why it holds

- The literal id `'app_treasury'` does not parse as a pubkey, so it always resolves to the app's named PDA. The account-id namespace is app-global: if you later add per-entity pots keyed by a path variable, prefix those ids (or otherwise guarantee they can never equal `app_treasury`) - a colliding id string would alias this same PDA and pool funds silently (see [account-id hygiene](../custody-and-pdas.md#account-id-hygiene)).
- Deposits are user-signed moves of the depositor's own SOL; withdrawals are program-signed from the PDA, gated by the treasurer check plus the live `getBalance` floor.
- Append-only collections give an immutable deposit/withdrawal ledger; add a `rollingSum` cap on `treasuryWithdrawals.amount` to bound outflow per window ([invariants](../../../bounded-backend/docs/invariants.md)).

## Related

[custody and PDAs](../custody-and-pdas.md) - [AccountPlugin](../plugins/AccountPlugin.md) - [access patterns](../../../bounded-backend/docs/access-patterns.md) - [capability status](../solana-capability-status.md) - [onchain troubleshooting](../onchain-troubleshooting.md)
