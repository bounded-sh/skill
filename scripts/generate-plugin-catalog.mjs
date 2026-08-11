#!/usr/bin/env node
// Renders the plugin reference layer from bounded-onchain/data/plugin-catalog.json:
//
//   bounded-onchain/docs/plugins.md               compact namespace/function router
//   bounded-onchain/docs/plugin-signatures.md     complete bare-signatures index
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
  DocumentPlugin: 'Staged document writes from hooks; check each function for its supported hook plane.',
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

const CONTEXT_LABELS = {
  'onchain.rules': 'onchain rules',
  'onchain.queries': 'onchain named queries',
  'onchain.hooks': '`hooks.onchain`',
  'offchain.rules': 'offchain rules',
  'offchain.queries': 'offchain named queries',
  'offchain.hooks': '`hooks.offchain`',
}

function contextFor(fn) {
  if (!fn.contexts?.length) throw new Error(`${fn.callName}: no execution contexts in catalog`)
  return fn.contexts.map((context) => CONTEXT_LABELS[context] ?? (() => {
    throw new Error(`${fn.callName}: unknown execution context ${context}`)
  })()).join(', ')
}

const FORM_LABELS = {
  'wallet': 'wallet address',
  'escrow-sentinel': '`@contract.address` (app escrow)',
  'account-id': 'account id (named PDA)',
  'pubkey': 'literal public key',
  'account-id-only': 'account id only (non-pubkey string)',
}

function formsCell(arg) {
  if (!arg.forms) return '-'
  return arg.forms.map((f) => {
    if (!FORM_LABELS[f]) throw new Error(`unknown accepted form ${f}`)
    return FORM_LABELS[f]
  }).join(' / ')
}

function signerExplanation(arg) {
  const parts = []
  if (arg.forms.includes('wallet')) parts.push('a wallet form requires that wallet\'s signature')
  if (arg.forms.includes('pubkey')) parts.push('a literal public key must supply its required signature')
  if (arg.forms.includes('escrow-sentinel')) parts.push('`@contract.address` is program-signed')
  if (arg.forms.includes('account-id')) parts.push('an account-id source is program-signed')
  if (arg.forms.includes('account-id-only')) parts.push('the named account is program-signed')
  return `- \`${arg.name}\` signs: ${parts.join('; ')}.`
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
      const signs = arg.signer === true ? '**yes**' : arg.signer === false ? 'no' : '-'
      lines.push(`| \`${arg.name}\` | ${arg.type ?? '-'} | ${arg.optional ? 'no' : 'yes'} | ${signs} | ${formsCell(arg)} | ${esc(arg.description)} |`)
    }
    lines.push('')
    for (const arg of fn.args.filter((a) => a.fields)) {
      lines.push(`Fields of \`${arg.name}\`:`, '')
      lines.push('| Field | Type | Required | Signs | Accepts |')
      lines.push('|---|---|---|---|---|')
      for (const [name, field] of Object.entries(arg.fields)) {
        const signs = field.signer === true ? '**yes**' : field.signer === false ? 'no' : '-'
        const required = field.optional === true ? 'no' : field.optional === false ? 'yes' : 'conditional'
        lines.push(`| \`${name}\` | ${field.type ?? '-'} | ${required} | ${signs} | ${formsCell(field)} |`)
      }
      lines.push('')
    }
    const signerArgs = fn.args.filter((a) => a.signer === true)
    if (signerArgs.length) {
      lines.push(...signerArgs.map(signerExplanation))
      lines.push('Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).')
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
    lines.push('Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.', '')
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
  lines.push('Compact O(1) router for policy-callable plugins. Open one namespace page for exact argument contracts, or use the [complete signatures index](plugin-signatures.md) when you need to scan every callable signature. Check [solana-capability-status.md](solana-capability-status.md) before treating a function as deployed or live-verified.', '')
  lines.push('Custody forms are function-specific. Only use wallet, `@contract.address`, or account-id forms when that argument declares them. Details: [custody and PDAs](custody-and-pdas.md).', '')
  lines.push('| Namespace | Role | Function names | Detail |')
  lines.push('|---|---|---|---|')
  for (const ns of catalog.namespaces) {
    const names = ns.functions.map((fn) => `\`${fn.name}\``).join(', ')
    lines.push(`| \`@${ns.namespace}\` | ${esc(ROLES[ns.namespace] ?? '')} | ${names} | [reference](plugins/${ns.namespace}.md) |`)
  }
  lines.push('')
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

function renderSignatures() {
  const lines = [GENERATED_HEADER, '', '# Complete plugin signatures', '']
  lines.push('Every callable signature in one optional scan. Use the linked namespace page for argument forms and signer details; use the [compact plugin router](plugins.md) when you already know the namespace.', '')
  lines.push('| Function | Bare signature | Callable from | Detail |')
  lines.push('|---|---|---|---|')
  for (const ns of catalog.namespaces) {
    for (const fn of ns.functions) {
      lines.push(`| \`${fn.callName}\` | \`${esc(fn.signature)}\` | ${contextFor(fn)} | [reference](plugins/${ns.namespace}.md) |`)
    }
  }
  lines.push('')
  return `${lines.join('\n').trimEnd()}\n`
}

const outputs = new Map()
outputs.set(path.join(docsDir, 'plugins.md'), renderIndex())
outputs.set(path.join(docsDir, 'plugin-signatures.md'), renderSignatures())
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
