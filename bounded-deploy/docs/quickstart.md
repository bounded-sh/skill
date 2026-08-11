# Deploy quickstart

Use this path for a new project and for ordinary releases: you author the policy
and the client, and the CLI proves and ships them.

To have Bounded's build agent write the app from a prompt instead, and to
iterate on it with more prompts, see [Prompt-driven builds](cli-reference.md#prompt-driven-builds---create-edit-builds).

## Initialize

```bash
bounded init
```

If no valid Bounded web session exists, the CLI opens hosted browser login and
returns to the terminal after sign-in. `init` then creates:

- `policy.json`, the governed backend policy
- `bounded.json`, public project configuration safe to commit
- `.gitignore` entries for local Bounded credentials

No separate authentication command is required before `bounded init`.

## Prove and deploy

```bash
bounded verify
bounded deploy --create --name my-app
```

Fix every blocking verify result. The create deploy records the new `appId` in
`bounded.json`. Later policy releases use:

```bash
bounded deploy
```

If the project generates `policy.json`, run its generator before both commands.

## Publish a web frontend

Build a static output directory, then publish it to the same app:

```bash
bounded site deploy ./dist
```

Use the URL in the JSON receipt, or resolve the environment-qualified slug with
`bounded domains list --app-id <id> --env <environment> --json`.

## Confirm the release

```bash
bounded apps inspect --app-id <id> --json
```

For release-critical work, confirm the active policy/runtime publication before
testing. Test one intended user flow and one policy-denied boundary.

## Existing project

Read `bounded.json` first. It identifies the environment, app, policy path, and
developer account source. Do not create a replacement app merely because the
current account lacks access; use `bounded whoami`, `bounded access`, and the
[access playbook](access-playbook.md).
