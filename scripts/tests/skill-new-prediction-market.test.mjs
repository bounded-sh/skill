import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// H004 + H005: the prediction-market example is a complete, copyable policy that
// was exploitable as written. H004 - creator resolution had no expiry gate and a
// zero-winner sweep could fire immediately, so a creator could resolve against
// their only trader and sweep the pot. H005 - the sell rule and hook read with
// get(), so two distinct sell paths in one batch each saw committed pre-batch
// state and both paid out, selling one position twice. These assert the fixes on
// the single-source-of-truth policy embedded in the page.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const page = readFileSync(path.join(root, 'bounded-onchain/docs/examples/prediction-market-amm.md'), 'utf8')
const policy = JSON.parse(page.match(/## Policy\s*```json\s*([\s\S]*?)```/)[1])

const resolveRule = policy['pmResolves/$marketId'].rules.create
const sweepRule = policy['pmWithdrawals/$marketId'].rules.create
const sell = policy['pmPositions/$marketId/holders/$holderId/sells/$orderId']
const sellRule = sell.rules.create
const sellHook = sell.hooks.onchain.create

test('H004: resolution is gated to [expiry, expiry + claimWindow]', () => {
  assert.match(
    resolveRule,
    /@time\.now >= get\(\/pmMarkets\/\$marketId\)\.expiryTs/,
    'resolve must require that expiry has passed, or a creator resolves early against a live market',
  )
  assert.match(
    resolveRule,
    /@time\.now <= get\(\/pmMarkets\/\$marketId\)\.expiryTs \+ get\(\/pmMarkets\/\$marketId\)\.claimWindowSec/,
    'resolve must be refused after the claim window closes, or a late resolution time-bars redemptions then sweeps',
  )
})

test('H004: the creator sweep requires the claim window fully closed, with no zero-winner shortcut', () => {
  assert.match(
    sweepRule,
    /@time\.now > get\(\/pmMarkets\/\$marketId\)\.expiryTs \+ get\(\/pmMarkets\/\$marketId\)\.claimWindowSec/,
    'sweep must require the claim window to have closed',
  )
  assert.doesNotMatch(
    sweepRule,
    /winningSupply == 0/,
    'the winningSupply == 0 sweep shortcut must be gone - a NO resolution sets it to 0 and would let the sweep race a live market',
  )
})

test('H005: the sell rule and hook read the mutable balance and reserve with getAfter', () => {
  assert.match(
    sellRule,
    /getAfter\(\/pmPositions\/\$marketId\/holders\/\$holderId\)\.yesBalance >= @newData\.yesIn/,
    'the sell balance gate must use getAfter so a second sell in the same batch sees the first sell staged',
  )
  assert.match(
    sellRule,
    /getAfter\(\/pmMarkets\/\$marketId\)\.collateralReserve/,
    'the sell quote must read the reserve with getAfter',
  )
  assert.match(
    sellHook,
    /getAfter\(\/pmPositions\/\$marketId\/holders\/\$holderId\)\.yesBalance - @newData\.yesIn/,
    'the sell hook must decrement from the getAfter balance',
  )
  // The mutable reserve/supply and the position balance must never be read with a
  // plain get() on the sell path (getAfter(...) does NOT contain the substring get(...)).
  for (const src of [sellRule, sellHook]) {
    assert.doesNotMatch(src, /get\(\/pmMarkets\/\$marketId\)\.collateralReserve/, 'sell path must not read reserve with plain get()')
    assert.doesNotMatch(src, /get\(\/pmMarkets\/\$marketId\)\.yesSupply/, 'sell path must not read yesSupply with plain get()')
    assert.doesNotMatch(src, /get\(\/pmPositions\/\$marketId\/holders\/\$holderId\)\.yesBalance/, 'sell path must not read yesBalance with plain get()')
  }
})

test('H005: the prose no longer presents a duplicate sell as acceptable', () => {
  assert.doesNotMatch(
    page,
    /but sells can, which is why sell payouts are AMM-priced against the reserve/,
    'the old text defending duplicate sells as intended must be removed',
  )
  assert.match(
    page,
    /if two writes in one batch could both spend the same balance, read it with `getAfter`/,
    'the getAfter rule of thumb must be taught',
  )
})
