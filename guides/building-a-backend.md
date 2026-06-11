# Building a Backend (server-side)

When you need server-signed writes, server reads, or a receiver for Bounded's
outbound webhooks, use `@bounded/server`. It wraps the **same operation surface**
as the client, signed by a keypair instead of a browser user — and it never
bypasses the deployed policy.

> Bounded has no arbitrary server-function runtime (no Lambda/PartyServer). Logic
> that must live *inside* the trust boundary belongs in policy **hooks** (ticks,
> scheduled jobs); `@bounded/server` is for code in **your** infra acting as an
> authenticated client. See [capabilities-and-limits.md](capabilities-and-limits.md).

## Install & connect

```bash
npm install @bounded/server
```

```ts
import { createWalletClient } from "@bounded/server";

const vault = await createWalletClient({
  keypair: process.env.VAULT_KEY!,   // base58 string or JSON-array secret key
});
vault.address;                        // the address this server acts as
```

The keypair is the server's identity. Whatever address it derives is what shows
up as `@user.address` in rules — so grant the vault key exactly the access its
rules require, no more. Each client owns its own session; you can hold several
for different signers.

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
Because anyone can POST to a public URL, **authenticate the delivery with a
shared secret you control** before acting on the body — verify the configured
secret in the `Authorization` header with a constant-time compare:

```ts
import { timingSafeEqual } from "node:crypto";

app.post("/hooks/orders", async (req, res) => {
  const provided = req.headers["authorization"] ?? "";
  const expected = process.env.BOUNDED_WEBHOOK_SECRET!;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).end();          // reject unauthenticated deliveries
  }
  // body is now trusted — record/notify, then ack
  res.status(200).end();
});
```

Treat the webhook as a *signal*: if you need to mutate Bounded state in
response, do it with the `vault` client above, which re-checks every rule and
invariant.

## Related

- [../docs/sdk-reference.md](../docs/sdk-reference.md) — `createWalletClient` and the full method surface
- [../docs/data-plane.md](../docs/data-plane.md) — atomic writes, failure codes, composition
- [../docs/hooks-scheduled-webhooks.md](../docs/hooks-scheduled-webhooks.md) — declaring webhooks + in-boundary hooks
- [../docs/auth.md](../docs/auth.md) — the server keypair as `@user.address`
- [capabilities-and-limits.md](capabilities-and-limits.md) — hooks vs your own server code
