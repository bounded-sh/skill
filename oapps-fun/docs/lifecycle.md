# The oApp lifecycle: local, Bounded, Open, Commence

**What's in here:** the four states an oApp passes through, why every oApp is a mainnet app you do not create yourself, what completed Open publishes, and source sync. Part of the **oapps-fun** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## The four states

An oApp passes through four states.
Keep its direct app address separate from its stable venue page and its later oApps slug.

**1. Local.** You build in a normal repo.
Nothing is deployed or public.

**2. Bounded (development).** Promote the creator app with `bounded init`, `bounded verify`, `bounded deploy`, and `bounded site deploy dist`.
At creation the app claims a slug derived from its name plus a random suffix, such as `myapp-x7k2.bounded.page`.
That is a development address, not an openapps.xyz address.
There is no openapps.xyz URL until Commence.

While building, keep the creator site **private** (`sitePrivate`, set through the dashboard or API).
The platform serves a sign-in gate to everyone else, and `bounded site preview` mints short-lived view links when you need to show someone.
Do not flip it public yourself.
Open publishes a separate governed workload only after the full opening completes.

**3. Open (public, awaiting Commence).** Completed Open creates the venue-owned root and workload, then makes the exact workload site and source public at `https://<workloadAppId>.bounded.page`.
It also publishes the venue page at `/a/<rootAppId>` (older `/l/` links redirect there).
The app is real and usable, but it has no oApps slug, venue listing, token, or running Gauntlet yet.
The creator app remains a disconnected development sandbox.

**4. Commenced.** An explicit Commence action claims `openapps.xyz/a/<slug>`, writes the venue listing, creates the token sale, and starts the Gauntlet.
Commence does not create the app or make its source public because Open already did both.
The direct workload app-id host remains public, and `/a/<rootAppId>` remains the canonical venue page before and after Commence.
Choose the requested slug before Commence because its pointer becomes governance-controlled once Commence completes.

**One creator app launches exactly once.**
Commence claims the slug on the creator app itself, and that name becomes the oApp's permanent public address, so the platform freezes it and keeps the app alive forever.
Re-opening BEFORE Commence is fine and expected, but once any opening from this app has commenced, a further opening is refused at the door with `oapp_creator_already_launched` (409), naming the launch that already exists.
To launch a second oApp, start from a different app.

## oApps are mainnet apps

Open creates the root and the workload as Solana **mainnet** apps (`realtime_mainnet`), even when the
policy has no onchain collections at all. You do not choose this and you do not pass `--protocol`:
the platform sets it.

- **On-chain owner is a Bounded-custodied key**, not your wallet and not the platform admin. That is
  what lets the app outlive you: the platform can co-sign its policy updates without any person
  holding the key that owns it. An ordinary `--create --protocol realtime_mainnet` app is different -
  that one is owned by *your* wallet, immutably (see **bounded-onchain**).
- **Your creator app does not change.** It stays whatever protocol it was created with (normally
  `realtime_offchain`). Do NOT re-create it as `realtime_mainnet` to "become an oApp" - Open does the
  mainnet part for you, and a mainnet creator app cannot be transferred; deleting one permanently
  orphans its onchain accounts (nothing offchain can close them).
- **Do not `bounded deploy` at an opened root or workload.** They are platform-managed and
  custody-owned; the CLI will refuse on an owner mismatch because your local wallet is not the owner.
  Governed changes go through the oApp's own rails.
- **Rehearsal/preview stays poofnet** (simulated money), by design.
- Open can refuse with `mainnet_not_entitled`. That is checked against the oApp's own fuel account
  (`oapp:<rootAppId>`), not your personal plan, so "upgrade my account to Pro" is not the fix.

**`onchain: true` collections are not Openable yet.** An oApp's mainnet app would execute them
against real mainnet rather than the simulator, but the Open rail does not yet register those
collections on the app's program account - so Open refuses the policy outright with
`oapp_opening_onchain_policy_unsupported` rather than publishing an app the chain cannot serve.
Everything else onchain still works: embedded wallets, payments, DEX/token plugin calls, and reads.
If you need onchain state collections in an oApp, say so plainly and stop, per
"calling it out" in [capability-ladder.md](capability-ladder.md#what-calling-it-out-looks-like) - do not work around it.


## What Open publishes (read before you let go)

Completed Open is the publication boundary and is separate from Commence.
Spell these implications out before starting Open:

1. **Your workload site and source become public.** Anyone can use the site at `https://<workloadAppId>.bounded.page`, read its source at `https://<workloadAppId>.bounded.page/__bounded/source`, and download the whole tree as `source.zip`.
2. **Your boundaries are published.** The governed workload's `policy.json` appears at `/__bounded/boundaries` on that same exact app-id host.
   The rules are part of the public safety story and the first thing a careful participant should read.
3. **Open creates a venue-owned root and workload copy.** The workload receives the source, site, and policy under its own app id.
   It accepts no creator-driven interactive deploy after Open; governed builds are the only update lane.
   Your original creator app remains your disconnected sandbox, and editing it no longer changes the public workload.
4. **The canonical venue page is stable.** `/a/<rootAppId>` exists when Open completes and remains the same page before and after Commence.
   People can inspect and participate in the public app while it is `awaiting_commence`.
5. **Commence is a later, explicit boundary.** It claims the requested oApps slug, writes the venue listing, creates the token sale, and starts the Gauntlet.
   It does not clone or publish the app again.
   The fee model is fixed as part of that token launch (the venue policy's `CCA_*` constants and `ccaEngine.launchWaterfall` are the authority). The sale is a 24h continuous clearing auction of 65% of supply: each bid pays 3% admission plus the launch's gauntlet fee (0.9% by default), win or lose, and escrows the rest. The gauntlet fee is the one rate that can differ per launch: the operator may waive it to 0% while the sale still has zero demand, which zeroes the per-bid fee (the gauntlet then runs on fuel top-ups, and a failed sale refunds 100%). The waiver is one-way and steward-only - a creator cannot set it, and it is never raised. At settlement the raise pays out of escrow in a fixed waterfall: 3% creator, 2% OpenApps, 30% locked liquidity, and the remainder to the app reserve; the gauntlet draw and fuel tank legs exist in the waterfall but are set to 0% in the current terms. Pool trading fees are 1% flat; claimed launch-token units split 50% app reserve escrow, 20% founding creator, 20% steward, and the remainder to the venue.

Source sync is load-bearing because completed Open publishes the synchronized tree rather than an unsynchronized checkout.
No synced source means Open cannot complete.
Source rides the deploy; there is no separate register or sync machinery.
Enable it once in `bounded.json`:

```json
{ "sourcePush": true }
```

With that set, every `bounded site deploy` (and `bounded deploy`) also pushes
the project source tree to the app's cloud source repository and prints
`source synced: <sha>`. One-off control: `--with-source` / `--no-source` on
the deploy commands. An oApps-bound app must deploy with source ON, and the
source that ships must be the tree that produced the deployed site.

