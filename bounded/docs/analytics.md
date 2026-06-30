# Per-app product analytics — traffic, web vitals, and errors for your hosted site

Every site hosted on Bounded (`<slug>.bounded.page` or a mapped custom domain) gets
**privacy-respecting product analytics for free** — no script to add, no third-party
tag, no cookie banner. The hosting edge captures it and an **owner-gated read API**
returns it. Data is keyed by your **appId**, so you only ever see your own app.

## What's tracked

Two capture surfaces feed one dataset:

**1. Edge request tracking (server-side, automatic).** Every served request to your
site is recorded at the edge: status family (`2xx`/`4xx`/`5xx`), bucketed path, country,
Cloudflare colo, browser family, device class, byte size, and serve duration. This works
even for non-JS clients and bots, and needs nothing in your bundle.

**2. Client RUM (in-page agent, auto-injected).** A tiny (~6 KB) script is injected into
your served HTML only (never the gate page, control endpoints, or your API). It beacons:

- `page_view` / `route_view` — initial load + SPA route changes (`pushState`/`popstate`).
- `performance` — Core Web Vitals: **FCP, LCP, INP, CLS, TTFB**, plus engaged seconds.
- `js_error` / `unhandled_rejection` — runtime errors (message scrubbed, see below).
- `resource_error` — failed image/script/style loads.
- `api_error` — any `fetch`/XHR your app makes that returns ≥400 or network-fails.
- `custom_event` — your own events via `window.BoundedAnalytics.track('name', { ... })`.

Beacons POST to `/__bounded/analytics` (same-origin, `sendBeacon`, `credentials: omit`);
the agent is served at `/__bounded/analytics.js`.

## Privacy hygiene (built in)

- **No raw identifiers stored.** Visitor and session ids are generated client-side and
  **FNV-hashed** before storage — the dataset holds opaque hashes, never the id itself.
- **Path bucketing.** URL path segments are normalized so high-cardinality / PII-ish
  values never land in the dataset: numeric → `:num`, hex/long tokens → `:id`, anything
  containing `@` → `:redacted`. Query strings and fragments are dropped entirely.
- **Secret/PII scrubbing on errors.** Error messages are truncated to a short prefix with
  emails → `[email]`, base58-ish ids → `[id]`, and `bearer/token/secret/password/key=…`
  → `…=[redacted]`, on **both** the client and the edge.
- **No PII columns, fixed-length truncation, per-event-class sampling**, and the agent
  ignores its own endpoint to avoid feedback loops.

## Read API

`GET /app/:id/analytics` on the developer API (owner/collaborator gated — same auth as
`/app/:id/metrics/*`). Query params:

| Param    | Values | Default |
|----------|--------|---------|
| `range`  | `1h` `6h` `24h` `3d` `7d` | `24h` |
| `metric` | `all` `summary` `timeseries` `pages` `errors` `devices` `countries` `referrers` | `all` |
| `limit`  | `1`–`50` (top-N rows for breakdowns) | `10` |

Returns a JSON bundle:

- `summary` — events, page/route views, unique visitors + sessions, error counts
  (api/resource/js), and average duration / TTFB / FCP / LCP / INP / CLS, engaged seconds.
- `timeSeries` — bucketed counts (events, views, errors, visitors, sessions) over the range.
- `topPages` — most-visited bucketed paths with visitors + error counts.
- `errors` — grouped by event + failure class + diagnostic + path, with last-seen.
- `devices` / `countries` / `referrers` — top dimension breakdowns.

When the analytics dataset hasn't received data yet (or isn't provisioned), the API
returns the same shape with zeroed values and a `metadata.message` hint rather than erroring.

> Analytics reads come from an aggregation pipeline and can **lag writes by seconds to a
> couple of minutes** — a brand-new event won't appear instantly. Counts are
> sample-interval-weighted estimates, not exact transactional counters.

## Notes

- Analytics is **strictly additive** to hosting — every write is fire-and-forget and a
  failure can never affect what your visitors are served.
- It is **on by default** for hosted sites. There is no per-visitor cookie and no
  cross-site identifier.
