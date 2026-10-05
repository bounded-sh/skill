# The launch gate: oApp mode, boundaries, secrets, and the served site

**What's in here:** the safety checks a request to open runs on the app as it is deployed, the boundaries and grants every oApp declares, the shape an app needs to open and the reproducible-dist rule, what holds once the sale starts, and the current state of community code contributions. Part of the **openapps** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## Boundaries come first

Write `policy.json` boundaries early, while you build, not as an opening chore.
They are the single most important trust artifact reviewers and buyers will read alongside your source.
An app whose money and state rules are declared invariants reads as trustworthy.
An app with ad-hoc checks in function code reads as a rug risk.

## The opening safety checks

An app opens in place, so the request to open reads the app as it is deployed: its policy, its committed runtime config, its synced source, every served site file, its deployed function code, and its backend manifest.
It runs one safety pass (`oapps.opening-safety.v1`) over them and refuses on the first finding.
`bounded oapp preflight` runs the same pass as a dry run and lists every finding ([preflight](preflight.md)).
These are requirements, not advice:

| What | Required | Refusal |
|---|---|---|
| oApp mode | `"oapp": true` at the top of the policy when it declares functions or boundaries; oApp mode refuses function secrets and requires a declared egress boundary | `oapp_opening_egress_not_steward_owned` |
| no secrets | no function declares `secrets`, and no credential-shaped string sits in the policy, the runtime config, the synced source, the served site, the deployed function code, or the backend manifest: every served byte is public once the app opens | `oapp_opening_secret_surface_invalid` |
| `boundaries.egress` | a list of 1 to 64 boundaries with unique ids, each declaring `"mode": "locked"` | `oapp_opening_egress_not_steward_owned` |
| capability grants | `service:cap` and `service:x402` in a locked `boundaries.egress` entry, so the app can call live catalog actions and pay x402-priced APIs through the relay | `oapp_opening_capability_grants_missing` |
| function egress | each function's egress names only entries an app-wide boundary declares and repeats every `service:` entry exactly; no function enables `ctx.sandbox` | `oapp_opening_egress_not_steward_owned` |
| the deployed runtime | the committed runtime config carries this exact policy and allows exactly the hosts the boundaries declare; redeploy the policy when they differ | `oapp_opening_safety_unavailable`, `oapp_opening_egress_not_steward_owned` |
| the policy in source | the synced source carries the policy file its `bounded.json` names (`"policy"`, `bounded/policy.json` when unset) | `oapp_creator_policy_missing_from_source` |

The other conditions of a request to open (the owner asking, an app on mainnet under OpenApps custody, a public app, a final proceeds split, Automatic, one sale) are in [the lifecycle](lifecycle.md#what-asking-to-open-requires).

`boundaries.egress` is REQUIRED, not optional.
On the functions lane the egress gateway is always constructed and fails closed if it cannot be built, but the host allow-list only BINDS when the app declared one: without a declaration, destinations are unrestricted.
For an ordinary Bounded app that default is right: you should not have to enumerate every host to ship.
For an oApp it is wrong, because the entire promise is that the app can only do what it publicly declared.
The smallest honest declaration, for an app that talks to no outside host, is one locked boundary whose allow list carries only the two capability grants (the starter shape).
Grants are not hosts: on an oApp the runtime then fences raw `fetch` and `ctx.browser` to no outside destination.

## What shape the app takes, and what visitors get

oApps are framework-independent: opening does not require Vite, React, a `package.json`, or any particular layout.
What it requires is honesty between three artifacts: the synced source, the deployed frontend, and the policy.

**An app opens with a served site.**
The request to open reads the release the app serves, and an app that serves no site is refused (`oapp_app_release_site_missing`).
Each release the agent ships carries the whole commit, site included, so the source and the site stay together.
For anything beyond hand-written HTML, build with a real bundler.
**Vite is the recommended default**, and a real bundler is effectively required when the frontend uses `@bounded-sh/client` because CDN imports break it at runtime; see **bounded-frontend**.
Plain static HTML with no JavaScript is equally valid: what you deploy is what visitors use.

The synced source must be the real, complete project.
If the deployed frontend is compiled output, the source that compiles into it rides along in the same tree.
Never add a framework, a bundler, or an unused `init()` call merely to change shape, because opening does not ask for them.

**The dist must be reproducible.**
The request to open, `bounded oapp preflight`, and a source-synced `bounded site deploy` classify the served site against the synced source:

- **static**: every file you deploy is byte-identical to a text file in your source tree.
  Only inert assets (images, fonts, audio, video, `.pdf`) are exempt from the match; anything served as code or markup (`.js`, `.html`, `.css`, `.svg`, `.wasm`) must be in your source verbatim, whatever its encoding.
  Hand-written pages deployed as-is land here automatically.
- **built**: your source declares how the frontend is produced: a `"build"` object in `bounded.json` (`{"command": "npm run build", "output": "dist"}`) or a `package.json` `build` script.
  The served bytes then differ from the source files, and the declared build is what reproduces them.
- A dist that matches nothing in source and has no declared build is `dist_not_reproducible`: nobody could rebuild it from the public source, so the request to open refuses it (`oapp_opening_dist_not_reproducible`) and the preflight is not READY.
  Fix it by declaring a real build, or by deploying your source files directly.

The source must also be synced (`--with-source` / `sourcePush: true`), and the preflight is not READY while the synced source is older than the served site (`source_not_synced`, `source_stale`).
Read the codes and messages in the report rather than guessing.

During the sale the Gauntlet checks what the app serves again, including that the served site is reproduced from its published source: by the source files themselves when the site is static, or, when it is built, by running the declared build on a clean checkout and getting the same files byte for byte.
The agent's releases build with that same declaration.

## Once the sale starts

From the start of the sale the app's address serves under a script floor, whatever the source declared.
Every page gets `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, and `worker-src 'self'` in its Content-Security-Policy, even if `boundaries.browser.script` names a CDN.
A script hosted outside the release could be swapped with no release and no vote, so the browser refuses it on every load; a worker built from a Blob or a `data:` URL would run bytes fetched at runtime, so workers must be files too.
Bundle scripts, and ship workers as files:

| What | Required | Gauntlet finding |
|---|---|---|
| every script the page runs ships inside the release: no `<script src="https://…">`, no `import("https://…")`, SRI or not | install it as a dependency and let the build bundle it | `dependency_remote_script`, `dependency_remote_script_pinned`, `dependency_remote_module_import` |
| every worker is a file in the release: no `?worker&inline`, no `new Worker(URL.createObjectURL(…))`, no `blob:`/`data:` worker | `new Worker(new URL("./worker.ts", import.meta.url))`, Vite's default | `dependency_inline_worker` |

The Gauntlet's dependency audit reads the source for both, and either one fails it, so the sale cannot graduate until a repair release removes it.
Fix them before asking to open: neither the request nor the preflight reports them.

From the start of the sale the app's public origins are also pinned to the app itself.
A request from its openapps.xyz address (or its address on a partner venue's domain), or from its own `https://<appId>.bounded.page` host, may only name this app: realtime, its WebSocket handshake, and function invokes answer `403` with `origin_app_mismatch` when the page names any other app id, however that id was produced.
The app's `bounded.page` slug host and its custom domains are not pinned.

The app itself is held by the platform from then on: owner and collaborator changes are refused with `managed_app_mutation_forbidden`, and only the agent's releases change it ([lifecycle](lifecycle.md)).

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
