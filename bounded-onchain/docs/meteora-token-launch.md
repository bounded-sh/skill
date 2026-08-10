# Meteora token launch - Dynamic Bonding Curve to DAMM v2 graduation

**What's in here / when to read this:** you want an app to *launch a token* on
Meteora - stand up a Dynamic Bonding Curve (DBC) that trades on a bonding curve,
then **graduates** (migrates) to a DAMM v2 pool once it hits a market cap - and
collect the trading fees on both sides. This is the launchpad primitive behind
oApps / pump-style launches. For plain spot swaps against an existing pool, and the
`source`/custody model, read [onchain-trading.md](onchain-trading.md) first - this
builds on the same server-signed `hooks.onchain` mechanism.

> **Current devnet status: unverified, not blocked.**
> The earlier blocker (a dynamic config bound to a retired Bounded program authority) was cleared on 2026-07-29: the replacement DAMM v2 config `BQS7mc9ouPRb29BKMkZj3pA5yP4Yu6AKHL4MaaYG5YTG` is deployed on devnet and the deployed runtime targets it.
> Nothing in this guide is externally blocked; what is missing is retained live proof.
> Registered proof contracts and matching manifests establish source shape only, and neither they nor a local shard run is live devnet evidence.
> See [solana-capability-status.md](solana-capability-status.md).

## The two phases

The lifecycle below documents the source contract.
It is runnable against the current devnet deployment; treat any run as the live proof it still needs, and confirm each transaction plus its expected Bounded postcondition rather than assuming it.

```
createMeteoraConfig ──► createMeteoraVirtualPool ──► trades on the bonding curve
   (fee schedule,            (mint + pool for a          (swapInMeteoraVirtualPool,
    creator/partner split,    specific token)             claimMeteoraPoolFees)
    market caps)                    │
                                    ▼  hits migrationMarketCap
                              graduates to DAMM v2
                              (getDammV2PoolAddress,
                               claimDammV2PoolFees,
                               withdrawLeftover)
```

1. **Config** (`createMeteoraConfig`) - a reusable curve/fee template for the app.
   Declares the pre-migration (bonding-curve) fee, the anti-snipe decay, the
   post-migration (DAMM v2) fee, the creator/partner split, and the market caps at
   which the pool starts and graduates.
2. **Pool** (`createMeteoraVirtualPool`) - mints one token against a config and opens
   its virtual (bonding-curve) pool. Trades run through `swapInMeteoraVirtualPool`.
3. **Graduation** - when the pool reaches `migrationMarketCap` it migrates to DAMM v2
   automatically (`migrationOption: MET_DAMM_V2`). Post-migration you claim LP fees
   with `claimDammV2PoolFees` and sweep any reserved `leftover` tokens with
   `withdrawLeftover`.

## `createMeteoraConfig` / the launch config

```
@DeFiPlugin.createMeteoraConfig(
  configId, feeAccount,
  preMigratedFeeAmountBps, preMigratedCreatorFeePercentage,
  postMigratedFeeAmountBps, postMigratedCreatorFeePercentage,
  initialMarketCap?, migrationMarketCap?, totalTokenSupply?, tokenBaseDecimal?,
  leftover?, leftoverReceiver?,
  decayStartingFeeBps?, decayEndingFeeBps?, decayNumberOfPeriod?, decayTotalDuration?
) -> Bool
```

| # | Param | Meaning |
|---|---|---|
| 0 | `configId` | App-unique id for this config (a string). Reuse it across pool creations. |
| 1 | `feeAccount` | **Partner** fee recipient (the fee claimer). Use `@contract.address` as the built-in plugin sentinel for the app escrow PDA, a wallet address, or an `@AccountPlugin` account id. |
| 2 | `preMigratedFeeAmountBps` | Bonding-curve trading fee, in bps (300 = 3%). Also the flat/settled fee when no decay is set. |
| 3 | `preMigratedCreatorFeePercentage` | Creator's share of the bonding-curve trading fee (0–100). The rest goes to `feeAccount` (partner). |
| 4 | `postMigratedFeeAmountBps` | DAMM v2 pool swap fee after graduation, in bps (200 = 2%). |
| 5 | `postMigratedCreatorFeePercentage` | Creator's **permanently-locked** liquidity share of the migrated pool (0–100); the remainder is creator (unlocked) liquidity. Partner liquidity is 0 - all migrated liquidity is the creator's. |
| 6 | `initialMarketCap?` | Starting market cap in SOL for the curve. Default `30`. |
| 7 | `migrationMarketCap?` | Market cap in SOL at which the pool graduates to DAMM v2. Default `85`. |
| 8 | `totalTokenSupply?` | Total token supply (base units). Default `1000000000`. |
| 9 | `tokenBaseDecimal?` | Token decimals - `6` or `9`. Default `6`. |
| 10 | `leftover?` | Tokens reserved outside the curve, minted to the pool's base vault; withdrawable only by `leftoverReceiver` after migration. Must be `< totalTokenSupply`. Default `0`. |
| 11 | `leftoverReceiver?` | Who can withdraw the `leftover` after migration. Use a wallet, the `@contract.address` plugin sentinel, or an account id. Default: `feeAccount`. |
| 12 | `decayStartingFeeBps?` | **Anti-snipe** opening fee in bps (e.g. `5000` = 50%). Default: `preMigratedFeeAmountBps` (flat, no decay). |
| 13 | `decayEndingFeeBps?` | Fee the schedule decays down to, in bps. Default: `preMigratedFeeAmountBps`. |
| 14 | `decayNumberOfPeriod?` | Number of linear reduction steps. Default `0` (flat). |
| 15 | `decayTotalDuration?` | Total decay duration in **slots** (the pool's activation unit). Default `0` (flat). |

Params 6–15 are optional and positional - to set a later one you must pass the
earlier ones (use their defaults explicitly). Omit them all and you get the classic
flat-fee config.

### Anti-snipe fee decay (opt-in)

The bonding-curve opening is the moment snipers race in. Meteora's
`BaseFeeMode.FeeSchedulerLinear` lets the trading fee **start high and decay** to the
normal fee over the first minutes, which taxes the snipe and hands the proceeds to
the creator/partner instead of the sniper. Bounded threads the four decay params
straight to that schedule; when they're omitted the fee is flat
(`startingFeeBps === endingFeeBps === preMigratedFeeAmountBps`, 0 periods) - i.e. the
original behavior, unchanged.

Example - open at **50%**, decay to **3%** over ~2 minutes (300 slots ≈ 2 min on
Solana at ~2.5 slots/s), with the settled fee split 50/50 creator/partner, graduating
at 85 SOL market cap:

```json
{
  "constants": { "LAUNCHER": "<launcher-wallet-address>" },
  "launches/$configId": {
    "onchain": true,
    "fields": { "configId": "String" },
    "rules": { "read": "true", "create": "@user.address != null && @user.address == @const.LAUNCHER", "update": "false", "delete": "false" },
    "hooks": {
      "onchain": { "create":
        "@DeFiPlugin.createMeteoraConfig($configId, @contract.address, 300, 50, 200, 50, 30, 85, 1000000000, 6, 0, @contract.address, 5000, 300, 60, 300)"
      }
    }
  }
}
```

`@const.LAUNCHER` is a statically bootstrapped wallet address and the rule uses
the onchain/runtime-supported `@user.address` surface. Rotate the constant with a
policy update when launcher authority changes.
The `@contract.address` arguments above are interpreted by this documented built-in plugin as the app escrow PDA.
The sentinel itself evaluates to the Bounded program ID in a direct query.
The separate `@AccountPlugin.getAccountAddress(@contract.address)` composition is unsupported on the current deployed Devnet runtime.
When another expression needs the concrete escrow address, use the current Devnet program-ID string literal documented in [policy-primitives.md](policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address).

**Transaction-size note:** `createMeteoraConfig` is one of the largest single
instructions on the platform (~1189B alone; ~1225B chained with
`@AccountPlugin.createAccount` - over the raw ~1182B limit). It lands because the
builder compresses the fixed Meteora/framework accounts through the standard
platform lookup table (~1104B compressed). Do NOT chain further actions onto this
hook, keep string args (ids, URIs) short, and omit optional args you don't need -
each one is bytes you don't have. If `bounded verify` rejects your variant for
transaction size, read the fix ladder in
[onchain.md → Transaction-size limit](onchain.md#transaction-size-limit-one-hook--one-solana-transaction).

- `preMigratedFeeAmountBps = 300` (3%) is the settled bonding-curve fee and the decay
  target when `decayEndingFeeBps` is left at its default.
- `decayStartingFeeBps = 5000` (50%) → `decayEndingFeeBps = 300` (3%) over
  `decayNumberOfPeriod = 60` steps across `decayTotalDuration = 300` slots.
- A ~25% opener is just `2500` instead of `5000`. The published oApps default is a
  25–50% opening decaying to 3%.

## `createMeteoraVirtualPool` - mint + open the pool

```
@DeFiPlugin.createMeteoraVirtualPool(configId, tokenId, name, symbol, uri, initialSolBuyAmount?) -> Bool
```

Mints one token (`tokenId` is app-unique) against a `configId` and opens its virtual
pool. `uri` is the JSON-metadata URI. `initialSolBuyAmount?` (lamports) does an
optional dev-buy right after creation.

### The `uri` must be a Metaplex metadata JSON, not an image

Wallets, DEX frontends and Meteora itself resolve the token's display identity
through `uri`. It must point to a **permanent, public JSON file** following the
Metaplex fungible-token standard - passing a raw image URL (or an empty string)
gives you a token with broken name/image everywhere downstream.

```json
{
  "name": "My App Token",
  "symbol": "MYAPP",
  "description": "one line on what it is",
  "image": "https://myapp.example.com/icon.png",
  "external_url": "https://myapp.example.com"
}
```

**Hosting it:** you have two workable options, and the choice turns on whether an
end user (not just you at build time) needs to publish the metadata.

1. **A static asset in your deployed frontend** - ship `public/token.json` and
   `bounded site deploy` it, then pass `https://<your-host>/token.json`. Simplest
   when the token set is known at build time. Any other permanent public host
   (your domain, IPFS with a stable gateway) works too.
2. **A Bounded storage collection whose read rule authorizes anonymous access** -
   when an arbitrary end user mints, and the JSON therefore has to be created at
   runtime. A storage collection whose `read` rule admits the anonymous principal
   returns a **tokenless, non-expiring public URL** from `getFiles`, not a signed
   link, so it is usable as a `uri`. Uploads stay policy-governed by your `create`
   rule, so "any signed-in user may publish their own small metadata JSON" is
   exactly expressible.

```json
"launches/$launchId/metadata/$fileId": {
  "type": "storage",
  "fields": { "owner": "String!" },
  "rules": {
    "read":   "true",
    "create": "@newData.owner == @user.id",
    "update": "false",
    "delete": "false"
  }
}
```

`read: "true"` is what makes the URL public and permanent.
Because the rule is re-evaluated on every GET, it is also **revocable**: tighten
the rule or delete the file and the next fetch 403s - which for token metadata is
a hazard, not a feature, since wallets and DEX frontends fetch the `uri` forever.
Treat a published token `uri` as immutable and never narrow that collection's read
rule afterwards. Public objects are also served `Cache-Control: public, no-store`,
so every third-party fetch hits the worker and is billed as a request; that is fine
for a small JSON, but do not point high-traffic image assets at it.
See [files-and-search.md](../../bounded-backend/docs/files-and-search.md#reading-files-back)
for both URL modes.

Set the `uri` before mint either way: the metadata address is derived at creation
and the JSON is fetched by third parties forever after.

- `@DeFiPlugin.getMeteoraVirtualPoolAddress(tokenMintAddress, configId) -> Address`
  (pure) resolves the pool address for a token.
- `@DeFiPlugin.getMeteoraSwapQuote(tokenMintAddress, tokenToSwapInMintAddress, tokenAmount) -> Int`
  (pure) quotes a swap before you make it.

## Trading on the curve + claiming fees

| Function | Signature | Does |
|---|---|---|
| `swapInMeteoraVirtualPool` | `(source, poolTokenMint, tokenMint, amount, minimumAmountOut?) -> Bool` | Buy/sell against the virtual pool. The fifth argument is the slippage floor. |
| `getClaimableMeteoraPoolFees` | `(source, poolAddress) -> Int` (pure) | Creator-side claimable, as ONE number summing two mints - read the caveat below. |
| `claimMeteoraPoolFees` | `(source, poolAddress) -> Bool` | Claim accrued bonding-curve fees to `source`. |

`source` follows the same custody rule as all trading calls - the `@contract.address`
sentinel resolved by this built-in plugin to the server-signed app escrow PDA for an app-operated launch, or a user wallet for
self-custody. See [onchain-trading.md → `source`](onchain-trading.md).

### Pass the swap's slippage floor

```
@DeFiPlugin.swapInMeteoraVirtualPool(source, poolTokenMint, tokenMint, amount, minimumAmountOut?) -> Bool
```

`minimumAmountOut` is the minimum output in the output token's smallest units, and the swap fails instead of filling below it.
It is optional only for backward compatibility, so **an omitted fifth argument means no slippage protection at all** on a bonding-curve trade, where the price moves with every fill.
There is no deadline parameter (the underlying DBC `swap2` has none), and the call returns `Bool`, not the amount received.
Full guidance, including how to size the floor when the quote getter is offchain-only: [onchain-trading.md → the slippage floor](onchain-trading.md#swapinmeteoravirtualpool-takes-a-slippage-floor---use-it).

### What the fee surface cannot tell you yet (read before building fee accounting)

Two honest gaps sit under any "how much did this launch earn" feature.

- **The partner leg has no claim primitive.** Bounded exposes only the creator-side claim (`claimMeteoraPoolFees`, `claimDammV2PoolFees`). Meteora's partner-side `claim_trading_fee` - the leg a `feeAccount` reserve accrues to before migration - is not exposed at all today. Do not write policy that assumes a partner claim exists.
- **No primitive yields a per-mint claimed amount.** The claims return `Bool(true)` even when nothing was claimed (a non-creator `source`, or a not-yet-graduated pool), and they discard the balance delta. So a fee-attributed total cannot be honestly derived from what Bounded returns today.

**Do not reach for `getClaimableMeteoraPoolFees` to patch this.**
It returns `creator_base_fee + creator_quote_fee` as a single `UInt`, adding two different mints with different decimals into one meaningless scalar, and it returns `0` for a non-creator `source` - so it cannot even distinguish "not the creator" from "no fees accrued".
Reporting a total built on it is an accounting error, not an approximation.
Until a claim primitive returns the amounts, report attributed fee totals as **unavailable** rather than deriving them, and keep any app-level ledger explicitly labelled as caller-asserted convention.

## Graduation to DAMM v2 + post-migration

Once the pool reaches `migrationMarketCap`, Meteora migrates it to a DAMM v2 pool.
Post-migration the fee model switches to the DAMM v2 side of the config
(`postMigratedFeeAmountBps`, `postMigratedCreatorFeePercentage`).

| Function | Signature | Does |
|---|---|---|
| `getDammV2PoolAddress` | `(tokenMintAddress) -> Address` (pure) | Resolve the graduated pool. |
| `claimDammV2PoolFees` | `(source, poolAddress, positionMintAddress?) -> Bool` | Claim LP fees from the migrated pool. With `positionMintAddress`, only that position; otherwise all positions `source` owns in the pool. |
| `withdrawLeftover` | `(virtualPoolAddress) -> Bool` | Sweep the reserved `leftover` tokens to the config's `leftoverReceiver`. Only valid **after** migration. |

## One escrow per launch, not one escrow per app

A launchpad holds several launches' money at once - presale/auction deposits,
proceeds waiting to seed a pool, fees waiting to be split. If every launch's
funds ride `@contract.address`, they share ONE balance and isolation between
launches is only your accounting; a bug in one launch's settlement is paid for
out of another launch's deposits.

Pass the launch's own id as the `source` instead. Any non-pubkey string is an
account id resolved to its own program-signed PDA, and it works identically on
`createPool`, `claimMeteoraPoolFees`, `claimDammV2PoolFees`,
`swapInMeteoraVirtualPool`, and `@TokenPlugin.transfer`:

```json
"hooks": { "onchain": { "create": "@AccountPlugin.createAccount($launchId)" } }
```

then `@TokenPlugin.transfer(@user.address, $launchId, @TokenPlugin.SOL, amount)`
in, and `@DeFiPlugin.createPool($launchId, mint, @TokenPlugin.SOL, tokens, sol, config)`
out. See
[named escrow accounts](onchain-trading.md#named-escrow-accounts---the-third-custody-model-read-this-before-pooling-funds)
for the full resolution rule.

## The fee-split reality (honest)

Meteora's config is **2-party**: on the curve, each trade's fee splits between the
**creator** (`preMigratedCreatorFeePercentage`) and the **partner** = `feeAccount`
(the remainder). Post-migration, all liquidity is the creator's - the
`postMigratedCreatorFeePercentage` slice is permanently locked (earns LP fees
forever) and the rest is unlocked; fees are claimed with `claimDammV2PoolFees`.

There is **no native 3-way split**. A multi-party split (e.g. the oApps **55%
treasury / 25% creator / 20% Poof** model) is *composed in Bounded policy* on top of
this 2-party primitive. The mapping is direct: point `feeAccount` at the treasury
PDA - that pays the **55%** partner leg natively - and set
`preMigratedCreatorFeePercentage` to the **combined creator+platform share (45)** so
that leg accrues to a shared `feepool` PDA. A permissionless onchain write then
claims `feepool` and splits it by **fixed bps literals in policy**
(`5556/4444` of the 45% pool = 25/20 of the whole), with `@MathPlugin.mulDivFloor`
sizing each `@TokenPlugin.transfer` leg. Post-graduation the native partner leg
zeroes, so the whole 55/25/20 becomes a 3-way policy split of the `claimDammV2PoolFees`
claim (`5500/2500/2000`).

For the full worked example - every collection copied from the Z3-verified reference
policy, the keeper that turns the crank, the fee-funded build allowance, and an
honest PROVEN-vs-TRUSTED-vs-NEEDS-DEVNET breakdown - see
[oapps-tokenomics-fee-split.md](oapps-tokenomics-fee-split.md).

## What is PROVEN vs what is trusted (state it honestly)

- **PROVEN (Z3, every input):** the policy *around* the launch - who may call
  `createMeteoraConfig` / create pools (`rules.create`, roles), which config values a
  write may carry (field validation on fee bps, caps), and any ledger invariants on
  claimed fees. An over-limit or unauthorized launch write is rejected before the
  `hooks.onchain` call ever fires.
- **TRUSTED (not proven):** the plugin bodies that build and server-sign the Meteora
  txns (config creation, pool creation, swaps, fee claims, migration) - trusted like
  all plugin code. The fee schedule you declare is what the SDK receives; the proof
  does not model Meteora's on-chain fee math or that the chain executed the migration.
- **RESIDUAL (needs a live fill):** that a real curve trade under the decay schedule
  charges the expected fee, that migration triggers at `migrationMarketCap`, and that
  `withdrawLeftover` releases exactly `leftover` - confirm against a live pool
  (devnet), not the prover. Nothing external blocks that run today.

## Notes & gotchas

- **Decay defaults are flat.** Omit the four decay params and the fee is a flat
  `preMigratedFeeAmountBps` - existing configs are unchanged. Only set them to arm
  the anti-snipe schedule.
- **`decayTotalDuration` is in slots** (`activationType: Slot`), not seconds. ~2–2.5
  slots/sec on Solana.
- **`leftover < totalTokenSupply`** or config creation throws.
- **Positional optionals:** to reach the decay params you must also pass params 6–11
  (market caps, supply, decimals, leftover, leftoverReceiver) - pass their defaults
  explicitly.
- **Eventual consistency:** confirm the transaction, then poll for the expected Bounded postcondition.
  A returned signature proves submission, not indexing.
- **Slippage:** always pass `swapInMeteoraVirtualPool`'s fifth argument on a trade that carries value.
- Function names have numeric-id aliases; always use the named form in policies.
