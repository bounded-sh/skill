# Preflight before you ask to open

**What's in here:** `bounded oapp preflight`, the dry run of what the request to open reads off the app, with the capability ladder for every dependency it names. Part of the **openapps** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## What preflight runs (`bounded oapp preflight`)

An app opens in place: the app that goes on sale is the app as it is deployed, with its data, so the checks read that app and nothing else.
The request to open runs one safety pass on it and refuses on the first finding.
It also refuses an app with no synced source, an app that serves no site, and a served site that cannot be rebuilt from its source.
`bounded oapp preflight` (`GET /app/<mainAppId>/oapp-preflight`) runs the same reads as a dry run, as the app's owner, and changes nothing:

```
bounded oapp preflight            # READY, or every finding the request to open would be refused on
bounded oapp preflight --json     # the report as one document (exit 1 when it is not READY)
```

It reads the deployed policy, the committed runtime config, the synced source at its head, every served site file, the deployed function code, and the backend manifest.
A deployed function whose code cannot be read at its pin fails the preflight with the refusal the request gives (`oapp_creator_function_artifact_missing`, `oapp_creator_function_artifact_mismatch`).

## What the report says

- **Source:** whether the source is synced and current with the served site, its head revision, and the fix when it is not (`source_not_synced`, `source_stale`).
- **Dist:** whether the served site can be rebuilt from the synced source.
  - `static`: every served file is byte-identical to a text file in the source; only inert assets (images, fonts, audio, video, `.pdf`) are exempt.
  - `built`: the source declares the build that produces the site.
  - `unreproducible` (`dist_not_reproducible`): neither, and the request refuses it with `oapp_opening_dist_not_reproducible`.
  - `none` (`backend_only`): the app serves no site, and the request refuses it with `oapp_app_release_site_missing`.
  - `unknown` (`source_not_synced`): there is no synced source to judge the site against.
- **Grants:** the two `service:` grants every oApp declares in a locked `boundaries.egress` entry, `service:cap` and `service:x402`, and which are missing.
- **Findings:** every safety finding the request refuses on: a synced source that does not carry the policy file its `bounded.json` names (`oapp_creator_policy_missing_from_source`), a declared function secret, a credential-shaped string anywhere in the policy, runtime config, source, served site, function code or backend manifest, a policy with functions or boundaries that is not marked `"oapp": true`, a missing grant, an egress boundary that is missing or not locked, a function egress or sandbox the boundaries do not cover, and a deployed runtime that does not match the policy.
  For each declared secret, it answers the ladder:

- `native` - the runtime already provides it (`ctx.ai`, `ctx.email`, files, auth, ...)
- `live` - a catalog action: `ctx.services.invoke("<slug>", args, { idempotencyKey })`
- `callable` - an x402-priced API, callable now through `X402_FETCH`
- `request` - not on Bounded yet: `bounded services request "<what you need>"`

The report is READY only when no finding is blocking, the source is synced and current with the served site, and the dist is `static` or `built`: then nothing the preflight reads would refuse the request.
The request also checks what the preflight does not read: the caller, the app's network and custody, the Public switch, Automatic, the proceeds split, the slug, one sale per app, and the declaration itself (see [what asking to open requires](lifecycle.md#what-asking-to-open-requires)).
The command exits nonzero when the report is not READY; advisory findings only name a better route, such as a declared host whose provider Bounded already serves natively.
Fix, redeploy with source, and run it again before asking to open.

The rules behind each finding are in [the launch gate](launch-gate.md).
