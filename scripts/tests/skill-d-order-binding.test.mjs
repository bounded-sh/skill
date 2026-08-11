import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// SKILL-D (DS2-0036/0037/0217): settlement must bind to a SERVER-CREATED order.
// Card checkout must fix amount/currency/item server-side and settlement must
// COMPARE the provider's paid session to that server order before releasing value.
// Crypto accept must show a per-order reference binding, not defer it.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pay = readFileSync(path.join(root, 'bounded-onchain/docs/bounded-pay.md'), 'utf8')
const crypto = readFileSync(path.join(root, 'bounded-onchain/docs/accept-crypto.md'), 'utf8')

function settlementSection(source) {
  const start = source.indexOf('Settlement:')
  assert.notEqual(start, -1, 'bounded-pay.md must have a Settlement section')
  const rest = source.slice(start)
  const nextHeading = rest.indexOf('\n## ')
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading)
}

test('bounded-pay settlement compares the paid session to a server-created order', () => {
  const settlement = settlementSection(pay)
  assert.ok(
    /session\.paid/.test(settlement),
    'settlement should still check the provider paid flag',
  )
  assert.ok(
    settlement.includes('order.amount') && settlement.includes('order.currency'),
    'settlement must COMPARE the paid session amount/currency to the server order, not settle on session.paid alone',
  )
  // GET /connect/session returns gross/fee/net, never `amount`. Comparing
  // session.amount compares undefined and refuses every real paid session, so the
  // snippet reads as a working guard while being copy-paste broken.
  assert.ok(
    /session\.gross\s*!==\s*order\.amount/.test(settlement),
    'settlement must compare the paid amount as session.gross (the field /connect/session actually returns)',
  )
  assert.ok(
    !/session\.amount/.test(settlement),
    'session.amount does not exist on the /connect/session response',
  )
  // The cs_... id is a bearer capability: bind the session to the order's buyer so a
  // leaked id cannot be settled into somebody else's account.
  assert.ok(
    /session\.buyer\s*!==\s*order\.buyer/.test(settlement),
    'settlement must bind the paid session to the order buyer',
  )
})

test('bounded-pay checkout fixes amount/currency/item server-side in an order', () => {
  assert.ok(
    pay.includes('server-fixed'),
    'checkout must derive amount/currency from a server-fixed order, not client input',
  )
  assert.ok(
    pay.includes('orders/${sessionId}'),
    'a server order must be persisted keyed by the checkout sessionId',
  )
})

test('accept-crypto shows a per-order reference binding instead of deferring it', () => {
  assert.ok(
    !/not yet implemented/i.test(crypto),
    'per-order binding must no longer be documented as "tracked and not yet implemented"',
  )
  assert.ok(
    /per-order reference/i.test(crypto),
    'accept-crypto must show the per-order reference binding pattern in an example',
  )
  // /verify is what settles the intent and burns the signature globally, so the
  // reference must be checked BEFORE it: verifying first can bind another order's
  // payment to this intent and leave the real payer with signature_already_used.
  const referenceCheck = crypto.indexOf('carriesReference')
  const verifyCall = crypto.indexOf('/verify`, {')
  assert.notEqual(referenceCheck, -1, 'accept-crypto must check the order reference in the example')
  assert.notEqual(verifyCall, -1, 'accept-crypto must show the /verify call in the example')
  assert.ok(
    referenceCheck < verifyCall,
    'the per-order reference must be checked BEFORE calling /verify, which consumes the signature',
  )
})
