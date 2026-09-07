# Raydium policy authoring

Use the bundled [authoring tool](../scripts/solana-policy.cjs) to generate ordinary policy expressions for Raydium CLMM, LaunchLab, and CPMM operations.
It runs offline with Node 22 and requires no package installation, wallet, RPC endpoint, or internal Bounded package.
It does not deploy policies or submit transactions.

```sh
node /path/to/bounded-onchain/scripts/solana-policy.cjs launchpad options.json > recipe.json
```

CLMM commands are `createPool`, `openPosition`, `lockPosition`, `openAndLock`, `claimLockedFees`, `launchpad`, and `swap`.
LaunchLab commands are `launchLabCreatePlatform`, `launchLabInitialize`, `launchLabTrade`, `launchLabClaimFees`, and `launchLabGraduateAndSeal`.
Graduated CPMM commands are `cpmmSwap`, `cpmmClaimCreatorFees`, and `cpmmClaimLockedFees`.
These experimental recipes have local-validator integration coverage using cloned programs; this is not evidence of a deployed Bounded runtime or a live launch.
Use exact decimal strings for token amounts, prices, and liquidity in JSON.
The module also exports these builders for Node authoring scripts, plus `launchField` and `splitLaunchU128`.

The `launchpad` command returns required field definitions and reusable `createPool` and `openAndLock` hook expressions.
It binds the launched mint to Bounded token creation arguments and fixes the quote asset, venue configuration, custody, input caps, and price bounds in the generated policy.
Launch-specific identities and amounts arrive through typed document fields, so the policy need not be redeployed for every launch.
The two mint sorting orientations need separately chosen price bounds.
Prices are raw token1/token0 square-root prices scaled by 2^64, not human-unit prices or market capitalizations.

For example, this offline authoring input fixes a named treasury, the mainnet 1% CLMM configuration, and USDC as the quote asset.
Its price and amount bounds are illustrative policy choices, not recommended launch economics.
Amounts are raw token units.
Create and fund the named treasury before executing the generated operations.

```json
{
  "cluster": "mainnet",
  "source": { "account": "treasury" },
  "config": "A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x",
  "quoteMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "quoteToken": "spl",
  "launchedToken": "token2022",
  "tickSpacing": 120,
  "tickLower": 120,
  "tickUpper": 240,
  "maxTokenInput": "100000",
  "maxQuoteInput": "0",
  "priceBounds": {
    "tokenIsMint0": {
      "min": "18446744073709551616",
      "max": "18446744073709551616"
    },
    "tokenIsMint1": {
      "min": "36893488147419103232",
      "max": "36893488147419103232"
    }
  }
}
```

Place generated expressions only inside appropriately authorized `hooks.onchain` operations.
Bind the funding stage to the original launch record, use create-only operation identifiers, and prevent launch fields from being changed between pool creation and funding.
Generated amount caps do not replace authorization or treasury accounting.
Token creation and authority sealing are separate operations described in [token transfer fees](token-fee-rewards.md).

Use `openAndLock` when funding a position that must be permanently locked.
It funds the position and invokes the external locker in one reverting hook.
Creating an empty pool beforehand does not place principal at risk.
An independently submitted open operation followed by a later lock is not atomic.

Custody is selected as `{ "account": "treasury" }`, `{ "wallet": "base58-address" }`, or `{ "escrow": "resolved-app-escrow-address" }`.
Wallet custody is bound to the acting user.
The runtime independently checks named-account and escrow signer derivations against the current app.
Do not use `signerAccount("@escrow")` to resolve the escrow address; that getter derives a named account.

The builders have local-validator evidence for pool creation, atomic opening/locking, rollback, and zero-fee claiming with classic and transfer-fee pool tokens.
The reusable launch policy also passed both mint sorting orientations, immutable funding-field checks, and replay rejection.
The locked-position security scenario rejected principal withdrawals using either the custody NFT or the fee receipt, then collected nonzero fees after a real swap and verified gross debit equals net credit plus the withheld transfer fee.
These tests use cloned external programs; they do not prove Raydium's implementation or guarantee future program upgrades.
Large literal tables require the runtime 7 chunked metadata uploader, which is source-only and has not been deployed to shared clusters.
Treat these recipes as experimental until those checks and the serving-runtime checks pass.
They have no Poofnet mutation model and must fail closed there.
Raydium program upgrades remain part of the external trust boundary.
Holder indexing and reward allocation remain consumer-owned.

## Constrained swaps

The `swap` command accepts fixed pool identifiers (`config`, sorted `mint0`/`mint1`, `token0`/`token1`), custody (`source`), `cluster`, `zeroForOne`, `tickSpacing`, ordered `tickArrayStarts`, optional `bitmapExtension`, exact decimal `inputAmount` and `minNetOutput`, and a Unix-seconds `deadline`.
It generates an exact-input swap with a source-owned output ATA and a positive minimum received amount.
The policy author fixes these values; do not let a trader choose an arbitrarily low minimum or repeatedly spend a shared treasury.
Wrap it in an authorized, one-use operation with the application's spending limits.
Tick arrays must be supplied in swap direction and belong to the derived pool; the external program checks the pool and account relationships.
Missing arrays or insufficient liquidity fail the operation.
The minimum applies after transfer-tax withholding, as implemented by Raydium's destination balance-delta check in [swap_v2](https://github.com/raydium-io/raydium-clmm/blob/master/programs/amm/src/instructions/swap_v2.rs).
The recipe passed local-validator execution tests for expired deadlines, excessive minimum output, transfer-tax output, and a conversion followed by payment of exactly its net proceeds.
The stronger swap scenario also passed: a minimum between actual gross and net output is rejected, as are stale arrays and an unfillable input, with balances unchanged.
The full local Solana suite completed with 799 passing cases, seven skipped cases, and zero failures.

## LaunchLab initialization (experimental)

`launchLabInitialize` generates fresh Token-2022 mint initialization through LaunchLab using a constant curve, no vesting allocation, and CPMM migration selection.
It takes `cluster`, `source`, approved `config` and `platform` addresses, `quoteMint`, `quoteToken`, a unique `launchId`, metadata (`name`, `symbol`, a nonempty `uri`, `decimals`), exact decimal `supply`, `totalSellAmount`, `fundraisingAmount`, `maxFee`, integer `feeBasisPoints`, and `creatorFeeOn` (`quote` or `both`).
Required `configSha256` and `platformSha256` are lowercase SHA-256 hashes of the complete reviewed account data (371 and 944 bytes respectively), including discriminator, epoch, and padding.
Compute them from confirmed RPC account data only after reviewing the configuration, and bind them as policy-author constants rather than requester-controlled launch fields.
The hook verifies both ownership and exact account length, then checks those hashes before initialization.
Any update, including branding or epoch changes, requires intentional review and repinning.
Optional boolean `platformAllowConfig` and `platformCurveRule` select canonically derived accounts; the external program validates their semantics, including an uninitialized rule PDA where supported.
Transfer fees are limited to 1-500 basis points.
The maximum fee must exceed `supply * feeBasisPoints / 10000`, computed with integer arithmetic; `18446744073709551615` avoids capping a transfer below the configured rate.
The mint is a fresh app-scoped signer; do not create it with TokenPlugin first.
The platform configuration and its update authority remain explicit trust dependencies.
The initialization snapshot cannot prevent that administrator from changing migration-time settings after the launch.
Use a consumer-controlled platform administrator with restricted update policies when promising stable custody through graduation.
LaunchLab retains fee-rate authority before graduation; the consumer can seal it only after migration hands it to the configured platform authority.
Raydium's authorized crank performs migration, so observing and verifying graduation is a separate integration step.
Initialization, curve trading, fee claims, external migration, and post-migration operations have local cloned-program execution evidence, detailed in the graduation section below.
The migration fixture substitutes local crank authorization; it does not establish live crank availability.


## LaunchLab curve trading (experimental)

`launchLabTrade` generates an exact-input `buy` or `sell` against a fixed launch pool, with no referral fee.
Inputs are `cluster`, `source`, `config`, `platform`, reviewed `configSha256` and `platformSha256`, `baseMint`, `baseToken`, `quoteMint`, `quoteToken`, the launch's `creator`, `side`, exact decimal `inputAmount` and `minNetOutput`, and a Unix-seconds `deadline`.
Both token-program selectors accept `spl` or `token2022`.
The recipe derives the pool, vaults, fee accounts, and source-owned ATAs; create those ATAs before trading.
The creator value must match the pool's recorded creator, not the trader.
A buy near graduation may spend less than `inputAmount`; capture actual input and output balance deltas for accounting.
Bind the recipe to consumer authorization, one-use operation IDs, and treasury spending caps.
Amounts and hashes are policy-author constants, not freely chosen requester fields.
Cloned-program execution covers a Token-2022 base with either an SPL or Token-2022 quote, including transfer-tax net-output protection.

The cloned LaunchLab program initializes the requested supply and immediately revokes mint authority; do not assume mint authority remains live until graduation.
The policy validator case has now reached successful initialization and verified rollback after a successful LaunchLab CPI.
Curve buys and sells are verified for a Token-2022 base with both quote token programs.
Swap recipes also verify each token account's current token program, mint, and owner, because a canonical ATA address alone does not prove its current authority.
LaunchLab trades additionally bind the supplied fee recipient creator to the pool's recorded creator.


## Consumer-controlled LaunchLab platform and fee claims (experimental)

`launchLabCreatePlatform` creates one platform per `source`, with its administrator, transfer-fee authority, platform-fee wallet, vesting wallet, and locked-LP recipient all set to that source.
Inputs are `cluster`, `source`, approved `cpmmConfig`, `platformFeeRate` (0-50000), `creatorFeeRate` (0-5000), `lockedLpShare` (0-1000000), `name`, `web`, and `image`.
These three rates use a denominator of 1000000; they are not basis points.
The remaining LP share is burned, creator LP share is zero, and vesting allocation is zero.
Use an app escrow or named account for administration enforced by policy; a wallet source can independently sign configuration changes outside Bounded.
This recipe does not expose an update operation, but consumer policy governance must still restrict what that administrator may sign.
After creation, inspect the resulting account and bind its hash in the initialization recipe.

`launchLabClaimFees` takes `cluster`, `source`, `quoteMint`, `quoteToken`, and `kind` (`creator` or `platform`); platform claims also require `platform`.
The source must be the creator or current platform fee wallet, and its quote ATA must already exist.
Claims sweep the accrued aggregate vault into that source-owned ATA; creator fees can span multiple launches sharing one creator and quote asset.
Capture the actual received balance delta before allocating proceeds.
A claim is not a fixed payout or an allocation epoch, and fresh fees can accrue after a previous successful claim.
Holder indexing and allocation remain in the consumer application.
The consumer-owned platform test passed creation, nonzero claims of all three fee streams, and denial of unauthorized fee collection.

The updated validator shard passed 56 tests with no failures, including initialization rollback, buy/sell execution, transfer-tax net-output protection, wrong creator, changed configuration, expired deadlines, reassigned legacy token-account ownership, and the existing CLMM security tests.
Both quote token programs reach graduation through a partially filled buy; taxed-quote cases additionally verify exact conservation including withholding and a sell minimum between gross and net proceeds.


## After LaunchLab migration (experimental, locally verified)

Raydium's authorized migration wallet completes graduation; these recipes do not grant Bounded that authority.
`launchLabGraduateAndSeal` verifies the completed LaunchLab pool, canonical CPMM pool, reviewed configuration hashes, and selected liquidity mode, then revokes transfer-fee configuration authority in the same hook.
Fixed CPMM and migration addresses are derived during offline authoring; the generated hook still verifies their onchain identity and custody relationships.
It also requires no mint/freeze authority and verifies the expected withdrawal authority.
An explicit escrow address must resolve to the current app's escrow before sealing; supplying another withdrawal authority cannot substitute for that custody check.
A public hexadecimal `mintAccountData` snapshot locates the TransferFeeConfig extension; generated runtime checks bind every preceding extension header and both current and scheduled fee rates/caps to independently specified `feeBasisPoints` and `maxFee`.
The snapshot does not decide what fee is acceptable.
This prevents sealing a pending fee change under a promise of a fixed launch tax.

Inputs include the sorted CPMM pair (`mint0`, `mint1`, `token0`, `token1`), CPMM `config`, `cluster`, `source`, launch `baseMint`/`quoteMint`/`launchCreator`, `launchConfig`, `platform`, their `launchConfigSha256`/`platformSha256`, the mint snapshot and promised fees, plus `liquidity`.
For locked liquidity, use `{ "kind": "locked", "feeKeyMint": "observed-mint-address" }`; the receipt mint comes from migration discovery and is validated against the onchain lock record and current source ownership.
The reviewed platform's migration NFT recipient must also equal source.
Discover the original receipt from migration evidence: current lock ownership alone cannot distinguish the migration receipt from a later, smaller lock in the same pool.
For full burn, use `{ "kind": "burned" }`; the reviewed platform must have zero platform/creator LP shares and a 1000000 burn share.
These current-state checks rely on Raydium's migration invariant for the historical split; they do not reconstruct a historical burn percentage from today's LP supply.
Bind activation to a one-use consumer operation and the immutable launch identity.

`cpmmClaimCreatorFees` takes the sorted CPMM pair, `config`, `cluster`, and `source`; the pool's recorded creator must equal source.
`cpmmClaimLockedFees` additionally takes `feeKeyMint` and an exact positive `lpFeeAmount`.
The locker accepts an oversized request and limits what can be collected; do not infer actual LP consumption or proceeds from the requested amount.
Both claim into existing source-owned ATAs, and consumers record actual received balances for allocation.
`cpmmSwap` uses the same pool inputs plus `zeroForOne`, exact `inputAmount`/`minNetOutput`, and a Unix-seconds `deadline`.
The local validator suite passed 56 tests, including completed migration, activation rollback, tax sealing, a CPMM buy, creator-fee collection, two nonzero locked-fee claims, an oversized claim preserving the aggregate pool's reserve floor, and net-receipt buy-and-burn with replay rejection in both mint orderings.
Migration uses real cloned programs under an explicitly synthetic local crank authorization fixture.
This verifies a Token-2022 base with both SPL and Token-2022 quotes in both mint orderings.
Live deployment remains unverified.
