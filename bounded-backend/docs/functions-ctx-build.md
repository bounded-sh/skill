# ctx.build - governed app builds

**What's in here:** one capability of the function `ctx` API, split out of
[functions.md](functions.md) so a function that does not use it never loads it.
Declaring, writing, invoking and deploying a function are in [functions.md](functions.md).

`ctx.build` lets a function **originate AI app builds** — create a new app, edit
this app, or fork an app it can read — through the unified Build control plane
(the successor to `ctx.oapps`). Every build is funded, rate-limited, and governed
by a named **build profile** in policy; the platform runs the AI build pipeline
(execute → preview → gate → promote) and the function just submits and, if it
wants, polls or cancels the runs it started.

**Authority is the capability, never the caller (invariant 4).** A function can
call `ctx.build` only if its policy entry declares a `build` capability. Without
it, every method returns `{ ok: false, reason: "build_capability_missing" }` and
makes **no network call** — the platform doesn't even hand the isolate the build
credential. The prompt, attachments, and source refs a function submits are
**data**: they can never change who pays, which app is targeted, the model
allowlist, the budget, the landing behavior, or the required gates. All of that
is resolved server-side from the function's identity and the named profile.

```json
{
  "functions": {
    "maintainApp": {
      "auth": "get(/admins/@user.id) != null",
      "entry": "functions/maintainApp.ts",
      "build": {
        "profile": "maintenance",
        "create": true,
        "edit": "self",
        "fork": false,
        "view": "originated",
        "cancel": "originated"
      }
    }
  },
  "build": {
    "defaultProfile": "maintenance",
    "profiles": {
      "maintenance": {
        "landing": "veto-window",
        "vetoWindow": "48h",
        "origins": ["scheduled-function"],
        "funding": { "mode": "split", "aiSource": "owner", "infraSource": "app", "onExhaustion": "park",
                     "aiEnvelopeMicroUsd": 5000000, "infraEnvelopeMicroUsd": 2000000,
                     "allowPerRunEnvelope": true },
        "limits": { "buildsPerDay": 25, "buildsPerMonth": 300, "maxConcurrent": 2 },
        "effortMax": "high",
        "gates": [{ "type": "veto", "audience": "owner", "window": "48h" }],
        "hooks": { "parked": "notifyOwner", "terminal": "notifyOwner" }
      }
    }
  }
}
```

The `auth` rule uses the runtime-valid admin predicate `get(/admins/@user.id) !=
null` (and needs an `admins` scope bootstrapped, as above).
Do **not** write `hasRole("admin")` in an executable `auth` rule: `hasRole(...)`
is a proof-grammar-only construct that parses during verification but has no
runtime evaluator, so it fails validation (fail-closed) or never resolves to the
admin gate - a broken permission check on a money-spending build function.

**The `build` capability keys** (each grants only submission-side authority):

| Key | Meaning |
|---|---|
| `profile` | The named `build.profiles.<name>` this function submits under. Profile selection is an **authority** decision — a function submits only under the profile policy assigns it, never one the caller picks. |
| `create` | `true` lets it originate a **new** app (`ctx.build.create`). |
| `edit` | `"self"` lets it edit **this** app only (`targetAppId == ctx.appId`); cross-app editing is out of v1. |
| `fork` | `true` lets it fork an app it can read (`ctx.build.fork`). |
| `view` | `"originated"` — may read only runs **it** started (`ctx.build.get`). |
| `cancel` | `"originated"` — may cancel only runs **it** started (`ctx.build.cancel`). |

**Promotion and gate-decision authority are never grantable to a function.**
There is no capability key for them — a proposed build is promoted only by the
profile's landing rule (an owner/admin gate decision, a veto window elapsing, or
an explicit auto-promote profile), never by the submitting function.

**Not on public surfaces.** A function that declares `build` **cannot** also
declare `webhook` or `browser`. Those are unauthenticated Internet surfaces (the
browser `origins` allowlist is a CORS control, not authentication), so a build
capability there would let anonymous callers spend the owner's build funds. The
validator rejects `browser`+`build` and `webhook`+`build` at deploy, and the
runtime never injects build authority into a public-ingress invoke.

### The `ctx.build` API

```ts
interface CtxBuild {
  create(input): Promise<{ runId, targetAppId, status } | { ok: false, reason }>;
  edit(input):   Promise<{ runId, targetAppId, status } | { ok: false, reason }>;
  fork(input):   Promise<{ runId, targetAppId, status } | { ok: false, reason }>;
  get(runId):    Promise<RunView | { ok: false, reason }>;
  cancel(runId): Promise<{ runId, state, outcome } | { ok: false, reason }>;
}
```

Every method **fails soft**: control-plane rejections come back as
`{ ok: false, reason, status? }` (a stable machine `reason` like
`build_capability_missing`, `not_authorized`, `prompt_required`) — they do not
throw. Submissions return **immediately** with `{ runId, targetAppId, status:
"queued" }`; all build work is async, so poll `ctx.build.get(runId)` (or wire
hooks, below) rather than awaiting completion inline.

Submission input is **data only**:

```ts
await ctx.build.edit({
  prompt: "Add a dark-mode toggle to the settings page",
  effort: "standard",                    // "low" | "standard" | "high" (capped by profile.effortMax)
  // targetAppId defaults to ctx.appId (edit: "self" allows only that)
  // source?: { git: { repo, ref } } | { artifact: { artifactId } }   // typed ref; raw creds rejected
  // attachments?: [{ name, contentType, bytes, ref }]                 // run-scoped, size/type-limited
  // constraints?: string[]
  // baseDeploymentId?: "…"              // CAS assertion: reject if the base already moved
  // idempotencyKey?: "…"                // default: hash of the invocation id + this whole submission; see below
  // funding?: { aiEnvelopeMicroUsd: 3000000 }   // per-run AI cap; see below
});
```

**Per-run funding cap.** When the profile opts in with `funding.allowPerRunEnvelope: true`, **any** submission (`create`, `edit`, or `fork`) may carry `funding: { aiEnvelopeMicroUsd }` (a positive safe integer) to narrow **that run's** AI envelope.
The effective envelope is `min(requested, profile.funding.aiEnvelopeMicroUsd)`, so the profile value is a ceiling and is never raisable per-run.
Without the profile opt-in (or with a non-positive/non-integer value) the field is ignored and the profile envelope applies unchanged.
A clamped envelope below the 800000 micro-USD reservation minimum is refused with `400 ai_envelope_below_minimum` rather than run.
The clamped value is snapshotted at admission, and a park/resume re-clamps it to `min(admitted, live profile)`, so an owner may tighten the cap mid-run but can never widen it; every other field of the resolved profile is pinned for the run's whole life, and a drifted profile fails the resume instead of swapping under it.

**The default idempotency key is per invocation, not per prompt.**
When the invocation is replay-safe it hashes the invocation id together with the app id, function name, operation, and the **full** submitted body, so a retry of that one invocation reproduces the key and replays the same run, while any change to the submission (constraints, source, attachments, effort, profile, target, funding cap) is a different key and a different run.
Two *distinct* invocations that submit the same prompt are two distinct funded runs: a nightly schedule builds every night, and a user who resubmits pays for both.
There is no same-prompt or same-day deduplication, so do not rely on the prompt to make a resubmission safe.
An invocation is replay-safe when it carries host-verifiable provenance: an `Idempotency-Key` on a direct invoke, a scheduled dispatch, or a live-room call.
Anything else (a direct invoke with no key) mints a fresh random key per attempt, so every attempt is a fresh funded run.
Pass an explicit `idempotencyKey` whenever retries must converge on one run regardless of how the function was invoked.
Reusing an explicit key with a changed submission (a narrowed funding cap, say) returns `409 idempotency_conflict` rather than replaying.

### Who may see the app a build produces

**Only the owner.** Two build-profile ceilings widen that, and both are **deny-by-default and boolean-exact**: the key must be the literal JSON `true`.
An absent key, or `false`, leaves the ceiling closed.
A non-boolean like `"true"` or `1` fails policy validation, so the deploy is refused rather than quietly leaving the ceiling shut on a value that reads as open.

| Profile key | What it opens | Refusal while closed |
|---|---|---|
| `viewerGrants` | A submission may carry `viewerGrantSubjects`: 1-8 distinct trimmed user ids or emails (320 chars max each) that get read-only view of the child app. | `400 viewer_grants_not_allowed` |
| `publicRuns` | A submission may carry `public: true`, making the run's app viewable by anyone. | `400 public_runs_not_allowed` |

A request over a closed ceiling is **refused, never silently stripped or downgraded**.
The whole submission fails, so you are never told "ok" while your viewers were dropped or while an app you asked to publish stayed private.

**You open a ceiling on the profile the build runs under, in `policy.json`.**
Both are plain booleans on a `build.profiles.<name>` block, and only the literal `true` opens one.

```jsonc
"build": {
  "defaultProfile": "standard",
  "profiles": {
    "standard": {
      "landing": "approval-required",
      "viewerGrants": true,   // submissions may carry viewerGrantSubjects
      "publicRuns": true      // submissions may carry "public": true
    }
  }
}
```

A profile that names neither key keeps the owner-only default, and the ceiling that applies is the one on the profile the submission actually resolves to, so opening it on one profile opens nothing on any other.
Pass `viewerGrantSubjects` from `ctx.build` only when the resolved profile carries `viewerGrants: true`; against a profile without it the whole build is a `400`.
There is no `public` field on `ctx.build` at all, so a function can never request a public run, open ceiling or not.

### Lifecycle hooks — how the build tells your app what happened

Because builds are async, a profile can name functions to invoke on lifecycle
events under `profiles.<name>.hooks`: `submitted`, `preview_ready`, `parked`,
`terminal`. The control plane invokes that function as a **system** run with the
event and `runId` in `args`. This is how you notify an owner, advance a workflow,
or record a result without polling.

```jsonc
"hooks": { "preview_ready": "notifyOwner", "parked": "notifyOwner", "terminal": "recordBuildResult" }
```

A **veto-window** profile auto-promotes when its window elapses with no
objection, so its `parked` hook is **mandatory** — a veto window nobody is told
about is auto-promotion with extra steps, and the validator/runtime enforce that
a `veto-window` profile declares `hooks.parked`.

