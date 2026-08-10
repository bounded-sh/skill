---
name: bounded-onchain
description: >-
  Add onchain to a Bounded app: Solana and EVM collections, embedded
  non-custodial wallets for email/social users (@user.address, Turnkey by default),
  client- and server-signed transactions, DEX/perps trading patterns, and crypto payments
  (accept USDC/crypto non-custodially, Bounded Pay for card/fiat). Use for wallet,
  token, on-chain transaction, or crypto/fiat payment work. Part of the Bounded
  skill family; policy and the actor model live in bounded-backend.
---

# Bounded onchain

Wallets, tokens, on-chain transactions, and payments. The **canonical Bounded
email/social login includes a wallet by default**: keep the default Turnkey auth
and supported email/social logins carry a real `@user.address` - see
[docs/embedded-wallets.md](docs/embedded-wallets.md). `@user.id` (the account id)
stays the identity/ownership key; `@user.address` is the wallet. On-chain writes
still pass their policy rules and invariants first, so pair this with the
**bounded-backend** skill for the governing rules. To route across the family, see
the root **bounded** skill.

## Reference Router

Read only the row matching the current task or term.

| Task or term | Read |
|---|---|
| Onchain collections, `onchain:true`, `--protocol`, Solana, mainnet permit, patches, readonly `!`, `FieldReadOnly` | [onchain](docs/onchain.md) |
| Compiler vs deployed support, devnet status, blocked or unverified integrations (Jupiter, Phoenix, DFlow, Kamino, Pump.fun, PumpSwap, Tensor, SPL stake pool, liquid staking, Raydium CPMM, Meteora DLMM), runtime-v4 gating | [capability status](docs/solana-capability-status.md) |
| Helius, mirror/indexer, missed transactions, eventual consistency, unmirrored writes; who owns webhooks, ingest queue/DLQ, recovery and reconciliation | [mirror completeness](docs/onchain.md#mirror-completeness) |
| Transaction too large, 413, 1182/1232-byte packet limit, oversized hook, lookup tables | [transaction-size limit](docs/onchain.md#transaction-size-limit-one-hook--one-solana-transaction) |
| `governance.upgrade`, immutable/controller policy, manifest root, governed session, recovery, extend, cancel | [runtime-v3 governance](docs/onchain.md#policy-upgrade-governance-runtime-v3) |
| `@CPI`, `@Solana`, `@Bytes`, `@App`, `@DocumentPlugin.updateField`, `@PredictionMarketPlugin`, PDAs, `get`/`getAfter`, ProgramData, `shouldSubmitTx`, `skipPreflight`, `@contract.address`, `@AccountPlugin.getAccountAddress`, generic CPI, cross-app, prediction-market arithmetic, runtime parity, `@Solana.verifyEd25519`, `@Solana.secp256k1Recover`, `@Bytes.sha256`, `@Bytes.keccak256`, signature verification, EVM signer recovery | [policy primitives](docs/policy-primitives.md) |
| Anchor/custom errors or stale numeric decoding | [custom-error diagnosis](docs/onchain.md#diagnose-custom-errors-by-the-live-anchor-log-name) |
| Trading, Phoenix perps, DEX swaps, server-signed execution | [onchain trading](docs/onchain-trading.md) |
| Escrow custody, `source` argument, per-entity funds, named PDA accounts, `@AccountPlugin.createAccount` | [named escrow accounts](docs/onchain-trading.md#named-escrow-accounts---the-third-custody-model-read-this-before-pooling-funds) |
| Rule arithmetic overflow, int64, division-first pins, large-magnitude comparisons | [rule arithmetic](docs/policy-primitives.md#rule-arithmetic-is-bounded-on-chain---write-pins-division-first) |
| Randomness, VRF, raffle/gacha/shuffle, `@OraclePlugin`, `requestRandomness`, `getRandomNumber`, `isRevealPath` | [randomness](docs/randomness.md) |
| Meteora token launch, DBC, anti-snipe fee decay, DAMM v2, `createMeteoraConfig`, `createMeteoraVirtualPool`, `claimDammV2PoolFees`, `withdrawLeftover` | [Meteora launch](docs/meteora-token-launch.md) |
| Pump.fun, PumpSwap, `@PumpFunPlugin`, `createToken`/`createTokenV2`, `buyExactSolIn`, creator fees, fee sharing, `updateShareholders`, `distributeCreatorFees`, `pumpswapDeposit`/`pumpswapWithdraw`, argument names/units | [Pump.fun reference](docs/pump-fun.md) |
| Multi-party fee split, `feepool`, `mulDivFloor`, keeper/scheduled onchain writes, `actAs`, `rollingSum` fee-funded build allowance | [oApps tokenomics](docs/oapps-tokenomics-fee-split.md) |
| Embedded wallet for email/social users, `@user.address`, Turnkey, `auth.wallets` | [embedded wallets](docs/embedded-wallets.md) |
| Bring-your-own Solana wallet login, `walletLogin`, Phantom / Wallet-Standard, SIWS | [wallet login](../bounded-frontend/docs/auth.md#solana-wallet-login-bring-your-own) |
| `onramp()`, buy SOL/USDC by card, Coinbase Onramp, wallet top-up | [onramp](docs/onramp.md) |
| Accept crypto/USDC, `payments.acceptCrypto`, seller settlement, direct-transfer rail | [accept crypto](docs/accept-crypto.md) |
| Card/fiat payments, Stripe Connect, checkout, subscriptions, `/connect/onboard`, `/connect/status`, `/connect/checkout`, `/connect/session`, Bounded Pay | [Bounded Pay](docs/bounded-pay.md) |

## Rules Of Thumb

- **Default onchain login = default Turnkey email/social auth + optional wallet login, side by side.** Do not add `authMode` or `auth.wallets` for the normal path. Turnkey is the sole embedded-wallet implementation, and Turnkey-native auth with eager provisioning is already the default. Supported email/social users have `@user.address` when login completes. Add bring-your-own **wallet login** (`walletLogin`) only for users who already hold a Solana wallet. Use explicit auth policy only to opt out or retain the legacy hosted login mode. See [docs/embedded-wallets.md -> recommended login](docs/embedded-wallets.md#the-recommended-login-for-an-onchain-app).
- Use `@user.address` only for wallet/onchain semantics; use `@user.id` for normal ownership. See the bounded-backend skill.
- **A plugin `source` that is not a pubkey is an ACCOUNT ID**, resolved to its own program-signed PDA. `@contract.address` is ONE shared fund for the whole app; a named id is a separate fund per name. When separate pots of user money coexist (escrows, auctions, prize pools, per-tenant balances), use named accounts - isolation is then chain-enforced instead of trusted to your accounting. Decide before the first deposit; retrofitting means migrating live balances.
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
- Helius mirroring is environment-level Bounded infrastructure: one raw program webhook per environment/network, never one per app. App builders never create webhook URLs or supply provider secrets, and the operator runbook (webhook, secrets, queue/DLQ, recovery) lives in the monorepo, not this skill. See [mirror completeness](docs/onchain.md#mirror-completeness) for the app-facing caveats.
- Bounded Pay's 1% platform fee is in addition to Stripe's own processing fees.
- Crypto is accepted non-custodially; sellers settle to their own wallet.
