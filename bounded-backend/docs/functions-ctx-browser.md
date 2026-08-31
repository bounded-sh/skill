# ctx.browser - drive a headless browser, fenced by your egress

**What's in here:** one capability of the function `ctx` API, split out of
[functions.md](functions.md) so a function that does not use it never loads it.
Declaring, writing, invoking and deploying a function are in [functions.md](functions.md).

Use `ctx.browser` when a function needs to SEE a real page: smoke-test your own
deployed app, read a page that has no API, or prove something renders. It drives
a managed headless browser server-side — no browser dependency in your code.

```ts
export default async function smokeTest(args, ctx) {
  const drive = await ctx.browser.run({
    idempotencyKey: `smoke:${args.checkId}:v1`,
    steps: [
      { action: "goto", url: "https://myapp.bounded.page/" },
      { action: "waitFor", selector: "#app-shell" },
      { action: "readText" },
      { action: "screenshot" }
    ],
    maxSeconds: 45
  });
  return { healthy: drive.ok, sawText: drive.text[0], paid: drive.costMicroUsd };
}
```

Steps are a fixed vocabulary: `goto` (url), `click`/`waitFor` (selector),
`fill` (selector + value), `readText` (optional selector; captured into
`result.text`), `screenshot`. The drive stops at the first failed step and
reports it in `result.steps` — it never throws for a step failure.

**The egress fence.** A browser is the most complete egress bypass there is — one
page load can pull from any host — so every navigation AND every sub-resource the
page requests is checked server-side against the calling FUNCTION's declared
egress (`functions.<name>.egress`, ceilinged by the app-wide `boundaries.egress`).
An undeclared host refuses with `egress_denied` (403) before a session is even
opened; a page that reaches for an undeclared host mid-drive has that request
blocked. An app that declares no egress at all is unfenced, exactly like raw
`fetch`.

**Billing.** Browser time bills per SECOND of open session against the app
owner's prepaid services credit, fail-closed, and settles to actual elapsed
seconds (`result.billedSeconds`, `result.costMicroUsd`, plus the uniform
`result.meter` capability-spend fact). `maxSeconds` (default 60, ceiling 300) is
your own spend fence — the reservation is taken up front and released on settle.

**Replay safety.** Like `ctx.ai`, `ctx.browser.run` requires `idempotencyKey`
and a replay-safe invocation (an `Idempotency-Key` header on direct invokes —
`bounded functions invoke ... --idempotency-key <key>` — or a scheduled run). A
retried invocation replays the SAME drive result instead of opening and billing
a second session. Errors carry stable codes to branch on: `egress_denied`,
`browser_unavailable`, `browser_busy`, `browser_request_invalid`.

### Driving your app SIGNED IN — the agent identity

Most of an app sits behind a login, so a logged-out drive can only ever check the
front door. Add `as` and the drive runs as your app's **agent identity**: a
normal, non-privileged user whose key the platform holds — the principal
Bounded's agents act as *inside* your app.

```ts
const drive = await ctx.browser.run({
  idempotencyKey: `dashboard-check:${args.checkId}:v1`,
  as: { identity: "agent" },              // ← log the drive in
  steps: [
    { action: "goto", url: "https://myapp.bounded.page/dashboard" },
    { action: "waitFor", selector: "#ready" },
    { action: "readText", selector: "#ready" }
  ],
  maxSeconds: 60
});
```

**You declare what it may do, and nothing else.** Put its address in `constants`
and write rules against it in the same language as any other principal. Z3 proves
over it like anything else, and on an oApp it is published in the constitution —
so holders can see that a key the platform holds can act in the app, and exactly
what it may do:

```json
{
  "constants": { "AGENT": "<the address Bounded shows you for this app>" },
  "readings/$id": {
    "fields": { "value": "Number" },
    "rules": {
      "read": "@user.id == @const.AGENT || @user.id == $owner",
      "create": "false",
      "update": "false",
      "delete": "false"
    }
  }
}
```

**Grant it the least it needs, and on a live app that usually means READ.** Follow
this one literally, because that grant *is* the whole blast radius: logging a
browser in means the token lives in your app's own `localStorage`, where your
app's page can read it. That is inherent to seeding a browser session, and it is
safe only because the token can do nothing beyond what you declared for that
address. Read is enough to answer "does the dashboard render for a signed-in
user", which is what most drives are for. To exercise WRITE paths — signup,
checkout, delete — use disposable data; never widen the agent's authority on a
live app to make a test pass.

**The platform resolves everything sensitive, and you cannot pass it.** There is
no field for a token, an address or an origin, and supplying one is refused
rather than ignored. Bounded mints the session server-side, seeds it before any
page script runs, and only at an origin your app itself declares — so the drive's
first navigation must target one of your app's own origins. `identity` is a
closed set, today just `"agent"`.

Extra codes on this path: `agent_identity_unavailable` (the platform could not
produce the identity — a misconfiguration, not your app's fault),
`agent_session_mint_failed` (the auth issuer declined),
`target_app_origin_undeclared` (the first navigation is not an origin your app
declares), `target_app_origin_unresolved` (your app declares no https origin to
seed at), and `drive_not_authorized` (driving a DIFFERENT app — an app's agent
identity is granted to the platform, not to whichever app names it, so only
self-drive is authorized).

