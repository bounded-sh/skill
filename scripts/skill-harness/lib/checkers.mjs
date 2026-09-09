// Outcome checkers. Every check is about what the subject PRODUCED or DID
// (files, policy shape, verify result, CLI calls, final answer), never about
// whether it paraphrased a doc sentence. Each returns { id, pass, detail }.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { resolveRealBounded } from './shim.mjs'

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.html', '.md', '.txt', '.env', '.css', '.vue', '.svelte'])

export function walk(dir, { skipSkills = true } = {}) {
  const out = []
  if (!existsSync(dir)) return out
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue
        if (skipSkills && p.includes(`${path.sep}.claude${path.sep}skills`)) continue
        stack.push(p)
      } else if (ent.isFile()) out.push(p)
    }
  }
  return out
}

function filesFor(work, spec) {
  if (spec.path) { const p = path.join(work, spec.path); return existsSync(p) ? [p] : [] }
  const re = spec.glob ? new RegExp(spec.glob) : null
  return walk(work).filter((f) => {
    if (!CODE_EXT.has(path.extname(f)) && !spec.anyExt) return false
    const rel = path.relative(work, f)
    return re ? re.test(rel) : true
  })
}

export function collections(policy) {
  return Object.entries(policy || {}).filter(([k, v]) => k.includes('/') && v && typeof v === 'object')
}

function loadPolicy(work, spec) {
  const p = path.join(work, spec.policy || 'policy.json')
  if (!existsSync(p)) return { error: `${spec.policy || 'policy.json'} missing` }
  try { return { policy: JSON.parse(readFileSync(p, 'utf8')), file: p } } catch (e) { return { error: `invalid JSON: ${e.message.slice(0, 80)}` } }
}

// One verdict per policy CONTENT: cached in the run dir so a recheck never
// re-rolls the prover. Transient responses (the documented prover-busy 503 and
// the dev-api "429: Too many formal verification requests ... 20 per minute per
// IP") are retried with backoff and never cached; a verdict is cached only when
// it carries a real status string. Every uncached prover call is followed by a
// 4s pause to stay under the 20/min limit even across a long recheck.
export function runVerify(file, runDir, execVia) {
  const argvPrefix = execVia && execVia.length ? execVia : [resolveRealBounded()]
  const bytes = readFileSync(file)
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  const cachePath = runDir ? path.join(runDir, 'verify-cache.json') : null
  if (cachePath && existsSync(cachePath)) {
    try { const c = JSON.parse(readFileSync(cachePath, 'utf8')); if (c.hash === hash && c.result && typeof c.result.status === 'string' && !['NONJSON', 'PROVER_BUSY'].includes(c.result.status)) return c.result } catch {}
  }
  let last = { ok: false, status: 'PROVER_BUSY', passed: false, counts: {}, failures: ['no attempt succeeded'] }
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = spawnSync(argvPrefix[0], [...argvPrefix.slice(1), 'verify', file, '--json'], { encoding: 'utf8', timeout: 240000 })
    const raw = (r.stdout || '') + (r.stderr || '')
    if (!execVia) spawnSync('sleep', ['4']) // hosted dev-api pacing (20/min/IP); the local stack needs none
    const transient = /proof_substrate_unavailable|Too many formal verification|\b429\b|"retryable"\s*:\s*true/.test(raw)
    if (transient) { last = { ok: false, status: 'PROVER_BUSY', passed: false, counts: {}, failures: [raw.slice(0, 200)] }; spawnSync('sleep', [String(10 * attempt)]); continue }
    try {
      const j = JSON.parse((r.stdout || '').slice((r.stdout || '').indexOf('{')))
      if (typeof j.status !== 'string') { last = { ok: false, status: 'NONJSON', passed: false, counts: {}, failures: [raw.slice(0, 300)] }; continue }
      const result = { ok: true, status: j.status, passed: Boolean(j.passed), counts: j.counts || {}, failures: (j.details || []).filter((d) => !d.passed).map((d) => `${d.check}: ${d.message}`.slice(0, 220)) }
      if (cachePath) writeFileSync(cachePath, JSON.stringify({ hash, result }))
      return result
    } catch (e) {
      last = { ok: false, status: 'NONJSON', passed: false, counts: {}, failures: ['EXC: ' + e.message, raw.slice(0, 300)] }
    }
  }
  return last
}

export async function runChecks(task, ctx) {
  const results = []
  for (const [i, c] of (task.checks || []).entries()) {
    const id = c.id || `${c.kind}#${i}`
    let r
    try { r = await one(c, ctx) } catch (e) { r = { pass: false, detail: `checker error: ${e.message}` } }
    results.push({ id, kind: c.kind, weight: c.weight ?? 1, ...r })
  }
  return results
}

async function one(c, ctx) {
  const { work, finalText, transcriptText, shimLog } = ctx
  switch (c.kind) {
    case 'file-exists': {
      const files = filesFor(work, c)
      return { pass: files.length > 0, detail: files.length ? `${files.length} file(s)` : 'no match' }
    }
    case 'json-valid': {
      const p = path.join(work, c.path)
      if (!existsSync(p)) return { pass: false, detail: 'missing' }
      try { JSON.parse(readFileSync(p, 'utf8')); return { pass: true, detail: 'ok' } } catch (e) { return { pass: false, detail: e.message.slice(0, 100) } }
    }
    case 'verify': {
      const p = path.join(work, c.path || 'policy.json')
      if (!existsSync(p)) return { pass: false, detail: 'policy missing' }
      const v = runVerify(p, ctx.runDir, ctx.boundedExec)
      const pass = c.expect === 'no-proof-failures' ? v.ok && (v.counts.proofFailures || 0) === 0 && (v.counts.schemaFailures || 0) === 0 : v.passed
      return { pass, detail: `${v.status} ${JSON.stringify(v.counts)}${v.failures.length ? ' ' + v.failures.slice(0, 3).join(' | ') : ''}`, verify: v }
    }
    case 'policy-expr': {
      const l = loadPolicy(work, c)
      if (l.error) return { pass: false, detail: l.error }
      const fn = new Function('p', 'cols', 'return (' + c.expr + ')')
      const v = fn(l.policy, collections(l.policy))
      return { pass: Boolean(v), detail: String(v).slice(0, 120) }
    }
    case 'policy-rule': {
      const l = loadPolicy(work, c)
      if (l.error) return { pass: false, detail: l.error }
      const colRe = new RegExp(c.collection)
      const re = new RegExp(c.regex, c.flags || '')
      const matched = collections(l.policy).filter(([k]) => colRe.test(k))
      if (!matched.length) return { pass: false, detail: `no collection matches /${c.collection}/` }
      const hits = matched.map(([k, v]) => ({ k, rule: String((v.rules || {})[c.rule] ?? ''), m: re.test(String((v.rules || {})[c.rule] ?? '')) }))
      const want = c.expect !== 'nomatch'
      const pass = c.all ? hits.every((h) => h.m === want) : hits.some((h) => h.m === want)
      return { pass, detail: hits.map((h) => `${h.k}.${c.rule}=${h.rule.slice(0, 140)}`).join(' || ') }
    }
    case 'policy-invariant': {
      const l = loadPolicy(work, c)
      if (l.error) return { pass: false, detail: l.error }
      const colRe = c.collection ? new RegExp(c.collection) : null
      const invs = []
      for (const [k, v] of collections(l.policy)) {
        if (colRe && !colRe.test(k)) continue
        for (const inv of v.invariants || []) invs.push({ col: k, inv })
      }
      const where = c.where ? new Function('inv', 'col', 'p', 'return (' + c.where + ')') : null
      const ok = invs.filter(({ inv, col }) => (!c.type || inv.type === c.type) && (!where || where(inv, col, l.policy)))
      return { pass: ok.length > 0, detail: ok.length ? ok.map((o) => `${o.col}:${JSON.stringify(o.inv).slice(0, 120)}`).join(' || ') : `invariants seen: ${invs.map((o) => o.inv.type).join(',') || 'none'}` }
    }
    case 'regex': {
      const files = filesFor(work, c)
      const re = new RegExp(c.regex, c.flags || 'm')
      const hits = files.filter((f) => re.test(readFileSync(f, 'utf8')))
      const present = c.expect !== 'absent'
      const pass = present ? hits.length > 0 : hits.length === 0
      return { pass, detail: `${hits.length} of ${files.length} file(s) match${hits.length ? ': ' + hits.slice(0, 3).map((h) => path.relative(work, h)).join(', ') : ''}` }
    }
    case 'regex-order': {
      // In at least one file, `first` appears before `then`; any file having `then` without an earlier `first` fails.
      const files = filesFor(work, c)
      const a = new RegExp(c.first, c.flags || 'm'), b = new RegExp(c.then, c.flags || 'm')
      let withThen = 0, ordered = 0
      for (const f of files) {
        // comments do not gate anything: strip them so a mention in a header does not count as a use
        const s = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
        const mb = s.search(b); if (mb < 0) continue
        withThen++
        const ma = s.search(a)
        if (ma >= 0 && ma < mb) ordered++
      }
      return { pass: withThen > 0 && ordered === withThen, detail: `${ordered}/${withThen} file(s) gate before use` }
    }
    case 'response': {
      const re = new RegExp(c.regex, c.flags || 'i')
      const m = re.test(finalText)
      const pass = c.expect === 'absent' ? !m : m
      return { pass, detail: m ? 'matched' : 'no match' }
    }
    case 'transcript': {
      const re = new RegExp(c.regex, c.flags || 'i')
      const m = re.test(transcriptText)
      const pass = c.expect === 'absent' ? !m : m
      return { pass, detail: m ? 'matched' : 'no match' }
    }
    case 'shim': {
      const fn = new Function('log', 'return (' + c.expr + ')')
      const v = fn(shimLog)
      return { pass: Boolean(v), detail: `${shimLog.length} cli call(s): ${shimLog.map((e) => (e.blocked ? 'BLOCKED ' : '') + (e.faulted ? 'FAULT ' : '') + e.args.join(' ')).join(' ; ').slice(0, 300)}` }
    }
    case 'any-of': {
      // Passes when any alternative passes; records which one. Use when the docs
      // teach more than one legitimate shape for the same outcome.
      const subs = []
      for (const alt of c.of || []) subs.push({ id: alt.id || alt.kind, ...(await one(alt, ctx)) })
      const hit = subs.find((s) => s.pass)
      return { pass: Boolean(hit), detail: hit ? `via ${hit.id}: ${hit.detail}`.slice(0, 200) : subs.map((s) => `${s.id}: ${s.detail}`).join(' || ').slice(0, 300) }
    }
    default:
      return { pass: false, detail: `unknown check kind ${c.kind}` }
  }
}

export function score(results) {
  const total = results.reduce((a, r) => a + r.weight, 0)
  const got = results.filter((r) => r.pass).reduce((a, r) => a + r.weight, 0)
  const scored = results.filter((r) => r.weight > 0)
  return { fraction: total ? got / total : 0, allPass: scored.every((r) => r.pass), passed: results.filter((r) => r.pass).length, total: results.length }
}
