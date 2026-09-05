#!/usr/bin/env node
// Doc usage across the `with` runs of one label: which skill pages subjects open,
// how often, how big they are, and which pages no task reached (unmeasured, not
// bloat). Drives candidate selection: cut or restructure only what is measured.
//   node scripts/skill-harness/usage.mjs <labelDir> [skillDir]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { addContextMetrics, finishContextMetrics } from './lib/summary.mjs'

const [labelDir, skillDirArg] = process.argv.slice(2)
if (!labelDir) { console.error('usage: usage.mjs <labelDir> [skillDir]'); process.exit(2) }
const skillDir = path.resolve(skillDirArg || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'))
const FAMILY = ['bounded', 'bounded-backend', 'bounded-frontend', 'bounded-deploy', 'bounded-onchain', 'oapps-fun']

const runs = []
const root = path.join(labelDir, 'runs')
for (const t of readdirSync(root)) {
  const w = path.join(root, t, 'with'); if (!existsSync(w)) continue
  for (const i of readdirSync(w)) { const p = path.join(w, i, 'run.json'); if (existsSync(p)) runs.push(JSON.parse(readFileSync(p, 'utf8'))) }
}
const opened = {}
const byTask = {}
for (const r of runs) {
  const set = new Set([...r.metrics.docsOpened, ...r.metrics.skillsLoaded.map((s) => `${s}/SKILL.md`)])
  for (const d of set) { const o = (opened[d] ||= { runs: 0, tasks: new Set() }); o.runs++; o.tasks.add(r.task) }
  const bt = (byTask[r.task] ||= { n: 0, turns: 0, cost: 0, docs: new Set() })
  addContextMetrics(bt, r.metrics)
  bt.n++; bt.turns += r.metrics.turns || 0; bt.cost += r.metrics.costUsd || 0
  for (const d of set) bt.docs.add(d)
}
function allPages() {
  const out = []
  for (const s of FAMILY) {
    const base = path.join(skillDir, s)
    const stack = [base]
    while (stack.length) {
      const d = stack.pop()
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) stack.push(p)
        else if (e.name.endsWith('.md')) out.push(path.relative(skillDir, p))
      }
    }
  }
  return out
}
const pages = allPages()
const size = (rel) => { const p = path.join(skillDir, rel); return existsSync(p) ? statSync(p).size : 0 }

console.log(`# Doc usage: ${path.basename(labelDir)} (${runs.length} with-runs, ${Object.keys(byTask).length} tasks)\n`)
console.log('## Pages referenced by Read/Skill (by runs)\n')
console.log('| page | bytes | runs | tasks |\n|---|---|---|---|')
for (const [d, o] of Object.entries(opened).sort((a, b) => b[1].runs - a[1].runs)) console.log(`| ${d} | ${size(d)} | ${o.runs}/${runs.length} | ${[...o.tasks].join(', ')} |`)
console.log('\n## Per task\n')
console.log('| task | runs | file footprint KiB (n) | tool text KiB (complete n) | input tokens (n) | mean turns | mean $ | distinct pages |\n|---|---|---|---|---|---|---|---|')
for (const [t, b] of Object.entries(byTask)) {
  finishContextMetrics(b)
  const kb = (n) => n == null ? '-' : (n / 1024).toFixed(1)
  console.log(`| ${t} | ${b.n} | ${kb(b.meanSkillFileFootprintBytes)} (n=${b.contextSamples.skillFileFootprintBytes}) | ${kb(b.meanToolResultTextBytes)} (n=${b.contextSamples.toolResultTextBytes}) | ${b.meanInputTokens == null ? '-' : Math.round(b.meanInputTokens)} (n=${b.contextSamples.inputTokens}) | ${(b.turns / b.n).toFixed(0)} | ${(b.cost / b.n).toFixed(2)} | ${b.docs.size} |`)
}
console.log('\nFile footprint is the distinct full size of files referenced by Read/Skill, including legacy estimates; it ignores read ranges and cannot attribute shell commands. Tool text measures returned text across ALL tools, including shell output and repeated reads. Only complete traces enter its mean; unavailable/partial traces are excluded, not counted as zero. Model input tokens include cache reads/writes and are not a unique-context or billing measure.')
const never = pages.filter((p) => !opened[p] && !p.includes('/_fragments/'))
const neverBytes = never.reduce((a, p) => a + size(p), 0)
console.log(`\n## No Read/Skill request recorded (${never.length} pages, ${Math.round(neverBytes / 1024)}k): unmeasured, not evidence of bloat\n`)
for (const p of never.sort((a, b) => size(b) - size(a)).slice(0, 40)) console.log(`- ${p} (${size(p)})`)
if (never.length > 40) console.log(`- ... ${never.length - 40} more`)
