# Service keys — let a backend function transact as its own identity

Sometimes a Bounded Function needs to act as **itself** — a backend/service
identity — not as the user who invoked it. Examples: a payout bot that writes to
a `payouts` collection only it may touch, a market-maker that posts quotes, a
cron job that settles balances. The pattern, borrowed from the classic
"server wallet" idea, is:

> **Mint a keypair → store its private key as a function secret → reference its
> public address in the policy → have the function act as that address.**

Authorization stays in the policy (a rule like `@user.address ==
@constants.PAYOUT_BOT`), so a leaked key is useless outside the exact writes the
policy grants that address. **A service key is the app developer's own backend
identity — Bounded never custodies *user* funds.** You can mint as many as you
want (one per role: `PAYOUT_BOT`, `MARKET_MAKER`, …); it's an on-demand recipe,
not a platform feature to turn on.

## The recipe (4 steps)

### 1. Mint a keypair and capture both halves

Any Solana ed25519 keypair works. With the CLI:

```bash
bounded keygen --name payout-bot     # prints { address, privateKey }
# or use any tool that yields a base58 secret key + its public address
```

Keep the **private key** for step 3 and the **address** for step 2.

### 2. Put the address in policy `constants`, and authorize it in rules

```json
{
  "constants": { "PAYOUT_BOT": "9aZ…the-public-address" },

  "payouts/$id": {
    "fields": { "to": "Address", "amount": "UInt" },
    "rules": {
      "read":   "@user.address != null",
      "create": "@user.address == @constants.PAYOUT_BOT",
      "update": "false",
      "delete": "false"
    }
  }
}
```

Only the service identity can create a payout. `@constants` + `@user.address`
are both first-class in rules — this much is fully supported today and is
provable (`verifyAuthorityClosure` will confirm only `PAYOUT_BOT` can write).

### 3. Store the private key as the function's secret

```json
{ "functions": { "runPayouts": {
  "auth": "get(/admins/@user.address) != null",
  "entry": "functions/runPayouts.ts",
  "secrets": ["PAYOUT_BOT_KEY"] } } }
```

```bash
bounded functions deploy runPayouts ./functions/runPayouts.ts \
  --app-id <id> --secret PAYOUT_BOT_KEY=<the-base58-private-key>
```

The value is exposed to the function as `ctx.env.PAYOUT_BOT_KEY` and is never
shown anywhere else (the dashboard shows only the *name*).

### 4. Act as the service key inside the function

**Ergonomic form (preferred — `ctx.actAs`):**

```ts
export default async function runPayouts(args, ctx) {
  // act as the backend identity, not the caller
  const bot = await ctx.actAs(ctx.env.PAYOUT_BOT_KEY);
  await bot.set(`payouts/${args.id}`, { to: args.to, amount: args.amount });
  return { ok: true };
}
```

`ctx.actAs(privateKey)` returns a `ctx.bounded`-shaped client whose writes
authenticate **as the key's address**, so the `@constants.PAYOUT_BOT` rule
authorizes them. Call it more than once for more than one identity.

> **Status:** `ctx.actAs` is a thin runtime helper over primitives that already
> exist (see the fallback). If your runtime doesn't expose it yet, use the
> fallback below — it is functionally identical, just less terse — and the
> helper lands transparently when shipped.

**Fallback that works with today's primitives (no runtime helper needed):**

The function mints its own session for the service address and writes with that
token. This relies only on the existing auth + data-plane endpoints:

```ts
import nacl from "tweetnacl";
import bs58 from "bs58";

async function actAs(ctx, privateKeyB58) {
  const sk = bs58.decode(privateKeyB58);
  const address = bs58.encode(sk.slice(32));            // ed25519 pubkey
  // 1) nonce
  const nonce = await (await fetch(`${ctx.authUrl}/auth/nonce`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: ctx.appId }),
  })).json().then(r => r.nonce);
  // 2) sign the auth message (must match the server's expected message format)
  const message = `bounded auth: ${nonce}`;
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), sk));
  // 3) mint a session for THIS address
  const { idToken } = await (await fetch(`${ctx.authUrl}/session`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: ctx.appId, authMethod: "phantom", address, message, signature }),
  })).json();
  // 4) a writer that authenticates as `address`
  return {
    async set(path, document) {
      const res = await fetch(`${ctx.realtimeUrl}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-App-Id": ctx.appId, Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ documents: [{ destinationPath: path, document }] }),
      });
      if (!res.ok) throw new Error(`write failed: ${res.status}`);
      return res.json();
    },
  };
}
```

`createSessionForSolana` mints a valid session for **any** address that produces
a valid signature, so the function writes as `PAYOUT_BOT` and the policy
authorizes it. (Match `message` to the exact format the session service
verifies; confirm against the current auth flow.)

## When to use this vs. acting as the caller

| You want… | Use |
| --- | --- |
| The function to write **on behalf of the user** who called it | default `ctx.bounded` (acts as the caller) |
| The function to write **as a backend identity** the user can't impersonate | a **service key** (this doc) |
| A scheduled/cron write with no caller at all | a **service key**, or the SYSTEM principal for scheduled functions |

## Guardrails

- The policy is still the gate. Even with the right key, the function can only
  do what the rule grants that address. Prove it (`verifyAuthorityClosure`,
  `checkImplication`) — don't trust the address check alone.
- One key per role. Don't reuse `PAYOUT_BOT` for unrelated writes; mint another.
- Never log `ctx.env.*`. Never return the private key from a function.
- On-chain signing (a service key signing a Solana transaction, not just a
  data-plane write) is a separate capability — see the backend if you need it.
