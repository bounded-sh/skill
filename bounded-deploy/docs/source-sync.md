# Cloud Source Sync - source rides the deploy

Bounded keeps an optional cloud copy of an app's source tree in the "Artifacts" repository.
It powers `bounded clone` / `bounded pull` and the public source page of completed-Open oApps (`/__bounded/source`).
There is no separate register/sync machinery: **a deploy either carries its source or it does not.**
An ordinary `bounded site deploy ./dist` uploads only the built static artifact and does not sync source.

## Enable it

`bounded init` writes it into every new project's `bounded.json`:

```json
{ "sourcePush": true }
```

A project created before that default, or one whose config lacks the field, adds the same line; a project that must not sync sets it to `false`.
With it set, every `bounded deploy` and `bounded site deploy` also pushes
the project tree to the app's cloud source repository and prints:

```text
source synced: <shortsha> (<n> files)
```

One-off control on either deploy command:

```sh
bounded site deploy ./dist --with-source   # push source this once
bounded site deploy ./dist --no-source     # skip it this once
```

The flag beats the config. With no config and no flag, deploys do not push
source. A failed source push after a successful deploy does not fail the deploy: the site and rules are live, but the cloud copy of the source is not this deploy's. The warning says so: an OpenApps agent would work from the last synced snapshot, and an app that has never synced cannot be handed to an agent at all.
Fix the cause it names and deploy again (`--with-source` forces one sync).

## Canonical sites also establish the widget editing base

For a canonical frontend deploy, enabling source with `--with-source` or
`"sourcePush": true` also prepares the exact base that the hosted widget will
edit. Before uploading the site, the CLI packages the secret-safe filtered
project source together with the exact frontend files about to be deployed. It
rejects the deploy before upload if that archive exceeds any Build-base limit:

- 24 MiB compressed
- 96 MiB unpacked
- 8,000 archive entries
- 400 bytes per archive path

After the site upload, Router compares the local frontend's path, size, and
content digest set with the authoritative canonical deployment. Build then
verifies the actual `dist/**` bytes inside the archive before importing it. The
CLI accepts only a receipt for that exact app, canonical deployment, archive,
and frontend digest, then prints `widget editing base ready: ...`.

The source-repository push and this editing-base receipt are independent:

- `source synced: ...` proves that the filtered tree reached the cloud Git
  repository. A source-sync failure remains a warning.
- `widget editing base ready: ...` proves that the hosted widget has an exact
  base for the canonical site. If the site landed but this receipt was not
  established, the command exits nonzero and prints safe recovery guidance; it
  does not roll back the landed site.

Use the printed command as-is. A retry for the same canonical deployment is
pinned to its deploy id and the original frontend directory:

```sh
bounded site seed-build-base --app-id <id> --deploy-id <deploy-id> -- ./dist
```

`seed-build-base [dir]` defaults to `./dist`. It rebuilds the filtered-source
archive locally and succeeds only when that directory's frontend bytes match
the current canonical deployment. If a newer canonical deployment won the
race, redeploy those exact frontend files with `site deploy --with-source`
instead of seeding an obsolete deployment. A retired target is terminal until
it is restored, so the CLI does not print an unsafe retry for that case.

A source-only change is not a conflict: re-running the deploy (or the seed)
with byte-identical frontend bytes and changed project source refreshes the
editing base to the new source snapshot for the same canonical deployment.
The one base a CLI seed never replaces is one already carrying hosted-widget
edits (promoted lineage) - the CLI reports that distinctly, and deploying
changed frontend bytes as a new canonical deployment is what re-anchors
editing to your files.

Frontend variants are previews. `site deploy --variant ... --with-source` may
sync source, but it does not replace or re-establish the canonical widget
editing base.

## Held OpenApps deployments

An Owned OpenApps app can hold publication for its owner's approval.
A collaborator who otherwise has deploy authority then receives HTTP 409 `publication_hold_candidate_required`, with a capture URL bound to that app's agent root.
On `bounded deploy` or `bounded site deploy`, enable source with `--with-source` or `"sourcePush": true` so the CLI can capture the candidate.
`--no-source` cannot submit a held candidate.

The CLI sends the filtered UTF-8 source snapshot and its exact Git base commit to the configured developer API.
Its `bounded.json` must name this app and its declared build output is excluded, along with dependency folders and credential files.
For a policy deploy, the policy must be the file named by `bounded.json` and match the source snapshot; save temporary policy overlays into that file before submitting a held candidate.
The server selects the contributor branch, builds the source, serves the review preview and files the owner's decision.
It refuses a stale base instead of replacing newer work: pull the app's current source and deploy again.

The CLI prints:

```text
Held for owner's approval: <decision link>
```

It exits successfully with `held: true` and `decisionUrl` in JSON mode.
This means a review candidate was filed; the live site and policy were not deployed and no follow-up source sync runs.
A collaborator capture is built by the host and labelled **Not tested by the platform**, because it has no agent run for platform QA.
While the host builds, the CLI polls the same captured snapshot and operation id.
An interrupted or uncertain capture can be retried with the same checkout and deploy command; the local operation journal preserves its identity.
Do not treat a refusal or a pending build as a deployed release.

Canonical `bounded site rollback`, `bounded site pin`, and `bounded site promote` can also require owner approval.
For a retained OpenApps release, the CLI submits its verified candidate identity and exact current base commit to the separate republish endpoint.
It uploads no checkout files and executes no build: the host creates a review preview from the retained deposits.
Legacy deployment ids without a verified `hc_` candidate identity cannot use this path.
Asset edits and editing-base replacement are refused while publication is held; those refusals do not produce a candidate or a deployment.

## The data model

- The cloud source repo is a git repository; direct source sync advances `main`, and held OpenApps captures use a server-selected contributor branch.
- Some deploys carry source, some don't — both are honest states. The repo's
  history is the ledger of which trees were synced and when.
- Authority: pushing source is part of DEPLOY authority. Whoever may
  `bounded site deploy` an app may sync the source that produced it. Tokens
  are short-lived, minted per invocation, and never logged.

## What requires synced source

- **Handing an existing app to its OpenApps agent** (Launch, "Use an existing app"). The agent's computer works from a clone of the synced source, so the venue refuses the handover with `user_app_source_not_synced` until a deploy with source lands, and a run on an app whose source is missing ends with `hermes_source_not_synced`.
- **Asking to open an oApp.** The request to open reads the release the app serves, including its synced source revision, and is refused without one (`oapp_app_release_source_not_synced`).
  An OpenApps app exposes the source of its promoted release whenever the app is public, and every app that opens is public.
- **`bounded clone` / `bounded pull`** - read the same repo (read-only
  tokens, `code:read` authority). Browser login is the default identity, and a
  cloned checkout keeps `account.keySource: web`; `--link` exists only for an
  explicitly selected wallet key.

## Removed legacy surface (do not suggest these)

The remote-edit era CLI surface is gone: `bounded dev`, `bounded dashboard`, the
localhost dashboard daemon and its `/apps/:appId/propose|validate|deploy` API,
and the `bounded live-edit` command group (`register`/`validate`/`deploy`, the
`liveEdit.artifacts`/`artifactPush` knobs). `bounded edit "<prompt>"` is the live
prompt-build command. A `liveEdit` block in an old `bounded.json` is ignored with a
deprecation notice; `liveEdit.artifactPush: true` is honored as `sourcePush:
true`. Editing happens in your working tree with your own tools; deploying and
source sync are the only cloud writes.
