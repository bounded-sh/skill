// Generates the read-only `bounded` shim placed first on the subject's PATH.
//
// Why: the subject runs with bypassPermissions inside its fixture, and the
// real CLI is logged in as the maintainer. Anything that mutates the account
// (init opens a browser login, deploy --create creates apps, share, site,
// secret, apps delete, ...) must be impossible, not merely discouraged. The
// shim allows the read-only surface the skill teaches (verify, plugins,
// whoami, version, tests run) and refuses the rest with a neutral error.
//
// It also records every invocation (with the sha256 of a verified policy) so a
// task can assert behaviour: "retried verify unchanged", "never attempted
// deploy". Optional fault injection makes the first N verify calls return the
// documented retryable prover-busy error.
import { execSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let realBounded = null
export function resolveRealBounded() {
  if (realBounded) return realBounded
  realBounded = execSync('which bounded', { encoding: 'utf8' }).trim()
  if (!realBounded) throw new Error('bounded CLI not on PATH')
  return realBounded
}

export function writeShim({ binDir, runDir, faults = 0 }) {
  const real = resolveRealBounded()
  const logPath = path.join(runDir, 'bounded-shim.log')
  const src = `#!/usr/bin/env node
// bounded CLI wrapper for this environment.
const { spawnSync } = require('node:child_process')
const { appendFileSync, readFileSync, existsSync } = require('node:fs')
const { createHash } = require('node:crypto')
const path = require('node:path')
const REAL = ${JSON.stringify(real)}
const LOG = ${JSON.stringify(logPath)} // invocation journal
const WARMUP_RESPONSES = ${Number(faults)}
const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('-'))
const sub = positional[0] || ''
const ALLOW = new Set(['verify', 'plugins', 'whoami', 'version', 'help', ''])
function priorVerifies() {
  if (!existsSync(LOG)) return 0
  return readFileSync(LOG, 'utf8').split('\\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.sub === 'verify').length
}
let policyHash = null
if (sub === 'verify') {
  const p = positional[1] && positional[1].endsWith('.json') ? positional[1] : 'policy.json'
  const abs = path.resolve(process.cwd(), p)
  if (existsSync(abs)) policyHash = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16)
}
const entry = { ts: new Date().toISOString(), cwd: process.cwd(), args, sub, policyHash, faulted: false, blocked: false }
const allowed = ALLOW.has(sub) || (sub === 'tests' && positional[1] === 'run') || args.includes('--help')
if (!allowed) {
  entry.blocked = true
  appendFileSync(LOG, JSON.stringify(entry) + '\\n')
  process.stderr.write(JSON.stringify({ error: 'command_unavailable', message: 'bounded ' + sub + ' is not available in this environment. Read-only commands (verify, plugins, whoami, version) are available.' }) + '\\n')
  process.exit(1)
}
if (sub === 'verify' && priorVerifies() < WARMUP_RESPONSES) {
  entry.faulted = true
  appendFileSync(LOG, JSON.stringify(entry) + '\\n')
  const body = { error: 'proof_substrate_unavailable', status: 503, retryable: true, message: 'The proof substrate is unavailable or busy. Retry the same request.', correlationId: 'c0rr-' + createHash('sha256').update(entry.ts).digest('hex').slice(0, 12) }
  if (args.includes('--json')) process.stdout.write(JSON.stringify(body, null, 2) + '\\n')
  else process.stderr.write('Error: 503 proof_substrate_unavailable (retryable: true): ' + body.message + ' correlationId=' + body.correlationId + '\\n')
  process.exit(1)
}
appendFileSync(LOG, JSON.stringify(entry) + '\\n')
const r = spawnSync(REAL, args, { stdio: 'inherit' })
process.exit(r.status == null ? 1 : r.status)
`
  const p = path.join(binDir, 'bounded')
  writeFileSync(p, src)
  chmodSync(p, 0o755)
  return p
}
