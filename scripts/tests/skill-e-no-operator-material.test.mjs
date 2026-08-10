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
