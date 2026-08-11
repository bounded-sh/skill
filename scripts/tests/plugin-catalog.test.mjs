// Contract tests for the generated plugin reference layer (catalog snapshot + pages).
//
// These run without the monorepo: they prove the PUBLISHED artifacts are internally
// consistent - snapshot <-> generated pages <-> capability table. Cross-repo drift
// (manifests changing under us) is caught maintainer-side by
// `node scripts/extract-plugin-catalog.mjs --check` before push.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const catalog = JSON.parse(readFileSync(path.join(root, 'bounded-onchain/data/plugin-catalog.json'), 'utf8'))
const allFunctions = catalog.namespaces.flatMap((ns) => ns.functions)

test('generated pages match the snapshot byte for byte', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/generate-plugin-catalog.mjs'), '--check'], { encoding: 'utf8' })
  assert.equal(result.status, 0, `generator --check failed:\n${result.stdout}${result.stderr}`)
})

test('snapshot covers the full capability inventory in both directions', () => {
  const source = readFileSync(path.join(root, 'bounded-onchain/docs/solana-capability-status.md'), 'utf8')
  const inventory = source.split('## Function inventory')[1]?.split('## Built-in values')[0] ?? ''
  const tableIds = [...inventory.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1].trim())
  const snapshotIds = new Set([
    ...allFunctions.map((fn) => fn.callName),
    ...catalog.capabilityOnly.map((row) => row.callName),
  ])
  const missingFromSnapshot = tableIds.filter((id) => !snapshotIds.has(id))
  assert.deepEqual(missingFromSnapshot, [], 'capability rows absent from the catalog snapshot')
  const missingFromTable = allFunctions.filter((fn) => !fn.status).map((fn) => fn.callName)
  assert.deepEqual(missingFromTable, [], 'manifest functions with no capability-table row')
  assert.equal(tableIds.length, snapshotIds.size, 'catalog and capability table must be the same inventory')
})

test('snapshot status matches the capability table row for row', () => {
  const source = readFileSync(path.join(root, 'bounded-onchain/docs/solana-capability-status.md'), 'utf8')
  for (const fn of allFunctions) {
    const escaped = fn.callName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const row = source.match(new RegExp(`^\\| \`${escaped}\` \\| [^|]+ \\| ([^|]+) \\|`, 'm'))
    assert.ok(row, `capability row missing for ${fn.callName}`)
    assert.equal(fn.status.support, row[1].trim(), `stale support state cached for ${fn.callName}`)
  }
})

test('every signer argument has classified accepted forms and page-level custody guidance', () => {
  for (const ns of catalog.namespaces) {
    const page = readFileSync(path.join(root, `bounded-onchain/docs/plugins/${ns.namespace}.md`), 'utf8')
    for (const fn of ns.functions) {
      for (const arg of fn.args) {
        if (!arg.signer) continue
        assert.ok(arg.forms?.length, `${fn.callName}.${arg.name}: signer arg with no accepted-forms classification`)
      }
      if (fn.args.some((a) => a.signer)) {
        assert.ok(page.includes('custody-and-pdas.md'), `${ns.namespace}.md: signing functions must link the custody guide`)
      }
    }
  }
})

test('the index lists every callable function and every capability-only row', () => {
  const index = readFileSync(path.join(root, 'bounded-onchain/docs/plugins.md'), 'utf8')
  for (const fn of allFunctions) {
    assert.ok(index.includes(fn.usage), `plugins.md missing signature for ${fn.callName}`)
  }
  for (const row of catalog.capabilityOnly) {
    assert.ok(index.includes(`\`${row.callName}\``), `plugins.md missing capability-only row ${row.callName}`)
  }
})

test('generated output carries no internal naming or em dashes', () => {
  const pages = ['bounded-onchain/docs/plugins.md',
    ...catalog.namespaces.map((ns) => `bounded-onchain/docs/plugins/${ns.namespace}.md`)]
  for (const rel of pages) {
    const text = readFileSync(path.join(root, rel), 'utf8')
    assert.ok(!/tarobase/i.test(text), `${rel}: internal program naming leaked`)
    assert.ok(!text.includes('—'), `${rel}: em dash present`)
  }
  const snapshot = readFileSync(path.join(root, 'bounded-onchain/data/plugin-catalog.json'), 'utf8')
  assert.ok(!/tarobase/i.test(snapshot), 'snapshot: internal program naming leaked')
})

test('custody guide states the resolver rule and the three models', () => {
  const guide = readFileSync(path.join(root, 'bounded-onchain/docs/custody-and-pdas.md'), 'utf8')
  for (const expected of [
    'does not parse as a pubkey',
    'idempotent',
    'The id namespace is app-global.',
    'Ids must not parse as a pubkey.',
    'The id string is the signing capability.',
    '@TokenPlugin.getBalance($marketId, @TokenPlugin.SOL) >= @newData.payout',
    'hooks.onchain',
  ]) {
    assert.ok(guide.includes(expected), `custody guide missing: ${expected}`)
  }
})
