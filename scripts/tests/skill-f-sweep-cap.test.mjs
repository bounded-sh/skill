import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// SKILL-F (DS2-0235, bounded-skill half): the scheduled-sweeps sample must cap the
// dirty read the same way its sibling sweep is capped by SWEEP_LIMIT, instead of
// reading the whole dirty collection unbounded via readAll.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const doc = readFileSync(path.join(root, 'bounded-backend/docs/scheduled-sweeps.md'), 'utf8')

test('sweep sample does not read the dirty collection unbounded', () => {
  assert.ok(
    !/readAll\(ctx,\s*["']dirty["']\)/.test(doc),
    'the dirty input must not be read unbounded via readAll(ctx, "dirty")',
  )
})

test('dirty read is capped by SWEEP_LIMIT like its sibling sweep', () => {
  assert.ok(
    /get\(\s*["']dirty["'][\s\S]{0,160}?limit:\s*SWEEP_LIMIT/.test(doc),
    'the dirty read must be a bounded page with limit: SWEEP_LIMIT, matching the sweep sibling',
  )
})

test('no input to one pass is read until the cursor is exhausted', () => {
  // A read-until-exhausted helper lets a burst decide how much work one invocation
  // does, which is the same unbounded-read failure as the dirty scan.
  assert.ok(
    !/nextCursor \|\| undefined;?\s*\n\s*\} while \(cursor\)/.test(doc),
    'the sample must not loop a read until the cursor is exhausted',
  )
  assert.ok(
    !/readAll\(/.test(doc),
    'the sample must not offer a read-everything helper for pass inputs',
  )
  assert.ok(
    /readPage\(ctx,\s*["']launches["']/.test(doc),
    'the due-row queries must go through the page-read helper',
  )
  assert.ok(
    /async function readPage\([\s\S]{0,200}?limit:\s*SWEEP_LIMIT/.test(doc),
    'the page-read helper must cap every read at SWEEP_LIMIT',
  )
})
