import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// SKILL-H (DS2-0035/0039/0225): show the identity gate as part of each example.
//  1. backend-runtime.md fetch handler must REQUIRE ctx.identity (+ Boundaries note).
//  2. identity-and-logs.md runPayouts must gate on the owning identity, not auth:"true".
//  3. sdk-reference.md must resolve the customer SERVER-SIDE, not trust caller args.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

// Return the body of a "## <title>" (or "### <title>") section up to the next heading of same/higher level.
function section(source, heading) {
  const idx = source.indexOf(heading)
  assert.notEqual(idx, -1, `expected a section: ${heading}`)
  const rest = source.slice(idx + heading.length)
  const next = rest.search(/\n#{2,3}\s/)
  return next === -1 ? rest : rest.slice(0, next)
}

test('1: backend-runtime fetch handler gates on ctx.identity.user (fails closed, not open), and Boundaries mentions it', () => {
  const doc = read('bounded-backend/docs/backend-runtime.md')
  const fetchExample = section(doc, '## Agent Entry') // the fetch handler lives just after the agent entry
  assert.ok(
    /async fetch\(req, ctx\)/.test(fetchExample),
    'backend-runtime must show a kind:"backend" fetch handler',
  )
  // ctx.identity is ALWAYS a populated object in the shipping runtime, so a bare
  // `if (!ctx.identity)` gate never fires and FAILS OPEN. The acting user lives
  // in ctx.identity.user (the @user.id), which is absent/empty when unauthenticated.
  assert.ok(
    /!\s*ctx\.identity\.user/.test(fetchExample),
    'the fetch handler must gate on ctx.identity.user (the acting @user.id), which is absent for an unauthenticated caller',
  )
  assert.ok(
    !/if\s*\(\s*!\s*ctx\.identity\s*\)/.test(fetchExample),
    'the fetch handler must NOT gate on the bare !ctx.identity, which fails open (ctx.identity is always populated)',
  )
  const boundaries = section(doc, '## Boundaries')
  assert.ok(
    boundaries.includes('ctx.identity.user'),
    'the Boundaries section must call out gating public fetch handlers on ctx.identity.user',
  )
  // The doc must not repeat the false claim that ctx.identity is null when unauthenticated.
  assert.ok(
    !/ctx\.identity`?\s+is\s+null/i.test(doc),
    'the doc must not claim ctx.identity is null for an unauthenticated request (it is always a populated object)',
  )
})

test('2: runPayouts gates on the owning identity, not open auth:"true"', () => {
  const doc = read('bounded-backend/docs/identity-and-logs.md')
  const idx = doc.indexOf('"runPayouts"')
  assert.notEqual(idx, -1, 'identity-and-logs must document the runPayouts example')
  const block = doc.slice(idx, idx + 400)
  assert.ok(
    !/"auth":\s*"true"/.test(block),
    'a payout function must not use the open auth:"true" invoke rule',
  )
  assert.ok(
    /__managers__|__owners__/.test(block),
    'runPayouts auth must gate on the owning identity (managers/owners)',
  )
})

test('3: sdk-reference resolves the customer server-side with an untrusted-argument warning', () => {
  const doc = read('bounded-frontend/docs/sdk-reference.md')
  const invoke = section(doc, '### Invoking a function')
  assert.ok(
    /untrusted/i.test(invoke),
    'the invoke section must warn that caller-supplied arguments are untrusted',
  )
  assert.ok(
    /ctx\.(user|identity)/.test(invoke),
    'the invoke section must demonstrate SERVER-SIDE resolution of the customer from the authenticated identity',
  )
  // ctx.user is ALWAYS an object - a system principal is { id: null, ..., system: true } -
  // so `if (!ctx.user)` is the same fail-open shape this batch removed for ctx.identity.
  assert.ok(
    !/if\s*\(\s*!\s*ctx\.user\s*\)/.test(doc),
    'no example may gate on the bare !ctx.user, which never fires (ctx.user is always populated)',
  )
  assert.ok(
    /!\s*ctx\.user\?\.id/.test(invoke),
    'the invoke example must gate on ctx.user?.id, the field that is null for a non-human principal',
  )
})

test('4: functions.md describes the system principal as an object with a null id, not a null ctx.user', () => {
  // The runtime hands a queued/scheduled run { id: null, ..., system: true }; docs that
  // say `ctx.user == null` teach exactly the fail-open gate above.
  const doc = read('bounded-backend/docs/functions.md')
  assert.ok(
    !/ctx\.user\s*==\s*null/.test(doc),
    'functions.md must not claim ctx.user is null on a queued/system run',
  )
  assert.ok(
    /ctx\.user\.id\s*==\s*null/.test(doc),
    'functions.md must describe the system principal as ctx.user.id == null',
  )
})
