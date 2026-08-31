#!/usr/bin/env node
// Skill harness runner. Drives sandboxed subject agents through frozen tasks
// with and without the skill installed, checks OUTCOMES, and writes one
// summary per label so two labels (baseline vs a candidate cut) can be
// compared by report.mjs.
//
//   node scripts/skill-harness/run.mjs --label baseline --n 3
//   node scripts/skill-harness/run.mjs --label cut-1 --skill-dir /path/to/worktree --tasks backend-notes-owner,deploy-environments --conditions with
//
// Flags: --label <name> (required) --n <runs per condition> --conditions with,without
//        --tasks <ids,comma> --phase <name> --skill-dir <repo root> --model sonnet
//        --concurrency 3 --out <dir> --max-turns 60 --max-budget 2.5 --timeout-min 20
//        --dry-run (print resolved prompts and exit) --stop-at-utilization 0.9
//        --recheck (re-run checkers/canary over existing runs from stored events; no subject runs)
//        --void-dirty (delete runs whose canary is not clean so a resume re-runs those slots; no subject runs)
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFixture, runSubject, readShimLog } from './lib/sandbox.mjs'
import { extractMetrics, assistantText, toolUses } from './lib/metrics.mjs'
import { scanCanary } from './lib/canary.mjs'
import { runChecks, score } from './lib/checkers.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const argv = process.argv.slice(2)
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt }
const has = (name) => argv.includes(`--${name}`)

const label = flag('label')
if (!label) { console.error('--label is required'); process.exit(2) }
const N = Number(flag('n', 1))
const conditions = flag('conditions', 'with,without').split(',').filter(Boolean)
const skillDir = path.resolve(flag('skill-dir', repoRoot))
const model = flag('model', 'sonnet')
const concurrency = Number(flag('concurrency', 3))
const outRoot = path.resolve(flag('out', path.join(process.env.SKILL_HARNESS_OUT || path.join(repoRoot, 'scripts', 'skill-harness', 'results'))))
const maxTurns = Number(flag('max-turns', 60))
const maxBudget = Number(flag('max-budget', 2.5))
const timeoutMs = Number(flag('timeout-min', 20)) * 60000
const stopAt = Number(flag('stop-at-utilization', 0.92))
const onlyTasks = flag('tasks') ? new Set(flag('tasks').split(',')) : null
const onlyPhase = flag('phase')
const RECHECK = has('recheck')
const VOID_DIRTY = has('void-dirty')

const tasksDir = path.join(here, 'tasks')
const tasks = readdirSync(tasksDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(tasksDir, f), 'utf8')))
  .filter((t) => (!onlyTasks || onlyTasks.has(t.id)) && (!onlyPhase || t.phase === onlyPhase))
if (!tasks.length) { console.error('no tasks selected'); process.exit(2) }

function loadFixture(t) {
  const files = {}
  for (const [rel, src] of Object.entries(t.fixture || {})) {
    if (typeof src === 'string' && src.startsWith('@fixtures/')) files[rel] = readFileSync(path.join(here, 'fixtures', src.slice('@fixtures/'.length)), 'utf8')
    else files[rel] = src
  }
  return files
}

if (has('dry-run')) {
  for (const t of tasks) console.log(`\n### ${t.id} [${t.phase}]\n${t.prompt}\nfixture: ${Object.keys(t.fixture || {}).join(', ') || '(none)'}\nchecks: ${(t.checks || []).map((c) => c.id || c.kind).join(', ')}`)
  process.exit(0)
}

const labelDir = path.join(outRoot, label)
mkdirSync(labelDir, { recursive: true })
if (VOID_DIRTY) {
  let n = 0
  for (const t of tasks) for (const cond of conditions) for (let i = 0; i < N; i++) {
    const d = path.join(labelDir, 'runs', t.id, cond, String(i)); const p = path.join(d, 'run.json')
    if (!existsSync(p)) continue
    const r = JSON.parse(readFileSync(p, 'utf8'))
    if (!r.canary.clean) { rmSync(d, { recursive: true, force: true }); n++; console.log(`voided ${t.id}/${cond}/${i}: ${r.canary.hits.map((h) => h.pattern).join(',')} ${r.canary.escapes.slice(0, 2).map((e) => e.path).join(',')}`) }
  }
  console.log(`${n} dirty run(s) voided; rerun without --void-dirty to refill`)
  process.exit(0)
}
// Every `without` run is scheduled before any `with` run, and a finished `with` run
// deletes its skill copy: a no-skill subject that walks up the tree must find no
// installed skill anywhere on disk except the real checkout (canary-covered).
const jobs = []
for (const cond of [...conditions].sort((a, b) => (a === 'without' ? -1 : b === 'without' ? 1 : 0))) for (const t of tasks) for (let i = 0; i < N; i++) jobs.push({ t, cond, i })
console.log(`${jobs.length} run(s): ${tasks.length} task(s) x ${conditions.join('/')} x n=${N}; model=${model}; skill-dir=${skillDir}; out=${labelDir}`)

let stopped = false
let lastUtil = null
async function runOne({ t, cond, i }) {
  const runDir = path.join(labelDir, 'runs', t.id, cond, String(i))
  const done = path.join(runDir, 'run.json')
  if (existsSync(done) && !RECHECK) { return JSON.parse(readFileSync(done, 'utf8')) }
  if (RECHECK) {
    const evPath = path.join(runDir, 'events.jsonl')
    if (!existsSync(evPath)) return null
    const prev = existsSync(done) ? JSON.parse(readFileSync(done, 'utf8')) : {}
    const events = readFileSync(evPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    const work = path.join(runDir, 'work')
    const metrics = extractMetrics(events, work)
    if (!metrics.skillBytesRead && prev.metrics && prev.metrics.skillBytesRead) metrics.skillBytesRead = prev.metrics.skillBytesRead
    const shimLog = readShimLog(runDir)
    const transcriptText = assistantText(events) + '\n' + JSON.stringify(toolUses(events).map((u) => u.input))
    const checks = await runChecks(t, { work, finalText: metrics.finalText, transcriptText, shimLog })
    const canary = scanCanary(events, metrics, { condition: cond })
    const record = { ...prev, task: t.id, phase: t.phase, condition: cond, index: i, label, metrics: { ...metrics, finalText: undefined }, shimLog, checks, score: score(checks), canary, rechecked: new Date().toISOString() }
    writeFileSync(done, JSON.stringify(record, null, 2))
    console.log(`[${t.id}/${cond}/${i}] recheck ${record.score.passed}/${record.score.total}${canary.clean ? '' : ' CANARY!'}`)
    return record
  }
  mkdirSync(runDir, { recursive: true })
  const { work, bin } = buildFixture({ runDir, skillDir, withSkill: cond === 'with', files: loadFixture(t), shim: t.shim || {} })
  const started = new Date().toISOString()
  const r = await runSubject({ work, bin, prompt: t.prompt, model, maxTurns: t.maxTurns || maxTurns, maxBudgetUsd: t.maxBudgetUsd || maxBudget, timeoutMs })
  writeFileSync(path.join(runDir, 'events.jsonl'), r.events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  if (r.stderr) writeFileSync(path.join(runDir, 'stderr.txt'), r.stderr)
  const metrics = extractMetrics(r.events, work)
  const shimLog = readShimLog(runDir)
  const transcriptText = assistantText(r.events) + '\n' + JSON.stringify(toolUses(r.events).map((u) => u.input))
  const checks = await runChecks(t, { work, finalText: metrics.finalText, transcriptText, shimLog })
  const canary = scanCanary(r.events, metrics, { condition: cond })
  const record = { task: t.id, phase: t.phase, condition: cond, index: i, label, model, started, wallMs: r.wallMs, exitCode: r.code, timedOut: r.timedOut, metrics: { ...metrics, finalText: undefined }, shimLog, checks, score: score(checks), canary }
  writeFileSync(path.join(runDir, 'final.md'), metrics.finalText || '')
  writeFileSync(done, JSON.stringify(record, null, 2))
  rmSync(path.join(work, '.claude', 'skills'), { recursive: true, force: true })
  if (metrics.rateLimitUtilization && metrics.rateLimitUtilization.five_hour) lastUtil = metrics.rateLimitUtilization.five_hour.utilization
  const s = record.score
  console.log(`[${t.id}/${cond}/${i}] ${s.passed}/${s.total} checks${s.allPass ? ' ALL' : ''}  $${(metrics.costUsd || 0).toFixed(2)} ${metrics.turns}t ${Math.round(r.wallMs / 1000)}s skillKB=${Math.round(metrics.skillBytesRead / 1024)} ${canary.clean ? '' : 'CANARY!'}${lastUtil != null ? ` util=${lastUtil.toFixed(2)}` : ''}${r.timedOut ? ' TIMEOUT' : ''}`)
  if (lastUtil != null && lastUtil >= stopAt) { stopped = true; console.error(`rate-limit utilization ${lastUtil} >= ${stopAt}; stopping after in-flight runs`) }
  return record
}

const records = []
let cursor = 0
async function worker() {
  while (cursor < jobs.length && !stopped) {
    const job = jobs[cursor++]
    try { const rec = await runOne(job); if (rec) records.push(rec) } catch (e) { console.error(`[${job.t.id}/${job.cond}/${job.i}] ERROR ${e.message}`) }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))

// Summarize everything present under this label (including runs from earlier invocations).
const all = []
const runsRoot = path.join(labelDir, 'runs')
if (existsSync(runsRoot)) for (const tid of readdirSync(runsRoot)) for (const cond of readdirSync(path.join(runsRoot, tid))) for (const i of readdirSync(path.join(runsRoot, tid, cond))) {
  const p = path.join(runsRoot, tid, cond, i, 'run.json'); if (existsSync(p)) all.push(JSON.parse(readFileSync(p, 'utf8')))
}
writeFileSync(path.join(labelDir, 'summary.json'), JSON.stringify(summarize(all), null, 2))
console.log(`summary: ${path.join(labelDir, 'summary.json')}${stopped ? ' (stopped early on rate limit; rerun the same command to resume)' : ''}`)

export function summarize(records) {
  const byTask = {}
  for (const r of records) {
    const t = (byTask[r.task] ||= { task: r.task, phase: r.phase, conditions: {} })
    const c = (t.conditions[r.condition] ||= { n: 0, allPass: 0, fraction: 0, cost: 0, turns: 0, inputTokens: 0, skillBytes: 0, checks: {}, docs: {}, skills: {}, canaryDirty: 0, timeouts: 0 })
    // Dirty runs (canary hit or escape) are void: counted, never scored.
    if (!r.canary.clean) { c.canaryDirty++; continue }
    c.n++; c.allPass += r.score.allPass ? 1 : 0; c.fraction += r.score.fraction; c.cost += r.metrics.costUsd || 0; c.turns += r.metrics.turns || 0
    c.inputTokens += r.metrics.inputTokens || 0; c.skillBytes += r.metrics.skillBytesRead || 0; c.timeouts += r.timedOut ? 1 : 0
    for (const ch of r.checks) { const k = (c.checks[ch.id] ||= { pass: 0, n: 0 }); k.n++; k.pass += ch.pass ? 1 : 0 }
    for (const d of new Set(r.metrics.docsOpened)) c.docs[d] = (c.docs[d] || 0) + 1
    for (const s of new Set(r.metrics.skillsLoaded)) c.skills[s] = (c.skills[s] || 0) + 1
  }
  for (const t of Object.values(byTask)) for (const c of Object.values(t.conditions)) {
    if (!c.n) { c.allPassRate = null; c.meanFraction = null; c.meanCost = null; c.meanTurns = null; c.meanInputTokens = null; c.meanSkillBytes = null; continue }
    c.allPassRate = c.allPass / c.n; c.meanFraction = c.fraction / c.n; c.meanCost = c.cost / c.n; c.meanTurns = c.turns / c.n; c.meanInputTokens = c.inputTokens / c.n; c.meanSkillBytes = c.skillBytes / c.n
    for (const k of Object.values(c.checks)) k.rate = k.pass / k.n
  }
  return { generatedAt: new Date().toISOString(), runs: records.length, tasks: byTask }
}
