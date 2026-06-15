# Service keys — let a backend function transact as its own identity

Sometimes a Bounded Function needs to act as **itself** — a backend/service
identity — not as the user who invoked it. Examples: a payout bot that writes to
a `payouts` collection only it may touch, a market-maker posting quotes, a cron
job that settles balances. Bounded supports this directly:

> **A function declares `actAs: "<address>"`. It then transacts as that fixed
> service identity, and the policy authorizes that address like any other
> (`@user.address == @constants.PAYOUT_BOT`).**

Authorization stays in the policy, so the service identity can only do exactly
what the policy grants its address. **A service identity is the app developer's
own backend actor — Bounded never custodies *user* funds.**

## You can have as many as you want

`actAs` is **per function**, so an app can declare **many** distinct service
identities — `runPayouts` acts as `PAYOUT_BOT`, `postQuotes` acts as
`MARKET_MAKER`, `settle` acts as `SETTLER`, each gated by its own policy rules.
There is no single global service key; mint one identity per role.

```json
{
  "constants": {
    "PAYOUT_BOT":   "9aZ…address",
    "MARKET_MAKER": "4kT…address"
  },

  "payouts/$id": {
    "fields": { "to": "Address", "amount": "UInt" },
    "rules": {
      "read":   "@user.address != null",
      "create": "@user.address == @constants.PAYOUT_BOT",
      "update": "false", "delete": "false"
    }
  },

  "quotes/$id": {
    "rules": { "read": "true",
               "create": "@user.address == @constants.MARKET_MAKER",
               "update": "@user.address == @constants.MARKET_MAKER", "delete": "false" }
  },

  "functions": {
    "runPayouts": { "auth": "get(/admins/@user.address) != null",
                    "entry": "functions/runPayouts.ts", "actAs": "9aZ…address" },
    "postQuotes": { "auth": "true",
                    "entry": "functions/postQuotes.ts", "actAs": "4kT…address" }
  }
}
```

```ts
// functions/runPayouts.ts — ctx.bounded already acts as PAYOUT_BOT
export default async function runPayouts(args, ctx) {
  console.log("paying out", args.id);              // shows up in dashboard logs
  await ctx.bounded.set(`payouts/${args.id}`, { to: args.to, amount: args.amount });
  return { ok: true };
}
```

The caller still has to pass the function's own `auth` rule to invoke it; the
owner-declared `actAs` is the authorization to act as that address. The function
code doesn't change — `ctx.bounded` simply writes as the service identity, and
the `@constants.PAYOUT_BOT` rule authorizes it.

## Key storage — the important part

**For data-plane writes, there is NO private key to store.** The service
"address" is just the identity the owner's function is authorized to act as; the
platform asserts it for the function and the policy gates it. Nothing to mint,
nothing to leak, nothing to rotate. This is the recommended, most-secure path
for the common case (writing/reading app data as a backend actor).

You only need a **real keypair + private key** when the service identity must
**cryptographically sign** — i.e. submit an on-chain Solana transaction (not
just a data-plane write). In that case:

- The **private key is a function secret**, set at deploy and exposed only to
  that one function as `ctx.env.NAME` — it is stored server-side alongside the
  function (never in your repo, never returned, only the *name* is ever shown in
  the dashboard):
  ```bash
  bounded functions deploy runPayouts ./functions/runPayouts.ts \
    --app-id <id> --secret PAYOUT_BOT_KEY=<base58-private-key> --actAs <address>
  ```
- If you mint the keypair locally, keep the private key in
  `~/.bounded/keys/<name>.json` with `0600` perms (machine-local, never
  committed) until you set it as the secret, then you can delete the local copy.
  The **public address** is the only half that goes in the policy
  (`constants` + `actAs`).

| You need… | Private key? | Where it lives |
| --- | --- | --- |
| Write/read app data as a backend identity | **No** | nothing stored — just the address in policy |
| Sign an on-chain Solana tx as the identity | Yes | function **secret** (server-side); local mint → `~/.bounded/keys/` `0600` |

## Security properties

- **Policy is the gate.** Even acting as the right address, a function can only
  do what the rule grants it. Prove it (`verifyAuthorityClosure`,
  `checkImplication`) — never trust the address comparison alone.
- **Scoped & owner-controlled.** The service identity is bound to one app and is
  declared by the app owner (who controls both the function and the policy), so
  there is no privilege escalation beyond what the owner already controls.
- **No ambient key.** The data-plane path needs no private key at all; the only
  private key in play is the optional on-chain signing key, isolated to its
  function as a secret.
- **One identity per role.** Don't reuse `PAYOUT_BOT` for unrelated writes; mint
  another address and gate it separately.

## When to use this vs. acting as the caller

| You want… | Use |
| --- | --- |
| Write **on behalf of the user** who called the function | default `ctx.bounded` (acts as the caller) |
| Write **as a backend identity** the user can't impersonate | a **service key** (`actAs`, this doc) |
| A scheduled/cron write with no caller | a **service key** (`actAs`), or the SYSTEM principal |
