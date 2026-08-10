import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// SKILL-G (DS2-0216/0400, bounded-skill halves): add containment/narrowing checks.
//  1. scripts/validate.mjs must contain resolved link targets to the project root.
//  2. bounded-deploy/docs/domains.md frame-ancestors must not include the
//     https://*.bounded.page wildcard (cross-app framing hole re-added since audit).
//  3. building-for-react-native.md must document encrypted device storage + keychain.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('1: validate.mjs guards resolved link targets against project-root escape', async () => {
  // (a) validate.mjs applies a containment guard before touching the filesystem.
  const src = readFileSync(path.join(root, 'scripts/validate.mjs'), 'utf8')
  const guardIdx = src.indexOf('isWithinRoot(')
  const fsIdx = src.indexOf('existsSync(targetPath)')
  assert.notEqual(guardIdx, -1, 'validate.mjs must apply a project-root containment guard on resolved targets')
  assert.notEqual(fsIdx, -1, 'validate.mjs must resolve link targets')
  assert.ok(guardIdx < fsIdx, 'the containment guard must run before any filesystem access on the resolved target')

  // (b) the pure guard actually rejects a traversal path and accepts an in-root path.
  const { isWithinRoot } = await import('../lib/contained-path.mjs')
  assert.equal(isWithinRoot(root, path.join(root, 'bounded-onchain/docs/onchain.md')), true)
  assert.equal(isWithinRoot(root, path.resolve(root, '../../../../etc/passwd')), false)
  assert.equal(isWithinRoot(root, '/etc/passwd'), false)
})

test('2: domains frame-ancestors does not include the *.bounded.page wildcard', () => {
  const doc = readFileSync(path.join(root, 'bounded-deploy/docs/domains.md'), 'utf8')
  const start = doc.indexOf('Content-Security-Policy: frame-ancestors')
  assert.notEqual(start, -1, 'domains.md must document the frame-ancestors header')
  const fenceEnd = doc.indexOf('```', start)
  const directive = doc.slice(start, fenceEnd === -1 ? undefined : fenceEnd)
  assert.ok(
    !directive.includes('*.bounded.page'),
    'frame-ancestors must be narrowed to specific hosts, not the *.bounded.page wildcard',
  )
})

test('3: React Native guide documents encrypted device storage + keychain', () => {
  const doc = readFileSync(path.join(root, 'bounded-frontend/docs/building-for-react-native.md'), 'utf8')
  assert.ok(/encrypt/i.test(doc), 'RN guide must document encrypting the on-device session store')
  assert.ok(
    /keychain|keystore/i.test(doc),
    'RN guide must document holding the encryption key in the OS Keychain/Keystore',
  )
})
