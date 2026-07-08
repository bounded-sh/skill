# oApps tokenomics — the 55/25/20 fee split (composed in policy)

**What's in here / when to read this:** you launched a token on Meteora (see
[meteora-token-launch.md](meteora-token-launch.md)) and now you need to *route the
trading fees to more than two parties* — the oApps model is **55% treasury / 25%
creator-of-record / 20% Poof**. Meteora's config is only 2-party (creator vs
partner), so the third leg and the exact bps are **composed in Bounded policy** and
proven by Z3. This doc is the worked example that
[meteora-token-launch.md → the fee-split reality](meteora-token-launch.md#the-fee-split-reality-honest)
points at. It also covers the two patterns that make the split run unattended: the
**keeper** (offchain schedule → function → onchain write) and the **fee-funded build
allowance** (a proven rolling burn cap).

> Every collection below is copied from the Z3-verified reference policy at
> [examples/oapps-tokenomics/policy.json](../examples/oapps-tokenomics/policy.json).
> Signatures match `plugin-contracts.ts` exactly. What Z3 proves vs what stays
> trusted is stated honestly at the end — read that block before you quote any
> guarantee.

## The shape of the split

```
                         each trade's fee
                               │
        ┌──────────────────────┴───────────────────────┐
        │ TIER 1 — native 2-party leg (on the pool)     │
        │                                                │
   feeAccount="treasury"                    preMigratedCreatorFeePercentage=45
   → 55% direct to the Treasury PDA         → the 45% "creator" leg accrues to
     (the partner leg)                        the "feepool" PDA
        │                                                │
        ▼                                                ▼
   done (55%)                        ┌──────────────────────────────────┐
                                     │ TIER 2 — policy split of feepool │
                                     │  atomic, permissionless          │
                                     │  creator : Poof = 5556 : 4444 bps│
                                     │  (= 25 : 20 of the whole)        │
                                     └──────────────────────────────────┘
```

- **55% is native.** Point Meteora's `feeAccount` at the Treasury PDA and that leg is
  paid by the pool directly — no Bounded write moves it.
- **25% + 20% is composed.** The remaining 45% accrues to a shared `feepool` PDA;
  a permissionless Bounded write claims it and splits it creator:Poof by **fixed
  bps literals in policy**. `5556/4444` of the 45% pool is exactly `25/20` of the
  whole.
- **The seam is deliberate.** Both bps live in policy, so re-tuning creator≠Poof
  later is a one-line policy change that re-proves, not a plugin edit.

## Tier 1 — the native legs (`launch` + `pools`)

The config sends 55% to `treasury` and routes the 45% creator leg to the pool
authority. `preMigratedCreatorFeePercentage = 45` is the only split knob Meteora
gives you; the partner (`feeAccount`) takes the remainder (55%).

```json
"launch/$launchId": {
  "onchain": true,
  "fields": { "name": "String" },
  "rules": { "read": "true", "create": "@user.address != null", "update": "false", "delete": "false" },
  "hooks": {
    "onchain": {
      "create": "@DeFiPlugin.createMeteoraConfig(@const.CONFIG_ID, \"treasury\", 300, 45, 200, 50, 30, 85, 1000000000, 6, 0, \"treasury\", 5000, 300, 60, 300)"
    }
  }
}
```

That is the full 16-arg config: `feeAccount="treasury"` (the 55% partner leg),
`preMigratedCreatorFeePercentage=45` (the creator leg), settled fee 3% / DAMM 2%,
market caps 30→85, supply 1e9 @ 6 decimals, leftover 0 to `treasury`, and the
anti-snipe decay **50% → 3% over 60 steps / 300 slots** (the 4 trailing params). For
the per-arg meaning of every position see
[meteora-token-launch.md → createMeteoraConfig](meteora-token-launch.md#createmeteoraconfig--the-launch-config).

The two PDAs are created once, idempotently, by the `vaults` collection:

```json
"vaults/$vaultId": {
  "onchain": true,
  "fields": { "note": "String" },
  "rules": { "read": "true", "create": "@user.address != null", "update": "false", "delete": "false" },
  "hooks": {
    "onchain": { "create": "@AccountPlugin.createAccount(\"treasury\") && @AccountPlugin.createAccount(\"feepool\")" }
  },
  "queries": {
    "treasuryAddress": { "returnType": "String", "query": "@AccountPlugin.getAccountAddress(\"treasury\")" },
    "feepoolAddress": { "returnType": "String", "query": "@AccountPlugin.getAccountAddress(\"feepool\")" }
  }
}
```

`treasury` = the 55% partner leg; `feepool` = the shared creator+Poof split pool.

## Tier 2 — the atomic permissionless distribute (`claims` + `distributions`)

Fees do not auto-sweep. A permissionless `claims` write pulls **both** native legs
to their PDAs (treasury and feepool), and a permissionless `distributions` write
claims the feepool leg and splits it in one atomic hook:

```json
"distributions/$distId": {
  "onchain": true,
  "isPassthrough": true,
  "fields": { "amount": "UInt" },
  "rules": { "read": "true", "create": "@user.address != null", "update": "false", "delete": "false" },
  "hooks": {
    "onchain": {
      "create": "@DeFiPlugin.claimMeteoraPoolFees(\"feepool\", @DeFiPlugin.getMeteoraVirtualPoolAddress(@const.OAPP_MINT, @const.CONFIG_ID)) && @TokenPlugin.transfer(\"feepool\", @const.CREATOR, @TokenPlugin.SOL, @MathPlugin.mulDivFloor(@newData.amount, 5556, 10000)) && @TokenPlugin.transfer(\"feepool\", @const.POOF, @TokenPlugin.SOL, @MathPlugin.mulDivFloor(@newData.amount, 4444, 10000))"
    }
  }
}
```

- The recipients (`@const.CREATOR`, `@const.POOF`) and the bps (`5556`, `4444`) are
  **fixed literals in policy** — a caller cannot redirect a leg or change a share.
- Only `@newData.amount` (the claimed lamports snapshot for this cycle) is
  caller-supplied. It sizes both legs via `@MathPlugin.mulDivFloor(amount, bps,
  10000)`. Over-stating it just fails on-chain (insufficient PDA balance); see the
  TRUSTED note below.
- **Permissionless = reliability.** `create: "@user.address != null"` means any
  authenticated wallet — trader, keeper, or a good samaritan — can turn the crank.
  Nobody can steal from it because the routing is policy-fixed. (Literally-anonymous
  `create:"true"` is rejected by the write-auth-consistency gate when update/delete
  deny; every actor here has a wallet, so this is permissionless in practice.)

## Phase asymmetry — post-migration is a full 3-way policy split

**This is the subtle part.** At graduation the native partner leg zeroes: post-migration
all DAMM v2 fees route to the creator-authority (`feepool`), not to `feeAccount`. So
the Tier-1 native 55% *disappears* as a native leg. To keep the 55/25/20 invariant,
post-migration does the **entire** split in policy — a 3-way distribute of the DAMM
claim, `5500 / 2500 / 2000` bps:

```json
"dammClaims/$claimId": {
  "onchain": true, "isPassthrough": true,
  "fields": { "note": "String" },
  "rules": { "read": "true", "create": "@user.address != null", "update": "false", "delete": "false" },
  "hooks": { "onchain": {
    "create": "@DeFiPlugin.claimDammV2PoolFees(\"feepool\", @DeFiPlugin.getDammV2PoolAddress(@const.OAPP_MINT)) && @DeFiPlugin.withdrawLeftover(@DeFiPlugin.getMeteoraVirtualPoolAddress(@const.OAPP_MINT, @const.CONFIG_ID))"
  } }
},
"distributionsPost/$distId": {
  "onchain": true, "isPassthrough": true,
  "fields": { "amount": "UInt" },
  "rules": { "read": "true", "create": "@user.address != null", "update": "false", "delete": "false" },
  "hooks": { "onchain": {
    "create": "@DeFiPlugin.claimDammV2PoolFees(\"feepool\", @DeFiPlugin.getDammV2PoolAddress(@const.OAPP_MINT)) && @TokenPlugin.transfer(\"feepool\", \"treasury\", @TokenPlugin.SOL, @MathPlugin.mulDivFloor(@newData.amount, 5500, 10000)) && @TokenPlugin.transfer(\"feepool\", @const.CREATOR, @TokenPlugin.SOL, @MathPlugin.mulDivFloor(@newData.amount, 2500, 10000)) && @TokenPlugin.transfer(\"feepool\", @const.POOF, @TokenPlugin.SOL, @MathPlugin.mulDivFloor(@newData.amount, 2000, 10000))"
  } }
}
```

| | Pre-migration (bonding curve) | Post-migration (DAMM v2) |
|---|---|---|
| Treasury 55% | **native** partner leg (`feeAccount`) | **policy** leg `5500` bps |
| Creator 25% | policy `5556` bps of the 45% pool | policy `2500` bps |
| Poof 20% | policy `4444` bps of the 45% pool | policy `2000` bps |
| Claim from | `claimMeteoraPoolFees` | `claimDammV2PoolFees` (+ `withdrawLeftover`) |

Same 55/25/20 outcome on both sides of graduation, reached two different ways. The
prover checks both distribute hooks the same way: fixed recipients, fixed bps,
caller-supplied `amount` only.

## The keeper — offchain schedule → function → onchain write

Because fees do not auto-sweep, something has to fire `claims` / `distributions` /
`dammClaims` on a cadence. **A schedule cannot run directly on an onchain
collection** — a scheduled mutation needs a server signer, which an onchain
collection lacks, and the validator rejects `schedule` on `"onchain": true` (see
[hooks-scheduled-webhooks.md](../../bounded-backend/docs/hooks-scheduled-webhooks.md#hooksscheduled--schedule--recurring-jobs)).
So the keeper is **offchain heartbeat → Bounded function (`actAs` a signer) →
onchain write**:

```json
"heartbeat/$id": {
  "fields": { "lastTick": "UInt", "note": "String" },
  "tier": "durable",
  "rules": { "read": "true", "create": "@user.id != null", "update": "@user.id != null && get(/admins/@user.id) != null", "delete": "false" },
  "schedule": { "every": "5m", "run": "keeper" }
},
"functions": {
  "keeper": {
    "auth": "get(/admins/@user.id) != null",
    "entry": "keeper.js",
    "actAs": "AK5RcyBCHnMmiS9KN1RMPktVKpjeEZKMhV6oe6r7m9Hm"
  }
}
```

The scheduled function writes rows *into* the permissionless collections through
`ctx.bounded`, so every write it makes still passes that collection's rules and
invariants:

```js
export default async function keeper(_args, ctx) {
  // 1) claim accrued fees to the treasury (55%) + split-pool (45%) PDAs
  await ctx.bounded.add('claims', { note: 'keeper' });
  // 2) distribute the split-pool leg creator:Poof = 5556:4444 bps
  //    (amount = keeper-computed claimed lamports for this cycle)
  // await ctx.bounded.add('distributions', { amount });
  return true;
}
```

- **Reliability-only, not trust.** Every collection the keeper touches is
  permissionless, so if the keeper stalls, anyone can claim/distribute manually and
  get the identical policy-fixed routing. The keeper is a convenience crank, not a
  privileged party. What *is* proven about it: its `actAs` signer is admin-gated
  (`auth: get(/admins/@user.id) != null`), so a random caller cannot invoke it as
  the signer.
- **Honest gap — the reference keeper only claims today.** The stub above fires only
  step 1 (`claims`). Steps 2–4 are commented out because `distributions.amount` must
  be the **claimed lamports for this cycle**, and the keeper has to *compute* that
  (read claimable before the claim, or diff the PDA balance) to wire the distribute
  leg. That computation is app logic left to the implementer; the policy proves the
  distribute is safe *for whatever amount is asserted*, not that the keeper computed
  it correctly. See `amount` in the TRUSTED block.

## The fee-funded build allowance — a proven rolling burn cap

oApps fund their own AI build spend from the fees they earn. Model it as an
**append-only spend log** with a `rollingSum` invariant capping spend over a rolling
window — distinct from the fixed platform trial allowance (that is a flat quota;
this is a *self-refilling* budget backed by real claimed fees):

```json
"builds/$buildId": {
  "tier": "durable",
  "fields": { "amount": "UInt" },
  "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
  "invariants": [
    { "type": "rollingSum", "name": "build_allowance_cap", "field": "amount", "windowSeconds": 86400, "limit": "@const.BUILD_ALLOWANCE" }
  ]
}
```

- **Append-only.** `update`/`delete` deny, so the log cannot be rewritten to hide
  spend. Each build appends one row carrying its `amount`.
- **`rollingSum` is a proven cap.** Z3 proves that for *every possible sequence of
  appends*, the sum of `amount` over any trailing `windowSeconds` (86400 = 24h)
  never exceeds `@const.BUILD_ALLOWANCE`. There is no sequence of writes that
  overspends the day's budget. See
  [invariants.md](../../bounded-backend/docs/invariants.md).
- **Credited by fees.** Claimed on-chain fees raise the effective budget (set
  `BUILD_ALLOWANCE`, or a per-app constant, from realized treasury inflow); the cap
  is what makes "spend up to what the app earned" a *provable* boundary rather than a
  hope.

## PROVEN vs TRUSTED vs NEEDS-DEVNET (state it honestly)

- **PROVEN (Z3, every input):**
  - **who may trigger** each write — the `rules.create`/`update` proofs (permissionless
    = any authenticated wallet; the keeper's `actAs` signer is admin-gated).
  - **the split bps are fixed literals in policy** — `5556/4444` pre-migration and
    `5500/2500/2000` post-migration are not caller-supplied; a caller cannot move a
    leg or change a share.
  - **the build-allowance rolling burn cap** — `rollingSum` holds for every sequence
    of appends; the 24h budget cannot be overspent.
- **TRUSTED (in-plugin, not proven — intentional, per design):**
  - the Meteora / token plugin bodies that build and server-sign the txns, and that a
    `transfer` of `mulDivFloor(amount, bps, 10000)` moves exactly that many lamports.
  - the **`amount` snapshot** on `distributions` / `distributionsPost` — the claimed
    lamports for the cycle is a caller/keeper-asserted write field. There is **no
    `conserve` invariant** on the treasury: per the oApps design the split amounts
    are trusted-in-plugin while the policy proves *who-may-trigger + bps validity +
    the allowance cap*. Over-stating `amount` fails on-chain (insufficient PDA
    balance), so the failure mode is a reverted tx, not a drained pool.
- **NEEDS-DEVNET (cannot be expressed in policy):**
  - the **creator-leg (45%) recipient binding.** `createMeteoraVirtualPool(configId,
    tokenId, name, symbol, uri, initialSolBuy?)` has **no source/creator param**
    (confirmed vs `plugin-contracts.ts`), so the creator leg follows the
    pool-creation signer, not a policy-chosen PDA. The policy claims
    `source:"feepool"` on both `claims` and `distributions`, but *that the 45%
    actually accrues to `feepool`* must be confirmed on a live devnet pool (or by
    extending Bounded so `createMeteoraVirtualPool` takes an explicit creator/source).
  - that a live curve trade under the decay schedule charges the expected fee, that
    migration triggers at `migrationMarketCap`, and that `withdrawLeftover` releases
    exactly `leftover` — all live-fill residuals, same as in
    [meteora-token-launch.md](meteora-token-launch.md#what-is-proven-vs-what-is-trusted-state-it-honestly).

## Run it

The full verified policy (all 11 collections + constants + `functions.keeper`) is at
[examples/oapps-tokenomics/](../examples/oapps-tokenomics/) with a README. It is
verify-only (no `appId`, deploys nothing). From that directory:

```
bounded verify
```

proves every construct above. See the example README for the one residual (a
server-side verifier arity, not a policy defect) and how to read the result.
