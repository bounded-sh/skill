# Meteora token launch — Dynamic Bonding Curve → DAMM v2 graduation

**What's in here / when to read this:** you want an app to *launch a token* on
Meteora — stand up a Dynamic Bonding Curve (DBC) that trades on a bonding curve,
then **graduates** (migrates) to a DAMM v2 pool once it hits a market cap — and
collect the trading fees on both sides. This is the launchpad primitive behind
oApps / pump-style launches. For plain spot swaps against an existing pool, and the
`source`/custody model, read [onchain-trading.md](onchain-trading.md) first — this
builds on the same server-signed `hooks.onchain` mechanism.

> All calls below are `@DeFiPlugin` functions with **registered proof contracts** —
> the signatures here match `plugin-contracts.ts` and the sol-helper defi-plugin
> manifest exactly. Plugin bodies are trusted (they build the Solana tx); the policy
> *around* the launch is what's provable. Same server-signed hook path as
> `@TokenPlugin.transfer`.

## The two phases

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

1. **Config** (`createMeteoraConfig`) — a reusable curve/fee template for the app.
   Declares the pre-migration (bonding-curve) fee, the anti-snipe decay, the
   post-migration (DAMM v2) fee, the creator/partner split, and the market caps at
   which the pool starts and graduates.
2. **Pool** (`createMeteoraVirtualPool`) — mints one token against a config and opens
   its virtual (bonding-curve) pool. Trades run through `swapInMeteoraVirtualPool`.
3. **Graduation** — when the pool reaches `migrationMarketCap` it migrates to DAMM v2
   automatically (`migrationOption: MET_DAMM_V2`). Post-migration you claim LP fees
   with `claimDammV2PoolFees` and sweep any reserved `leftover` tokens with
   `withdrawLeftover`.

## `createMeteoraConfig` — the launch config

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
| 1 | `feeAccount` | **Partner** fee recipient (the fee claimer). `@contract.address` (escrow PDA), a wallet address, or an `@AccountPlugin` account id. |
| 2 | `preMigratedFeeAmountBps` | Bonding-curve trading fee, in bps (300 = 3%). Also the flat/settled fee when no decay is set. |
| 3 | `preMigratedCreatorFeePercentage` | Creator's share of the bonding-curve trading fee (0–100). The rest goes to `feeAccount` (partner). |
| 4 | `postMigratedFeeAmountBps` | DAMM v2 pool swap fee after graduation, in bps (200 = 2%). |
| 5 | `postMigratedCreatorFeePercentage` | Creator's **permanently-locked** liquidity share of the migrated pool (0–100); the remainder is creator (unlocked) liquidity. Partner liquidity is 0 — all migrated liquidity is the creator's. |
| 6 | `initialMarketCap?` | Starting market cap in SOL for the curve. Default `30`. |
| 7 | `migrationMarketCap?` | Market cap in SOL at which the pool graduates to DAMM v2. Default `85`. |
| 8 | `totalTokenSupply?` | Total token supply (base units). Default `1000000000`. |
| 9 | `tokenBaseDecimal?` | Token decimals — `6` or `9`. Default `6`. |
| 10 | `leftover?` | Tokens reserved outside the curve, minted to the pool's base vault; withdrawable only by `leftoverReceiver` after migration. Must be `< totalTokenSupply`. Default `0`. |
| 11 | `leftoverReceiver?` | Who can withdraw the `leftover` after migration. Wallet, `@contract.address`, or account id. Default: `feeAccount`. |
| 12 | `decayStartingFeeBps?` | **Anti-snipe** opening fee in bps (e.g. `5000` = 50%). Default: `preMigratedFeeAmountBps` (flat, no decay). |
| 13 | `decayEndingFeeBps?` | Fee the schedule decays down to, in bps. Default: `preMigratedFeeAmountBps`. |
| 14 | `decayNumberOfPeriod?` | Number of linear reduction steps. Default `0` (flat). |
| 15 | `decayTotalDuration?` | Total decay duration in **slots** (the pool's activation unit). Default `0` (flat). |

Params 6–15 are optional and positional — to set a later one you must pass the
earlier ones (use their defaults explicitly). Omit them all and you get the classic
flat-fee config.

### Anti-snipe fee decay (opt-in)

The bonding-curve opening is the moment snipers race in. Meteora's
`BaseFeeMode.FeeSchedulerLinear` lets the trading fee **start high and decay** to the
normal fee over the first minutes, which taxes the snipe and hands the proceeds to
the creator/partner instead of the sniper. Bounded threads the four decay params
straight to that schedule; when they're omitted the fee is flat
(`startingFeeBps === endingFeeBps === preMigratedFeeAmountBps`, 0 periods) — i.e. the
original behavior, unchanged.

Example — open at **50%**, decay to **3%** over ~2 minutes (300 slots ≈ 2 min on
Solana at ~2.5 slots/s), with the settled fee split 50/50 creator/partner, graduating
at 85 SOL market cap:

```json
{
  "launches/$configId": {
    "onchain": true,
    "fields": { "configId": "String" },
    "rules": { "read": "true", "create": "hasRole('launcher')", "update": "false", "delete": "false" },
    "hooks": {
      "onchain": { "create":
        "@DeFiPlugin.createMeteoraConfig($configId, @contract.address, 300, 50, 200, 50, 30, 85, 1000000000, 6, 0, @contract.address, 5000, 300, 60, 300)"
      }
    }
  }
}
```

- `preMigratedFeeAmountBps = 300` (3%) is the settled bonding-curve fee and the decay
  target when `decayEndingFeeBps` is left at its default.
- `decayStartingFeeBps = 5000` (50%) → `decayEndingFeeBps = 300` (3%) over
  `decayNumberOfPeriod = 60` steps across `decayTotalDuration = 300` slots.
- A ~25% opener is just `2500` instead of `5000`. The published oApps default is a
  25–50% opening decaying to 3%.

## `createMeteoraVirtualPool` — mint + open the pool

```
@DeFiPlugin.createMeteoraVirtualPool(configId, tokenId, name, symbol, uri, initialSolBuyAmount?) -> Bool
```

Mints one token (`tokenId` is app-unique) against a `configId` and opens its virtual
pool. `uri` is the JSON-metadata URI. `initialSolBuyAmount?` (lamports) does an
optional dev-buy right after creation.

- `@DeFiPlugin.getMeteoraVirtualPoolAddress(tokenMintAddress, configId) -> Address`
  (pure) resolves the pool address for a token.
- `@DeFiPlugin.getMeteoraSwapQuote(tokenMintAddress, tokenToSwapInMintAddress, tokenAmount) -> Int`
  (pure) quotes a swap before you make it.

## Trading on the curve + claiming fees

| Function | Signature | Does |
|---|---|---|
| `swapInMeteoraVirtualPool` | `(source, poolTokenMint, tokenMint, amount) -> Bool` | Buy/sell against the virtual pool. |
| `getClaimableMeteoraPoolFees` | `(source, poolAddress) -> Int` (pure) | How much is claimable now. |
| `claimMeteoraPoolFees` | `(source, poolAddress) -> Bool` | Claim accrued bonding-curve fees to `source`. |

`source` follows the same custody rule as all trading calls — `@contract.address`
(escrow PDA, server-signed) for an app-operated launch, or a user wallet for
self-custody. See [onchain-trading.md → `source`](onchain-trading.md).

## Graduation to DAMM v2 + post-migration

Once the pool reaches `migrationMarketCap`, Meteora migrates it to a DAMM v2 pool.
Post-migration the fee model switches to the DAMM v2 side of the config
(`postMigratedFeeAmountBps`, `postMigratedCreatorFeePercentage`).

| Function | Signature | Does |
|---|---|---|
| `getDammV2PoolAddress` | `(tokenMintAddress) -> Address` (pure) | Resolve the graduated pool. |
| `claimDammV2PoolFees` | `(source, poolAddress, positionMintAddress?) -> Bool` | Claim LP fees from the migrated pool. With `positionMintAddress`, only that position; otherwise all positions `source` owns in the pool. |
| `withdrawLeftover` | `(virtualPoolAddress) -> Bool` | Sweep the reserved `leftover` tokens to the config's `leftoverReceiver`. Only valid **after** migration. |

## The fee-split reality (honest)

Meteora's config is **2-party**: on the curve, each trade's fee splits between the
**creator** (`preMigratedCreatorFeePercentage`) and the **partner** = `feeAccount`
(the remainder). Post-migration, all liquidity is the creator's — the
`postMigratedCreatorFeePercentage` slice is permanently locked (earns LP fees
forever) and the rest is unlocked; fees are claimed with `claimDammV2PoolFees`.

There is **no native 3-way split**. A multi-party split (e.g. the oApps **55%
treasury / 25% creator / 20% Poof** model) is *composed in Bounded policy* on top of
this 2-party primitive. The mapping is direct: point `feeAccount` at the treasury
PDA — that pays the **55%** partner leg natively — and set
`preMigratedCreatorFeePercentage` to the **combined creator+platform share (45)** so
that leg accrues to a shared `feepool` PDA. A permissionless onchain write then
claims `feepool` and splits it by **fixed bps literals in policy**
(`5556/4444` of the 45% pool = 25/20 of the whole), with `@MathPlugin.mulDivFloor`
sizing each `@TokenPlugin.transfer` leg. Post-graduation the native partner leg
zeroes, so the whole 55/25/20 becomes a 3-way policy split of the `claimDammV2PoolFees`
claim (`5500/2500/2000`).

For the full worked example — every collection copied from the Z3-verified reference
policy, the keeper that turns the crank, the fee-funded build allowance, and an
honest PROVEN-vs-TRUSTED-vs-NEEDS-DEVNET breakdown — see
[oapps-tokenomics-fee-split.md](oapps-tokenomics-fee-split.md).

## What is PROVEN vs what is trusted (state it honestly)

- **PROVEN (Z3, every input):** the policy *around* the launch — who may call
  `createMeteoraConfig` / create pools (`rules.create`, roles), which config values a
  write may carry (field validation on fee bps, caps), and any ledger invariants on
  claimed fees. An over-limit or unauthorized launch write is rejected before the
  `hooks.onchain` call ever fires.
- **TRUSTED (not proven):** the plugin bodies that build and server-sign the Meteora
  txns (config creation, pool creation, swaps, fee claims, migration) — trusted like
  all plugin code. The fee schedule you declare is what the SDK receives; the proof
  does not model Meteora's on-chain fee math or that the chain executed the migration.
- **RESIDUAL (needs a live fill):** that a real curve trade under the decay schedule
  charges the expected fee, that migration triggers at `migrationMarketCap`, and that
  `withdrawLeftover` releases exactly `leftover` — confirm against a live pool
  (devnet), not the prover.

## Notes & gotchas

- **Decay defaults are flat.** Omit the four decay params and the fee is a flat
  `preMigratedFeeAmountBps` — existing configs are unchanged. Only set them to arm
  the anti-snipe schedule.
- **`decayTotalDuration` is in slots** (`activationType: Slot`), not seconds. ~2–2.5
  slots/sec on Solana.
- **`leftover < totalTokenSupply`** or config creation throws.
- **Positional optionals:** to reach the decay params you must also pass params 6–11
  (market caps, supply, decimals, leftover, leftoverReceiver) — pass their defaults
  explicitly.
- **Eventual consistency:** don't read-after-write the launch doc; use the pure read
  functions (`getMeteoraVirtualPoolAddress`, `getDammV2PoolAddress`,
  `getClaimableMeteoraPoolFees`) for authoritative state.
- Function names have numeric-id aliases; always use the named form in policies.
