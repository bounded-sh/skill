# The oApp lifecycle: Owned, on sale, Open

**What's in here:** how an oApp starts with its own agent, the three modes an app is in, what asking to open requires, what happens during and after the token sale, why every oApp runs on mainnet, and source sync. Part of the **openapps** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## One app and its agent, from the start

An OpenApps app is two Bounded apps that stay together for its whole life: the app people use, and the root app of its agent.
The agent is a Hermes agent with its own computer, and it exists from the moment the app is created on openapps.xyz.
An app starts one of two ways:

- **From scratch:** the owner creates it on openapps.xyz, and the agent builds the first version.
- **From an existing Bounded app:** the owner hands an app they already built (with `bounded init`, `bounded deploy`, and `bounded site deploy`) to a new agent.
  The agent's computer works from a clone of the app's synced source, so the handover is refused with `user_app_source_not_synced` until a deploy with source lands.
  An app that already belongs to an agent is refused with `user_app_already_attached`, and one whose billing is set to another account or pool with `user_app_billing_bound`.
  An app already on Solana mainnet under the owner's own wallet must first transfer its on-chain owner role to OpenApps custody (`user_app_custody_transfer_required`): one transaction the owner's wallet signs, and the app itself stays the owner's.

Opening never copies anything.
The app that goes on sale, and the app its holders later govern, is the same app with the same agent.

## The three modes

Who controls the app is its mode.
The same agent keeps working in every mode.

| Mode | Who controls the app | Who approves a release or a governed action |
|---|---|---|
| Owned | its owner | the owner; a release ships once its clean rebuild passes unless the owner asked to approve releases first |
| On sale | the platform, while the app's token sale runs or settles | nobody; the only release that can ship is a repair the Gauntlet asked for, which the platform approves |
| Open | its token holders | the holders; a release or proposal passes when their review ends with no veto, and a veto puts it to their vote |

On sale and on an Open app there is no owner: no owner's chat, no owner's approval, and no owner's settings.
The agent runs on its own schedule and talks to people in the app's Discussion.

## From Owned to Open

1. **Owned: build with the agent.** The owner directs the agent, the agent builds on previews and requests releases, and each release is the owner's review.
   A release publishes the app to Solana mainnet (see [oApps run on mainnet](#oapps-run-on-mainnet)).
2. **Ask to open.** The owner submits the storefront (name, ticker, description, images), the constitution, the privacy statement, and accepts the terms: see [what asking to open requires](#what-asking-to-open-requires).
   Asking changes nothing about the app: the owner keeps it, can withdraw the request, and can ask again, which replaces the earlier request.
3. **The sale starts.** An OpenApps operator starts the token sale from the request; the owner cannot start it.
   The operator cannot start it either while a release is still publishing, after the app changed since the request, or after the agent's AI settings changed: the owner asks again, and the new request is reviewed against the app as it is then.
   From the start of the sale the platform holds the app: it has no owner, and nobody but its agent can change it (owner and collaborator changes are refused with `managed_app_mutation_forbidden`).
   The app keeps the address it already serves, and the sale, its listing, and the constitution appear on openapps.xyz.
4. **During the sale.** The Gauntlet runs 15 checks on what the app serves, and the sale cannot graduate without a pass.
   An attempt starts when the sale starts and again after each release during it, and the agent's periodic check asks for one whenever the app is owed one.
   Its public record is `GET /public/oapps/<rootAppId>/gauntlet/attempts`, newest first (`limit` 1 to 20, default 10; page on with the answer's `nextCursor` as `cursor`).
   Nothing changes on the app except a repair the Gauntlet asked for, which the agent releases and the platform approves.
   No proposal can be filed while the sale runs.
5. **The sale ends.**
   A graduated sale makes the app Open for good: its holders approve its releases and governed actions, and its constitution and the agent's AI settings change only through them.
   A failed or expired sale hands the app back to its owner exactly as it was, and it is Owned again.
   The agent's periodic check settles either ending on its own once the sale has ended.
   An operator can also do both: hand an app back while no sale can still succeed (for a request whose sale never started, that declines it), and make a graduated app's hold permanent.

**An app has one sale.**
A request to open an app that already had a sale is refused with `oapp_opening_sale_exists`, including after a failed sale.

## What asking to open requires

The request is `POST /app/<mainAppId>/oapp-opening` on the developer API, from the owner's own account, and `POST /app/<mainAppId>/oapp-opening/withdraw` withdraws it.
A refusal is `{ ok: false, error: "<code>", message? }`; show `message` when it is present, because it is written for the owner.

| Requirement | Refusal |
|---|---|
| The caller owns the app | `owner_required` |
| The app has its agent attached | `oapp_opening_agent_not_attached` |
| The app is not already on sale or Open | `oapp_opening_already_started` |
| Neither the app nor its agent is being deleted | `oapp_opening_app_being_deleted` |
| The declaration has exactly the shape below | `invalid_oapp_opening_declaration`, `invalid_oapp_opening_slug`, `invalid_oapp_opening_storefront`, `invalid_oapp_opening_constitution`, `invalid_oapp_opening_intent`, `invalid_oapp_opening_terms` |
| The venue's record of the agent is complete, and its treasury names the owner's wallet | `oapp_opening_agent_record_unavailable` |
| The app runs on mainnet under the OpenApps custody key: from the end of its setup when its agent built it, from the agent's first release when it already existed (see [oApps run on mainnet](#oapps-run-on-mainnet)) | `oapp_opening_mainnet_custody_required` |
| The app is public: its page, its site, and its source | `oapp_opening_public_app_required` |
| The split of sale proceeds is final: there is none, or it is sealed | `oapp_opening_proceeds_split_unsealed` |
| The agent is on Automatic with its AI on, because an app with no owner has nobody to start it | `oapp_opening_automatic_required` |
| The request names the slug the app already serves | `oapp_opening_slug_mismatch` (`oapp_opening_slug_missing` before the app has one) |
| The app never had a sale | `oapp_opening_sale_exists` |
| The app serves a site and has synced source | `oapp_app_release_site_missing`, `oapp_app_release_source_not_synced` |
| The served site is reproducible from that source | `oapp_opening_dist_not_reproducible` |
| The app passes the opening safety checks | see [the launch gate](launch-gate.md) |
| The privacy statement is about the source the owner reviewed | `oapp_opening_evidence_changed`: read the source status again and ask again |

An app that publishes while the request reads it is refused with `oapp_opening_app_changing`; ask again once it has settled.

The declaration has exact keys and nothing else: `requestedSlug`, `storefront`, `constitution`, `openingIntent`, and `acceptedTerms`.
The constitution has exactly seven text sections (`preamble`, `purpose`, `objectives`, `tools`, `skills`, `workflow`, `safetyRules`), each non-empty and at most 4000 bytes.
It carries no AI settings: the platform seals the agent's own saved models and limits.
`GET /app/<mainAppId>/oapp-source-status` gives the `headRev` and privacy digest the `openingIntent` names, and `bounded oapp preflight` is the dry run of what the request reads off the app: the safety checks, the synced source, the served site, and its reproducibility ([preflight](preflight.md)).

Once the sale has started, `GET /public/oapps/<rootAppId>/opening` reports it: `phase` is `sale`, `open`, or `returned`, and it answers 404 `oapp_opening_not_found` before that.

## oApps run on mainnet

An oApp's app runs on Solana **mainnet** (`realtime_mainnet`), even when its policy has no onchain collections.
You do not choose this and you do not pass `--protocol`: an app its agent builds from scratch is created on mainnet, an existing off-chain app moves there with the agent's first release request, and every release publishes there.

- **The on-chain owner is an OpenApps custody key**, not your wallet and not the platform admin.
  That is what lets the platform publish the app's policy updates with no person holding the key that owns it.
  An ordinary `--create --protocol realtime_mainnet` app is different: that one is owned by *your* wallet, and its only possible move is the one-time hand-over to OpenApps custody when you give it to an agent (see **bounded-onchain**).
- **Records do not move to mainnet.** When an off-chain app moves, its policy is deployed for mainnet, and anything its `onchain: true` collections held on the simulator stays behind: those collections start empty on mainnet.
- **Previews stay on Poofnet** (simulated money), by design, so prove money paths there.

## Source sync

The agent works from the app's synced source, and so does the request to open: the app must serve a release whose source is synced.
Source rides the deploy; there is no separate register or sync machinery.
`bounded init` turns it on for every new project; an older project enables it once in `bounded.json`:

```json
{ "sourcePush": true }
```

With that set, every `bounded site deploy` (and `bounded deploy`) also pushes the project source tree to the app's cloud source repository and prints `source synced: <sha>`.
One-off control: `--with-source` / `--no-source` on the deploy commands.
An app headed to OpenApps must deploy with source ON, and the source that ships must be the tree that produced the deployed site.
