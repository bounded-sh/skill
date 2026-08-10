# Domains — mapped public URLs for your app

Bounded hosted frontends are served through mapped hosts, not raw app-id labels.
Use a vanity slug or a custom domain for the public URL you give users.
The examples below show production `*.bounded.page` hosts.
Resolve the vanity host with `bounded domains list --app-id <id> --env <environment> --json` and use its nonempty `slugUrl`.
For staging provenance, require the JSON field itself instead of copying a human-rendered hostname.
A successful `bounded site deploy ... --env <environment> --json` receipt is the other URL-bearing source; retain its nonempty `url`.
`bounded apps inspect` proves the active policy/runtime publication and does not return a host.
When the intended environment returns a host such as `*.staging.bounded.page`, retain that exact host in deploy receipts, release markers, probes, and user-facing links.
Never replace a returned staging host with a synthesized production hostname.

> **Agents: claim a vanity slug by default.** Don't leave new apps on the raw
> app id. Immediately after `bounded deploy --create`, run
> `bounded domains slug <name-kebab-cased> --app-id <id>`. If the name is taken the CLI
> prints a suggested alternative — claim that instead. Then surface the
> `slugUrl` from `bounded domains list --app-id <id> --env <environment> --json` to the user (and deploy the site to it). It's free,
> reversible (`--release`), reserves the name, and wires `allowedOrigins` so auth/CORS work.
> No need to ask first.

## 1. Vanity subdomain — `<slug>.bounded.page` (free)

Claim one canonical vanity subdomain for your app:

```bash
bounded domains slug myapp --app-id <id>     # → https://myapp.bounded.page
bounded domains slug --release --app-id <id> # free it
```

- **Globally unique** (it's a subdomain). If the name is taken, the CLI prints a suggested
  alternative — pick another.
- **One canonical slug per app.** Changing it frees the old one. Do not publish
  raw app-id labels as compatibility URLs; use the current slug or a custom
  domain as the app's shareable address.
- Reserved labels (`www`, `api`, `auth`, `admin`, …) and raw-appId-shaped names are rejected.
- The slug is added to your app's `allowedOrigins` automatically, so auth + CORS work on the
  vanity domain with no extra setup.
- The API also serves at `<slug>-api.bounded.page`.
  This is a production example, not a source for staging site provenance.

Requires the `app:settings` control-plane capability (owner or admin by default);
registers the slug for the app atomically.

> **`domains remove` does NOT free a slug.** The two live in different places: a
> slug is `app.slug`, custom domains are `app.customDomains`, and
> `DELETE /app/:id/domains/:domain` only searches the latter. So
> `bounded domains remove myapp.bounded.page` on a slug returns
> **`404 domain_not_found`**, which reads like the slug is unmanaged rather than
> like you used the wrong command. Free a slug with
> `bounded domains slug --release --app-id <id>`.

### Moving a slug to a different app

Claiming a slug another app holds returns `409 slug_taken` with a suggested
alternative — including when the holder is your own dead app. The suggestion is
a nudge to pick a new name, not a statement that the original is unavailable to
you. To keep a stable public URL across a rebuild, release it from the old app
first, then claim it on the new one:

```bash
bounded domains slug --release --app-id <old-app-id>
bounded domains slug myapp --app-id <new-app-id>
```

Check who holds it with `bounded domains list --app-id <old-app-id>`; a slug is
listed there as `vanity slug`, distinct from any custom domains beneath it.

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
  [billing.md](../../bounded/docs/billing.md)). If the owner later loses Pro, Bounded may remove or
  disable custom domain links; keep a vanity `<slug>.bounded.page` URL available
  as the fallback.
- **Frontend only for now** — custom domains serve your app's static site. Use
  the app's Bounded API hostname for API calls.
- **Same privacy gate** — custom domains inherit the app's hosted-site privacy
  setting. `bounded site privacy private|public --app-id <id>` changes the
  vanity slug and active custom-domain static hosts together.
- **Root/apex domains** — the CLI may ask for a CNAME at `@`; if your DNS host
  rejects apex CNAMEs, use a subdomain like `www` or move the zone's nameservers
  to Cloudflare for CNAME flattening (Cloudflare and Namecheap handle this case).
- Each custom hostname maps to exactly one app; nothing is shared.

## How it routes (mental model)

All app assets live keyed by `appId`. Bounded resolves the request host to that
app, so `<slug>.bounded.page` and `app.yourdomain.com` serve the same published
frontend. The private-site gate is also keyed by `appId`, so it applies after
host resolution to every static host for the app. Unmapped hosts 404
(fail-closed) — a domain never serves the wrong app.

## Security headers on every served page

Bounded sets security headers on every static response it serves, for every app,
with no configuration and no way to opt out.
You do not add these yourself, and a `<meta http-equiv>` tag in your HTML will not
override them.

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: browsing-topics=()
Content-Security-Policy: frame-ancestors 'self' https://oapps.fun https://*.oapps.fun
                                          https://bounded.page
```

Two consequences worth knowing before you debug a blank page.

**Framing.** Your app may be embedded by itself and by a Bounded venue
(`oapps.fun` rooms and the `bounded.page` apex), and by nobody else.
That is what lets an oApps room show your live app inside its own page while a
random third-party site cannot frame it to phish your users.
The venue hosts are named explicitly, not a `*.bounded.page` wildcard, so a
sibling Bounded app on its own `*.bounded.page` subdomain is **not** a permitted
embedder and cannot frame you either.
If you need another embedder, that is a platform change, not something an app can
declare today.

**`nosniff`.** A browser will refuse an asset whose `Content-Type` does not match
how the page uses it, instead of guessing.
The one real failure this causes: an asset with an extension Bounded does not map
falls back to `application/octet-stream`, and loading it as a script is then
refused.
The fix is to give the file an extension Bounded maps (`.js`, `.mjs`, `.css`), not
to work around the header.

Device and payment capabilities are deliberately NOT restricted: `getUserMedia`,
geolocation, `PaymentRequest`, DRM playback, motion sensors and autoplay all keep
working, because an empty `Permissions-Policy` allow-list disables a feature for
the page itself and revoking those would break apps that legitimately use them.
