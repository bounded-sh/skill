#!/usr/bin/env node
// Renders the plugin reference layer from bounded-onchain/data/plugin-catalog.json:
//
//   bounded-onchain/docs/plugins.md               one-screen signatures index
//   bounded-onchain/docs/plugins/<Namespace>.md   one page per policy namespace
//
// Curated prose lives in bounded-onchain/docs/plugins/_fragments/<Namespace>.md and is
// injected verbatim after the page header; everything else is generated. Never hand-edit
// the generated files - edit the fragment or the snapshot inputs and re-run:
//
//   node scripts/generate-plugin-catalog.mjs           # rewrite generated pages
//   node scripts/generate-plugin-catalog.mjs --check   # fail if pages drifted

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(readFileSync(path.join(root, 'bounded-onchain/data/plugin-catalog.json'), 'utf8'))
const docsDir = path.join(root, 'bounded-onchain/docs')
const pagesDir = path.join(docsDir, 'plugins')
const fragmentsDir = path.join(pagesDir, '_fragments')

const GENERATED_HEADER = [
  '<!-- GENERATED FILE. Do not hand-edit.',
  '     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests',
  '     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.',
  '     Regenerate: node scripts/generate-plugin-catalog.mjs -->',
].join('\n')

// One-line role shown in the index and page intro.
const ROLES = {
  AccountPlugin: 'Named app PDAs (per-entity escrow/vault accounts) - create them and read their addresses.',
  App: 'Cross-app Document reads and writes from onchain policy.',
  BondingCurvePlugin: 'Pure constant-product bonding-curve math (quotes only, no mutation).',
  Bytes: 'Borsh-style byte building and reading for raw instruction data.',
  CPI: 'Descriptor-bound CPI calls (memo, lamports, Kamino, DLMM, Raydium, stake pools).',
  DeFiPlugin: 'AMM pools, swaps, Meteora launches/fee claims, and cp-AMM liquidity positions.',
  DflowPlugin: 'DFlow prediction-market orders and KYC status.',
  DocumentPlugin: 'Staged document writes from hooks (the only plugin usable in offchain hooks).',
  MathPlugin: 'Overflow-safe mulDiv helpers for rule arithmetic.',
  NFTPlugin: 'Metaplex Core NFTs: collections, mints, transfers, burns, royalties.',
  OraclePlugin: 'ORAO verifiable randomness (request + reveal reads).',
  PhoenixPerpsPlugin: 'Phoenix leveraged perps: registration, collateral, positions.',
  PredictionMarketPlugin: 'Pure AMM/LSMR prediction-market math (quotes only, no mutation).',
  PriceFeedPlugin: 'Pyth price reads by 64-hex feed id.',
  PumpFunPlugin: 'Pump.fun token launches, buys, creator fees, and PumpSwap liquidity.',
  Solana: 'Extended Solana primitives: account reads, PDAs/ATAs, named signers, raw invoke.',
  StringUtils: 'String helpers usable in rules.',
  TensorPlugin: 'Tensor NFT marketplace buys and listings.',
  TokenPlugin: 'SPL and Token-2022 tokens: transfers, mints, burns, balances, supply.',
}

// Verified execution-context exceptions (see bounded-backend hooks docs); everything else
// derives from category + isOnlyOffchain.
const CONTEXT_OVERRIDES = {
  '@DocumentPlugin.updateField': '`hooks.onchain` and `hooks.offchain`',
}

function contextFor(fn) {
  if (CONTEXT_OVERRIDES[fn.callName]) return CONTEXT_OVERRIDES[fn.callName]
  if (fn.isOnlyOffchain) return '`hooks.offchain` only'
  if (fn.category === 'transactional') return '`hooks.onchain` on an `"onchain": true` collection'
  return 'rules, named queries, and hooks (read-only)'
}

const FORM_LABELS = {
  'wallet': 'wallet address',
  'escrow-sentinel': '`@contract.address` (app escrow)',
  'account-id': 'account id (named PDA)',
}

function formsCell(arg) {
  if (!arg.forms) return '-'
  return arg.forms.map((f) => FORM_LABELS[f]).join(' / ')
}

function statusLine(fn) {
  if (!fn.status) return 'Status: not listed in the capability table.'
  const { support, verification, markers } = fn.status
  return `Status: **${support}** (${verification}); markers: ${markers}.`
}

function esc(text) {
  return String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function renderFunction(fn) {
  const lines = []
  lines.push(`### \`${fn.callName.slice(1)}\``)
  lines.push('')
  lines.push('```')
  lines.push(fn.usage)
  lines.push('```')
  lines.push('')
  if (fn.description) lines.push(`${fn.description}`, '')
  lines.push(`- Callable from: ${contextFor(fn)}`)
  if (fn.returnType) lines.push(`- Returns: \`${fn.returnType}\``)
  if (fn.validArgCounts) lines.push(`- Accepted argument counts: ${fn.validArgCounts.join(', ')}`)
  lines.push(`- ${statusLine(fn)}`)
  lines.push('')
  if (fn.args.length) {
    lines.push('| Arg | Type | Required | Signs | Accepts | Description |')
    lines.push('|---|---|---|---|---|---|')
    for (const arg of fn.args) {
      lines.push(`| \`${arg.name}\` | ${arg.type ?? '-'} | ${arg.optional ? 'no' : 'yes'} | ${arg.signer ? '**yes**' : 'no'} | ${formsCell(arg)} | ${esc(arg.description)} |`)
    }
    lines.push('')
    if (fn.args.some((a) => a.signer)) {
      lines.push('A `Signs: yes` argument is the transaction authority: a wallet form requires that wallet\'s signature, while `@contract.address` and account-id forms are program-signed. Never pass a resolved `getAccountAddress(...)` string where a signing source is expected - the id string IS the signing capability. See [custody and PDAs](../custody-and-pdas.md).')
      lines.push('')
    } else if (fn.category === 'transactional' && fn.args.some((a) => a.forms)) {
      lines.push('The manifest does not declare signer metadata for this function\'s custody arguments; the custody rule still applies - a wallet source must sign the transaction, while `@contract.address` and account-id sources are program-signed. See [custody and PDAs](../custody-and-pdas.md).')
      lines.push('')
    }
  }
  return lines.join('\n')
}

function renderPage(ns) {
  const fragmentPath = path.join(fragmentsDir, `${ns.namespace}.md`)
  const fragment = existsSync(fragmentPath) ? readFileSync(fragmentPath, 'utf8').trim() : null
  const transactional = ns.functions.filter((f) => f.category === 'transactional')
  const readOnly = ns.functions.filter((f) => f.category === 'readOnly')

  const lines = [GENERATED_HEADER, '', `# \`@${ns.namespace}\``, '']
  lines.push(ROLES[ns.namespace] ?? '', '')
  lines.push('Check every function\'s row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.', '')
  if (fragment) lines.push(fragment, '')
  if (transactional.length) {
    lines.push('## Transactional', '')
    lines.push('Callable only from `hooks.onchain` on `"onchain": true` collections (exceptions noted per function). A `false` return or thrown error aborts the entire Solana write.', '')
    for (const fn of transactional) lines.push(renderFunction(fn))
  }
  if (readOnly.length) {
    lines.push('## Read-only', '')
    for (const fn of readOnly) lines.push(renderFunction(fn))
  }
  if (ns.variables.length) {
    lines.push('## Built-in values', '')
    lines.push('| Name | Meaning |')
    lines.push('|---|---|')
    for (const v of ns.variables) lines.push(`| \`@${ns.namespace}.${v.name}\` | ${esc(v.description)} |`)
    lines.push('')
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

function renderIndex() {
  const lines = [GENERATED_HEADER, '', '# Plugin catalog', '']
  lines.push('Every policy-callable plugin function, one screen. Open a namespace page only when you need argument contracts; open [solana-capability-status.md](solana-capability-status.md) for the live support state of anything you plan to ship.', '')
  lines.push('Custody rule for every `source`/`owner`/`creator`/destination argument: a wallet address means that wallet signs, `@contract.address` means the shared app escrow (program-signed), and any non-pubkey string is an account id resolved to a named app PDA (program-signed). Details: [custody and PDAs](custody-and-pdas.md).', '')
  lines.push('| Namespace | Role | Functions | Detail |')
  lines.push('|---|---|---|---|')
  for (const ns of catalog.namespaces) {
    const t = ns.functions.filter((f) => f.category === 'transactional').length
    const r = ns.functions.length - t
    lines.push(`| \`@${ns.namespace}\` | ${esc(ROLES[ns.namespace] ?? '')} | ${t} transactional, ${r} read-only | [reference](plugins/${ns.namespace}.md) |`)
  }
  lines.push('')
  for (const ns of catalog.namespaces) {
    lines.push(`## \`@${ns.namespace}\``, '')
    lines.push('```')
    for (const fn of ns.functions) {
      const gate = fn.status && fn.status.support !== 'unverified' ? `   # ${fn.status.support}: ${fn.status.markers}` : ''
      lines.push(`${fn.usage}${gate}`)
    }
    lines.push('```', '')
  }
  lines.push('## Capability-only entries', '')
  lines.push('Rows in the capability table with no callable manifest function today (disabled, runtime-gated, or core language forms):', '')
  lines.push('| Entry | Support | Markers |')
  lines.push('|---|---|---|')
  for (const row of catalog.capabilityOnly) {
    lines.push(`| \`${row.callName}\` | ${row.support} | ${esc(row.markers)} |`)
  }
  lines.push('')
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

const outputs = new Map()
outputs.set(path.join(docsDir, 'plugins.md'), renderIndex())
for (const ns of catalog.namespaces) {
  outputs.set(path.join(pagesDir, `${ns.namespace}.md`), renderPage(ns))
}

if (process.argv.includes('--check')) {
  const drifted = []
  for (const [file, content] of outputs) {
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (existing !== content) drifted.push(path.relative(root, file))
  }
  if (drifted.length) {
    console.error('generated plugin pages are stale:')
    for (const file of drifted) console.error(`  ${file}`)
    console.error('Run: node scripts/generate-plugin-catalog.mjs')
    process.exit(1)
  }
  console.log(`plugin catalog pages match the snapshot (${outputs.size} files).`)
  process.exit(0)
}

mkdirSync(fragmentsDir, { recursive: true })
for (const [file, content] of outputs) {
  writeFileSync(file, content)
}
console.log(`wrote ${outputs.size} generated pages under bounded-onchain/docs/`)
