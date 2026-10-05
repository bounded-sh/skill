# Checklist before asking to open

**What's in here:** the full checklist before the owner asks to open an app. Part of the **openapps** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## Practical checklist before asking to open

- The app has its own agent and runs on mainnet under the OpenApps custody key: from the end of its setup when its agent built it, from the agent's first release when it already existed (`oapp_opening_mainnet_custody_required`).
  An existing app handed to an agent needs synced source first (`user_app_source_not_synced`).
- The person asking is the app's owner; nobody else can ask (`owner_required`).
- The app is public: its page, its site, and its source (`oapp_opening_public_app_required`).
- The split of sale proceeds is final: none, or sealed (`oapp_opening_proceeds_split_unsealed`).
- The agent is on Automatic with its AI on (`oapp_opening_automatic_required`): once the sale starts nobody is left to start it.
- The app never had a sale: an app has one, and a request after a failed sale is refused too (`oapp_opening_sale_exists`).
- Boundaries were written early and cover the app's money and state rules as declared invariants, not ad-hoc checks.
  They are the trust artifact buyers read alongside your source.
- `bounded oapp preflight` is READY on the deployed app; every blocking finding it names is fixed at the source, not worked around.
- The policy is marked `"oapp": true`, and its `boundaries.egress` carries `service:cap` and `service:x402` in a locked entry; the request to open refuses without both (`oapp_opening_capability_grants_missing`).
- Every capability the app needs is native, a live catalog action, or callable through x402; anything else was filed with `bounded services request` and the app was built without it.
- `policy.json` contains **no** rule, function, or egress that depends on a user-held credential, and `bounded deploy` accepts it.
- Functions use `ctx.ai` / `ctx.services` / `ctx.bounded` only, with no fetches to key-authenticated endpoints.
- Every external egress is declared and either credential-free, native, or relay-eligible.
- Source rides the deploy (`sourcePush: true` in `bounded.json`), and the synced tree is the real, complete project, including the policy file its `bounded.json` names.
- The app serves a site (`oapp_app_release_site_missing` otherwise), built from THIS tree and reproducible from it: byte-identical source files, or a build the source declares (`oapp_opening_dist_not_reproducible` otherwise).
  Every `init({ appId })` literal names this app.
- Every script the page runs ships inside the tree: dependencies come from npm and the build bundles them.
  A `<script src="https://…">` or a URL import fails the Gauntlet's dependency audit during the sale (`dependency_remote_script`, `dependency_remote_module_import`), and the app's `script-src 'self'` floor refuses to load it anyway.
- Every worker is a file: `new Worker(new URL("./worker.ts", import.meta.url))`, never `?worker&inline` or a Blob or `data:` worker, which fail the same audit (`dependency_inline_worker`) and cannot start under `worker-src 'self'`.
- The request names the slug the app already serves (`oapp_opening_slug_mismatch`): the app keeps its address when it opens.
- The constitution's seven sections say what the agent works toward and how, because once the app is Open only its holders can change them.
- The owner knows what the sale changes: from the moment an operator starts it, the platform holds the app, nobody but its agent can change it, and only a repair the Gauntlet asked for can ship until the sale ends.
  A graduated sale makes the app Open for good; a failed one hands it back.
- Leave the app as it is while the request waits: a change to the app or to the agent's AI settings means the owner asks again before the sale can start.
- Running costs (AI spend, service calls, relayed calls + surcharge) are sane against the app's expected inflow: out of budget means frozen, and you should be able to say at what usage level that happens.
- **No refresh timers in the frontend.** Collections are live, so poll loops buy nothing and bill the app's own buckets for every open tab, forever.
  An Open app has no owner standing by to tune an interval later, so a `setInterval` that re-reads data is a permanent, unbounded drain.
  Use `useQuery`/`subscribe`; see [never poll a collection](../../bounded-frontend/docs/sdk-reference.md#never-poll-a-collection).
- Anything you had to rule out is in your handoff to the user, with the reasoning, not silently dropped.
