# Log an agent into a Bounded app for end-to-end testing

**Goal:** drive a deployed, *authenticated* Bounded app (Playwright / Puppeteer /
any headless browser) as a **real signed-in keypair user** — not anonymous — so
your test exercises policy-enforced reads and writes exactly like a human would.

You do **not** click through a login UI. You mint a real session with a keypair
and inject it into the page's `localStorage` before the app boots. The SDK
restores it on load and the app comes up already logged in.

## Why this works

The Bounded web SDK (`@bounded-sh/client`) persists its session in **two
`localStorage` keys**:

| key | value |
|---|---|
| `bounded_session_storage` | `{"address","accessToken","idToken","refreshToken","appId","issuer"}` |
| `bounded_last_auth_method` | which provider restores it on reload — use `"email"` (see note) |

The `bounded` CLI already mints a **real SIWS session** for any app, signed by
your local keypair (`~/.bounded/credentials`, or `$BOUNDED_PRIVATE_KEY`), and
caches it at **`~/.bounded/sessions.json`** keyed by `"<appId>:<address>"` with
fields `{ id_token, access_token, refresh_token, wallet, expires_at }`.

So the whole flow is: **CLI mints the token → shape it into those two keys →
browser injects them before page load → app restores a logged-in keypair user.**

> Use `bounded_last_auth_method: "email"` even for a wallet token. The email
> provider's `restoreSession()` only *decodes* the stored token (no wallet
> extension, works headless), and the token is a real wallet token so
> `@user.address` / `@user.id` are the keypair identity and policy writes pass.
> The `phantom` provider's restore needs `window.phantom` and won't restore in a
> bare headless browser.

## Step 1 — mint + cache a session (CLI)

Any read forces the CLI to sign in and cache the session for that app:

```bash
# uses ~/.bounded/credentials, or export BOUNDED_PRIVATE_KEY=<bs58 secret> first
bounded data get --app-id <APP_ID> --path __login_probe__ --limit 1 --json >/dev/null
# session now cached at ~/.bounded/sessions.json under "<APP_ID>:<address>"
```

To test as a *fresh, non-privileged* user, generate a throwaway keypair and pass
its bs58 secret as `BOUNDED_PRIVATE_KEY` before the read.

## Step 2 — inject and drive (Playwright)

```js
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function boundedSession(appId, { env = 'production', privateKey } = {}) {
  const e = { ...process.env, BOUNDED_ENV: env };
  if (privateKey) e.BOUNDED_PRIVATE_KEY = privateKey;
  execFileSync('bounded', ['data', 'get', '--app-id', appId, '--path', '__login_probe__', '--limit', '1', '--json'],
    { env: e, stdio: 'ignore' });                                   // mint + cache
  const all = JSON.parse(readFileSync(join(homedir(), '.bounded', 'sessions.json'), 'utf8'));
  const k = Object.keys(all).find((x) => x.startsWith(appId + ':'));
  const s = all[k];
  const claims = JSON.parse(Buffer.from(s.id_token.split('.')[1], 'base64url').toString());
  return {
    bounded_session_storage: JSON.stringify({
      address: s.wallet || claims['custom:walletAddress'],
      accessToken: s.id_token, idToken: s.id_token,
      refreshToken: s.refresh_token || '', appId, issuer: claims.iss,
    }),
    bounded_last_auth_method: 'email',
  };
}

const APP = '<APP_ID>';
const ls = boundedSession(APP);                          // mint
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(([k1, k2]) => {                  // seed BEFORE app JS runs
  localStorage.setItem('bounded_session_storage', k1);
  localStorage.setItem('bounded_last_auth_method', k2);
}, [ls.bounded_session_storage, ls.bounded_last_auth_method]);
const page = await ctx.newPage();
await page.goto(`https://${APP}.bounded.page`);          // loads already logged in
```

The page now restores the keypair session: `getCurrentUser()` returns the user,
`onAuthStateChanged` fires, and policy-enforced `set` / `setMany` succeed as that
identity. Keep the stored auth fields together so silent refresh works for long runs.

## Caveats

- **Wallet / guest apps**: fully headless — the keypair signs, no human step.
  This is the recommended setup for testable apps.
- **Email login** (inline `login()` / `sendEmailOtp` form, or hosted
  `loginWithRedirect`): an agent can't read the OTP email or drive the hosted page
  headlessly. Give the app a wallet/guest auth method for test builds — that's the
  recommended path.
- Agents running **in Node** (not a browser) don't need any of this — use
  `@bounded-sh/server`'s `createWalletClient({ keypair })` (or `BOUNDED_PRIVATE_KEY`)
  and call the SDK directly. This page is specifically for driving a **browser**
  as a signed-in user.

See also: [auth.md](auth.md) (end-user auth + the `@user` object),
[building-for-agents.md](../guides/building-for-agents.md),
[frontend-hosting.md](frontend-hosting.md).
