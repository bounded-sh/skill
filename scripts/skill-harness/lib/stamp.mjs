// Run stamps: every stored run is bound to the exact inputs that produced it,
// and both resume and summarize refuse to treat a mismatched record as data.
// subjectHash covers what shapes the SUBJECT (prompt, fixture, shim, budgets);
// checker edits deliberately do not change it, because a recheck re-scores the
// same subject behaviour. familyHash covers the skill content under test.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export function familyHash(dir) {
  const h = createHash('sha256')
  const stack = ['bounded', 'bounded-backend', 'bounded-frontend', 'bounded-deploy', 'bounded-onchain', 'oapps-fun'].map((s) => path.join(dir, s))
  const files = []
  while (stack.length) {
    const d = stack.pop()
    if (!existsSync(d)) continue
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== '.git') stack.push(p) } else files.push(p)
    }
  }
  for (const f of files.sort()) { h.update(path.relative(dir, f)); h.update(readFileSync(f)) }
  return h.digest('hex').slice(0, 16)
}

export function subjectHash(task, defaults = {}) {
  const shape = {
    prompt: task.prompt,
    fixture: task.fixture || {},
    shim: task.shim || {},
    maxTurns: task.maxTurns || defaults.maxTurns,
    maxBudgetUsd: task.maxBudgetUsd || defaults.maxBudget,
  }
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 12)
}

export function stampMismatch(prev, cur) {
  if (!prev) return 'run has no stamp (older harness revision); recheck to backfill, or delete it'
  for (const k of ['skillHash', 'subjectHash', 'model', 'cliVersion']) {
    if (prev[k] !== undefined && cur[k] !== undefined && String(prev[k]) !== String(cur[k])) return `${k}: ${prev[k]} != ${cur[k]}`
  }
  return null
}
