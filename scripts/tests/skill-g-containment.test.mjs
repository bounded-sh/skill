import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// SKILL-G (DS2-0216/0400, bounded-skill halves): add containment/narrowing checks.
//  1. scripts/validate.mjs must contain resolved link targets to the project root.
//  2. bounded-deploy/docs/domains.md must document the frame-ancestors default the
//     router actually emits (wildcard included) AND the app-level narrowing lever,
//     rather than describing a narrowing this repo does not own and does not ship.
//  3. building-for-react-native.md must document encrypted device storage + keychain,
//     with an encryption key MMKV can actually accept.

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

test('2: domains documents the frame-ancestors default as shipped, plus how an app narrows it', () => {
  const doc = readFileSync(path.join(root, 'bounded-deploy/docs/domains.md'), 'utf8')
  const start = doc.indexOf('Content-Security-Policy: frame-ancestors')
  assert.notEqual(start, -1, 'domains.md must document the frame-ancestors header')
  const fenceEnd = doc.indexOf('```', start)
  const directive = doc.slice(start, fenceEnd === -1 ? undefined : fenceEnd)
  // bounded-monorepo's router owns this header and its platform default carries the
  // wildcard. Documenting a narrower list here would tell app authors that sibling
  // apps cannot frame them, which is the dangerous direction to be wrong in.
  for (const host of ['https://oapps.fun', 'https://*.oapps.fun', 'https://bounded.page', 'https://*.bounded.page']) {
    assert.ok(directive.includes(host), `the documented default must match the router's list: ${host}`)
  }
  // ...and the wildcard must be called out as reachable by other apps, with the
  // app-owned way to narrow it (boundaries.browser.embeddedBy REPLACES the default).
  assert.ok(
    /any OTHER Bounded app/.test(doc),
    'the doc must state that another Bounded app on *.bounded.page may frame the page',
  )
  assert.ok(
    /embeddedBy/.test(doc) && /REPLACES/.test(doc),
    'the doc must point at boundaries.browser.embeddedBy and say the declared list replaces the default',
  )
})

test('3: React Native guide documents encrypted device storage + keychain', () => {
  const doc = readFileSync(path.join(root, 'bounded-frontend/docs/building-for-react-native.md'), 'utf8')
  assert.ok(/encrypt/i.test(doc), 'RN guide must document encrypting the on-device session store')
  assert.ok(
    /keychain|keystore/i.test(doc),
    'RN guide must document holding the encryption key in the OS Keychain/Keystore',
  )
  // react-native-mmkv rejects an encryptionKey longer than 16 BYTES, so a 32-byte
  // key rendered as 64 hex chars throws and the store never opens - the sample would
  // read as at-rest encryption while shipping no working store at all.
  assert.ok(
    !/getRandomBytes\(32\)/.test(doc),
    'the MMKV encryption key must not be built from 32 bytes (over MMKV\'s 16-byte ceiling)',
  )
  assert.ok(
    !/toString\(16\)/.test(doc),
    'a hex rendering doubles the key length in bytes; keep the key within 16 bytes',
  )
  assert.ok(
    /encryptionKey/.test(doc) && /16 bytes/.test(doc),
    'the RN guide must state MMKV\'s 16-byte encryptionKey ceiling next to the sample',
  )
  // The store adapter is consumed synchronously by setPlatform/configure, so an
  // async opener cannot be dropped in where createMMKV() was.
  assert.ok(
    !/async function openEncryptedStore/.test(doc),
    'the encrypted-store opener must be synchronous, like the createMMKV() call it replaces',
  )
})
