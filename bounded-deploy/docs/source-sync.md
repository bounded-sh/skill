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
- **`bounded clone` / `bounded pull`** — read the same repo (read-only
  tokens, `code:read` authority).

## Removed legacy surface (do not suggest these)

The remote-edit era CLI surface is gone: `bounded edit`, `bounded dashboard`
(the localhost daemon and its `/apps/:appId/propose|validate|deploy` API), and
the `bounded live-edit` command group (`register`/`validate`/`deploy`, the
`liveEdit.artifacts`/`artifactPush` knobs). A `liveEdit` block in an old
`bounded.json` is ignored with a deprecation notice; `liveEdit.artifactPush:
true` is honored as `sourcePush: true`. Editing happens in your working tree
with your own tools; deploying and source sync are the only cloud writes.
