#!/usr/bin/env node
// Maintainer-side extractor: builds bounded-onchain/data/plugin-catalog.json from the
// bounded-monorepo sol-layer plugin manifests plus this repo's published capability table.
//
// The snapshot is the single source the generated plugin docs are rendered from, so the
// public repo never needs the monorepo at validation time. Run this (then the generator)
// whenever the owning repo changes a manifest:
//
//   node scripts/extract-plugin-catalog.mjs            # rewrite the snapshot
//   node scripts/extract-plugin-catalog.mjs --check    # fail if the snapshot is stale
//
// The monorepo location comes from BOUNDED_MONOREPO or defaults to the sibling checkout.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const monorepo = process.env.BOUNDED_MONOREPO
  ?? path.resolve(root, '..', 'bounded-monorepo')
const solLayer = path.join(monorepo, 'packages/cdk/layers/sol-helper/nodejs/sol-layer')
const snapshotPath = path.join(root, 'bounded-onchain/data/plugin-catalog.json')
const capabilityPath = path.join(root, 'bounded-onchain/docs/solana-capability-status.md')

if (!existsSync(solLayer)) {
  console.error(`extract-plugin-catalog: monorepo sol-layer not found at ${solLayer}.`)
  console.error('Set BOUNDED_MONOREPO to the bounded-monorepo checkout root.')
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Deterministic public-phrasing rewrites. The manifests are the behavior truth
// but use internal program naming; the published pages use the public naming.
// Order matters: longest, most specific first.
const REWRITES = [
  [/bounded contract address using @contract\.address as an escrow/gi,
    'the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA)'],
  [/an accountId from @AccountPlugin/g, 'an account id (a named app PDA; see the custody guide)'],
  [/—/g, '-'], // em dash is forbidden repo-wide
  [/–/g, '-'],
]

function publicText(value) {
  let out = String(value ?? '')
  for (const [pattern, replacement] of REWRITES) out = out.replace(pattern, replacement)
  return out.replace(/\s+$/g, '')
}

// ---------------------------------------------------------------------------
// Capability table: `| `id` | lane | support | verification | markers |`
function parseCapabilityRows() {
  const source = readFileSync(capabilityPath, 'utf8')
  const inventory = source.split('## Function inventory')[1]?.split('## Built-in values')[0] ?? ''
  const rows = new Map()
  for (const match of inventory.matchAll(
    /^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm,
  )) {
    rows.set(match[1].trim(), {
      lane: match[2].trim(),
      support: match[3].trim(),
      verification: match[4].trim(),
      markers: match[5].trim(),
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
const require_ = createRequire(path.join(solLayer, 'package.json'))
const pluginDirs = readdirSync(path.join(solLayer, 'src')).filter((d) => d.endsWith('-plugin-stuff')).sort()

const manifestEntries = pluginDirs.flatMap((dir) => {
  const manifestFile = readdirSync(path.join(solLayer, 'src', dir)).find((f) => f.includes('manifest'))
  return manifestFile ? [{ dir, manifest: require_(path.join(solLayer, 'src', dir, manifestFile)) }] : []
})

// Load the exact source objects exported by the two canonical offchain manifests.
// These files are object literals with `export default`; evaluating that literal keeps
// this maintainer extractor independent of a built schema dist while still deriving the
// plane membership from production-owned source rather than a duplicated test fixture.
const schemaManifests = path.join(monorepo, 'packages/cdk/layers/schema/nodejs/src/manifests')
function loadSourceManifest(file) {
  const source = readFileSync(path.join(schemaManifests, file), 'utf8')
  return Function(source.replace(/^export default\s+/m, 'return '))()
}
const canonicalOffchainManifests = [
  loadSourceManifest('document-offchain-plugin-manifest.ts'),
  loadSourceManifest('string-utils-offchain-plugin-manifest.ts'),
]
const canonicalOffchainCalls = new Set(canonicalOffchainManifests.flatMap((manifest) =>
  Object.values(manifest.functions ?? {}).flatMap((functions) =>
    Object.keys(functions).map((name) => `@${manifest.name}.${name}`))))

const capability = parseCapabilityRows()
const namespaces = new Map() // namespace -> { namespace, sourcePlugins, variables, functions }

for (const { manifest } of manifestEntries) {

  for (const [category, fns] of Object.entries(manifest.functions ?? {})) {
    for (const [fnName, fn] of Object.entries(fns)) {
      const usage = String(fn.usage ?? '')
      const nsMatch = usage.match(/@([A-Za-z0-9]+)\./)
      const namespace = nsMatch ? nsMatch[1] : manifest.name
      if (!namespaces.has(namespace)) {
        namespaces.set(namespace, { namespace, sourcePlugins: new Set(), variables: [], functions: [] })
      }
      const bucket = namespaces.get(namespace)
      bucket.sourcePlugins.add(manifest.name)

      const callName = `@${namespace}.${fnName}`
      const status = capability.get(callName) ?? null
      bucket.functions.push({
        name: fnName,
        callName,
        category, // transactional | readOnly
        signature: publicText(fn.signature),
        usage: publicText(usage.replace(/^Usage\s+/, '')),
        returnType: fn.returnType ?? null,
        isOnlyOffchain: !!fn.isOnlyOffchain,
        validArgCounts: fn.validArgCounts ?? null,
        description: fn.description ? publicText(fn.description) : null,
        args: (fn.args ?? []).map((arg) => ({
          index: arg.index,
          name: arg.name,
          type: arg.type ?? null,
          optional: !!arg.optional,
          // Preserve only metadata already declared by the owning manifest. Missing is
          // not rendered as "no": it means the manifest does not make a signer claim.
          signer: typeof arg.signer === 'boolean' ? arg.signer : null,
          description: publicText(arg.description),
          fields: arg.fields ? Object.fromEntries(Object.entries(arg.fields).map(([name, field]) => [name, {
            type: field.type ?? null,
            optional: typeof field.optional === 'boolean' ? field.optional : null,
            signer: typeof field.signer === 'boolean' ? field.signer : null,
            description: field.description ? publicText(field.description) : null,
          }])) : null,
        })),
        contexts: (() => {
          const contexts = new Set()
          const inCanonicalOffchain = canonicalOffchainCalls.has(callName)
          if (category === 'transactional') {
            if (!fn.isOnlyOffchain) contexts.add('onchain.hooks')
            if (inCanonicalOffchain) contexts.add('offchain.hooks')
          } else {
            if (!fn.isOnlyOffchain) {
              contexts.add('onchain.rules')
              contexts.add('onchain.queries')
              contexts.add('onchain.hooks')
            }
            // Production rules/queries fall back to the onchain read-only map even for
            // offchain-only functions. The transactional hook path has no such fallback.
            contexts.add('offchain.rules')
            contexts.add('offchain.queries')
            if (inCanonicalOffchain) contexts.add('offchain.hooks')
          }
          return [...contexts]
        })(),
        status,
      })
    }
  }

  for (const [varName, varDef] of Object.entries(manifest.variables ?? {})) {
    const namespace = manifest.name
    if (!namespaces.has(namespace)) {
      namespaces.set(namespace, { namespace, sourcePlugins: new Set(), variables: [], functions: [] })
    }
    namespaces.get(namespace).variables.push({
      name: varName,
      description: publicText(varDef?.description ?? varDef ?? ''),
    })
  }
}

// Capability rows with no manifest function (extended/disabled/core entries). Kept in the
// snapshot so the generated index can show them and the tests can prove nothing is lost
// in either direction.
const manifestCallNames = new Set(
  [...namespaces.values()].flatMap((ns) => ns.functions.map((fn) => fn.callName)),
)
const capabilityOnly = [...capability.entries()]
  .filter(([id]) => !manifestCallNames.has(id))
  .map(([id, row]) => ({ callName: id, ...row }))

let monorepoCommit = 'unknown'
try {
  monorepoCommit = execSync('git rev-parse HEAD', { cwd: monorepo, encoding: 'utf8' }).trim()
} catch { /* extraction still valid without git metadata */ }

const catalog = {
  schemaVersion: 2,
  generatedBy: 'scripts/extract-plugin-catalog.mjs',
  source: {
    monorepoCommit,
    solLayerPath: 'packages/cdk/layers/sol-helper/nodejs/sol-layer',
    capabilityTable: 'bounded-onchain/docs/solana-capability-status.md',
    canonicalOffchainPlugins: canonicalOffchainManifests.map((manifest) => manifest.name),
  },
  namespaces: [...namespaces.values()]
    .map((ns) => ({
      namespace: ns.namespace,
      sourcePlugins: [...ns.sourcePlugins].sort(),
      variables: ns.variables.sort((a, b) => a.name.localeCompare(b.name)),
      functions: ns.functions.sort((a, b) =>
        a.category === b.category ? a.name.localeCompare(b.name) : (a.category === 'transactional' ? -1 : 1)),
    }))
    .sort((a, b) => a.namespace.localeCompare(b.namespace)),
  capabilityOnly: capabilityOnly.sort((a, b) => a.callName.localeCompare(b.callName)),
}

const serialized = `${JSON.stringify(catalog, null, 1)}\n`

if (process.argv.includes('--check')) {
  const existing = existsSync(snapshotPath) ? readFileSync(snapshotPath, 'utf8') : ''
  const strip = (text) => text.replace(/"monorepoCommit": "[^"]*"/, '"monorepoCommit": "x"')
  if (strip(existing) !== strip(serialized)) {
    console.error('plugin-catalog snapshot is stale versus the monorepo manifests.')
    console.error('Run: node scripts/extract-plugin-catalog.mjs && node scripts/generate-plugin-catalog.mjs')
    process.exit(1)
  }
  console.log('plugin-catalog snapshot matches the monorepo manifests.')
  process.exit(0)
}

writeFileSync(snapshotPath, serialized)
const fnCount = catalog.namespaces.reduce((sum, ns) => sum + ns.functions.length, 0)
console.log(`wrote ${path.relative(root, snapshotPath)}: ${catalog.namespaces.length} namespaces, ${fnCount} functions, ${catalog.capabilityOnly.length} capability-only rows (monorepo ${monorepoCommit.slice(0, 12)})`)
