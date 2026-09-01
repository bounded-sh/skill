# Skill harness (maintainer-only, optional)

Measures what the published skill actually does to an agent, so that pruning
or restructuring a page is decided by behaviour, not by reading. Not part of
the required gate; `node scripts/validate.mjs` stays the only pre-push check.

## What it does

For each frozen task under `tasks/`, the runner builds a fresh fixture
directory, installs the skill family into `<fixture>/.claude/skills/` (or
nothing, for the control condition), and drives a headless `claude -p` subject
with the task prompt. It then scores OUTCOMES: does the produced `policy.json`
pass `bounded verify`, does it have the invariant the task demanded, did the
agent retry `verify` unchanged through a transient prover error without
touching `deploy`, is the API key absent from frontend code, and so on. It
never scores whether the subject paraphrased a doc sentence.

Two conditions per task give the **skill lift**: `pass(with) - pass(without)`.
Only tasks with real lift are informative for ablation; a task the model passes
without the skill cannot show that a cut degraded anything.

Two labels compared by `report.mjs` give the ablation verdict: a cut ships when
the candidate holds or raises the pass rate and lowers skill bytes read.

```sh
export SKILL_HARNESS_OUT=/some/scratch/dir           # results are large; keep them out of the repo
node scripts/skill-harness/run.mjs --label baseline --n 3
node scripts/skill-harness/report.mjs $SKILL_HARNESS_OUT/baseline

git worktree add /tmp/skill-main main                # a candidate is any checkout of the family
node scripts/skill-harness/run.mjs --label cut-1 --skill-dir /path/to/candidate --conditions with --n 3
node scripts/skill-harness/report.mjs $SKILL_HARNESS_OUT/baseline $SKILL_HARNESS_OUT/cut-1

node scripts/skill-harness/run.mjs --label baseline --recheck   # re-score stored runs after editing a checker
node scripts/skill-harness/run.mjs --label baseline --void-dirty  # delete void runs; a normal rerun refills them
node scripts/skill-harness/usage.mjs $SKILL_HARNESS_OUT/baseline   # which pages subjects open, how big, and what no task reaches
```

Runs are resumable: an existing `run.json` is skipped, so raising `--n` only
adds runs, and a rate-limit stop (`--stop-at-utilization`) resumes with the same
command. Every run is stamped with the skill-family content hash, a subject
hash (prompt, fixture, shim, budgets - what shapes the SUBJECT; checker edits
are deliberately excluded so a recheck can re-score old runs), model, and CLI
version. Both resume and the summary refuse a mismatched or unstamped record
(`--allow-stale` overrides resume only; summaries always exclude and count
stale records), so pointing a label at a different tree, or editing a prompt,
can never silently reuse old results. `bounded verify`
verdicts are cached per policy content in the run dir and transient prover-busy
responses are retried, so a recheck cannot flip a verdict through prover noise.
The two conditions run behind a hard barrier: every `without` run completes
before the first `with` fixture exists on disk. `node selftest.mjs` pins the
shim gate, escape detector, canary, and checker counterexamples.

## Isolation (Tier A, process-level)

The subject must behave like a real user's agent, not like one that has read
this repo, its tests, or the conversation that designed the task. Each run:

- runs in its own fixture directory outside the repo, with the skill COPIED in
  (`bounded*/`, `oapps-fun/`), never `scripts/`, `.git`, or the root `CLAUDE.md`;
- scrubs every `CLAUDE*` variable so it is not a child of the orchestrating session;
- passes `--setting-sources project --strict-mcp-config --no-session-persistence
  --disallowedTools WebFetch,WebSearch`, verified by `tasks/probe-isolation.json`
  to remove user settings, plugins, and MCP servers from the subject;
- schedules every `without` run before any `with` run and deletes a finished
  run's skill copy, so a no-skill subject that walks up the directory tree finds
  no installed skill anywhere on disk (observed: a subject did exactly that and
  found a sibling run's copy before this rule existed);
- puts a read-only `bounded` shim first on PATH (`lib/shim.mjs`): args[0] must
  literally be `verify`, `plugins`, `whoami`, `version`, or `tests run`; no flag
  may precede the subcommand (a value-taking global flag like `--instance`
  consumes the next token, so a filter-based classifier reads one subcommand
  while the real CLI resolves another - an external review demonstrated exactly
  that bypass, and `selftest.mjs` now pins it). Everything else is refused with
  a neutral error and logged. The shim can fault the first N `verify` calls with
  the documented retryable prover-busy error.

Known limits of Tier A, on purpose so nobody over-trusts a number:

- The `without` condition is the noisy one. A no-skill subject that does not
  recognise Bounded hunts the disk (`find / -iname "*bounded*"`) and, on a
  maintainer machine, finds a user-level skill install or a checkout. Such runs
  are detected, reported as `void`, excluded from every rate, and refilled with
  `--void-dirty` followed by a normal rerun. In the first baseline 15 of 28
  no-skill runs were void; 0 of 28 with-skill runs were.
- A fake HOME does not work: Claude Code's keychain credential is bound to the
  config-dir identity, so plain, minimal-config, and symlinked fake homes all
  report "Not logged in". HOME stays real.

- HOME and the filesystem are the maintainer's. A subject that wanders into
  the checkout, a user-level skill install (which may be a DIFFERENT revision),
  reads the shim, or leaves its fixture through the shell is caught by
  `lib/canary.mjs` + the escape detector in `lib/metrics.mjs`; such a run is
  void: counted, never scored. The isolation probe task sets `allowEscapes`
  because looking around is its job; its output is read by a human, not scored.
- Results default OUTSIDE the repo (os tmpdir): a fixture under the repo tree
  would let the subject inherit the maintainer CLAUDE.md through directory
  ancestry. Set `SKILL_HARNESS_OUT` explicitly for durable result sets.
- Outbound network is not blocked, only detected: a shell network client
  (curl/wget/git clone/...) aimed anywhere but the loopback voids the run, and
  the canary covers strings a quieter path would bring back. A container with
  egress limited to `api.anthropic.com` closes this for real (Tier B, not
  implemented here).
- The fixture path contains the scratch root name.

## Reading the numbers

- Pass rates are per check and all-or-nothing per task; compare per-check
  rates first, they are far less noisy.
- Run the baseline at least twice before trusting a delta: the difference
  between two baselines is the noise floor.
- The harness can prove a cut degraded behaviour. It cannot prove a cut is
  safe, only that it did not regress the tasks present. A section with no
  task looks identical to bloat; the fix is to write the task.
- `verify-passed` is the current CLI's verdict on the produced policy. When a
  doc example itself fails verify on the installed CLI, that is a finding
  about the doc, not the subject.

## Layout

- `run.mjs` runner, `report.mjs` renderer, `usage.mjs` doc-usage report
- `lib/sandbox.mjs` fixture + spawn, `lib/shim.mjs` read-only CLI shim,
  `lib/checkers.mjs` outcome checks, `lib/metrics.mjs` tokens/docs/turns,
  `lib/canary.mjs` contamination scan
- `tasks/*.json` frozen prompts and checks; `fixtures/` starting files
- `reports/` committed evidence: one file per baseline and per comparison
- `results/` is gitignored; publish summaries, not transcripts
