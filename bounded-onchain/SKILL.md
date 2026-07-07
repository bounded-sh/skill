---
name: bounded-onchain
description: >-
  Add onchain to a Bounded app: Solana and EVM collections, embedded
  non-custodial wallets (@user.address on every login, Crossmint), client- and
  server-signed transactions, DEX/perps trading patterns, and crypto payments
  (accept USDC/crypto non-custodially, Bounded Pay for card/fiat). Use for wallet,
  token, on-chain transaction, or crypto/fiat payment work. Part of the Bounded
  skill family; policy and the actor model live in bounded-backend.
---

# Bounded onchain

Wallets, tokens, on-chain transactions, and payments. `@user.address` is the
wallet identity (null for email-only logins unless the app gives every login an
embedded wallet). On-chain writes still pass their policy rules and invariants
first, so pair this with the **bounded-backend** skill for the governing rules. To
route across the family, see the root **bounded** skill.

## Task Router

| User task | Read |
|---|---|
| Onchain data / Solana collections | [docs/onchain.md](docs/onchain.md) |
| Trading patterns (Phoenix perps, DEX swaps, server-signed execution) | [docs/onchain-trading.md](docs/onchain-trading.md) |
| Give every login a wallet (`@user.address` for email users), embedded/non-custodial wallets, Crossmint | [docs/embedded-wallets.md](docs/embedded-wallets.md) |
| Accept crypto / USDC, `payments.acceptCrypto`, get paid to a wallet non-custodially, seller settlement + notification, direct-transfer rail, card→crypto rail seam | [docs/accept-crypto.md](docs/accept-crypto.md) |
| Bounded Pay (accept card payments, Stripe Connect, fiat) | [docs/bounded-pay.md](docs/bounded-pay.md) |

## Term Router

| If you see | Read |
|---|---|
| `onchain:true`, `--protocol`, Solana, mainnet permit | [docs/onchain.md](docs/onchain.md) |
| `@user.address`, embedded wallet, Crossmint | [docs/embedded-wallets.md](docs/embedded-wallets.md) |
| `payments.acceptCrypto`, USDC, seller settlement, direct-transfer rail | [docs/accept-crypto.md](docs/accept-crypto.md) |
| `payment`, `checkout`, `seller`, `merchant`, `subscription`, `Stripe`, `/connect/onboard`, `/connect/status`, `/connect/checkout`, `/connect/session` | [docs/bounded-pay.md](docs/bounded-pay.md) |

## Rules Of Thumb

- Use `@user.address` only for wallet/onchain semantics; use `@user.id` for normal ownership. See the bounded-backend skill.
- For onchain writes, use explicit network/RPC configuration and devnet by default; do not treat immediate read-after-write as confirmation.
- Bounded Pay's 1% platform fee is in addition to Stripe's own processing fees.
- Crypto is accepted non-custodially; sellers settle to their own wallet.
