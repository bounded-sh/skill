#!/usr/bin/env node

// Regression harness for finding #392: the admin `active` off-switch must be a
// REAL gate, not a declared-but-ignored field.
//
// Two independent checks:
//
//   STATIC (always runs, self-contained): scans every skill doc for a policy
//   example whose `admins/$...` collection DECLARES an `active` field while any
//   privileged rule/auth still gates on mere existence
//   (`get(/admins/...) != null`). Such a block ships a fake off-switch: flipping
//   `active: false` revokes nothing. Fails if any remain.
//
//   PROOF (runs when the bounded-monorepo schema verifier dist is reachable;
//   skipped-with-notice otherwise, because this repo releases separately): runs
//   each corrected admin example through the real Z3-backed deploy gate
//   (`verifyForDeploy`, which also discharges the `authorityClosure`
//   attestation) to prove branch B keeps the closure proof clean, and uses
//   `checkImplication` to prove the `.active == true` gate is LOAD-BEARING
//   (an existence gate is NOT - it is disproved against an inactive admin).
//
// Usage:
//   node scripts/verify-admin-active-gate.mjs            # static + proof (if dist found)
//   BOUNDED_SCHEMA_DIST=/path/to/schema/nodejs node scripts/verify-admin-active-gate.mjs

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const notes = []
const fail = (m) => errors.push(m)
const note = (m) => notes.push(m)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allMarkdown(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.gstack', 'node_modules'].includes(entry.name)) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...allMarkdown(abs))
    else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdc')) out.push(abs)
  }
  return out
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

// Extract fenced json / jsonc code blocks with their starting line number.
function jsonBlocks(source) {
  const blocks = []
  const re = /```jsonc?\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(source)) !== null) {
    const before = source.slice(0, m.index)
    const line = before.split('\n').length + 1
    blocks.push({ body: m[1], line })
  }
  return blocks
}

// Tolerant jsonc -> json (strip line comments + trailing commas) so we can
// JSON.parse the access-control.md example, which carries `//` annotations.
function looseParse(body) {
  const stripped = body
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s+\/\/.*$/, '')))
    .join('\n')
    .replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(stripped)
}

const ADMIN_KEY_RE = /^admins\/\$/
const ADMIN_EXISTENCE_RE = /get\(\/admins\/@user\.(?:id|address)\)\s*!=\s*null/

// Does this admin collection entry declare an `active` field?
function declaresActive(entry) {
  return !!(entry && entry.fields && Object.prototype.hasOwnProperty.call(entry.fields, 'active'))
}

// Collect every rule/auth string reachable from a policy object.
function gateStrings(policy) {
  const out = []
  for (const [k, v] of Object.entries(policy)) {
    if (v && typeof v === 'object' && v.rules) {
      for (const r of Object.values(v.rules)) if (typeof r === 'string') out.push([`${k}.rules`, r])
    }
    if (k === 'functions' && v && typeof v === 'object') {
      for (const [fn, cfg] of Object.entries(v)) {
        if (cfg && typeof cfg.auth === 'string') out.push([`functions.${fn}.auth`, cfg.auth])
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// STATIC check
// ---------------------------------------------------------------------------

let staticScanned = 0
let staticAdminActiveBlocks = 0

for (const file of allMarkdown(root)) {
  const source = readFileSync(file, 'utf8')
  for (const { body, line } of jsonBlocks(source)) {
    if (!/admins\/\$/.test(body)) continue
    let policy
    try {
      policy = looseParse(body)
    } catch {
      // Un-parseable snippet: fall back to a windowed textual heuristic so a
      // partial example still can't hide the defect.
      if (/"active"\s*:/.test(body) && ADMIN_EXISTENCE_RE.test(body)) {
        fail(`${rel(file)}:${line}: admin example declares "active" but a rule still gates on existence (get(/admins/...) != null)`)
      }
      continue
    }
    staticScanned++
    const adminEntries = Object.entries(policy).filter(([k]) => ADMIN_KEY_RE.test(k))
    const anyActive = adminEntries.some(([, v]) => declaresActive(v))
    if (!anyActive) continue
    staticAdminActiveBlocks++
    for (const [where, gate] of gateStrings(policy)) {
      if (ADMIN_EXISTENCE_RE.test(gate)) {
        fail(
          `${rel(file)}:${line}: admin example declares "active" but ${where} still gates on existence ` +
            `-> "${gate.trim()}". Gate on get(/admins/@user.id).active == true so the off-switch is real.`,
        )
      }
    }
  }
}

note(`static: scanned ${staticScanned} admin policy block(s); ${staticAdminActiveBlocks} declare an "active" field`)
if (staticAdminActiveBlocks === 0) {
  fail('static: found no admin example that declares "active" - expected branch B to KEEP the field as a real gate')
}

// ---------------------------------------------------------------------------
// CONSISTENCY check (finding #392 review residual)
//
// The #392 fix added "off-switch is real" prose that PROHIBITS the bare
// existence gate. But the bare-existence gate is a LEGITIMATE simpler design
// for an admin registry that declares NO `active` field (revoke = delete the
// row, which works). Sibling docs still teach exactly that pattern
// (service-keys.md, verify-and-counterexamples.md, policy-generation-guide.md,
// functions-when-to-use.md). If the prohibition prose reads as an UNCONDITIONAL
// ban, it contradicts those valid examples. Three guards keep the corpus
// internally consistent:
//
//   SCOPING     - every prohibition of the bare gate must be scoped to
//                 active-declaring registries (an explicit "if ... active"
//                 condition), never stated as an absolute rule.
//   CROSS-REF   - every doc that teaches the bare-existence gate must also
//                 surface the active-gate alternative expression
//                 (`get(/admins/@user.id).active == true`) so a copy-paste
//                 reader is pointed at the real off-switch.
//   FOUNDER-TRAP- any admin block whose founder row is undeletable
//                 (`... != @const.FOUNDER` on delete) AND whose `update`
//                 requires `.active == true` must warn that deactivating the
//                 founder there is an unrecoverable lock-out.
//
// Scoped to bounded-backend/docs/ - the onchain tokenomics admin example is
// coordinated separately under #393 and must not be touched here.
// ---------------------------------------------------------------------------

const BACKEND_DOCS_PREFIX = 'bounded-backend/docs/'
const BARE_GATE = /get\(\/admins\/@user\.id\)\s*!=\s*null/
const ACTIVE_GATE = /get\(\/admins\/@user\.id\)\.active\s*==\s*true/
// A prohibition of the bare gate stated with the "... != null` alone" idiom.
const PROHIBITION_RE = /\b(?:never|do not|don't)\b[^.!?\n]*?get\(\/admins\/@user\.id\)\s*!=\s*null[^.!?\n]*?\balone\b/gi
// A scoping cue that ties the prohibition to an active-declaring registry.
const SCOPING_CUE = /\b(?:if|when|once|whenever)\b[^.!?]*\bactive\b|\bdeclares?\b[^.!?]*\bactive\b|\bactive-declaring\b/i

// Lead clause of the sentence that ends at `idx` (from the previous sentence
// terminator forward). Dotted identifiers like `.active` / `@user.id` are never
// treated as terminators because a sentence-ending `.!?` is always followed by
// whitespace or end-of-string, whereas a dotted identifier's dot is followed by
// a word character.
function sentenceLead(source, idx) {
  const pre = source.slice(0, idx)
  const re = /[.!?](?=\s|$)/g
  let start = 0
  let m
  while ((m = re.exec(pre)) !== null) start = m.index + 1
  return source.slice(start, idx)
}

for (const file of allMarkdown(root)) {
  if (!rel(file).startsWith(BACKEND_DOCS_PREFIX)) continue
  const source = readFileSync(file, 'utf8')

  // SCOPING: no unconditional prohibition of the bare gate.
  PROHIBITION_RE.lastIndex = 0
  let pm
  while ((pm = PROHIBITION_RE.exec(source)) !== null) {
    const lead = sentenceLead(source, pm.index)
    if (!SCOPING_CUE.test(lead)) {
      const lineNo = source.slice(0, pm.index).split('\n').length
      fail(
        `${rel(file)}:${lineNo}: unconditional prohibition "${pm[0].trim()}" contradicts sibling docs that ` +
          `legitimately teach the bare-existence gate (registries with no "active" field). Scope it: ` +
          `"If your admins registry declares an \`active\` field, never gate on ... alone".`,
      )
    }
  }

  // CROSS-REF: a doc that teaches the bare gate must also show the active gate.
  if (BARE_GATE.test(source) && !ACTIVE_GATE.test(source)) {
    fail(
      `${rel(file)}: teaches the bare-existence admin gate (get(/admins/@user.id) != null) but never surfaces the ` +
        `active-gate alternative (get(/admins/@user.id).active == true). Add a cross-reference to the real ` +
        `off-switch pattern so a copy-paste reader is not left with a non-revocable gate.`,
    )
  }

  // FOUNDER-TRAP: undeletable founder + active-gated update needs a warning.
  for (const { body } of jsonBlocks(source)) {
    if (!/admins\/\$/.test(body)) continue
    let policy
    try {
      policy = looseParse(body)
    } catch {
      continue
    }
    const adminEntries = Object.entries(policy).filter(([k]) => ADMIN_KEY_RE.test(k))
    const trapped = adminEntries.some(([, v]) => {
      const r = (v && v.rules) || {}
      const del = typeof r.delete === 'string' ? r.delete : ''
      const upd = typeof r.update === 'string' ? r.update : ''
      return /!=\s*@const\.FOUNDER/.test(del) && /\.active\s*==\s*true/.test(upd)
    })
    if (trapped) {
      const warned = /deactivat[\s\S]{0,220}founder|founder[\s\S]{0,220}deactivat/i.test(source)
      if (!warned) {
        fail(
          `${rel(file)}: the admin registry makes the founder row undeletable ($userId != @const.FOUNDER) while ` +
            `\`update\` requires .active == true, so a founder who is set active:false can neither be deleted nor ` +
            `reactivate itself - an unrecoverable lock-out. Add an explicit founder-self-deactivation-trap warning.`,
        )
      }
      break
    }
  }
}

// ---------------------------------------------------------------------------
// PROOF check (bounded-monorepo schema verifier)
// ---------------------------------------------------------------------------

const distDir =
  process.env.BOUNDED_SCHEMA_DIST ||
  '/Users/athar/Desktop/workspace/poof-new/bounded-monorepo/packages/cdk/layers/schema/nodejs'
const verifierPath = path.join(distDir, 'dist/verification/verifier.js')

if (!existsSync(verifierPath)) {
  note(`proof: schema verifier dist not found at ${verifierPath} - skipping Z3 proof checks (set BOUNDED_SCHEMA_DIST)`)
} else {
  const require = createRequire(path.join(distDir, 'noop.js'))
  const { verifyForDeploy, verifyPolicyAsync } = require('./dist/verification/verifier.js')

  // Give placeholder / non-alphanumeric constant values a valid literal so
  // @const resolution and authorityClosure.initialMember accept them.
  function sanitizeConstants(policy) {
    if (!policy.constants) return policy
    let i = 0
    for (const [name, val] of Object.entries(policy.constants)) {
      if (typeof val !== 'string' || !/^[A-Za-z0-9]+$/.test(val)) {
        policy.constants[name] = `TESTCONST${name.replace(/[^A-Za-z0-9]/g, '')}${i++}`.padEnd(32, '0')
      }
    }
    return policy
  }

  // Collect the corrected admin examples again, this time to prove them.
  const provable = []
  for (const file of allMarkdown(root)) {
    const source = readFileSync(file, 'utf8')
    for (const { body, line } of jsonBlocks(source)) {
      if (!/admins\/\$/.test(body)) continue
      let policy
      try {
        policy = looseParse(body)
      } catch {
        continue
      }
      const adminEntries = Object.entries(policy).filter(([k]) => ADMIN_KEY_RE.test(k))
      if (!adminEntries.some(([, v]) => declaresActive(v))) continue
      provable.push({ label: `${rel(file)}:${line}`, policy: sanitizeConstants(policy) })
    }
  }

  // 1) The triage's BLOCKING concern for branch B: does the `authorityClosure`
  //    attestation still prove clean once every add-path gates on
  //    `.active == true` instead of mere existence? Prove it directly with the
  //    same Z3 engine the deploy gate uses. (verifyForDeploy also runs this, but
  //    it layers on orthogonal ownership-immutability advisories that these
  //    transfer/moderation examples trip identically before and after #392, so
  //    those are reported below as notes, not hard failures.)
  const constLiteral = (policy, ref) => {
    const name = String(ref).replace(/^@const\./, '')
    return policy.constants && policy.constants[name] ? policy.constants[name] : ref
  }
  let closureProved = 0
  for (const { label, policy } of provable) {
    const attestations = policy.proofs?.attestations || policy.attestations || []
    for (const att of attestations) {
      if (att.kind !== 'authorityClosure') continue
      const initialMember = att.initialMember ? constLiteral(policy, att.initialMember) : undefined
      try {
        const res = await verifyPolicyAsync({
          operation: { type: 'verifyAuthorityClosure', roleScope: att.roleScope, initialMember },
          engine: 'proof',
          policy,
        })
        const r = res.result || {}
        if (r.passed !== true || r.proofStatus !== 'PROVED') {
          fail(`proof(closure): ${label} authorityClosure over ${att.roleScope} is ${r.proofStatus} (passed=${r.passed}) - branch B broke the closure proof`)
        } else {
          closureProved++
          note(`proof(closure): ${label} authorityClosure over ${att.roleScope} still PROVED with the active gate`)
        }
      } catch (e) {
        fail(`proof(closure): ${label} threw ${e && e.message ? e.message : e}`)
      }
    }
  }
  if (closureProved === 0) {
    fail('proof(closure): no authorityClosure attestation was proven - expected at least the access-control / admin-and-ownership / invariants examples')
  }

  // Informational: full deploy gate. Failures here are pre-existing ownership
  // -immutability advisories on transfer/moderation examples, orthogonal to the
  // active-gate fix (they fire on the pre-fix docs too), so they are notes only.
  for (const { label, policy } of provable) {
    try {
      const gate = await verifyForDeploy(policy, { allowPublicRead: true })
      if (gate.approved) {
        note(`proof(deploy): ${label} approved by verifyForDeploy (${gate.obligationCount} obligations)`)
      } else {
        const failed = gate.scopes
          .flatMap((s) => s.checks.filter((c) => !c.passed).map((c) => `${s.scope}: ${c.obligation}`))
          .join('; ')
        note(`proof(deploy): ${label} - ${gate.failedCount}/${gate.obligationCount} orthogonal advisory(ies) [${failed}]`)
      }
    } catch (e) {
      note(`proof(deploy): ${label} verifyForDeploy threw ${e && e.message ? e.message : e}`)
    }
  }

  // 2) Load-bearing property, proved with the Z3 implication engine.
  //    The canonical pure admin gate MUST imply the record is active; the
  //    existence-only gate MUST NOT (an inactive-but-present admin passes it).
  const impl = async (rule, property) => {
    const res = await verifyPolicyAsync({
      operation: { type: 'checkImplication', rule, property },
      engine: 'proof',
    })
    return res.result || {}
  }

  const ACTIVE_PROP = 'get(/admins/@user.id).active == true'
  const activeGate = `@user.id != null && ${ACTIVE_PROP}`
  const existenceGate = '@user.id != null && get(/admins/@user.id) != null'

  const good = await impl(activeGate, ACTIVE_PROP)
  if (good.proofStatus !== 'PROVED') {
    fail(`proof(load-bearing): active gate should IMPLY the record is active, got ${good.proofStatus}`)
  } else {
    note('proof(load-bearing): "...active == true" gate PROVED to enforce active (off-switch is real)')
  }

  const bad = await impl(existenceGate, ACTIVE_PROP)
  if (bad.proofStatus === 'PROVED') {
    fail('proof(load-bearing): existence gate unexpectedly PROVED to enforce active - model is unsound for this test')
  } else {
    note(`proof(load-bearing): existence gate does NOT enforce active (${bad.proofStatus}) - confirms the pre-fix off-switch was inert`)
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const n of notes) console.log(`- ${n}`)
if (errors.length > 0) {
  console.error(`\nadmin active-gate check FAILED (${errors.length}):`)
  for (const e of errors) console.error(`  * ${e}`)
  process.exit(1)
}
console.log('\nadmin active-gate check PASSED: every admin example gates privileged actions on active == true.')
