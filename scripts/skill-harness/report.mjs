#!/usr/bin/env node
// Render one or two label summaries as markdown.
//   node scripts/skill-harness/report.mjs results/baseline            -> lift table (with vs without)
//   node scripts/skill-harness/report.mjs results/baseline results/cut-1  -> baseline vs candidate (with condition)
import { readFileSync } from 'node:fs'
import path from 'node:path'

const [a, b] = process.argv.slice(2)
if (!a) { console.error('usage: report.mjs <labelDir> [<labelDir>]'); process.exit(2) }
const A = JSON.parse(readFileSync(path.join(a, 'summary.json'), 'utf8'))
const B = b ? JSON.parse(readFileSync(path.join(b, 'summary.json'), 'utf8')) : null
const pct = (x) => x == null ? '-' : `${Math.round(x * 100)}%`
const kb = (x) => x == null ? '-' : `${Math.round(x / 1024)}k`
const num = (x, d = 1) => x == null ? '-' : Number(x).toFixed(d)

if (!B) {
  console.log(`# Skill lift: ${path.basename(a)}\n`)
  console.log(`runs: ${A.runs}, generated ${A.generatedAt}\n`)
  console.log('| task | phase | with: all-pass | with: mean checks | without: all-pass | without: mean checks | lift (checks) | with $ | with turns | skill bytes read | canary |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const t of Object.values(A.tasks)) {
    const w = t.conditions.with || {}, o = t.conditions.without || {}
    const lift = w.meanFraction != null && o.meanFraction != null ? w.meanFraction - o.meanFraction : null
    console.log(`| ${t.task} | ${t.phase} | ${pct(w.allPassRate)} (n=${w.n || 0}${w.canaryDirty ? ', void ' + w.canaryDirty : ''}) | ${pct(w.meanFraction)} | ${pct(o.allPassRate)} (n=${o.n || 0}${o.canaryDirty ? ', void ' + o.canaryDirty : ''}) | ${pct(o.meanFraction)} | ${lift == null ? '-' : (lift >= 0 ? '+' : '') + pct(lift)} | ${num(w.meanCost, 2)} | ${num(w.meanTurns, 0)} | ${kb(w.meanSkillBytes)} | ${(w.canaryDirty || 0) + (o.canaryDirty || 0)} void |`)
  }
  console.log('\n## Per-check pass rates (with skill)\n')
  for (const t of Object.values(A.tasks)) {
    const w = t.conditions.with; if (!w) continue
    console.log(`**${t.task}**: ` + Object.entries(w.checks).map(([k, v]) => `${k} ${pct(v.rate)}`).join(' · '))
  }
  console.log('\n## Docs opened (with skill, share of runs)\n')
  for (const t of Object.values(A.tasks)) {
    const w = t.conditions.with; if (!w) continue
    const docs = Object.entries(w.docs).sort((x, y) => y[1] - x[1]).map(([d, n]) => `${d} (${n}/${w.n})`).join(', ')
    console.log(`**${t.task}**: skills ${Object.entries(w.skills).map(([s, n]) => `${s} ${n}/${w.n}`).join(', ') || '-'}; docs ${docs || '-'}`)
  }
} else {
  console.log(`# ${path.basename(a)} vs ${path.basename(b)} (with skill)\n`)
  console.log('| task | base all-pass | cand all-pass | base checks | cand checks | delta checks | base skill bytes | cand skill bytes | base $ | cand $ | base turns | cand turns |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const t of Object.values(A.tasks)) {
    const x = t.conditions.with || {}, y = ((B.tasks[t.task] || {}).conditions || {}).with || {}
    if (!y.n) continue
    const d = y.meanFraction - x.meanFraction
    console.log(`| ${t.task} | ${pct(x.allPassRate)} (n=${x.n}) | ${pct(y.allPassRate)} (n=${y.n}) | ${pct(x.meanFraction)} | ${pct(y.meanFraction)} | ${(d >= 0 ? '+' : '') + pct(d)} | ${kb(x.meanSkillBytes)} | ${kb(y.meanSkillBytes)} | ${num(x.meanCost, 2)} | ${num(y.meanCost, 2)} | ${num(x.meanTurns, 0)} | ${num(y.meanTurns, 0)} |`)
  }
  console.log('\n## Per-check deltas\n')
  for (const t of Object.values(A.tasks)) {
    const x = t.conditions.with || {}, y = ((B.tasks[t.task] || {}).conditions || {}).with || {}
    if (!y.n) continue
    console.log(`**${t.task}**: ` + Object.keys(x.checks || {}).map((k) => `${k} ${pct((x.checks[k] || {}).rate)}->${pct((y.checks[k] || {}).rate)}`).join(' · '))
  }
}
