#!/usr/bin/env node
// Self-test for the harness's own safety and scoring machinery. Run directly:
//   node scripts/skill-harness/selftest.mjs
// Every case here started life as a real observed failure or an external
// review's counterexample; keep it that way.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeShim } from './lib/shim.mjs'
import { extractMetrics } from './lib/metrics.mjs'
import { scanCanary } from './lib/canary.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const tmp = mkdtempSync(path.join(os.tmpdir(), 'harness-selftest-'))
let failures = 0
const test = (name, fn) => { try { fn(); console.log('ok  ' + name) } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message) } }

// --- shim: the gate is positional-literal, no flag may precede the subcommand
const bin = path.join(tmp, 'bin'); mkdirSync(bin)
writeShim({ binDir: bin, runDir: tmp, faults: 0 })
const shim = (args) => { try { return { out: execFileSync(path.join(bin, 'bounded'), args, { encoding: 'utf8', cwd: tmp }), code: 0 } } catch (e) { return { out: String(e.stdout || '') + String(e.stderr || ''), code: e.status ?? 1 } } }
const BLOCKED = [
  ['--instance', 'verify', 'deploy', '--help'],   // the verified bypass: --instance consumes "verify"
  ['deploy', '--create', '--name', 'x'],
  ['--help', 'verify', 'deploy'],                 // multi-arg help resolves a subcommand in Cobra
  ['init'], ['share', 'a@b.c'], ['secret', 'put', 'K'], ['apps', 'delete'], ['site', 'deploy', 'dist'],
  ['tests', 'push'],
  ['verify', '--instance', 'prod'],               // conservative: no --instance anywhere
]
for (const args of BLOCKED) test('shim blocks: bounded ' + args.join(' '), () => {
  const r = shim(args)
  assert.equal(r.code, 1, 'must exit 1')
  assert.match(r.out, /command_unavailable/, 'must refuse, got: ' + r.out.slice(0, 120))
})
test('shim allows read-only verify and logs it', () => {
  writeFileSync(path.join(tmp, 'policy.json'), '{}')
  shim(['verify', './policy.json', '--json'])
  const log = readFileSync(path.join(tmp, 'bounded-shim.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const last = log[log.length - 1]
  assert.equal(last.sub, 'verify'); assert.equal(last.blocked, false); assert.ok(last.policyHash, 'policy hash recorded')
})

// --- escape detector
const work = '/private/tmp/c/hx/base/runs/t/without/0/work'
const ev = (cmd) => [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: cmd } }] } }]
const esc = (cmd) => extractMetrics(ev(cmd), work).escapes.length
test('escape: sibling run flagged', () => assert.ok(esc('cat /private/tmp/c/hx/base/runs/t/with/0/work/policy.json') > 0))
test('escape: home tree flagged', () => assert.ok(esc('cat /Users/someone/Desktop/proj/CLAUDE.md') > 0))
test('escape: any .claude/skills flagged', () => assert.ok(esc('ls /Users/someone/.claude/skills/bounded') > 0))
test('escape: traversal flagged', () => assert.ok(esc('cd ../.. && find . -iname "*bounded*"') > 0))
test('escape: /tmp scratch not flagged', () => assert.equal(esc('npm run dev > /tmp/dev.log 2>&1'), 0))
test('escape: own work dir not flagged', () => assert.equal(esc('ls ' + work + '/src'), 0))

// --- canary: no waiver for user-level skill reads; allowEscapes only zeroes escapes
test('canary: with-condition user-skill read is dirty', () => {
  const m = extractMetrics(ev('cat /Users/u/.claude/skills/bounded-backend/SKILL.md'), work)
  assert.equal(scanCanary([], m, { condition: 'with' }).clean, false)
})
test('canary: probe allowEscapes suppresses escapes but not string hits', () => {
  const m = extractMetrics(ev('cd ../..'), work)
  assert.equal(scanCanary([], m, { condition: 'without', allowEscapes: true }).clean, true)
  const hit = scanCanary([{ type: 'assistant', message: { content: [{ type: 'text', text: 'per scripts/tests/foo' }] } }], m, { condition: 'without', allowEscapes: true })
  assert.equal(hit.clean, false)
})

// --- checker counterexamples from the external review
const mk = JSON.parse(readFileSync(path.join(here, 'tasks/backend-marketplace-daily-cap.json'), 'utf8'))
const where = new Function('inv', 'col', 'p', 'return (' + mk.checks.find((x) => x.id === 'rolling-cap-24h-1000').where + ')')
test('marketplace cap rejects @const of 999999', () => assert.equal(where({ type: 'rollingSum', windowSeconds: 86400, limit: '@const.CAP' }, 'x', { constants: { CAP: 999999 } }), false))
test('marketplace cap accepts @const of 100000 cents', () => assert.equal(where({ type: 'rollingSum', windowSeconds: 86400, limit: '@const.CAP' }, 'x', { constants: { CAP: 100000 } }), true))
const fx = JSON.parse(readFileSync(path.join(here, 'tasks/backend-fixed-supply-points.json'), 'utf8'))
const supply = new Function('p', 'cols', 'return (' + fx.checks.find((x) => x.id === 'supply-is-1000000').expr + ')')
test('fixed supply rejects a permanently zero supply', () => assert.equal(supply({ constants: {} }, [['a/$i', { invariants: [{ type: 'conserve' }], rules: { create: '@newData.b == 0' } }]]), false))
const em = JSON.parse(readFileSync(path.join(here, 'tasks/frontend-email-login-wallet.json'), 'utf8'))
const authRe = new RegExp(em.checks.find((x) => x.id === 'no-auth-mode').regex, 'm')
test('authMode comment does not trip the checker', () => assert.equal(authRe.test('// No authMode override needed'), false))
test('authMode assignment trips the checker', () => assert.equal(authRe.test("authMode: 'hosted'"), true))

rmSync(tmp, { recursive: true, force: true })
console.log(failures ? `${failures} FAILURE(S)` : 'selftest passed')
process.exit(failures ? 1 : 0)
