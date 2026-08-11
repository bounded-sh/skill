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

test('snapshot preserves only signer markers declared by existing manifests', () => {
  const byCall = new Map(allFunctions.map((fn) => [fn.callName, fn]))
  const signer = (callName, argName) =>
    byCall.get(callName)?.args.find((arg) => arg.name === argName)?.signer

  assert.equal(signer('@TokenPlugin.transfer', 'sourceAddress'), true)
  assert.equal(signer('@CPI.memoNote', 'source'), true)
  assert.equal(signer('@CPI.dlmmSwap', 'source'), null)
  assert.equal(signer('@PumpFunPlugin.createToken', 'creator'), null)

  for (const fn of allFunctions) {
    for (const arg of fn.args) {
      assert.ok(arg.signer === true || arg.signer === false || arg.signer === null,
        `${fn.callName}.${arg.name}: invalid signer marker`)
      assert.ok(!Object.hasOwn(arg, 'forms'), `${fn.callName}.${arg.name}: synthetic accepted forms leaked into catalog`)
      for (const [fieldName, field] of Object.entries(arg.fields ?? {})) {
        assert.ok(!Object.hasOwn(field, 'forms'),
          `${fn.callName}.${arg.name}.${fieldName}: synthetic accepted forms leaked into catalog`)
      }
    }
  }
})

test('execution contexts match the production plane matrix', () => {
  const byCall = new Map(allFunctions.map((fn) => [fn.callName, fn]))
  const contexts = (callName) => byCall.get(callName)?.contexts

  const offchainOnly = allFunctions.filter((fn) => fn.isOnlyOffchain)
  assert.equal(offchainOnly.length, 11, 'offchain-only manifest inventory changed')
  for (const fn of offchainOnly) {
    const expected = fn.category === 'transactional'
      ? ['offchain.hooks']
      : ['offchain.rules', 'offchain.queries']
    assert.deepEqual(fn.contexts, expected, `${fn.callName}: wrong production contexts`)
  }

  for (const callName of [
    '@DeFiPlugin.getMeteoraSwapQuote',
    '@DeFiPlugin.getSwapQuote',
    '@DflowPlugin.getKycStatus',
    '@PhoenixPerpsPlugin.getPortfolioValue',
    '@PhoenixPerpsPlugin.getPositionSize',
  ]) {
    assert.deepEqual(
      contexts(callName),
      ['offchain.rules', 'offchain.queries'],
      `${callName}: offchain-only reads must never be rendered as offchain hooks`,
    )
  }

  assert.deepEqual(contexts('@DocumentPlugin.putDocument'), ['offchain.hooks'])
  assert.deepEqual(contexts('@DocumentPlugin.updateField'), ['onchain.hooks', 'offchain.hooks'])
  assert.deepEqual(contexts('@TokenPlugin.transfer'), ['onchain.hooks'])
  assert.deepEqual(contexts('@TokenPlugin.getBalance'), [
    'onchain.rules', 'onchain.queries', 'onchain.hooks', 'offchain.rules', 'offchain.queries',
  ])
  assert.deepEqual(contexts('@StringUtils.length'), [
    'onchain.rules', 'onchain.queries', 'onchain.hooks',
    'offchain.rules', 'offchain.queries', 'offchain.hooks',
  ])
})

test('extractor does not load or infer an argument-contract overlay', () => {
  const extractor = readFileSync(path.join(root, 'scripts/extract-plugin-catalog.mjs'), 'utf8')
  assert.ok(!extractor.includes('classifyForms'), 'extractor still classifies forms from descriptions')
  assert.ok(!extractor.includes('plugin-argument-contracts'), 'extractor still imports the removed overlay')
  assert.ok(!extractor.includes('acceptedForms'), 'extractor still consumes synthetic accepted-form metadata')
})

test('generated pages distinguish declared signers from missing metadata', () => {
  const index = readFileSync(path.join(root, 'bounded-onchain/docs/plugins.md'), 'utf8')
  assert.ok(index.includes('signer markers come directly from existing monorepo manifests'))
  assert.ok(index.includes('means the manifest makes no claim'))

  const pages = catalog.namespaces.map((ns) =>
    readFileSync(path.join(root, `bounded-onchain/docs/plugins/${ns.namespace}.md`), 'utf8'))
  const combined = pages.join('\n')
  assert.ok(!combined.includes('| Signs |'))
  assert.ok(!combined.includes('| Accepts |'))
  assert.ok(!combined.includes('a wallet form requires that wallet\'s signature'))

  const token = readFileSync(path.join(root, 'bounded-onchain/docs/plugins/TokenPlugin.md'), 'utf8')
  assert.match(token, /`sourceAddress`[^\n]+\| \*\*yes\*\* \|/)
  assert.match(token, /`destinationAddress`[^\n]+\| - \|/)
})

test('the index lists every callable function and every capability-only row', () => {
  const index = readFileSync(path.join(root, 'bounded-onchain/docs/plugins.md'), 'utf8')
  const signatures = readFileSync(path.join(root, 'bounded-onchain/docs/plugin-signatures.md'), 'utf8')
  for (const fn of allFunctions) {
    assert.ok(index.includes(`\`${fn.name}\``), `plugins.md missing function router entry for ${fn.callName}`)
    assert.ok(signatures.includes(`\`${fn.callName}\``), `plugin-signatures.md missing ${fn.callName}`)
    assert.ok(signatures.includes(`\`${fn.signature}\``), `plugin-signatures.md missing signature for ${fn.callName}`)
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
