# The oApp lifecycle: Owned, on sale, publicly owned

**What's in here:** how an oApp starts with its own agent, how its live app and previews get different values, the three modes an app is in, what requesting its Autonomous Public Offering (APO) requires, what happens during and after the token sale, why every oApp runs on mainnet, and source sync. Part of the **openapps** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## One app and its agent, from the start

An OpenApps app is two Bounded apps that stay together for its whole life: the app people use, and the root app of its agent.
The agent is a Hermes agent with its own computer, and it exists from the moment the app is created on openapps.xyz.
An app starts one of two ways:

- **From scratch:** the creator creates it on openapps.xyz, and the agent builds the first version.
- **From an existing Bounded app:** the creator hands an app they already built (with `bounded init`, `bounded deploy`, and `bounded site deploy`) to a new agent.
  The agent's computer works from a clone of the app's synced source, so the handover is refused with `user_app_source_not_synced` until a deploy with source lands.
  An app that already belongs to an agent is refused with `user_app_already_attached`, and one whose billing is set to another account or pool with `user_app_billing_bound`.
  An app already on Solana mainnet under the owner's own wallet must first transfer its on-chain owner role to OpenApps custody (`user_app_custody_transfer_required`): one transaction the owner's wallet signs, and the app itself stays the owner's.

An APO never copies anything.
The app that goes on sale, and the app its holders later govern, is the same app with the same agent.

## Live values and preview values

The agent tests a change on a preview: a separate app on the test network, with its own app id, data and address.
Values that differ between the live app and its previews belong in two places:

- **Keys** go in secrets. The live app reads the value set with `bounded secret put NAME`, and every preview reads the test value set with `bounded secret put NAME --preview`; a preview never receives the live value.
- **Everything else** that differs (a network name, an RPC host, addresses, caps, a schedule's cadence) goes in policy `constants` with an [`environments` block](../../bounded-deploy/docs/environments.md). The base `constants` hold the test values, and the entry whose `appId` is the live app holds the live ones.

A release applies the entry whose `appId` is the live app: its constants, its schedule cadence, and the functions scoped to it.
A preview matches no entry, so it gets the base constants and none of the functions scoped to an entry.
Functions read the resolved values as `ctx.constants`.

## The three modes

Who controls the app is its mode.
The same agent keeps working in every mode.

| Mode | Who controls the app | Who approves a release or a governed action |
|---|---|---|
| Owned | its creator | the creator; a release ships once its clean rebuild passes unless the creator asked to approve releases first |
| On sale | the platform, while the app's token sale runs or settles | nobody; the only release that can ship is a repair the Gauntlet asked for, which the platform approves |
| Publicly owned | its token holders | the holders; a release or proposal passes when their review ends with no veto, and a veto puts it to their vote |

The app's own agent acting in the app is not a governed action: wherever a rule admits its wallet it acts with no review, in every mode but on sale ([the app's agent in your app](app-agent.md)).
One exception holds in Owned and publicly owned apps alike: a swap of SOL or the app token into the venue's USDC, or a perp margin, that fits the agent's daily limit is approved by the venue on the spot, with no review and no vote ([the agent's daily limit](launch-economics.md#the-agents-daily-limit)).

On sale and on a publicly owned app there is no owner: no creator's chat, no creator's approval, and no creator's settings.
The agent runs on its own schedule and talks to people in the app's Discussion.

## From Owned to publicly owned

1. **Owned: build locally or with the agent.** An external coding agent acting for the creator can use [direct frontend publishing](../../bounded-deploy/docs/quickstart.md#publish-an-owned-openapps-frontend-from-local-source) without an app-agent run, subject to the platform's checks.
   When the creator directs the app's own agent, it builds on previews and requests releases through the creator's review.
   The creator can instead let the agent decide what to build ("The AI decides", which needs Automatic mode): the creator's posts then count like anyone's in Discussion, and the creator and co-creators still approve or veto each release.
   A release publishes the app to Solana mainnet (see [oApps run on mainnet](#oapps-run-on-mainnet)).
2. **Request the APO.** The creator submits the storefront (name, ticker, description, images), the constitution, and accepts the terms: see [what requesting an APO requires](#what-requesting-an-apo-requires).
   The platform checks the saved declaration and holds the app as soon as the request succeeds.
3. **An admin starts the sale.** An OpenApps admin reviews the request and can start the sale or return the held app to its founder.
   Ordinary external production releases pause while the app is held.
   Existing backings are converted to auction orders before the opening countdown begins.
   If a conversion fails, the sale stays in preparation and accepts no public orders; an admin must retry or return the app.
   The platform continues to hold the app: it has no owner, and nobody but its agent can change it (owner and collaborator changes are refused with `managed_app_mutation_forbidden`).
   The app keeps the address it already serves, and the sale, its listing, and the constitution appear on openapps.xyz.
4. **During the sale.** The Gauntlet runs 15 checks on what the app serves; graduation requires a pass or an explicit admin waiver for this sale.
   An attempt starts when the sale starts and again after each release during it, and the agent's periodic check asks for one whenever the app is owed one.
   Its public record is `GET /public/oapps/<rootAppId>/gauntlet/attempts`, newest first (`limit` 1 to 20, default 10; page on with the answer's `nextCursor` as `cursor`).
   The bidding deadline and the Gauntlet deadline are separate: the current bidding window is 24 hours, followed by up to 48 hours for the remaining launch requirements.
   Read the sale's actual opening, closing, and grace timestamps; the venue can configure the bidding duration and opening countdown.
   A waiver only skips the Gauntlet requirement; it does not bypass the minimum raise or create a pool before bidding closes.
   Nothing changes on the app except a repair the Gauntlet asked for, which the agent releases and the platform approves.
   No proposal can be filed while the sale runs.
5. **The sale ends.**
   A graduated sale makes the app publicly owned for good: its holders approve its releases and governed actions, and its constitution, the agent's AI settings and the agent's daily limit change only through them.
   A failed or expired sale hands the app back to its owner exactly as it was, and it is Owned again.
   The platform advances settlement automatically, including token creation, pool creation, and the creator and venue payouts, even when nobody has the page open.
   A launch recovery control resumes outstanding steps; it never reopens bidding or creates a second pool.
   An operator can also do both: hand an app back while no sale can still succeed (for a request whose sale never started, that declines it), and make a graduated app's hold permanent.

**An app has one sale.**
An APO request for an app that already had a sale is refused with `oapp_opening_sale_exists`, including after a failed sale.

## Backing before the sale

New backings are no longer offered; people upvote an Owned app instead.
A backing made before that is escrowed USDC with one of four maximum market caps ($25K, $50K, $100K or $250K, rounded to the sale's price grid), not a purchase of an already launched token.
It cannot be edited, and it stays withdrawable in full until the sale starts.
A sale's saved `ccapledgeterms/<rootAppId>.backerInterval` says whether it reserves a backer-only first interval: the time the sale's schedule takes to release its first 1/24.
When the schedule runs evenly to the close, that is 1/24 of the bidding window, one hour of a 24-hour sale.
A sale that sells a final batch together at the close spreads only the rest across the window, so its interval runs longer: about 1.4 hours of a 24-hour sale whose final batch is 30% of the sale.
When disabled before Start by OpenApps, public funding opens at the scheduled start; the agent cannot change this term.
When enabled, only the converted backing orders participate during it; ordinary orders become available after that interval clears, while a converted backing may already change its maximum.
The countdown before bidding and this first bidding interval are separate.

## What requesting an APO requires

The request is `POST /app/<mainAppId>/oapp-opening` on the developer API, from the owner's own account, after the app has its agent.
A refusal is `{ ok: false, error: "<code>", message? }`; show `message` when it is present, because it is written for the creator.

| Requirement | Refusal |
|---|---|
| The caller owns the app | `owner_required` |
| The app has its agent attached | `oapp_opening_agent_not_attached` |
| The app is not already on sale or publicly owned | `oapp_opening_already_started` |
| Neither the app nor its agent is being deleted | `oapp_opening_app_being_deleted` |
| The declaration has exactly the shape below | `invalid_oapp_opening_declaration`, `invalid_oapp_opening_slug`, `invalid_oapp_opening_storefront`, `invalid_oapp_opening_constitution`, `invalid_oapp_opening_intent`, `invalid_oapp_opening_terms` |
| The venue's record of the agent is complete, and its treasury names the creator's wallet | `oapp_opening_agent_record_unavailable` |
| The app runs on mainnet under the OpenApps custody key: from the end of its setup when its agent built it, from the agent's first release when it already existed (see [oApps run on mainnet](#oapps-run-on-mainnet)) | `oapp_opening_mainnet_custody_required` |
| The app is public: its page, its site, and its source | `oapp_opening_public_app_required` |
| The split of sale proceeds is final: there is none, or it is sealed | `oapp_opening_proceeds_split_unsealed` |
| The app never had a sale | `oapp_opening_sale_exists` |
| The app has synced source | `oapp_app_release_source_not_synced` |
| The app passes the APO safety checks | see [the launch gate](launch-gate.md) |

An app that publishes while the request reads it is refused with `oapp_opening_app_changing`; ask again once it has settled.

The founder submits `storefront`, `constitution`, `acceptedTerms`, and optionally `economicModel`.
The constitution has seven text sections (`preamble`, `purpose`, `objectives`, `tools`, `skills`, `workflow`, `safetyRules`), each up to 4000 bytes, including empty sections.
The platform reads the current managed source, privacy evidence, models and spending limits.
The request runs no agent and requires no redeployment of the original external site.

Once the sale has started, `GET /public/oapps/<rootAppId>/opening` reports it: `phase` is `sale`, `open`, or `returned`, and it answers 404 `oapp_opening_not_found` before that.

## oApps run on mainnet

An oApp's app runs on Solana **mainnet** (`realtime_mainnet`), even when its policy has no onchain collections.
You do not choose this and you do not pass `--protocol`: an app its agent builds from scratch is created on mainnet, an existing off-chain app moves there with the agent's first release request, and every release publishes there.

- **The on-chain owner is an OpenApps custody key**, not your wallet and not the platform admin.
  That is what lets the platform publish the app's policy updates with no person holding the key that owns it.
  An ordinary `--create --protocol realtime_mainnet` app is different: that one is owned by *your* wallet, and its only possible move is the one-time hand-over to OpenApps custody when you give it to an agent (see **bounded-onchain**).
- **Records do not move to mainnet.** When an off-chain app moves, its policy is deployed for mainnet, and anything its `onchain: true` collections held on the simulator stays behind: those collections start empty on mainnet.
- **Previews stay on Poofnet** (simulated money), by design, so prove money paths there.

The venue's sale network is separate from the app's workload network.
A test venue may run its auction, token and pool on Solana Devnet while the app itself still follows the mainnet release rules above.
Use that venue's Devnet USDC and explorer links; a Devnet balance cannot pay for real operating credits.

## Source sync

The agent works from the app's synced source, and so does the APO request: the app must serve a release whose source is synced.
Source rides the deploy; there is no separate register or sync machinery.
`bounded init` turns it on for every new project; an older project enables it once in `bounded.json`:

```json
{ "sourcePush": true }
```

With that set, every `bounded site deploy` (and `bounded deploy`) also pushes the project source tree to the app's cloud source repository and prints `source synced: <sha>`.
One-off control: `--with-source` / `--no-source` on the deploy commands.
An app headed to OpenApps must deploy with source ON, so the agent can release future changes from the managed source.
