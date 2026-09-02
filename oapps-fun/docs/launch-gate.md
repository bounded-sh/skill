# The launch gate: boundaries, reproducible dist, and the freeze

**What's in here:** what `publish-oapp` refuses and why: the required `boundaries` rows, the two app shapes and the reproducible-dist rule, the `gov-frozen` freeze that covers `openApps` only, and the current state of community code contributions. Part of the **oapps-fun** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## The launch gate

**Boundaries come first, not last.** Write `policy.json` boundaries early,
while you build, not as a launch chore. They are the single most important
trust artifact reviewers and buyers will read alongside your source. An app
whose money and state rules are proven invariants graduates cleanly. An app
with ad-hoc checks in function code reads as a rug risk.

The launch gate (`publish-oapp`) REFUSES an app that does not satisfy ALL of the
following, so these are requirements and not advice.

| What | Required value | Refusal if wrong |
|---|---|---|
| `boundaries` | present at all | `no_boundaries` |
| `boundaries.posture` | `"closed"` - nothing changes except what you open | `posture_not_closed` |
| `boundaries.binding` | `"all"` - applies to everyone including you | `binding_not_all` |
| `boundaries.egress` | declared (an empty `allow` IS a declaration) | `egress_missing` |
| capability grants | `service:cap` and `service:x402` in an egress `allow` list, so the opened workload can call live catalog actions and pay x402-priced APIs through the relay; `bounded oapp preflight` names them when missing | `oapp_opening_capability_grants_missing` |
| `boundaries.policy` | a `"mode": "locked"` freeze covering `openApps` (NOT over `boundaries` - see below) | `policy_freeze_missing_openapps` |
| `openApps.activity` | `"public"` - every prompt and change on the record | `activity_not_public` |
| a deployed policy | the app must have one to launch | `no_deployed_policy` |
| accepted terms | current version, accepted | `terms_not_accepted`, `terms_version_unsupported` |

Do NOT choose `boundaries.amend` or add a freeze over the `boundaries` section on
your creator app.
Neither is a launch requirement, and both are DERIVED by the platform on the
launched clone: graduation sets `amend: "none"` and seals `boundaries` there
(`lockGraduatedPolicy`), replacing any freeze you tried to pre-declare.
Sealing `boundaries` on your own creator app is what used to wedge a launch (see
the next section), so leave it to the platform.

Launching is ONE-WAY. A second `publish-oapp` on an app that already launched
answers `409 already_launched` and carries the launched app's id as `appId` -
that id is the venue-owned clone, which is the thing your users are using. It is
never an error to retry a launch you are unsure landed: the ritual is idempotent
and converges on the same clone.

`boundaries.egress` is REQUIRED, not optional. On the functions lane the egress
gateway is always constructed and fails closed if it cannot be built, but the host
allow-list only BINDS when the app declared one - without a declaration,
destinations are unrestricted. For an ordinary Bounded app that default is right:
you should not have to enumerate every host to ship. For an oApp it is wrong,
because the entire promise is that the app can only do what it publicly declared,
and an undeclared egress surface is the one hole through which a governed build
could later reach anywhere. An empty `allow` array is a real declaration and the
honest one for an app that talks to nothing.


## What shape the app can take, and what visitors get

oApps are framework-independent: Open does not require Vite, React, a `package.json`, or any particular layout.
What it requires is honesty between three artifacts: the synced source, the deployed frontend (if any), and the policy.
There are two shapes, and both are first-class openings.
They differ in what a visitor sees first at `https://<workloadAppId>.bounded.page` and, after Commence, at `openapps.xyz/a/<slug>`:

**An app with a web frontend.** Deploy the exact static files users should see with `bounded site deploy dist --with-source`.
The platform serves those bytes as-is forever, and governed edits keep the human source and the deployed `dist/` in sync.
For anything beyond hand-written HTML, build with a real bundler.
**Vite is the recommended default**, and a real bundler is effectively required when the frontend uses `@bounded-sh/client` because CDN imports break it at runtime; see **bounded-frontend**.
Plain static HTML with no JavaScript is equally valid: what you deploy is what visitors use.

**An app with no web frontend** can be a CLI, an agent, or a pure backend.
It is still a real oApp: the backend runs and the boundaries hold.
Its home page becomes the public repo view.
Visitors landing on the direct workload app-id host, or the oApps slug after Commence, see the app's source browser with files, history, `Download .zip`, and `bounded clone`, plus a link to the `/a/<rootAppId>` venue page for history, reports, and governance.
They read and take the project rather than using it in the browser.
Say this plainly before Open so nobody expects a web app to appear.

Either way, the synced source must be the real, complete project.
If the deployed frontend is compiled output, the source that compiles into it rides along in the same tree.
Never add a framework, a bundler, or an unused `init()` call merely to change shape because Open does not ask for them.

**The dist must be reproducible.** A deployed frontend classifies at Open,
and an unclassifiable one refuses (`dist_not_reproducible`):

- **static** — every file you deploy is byte-identical to a file in your source
  tree. Only inert assets (images, fonts, media) are exempt from the match;
  anything served as code or markup — `.js`, `.html`, `.css`, `.svg`, `.wasm` —
  must be in your source verbatim, whatever its encoding. Hand-written pages
  deployed as-is land here automatically.
- **built** — your source declares how the frontend is produced: a `"build"`
  object in `bounded.json` (`{"command": "npm run build", "output": "dist"}`)
  or a `package.json` `build` script. **Open builds your source itself in an
  isolated network-less sandbox and serves THAT output from the governed
  workload.** The bytes you uploaded are not what the public workload gets -
  your own source is. Your build must succeed and produce
  `<output>/index.html`.
  This is deliberate: if the launched site were your upload while only your
  source was checked, the two could say different things, which is exactly the
  hole the standard exists to close. Your creator development address keeps
  serving your uploads as always; only the opened workload is rebuilt.
- A dist that matches nothing in source and has no working declared build is
  dead weight the community could never maintain, so it cannot Open. Fix it
  by declaring a real build, or by deploying your source files directly.

Because the rehearsal sandbox has no network, a build that fetches things at
build time (remote configs, API calls in build scripts) will fail there —
vendor those inputs into the tree instead.

What the ritual still refuses:

| What | Required | Refusal |
|---|---|---|
| synced source | `--with-source` / `sourcePush: true` | `source_not_synced` |
| every app-id literal names THIS app | yes (repeats of your own id are fine) | `app_id_literal_foreign` |
| text-only tree (binaries cannot ride the source lane) | yes | `source_not_text` |
| if the source `init()`s the Bounded client, the DEPLOYED site embeds that literal id | yes — rebuild + redeploy if stale | `clone_app_id_not_rewritten` |
| a recorded site deployment must actually be found at Open | platform-checked | `clone_site_missing_expected` |
| no `onchain: true` collection in the deployed policy | see "oApps are mainnet apps" in [lifecycle.md](lifecycle.md#oapps-are-mainnet-apps) | `oapp_opening_onchain_policy_unsupported` |

The refusal body carries the specific `rejections`, so read them rather than
guessing.

## The `gov-frozen` freeze covers `openApps` only - never `boundaries`

The launch preset writes a single `mode: "locked"` freeze (`gov-frozen`) over
`openApps` - the token and prompt settings - and nothing else.
It deliberately does NOT freeze the `boundaries` section on your creator app,
because a freeze over `boundaries` would lock its own escape hatch: if any later
step of the ritual failed, you could no longer edit `boundaries` to fix it and
the app would be permanently unlaunchable.

The permanence you want lands on the launched CLONE, not on you.
When graduation runs, the platform seals `boundaries` and sets `amend: "none"`
on the venue-owned clone (`lockGraduatedPolicy`), and replaces any governance
lock you tried to pre-declare with the canonical one.
So the rules become genuinely unchangeable on the public app, while your creator
app's `boundaries` stay editable.

That is why a refused or partly-completed launch is always recoverable: read the
`rejections` the gate returned, fix the named row in your creator app's policy,
re-deploy, and launch again.
Launch is idempotent and converges on the same clone, so retrying a launch you
are unsure landed is never an error.
Do not add a `boundaries` freeze or an `amend` choice to "help" - it is not
required and only reintroduces the self-sealing wedge.

A related trap if you script it: read the app's current policy from
`/app/:id/details` (`GET /app/:id` is not a route and 404s), and remember a
Bounded policy is FLAT - collections are top-level keys, there is no
`collections` wrapper.
Swallowing that 404 and merging onto `null` replaces the app's whole policy with
the preset alone.

A caution worth internalizing: an AI-generated app does NOT produce a boundaries
block unless the build prompt asks for one. If you are commissioning an app that
is meant to launch, put the four fields above plus the egress allow-list in the
prompt, or the app will build cleanly and then be refused at the gate.


## Community code contributions while exact patches are closed

Do not tell a contributor that `bounded propose` submitted code or created a voteable proposal.
The venue cannot yet carry the exact reviewed diff through approval, build application, and promotion, so code-patch submission remains fail-closed.

The only supported code-draft mode is local inspection:

```bash
bounded propose --title "Show the streak counter" --slug <oapp-slug> --dry-run
```

That command reads the local Git tree, prints the exact diff and deterministic `draftHash`, and never opens a venue session or writes a proposal.
The hash is local comparison evidence, not an onchain content commitment or proposal id.
Use the oApp's Ideas tab to submit the intended outcome as a normal idea holders can vote on today.
`bounded proposals <slug>` is only the read-only viewer for proposal history and backlog.
