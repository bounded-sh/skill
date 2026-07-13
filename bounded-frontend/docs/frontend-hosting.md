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
  to that account — e.g. a linked CLI key's apps — resolve server-side). There
  is no local-key/daemon auto-pass through the gate. Use `--public` during app
  creation when the site should be public from the start. Existing apps stay as
  they were. After creation, flip or inspect the gate with
  `bounded site privacy private|public|status --app-id <id>`, **or** flip it
  from the in-app Bounded widget's always-visible privacy toggle (cloud-backed;
  no local daemon required). The setting applies to every mapped static host
  that resolves to the app: vanity slug and active custom domains. API hosts
  are not gated. The private-site gate page itself tells owners and visitors
  how to make the app public.
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

## Public source page for launched oApps

`/__bounded/source` is the public browser for an oApp's synchronized source
tree and change history. It serves the source revision stored by the platform
through live-edit artifacts. It does not reconstruct source from the hosted
`dist` directory or read an unsynchronized local checkout.

The launched-oApp gate applies before any source is returned. An unlaunched app
gets `404` on every source route. After launch, the source page is public even
when the normal hosted site is private.

If the page says "Source is being prepared," the launch gate passed but the
platform has no source manifest to show. Inspect the manifest response first:

```bash
curl -i https://<slug>.bounded.page/__bounded/source/manifest.json
```

Its status and error body distinguish a missing synchronized repository from a
temporary source backend failure. Then check the registered settings, opt in to
source tracking and push, and run a live-edit deploy:

```bash
bounded live-edit list
bounded live-edit register --app-id <id> --repo . \
  --origin https://<slug>.bounded.page \
  --artifacts on --source-provider artifacts --artifact-push on
bounded live-edit deploy --app-id <id>
```

Read the deploy output for a source-sync warning. The frontend deploy can
succeed when source sync is unavailable, so a live site does not prove that the
source manifest arrived. A plain `bounded site deploy` uploads the static build;
it does not replace the live-edit source sync step.

Download the published tree at `/__bounded/source.zip`. The archive also
contains the published constitution and deployed policy at its root. It uses
the same launched-oApp gate and fails instead of returning a partial archive.

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

## Typical flow
```bash
npm run build                              # produces ./dist
bounded site deploy ./dist --app-id <id>   # → https://<slug>.bounded.page after you claim a slug
# frontend calls its backend at https://<slug>-api.bounded.page/agents/<name>/<session>
```

Agents should keep `bounded dashboard --no-web` or `bounded dev --app-id <id>`
running while testing local live-edit, the privacy toggle, or local dashboard
flows. For deployed private-site testing, expect normal Bounded login rather
than localhost auto-unlock.

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
