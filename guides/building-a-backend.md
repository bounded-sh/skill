# Building a Backend (server-side)

When you need server-signed writes, server reads, or a receiver for Bounded's
outbound webhooks, use `bounded-sh/server`. It wraps the **same operation surface**
as the client, signed by a keypair instead of a browser user — and it never
bypasses the deployed policy.

> Bounded has no arbitrary server-function runtime (no Lambda/PartyServer). Logic
> that must live *inside* the trust boundary belongs in policy **hooks** (ticks,
> scheduled jobs); `bounded-sh/server` is for code in **your** infra acting as an
> authenticated client. See [capabilities-and-limits.md](capabilities-and-limits.md).

## Install & connect

```bash
# Early access: install the bundle's local tarball (a bare `npm i ./sdk/bounded-sh`
# dir install skips its deps and fails at runtime). At GA: npm i bounded-sh
npm install ./sdk/bounded-sh.tgz   # one package; the server client is the /server subpath export
```

```ts
import { createWalletClient } from "bounded-sh/server";

const vault = await createWalletClient({
  keypair: process.env.VAULT_KEY!,   // base58 string or JSON-array secret key
});
vault.address;                        // the address this server acts as
```

The keypair is the server's identity — a **real wallet**. Whatever address it
derives surfaces in rules as both `@user.id` (the stable identity every
authenticated request carries; for a wallet signer it equals the wallet address)
and `@user.address` (the same address, used for onchain / wallet semantics). So
identity / ownership / membership rules — which key on `@user.id` — match the
vault by that address, while onchain rules see it as `@user.address`. Grant the
vault key exactly the access its rules require, no more. Each client owns its own
session; you can hold several for different signers.

## Server-signed writes

`set` / `setMany` are atomic and policy-checked just like the client's:

```ts
await vault.set("markets/123", { open: true, updatedBy: vault.address });

await vault.setMany([                          // one atomic transaction
  { path: "ledger/e1", document: { delta: -50 } },
  { path: "ledger/e2", document: { delta:  50 } },
]);                                            // conserve etc. checked over the batch
```

A violated invariant throws (409 + invariant name); a denied rule throws (403).
Nothing partial commits. Reach for `setMany` whenever correctness spans writes —
it closes the TOCTOU window a sequence of `set`s would open. Full semantics:
[../docs/data-plane.md](../docs/data-plane.md).

## Server reads & queries

```ts
const market = await vault.get("markets/123");
const open   = await vault.get("markets", { filter: { open: { $eq: true } }, limit: 100 });
const rows   = await vault.queryAggregate("ledger", { sum: ["delta"] });
const hits   = await vault.search("notes", { query: "shipping" });
```

The vault exposes `get`, `getPage`, `getMany`, `set`, `setMany`, `setFile`,
`getFiles`, `search`, `queryAggregate`, `count`, `aggregate`, `runQuery`,
`runQueryMany`, `runExpression`, `runExpressionMany`, and the collaborator
methods — same shapes as [../docs/sdk-reference.md](../docs/sdk-reference.md).

## Receiving webhooks

A policy's `webhooks` block POSTs to an external `https://` URL on chosen ops
(`create`/`update`/`delete`) — outbound fan-out for email, analytics, anomaly
detection, etc. (declare them in the policy:
[../docs/hooks-scheduled-webhooks.md](../docs/hooks-scheduled-webhooks.md)).

Webhooks are read-only notifications: they never gate or mutate Bounded state.
Each delivery is **signed with Bounded's Ed25519 key**, so verify it before
acting on the body — `bounded-sh/server` exports `verifyWebhook`, which fetches
and caches Bounded's public key (from the hosted `/.well-known` keys endpoint),
checks the Ed25519 signature over the raw body, and enforces timestamp skew. It
returns the typed payload or throws `WebhookVerificationError`:

```ts
import { verifyWebhook, WebhookVerificationError } from "bounded-sh/server";

app.post("/hooks/orders", express.text({ type: "*/*" }), async (req, res) => {
  let event;
  try {
    // Pass the RAW body string + the request headers.
    event = await verifyWebhook(req.body, req.headers);
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.status(401).end();
    throw err;
  }
  // event is trusted: { id, appId, path, operation, document, previousDocument, timestamp }
  res.status(200).end();
});
```

(`verifyWebhook(rawBody, headers, opts?)` — `opts` can override `keysUrl`,
`maxSkewSeconds`, and the key-cache TTL.)

Treat the webhook as a *signal*: if you need to mutate Bounded state in
response, do it with the `vault` client above, which re-checks every rule and
invariant.

## Related

- [../docs/sdk-reference.md](../docs/sdk-reference.md) — `createWalletClient` and the full method surface
- [../docs/data-plane.md](../docs/data-plane.md) — atomic writes, failure codes, composition
- [../docs/hooks-scheduled-webhooks.md](../docs/hooks-scheduled-webhooks.md) — declaring webhooks + in-boundary hooks
- [../docs/auth.md](../docs/auth.md) — the server keypair as a real wallet (`@user.id` = `@user.address` for a signer)
- [capabilities-and-limits.md](capabilities-and-limits.md) — hooks vs your own server code
