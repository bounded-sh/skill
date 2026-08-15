// O(1) lookup contract: an agent with a concrete task must reach the ONE page that
// answers it via a router row (or the quick path), and the pages sized for always-in
// context must stay small enough to be loaded without crowding it.
//
// These fixtures are the regression net for the documentation architecture itself:
// if a router row is dropped or a compact index balloons, this fails before push.

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

test('all pre-reorganization router destinations remain directly reachable', () => {
  const baseline = JSON.parse(read('scripts/router-baseline.json'))
  assert.equal(baseline['bounded-backend/SKILL.md'].length, 36)
  assert.equal(baseline['bounded-onchain/SKILL.md'].length, 12)
  for (const [router, targets] of Object.entries(baseline)) {
    const source = read(router)
    for (const target of targets) {
      assert.ok(source.includes(`](${target}`), `${router}: lost baseline route ${target}`)
      assert.ok(existsSync(path.resolve(path.dirname(path.join(root, router)), target)), `${router}: missing ${target}`)
    }
  }
})

test('high-value pre-reorganization guidance remains at full fidelity', () => {
  const trading = read('bounded-onchain/docs/onchain-trading.md')
  for (const expected of [
    '`@DeFiPlugin.getMeteoraSwapQuote` is offchain-only',
    'quote in a function or on the client',
    'write the resulting minimum as a document field',
    'have `rules` constrain it',
    'The Phoenix read helpers are offchain-only source functions',
    'currently unsupported on devnet',
  ]) {
    assert.ok(trading.includes(expected), `onchain-trading.md lost guidance: ${expected}`)
  }
  assert.ok(!trading.includes('every documented plugin `source`/owner argument'))
  assert.ok(trading.includes("only when that function's existing manifest description lists"))

  const onchainSkill = read('bounded-onchain/SKILL.md')
  assert.ok(onchainSkill.includes('Do not recommend an `onchain: false` view for an offchain-only plugin read'))
  assert.ok(onchainSkill.includes('discovery, deployed-runtime support, and live-network verification as three independent states'))

  const custody = read('bounded-onchain/docs/custody-and-pdas.md')
  assert.ok(custody.includes('validator statically rejects `@AccountPlugin.getAccountAddress(id)` in signer-position arguments'))
  assert.ok(custody.includes('The id string is the signing capability.'))
})

// task keywords -> the router file that must map them -> the one target page.
// Keywords must appear in the SAME router row (a single table line) as the link.
const FIXTURES = [
  // custody / PDA class (the CCA failure class)
  { router: 'bounded-onchain/SKILL.md', keywords: ['custody', 'named PDA'], target: 'docs/custody-and-pdas.md' },
  { router: 'bounded-onchain/SKILL.md', keywords: ['signature', 'manifest argument'], target: 'docs/plugins.md' },
  { router: 'bounded-onchain/SKILL.md', keywords: ['escrow', 'vault', 'treasury'], target: 'docs/examples.md' },
  { router: 'bounded-onchain/SKILL.md', keywords: ['rent', 'transaction limits'], target: 'docs/onchain-troubleshooting.md' },
  { router: 'bounded-onchain/SKILL.md', keywords: ['Auction', 'permissionless crank', 'lazy claim'], target: 'docs/policy-native-state-machines.md' },
  { router: 'bounded-onchain/SKILL.md', keywords: ['Randomness', 'VRF'], target: 'docs/randomness.md' },
  { router: 'bounded-onchain/SKILL.md', keywords: ['Pump.fun'], target: 'docs/pump-fun.md' },
  // policy authoring class
  { router: 'bounded-backend/SKILL.md', keywords: ['field types', 'operators'], target: 'docs/policy-cheat-sheet.md' },
  { router: 'bounded-backend/SKILL.md', keywords: ['owner-only', 'membership'], target: 'docs/access-patterns.md' },
  { router: 'bounded-backend/SKILL.md', keywords: ['examples by intent'], target: 'docs/examples.md' },
  { router: 'bounded-backend/SKILL.md', keywords: ['rollingSum', 'conserve'], target: 'docs/invariants.md' },
  { router: 'bounded-backend/SKILL.md', keywords: ['Queries', 'pagination'], target: 'docs/queries.md' },
]

test('every task fixture resolves through one router row to one existing page', () => {
  for (const { router, keywords, target } of FIXTURES) {
    const rows = read(router).split('\n').filter((line) => line.startsWith('|'))
    const hit = rows.filter((line) =>
      keywords.every((k) => line.toLowerCase().includes(k.toLowerCase()))
      && line.includes(`(${target})`))
    assert.equal(hit.length, 1,
      `${router}: expected exactly one row matching ${JSON.stringify(keywords)} -> ${target}, found ${hit.length}`)
    assert.ok(existsSync(path.join(root, path.dirname(router), target)), `${target} missing`)
  }
})

// Compact layers must stay compact: these are the pages meant to be loaded
// speculatively, so their size is part of their contract.
const BUDGETS = [
  ['bounded-backend/docs/quick-path.md', 30],
  ['bounded-backend/docs/policy-cheat-sheet.md', 110],
  ['bounded-onchain/docs/examples.md', 40],
  ['bounded-backend/docs/examples.md', 25],
  ['bounded-onchain/docs/plugins.md', 80],
  ['bounded-onchain/docs/custody-and-pdas.md', 120],
]

test('compact-layer pages stay within their line budgets', () => {
  for (const [rel, budget] of BUDGETS) {
    const lines = read(rel).split('\n').length
    assert.ok(lines <= budget, `${rel}: ${lines} lines exceeds its ${budget}-line budget`)
  }
})

test('policy-native financial state-machine guidance retains its cross-layer safety contract', () => {
  const page = read('bounded-onchain/docs/policy-native-state-machines.md')
  for (const expected of [
    'policy owns truth; functions and keepers',
    '`getAfter(/x)` reads final staged state',
    '`requiresInBatch`',
    '`requiresInBatch` is enforced by the realtime/client data plane',
    'bounded cursor',
    'independent differential oracle',
    'success is `_hook_completed == _transaction_hash`',
    'Every failed semantic receipt has a legal retry path',
    'retained target-network execution',
  ]) {
    assert.ok(page.includes(expected), `policy-native-state-machines.md lost guidance: ${expected}`)
  }
  assert.ok(page.split('\n').length <= 400, 'policy-native-state-machines.md exceeds the 400-line module budget')
})

test('the quick path names five builds and links only existing targets', () => {
  const page = read('bounded-backend/docs/quick-path.md')
  const rows = page.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Building') && !l.startsWith('|---'))
  assert.equal(rows.length, 5, `quick path must list exactly 5 builds, found ${rows.length}`)
  for (const match of page.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    const target = path.resolve(path.join(root, 'bounded-backend/docs'), match[1])
    assert.ok(existsSync(target), `quick-path link target missing: ${match[1]}`)
  }
})

test('every example page embeds exactly one complete policy and stays readable', () => {
  const indexes = [
    ['bounded-onchain/docs/examples.md', 'bounded-onchain/docs'],
    ['bounded-backend/docs/examples.md', 'bounded-backend/docs'],
  ]
  const seen = new Set()
  for (const [index, base] of indexes) {
    for (const match of read(index).matchAll(/\]\((examples\/[^)]+\.md)\)/g)) {
      seen.add(path.join(base, match[1]))
    }
  }
  assert.ok(seen.size >= 10, `expected at least 10 example pages linked, found ${seen.size}`)
  for (const rel of seen) {
    const page = read(rel)
    const blocks = [...page.matchAll(/## Policy\n[\s\S]*?```json\n([\s\S]*?)\n```/g)]
    assert.equal(blocks.length, 1, `${rel}: expected exactly one "## Policy" json block`)
    assert.doesNotThrow(() => JSON.parse(blocks[0][1]), `${rel}: policy block is not valid JSON`)
    assert.ok(page.split('\n').length <= 200, `${rel}: exceeds the 200-line example budget`)
    for (const heading of ['## Operations', '## Why it holds']) {
      assert.ok(page.includes(heading), `${rel}: missing ${heading}`)
    }
  }
})

test('every example page has an e2e spec and every spec points at a real page', () => {
  const specsDir = path.join(root, 'scripts/policy-e2e/specs')
  const specs = readdirSync(specsDir).filter((f) => f.endsWith('.json'))
  const specPages = new Set()
  for (const file of specs) {
    const spec = JSON.parse(read(`scripts/policy-e2e/specs/${file}`))
    assert.ok(existsSync(path.join(root, spec.page)), `${file}: page ${spec.page} missing`)
    assert.ok((spec.tests ?? []).length >= 3, `${file}: fewer than 3 steps`)
    specPages.add(spec.page)
  }
  assert.ok(specs.length >= 10, `expected at least 10 e2e specs, found ${specs.length}`)
  const linkedPages = new Set()
  for (const [index, base] of [
    ['bounded-onchain/docs/examples.md', 'bounded-onchain/docs'],
    ['bounded-backend/docs/examples.md', 'bounded-backend/docs'],
  ]) {
    for (const match of read(index).matchAll(/\]\((examples\/[^)]+\.md)\)/g)) {
      linkedPages.add(path.join(base, match[1]))
    }
  }
  assert.deepEqual([...specPages].sort(), [...linkedPages].sort(), 'example pages and e2e specs must map one-to-one')
})
