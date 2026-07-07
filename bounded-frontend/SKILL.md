---
name: bounded-frontend
description: >-
  Wire a web or React Native frontend to Bounded: the @bounded-sh/client SDK
  (reads, writes, subscriptions, queries), hosted static frontends, and end-user
  auth UI (email OTP, OAuth, guest/anonymous accounts and upgrade). Use when
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

## Task Router

| User task | Read |
|---|---|
| SDK calls, reads, writes, and subscriptions | [docs/sdk-reference.md](docs/sdk-reference.md) |
| Build a web app frontend | [docs/building-a-webapp.md](docs/building-a-webapp.md) |
| Build for React Native / mobile | [docs/building-for-react-native.md](docs/building-for-react-native.md) |
| Bounded Auth, email OTP, OAuth, guest users, optional text OTP, **Solana wallet login** (connect wallet, `walletLogin`, `authMethod:'phantom'`) | [docs/auth.md](docs/auth.md) |
| Anonymous users, invite links, account upgrade | [docs/anonymous-accounts.md](docs/anonymous-accounts.md) |
| Hosted frontend and app URLs | [docs/frontend-hosting.md](docs/frontend-hosting.md) |

## Term Router

| If you see | Read |
|---|---|
| `getPage`, `queryAggregate`, `count`, filters, sort, cursor | [docs/sdk-reference.md](docs/sdk-reference.md) |
| `set(path, null)`, delete, `setMany` | [docs/sdk-reference.md](docs/sdk-reference.md#delete--setpath-null) |
| `bounded link`, `bounded login`, email OTP, OAuth, guest sign-in | [docs/auth.md](docs/auth.md) |
| `walletLogin`, `authMethod:'phantom'`, connect wallet, Phantom / Wallet-Standard login | [docs/auth.md](docs/auth.md#solana-wallet-login-opt-in) |

## Rules Of Thumb

- Every client write is governed by policy; a `403` on a write is a rule denial, not a client bug. See the bounded-backend skill for the rule.
- Denied reads return empty `200` responses, never `403`.
- Put provider API keys in Bounded secrets (backend), never in frontend code.
- Give every login a wallet only when the app needs onchain identity; see the bounded-onchain skill for `@user.address`.
