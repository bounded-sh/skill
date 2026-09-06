---
name: bounded-onchain
description: >-
  Add onchain to a Bounded app: Solana collections, embedded
  non-custodial wallets for email/social users (@user.address, Turnkey by default),
  client- and server-signed transactions, DEX/perps trading patterns, and crypto payments
  (accept USDC/crypto non-custodially). Use for wallet, token, on-chain
  transaction, or crypto payment work. Part of the Bounded
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
| Find a plugin namespace or function quickly | [plugin catalog](docs/plugins.md) - compact namespace/function router |
| Scan every bare signature and callable context | [complete signatures index](docs/plugin-signatures.md) |
| One plugin function's exact signature, manifest argument descriptions and signer markers, return type, and callable context | [plugin catalog](docs/plugins.md), then its per-namespace page under `docs/plugins/` |
| Who holds funds, who signs, escrow vs named PDA vs user wallet, `@AccountPlugin.createAccount`, account-id hygiene, create-fund-use idiom | [custody and PDAs](docs/custody-and-pdas.md) |
| A complete policy for an escrow, vault, treasury, staking, market, launch, NFT, Token-2022, randomness, or liquidity app | [examples index](docs/examples.md) |
| A failing onchain write: error lookup, rent, ATA payer, transaction limits, confirmation, environment differences | [onchain troubleshooting](docs/onchain-troubleshooting.md) |
| Fund any wallet with simulated SOL, USDC, or another token on Poofnet, `bounded wallet fund`, `realtime_offchain` | [Poofnet onchain simulation](docs/onchain.md#poofnet-onchain-simulation-on-realtime_offchain) |
| `SOLANA_DEVNET_RPC_URL is required`, `SOLANA_MAINNET_RPC_URL`, `validate pre-built transaction`, submission fails before signing, no `--rpc-url` flag, public-RPC fallback | [CLI submission needs an explicit RPC endpoint](docs/onchain-troubleshooting.md#cli-submission-needs-an-explicit-rpc-endpoint) |
| Browser `Pre-built Solana transaction submission requires init({ rpcUrl })`, web onchain `set()` cannot submit, top-level `chain` + `rpcUrl` in `init()`, `VITE_SOLANA_RPC_URL` | [Browser/SDK submission needs an explicit RPC endpoint](docs/onchain-troubleshooting.md#browsersdk-submission-needs-an-explicit-rpc-endpoint) |
| `onchain account resolution failed (422)`, `onchain account not found: <pubkey>`, a write naming an account that does not exist on chain, wrong mint/pool derivation, 1-arg vs 3-arg `getTokenMintAddress` mismatch | [Missing onchain accounts vs platform 502s](docs/onchain-troubleshooting.md#missing-onchain-accounts-vs-platform-502s) |
| `onchain account resolution failed (502)`, `onchain query failed (502)`, `Transaction building failed` without a 403 **and without a 422**, named queries and plain `getBalance` failing together, platform resolver outage | [Platform resolver and onchain-query 502s](docs/onchain-troubleshooting.md#platform-resolver-and-onchain-query-502s) |
| Pump.fun launch fails after signing with `insufficient lamports` (`need 1461600`, `Create Metadata Accounts v3`), app-custody creator funding | [error table](docs/onchain-troubleshooting.md#error-to-cause-to-fix) and the [token-launch example](docs/examples/token-launch.md) |
| Onchain collections, `onchain:true`, `--protocol`, Solana, mainnet permit, patches, readonly `!`, `FieldReadOnly` | [onchain](docs/onchain.md) |
| Compiler vs deployed support, devnet status, blocked or unverified integrations (Jupiter, Phoenix, DFlow, Kamino, Pump.fun, PumpSwap, Tensor, SPL stake pool, liquid staking, Raydium CPMM, Meteora DLMM), runtime-v4 gating | [capability status](docs/solana-capability-status.md) |
| Helius, mirror/indexer, missed transactions, eventual consistency, unmirrored writes; who owns webhooks, ingest queue/DLQ, recovery and reconciliation | [mirror completeness](docs/onchain.md#mirror-completeness) |
| Transaction too large, 413, 1182/1232-byte packet limit, 4096-byte transaction v1, oversized hook, lookup tables | [transaction-size limit](docs/onchain.md#transaction-size-limit-one-hook--one-solana-transaction) |
| `governance.upgrade`, immutable/controller policy, manifest root, governed session, recovery, extend, cancel | [runtime-v3 governance](docs/onchain.md#policy-upgrade-governance-runtime-v3) |
| `@CPI`, `@Solana`, `@Bytes`, `@App`, `@DocumentPlugin.updateField`, `@PredictionMarketPlugin`, PDAs, `get`/`getAfter`, ProgramData, `shouldSubmitTx`, `skipPreflight`, `@contract.address`, `@AccountPlugin.getAccountAddress`, generic CPI, cross-app, prediction-market arithmetic, runtime parity, `@Solana.verifyEd25519`, `@Solana.secp256k1Recover`, `@Bytes.sha256`, `@Bytes.keccak256`, signature verification, EVM signer recovery | [policy primitives](docs/policy-primitives.md) |
| Auction, order book, multi-transaction financial state machine, aggregate buckets, permissionless crank, lazy claim/settlement, fixed-point units, independent arithmetic oracle, operation receipt retry, `_hook_completed`, `_error_message` | [policy-native financial state machines](docs/policy-native-state-machines.md) |
| Anchor/custom errors or stale numeric decoding | [custom-error diagnosis](docs/onchain.md#diagnose-custom-errors-by-the-live-anchor-log-name) |
| Trading, Phoenix perps, DEX swaps, server-signed execution | [onchain trading](docs/onchain-trading.md) |
| Escrow custody, `source` argument, per-entity funds, named PDA accounts, `@AccountPlugin.createAccount` | [named escrow accounts](docs/onchain-trading.md#named-escrow-accounts---the-third-custody-model-read-this-before-pooling-funds) |
| Rule arithmetic overflow, int64, division-first pins, large-magnitude comparisons | [rule arithmetic](docs/policy-primitives.md#rule-arithmetic-is-bounded-on-chain---write-pins-division-first) |
| Randomness, VRF, raffle/gacha/shuffle, `@OraclePlugin`, `requestRandomness`, `getRandomNumber`, `isRevealPath` | [randomness](docs/randomness.md) |
| Meteora token launch, DBC, anti-snipe fee decay, DAMM v2, `createMeteoraConfig`, `createMeteoraVirtualPool`, `claimDammV2PoolFees`, `withdrawLeftover` | [Meteora launch](docs/meteora-token-launch.md) |
| Pump.fun, PumpSwap, `@PumpFunPlugin`, `createToken`/`createTokenV2`, `buyExactSolIn`, creator fees, fee sharing, `updateShareholders`, `distributeCreatorFees`, `pumpswapDeposit`/`pumpswapWithdraw`, argument names/units | [Pump.fun reference](docs/pump-fun.md) |
| Multi-party fee split, `feepool`, `mulDivFloor`, keeper/scheduled onchain writes, `actAs`, `rollingSum` fee-funded build allowance | [oApps tokenomics](docs/oapps-tokenomics-fee-split.md) |
| Embedded wallet for email/social users, `@user.address`, Turnkey, `auth.wallets` | [embedded wallets](docs/embedded-wallets.md) |
| `403 anonymous_onchain_blocked`, guest/`signInAnonymously` session writing an onchain collection, works on poofnet but not mainnet | [guests cannot write to an onchain collection](docs/onchain.md#guests-cannot-write-to-an-onchain-collection) |
| Bring-your-own Solana wallet login, `walletLogin`, Phantom / Wallet-Standard, SIWS | [wallet login](../bounded-frontend/docs/auth.md#solana-wallet-login-bring-your-own) |
| `onramp()`, buy SOL/USDC by card, Coinbase Onramp, wallet top-up | [onramp](docs/onramp.md) |
| Accept crypto/USDC, `payments.acceptCrypto`, seller settlement, direct-transfer rail | [accept crypto](docs/accept-crypto.md) |

## Rules Of Thumb

- **Default onchain login = default Turnkey email/social auth, plus optional wallet login.** Do not add `authMode` or `auth.wallets` for the normal path; supported email/social users already have `@user.address`. Deploy `"auth": { "wallets": true }` only for an EXTERNAL-keypair session (wallet login, a server-SDK keypair client, the CLI keypair data lane). Full rule and the opt-outs: [docs/embedded-wallets.md -> recommended login](docs/embedded-wallets.md#the-recommended-login-for-an-onchain-app).
- Use `@user.address` only for wallet/onchain semantics; use `@user.id` for normal ownership. See the bounded-backend skill.
- **A guest (`signInAnonymously`) session can never write an `onchain: true` collection, on ANY network.** Poofnet, devnet, and mainnet all return `403 anonymous_onchain_blocked` before a transaction is built, so a guest flow that works against a test network cannot break on promotion. Keep the guest-reachable surface offchain and prompt the upgrade before the first onchain write. See [guests cannot write to an onchain collection](docs/onchain.md#guests-cannot-write-to-an-onchain-collection).
- **When a function's existing manifest description accepts account IDs**, a non-pubkey string resolves to its own program-signed PDA. `@contract.address` is ONE shared fund for the whole app; a named id is a separate fund per name. Do not assume every source, owner, creator, or destination accepts all three custody forms - check that argument's manifest description on the function page. When separate pots of user money coexist (escrows, auctions, prize pools, per-tenant balances), use named accounts where accepted. Decide before the first deposit; retrofitting means migrating live balances.
- For onchain writes, use explicit network/RPC configuration and devnet by default; do not treat immediate read-after-write as confirmation.
  The CLI submits the transaction itself, and it reads its endpoint ONLY from `SOLANA_DEVNET_RPC_URL` / `SOLANA_MAINNET_RPC_URL`: no flag, no config-file setting, and no public-RPC fallback.
  An unset variable fails the write before signing with `validate pre-built transaction: SOLANA_DEVNET_RPC_URL is required ...`, so set it in the shell running `bounded` whenever an app is `realtime_devnet` or `realtime_mainnet`.
  See [CLI submission needs an explicit RPC endpoint](docs/onchain-troubleshooting.md#cli-submission-needs-an-explicit-rpc-endpoint).
- Mainnet is a real target, not a placeholder: the program is live on mainnet-beta. Creating a mainnet app requires a paid account plan (no API key or shared secret), and an app **you** create is owned on-chain by the creator's wallet **immutably** - a wallet your signed-in identity can prove it controls: the local CLI keypair, or on a web login your Bounded account's own wallet, whose permit signatures happen through a per-deploy browser approval. It can never be ownership-transferred. (oApp roots and workloads are also mainnet, but the platform mints them under a Bounded-custodied owner; you never create those yourself - see the **oapps-fun** skill.) See [docs/onchain.md](docs/onchain.md).
- `@contract.address` is the Solana program-ID sentinel, not the app escrow address returned by a direct query.
  Supported built-in plugins resolve the sentinel to the app escrow PDA.
  On the current deployed Devnet runtime, do not compose the sentinel as `@AccountPlugin.getAccountAddress(@contract.address)`: that call fails because the sentinel is address-typed while this function currently accepts a string account id.
  For a Devnet policy query that needs the concrete escrow address, bind the current Devnet program ID as a string literal: `@AccountPlugin.getAccountAddress("openTv7fbpYSseNHYmCZFZ1CZgj4r8D9fKNgEz1qo6F")`.
  This literal is Devnet-specific and must be updated if the deployed program changes.
  See [policy-primitives.md](docs/policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address).
- Treat discovery, deployed-runtime support, and live-network verification as three independent states.
- Use `bounded plugins list --json` and `bounded plugins describe <plugin.function> --json` as the offline callable signature source before authoring a hook.
- Run `bounded verify --protocol <protocol> --json` on the actual policy and inspect advisory `capabilityReadiness`, while still requiring retained live evidence before claiming network support.
- Check the [Solana devnet capability catalog](docs/solana-capability-status.md) before proposing any plugin or primitive.
- Never infer devnet support from a compiler tag, manifest, proof contract, Poofnet model, lookup-table entry, or local validator test.
- When live evidence uses a hosted release marker, resolve its environment-qualified site URL from `bounded domains list --app-id <id> --env <environment> --json` `slugUrl` or the exact successful site-deploy receipt `url`.
  Require the JSON field itself for staging evidence instead of copying a human-rendered hostname.
  `bounded apps inspect` proves the active policy/runtime publication and carries no hosted URL.
- Never emit runtime-v2 primitives for a runtime-v1 deployment; follow [docs/policy-primitives.md](docs/policy-primitives.md).
- Current chain-backed named queries belong on `onchain: true` paths. Anonymous execution is admitted for identity-independent queries whose path read rule authorizes the caller; a query reading `@user.address`/`@user.evmAddress` requires that identity. The anonymous surface is the browser SDK, not the CLI.
- Do not recommend an `onchain: false` view for an offchain-only plugin read until standalone chain-query execution is fixed.
- Treat runtime-v3 governance the same way: enroll only after the deployed capability registry reports v3, and publish governance from observed chain state rather than policy intent.
- Keep Poofnet and Solana behavior paired.
- Use `bounded wallet fund` only for explicit development funding on `realtime_offchain`.
  The caller must be the app owner, an admin, or a developer, and the balance exists only inside the selected app's simulated ledger.
- Pure/read primitives must return the same shape in runtimes where they are actually executable, and mutating primitives must apply a modeled effect or fail closed.
- Validation-only success is a parity bug.
- For a Poofnet onchain hook, application-side success means `_hook_completed == _transaction_hash`. Row existence and `_error_message == null` are only pending state. But those stamps are SIMULATOR-only: a policy RULE that requires them is permanently unsatisfiable on a real-chain protocol - a payout gated that way becomes a one-way valve that locks user funds, and every sim-side proof and test stays green. Rules gate on a declared field the hook itself writes (`paidAt`-style) or on the hook-derived head state; reserved `_` stamps are for Poofnet clients only. Give every semantic operation id a policy-legal failed-attempt retry path. See [reserved receipt stamps are Poofnet-only](docs/policy-native-state-machines.md#reserved-receipt-stamps-are-poofnet-only-never-read-them-in-a-rule).
- Helius mirroring is environment-level Bounded infrastructure: one raw program webhook per environment/network, never one per app. App builders never create webhook URLs or supply provider secrets, and the operator runbook (webhook, secrets, queue/DLQ, recovery) lives in the monorepo, not this skill. See [mirror completeness](docs/onchain.md#mirror-completeness) for the app-facing caveats.
- Crypto is accepted non-custodially; sellers settle to their own wallet.
