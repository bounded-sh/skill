---
name: bounded-onchain
description: >-
  Add onchain to a Bounded app: Solana and EVM collections, embedded
  non-custodial wallets for email/social users (@user.address, Crossmint),
  client- and server-signed transactions, DEX/perps trading patterns, and crypto payments
  (accept USDC/crypto non-custodially, Bounded Pay for card/fiat). Use for wallet,
  token, on-chain transaction, or crypto/fiat payment work. Part of the Bounded
  skill family; policy and the actor model live in bounded-backend.
---

# Bounded onchain

Wallets, tokens, on-chain transactions, and payments. The **canonical Bounded
email/social login can include a wallet**: turn on `auth.wallets` (Crossmint,
non-custodial) and supported email/social logins carry a real `@user.address` - see
[docs/embedded-wallets.md](docs/embedded-wallets.md). `@user.id` (the account id)
stays the identity/ownership key; `@user.address` is the wallet. On-chain writes
still pass their policy rules and invariants first, so pair this with the
**bounded-backend** skill for the governing rules. To route across the family, see
the root **bounded** skill.

## Task Router

| User task | Read |
|---|---|
| Onchain data / Solana collections | [docs/onchain.md](docs/onchain.md) |
| Solana function catalog, devnet support, live verification status, blocked integrations, or "does this plugin work on devnet?" | [docs/solana-capability-status.md](docs/solana-capability-status.md) |
| Onchain mirror/indexer, Helius webhook, missed transaction, outage catch-up, replay, reconciliation, or DLQ recovery | [docs/onchain.md](docs/onchain.md#mirror-completeness) |
| "Transaction too large", verify/deploy rejected for **transaction size**, 413 on an onchain write, hook over the 1182/1232-byte limit, splitting hooks, argument/string bytes, lookup tables | [docs/onchain.md → Transaction-size limit](docs/onchain.md#transaction-size-limit-one-hook--one-solana-transaction) |
| Policy upgrade governance, immutable apps, controller policies, manifest signing, stuck update sessions, or governance recovery | [docs/onchain.md](docs/onchain.md#policy-upgrade-governance-runtime-v3) |
| Policy-native bytes, PDAs, account reads, exact-rent account creation, landed invariant-denial proof, `shouldSubmitTx: false`, exact wallet-bound review, query-result predicates, deployed ProgramData evidence, `get`, `getAfter`, onchain `@DocumentPlugin.updateField`, `@contract.address`, app escrow address resolution, generic CPI, cross-app reads/writes, prediction-market arithmetic, runtime capability gates, or Poofnet/onchain parity | [docs/policy-primitives.md](docs/policy-primitives.md) |
| Onchain update payloads, patch semantics, readonly `!` fields, or `FieldReadOnly` | [docs/onchain.md](docs/onchain.md#onchain-updates-are-patches) |
| Ambiguous Solana custom errors, stale numeric decoding, or an Anchor error name in live logs | [docs/onchain.md](docs/onchain.md#diagnose-custom-errors-by-the-live-anchor-log-name) |
| Real-network rent, ATA creation, passthrough storage, PDA signing, transaction limits, or Poofnet-only success | [docs/policy-primitives.md](docs/policy-primitives.md#real-network-resource-budget) |
| Trading patterns (Phoenix perps, DEX swaps, server-signed execution) | [docs/onchain-trading.md](docs/onchain-trading.md) |
| Randomness, VRF, a gacha/raffle/shuffle, `isRevealPath`, or making a DRAW provable rather than just the number. **The roll is READABLE before anyone acts on it**, so read this before designing the pool it draws from | [docs/randomness.md](docs/randomness.md) |
| **Launch a token** on Meteora - Dynamic Bonding Curve, anti-snipe fee decay, creator/partner fee split, graduation/migration to DAMM v2, claiming fees (`createMeteoraConfig`, `createMeteoraVirtualPool`, `claimDammV2PoolFees`, `withdrawLeftover`) | [docs/meteora-token-launch.md](docs/meteora-token-launch.md) |
| **Split fees between 3+ parties**: the current canonical 10/20/20/50 venue/creator/steward/app-reserve model, its proven treasury ledger and permissionless distribute, or the historical 55/25/20 treasury/creator/Poof worked example | [docs/oapps-tokenomics-fee-split.md](docs/oapps-tokenomics-fee-split.md) |
| **Sweep fees / run an onchain job on a schedule** - the keeper pattern (offchain schedule → function `actAs` a signer → onchain write, because schedules are rejected on onchain collections), permissionless = reliability-only | [docs/oapps-tokenomics-fee-split.md → the keeper](docs/oapps-tokenomics-fee-split.md#the-keeper--offchain-schedule--function--onchain-write) |
| **Fund build/AI spend from earned fees** - a fee-funded build allowance capped by a proven `rollingSum` burn cap on an append-only log | [docs/oapps-tokenomics-fee-split.md → build allowance](docs/oapps-tokenomics-fee-split.md#the-fee-funded-build-allowance--a-proven-rolling-burn-cap) |
| **Give supported email/social logins an embedded wallet** (`@user.address`), Crossmint, `auth.wallets` | [docs/embedded-wallets.md](docs/embedded-wallets.md) |
| Let users **connect their own Solana wallet** (Phantom / Wallet-Standard) to log in - "connect wallet", wallet login, `walletLogin`, `authMethod:'phantom'`, real wallet as `@user.address`, local `signMessage`/`signTransaction` - the **bring-your-own companion** to the canonical login | [auth.md → Solana wallet login](../bounded-frontend/docs/auth.md#solana-wallet-login-bring-your-own) |
| **Fund a user's wallet with fiat** — `onramp()`, buy SOL/USDC with a card, Coinbase Onramp, "top up", fiat → crypto for the embedded wallet | [docs/onramp.md](docs/onramp.md) |
| Accept crypto / USDC, `payments.acceptCrypto`, get paid to a wallet non-custodially, seller settlement + notification, direct-transfer rail, card→crypto rail seam | [docs/accept-crypto.md](docs/accept-crypto.md) |
| Bounded Pay (accept card payments, Stripe Connect, fiat) | [docs/bounded-pay.md](docs/bounded-pay.md) |

## Term Router

| If you see | Read |
|---|---|
| `onchain:true`, `--protocol`, Solana, mainnet permit | [docs/onchain.md](docs/onchain.md) |
| compiler support, deployed support, devnet status, supported, unsupported, blocked, unverified, Jupiter, Phoenix, DFlow, Kamino, Pump.fun, PumpSwap, Tensor, SPL stake pool, liquid staking, Raydium, CPMM, Meteora DLMM | [docs/solana-capability-status.md](docs/solana-capability-status.md) |
| "Transaction too large", tx-size gate, packet limit, 1232, oversized hook | [docs/onchain.md → Transaction-size limit](docs/onchain.md#transaction-size-limit-one-hook--one-solana-transaction) |
| Helius, indexer, mirror, reconciliation debt, missed transaction, replay, cursor, tombstone, DLQ | [docs/onchain.md](docs/onchain.md#mirror-completeness) |
| `governance.upgrade`, policy controller, immutable, manifest root, governed session, recovery, extend, cancel | [docs/onchain.md](docs/onchain.md#policy-upgrade-governance-runtime-v3) |
| `@CPI`, `@Solana`, `@Bytes`, `@App`, `@DocumentPlugin.updateField`, `get`, `getAfter`, `@PredictionMarketPlugin`, `getYesTokenOutAmm`, `getCollateralOutAmm`, `shouldSubmitTx`, `skipPreflight`, ProgramData, `@contract.address`, `@AccountPlugin.getAccountAddress`, generic CPI, custom program, PDA seeds, account data, cross-app, runtime v2, Poofnet parity | [docs/policy-primitives.md](docs/policy-primitives.md) |
| `FieldReadOnly`, readonly `!` update, onchain patch | [docs/onchain.md](docs/onchain.md#onchain-updates-are-patches) |
| Anchor error name, ambiguous custom error number, stale IDL error table | [docs/onchain.md](docs/onchain.md#diagnose-custom-errors-by-the-live-anchor-log-name) |
| `@OraclePlugin`, `requestRandomness`, `getRandomNumber`, `isRevealPath` | [docs/randomness.md](docs/randomness.md) |
| rent, ATA, token account, insufficient SOL, PDA address, passthrough, transaction too large | [docs/policy-primitives.md](docs/policy-primitives.md#real-network-resource-budget) |
| `createMeteoraConfig`, `createMeteoraVirtualPool`, Dynamic Bonding Curve, DBC, bonding curve, anti-snipe / fee decay, token launch, launchpad, graduation, migrate, DAMM v2, `claimDammV2PoolFees`, `withdrawLeftover`, `getDammV2PoolAddress` | [docs/meteora-token-launch.md](docs/meteora-token-launch.md) |
| 3-way / multi-party fee split, canonical 10/20/20/50 venue/creator/steward/app-reserve, proven treasury ledger, permissionless distribute, historical 55/25/20 treasury/creator/Poof, `feepool` PDA, `mulDivFloor`, phase asymmetry, `distributionsPost` | [docs/oapps-tokenomics-fee-split.md](docs/oapps-tokenomics-fee-split.md) |
| keeper, scheduled onchain write, `schedule` + `actAs`, offchain → function → onchain, "schedule rejected on onchain collection", crank, sweep fees, `rollingSum` build allowance, fee-funded build credit | [docs/oapps-tokenomics-fee-split.md](docs/oapps-tokenomics-fee-split.md) |
| `walletLogin`, `authMethod:'phantom'`, connect wallet, Phantom login, Wallet-Standard, `window.solana`, SIWS wallet login | [auth.md → Solana wallet login](../bounded-frontend/docs/auth.md#solana-wallet-login-bring-your-own) |
| `@user.address`, embedded wallet, Crossmint | [docs/embedded-wallets.md](docs/embedded-wallets.md) |
| `payments.acceptCrypto`, USDC, seller settlement, direct-transfer rail | [docs/accept-crypto.md](docs/accept-crypto.md) |
| `payment`, `checkout`, `seller`, `merchant`, `subscription`, `Stripe`, `/connect/onboard`, `/connect/status`, `/connect/checkout`, `/connect/session`, `/connect/subscription`, `/connect/subscription/cancel` | [docs/bounded-pay.md](docs/bounded-pay.md) |

## Rules Of Thumb

- **Default onchain login = `auth.wallets` + wallet login, side by side.** Turn on `{ "auth": { "wallets": true } }` in policy so email/social users get a Crossmint wallet (the primary path), and add bring-your-own **wallet login** (`walletLogin`) for users who already hold a Solana wallet. See [docs/embedded-wallets.md → recommended login](docs/embedded-wallets.md#the-recommended-login-for-an-onchain-app). Prescribe this for any onchain app.
- Use `@user.address` only for wallet/onchain semantics; use `@user.id` for normal ownership. See the bounded-backend skill.
- For onchain writes, use explicit network/RPC configuration and devnet by default; do not treat immediate read-after-write as confirmation.
- Mainnet is a real target, not a placeholder: the program is live on mainnet-beta. Creating a mainnet app requires a paid account plan (no API key or shared secret), and the app is owned on-chain by the creator's wallet **immutably** - so it must be created from the machine holding that wallet's key, and it can never be ownership-transferred. See [docs/onchain.md](docs/onchain.md).
- `@contract.address` is the Solana program-ID sentinel, not the app escrow address returned by a direct query.
  Supported built-in plugins resolve the sentinel to the app escrow PDA.
  On the current deployed Devnet runtime, do not compose the sentinel as `@AccountPlugin.getAccountAddress(@contract.address)`: that call fails because the sentinel is address-typed while this function currently accepts a string account id.
  For a Devnet policy query that needs the concrete escrow address, bind the current Devnet program ID as a string literal: `@AccountPlugin.getAccountAddress("openTv7fbpYSseNHYmCZFZ1CZgj4r8D9fKNgEz1qo6F")`.
  This literal is Devnet-specific and must be updated if the deployed program changes.
  See [policy-primitives.md](docs/policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address).
- Treat discovery, deployed-runtime support, and live-network verification as three independent states.
- Check the [Solana devnet capability catalog](docs/solana-capability-status.md) before proposing any plugin or primitive.
- Never infer devnet support from a compiler tag, manifest, proof contract, Poofnet model, lookup-table entry, or local validator test.
- When live evidence uses a hosted release marker, resolve its environment-qualified site URL from `bounded domains list --app-id <id> --env <environment> --json` `slugUrl` or the exact successful site-deploy receipt `url`.
  Require the JSON field itself for staging evidence instead of copying a human-rendered hostname.
  `bounded apps inspect` proves the active policy/runtime publication and carries no hosted URL.
- Never emit runtime-v2 primitives for a runtime-v1 deployment; follow [docs/policy-primitives.md](docs/policy-primitives.md).
- Current chain-backed named queries belong on `onchain: true` paths and require an authenticated `userAddress` at execution time.
- Do not recommend an `onchain: false` view for an offchain-only plugin read until standalone chain-query execution is fixed.
- Treat runtime-v3 governance the same way: enroll only after the deployed capability registry reports v3, and publish governance from observed chain state rather than policy intent.
- Keep Poofnet and Solana behavior paired.
- Pure/read primitives must return the same shape in runtimes where they are actually executable, and mutating primitives must apply a modeled effect or fail closed.
- Validation-only success is a parity bug.
- Helius mirroring is environment-level Bounded infrastructure: one raw program webhook per environment/network, never one per app. Do not ask app builders to create webhook URLs or supply provider secrets; follow the operator checklist in [docs/onchain.md](docs/onchain.md#mirror-completeness).
- Bounded Pay's 1% platform fee is in addition to Stripe's own processing fees.
- Crypto is accepted non-custodially; sellers settle to their own wallet.
