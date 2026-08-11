# Custody and PDAs

Who holds funds and who signs in an onchain policy. Read this before writing a hook that moves value, then check the exact function in the [plugin catalog](plugins.md).

## The one rule

The following resolver applies only when the function's existing manifest description explicitly accepts wallet, escrow-sentinel, and account-id forms. It is not a global rule for every `source`, `owner`, `creator`, or destination argument.

```
argument string
     |
     +- parses as a pubkey and equals the program ID
     |     -> the app escrow PDA; the program signs   ("@contract.address")
     +- parses as any other pubkey
     |     -> that wallet; the USER must sign          (self-custody path)
     +- does not parse as a pubkey
           -> an ACCOUNT ID: a named app PDA; the program signs
```

Three custody models are available to arguments that declare all three forms:

| You pass | Custody | Use for |
|---|---|---|
| a user wallet (`@user.address`, `@newData.buyer`) | Self-custody; that wallet signs the transaction | user-initiated moves of the user's own funds |
| `@contract.address` | **One shared app fund** (the escrow PDA), program-signed | a genuinely single pooled fund: one treasury, one autonomous desk |
| any non-pubkey string (an account id) | **One fund per id** (a named PDA), program-signed | per-market, per-escrow, per-round, per-tenant pots that must not share a balance |

Choosing between the last two is a design decision, not a detail. With the shared escrow, isolation between entities is only as good as your accounting, and a failure surfaces as an unrelated user's withdrawal reverting. With per-entity account ids, isolation is physical: a hook for entity A structurally cannot name entity B's fund. Decide before the first deposit lands; retrofitting means migrating live balances.

## Named accounts: create, fund, use

`@AccountPlugin.createAccount(id)` creates the named PDA (rent-exempt, zero data). It is **idempotent** - repeat calls succeed - so the safe idiom is to prepend it, atomically, to whichever hook first touches the account:

```json
"marketEntries/$marketId/deposits/$depositId": {
  "onchain": true,
  "fields": { "amount": "UInt!" },
  "rules": {
    "read": "true",
    "create": "@user.address != null && @newData.amount > 0",
    "update": "false",
    "delete": "false"
  },
  "hooks": { "onchain": {
    "create": "@AccountPlugin.createAccount($marketId) && @TokenPlugin.transfer(@user.address, $marketId, @TokenPlugin.SOL, @newData.amount)"
  } }
}
```

Paying out later names the same id as the source; the program signs:

```json
"create": "@TokenPlugin.transfer($marketId, @newData.winner, @TokenPlugin.SOL, @newData.payout)"
```

Guard payouts with the pot's real balance, not your bookkeeping alone:

```json
"create": "@TokenPlugin.getBalance($marketId, @TokenPlugin.SOL) >= @newData.payout && ..."
```

## Account-id hygiene

- **Ids must not parse as a pubkey.** `createAccount` rejects pubkey-shaped ids on-chain, and in other arguments a pubkey-shaped "id" silently becomes an unsigned wallet reference - a custody change, not an error. Never use wallet addresses or `Address` fields as ids; for per-user pots use a distinct non-wallet id and store the wallet in its own field.
- **The id namespace is app-global.** `markets/$id` and `rounds/$id` writing to the bare `$id` alias the same PDA if the strings collide, and idempotent creation means nothing ever errors - funds just pool. `@Solana.createAccount(name, ...)` shares this same namespace. Prefix ids per collection or make them globally unique by construction.
- **The id string is the signing capability.** Keep the logical id wherever Bounded must sign. The validator statically rejects `@AccountPlugin.getAccountAddress(id)` in signer-position arguments; its output (the resolved base58 address) is for display, rules comparisons, named queries, and destination arguments only.
- Reading the shared escrow's own address goes through the program-ID string-literal query documented in [policy-primitives.md](policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address); `getAccountAddress(@contract.address)` is rejected for the onchain target.

## Signing and rent behavior

- For an argument whose manifest description accepts named-PDA or escrow custody and whose generated page shows `Signer in manifest: yes`, the Bounded program signs via derived seeds. No user signature is needed for the move itself, so access rules and invariants on the collection are the gate. Write them accordingly.
- For a wallet argument whose generated page shows `Signer in manifest: yes`, that wallet must sign the transaction; a policy naming someone else's wallet as a signing source simply fails to sign.
- `-` in the generated signer column means the existing manifest does not declare signer metadata. It is not evidence that the argument never requires a signature.
- `createAccount` rent (and any first-ATA rent for token recipients) is paid by the transaction payer. Server-driven reveal writes (the no-user path used by randomness fulfillment) cannot use payer-funded calls such as `createAccount` - create accounts in a normal user write first.
- A named PDA holds SOL directly and tokens in its ATAs; `@TokenPlugin.getBalance` explicitly accepts an account id, so balances are readable in rules through `@TokenPlugin.getBalance(id, mint)`.

## Where custody calls go in a policy

Mutating plugin calls belong in `hooks.onchain.{create,update,delete}` on an `"onchain": true` collection. Rules stay pure boolean gates - they are the plane `bounded verify` proves, and they run before the hook with no attested transaction data. An onchain hook that evaluates to `false` fails the whole write and the Solana transaction reverts atomically, so a hook can sequence conditional moves with `&&`, but authorization still belongs in `rules`, not hooks.

## Choosing quickly

- One user moving their own funds: wallet source, user signs.
- The app operating one pooled fund autonomously: `@contract.address`, rules + invariants as guardrails.
- Escrows, auctions, markets, prize pools, per-tenant balances - anything where two pots coexisting must not mix: named account per entity, created idempotently in the funding hook.
