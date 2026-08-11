# Staking with a lock window

Users deposit SOL into one named app vault PDA; each stake document records an amount and a `lockedUntil` timestamp, and unstaking pays the deposit back only after `@time.now` reaches it.

Custody in one line: the vault is a named app PDA (a non-pubkey account id the program signs for), not the shared escrow and never an operator wallet - the tradeoffs between wallet, `@contract.address`, and named-pot custody are in [custody-and-pdas.md](../custody-and-pdas.md).

> Status: per [solana-capability-status.md](../solana-capability-status.md), every function used here (`@AccountPlugin.createAccount`, `@TokenPlugin.transfer`, `@TokenPlugin.getBalance`, `@DocumentPlugin.updateField`, and the `@TokenPlugin.SOL` flow) is currently `unverified` on devnet (LIVE-PENDING; no retained live acceptance receipt yet).

## Policy

```json
{
  "auth": { "wallets": true },
  "constants": {
    "VAULT_ID": "staking_vault_v1",
    "MIN_STAKE_LAMPORTS": 1000000,
    "MAX_LOCK_SECONDS": 31536000
  },
  "stakes/$stakeId": {
    "onchain": true,
    "tier": "durable",
    "description": "One stake position per document. Create deposits SOL into the shared staking vault PDA; update with amount 0 unstakes after the lock window.",
    "fields": {
      "amount": "UInt",
      "lockedUntil": "UInt!",
      "owner": "Address?"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.owner == null && @newData.amount >= @const.MIN_STAKE_LAMPORTS && (@newData.lockedUntil == 0 || (@newData.lockedUntil > @time.now && @newData.lockedUntil <= @time.now + @const.MAX_LOCK_SECONDS))",
      "update": "@user.address != null && @user.address == @data.owner && @time.now >= @data.lockedUntil && @data.amount > 0 && @newData.amount == 0 && @newData.owner == @data.owner && @newData.lockedUntil == @data.lockedUntil && @TokenPlugin.getBalance(@const.VAULT_ID, @TokenPlugin.SOL) >= @data.amount",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@AccountPlugin.createAccount(@const.VAULT_ID) && @TokenPlugin.transfer(@user.address, @const.VAULT_ID, @TokenPlugin.SOL, @newData.amount) && @DocumentPlugin.updateField(/stakes/$stakeId, 'owner', @user.address)",
        "update": "@TokenPlugin.transfer(@const.VAULT_ID, @data.owner, @TokenPlugin.SOL, @data.amount)"
      }
    },
    "operationDetails": {
      "create": "Stake. Payload: {\"amount\": <lamports>, \"lockedUntil\": <unix seconds, or 0 for no lock>}. Never include owner - the hook stamps it from @user.address and the rule rejects any supplied value.",
      "update": "Unstake. Onchain updates are PATCHES: the payload is exactly {\"amount\": 0}. Omit the readonly lockedUntil (resupplying a ! field is rejected with FieldReadOnly) and omit owner."
    },
    "queries": {
      "vaultBalance": {
        "returnType": "UInt",
        "query": "@TokenPlugin.getBalance(@const.VAULT_ID, @TokenPlugin.SOL)"
      }
    }
  }
}
```

## Operations

1. **Stake**: the client sets `stakes/<stakeId>` with `{"amount": <lamports>, "lockedUntil": <unix seconds>}`. `lockedUntil` is either `0` (this app's "no lock" sentinel) or a future timestamp at most `MAX_LOCK_SECONDS` ahead of `@time.now`. The create hook runs atomically: it idempotently creates the vault PDA (safe to repeat, per the funding-hook idiom in custody-and-pdas.md), transfers `amount` lamports from the caller's wallet into the raw vault id (the caller signs - a wallet source is self-custody), and stamps `owner` with `@user.address` via a staged field update, so the payload never carries an address.
2. **Unstake**: once `@time.now >= lockedUntil`, the owner patches the same document with exactly `{"amount": 0}`. The update hook pays `@data.amount` lamports from the vault (program-signed: the raw account id sits in the source position) back to the recorded `owner` wallet. The stake document stays behind as a drained receipt; a second patch is denied.
3. **Read the vault**: the `vaultBalance` named query on any stake path returns the pot's live SOL balance (chain-backed named queries need an authenticated caller even though `read` is `"true"`).

## Why it holds

- **Funds are program-custodied, not operator-custodied.** `staking_vault_v1` does not parse as a pubkey, so it resolves to a named app PDA that only the Bounded program can sign for, and only through these policy paths. No project wallet appears anywhere, so the classic failure (an unstake hook naming a wallet the program cannot sign for) cannot be written.
- **You can only stake your own funds.** The deposit source is `@user.address`; a wallet source requires that wallet's signature, so nobody can push a deposit out of someone else's account.
- **Ownership cannot be forged.** `create` requires `owner == null` and the hook stamps it from `@user.address` in the same atomic write; `update` requires `@user.address == @data.owner`, so only the staker can trigger the payout.
- **The lock is real.** `@time.now >= @data.lockedUntil` gates unstake on the server rule clock, and `lockedUntil` is `UInt!` with its preservation clause (`@newData.lockedUntil == @data.lockedUntil`), so nobody can shorten a lock after creating it. The create bound also caps locks at one year, so a typo cannot freeze funds forever.
- **Exactly-once payout, no minting.** Unstake requires `@data.amount > 0 && @newData.amount == 0`, so each stake pays out exactly what it deposited, once; `delete: "false"` blocks the delete-and-recreate reset; and the hook amount is `@data.amount`, taken from rule-gated stored state (tied to the actual deposit by the atomic create hook), not the client payload.
- **Solvency is checked against the chain, not bookkeeping.** `@TokenPlugin.getBalance(@const.VAULT_ID, @TokenPlugin.SOL) >= @data.amount` in the update rule refuses a payout the pot cannot cover.
- **A failed hook reverts everything.** Rules stay pure boolean gates; all value movement lives in `hooks.onchain`, and a false or erroring hook fails the whole write atomically, so a stake document never exists without its deposit.

## Related

- [custody-and-pdas.md](../custody-and-pdas.md) - custody models, named-pot idiom, account-id hygiene
- [plugins.md](../plugins.md) - `@AccountPlugin` / `@TokenPlugin` / `@DocumentPlugin` signatures
- [solana-capability-status.md](../solana-capability-status.md) - live support state of every function used here
- [policy-primitives.md](../policy-primitives.md) - hook-stamped fields via `@DocumentPlugin.updateField`
- [policy-reference.md](../../../bounded-backend/docs/policy-reference.md) - `@time.now` clock semantics and onchain patch updates
