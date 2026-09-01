---
name: bounded-frontend
description: >-
  Wire a web or React Native frontend to Bounded: the @bounded-sh/client SDK
  (reads, writes, subscriptions, queries), hosted static frontends, and end-user
  auth UI (email OTP, OAuth, browser guest/anonymous accounts and upgrade). Use when
  building the client of a Bounded app or handling how end users sign in. Part of
  the Bounded skill family; server-side rules, functions, and the actor model live
  in the bounded-backend skill, and deploy/hosting config in bounded-deploy.
---

# Bounded frontend

The client side of a Bounded app: the SDK your web or mobile app calls, how end
users authenticate, and how the hosted frontend is served. Policy still governs
every write from the client, so pair this with the **bounded-backend** skill when
a client action needs a rule or invariant, and **bounded-deploy** for hosting and
domains. To route across the family, see the root **bounded** skill.

## Reference Router

Read only the row matching the current task or term.

| Task or term | Read |
|---|---|
| SDK reads, writes, subscriptions, paging, `queryAggregate`, `count`, filters, sort, cursor, `setMany`, `set(path, null)` | [SDK reference](docs/sdk-reference.md) |
| Build a web frontend | [web app guide](docs/building-a-webapp.md) |
| Local dev server (`npm run dev`, Vite, localhost), login popup fails, `redirect_uri origin is not a registered origin`, CORS during local development | [develop on localhost](docs/building-a-webapp.md#develop-on-localhost) |
| Build for React Native / mobile | [React Native guide](docs/building-for-react-native.md) |
| App-user email OTP, OAuth, `openBoundedWidget`, unified login widget, default Turnkey auth | [app auth](docs/app-auth.md) |
| Bring-your-own wallet login; `walletLogin`, `authMethod:'phantom'`, Phantom / Wallet-Standard | [wallet login](docs/auth.md#solana-wallet-login-bring-your-own) |
| Wallet login lost on refresh, `getCurrentUser()` null after reload, `bounded_last_auth_method`, session restore method | [wallet login](docs/auth.md#solana-wallet-login-bring-your-own) - "Wallet sessions survive reloads" |
| Guests, anonymous users, invite links, account upgrade | [anonymous accounts](docs/anonymous-accounts.md) |
| Hosted frontend and app URLs | [frontend hosting](docs/frontend-hosting.md) |
| CLI developer login or `bounded login` | [developer accounts](../bounded-deploy/docs/accounts.md) |
| Embedded wallet, `auth.wallets`, `@user.address` after email/social login | [embedded wallets](../bounded-onchain/docs/embedded-wallets.md) |
| `onramp()`, buy SOL/USDC by card, Coinbase Onramp, wallet top-up | [onramp](../bounded-onchain/docs/onramp.md) |

## Rules Of Thumb

- Every client write is governed by policy; a `403` on a write is a rule denial, not a client bug. See the bounded-backend skill for the rule.
- Denied reads return empty `200` responses, never `403`.
- Batch reads for lists of computed values with `runQueryMany`; never map `runQuery` over a list. See [sdk-reference.md](docs/sdk-reference.md#batch-your-queries).
- Put provider API keys in Bounded secrets (backend), never in frontend code.
- **A moderate `uuid` advisory (GHSA-w5hq-g745-h8pq) rides in transitively through `@solana/web3.js -> jayson`, with no upstream fix.** Do not chase it through dependency bumps; add the app-level `overrides`/`resolutions` snippet in [sdk-reference.md](docs/sdk-reference.md#npm-audit-reports-a-moderate-uuid-advisory---here-is-the-fix), which makes `npm audit --omit=dev` exit 0. The vulnerable code path is unreachable through the SDK.
- **Keep the auth defaults for most apps.** Do not add `authMode` or `auth.wallets` to "enable wallets": default Turnkey email/social login already carries `@user.address`. Deploy `"auth": { "wallets": true }` only for an EXTERNAL-keypair session (bring-your-own wallet login, a server-SDK keypair client, the CLI keypair data lane). Full rule and the opt-outs: [embedded-wallets.md](../bounded-onchain/docs/embedded-wallets.md#the-recommended-login-for-an-onchain-app).
- **`@user.id` (the account id) is identity/ownership; `@user.address` is the wallet.** Key ownership, membership, and auth guards on `@user.id` (always present). Reach for `@user.address` only for wallet/onchain semantics - never as the identity key.
