# oApps tokenomics - verified reference policy

The policy a **launched oApp runs**: a Meteora DBC launch (bonding-curve → DAMM v2
graduation) with the **55% treasury / 25% creator-of-record / 20% Poof** fee split,
expressed as a Bounded policy and proven by Z3. **Verify-only - this deploys
nothing** (`bounded.json` has no `appId`; never `--create`/deploy it).

> **Current devnet status: unverified, not blocked.**
> The earlier retired-authority blocker was cleared on 2026-07-29; the replacement DAMM v2 config is deployed on devnet and the deployed runtime targets it.
> Keep this example verify-only until live acceptance closes, but nothing external prevents producing that evidence.

Read [../../docs/oapps-tokenomics-fee-split.md](../../docs/oapps-tokenomics-fee-split.md)
for the full walkthrough. This directory is the runnable artifact behind it.

## Files

- `policy.json` - the **design-correct** policy (16-arg `createMeteoraConfig` with
  the 4 anti-snipe decay params). What a launched oApp actually runs.
- `policy.verify-today.json` - byte-identical **except** the launch config drops the
  4 trailing decay params (12-arg form). It is a compatibility verification fixture, not devnet support evidence.
- `keeper.js` - the scheduled keeper function body (fires the permissionless claim;
  the distribute leg is left as commented app logic - see the doc's keeper section).
- `bounded.json` - `protocol: realtime_mainnet`, verify-only.

## Verify it

```
bounded verify                       # uses policy.json (per bounded.json)
bounded verify --policy policy.verify-today.json
```

- **`policy.verify-today.json` (12-arg):** a green result covers the policy proof obligations and source contracts only.
  It does not prove that a Meteora transaction can execute on devnet.
- **`policy.json` (16-arg):** current monorepo source accepts the four decay arguments through `paramCount: { min: 6, max: 16 }`.
  If a deployed verifier reports `expects 6-12 argument(s)`, that endpoint is older than the source contract.
  Either verifier result remains separate from live network verification.

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

See the doc's [PROVEN vs TRUSTED vs NEEDS LIVE PROOF](../../docs/oapps-tokenomics-fee-split.md#proven-vs-trusted-vs-needs-live-proof)
block. In short: Z3 proves **who may trigger** each write, that the **split bps are
fixed literals**, and the **build-allowance cap**. Trusted (per design, no
`conserve`): the plugin bodies and the caller-asserted claimed `amount`.
Not derivable today: a fee-attributed total per recipient, because no primitive
returns a per-mint claimed amount.
Live proof must still confirm that the 45% creator leg actually lands in `feepool`
(`createMeteoraVirtualPool` has no creator/source param).

The placeholder base58 constants (`OAPP_MINT`, `CREATOR`, `POOF`, `KEEPER`) are
swapped for the real mint + recipient wallets at launch.
