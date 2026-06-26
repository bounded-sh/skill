# Service keys — let a backend function transact as its own identity

Sometimes a Bounded Function needs to act as **itself** — a backend/service
identity — not as the user who invoked it. Examples: a payout bot that writes to
a `payouts` collection only it may touch, a market-maker posting quotes, a cron
job that settles balances. Bounded supports this directly:

> **A function declares `actAs: "<address>"`. It then transacts as that fixed
> service identity, and the policy authorizes that address like any other
> (`@user.address == @const.PAYOUT_BOT`).**

Authorization stays in the policy, so the service identity can only do exactly
what the policy grants its address. **A service identity is the app developer's
own backend actor — Bounded never custodies *user* funds.**

Because `actAs` changes who `ctx.bounded` writes as, it is the privileged
Functions mode. Deploy requires every `actAs` function's `auth` rule to imply
the app's admin predicate (`get(/admins/@user.id) != null` when an admins scope
exists, otherwise `hasRole("admin")`). Public user-invoked functions should
usually omit `actAs` and write as the caller.

### Who can act as a service identity? (by caller — read this before wiring a grant)

The mode you use depends on **who invokes the function**, and they are not
interchangeable:

| Caller | Service-identity path | Notes |
|---|---|---|
| **A live tick** (`session.live` room) | **`session.live.runAs`** — declared once on the `live` block; all of this game's live `call`s run as it. Gate the called function with `auth: "@origin.kind == 'live' && @origin.module == '<game>'"`. | The ONLY way for a non-admin-triggered flow to act as a funded service identity. This is how `grantInk`-style conserved minting works. |
| **A direct end-user** (SDK `invoke`, `@origin.kind == 'user'`) | **`actAs` — but it is ADMIN-GATED.** A user-invoked function can act as a service identity *only* if its `auth` provably implies admin. `auth: "@user.id != null"` + `actAs: MINT` → **verify FAIL**. | So a *non-admin* user-invoked function **cannot** be the service identity. Don't try to "mirror the live tick" inside a user-invoked function — there is no user-`runAs`. |
| **A scheduled hook** (`@origin.kind == 'scheduled'`) | No `runAs` equivalent; it's the anonymous SYSTEM principal. Gating a privileged write on `@origin` alone trips the *"update requires auth / auth-consistency"* proof. | Route privileged scheduled writes through the live `runAs` too, or make the function admin. |

**The pattern for a USER-triggered privileged/conserved write (the one people get
wrong): split CLAIM from SETTLE.**

1. **Claim** — the user-invoked function (writes as the player) does only what the
   *player* is allowed to do: verify something (e.g. re-check a payment with the
   provider via `fetch` + a secret), then record an **idempotent intent** doc
   (create-only — `update: "false"` on that collection, keyed by a provider id so a
   replay is denied). It does **not** touch the service-owned ledger/mint.
2. **Settle** — the **live tick** (running with `runAs = <serviceIdentity>`)
   `call`s a settle function gated `@origin.kind == 'live'`, which reads the
   unsettled intents via `ctx.bounded`, does the privileged/conserved
   `setMany([...])`, and flips the intent to settled. The live `runAs` is the only
   thing that can authorize the service-owned leg.

Because the claim record is **user-authored, it is untrusted** — the settle step
must **re-derive every value from the trusted source** (re-verify, and take the
amount/owner/product from the provider, never from the claim record). See the
end-user-payments recipe in [billing.md](billing.md#charging-your-own-end-users).

## Fund an AI NPC / a live game call

A live tick (`live.tick`) is pure and egress-disabled; to reach the outside
world it returns a **call** that the room runs as a function — for an LLM NPC,
something like `npcBrain`. See [ai-npcs.md](ai-npcs.md) and
[principals-and-origins.md](principals-and-origins.md) for the full picture.

The catch: **a live call runs as the anonymous SYSTEM principal by default**
(`ctx.user = {id:null, address:null, email:null, system:true}`) — no human, no
wallet, no account. `ctx.ai.run` bills the caller's `user.id`, so a system call
has no account to bill and inference FAILS with a 402.

### The simple way — `session.live.runAs` (session-wide identity)

Declare a service wallet **once** on the room's `live` block and **every** live
call this game makes runs AS it — funding all your AI NPCs from one account:

```json
{
  "constants": { "NPC_BRAIN": "7nQ…address" },

  "rooms/$roomId": {
    "tier": "checkpointed",
    "fields": { "status": "String", "tick": "UInt" },
    "rules": { "read": "@user.id != null", "create": "@user.id != null",
               "update": "false", "delete": "false" },
    "session": {
      "live": {
        "module": "arena",
        "everyMs": 33,
        "calls": ["npcBrain"],
        "runAs": "7nQ…address"
      }
    }
  },

  "functions": {
    "npcBrain": { "auth": "@origin.kind == 'live' && @origin.module == 'arena'",
                  "entry": "functions/npcBrain.ts" }
  }
}
```

With `runAs` set, the NPC function runs as the funded service identity
(`ctx.user.id == ctx.user.address == runAs`), so `ctx.ai` works — no per-function
field needed. Gate the function with its own `auth` rule on `@origin` so only
your game's tick can reach it (a live call **does** evaluate the function's `auth`
rule now, with `@user` = system + `@origin` populated — see
[principals-and-origins.md](principals-and-origins.md)). Owner-declaring `runAs`
**is** the authorization to act as it — same posture as `actAs` below.

### The per-function override — `actAs`

`actAs` on a single function pins that one function to a service identity and
**wins over `runAs`** for that function only. Use it for a one-off that should
act as a different identity than the game's session-wide one:

```json
{
  "constants": { "NPC_BRAIN": "7nQ…address" },

  "functions": {
    "npcBrain": { "auth": "@origin.kind == 'live' && @origin.module == 'arena'",
                  "entry": "functions/npcBrain.ts", "actAs": "7nQ…address" }
  },

  "messages/$id": {
    "rules": { "read": "true", "create": "true",
               "update": "false", "delete": "false" }
  }
}
```

> **Precedence (live calls):** function `actAs` > session `runAs` > anonymous
> SYSTEM. Whichever applies, AI spend is always **capped at the app account**.
> `@origin` + the `session.live.calls` whitelist say *who may call*; `runAs` /
> `actAs` say *who the call acts as* — orthogonal and composable.

```ts
// functions/npcBrain.ts — runs as NPC_BRAIN (via runAs or actAs), so ctx.ai is funded
export default async function npcBrain(args, ctx) {
  const reply = await ctx.ai.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: args.prompt }],
  });
  return { ok: true, text: reply.response };
}
```

Then whitelist it for the live session and have the tick call it:

```json
{ "session": { "live": { "calls": ["npcBrain"] } } }
```

```ts
// inside live.tick — surface a call for the NPC to think
return { state, call: { fn: "npcBrain", args: { prompt }, as: playerId } };
// `as` is optional and a no-op on identity today — the call runs as runAs/actAs, NOT as playerId.
```

> **No private key needed for this.** `runAs` and `actAs` are policy fields, not
> stored secrets — for AI and data-plane writes there is nothing to mint or leak.
> A real private key is only required when the service identity must
> *cryptographically sign* an on-chain Solana tx (see
> [Key storage](#key-storage--the-important-part) below). Funding the NPC is just
> crediting the service account's AI budget.

Fund the service account so the NPC can think. The reply lands on a *later* tick
as an `@effect` result on the checkpoint cadence — not instantly — so expect a
short delay. See [ai-npcs.md](ai-npcs.md) for credit/rate caps and dedup
(`effectId`).

> **Identity vs. wallet, in one line.** When a function acts as a service
> identity, `@user.address` is the *real wallet* the function transacts as, so
> service-key rules compare it against a wallet pubkey constant
> (`@user.address == @const.PAYOUT_BOT`). That is a genuine onchain/wallet
> use of `@user.address` and stays as-is. For the *caller's* own identity —
> ownership, membership, admin/auth guards on the people who invoke the function
> — use the universal `@user.id` (always present; equals the wallet address for
> wallet logins, the account identity for email/social logins). Never use
> `@user.id`, `@user.email`, or `@user.isAnonymous` inside an `onchain:true`
> collection — only `@user.address` is allowed there.

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
      "read":   "@user.id != null",
      "create": "@user.address == @const.PAYOUT_BOT",
      "update": "false", "delete": "false"
    }
  },

  "quotes/$id": {
    "rules": { "read": "true",
               "create": "@user.address == @const.MARKET_MAKER",
               "update": "@user.address == @const.MARKET_MAKER", "delete": "false" }
  },

  "functions": {
    "runPayouts": { "auth": "get(/admins/@user.id) != null",
                    "entry": "functions/runPayouts.ts", "actAs": "9aZ…address" },
    "postQuotes": { "auth": "get(/admins/@user.id) != null",
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
the `@const.PAYOUT_BOT` rule authorizes it.

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
  that one function as `ctx.env.NAME` — stored server-side alongside the function
  (never in your repo, never returned, only the *name* is ever shown). `actAs`
  itself is a policy `functions`-block field (set via `bounded deploy
  ./policy.json`), NOT a CLI flag — the CLI only carries the code + secrets:
  ```bash
  bounded functions deploy runPayouts --entry functions/runPayouts.ts \
    --app-id <id> --secret PAYOUT_BOT_KEY=<base58-private-key>
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
| **All** of a game's live calls to share one funded identity | `session.live.runAs` (session-wide; funds AI NPCs) — see [ai-npcs.md](ai-npcs.md) + [principals-and-origins.md](principals-and-origins.md) |
| One live function to act as a *different* identity than the game's `runAs` | per-function `actAs` (overrides `runAs` for that function) |
| A **live game call with no player** (e.g. an AI NPC) | declare `session.live.runAs` (or per-function `actAs`) — the live call is otherwise the anonymous SYSTEM principal and can't bill AI; see [ai-npcs.md](ai-npcs.md) |
