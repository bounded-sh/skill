# Cloud Source Sync — source rides the deploy

Bounded keeps an optional cloud copy of an app's source tree (the "Artifacts"
repository). It powers `bounded clone` / `bounded pull`, the public source
page of launched oApps (`/__bounded/source`), and the oApps launch integrity
scan. There is no separate register/sync machinery: **a deploy either carries
its source or it does not.**

## Enable it

In `bounded.json`:

```json
{ "sourcePush": true }
```

With that set, every `bounded deploy` and `bounded site deploy` also pushes
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
source. A failed source push after a successful deploy warns loudly but does
not fail the deploy — re-run with `--with-source` once the issue is fixed.

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

Frontend variants are previews. `site deploy --variant ... --with-source` may
sync source, but it does not replace or re-establish the canonical widget
editing base.

## The data model

- The cloud source repo is a git repository; every push is a commit on `main`.
- Some deploys carry source, some don't — both are honest states. The repo's
  history is the ledger of which trees were synced and when.
- Authority: pushing source is part of DEPLOY authority. Whoever may
  `bounded site deploy` an app may sync the source that produced it. Tokens
  are short-lived, minted per invocation, and never logged.

## What requires synced source

- **oApps launches.** The launch integrity scan reads the synced source and
  the public DYOR source page serves it. No synced source → no launch.
- **`bounded clone` / `bounded pull`** - read the same repo (read-only
  tokens, `code:read` authority). Browser login is the default identity, and a
  cloned checkout keeps `account.keySource: web`; `--link` exists only for an
  explicitly selected wallet key.

## Removed legacy surface (do not suggest these)

The remote-edit era CLI surface is gone: `bounded edit`, `bounded dev`, the
localhost dashboard daemon and its `/apps/:appId/propose|validate|deploy` API,
and the `bounded live-edit` command group (`register`/`validate`/`deploy`, the
`liveEdit.artifacts`/`artifactPush` knobs). The current `bounded dashboard`
command is only a hosted-dashboard browser launcher; it does not start a local
daemon. A `liveEdit` block in an old `bounded.json` is ignored with a
deprecation notice; `liveEdit.artifactPush: true` is honored as `sourcePush:
true`. Editing happens in your working tree with your own tools; deploying and
source sync are the only cloud writes.
