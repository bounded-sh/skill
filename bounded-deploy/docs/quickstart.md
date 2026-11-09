# Deploy quickstart

Use this path for a new project and for ordinary releases: you author the policy
and the client, and the CLI ships them.

To have Bounded's build agent write the app from a prompt instead, and to
iterate on it with more prompts, see [Prompt-driven builds](cli-reference.md#prompt-driven-builds---create-edit-builds).

## Initialize

```bash
bounded init
```

If no valid Bounded web session exists, the CLI opens hosted browser login and
returns to the terminal after sign-in. `init` then creates:

- `policy.json`, the governed backend policy
- `bounded.json`, public project configuration safe to commit, with `"sourcePush": true` so every deploy also syncs the project source (see [source-sync.md](source-sync.md))
- `.gitignore` entries for local Bounded credentials

No separate authentication command is required before `bounded init`.

## Deploy

```bash
bounded deploy --create --name my-app
```

The deploy validates and compiles the policy and refuses an invalid one before
anything changes; fix what the message names and run it again. Never retry
`bounded deploy --create` on an ambiguous outcome, because it can create another
app; see the incident router in this skill's SKILL.md.

The create deploy records the new `appId` in `bounded.json`. Later policy
releases use:

```bash
bounded deploy
```

If the project generates `policy.json`, run its generator before both commands.

## Publish a web frontend

Build a static output directory, then publish it to the same app:

```bash
bounded site deploy ./dist
```

The CLI packages the directory as one deterministic gzip-tar artifact and uploads it directly or through resumable multipart transport when needed.
It does not sync project source unless `sourcePush` or `--with-source` explicitly requests that separate workflow.

If the upload receipt reports `liveUrlStatus: "not_mapped"` and the app has no mapped slug or active custom domain, claim a unique slug or follow the [custom-domain guide](domains.md).
Keep an existing mapping unchanged.

```bash
bounded domains slug <unique-slug> --app-id <id>
```

Use the nonempty URL in the JSON receipt, or resolve the environment-qualified slug with `bounded domains list --app-id <id> --env <environment> --json`.
Keep the returned hostname exactly; do not invent an app-id URL or change site privacy to obtain one.

## Publish an Owned OpenApps frontend from local source

An external coding agent acting for the creator can publish a tested frontend directly while the app is still Owned and the platform permits the operation.
The app having its own agent does not by itself require an AI run or an AI-credit top-up.
This workflow differs from the app's own agent, which follows its runtime instructions for previews and releases.

Work from the current published source (`bounded clone <app-id> <directory>`, or `bounded pull` in an existing clean clone), review the local diff, and run the app's build and relevant checks.
Confirm the target and identity with `bounded.json`, `bounded whoami`, and `bounded access --app-id <app-id>`.
Then publish the built frontend with its matching source:

```bash
bounded site deploy ./dist --app-id <app-id> --with-source --json
```

Check both `siteLive` and `sourceSync.status` in the receipt, and verify the requested change at its returned live URL.
Source sync keeps the app agent's next checkout based on what was actually published.
This does not start an app-agent run; ordinary hosting and deployment metering still applies.
This is a frontend publication, not a policy or functions deployment.

Owner access alone does not override sale, Open-app, publication, or boundary restrictions.
If the platform refuses the operation, diagnose that refusal and use the permitted release workflow; do not remove guards or change ownership to force a deploy.
In particular, a sale or Open app is platform-held and does not have this creator publishing path.

`bounded propose --submit` posts a code change for the app agent.
Adding `--apply` asks that agent to apply the patch as written, but still uses an agent run and the normal release decision; it does not avoid AI funding requirements.
Repository instructions saying "nobody deploys an OpenApp directly" must distinguish this external creator workflow from the app agent's runtime workflow.

## Develop locally

You do not need to publish to iterate. Run the frontend on a local dev server
against the deployed backend — data calls work from `http://localhost`
immediately. Only hosted login checks origins; register your dev origin once
(owner-run, port-exact, ~30s to take effect):

```bash
bounded domains origins add http://localhost:5173 --app-id <id>
```

Details: [develop on localhost](../../bounded-frontend/docs/building-a-webapp.md#develop-on-localhost).

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

## Multiple app IDs from one project

Use named instances when several app IDs intentionally share policy and frontend build targets:

```json
{
  "$schema": "https://bounded.sh/schemas/bounded.schema.json",
  "defaultInstance": "poofnet",
  "instances": {
    "poofnet": {
      "appId": "existing-app-id",
      "controlPlane": "production",
      "policyTarget": "poofnet",
      "buildTarget": "poofnet"
    },
    "poofnet-empty": {
      "controlPlane": "production",
      "policyTarget": "poofnet",
      "buildTarget": "poofnet"
    }
  },
  "policy": "policy.json"
}
```

Create and deploy only the empty instance, then publish its frontend:

```bash
bounded deploy --create --name poofnet-empty --instance poofnet-empty
bounded site deploy ./dist --instance poofnet-empty
```

The create command writes the new `appId` only into `instances.poofnet-empty`.
Use `--instance <name>` or `BOUNDED_INSTANCE`; `defaultInstance` is used when neither is present.
If several instances exist without a default or explicit selection, the CLI refuses instead of guessing.
