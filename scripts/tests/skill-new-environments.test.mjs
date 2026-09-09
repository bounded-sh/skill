import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// H002: environments.md taught copying preview values into the base constants and
// called the base block "the production truth" for a bare deploy, so an agent
// produced the vulnerable shape by construction - a bare deploy to production
// shipping the staging admin wallet. These assert the corrected guidance.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const md = readFileSync(path.join(root, 'bounded-deploy/docs/environments.md'), 'utf8')

test('H002: the example base constants are not a copy of a deployed environment identity', () => {
  const start = md.indexOf('```json') + '```json'.length
  const ex = JSON.parse(md.slice(start, md.indexOf('```', start)))
  assert.notEqual(ex.constants.ADMIN, ex.environments.preview.constants.ADMIN, 'base ADMIN must not copy the preview admin wallet')
  assert.notEqual(ex.constants.ADMIN, ex.environments.production.constants.ADMIN, 'base ADMIN must not copy the production admin wallet')
})

test('H002: the page no longer calls the base block "the production truth" for a bare deploy', () => {
  assert.doesNotMatch(md, /by convention the production truth/, 'the dangerous framing must be gone')
  assert.match(md, /local-dev default/, 'the base block must be described as the local-dev default')
  assert.match(md, /fill it with a copy of any deployed environment/, 'must warn against putting a deployed env identity in the base block')
})

test('H002: derivation from the target app id is documented', () => {
  assert.match(md, /derives the environment from the target app id/, 'the derive-from-app-id behavior must be documented')
})
