# Frontend hosting — publish a static site to `<app>.bounded.page`

Ship a built **static** frontend (Vite/CRA/any `dist/`) to Bounded's edge —
no separate host, no DNS. Your app gets two free subdomains on the same SSL:

- **`<app>.bounded.page`** — your static site (served from R2, SPA fallback;
  content-hashed assets cached immutably, HTML + un-fingerprinted assets always
  revalidated so a redeploy goes live instantly without a hard-refresh).
- **`<app>-api.bounded.page`** — your backend runtime (see [backend-runtime.md](backend-runtime.md)),
  so the frontend can call its own agent/backend at a sibling URL with no CORS dance.

## What it CAN and CANNOT host

Bounded serves your files from R2 **exactly as uploaded — it never executes them**.
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
`<app>-api.bounded.page` ([functions.md](functions.md), [backend-runtime.md](backend-runtime.md)).
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
- Live in seconds at `https://<app>.bounded.page`.

## Typical flow
```bash
npm run build                              # produces ./dist
bounded site deploy ./dist --app-id <id>   # → https://<app>.bounded.page
# frontend calls its backend at https://<app>-api.bounded.page/agents/<name>/<session>
```

That's the whole product surface: **`bounded deploy` (policy) + `bounded runtime deploy`
(backend code) + `bounded site deploy` (frontend)** — all through us, all on one app id.
