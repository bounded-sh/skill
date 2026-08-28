# Frontend hosting — publish a static site to a mapped Bounded host

Ship a built **static** frontend (Vite/CRA/any `dist/`) to Bounded hosting —
no separate host, no DNS. Claim a vanity slug and your app gets two mapped
subdomains on the same SSL:

- **`<slug>.bounded.page`** — your static site (SPA fallback;
  content-hashed assets cached immutably, HTML + un-fingerprinted assets always
  revalidated so a redeploy goes live instantly without a hard-refresh).
- **`<slug>-api.bounded.page`** — your backend runtime (see [backend-runtime.md](../../bounded-backend/docs/backend-runtime.md)),
  so the frontend can call its own agent/backend at a sibling URL with no CORS dance.

## What it CAN and CANNOT host

Bounded serves your static files **exactly as uploaded — it never executes them**.
There is no Node/SSR server for your frontend. So:

**✅ Can host** — anything that builds to a static, client-rendered bundle:
- Vite (React/Vue/Svelte/Solid/vanilla), Create-React-App, plain HTML/CSS/JS.
- SPAs with client-side routing (extensionless routes fall back to `index.html`).
- Astro / SvelteKit / Nuxt in **static** mode, and **Next.js static export**
  (`output: 'export'` → `out/`) — these prerender to plain HTML/JS at build time.
- Anything where `npm run build` yields a folder of `.html/.js/.css` that runs in
  the browser.

**❌ Cannot host** — anything that needs a server **at request time**:
- A normal Next.js app (`next start`): SSR, ISR, React Server Components, API
  routes, `middleware`, image optimization. Same for Remix, Nuxt/SvelteKit in SSR
  mode, Express/Fastify, PHP, etc.
- Server-side secrets or request-time rendering baked into the frontend framework.

**The Bounded way to get "server" behavior:** ship the UI as a static bundle here,
and move every server concern to Bounded — data + rules to your **policy**, secrets
+ server logic + external API calls to a **function** or **backend runtime** at
`<slug>-api.bounded.page` ([functions.md](../../bounded-backend/docs/functions.md), [backend-runtime.md](../../bounded-backend/docs/backend-runtime.md)).
If you truly need framework SSR, host that app elsewhere and still use Bounded as
its backend. Rule of thumb: **if serving a page would require running your code,
`bounded site deploy` won't do it — prerender it, or move that code into Bounded.**

## Deploy

```bash
bounded site deploy ./dist --app-id <id>
```

- Uploads every file under the dir (default `./dist`); **must contain `index.html`** at root.
- **Replace-deploy**: files no longer in the new build are pruned (no stale assets).
- Auth is your per-app session token (owner/admin only). Any valid static dist is accepted
  — the files are never executed, only served — subject to caps: 25 MB/file, 100 MB total,
  5000 files, path-safety.
- Live in seconds at the app's mapped slug or custom-domain host, e.g.
  `https://<slug>.bounded.page`.
- New apps created by the CLI default to a **private hosted-site gate**. The
  gate is deliberately simple and **web-login only**: a public app is reachable
  by anyone; a private app is reachable only after signing in with a Bounded
  web account that is the owner, a collaborator, or invited (identities linked
  to that account — e.g. a linked CLI key's apps — resolve server-side), plus
  Bounded platform staff, who can open any private site read-only for support
  and never gain owner or collaborator powers on it. There is no
  local-key/daemon auto-pass through the gate. Use `--public` during app
  creation when the site should be public from the start. Existing apps stay as
  they were. After creation, flip or inspect the gate with
  `bounded site privacy private|public|status --app-id <id>`, **or** flip it
  from the in-app Bounded widget's always-visible privacy toggle (cloud-backed;
  no local daemon required).
  Completed-Open oApp workloads are the exception: Open publishes the exact workload app-id host, so re-privatizing is refused and the widget's privacy toggle does not exist on that governed face.
  The setting applies to every mapped static host that resolves to the app: vanity slug and active custom domains.
  API hosts are not gated.
  The private-site gate page itself tells owners and visitors how to make the app public.
- **Preview a private site in a browser without making it public:**
  `bounded site preview --app-id <id>` (add `--open` to launch it). As
  owner/admin you already pass the gate; this mints a short-lived, shareable
  one-click link — `https://<host>/__bounded/gate/land?token=…` — that sets the
  gate cookie and lands on the REAL site, then expires (default 60 min, `--ttl
  <minutes>`, max 1440) back to the normal sign-in page. Host auto-resolves from
  the app's mapped slug/custom domain, or pass `--host <host>`. This needs the
  **owning wallet** identity (the app-scoped SIWS token); a plain web-login
  session is platform-scoped and can't preview, and the command says so. Treat
  the link as a bearer secret until it expires — anyone who opens it gets in.

## Public proof page (opt-in)

Every hosted app CAN publish a public proof surface: a `/__bounded/boundaries`
page (the proof stamp, plain-English invariants, and a live count of writes the
boundaries declined) plus a small "Boundaries" corner badge on the site. It is
**off by default** — an app carries no Bounded proof chrome unless the owner
turns it on:

```bash
bounded site proof on --app-id <id>     # publish the page + badge
bounded site proof off --app-id <id>    # remove them
bounded site proof status --app-id <id>
```

Also toggleable from the dashboard (the "Public proof page" card). Takes effect
within about a minute; no policy redeploy needed. Related presentation knob: the
declined-write card the widget shows end users can be turned off in policy with
`openApps.widget.declineCard: false` (widget `visibility: "hidden"` suppresses
it too).
On a **launched oApp** the widget is the app's trust surface and is forced
visible: a `visibility: "hidden"` frozen into the pre-launch policy neither
hides the widget nor suppresses the declined-write card there. The explicit
`declineCard: false` opt-out stays honored on every face.

## Public source page after completed Open

`/__bounded/source` is the public browser for an oApp's synchronized source
tree and change history. It serves the source revision the platform has synced (source rides the
deploy). It does not reconstruct source from the hosted `dist` directory or
read an unsynchronized local checkout.

The oApp publication gate applies before any source is returned.
A creator development app gets `404` on every public source route before Open completes.
Completed Open publishes the governed workload site and source together at `https://<workloadAppId>.bounded.page`, even though the app has no oApps slug, listing, token, or running Gauntlet yet.
Commence later adds those surfaces without changing the direct workload host's public source visibility.
The stable venue page is `/l/<rootAppId>` before and after Commence.

On a launched oApp the in-app widget also switches to a dedicated launched
face: a public trust rundown (rules, source link, constitution, security,
fuel state, version history, the app's venue room link) instead of the owner
console.
The rundown states only what the published data supports.
A security row reads `audited clean` only when the audit ran against the
revision deployed right now; a mismatch, a missing revision, or an unreadable
head reads `stale`, and an app with no completed audit reads `never audited`.
A paused app says `out of fuel` only when its published gauge is actually
empty - otherwise it says the engine is paused without naming a cause.
An announced build shows its veto countdown, and where circulating supply is
not yet counted it says the threshold is pending rather than naming a number
the engine cannot enforce.
Owner-console actions are refused on launched apps with `launched_locked` /
`oapp_launched` errors - changes ship only through the app's governed build
lane on its venue.
The refusal covers app settings, both slug routes (claiming a new label and
releasing the current one), custom domains, `allowedOrigins`, collaborators,
access requests, the proof-page toggle, widget-report status and deletion,
UI boundaries, ownership transfer, backend runtime and live deploys, and
direct AI edits.
The address and origin routes matter most: a launched app's slug is the
address its constitution points at, and `allowedOrigins` decides where its
sign-in tokens may be delivered.
Ownership is refused on both rails.
A launched oApp belongs to its venue, so a single-app transfer returns
`oapp_launched`, and the bulk wallet-to-web-login migration
(`bounded transfer-apps`) skips launched apps and reports them back to you
under `skippedLaunched` rather than moving them.
An interactive deploy is refused even when the uploaded bytes are identical to
what the app already serves: the deploy claims a canonical operation that ends
the governed build lane, and identical bytes end it just as thoroughly.
That applies to the site lane and to `bounded/runtime/deploy` and
`bounded/live/deploy` alike, and it does not depend on the size of the
changeset - the manifest a deploy carries (entry, dependencies, allowed hosts,
sandbox) is not part of that diff at all.
A launched app's declared boundaries are frozen for the same reason: they are
what the app's public trust surface reports as its enforced rules.

If the page says "Source is being prepared," the Open publication gate passed but the platform has no source manifest to show.
Inspect the manifest response first:

```bash
curl -i https://<workloadAppId>.bounded.page/__bounded/source/manifest.json
```

Its status and error body distinguish a missing synchronized repository from a
temporary source backend failure. Then enable source push and redeploy:

```bash
# bounded.json: { "sourcePush": true }   — or one-off:
bounded site deploy ./dist --with-source
```

Read the deploy output: `source synced: <sha>` proves the tree landed; a
source-sync warning means the site deployed but the source did not (a live
site alone does not prove the source manifest arrived).

For a canonical site deploy with source, also wait for `widget editing base
ready: ...`. That separate receipt proves the hosted widget can edit the exact
deployed frontend. If the site upload lands but the receipt fails, the CLI exits
nonzero and prints safe recovery guidance, including a deployment-pinned retry
or exact redeploy command when appropriate; do not assume the nonzero exit
rolled the site back. See
[Cloud Source Sync](../../bounded-deploy/docs/source-sync.md#canonical-sites-also-establish-the-widget-editing-base).

Download the published tree at `/__bounded/source.zip`.
The archive also contains the published constitution and deployed policy at its root.
It uses the same Open publication gate and fails instead of returning a partial archive.

Frontend variants are optional preview branches:

```bash
bounded site deploy ./dist --app-id <id> --variant var_alice_dashboard --variant-label "Alice dashboard"
```

Open `https://<slug>.bounded.page/__bounded/preview?variant=var_alice_dashboard`
to activate that branch for the current browser session. The app then returns to
the normal URL while the router serves that variant for the session. Owners can
review, roll back, and merge frontend branches with:

```bash
bounded site variants --app-id <id>
bounded site rollback --variant var_alice_dashboard --app-id <id>
bounded site promote var_alice_dashboard --app-id <id>
```

Variants are frontend-only. They cannot bypass backend permissions, functions,
data rules, or invariants.

## Version history and retention

Every successful canonical frontend version is restorable, whether it came
from `site deploy` or a prompt build/edit promotion - but history is BOUNDED:
the newest 10 versions are kept automatically, and everything older ages out
on later deploys or promotions. Pins are ADDITIONAL to the newest 10: pin any
version you may want to roll back to later, BEFORE it ages out.

```bash
bounded site versions --app-id <id>          # what is restorable, what is live, what is pinned
bounded site pin <deployId> --app-id <id>    # keep this version beyond the newest 10 (owner/admin)
bounded site unpin <deployId> --app-id <id>  # let it age out again
bounded site rollback <deployId> --app-id <id>
```

Rules of thumb:
- The LIVE version and the rollback target are always retained, even after a
  rollback makes an old version live again.
- Versions referenced by platform evidence (governed releases, active variant
  bases) are system-pinned automatically and never age out.
- When an old prompt-built version ages out, Bounded keeps only a compact
  internal completion receipt so a delayed promotion retry cannot reapply it;
  that receipt is not a restorable frontend version.
- User pins are bounded by a per-app cap; system pins never count against it.
- Rolling back to a version that aged out answers `410 site_deploy_expired`:
  run `bounded site versions` and pick a retained version instead. A `404`
  means the id never existed for this app.

## Typical flow
```bash
npm run build                              # produces ./dist
bounded site deploy ./dist --app-id <id>   # → https://<slug>.bounded.page after you claim a slug
# frontend calls its backend at https://<slug>-api.bounded.page/agents/<name>/<session>
```

For deployed private-site testing, expect normal Bounded login rather than
localhost auto-unlock.

That's the product surface: **`bounded deploy` (policy) + `bounded runtime deploy`
(backend code) + `bounded site deploy` (frontend)** on one app id.

## Per-route social cards (`ogRoutes`) — make shared links unfurl per resource

A static SPA serves the SAME `index.html` for every route, so by default *every*
shared link (Slack/iMessage/X/Discord/Facebook) unfurls with the one generic Open
Graph card baked into `index.html`. For an app with shareable user pages (a snapshot
`/s/:id`, a room `/r/:id`, a profile `/u/:handle`), that's the difference between a
viral surface and a wall of identical cards.

Declare an **`ogRoutes`** block in your `policy.json` and Bounded hosting will,
on every request to a matching path, fetch the target document **as an anonymous reader**
(so your collection's `read` rule is the authority) and stamp `og:title/description/image`
+ Twitter card tags + `<title>` into the served `<head>` — before any crawler or browser
sees it. No SSR server, no extra infra.

```jsonc
{
  // ... your collections / rules / invariants ...
  "snapshots/$id": {
    "fields": { "title": "String!", "caption": "String?", "imageUrl": "String?" },
    "rules": { "read": "true", /* create/update/delete ... */ }
  },

  "ogRoutes": [
    {
      "path": "/s/:id",            // the client route people share (a real PATH, not a #hash)
      "collection": "snapshots/:id", // doc path; :params are substituted from the path
      "title": "$.title",          // field selector into the resolved doc ("$.a.b" for nested)
      "description": "$.caption",
      "image": "$.imageUrl",
      // optional fallbacks if a field is empty (so a half-filled doc still cards):
      "defaultTitle": "My App",
      "defaultDescription": "Check this out",
      "defaultImage": "https://<slug>.bounded.page/og.png"
    }
  ]
}
```

Then `bounded deploy` as usual — the `ogRoutes` map ships with the policy; no
extra command is needed.

**Rules & guarantees**
- **Only public data ever surfaces.** The doc is read with `@user = null`, so a field
  only appears in a card if your collection's `read` rule authorizes an anonymous read
  (`"read": "true"`, or a rule that passes for a null user). If the rule denies, the link
  falls back to the generic `index.html` card — **non-public fields can never leak into meta**.
  This is the same runtime-enforced anonymous read rule that gates your data;
  there is no separate "make this public for cards" toggle to get wrong. Do not
  describe the rule itself as a blanket proof of product intent.
- **Path-based, not hash-based.** Use a real path route (`/s/:id`), not a hash fragment
  (`/#/s/:id`) — the server never sees the `#fragment`, so hash routes can't be unfurled.
  If you're on hash routing and want per-link cards, switch the shared route to a path.
  (Your SPA still works: an extensionless path falls back to `index.html` as before.)
- **Always-on, fail-open.** Injection runs for crawlers AND humans (one cached read on a
  matching path; non-matching paths like `/` or assets do zero extra work). Any miss,
  denied read, or error serves your original `index.html` unchanged — never a broken card.
- **`og:image`** can point at any public URL — e.g. a Bounded public file
  (`/storage/object?...`) or a static asset you shipped in `dist/`.

**Verify a link unfurls (crawler UA):**
```bash
curl -A "Twitterbot/1.0" https://<slug>.bounded.page/s/<id> | grep -iE 'og:|twitter:|<title>'
# → expect per-resource og:title / og:description / og:image + a per-resource <title>
```
