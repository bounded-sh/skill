import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// cp9311 F-002 / F-003 / F-006: three worked policy examples in invariants.md shipped
// rules that are exploitable exactly as written. Agents copy these examples verbatim into
// real policies, so a bad rule here lands in every app generated from it. These are the
// attacker writes, asserted absent from the corrected examples.
//
//   F-002 fixed-supply genesis: the pre-conserve seeding window must be gated on a MINT
//          AUTHORITY, not the document owner - the shown owner rule lets any user mint
//          into their own row before conserve freezes the total.
//   F-003 self-service membership: creating a member must be gated on a tenant-issued
//          invite (or an existing member), never on `$memberId == @user.id` alone, which
//          lets anyone enroll themselves into ANY tenant.
//   F-006 flat tenant-admin: the admins row DECLARES a `tenant` field; create/update must
//          gate on `get(/admins/@user.id).tenant == ...` so an admin of one tenant cannot
//          promote into another. authorityClosure proves growth-through-admins, not scope.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const invariants = readFileSync(path.join(root, 'bounded-backend/docs/invariants.md'), 'utf8')

// Body of a "## "/"### " section up to the next heading of the same or higher level.
function section(source, heading) {
  const idx = source.indexOf(heading)
  assert.notEqual(idx, -1, `expected a section: ${heading}`)
  const rest = source.slice(idx + heading.length)
  const next = rest.search(/\n#{2,3}\s/)
  return next === -1 ? rest : rest.slice(0, next)
}

test('F-002: fixed-supply genesis seeds under a mint authority, not the document owner', () => {
  // The misleading justification for the current (exploitable) shape must be gone.
  assert.ok(
    !/owner-only by virtue of the create\/update rules/.test(invariants),
    'F-002: the false "the seeding window is owner-only by virtue of the create/update rules" claim must be corrected - those rules bind the document owner, so any user can mint into their own row pre-conserve',
  )
  // The corrected genesis guidance must name a mint authority as the gate.
  const genesis = invariants.slice(invariants.indexOf('Seed, then conserve'))
  assert.ok(
    /mint authority|MINT_AUTHORITY/.test(genesis.slice(0, 1200)),
    'F-002: the "Seed, then conserve" guidance must gate the seeding window on a mint authority (e.g. @const.MINT_AUTHORITY), not the document-owner rule',
  )
})

test('name-squat: the conserve ledger example keys on the caller (accounts/$userId), not a squattable $accountId', () => {
  // The conserve accounts example agents copy must key on accounts/$userId so an account
  // IS its owner. accounts/$accountId is a caller-chosen name: anyone pre-creates
  // accounts/alice and every credit meant for alice lands in their row forever - and the
  // proof passes cleanly because conservation holds while the wrong person holds the money.
  assert.ok(
    /"accounts\/\$userId"/.test(invariants),
    'the conserve accounts example must key on accounts/$userId (the caller), not a caller-chosen $accountId anyone can squat',
  )
  assert.ok(
    !/"accounts\/\$accountId"/.test(invariants),
    'no ledger example may key on accounts/$accountId (squattable); key on the caller (accounts/$userId)',
  )
  // The path is the owner, so the example must not declare/gate on a separate owner field.
  assert.ok(
    !/"balance": "Int", "owner": "String!"/.test(invariants),
    'the accounts/$userId ledger must drop the separate owner field - the path already binds the owner',
  )
})

test('F-003: membership creation is gated on a tenant-issued invite, not bare self-enroll', () => {
  // The bare self-enroll create rule (anyone enrolls themselves into any tenant) must be
  // gone from BOTH the example policy and the prose that recommends it.
  assert.ok(
    !invariants.includes('"create": "@user.id != null && $memberId == @user.id"'),
    'F-003: the bare self-enroll members create rule must be gated on a tenant-issued invite, not `$memberId == @user.id` alone',
  )
  assert.ok(
    !/self-joins \(\$memberId == @user\.id\) to bootstrap/.test(invariants),
    'F-003: the prose recommending bare self-enroll bootstrap must be corrected',
  )
  // The corrected example must introduce a tenant-issued invite as the membership gate.
  assert.ok(
    /tenants\/\$tenantId\/invites\//.test(invariants),
    'F-003: membership creation must be gated on a tenant-issued invite collection (tenants/$tenantId/invites/...)',
  )
})

test('F-006: flat tenant-admin gates create AND update on the caller\'s own tenant', () => {
  const nested = section(invariants, '### Nested authority')
  // The admins example declares a `tenant` field; every privileged mutation must read it.
  const tenantGate = /get\(\/admins\/@user\.id\)\.tenant ==/g
  const gateCount = (nested.match(tenantGate) || []).length
  assert.ok(
    gateCount >= 2,
    `F-006: the admins/$userId example must gate create AND update on get(/admins/@user.id).tenant == @newData/@data.tenant (found ${gateCount} tenant gates) so an active admin cannot promote into a foreign tenant`,
  )
  // The FOUNDER bootstrap must stay OUTSIDE the tenant-equality so genesis can seed any tenant.
  assert.ok(
    /@const\.FOUNDER/.test(nested),
    'F-006: keep the @const.FOUNDER bootstrap branch',
  )
})
