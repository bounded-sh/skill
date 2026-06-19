# Frontend hosting — publish a static site to `<app>.bounded.page`

Ship a built static frontend (Vite/Next-export/CRA/any `dist/`) to Bounded's edge —
no separate host, no DNS. Your app gets two free subdomains on the same SSL:

- **`<app>.bounded.page`** — your static site (served from R2, SPA fallback, hashed
  assets cached immutably, `index.html` always revalidated so deploys go live instantly).
- **`<app>-api.bounded.page`** — your backend runtime (see [backend-runtime.md](backend-runtime.md)),
  so the frontend can call its own agent/backend at a sibling URL with no CORS dance.

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
