#!/usr/bin/env node
// OPTIONAL maintainer-side end-to-end suite for the example policies. Not part
// of the required pre-push gate (`node scripts/validate.mjs` is, and stays
// self-contained); without the external local platform this suite SKIPS.
//
// For every spec in scripts/policy-e2e/specs/*.json this runner:
//   1. extracts the policy from the example page's "## Policy" fenced block
//      (the page is the single source of truth - no duplicated policy files),
//   2. deploys it as a fresh app on the LOCAL Bounded platform
//      (bounded-monorepo ./dev; boot it with `./dev fresh smoke --yes --profile full --detach`),
//   3. runs `bounded verify`, then the spec's allow/deny/query steps.
//
// Usage:
//   node scripts/policy-e2e/run.mjs               # all specs (SKIPS if no stack)
//   node scripts/policy-e2e/run.mjs escrow ...    # only the named specs
//   node scripts/policy-e2e/run.mjs --require     # missing stack = failure (release use)
//
// Uses the monorepo checkout (BOUNDED_MONOREPO or sibling ../bounded-monorepo)
// with the local stack `ready`. Substitutions available in spec paths/data:
//   RUN_ID              fresh per run (safe in ids: r<digits>)
//   USER_ID / USER_ADDRESS   the local CLI identity (whoami)
//   TIME_NOW_PLUS_<n> / TIME_NOW_MINUS_<n>   unix seconds relative to now
// Step fields: kind: verify|set|get|query; expect: "ok"|"denied" (set),
//   "nonNull"|literal (query); expectField {field, equals} (get);
//   acceptSimUnsupported: true lets an ok-step pass as SKIPPED when the local
//   simulation lacks a model for a foreign program (failure is NOT policy_denied).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const monorepo = process.env.BOUNDED_MONOREPO ?? path.resolve(root, '..', 'bounded-monorepo')
const dev = path.join(monorepo, 'dev')
const specsDir = path.join(root, 'scripts/policy-e2e/specs')

const required = process.argv.includes('--require')
const only = process.argv.slice(2).filter((a) => a !== '--require')
const specFiles = readdirSync(specsDir).filter((f) => f.endsWith('.json'))
  .filter((f) => only.length === 0 || only.includes(f.replace(/\.json$/, '')))

// ---------------------------------------------------------------------------
// Preflight: this suite is an OPTIONAL maintainer gate. It needs the sibling
// bounded-monorepo checkout and its local platform running - dependencies a
// normal contributor of this public repo does not have. Without them the suite
// SKIPS (exit 0) so wrappers that run "all the tests" never break on the
// external dependency; pass --require (used before releasing example changes)
// to turn a missing stack into a hard failure instead. The check also keeps a
// never-booted stack from crawling through the mid-run flap retries below.
function preflightFailure() {
  if (!existsSync(dev)) {
    return `bounded-monorepo checkout not found at ${monorepo} (set BOUNDED_MONOREPO)`
  }
  // `./dev status` exits non-zero for failed/degraded states, so read its
  // output from the error too and surface the actual state line either way.
  let status = ''
  try {
    status = execFileSync(dev, ['status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
  } catch (error) {
    status = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
  }
  if (!/local stack: ready/.test(status)) {
    const state = status.match(/local stack: [^\n]*/)?.[0] ?? 'local stack state unknown'
    return `${state} - boot it with: cd ${monorepo} && ./dev fresh smoke --yes --profile full --detach`
  }
  return null
}

const blocked = preflightFailure()
if (blocked) {
  if (required) {
    console.error(`policy-e2e: REQUIRED but unavailable: ${blocked}`)
    process.exit(1)
  }
  console.log(`policy-e2e: SKIPPED (optional maintainer gate): ${blocked}`)
  process.exit(0)
}

// The CLI caches its keypair session in ~/.bounded/tokens.json with an optimistic
// TTL that can outlive the real JWT expiry; a stale cache surfaces as
// "dev-api 401: Error verifying auth token" on every request. Clearing the cache
// makes the CLI re-mint non-interactively from the keypair credentials, so retry
// exactly once after clearing it.
const STALE_SESSION = /dev-api 401: Error verifying auth token/

function shOnce(args, cwd) {
  try {
    const stdout = execFileSync(dev, ['exec', '--', 'bounded', ...args], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000,
    })
    return { ok: true, output: stdout }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}\n${error.stderr ?? ''}` }
  }
}

// The manager aggregates per-service readiness on every `./dev exec`; the
// bounded-platform wrangler worker's /ready probe can read slow under load, so
// a healthy stack intermittently reports "not ready" for stretches measured in
// minutes while every service is in fact up. The preflight above proved the
// stack was up, so a long retry budget here rides out mid-run flaps; a stack
// that genuinely dies mid-run still fails once the budget is exhausted.
const NOT_READY = /local stack is not ready/
const NOT_READY_RETRIES = 30
const NOT_READY_BACKOFF_MS = 10_000

function sleep(ms) {
  execFileSync(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`])
}

function sh(args, { cwd, allowFailure = false } = {}) {
  let result = shOnce(args, cwd)
  for (let attempt = 0; !result.ok && NOT_READY.test(result.output) && attempt < NOT_READY_RETRIES; attempt += 1) {
    sleep(NOT_READY_BACKOFF_MS)
    result = shOnce(args, cwd)
  }
  if (!result.ok && STALE_SESSION.test(result.output)) {
    rmSync(path.join(homedir(), '.bounded', 'tokens.json'), { force: true })
    result = shOnce(args, cwd)
  }
  if (!result.ok && !allowFailure) throw new Error(`bounded ${args.join(' ')} failed:\n${result.output}`)
  return result
}

function extractPolicy(pagePath) {
  const page = readFileSync(path.join(root, pagePath), 'utf8')
  const match = page.match(/## Policy\n[\s\S]*?```json\n([\s\S]*?)\n```/)
  if (!match) throw new Error(`${pagePath}: no \`\`\`json block under "## Policy"`)
  JSON.parse(match[1])
  return `${match[1]}\n`
}

// Identity for USER_ID / USER_ADDRESS substitutions.
const probe = path.join(tmpdir(), `bounded-e2e-whoami-${process.pid}`)
mkdirSync(probe, { recursive: true })
writeFileSync(path.join(probe, 'bounded.json'), JSON.stringify({
  environment: 'staging', policy: 'policy.json', account: { keySource: 'profile', profile: 'global' },
}))
const whoami = JSON.parse(sh(['whoami', '--json'], { cwd: probe }).output.trim())
const USER = whoami.id
if (!USER) throw new Error('bounded whoami returned no id - is the local stack ready?')

function substitute(value, runId) {
  const now = Math.floor(Date.now() / 1000)
  return String(value)
    .replaceAll('RUN_ID', runId)
    .replaceAll('USER_ADDRESS', USER)
    .replaceAll('USER_ID', USER)
    .replace(/TIME_NOW_PLUS_(\d+)/g, (_, n) => String(now + Number(n)))
    .replace(/TIME_NOW_MINUS_(\d+)/g, (_, n) => String(now - Number(n)))
}

// Deep-walk substitution. A string value that is EXACTLY a relative-time token
// becomes a number (UInt fields reject strings); other strings get the normal
// textual substitutions.
function substituteData(data, runId) {
  const now = Math.floor(Date.now() / 1000)
  const walk = (value) => {
    if (typeof value === 'string') {
      const time = value.match(/^TIME_NOW_(PLUS|MINUS)_(\d+)$/)
      if (time) return time[1] === 'PLUS' ? now + Number(time[2]) : now - Number(time[2])
      return substitute(value, runId)
    }
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
    }
    return value
  }
  return walk(data)
}

// CLI paths never carry a leading slash (that is rule-expression syntax).
function cleanPath(value, runId) {
  return substitute(value, runId).replace(/^\/+/, '')
}

const DENIAL = /\[policy_denied\]|\[invariant_violation\]|403 Policy failed|policy.{0,20}(?:denied|reject)/i

let failures = 0
const report = []

for (const file of specFiles) {
  const spec = JSON.parse(readFileSync(path.join(specsDir, file), 'utf8'))
  const name = spec.name ?? file.replace(/\.json$/, '')
  const runId = `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
  const workspace = path.join(tmpdir(), `bounded-e2e-${name}-${runId}`)
  mkdirSync(workspace, { recursive: true })
  writeFileSync(path.join(workspace, 'policy.json'), extractPolicy(spec.page))
  writeFileSync(path.join(workspace, 'bounded.json'), JSON.stringify({
    environment: 'staging', policy: 'policy.json', account: { keySource: 'profile', profile: 'global' },
  }, null, 2))

  const rows = []
  let appId = null
  try {
    const deploy = JSON.parse(sh(
      ['deploy', 'policy.json', '--create', '--name', `e2e-${name}`.slice(0, 40), '--public', '--json'],
      { cwd: workspace },
    ).output.trim())
    appId = deploy.appId
    if (!deploy.ok || !appId) throw new Error(`deploy receipt not ok: ${JSON.stringify(deploy)}`)
    rows.push(['deploy', 'PASS', appId])
  } catch (error) {
    rows.push(['deploy', 'FAIL', String(error.message).slice(0, 400)])
    failures += 1
    report.push({ name, rows })
    continue
  }

  for (const step of spec.tests ?? []) {
    const label = `${step.kind}${step.path ? ` ${cleanPath(step.path, runId)}` : ''}`
    try {
      if (step.kind === 'verify') {
        const result = sh(['verify', 'policy.json', '--app-id', appId], { cwd: workspace })
        if (!/Proven/i.test(result.output)) throw new Error(`verify did not prove:\n${result.output.slice(0, 400)}`)
        rows.push([label, 'PASS', ''])
      } else if (step.kind === 'set') {
        const data = JSON.stringify(substituteData(step.data, runId))
        const result = sh(
          ['data', 'set', '--app-id', appId, '--path', cleanPath(step.path, runId), '--data', data],
          { cwd: workspace, allowFailure: true },
        )
        if (step.expect === 'ok') {
          if (result.ok) rows.push([label, 'PASS', step.note ?? ''])
          else if (step.acceptSimUnsupported && !DENIAL.test(result.output)) {
            rows.push([label, 'SKIP', `sim lacks a model: ${result.output.trim().slice(0, 160)}`])
          } else throw new Error(`expected ok:\n${result.output.slice(0, 400)}`)
        } else if (step.expect === 'denied') {
          if (!result.ok && DENIAL.test(result.output)) rows.push([label, 'PASS', step.note ?? ''])
          else throw new Error(result.ok ? 'write unexpectedly ACCEPTED' : `failed without a policy denial:\n${result.output.slice(0, 400)}`)
        } else if (step.expect === 'rejected') {
          // Any pre-policy rejection counts (schema/type/path validation, 4xx);
          // an accepted write is the only failure.
          if (!result.ok) rows.push([label, 'PASS', step.note ?? ''])
          else throw new Error('write unexpectedly ACCEPTED')
        } else throw new Error(`unknown expect ${step.expect}`)
      } else if (step.kind === 'get') {
        const result = sh(['data', 'get', '--app-id', appId, '--path', cleanPath(step.path, runId), '--json'], { cwd: workspace })
        const doc = JSON.parse(result.output.trim())
        const value = doc?.[step.expectField.field] ?? doc?.data?.[step.expectField.field] ?? doc?.fields?.[step.expectField.field]
        if (JSON.stringify(value) !== JSON.stringify(substituteData(step.expectField.equals, runId))) {
          throw new Error(`${step.expectField.field}=${JSON.stringify(value)} != ${JSON.stringify(step.expectField.equals)}`)
        }
        rows.push([label, 'PASS', step.note ?? ''])
      } else if (step.kind === 'query') {
        const result = sh(
          ['data', 'query', '--app-id', appId, '--path', cleanPath(step.path, runId), '--name', step.name,
            '--args', JSON.stringify(step.args ?? {}), '--json'],
          { cwd: workspace, allowFailure: true },
        )
        if (!result.ok) {
          if (step.acceptSimUnsupported) { rows.push([label, 'SKIP', result.output.trim().slice(0, 160)]); continue }
          throw new Error(result.output.slice(0, 400))
        }
        const parsed = JSON.parse(result.output.trim())
        const value = parsed?.result ?? parsed
        if (step.expect === 'nonNull' ? value == null : JSON.stringify(value) !== JSON.stringify(step.expect)) {
          throw new Error(`query result ${JSON.stringify(value)} did not match ${JSON.stringify(step.expect)}`)
        }
        rows.push([label, 'PASS', step.note ?? ''])
      } else throw new Error(`unknown step kind ${step.kind}`)
    } catch (error) {
      rows.push([label, 'FAIL', String(error.message).slice(0, 400)])
      failures += 1
    }
  }
  report.push({ name, rows })
}

for (const { name, rows } of report) {
  console.log(`\n=== ${name} ===`)
  for (const [label, status, note] of rows) {
    console.log(`  ${status.padEnd(5)} ${label}${note ? `  - ${note}` : ''}`)
  }
}
const total = report.reduce((n, r) => n + r.rows.length, 0)
console.log(`\n${report.length} specs, ${total} steps, ${failures} failures`)
process.exit(failures ? 1 : 0)
