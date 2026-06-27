# Domains — a nicer URL for your app

Every app is reachable at `https://<appId>.bounded.page` the moment you `bounded site deploy`.
That's ugly. Two ways to fix it.

> **Agents: claim a vanity slug by default.** Don't leave new apps on the raw
> `<appId>.bounded.page`. Immediately after `bounded deploy --create`, run
> `bounded domains slug <name-kebab-cased> --app-id <id>`. If the name is taken the CLI
> prints a suggested alternative — claim that instead. Then surface the
> `https://<slug>.bounded.page` URL to the user (and deploy the site to it). It's free,
> reversible (`--release`), reserves the name, and wires `allowedOrigins` so auth/CORS work.
> No need to ask first — the raw `<appId>` URL always keeps working as a fallback.

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

Owner-only (your session token); registers the slug for the app atomically.

## 2. Custom domain — `app.yourdomain.com` (Pro)

Bring a domain you own. Bounded issues the SSL cert; you add DNS records.

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
3. `remove` removes the custom hostname.

Notes:
- **Pro feature** — `add` is gated on the app owner's account plan (see
  [billing.md](billing.md)). If the owner later loses Pro, Bounded may remove or
  disable custom domain links; keep the raw `<appId>.bounded.page` or vanity
  `<slug>.bounded.page` URL available as the fallback.
- **Frontend only for now** — custom domains serve your app's static site. Use
  the app's Bounded API hostname for API calls.
- **Root/apex domains** — the CLI may ask for a CNAME at `@`; if your DNS host
  rejects apex CNAMEs, use a subdomain like `www` or move the zone's nameservers
  to Cloudflare for CNAME flattening (Cloudflare and Namecheap handle this case).
- Each custom hostname maps to exactly one app; nothing is shared.

## How it routes (mental model)

All app assets live keyed by `appId`. Bounded resolves the request host to that
app, so `<slug>.bounded.page` and `app.yourdomain.com` serve the same published
frontend. Unmapped hosts 404 (fail-closed) — a domain never serves the wrong app.
