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
        if (arg.signer !== true) continue
        assert.ok(arg.forms?.length, `${fn.callName}.${arg.name}: signer arg with no accepted-forms classification`)
      }
      if (fn.args.some((a) => a.signer)) {
        assert.ok(page.includes('custody-and-pdas.md'), `${ns.namespace}.md: signing functions must link the custody guide`)
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

test('address and signer metadata is explicit and never inferred from prose', () => {
  const extractor = readFileSync(path.join(root, 'scripts/extract-plugin-catalog.mjs'), 'utf8')
  assert.ok(!extractor.includes('classifyForms'), 'extractor still classifies forms from descriptions')

  const validForms = new Set(['wallet', 'escrow-sentinel', 'account-id', 'pubkey', 'account-id-only'])
  for (const fn of allFunctions) {
    for (const arg of fn.args) {
      if (arg.forms) {
        assert.equal(typeof arg.signer, 'boolean', `${fn.callName}.${arg.name}: forms need explicit signer metadata`)
        assert.ok(['string', 'address'].includes(arg.type), `${fn.callName}.${arg.name}: non-address arg carries top-level forms`)
        for (const form of arg.forms) assert.ok(validForms.has(form), `${fn.callName}.${arg.name}: unknown form ${form}`)
      }
      if (arg.signer === true) assert.ok(arg.forms?.length, `${fn.callName}.${arg.name}: signer has no forms`)
      for (const [fieldName, field] of Object.entries(arg.fields ?? {})) {
        if (!field.forms) continue
        assert.equal(field.type, 'string', `${fn.callName}.${arg.name}.${fieldName}: forms require string field`)
        assert.equal(typeof field.signer, 'boolean', `${fn.callName}.${arg.name}.${fieldName}: signer must be explicit`)
      }
    }
  }

  const create2022 = allFunctions.find((fn) => fn.callName === '@TokenPlugin.createToken2022')
  const extensions = create2022.args.find((arg) => arg.name === 'extensions')
  assert.equal(extensions.forms, null, 'Token-2022 extensions object must not inherit nested address forms')
  for (const field of ['transferFeeAuthority', 'withdrawWithheldAuthority', 'interestRateAuthority', 'permanentDelegate']) {
    assert.deepEqual(extensions.fields[field].forms, ['wallet', 'escrow-sentinel', 'account-id'])
    assert.equal(extensions.fields[field].signer, false)
  }
})

test('generated custody prose is function-specific and has no fallback signer claim', () => {
  const index = readFileSync(path.join(root, 'bounded-onchain/docs/plugins.md'), 'utf8')
  assert.ok(index.includes('Custody forms are function-specific.'))
  assert.ok(!index.includes('Custody rule for every'))

  const pages = catalog.namespaces.map((ns) =>
    readFileSync(path.join(root, `bounded-onchain/docs/plugins/${ns.namespace}.md`), 'utf8'))
  const combined = pages.join('\n')
  assert.ok(!combined.includes('The manifest does not declare signer metadata'))

  const token = readFileSync(path.join(root, 'bounded-onchain/docs/plugins/TokenPlugin.md'), 'utf8')
  assert.match(token, /`destinationAddress`[^\n]+\| no \|/)
  assert.ok(!token.includes('`destinationAddress` signs:'))
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
