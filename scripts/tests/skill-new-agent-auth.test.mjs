import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// H008: a documented agent (kind: agent / onInvoke) is sealed with the app's
// secrets, services, queues and schedules, and the invocation runs NO policy
// auth rule - so every signed-in user of the app reaches it. The templates the
// agent docs teach must carry the same "signed in is not allowed" gate the
// backend fetch handler already carries, or a reader copies an unguarded agent.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(path.join(root, p), 'utf8')

test('H008: the onInvoke agent example gates on the verified caller before touching a secret', () => {
  const md = read('bounded-backend/docs/backend-runtime.md')
  const start = md.indexOf('async onInvoke(input, ctx)')
  assert.notEqual(start, -1, 'the onInvoke example must exist')
  const block = md.slice(start, md.indexOf('async onSchedule'))
  const gateAt = block.indexOf('!ctx.identity.user')
  const secretAt = block.indexOf('ctx.secrets.get')
  assert.ok(gateAt !== -1, 'onInvoke must fail closed on a missing verified caller (ctx.identity.user)')
  assert.ok(secretAt !== -1 && gateAt < secretAt, 'the caller gate must come BEFORE the first secret read')
  assert.match(block, /signed in.*not|not.*allowed|authorize WHO may run/i, 'the example must say being signed in is not being allowed')
})

test('H008: the Flue invoke docs add an authorization step over the sealed capabilities', () => {
  const md = read('bounded-backend/docs/agents-flue.md')
  const invoke = md.slice(md.indexOf('## Invoke'))
  assert.match(invoke, /env\.identity\.user/, 'the invoke section must show gating on env.identity.user')
  assert.match(invoke, /Authorize the caller|not.*the runtime|does \*\*not\*\* decide WHO/i, 'the invoke section must state authorization is the app author\'s job')
  assert.match(invoke, /env\.secrets.*env\.services.*env\.queue|not.*gated by policy/is, 'must note the sealed capabilities are not policy-gated')
})

test('H008: graduation docs correct "keep auth identity" reading as "auth handled"', () => {
  const md = read('bounded-backend/docs/functions-graduation.md')
  assert.match(md, /not "auth is handled"|authorizing WHO may invoke/i, 'must clarify that keeping auth identity is not per-caller authorization')
})
