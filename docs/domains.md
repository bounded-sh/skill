# Domains — a nicer URL for your app

Every app is reachable at `https://<appId>.bounded.page` the moment you `bounded site deploy`.
That's ugly. Two ways to fix it.

## 1. Vanity subdomain — `<slug>.bounded.page` (free)

Claim one canonical vanity subdomain for your app:

```bash
bounded domains slug myapp --app-id <id>     # → https://myapp.bounded.page
bounded domains slug --release --app-id <id> # free it (raw <appId>.bounded.page still works)
```

- **Globally unique** (it's a subdomain). If the name is taken, the CLI prints a suggested
  alternative — pick another.
- **One canonical slug per app.** Changing it frees the old one. The raw
  `<appId>.bounded.page` URL *always* keeps working, so nothing breaks.
- Reserved labels (`www`, `api`, `auth`, `admin`, …) and raw-appId-shaped names are rejected.
- The slug is added to your app's `allowedOrigins` automatically, so auth + CORS work on the
  vanity domain with no extra setup.
- The API also serves at `<slug>-api.bounded.page` (mirrors `<appId>-api.bounded.page`).

Owner-only (your session token); writes the edge routing map + the durable record atomically.

## 2. Custom domain — `app.yourdomain.com` (Pro)

Bring a domain you own. We issue the SSL cert (Cloudflare for SaaS); you add DNS records.

```bash
bounded domains add app.yourdomain.com --app-id <id>
# → prints the DNS records to add at your registrar (CNAME + ownership/SSL TXT)
bounded domains list --app-id <id>      # check status: pending → active
bounded domains remove app.yourdomain.com --app-id <id>
```

Flow:
1. `add` creates the custom hostname and returns the **DNS records**. Add them at your
   registrar (a CNAME pointing your domain at the app, plus TXT records for ownership + the
   ACME SSL challenge).
2. Once DNS propagates, the cert validates automatically. `list` flips the domain to
   **active**; from then on `https://app.yourdomain.com` serves your app, and it's added to
   `allowedOrigins`.
3. `remove` deletes the hostname + cert + routing.

Notes:
- **Pro feature** — gated on your account plan (see [billing.md](billing.md)).
- **Frontend only for now** — custom domains serve your app's static site. To expose the API
  on your own domain, point a separate hostname (e.g. `api.yourdomain.com`) — coming as a
  follow-up; today use `<slug>-api.bounded.page`.
- Exact-host routing: each custom hostname maps to exactly one app; nothing is shared.

## How it routes (mental model)

All app assets live keyed by `appId`. A request's host is resolved to an `appId` at the edge:
`<slug>.bounded.page` and `app.yourdomain.com` both resolve to your `appId` (via a KV map the
CLI writes), then serve the same assets as `<appId>.bounded.page`. Unmapped hosts 404
(fail-closed) — a domain never serves the wrong app.
