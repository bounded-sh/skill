# oApps tokenomics — verified reference policy

The policy a **launched oApp runs**: a Meteora DBC launch (bonding-curve → DAMM v2
graduation) with the **55% treasury / 25% creator-of-record / 20% Poof** fee split,
expressed as a Bounded policy and proven by Z3. **Verify-only — this deploys
nothing** (`bounded.json` has no `appId`; never `--create`/deploy it).

Read [../../docs/oapps-tokenomics-fee-split.md](../../docs/oapps-tokenomics-fee-split.md)
for the full walkthrough. This directory is the runnable artifact behind it.

## Files

- `policy.json` — the **design-correct** policy (16-arg `createMeteoraConfig` with
  the 4 anti-snipe decay params). What a launched oApp actually runs.
- `policy.verify-today.json` — byte-identical **except** the launch config drops the
  4 trailing decay params (12-arg form). Proves **green today** (see the residual).
- `keeper.js` — the scheduled keeper function body (fires the permissionless claim;
  the distribute leg is left as commented app logic — see the doc's keeper section).
- `bounded.json` — `protocol: realtime_mainnet`, verify-only.

## Verify it

```
bounded verify                       # uses policy.json (per bounded.json)
bounded verify --policy policy.verify-today.json
```

- **`policy.verify-today.json` (12-arg):** `✓ Proven — every [PASS] guarantee holds
  for all possible inputs.` All rule-property proofs, the `rollingSum` build-allowance
  cap, the keeper's admin-gated `actAs`, and every onchain plugin call prove.
- **`policy.json` (16-arg):** proves identically **except** one `[FAIL]`:
  `@DeFiPlugin.createMeteoraConfig expects 6-12 argument(s) but received 16` — a
  **stale server-side verifier**, not a policy defect. The fix is already in monorepo
  source (`plugin-contracts.ts` `paramCount: { min: 6, max: 16 }` with a passing
  test) but not yet deployed to the running dev-api `/verify-formal`. Once that
  contract ships, `policy.json` verifies green with no other change — proven today by
  `policy.verify-today.json`, which differs only in the 4 decay params.

## The 11 collections (all proven)

| Collection | Onchain | Role |
|---|---|---|
| `admins/$userId` | no | keeper/admin identity set |
| `vaults/$vaultId` | yes | create the `treasury` + `feepool` PDAs (idempotent) |
| `launch/$launchId` | yes | Tier-1 config: `feeAccount="treasury"` (55%), creator%=45 → feepool, decay 50%→3% |
| `pools/$tokenId` | yes | mint + open the virtual pool |
| `trades/$tradeId` | yes | trading passthrough |
| `claims/$claimId` | yes | permissionless pre-migration claim of both native legs |
| `distributions/$distId` | yes | Tier-2 pre-migration split: feepool → creator 5556 / Poof 4444 bps |
| `dammClaims/$claimId` | yes | permissionless post-migration claim + leftover sweep |
| `distributionsPost/$distId` | yes | Tier-2 post-migration 3-way split: treasury 5500 / creator 2500 / Poof 2000 bps |
| `builds/$buildId` | no | fee-funded build allowance (`rollingSum` burn cap) |
| `heartbeat/$id` | no | keeper heartbeat + `schedule` → `functions.keeper` (`actAs`) |

## What's proven vs trusted

See the doc's [PROVEN vs TRUSTED vs NEEDS-DEVNET](../../docs/oapps-tokenomics-fee-split.md#proven-vs-trusted-vs-needs-devnet-state-it-honestly)
block. In short: Z3 proves **who may trigger** each write, that the **split bps are
fixed literals**, and the **build-allowance cap**. Trusted (per design, no
`conserve`): the plugin bodies and the caller-asserted claimed `amount`.
Needs-devnet: that the 45% creator leg actually lands in `feepool`
(`createMeteoraVirtualPool` has no creator/source param).

The placeholder base58 constants (`OAPP_MINT`, `CREATOR`, `POOF`, `KEEPER`) are
swapped for the real mint + recipient wallets at launch.
