import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// SKILL-E (DS2-0226/0228/0229): operator-only material must not live on public
// skill pages. No public page may name an internal secret, an internal route, a
// DLQ paging threshold, or release-evidence schema/artifact detail.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ignore = new Set(['.git', '.gstack', 'node_modules', 'scripts'])

function mdFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(entry.name)) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...mdFiles(abs))
    else if (entry.name.endsWith('.md')) out.push(abs)
  }
  return out
}

// Concrete operator/release literals that belong only in the monorepo runbooks.
const forbidden = [
  'X-Onchain-Recovery-Secret', // internal recovery secret header
  'HELIUS_WEBHOOK_SECRET', // internal webhook secret env
  'ONCHAIN_RECOVERY_OPERATOR_SECRET', // internal operator secret env
  '/webhook/helius', // internal ingress route
  'rawDevnet', // internal webhook registration name
  'Page a primary backlog', // DLQ paging threshold
  'bounded-solana-devnet-lab', // staging lab host (release evidence)
  'bounded-solana-lab-release', // release marker filename
  'Receipt schema version 2', // release-evidence receipt schema
  'artifactSha256', // release-evidence marker field
  'Load the scenario manifest', // internal release-evidence step
]

test('no public skill page names internal operator or release-evidence material', () => {
  const offenders = []
  for (const file of mdFiles(root)) {
    const source = readFileSync(file, 'utf8')
    for (const token of forbidden) {
      if (source.includes(token)) {
        offenders.push(`${path.relative(root, file)} :: ${token}`)
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `public pages must not carry operator/release-evidence material:\n${offenders.join('\n')}`,
  )
})

// The Solana Devnet lab (bounded-solana-tester) was deleted from bounded-monorepo
// along with its generated catalog, fixtures, and acceptance scenarios. Public
// pages had phrased requirements as things "the lab" does, and had asserted that
// its fixtures and scenarios exist - prose that now describes nothing.
//
// Two tiers, because the two failure modes have different blast radii:
//
//  1. Durable identifiers of the deleted thing. Unambiguous anywhere, so they are
//     forbidden across every public page.
//  2. Semantic claims - prose that only reads as a lab reference in the pages that
//     described the lab's authority. "Run the agent in a local lab" and "write
//     acceptance scenarios for your own app" are legitimate guidance elsewhere, so
//     tier 2 is scoped to the two pages that carried the obsolete claims rather
//     than policing the whole corpus.
//
// Patterns, not the exact removed sentences: those are already gone, so pinning
// them would guard only against retyping them verbatim.

const deletedLabIdentifiers = [
  [/bounded-solana-tester/i, 'names the deleted package'],
  [/bounded-solana-devnet-lab/i, 'names the deleted hosted lab app'],
  [/bounded-solana-lab-release/i, 'names the deleted release marker'],
  [/catalog\.generated/i, 'names the deleted generated catalog'],
]

// Pages that stated the lab as their source of authority.
const labAuthorityPages = [
  'bounded-onchain/docs/solana-capability-status.md',
  'bounded-onchain/docs/policy-primitives.md',
]

const deletedLabClaims = [
  // "the canonical Devnet lab", "the staging lab's release marker", "its complete
  // lab flow", "the lab catalog behind this page". Singular and non-hyphenated:
  // the deleted lab was only ever "the lab", while plurals are legitimate (the
  // `black-forest-labs` model vendor, "TokenPlugin labs" meaning experiments).
  [/(?<!-)\blab\b(?!-)/i, 'names the deleted lab'],
  [/\bacceptance scenarios?\b/i, 'names a deleted acceptance scenario'],
  [/\bscenario manifest\b/i, 'names the deleted scenario manifest'],
  // A requirement may say what a claim NEEDS; it may not assert the artifact
  // already exists.
  [/\b(fixtures?|scenarios?)\b[^.\n]{0,80}\b(are|is) present\b/i, 'asserts a deleted fixture/scenario exists'],
]

function labOffenders(source, patterns, label) {
  const out = []
  for (const [pattern, reason] of patterns) {
    const hit = pattern.exec(source)
    if (hit) out.push(`${label} :: ${reason} :: ${JSON.stringify(hit[0])}`)
  }
  return out
}

test('no public skill page describes the deleted Solana Devnet lab', () => {
  const offenders = []
  for (const file of mdFiles(root)) {
    const rel = path.relative(root, file)
    const source = readFileSync(file, 'utf8')
    offenders.push(...labOffenders(source, deletedLabIdentifiers, rel))
    if (labAuthorityPages.includes(rel)) {
      offenders.push(...labOffenders(source, deletedLabClaims, rel))
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `the Solana Devnet lab no longer exists; state the requirement itself:\n${offenders.join('\n')}`,
  )
})

// The guard's boundary, committed rather than checked by hand once. Without these
// a later regex edit could pass the corpus scan above while catching nothing.
const REJECTED_ON_AUTHORITY_PAGES = [
  "The end-to-end live-acceptance release proof - the staging lab's release marker",
  'A distinct target fixture and source scenario are present, but the finalized source transaction',
  'A devnet acceptance scenario exercises this function, so a retained passing receipt can promote it.',
  'must update this table and its corresponding acceptance scenario in the same change.',
  'its complete lab flow remains unverified in this snapshot.',
  'this table is generated from the Devnet lab and classifies devnet alone',
  'The canonical Devnet lab uses four observations spanning at least 12 measured monotonic seconds',
  'the version the lab catalog behind this page records',
]

const REJECTED_ANYWHERE = [
  'Regenerate it with bounded-solana-tester.',
  'Fetch https://bounded-solana-devnet-lab.staging.bounded.page/x.json',
  'Parse bounded-solana-lab-release.json first.',
  'The totals come from catalog.generated.json.',
]

// Legitimate guidance that must NOT be rejected - the reason tier 2 is scoped.
const ALLOWED_ANYWHERE = [
  'Run the agent in a local lab before production.',
  'The research lab can publish its model.',
  'Write acceptance scenarios for your own application.',
  'Load your scenario manifest before replaying a local test.',
  'When browser fixtures are present, run the browser project.',
  'Use `@cf/black-forest-labs/flux-2-klein-4b` for images.',
  'Use an app-created devnet mint for TokenPlugin labs.',
]

test('the deleted-lab guard rejects lab claims and admits legitimate prose', () => {
  const authorityPage = labAuthorityPages[0]
  const scan = (source, rel) => [
    ...labOffenders(source, deletedLabIdentifiers, rel),
    ...(labAuthorityPages.includes(rel) ? labOffenders(source, deletedLabClaims, rel) : []),
  ]

  for (const sample of REJECTED_ON_AUTHORITY_PAGES) {
    assert.notDeepEqual(scan(sample, authorityPage), [], `must be rejected on an authority page: ${sample}`)
  }
  for (const sample of REJECTED_ANYWHERE) {
    assert.notDeepEqual(scan(sample, 'bounded/SKILL.md'), [], `must be rejected anywhere: ${sample}`)
  }
  for (const sample of ALLOWED_ANYWHERE) {
    assert.deepEqual(scan(sample, 'bounded/SKILL.md'), [], `must be admitted: ${sample}`)
  }
})
