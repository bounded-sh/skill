#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ignoredDirectories = new Set(['.git', '.gstack', 'node_modules'])
const textExtensions = new Set(['.md', '.mdc', '.mjs', '.json', '.txt'])
const errors = []

function fail(message) {
  errors.push(message)
}

function filesBelow(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...filesBelow(absolute))
    else files.push(absolute)
  }
  return files
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

function frontmatter(source) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)
  if (!match) return null
  const name = match[1].match(/^name:\s*([^\n]+)$/m)?.[1]?.trim()
  const description = match[1].match(/^description:\s*(?:>-?\s*)?([\s\S]*)$/m)?.[1]?.trim()
  const internal = /metadata:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+internal:\s*true\s*$/m.test(match[1])
  return { name, description, internal }
}

function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*~]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

function headingAnchors(file) {
  const anchors = new Set()
  const counts = new Map()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)?.[1]
    if (!heading) continue
    const base = githubSlug(heading)
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  return anchors
}

function checkMarkdownLink(sourceFile, rawTarget, line) {
  let target = rawTarget.trim().replace(/^<|>$/g, '')
  if (!target || /^(?:https?:|mailto:|tel:|data:)/i.test(target)) return

  const hashAt = target.indexOf('#')
  const rawPath = hashAt >= 0 ? target.slice(0, hashAt) : target
  const rawAnchor = hashAt >= 0 ? target.slice(hashAt + 1) : ''
  const targetPath = rawPath
    ? path.resolve(path.dirname(sourceFile), decodeURIComponent(rawPath.split('?')[0]))
    : sourceFile

  if (!existsSync(targetPath)) {
    fail(`${relative(sourceFile)}:${line}: missing link target ${rawTarget}`)
    return
  }
  if (!rawAnchor || statSync(targetPath).isDirectory() || path.extname(targetPath) !== '.md') return

  const anchor = decodeURIComponent(rawAnchor).toLowerCase()
  if (!headingAnchors(targetPath).has(anchor)) {
    fail(`${relative(sourceFile)}:${line}: missing anchor #${anchor} in ${relative(targetPath)}`)
  }
}

const files = filesBelow(root)
const textFiles = files.filter((file) => textExtensions.has(path.extname(file)) || path.basename(file) === 'windsurfrules.md')

for (const file of textFiles) {
  const source = readFileSync(file, 'utf8')
  const rel = relative(file)
  source.split('\n').forEach((line, index) => {
    if (/^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/.test(line)) {
      fail(`${rel}:${index + 1}: unresolved conflict marker`)
    }
  })

  if (path.extname(file) === '.json') {
    try {
      JSON.parse(source)
    } catch (error) {
      fail(`${rel}: invalid JSON: ${error.message}`)
    }
  }

  if (path.extname(file) === '.md' || path.extname(file) === '.mdc') {
    source.split('\n').forEach((line, index) => {
      const links = line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^)]*)?\)/g)
      for (const match of links) checkMarkdownLink(file, match[1], index + 1)
    })
  }
}

const skillFiles = files.filter((file) => path.basename(file) === 'SKILL.md')
const skillNames = new Set()
const publicSkills = []
for (const file of skillFiles) {
  const meta = frontmatter(readFileSync(file, 'utf8'))
  const directoryName = path.basename(path.dirname(file))
  if (!meta?.name) fail(`${relative(file)}: missing frontmatter name`)
  if (!meta?.description) fail(`${relative(file)}: missing frontmatter description`)
  if (meta?.name !== directoryName) fail(`${relative(file)}: name must equal directory ${directoryName}`)
  if (meta?.name && skillNames.has(meta.name)) fail(`${relative(file)}: duplicate skill name ${meta.name}`)
  if (meta?.name) skillNames.add(meta.name)
  if (meta && !meta.internal) publicSkills.push(meta.name)
}

const expectedPublicSkills = [
  'bounded',
  'bounded-backend',
  'bounded-deploy',
  'bounded-frontend',
  'bounded-onchain',
  'bounded-teams',
  'oapps-fun',
]
if (publicSkills.sort().join('\n') !== expectedPublicSkills.join('\n')) {
  fail(`public skill set mismatch: received ${publicSkills.sort().join(', ')}`)
}

const publicText = textFiles
  .filter((file) =>
    !relative(file).startsWith('bounded-observe/') &&
    ['.md', '.mdc', '.txt'].includes(path.extname(file)),
  )
  .map((file) => `${relative(file)}\n${readFileSync(file, 'utf8')}`)
  .join('\n')

const forbidden = [
  [/^\s*npx(?: --yes)? skills add bounded-sh\/skill\s+[^\n]*(?:--all|--skill\s+['"]?\*)/m, 'public install command must not use a wildcard or --all'],
  [/@bounded-sh\/client@0\.0\.40\b/, 'stale client version 0.0.40'],
  [/from\s+['"]bounded-sh(?:\/server)?['"]|or\s+['"]bounded-sh\/server['"]/, 'bare bounded-sh package import'],
  [/use\s+['"]none['"]\s+to disable auth|authMethod\s*:\s*['"]none['"][^\n]{0,80}(?:disable|public-read)/i, 'unsupported authMethod none'],
  [/forgetGuest\(\)\s+(?:wipes|deletes|clears)/i, 'unexported forgetGuest helper'],
  [/signInAnonymously\(\)[^\n]{0,120}(?:RN default|just works on a phone)/i, 'unsupported standard React Native guest flow'],
  [/same SMT-proven read rule/i, 'authorization read rule described as blanket SMT proof'],
  [/the proven query engine/i, 'policy query engine described as blanket proof'],
  [/Policy `queries` are declared\s+and proven at deploy/i, 'all policy queries described as proved'],
  [/\*\*1\. Rules \+ invariants\*\*[\s\S]{0,240}?\*\*PROVEN\*\*/i, 'rules and invariants collapsed into one proved tier'],
  [/function's `auth` rule[\s\S]{0,220}?proven obligation/i, 'every function auth gate described as a proved obligation'],
  [/\*\*proven\*\*\s+—\s*\n?your `rules` \+ `invariants`/i, 'rules and invariants jointly described as proved'],
  [/only un-proven tier/i, 'function incorrectly described as the only un-proven tier'],
  [/rule authorizes and proves/i, 'authorization rule conflated with a proof obligation'],
  [/the constraints are proven/i, 'all policy constraints described as blanket proofs'],
  [/path is the access boundary,\s*proven by the rule/i, 'path authorization rule described as a blanket proof'],
  [/provable like any other rule/i, 'role grant described as automatically proved'],
  [/this rule both runs and\s+proves/i, 'runtime-enforced origin rule described as automatically proved'],
  [/already proved (?:this call came|the origin)/i, 'runtime auth evaluation described as proof'],
  [/proven `auth` rule/i, 'function auth rule described as blanket proof'],
]
for (const [pattern, label] of forbidden) {
  if (pattern.test(publicText)) fail(`forbidden public guidance: ${label}`)
}
if (/\bbounded-observe\b/.test(publicText)) {
  fail('public guidance must not route to the repository-internal bounded-observe skill')
}

// Runtime-semantics pins for high-risk guidance. This repository is released
// separately from bounded-monorepo, so source-derived counts/limits cannot be
// imported at validation time; keep the asserted inventory explicit so a
// future runtime change forces an intentional skill update instead of silent
// documentation drift.
const expectedKaniHarnessSourceCount = 283
const proofCoverage = readFileSync(path.join(root, 'bounded-backend/docs/proof-coverage.md'), 'utf8')
if (!proofCoverage.includes(`**${expectedKaniHarnessSourceCount} Kani proof harnesses**`)) {
  fail(`proof coverage: expected current source inventory ${expectedKaniHarnessSourceCount} Kani harnesses`)
}
if (/\b(?:263|275)[ /-](?:Kani|harness)/i.test(proofCoverage)) {
  fail('proof coverage: contains a stale Kani harness count')
}
for (const expected of [
  '`windowSum` | runtime-maintained; structurally validated; `UNKNOWN` non-blocking advisory',
  'reserves one top-level `obligationCount` slot per invariant declaration',
  'Do not translate `obligationCount` into "N SMT proofs passed."',
]) {
  if (!proofCoverage.includes(expected)) fail(`proof coverage: missing count/coverage boundary ${expected}`)
}

const invariantGuide = readFileSync(path.join(root, 'bounded-backend/docs/invariants.md'), 'utf8')
for (const expected of [
  'The public authoring contract requires `tier: "durable"` for `rollingSum`',
  'Postgres-primary currently uses the in-memory working-set',
  'During alarm latency it can conservatively retain contributions',
  'occupies one advisory slot in the current summary',
]) {
  if (!invariantGuide.includes(expected)) fail(`invariants guide: missing runtime boundary ${expected}`)
}

const dataPlaneGuide = readFileSync(path.join(root, 'bounded-backend/docs/data-plane.md'), 'utf8')
for (const expected of [
  'Collection tier is not the physical document backend',
  'durable local SQLite outbox',
  '25,000 rows and 32 MiB',
  '25,000 rows and 64 MiB',
  '256 rows / 4 MiB',
  'realtime WebSocket writes may surface the first conflict',
]) {
  if (!dataPlaneGuide.includes(expected)) fail(`data-plane guide: missing storage/conflict boundary ${expected}`)
}

const paidOperationsGuide = readFileSync(path.join(root, 'bounded-backend/docs/functions.md'), 'utf8')
for (const expected of [
  'idempotencyKey: string',
  '1–256-byte UTF-8 string',
  'are **app-global** across function names',
  'ai_operation_idempotency_conflict',
  'ai_operation_attention_required',
  'service operation keys are app-global',
  'service_invoke_operation_conflict',
  'service_invoke_outcome_unknown',
  'five-minute cache writes 1.25×',
  'writes 2×.',
]) {
  if (!paidOperationsGuide.includes(expected)) fail(`functions guide: missing paid-operation boundary ${expected}`)
}

for (const file of ['README.md', 'bounded/SKILL.md', 'agents/AGENTS.md', 'agents/cursor-bounded.mdc', 'agents/windsurfrules.md']) {
  const source = readFileSync(path.join(root, file), 'utf8')
  if (!/full-stack app builder/i.test(source)) fail(`${file}: missing full-stack app-builder framing`)
  if (!/generic [“"]build this app[”"]|generic “build this app”/i.test(source)) fail(`${file}: missing generic app-selection contract`)
}

const capabilities = readFileSync(path.join(root, 'bounded/guides/capabilities-and-limits.md'), 'utf8')
for (const claim of ['Complete agent-built apps', 'Managed app services', 'Web delivery']) {
  if (!capabilities.includes(claim)) fail(`capabilities guide: missing ${claim}`)
}

const solanaCapabilityStatus = readFileSync(
  path.join(root, 'bounded-onchain/docs/solana-capability-status.md'),
  'utf8',
)
const solanaInventory = solanaCapabilityStatus
  .split('## Function inventory')[1]
  ?.split('## Built-in values')[0]
if (!solanaInventory) {
  fail('Solana capability status: missing function inventory section')
} else {
  const rows = [...solanaInventory.matchAll(
    /^\| `([^`]+)` \| ([^|]+) \| (unverified|unsupported|blocked) \| ([^|]+) \| ([^|]+) \|$/gm,
  )].map((match) => ({
    id: match[1],
    support: match[3],
  }))
  const ids = rows.map((row) => row.id)
  if (rows.length !== 157) fail(`Solana capability status: expected 157 function rows, received ${rows.length}`)
  if (new Set(ids).size !== rows.length) fail('Solana capability status: duplicate function row')

  const supportCounts = rows.reduce((counts, row) => {
    counts[row.support] = (counts[row.support] ?? 0) + 1
    return counts
  }, {})
  for (const [state, count] of Object.entries({ unverified: 115, unsupported: 42, blocked: 0 })) {
    // `supportCounts` is reduced from {} and only gains keys for states that occur,
    // so a legitimately-zero state is `undefined` here and a strict !== 0 would fire.
    if ((supportCounts[state] ?? 0) !== count) {
      fail(`Solana capability status: expected ${count} ${state} rows, received ${supportCounts[state] ?? 0}`)
    }
  }

  const namespaceCounts = rows.reduce((counts, row) => {
    const namespace = row.id.startsWith('@')
      ? row.id.slice(1).split('.')[0]
      : 'core'
    counts[namespace] = (counts[namespace] ?? 0) + 1
    return counts
  }, {})
  const expectedNamespaceCounts = {
    AccountPlugin: 2,
    App: 2,
    BondingCurvePlugin: 6,
    Bytes: 22,
    CPI: 16,
    DeFiPlugin: 21,
    DflowPlugin: 2,
    DocumentPlugin: 2,
    MathPlugin: 2,
    NFTPlugin: 10,
    OraclePlugin: 3,
    PhoenixPerpsPlugin: 18,
    PredictionMarketPlugin: 7,
    PriceFeedPlugin: 1,
    PumpFunPlugin: 12,
    Solana: 14,
    StringUtils: 1,
    TensorPlugin: 2,
    TokenPlugin: 12,
    core: 2,
  }
  for (const [namespace, count] of Object.entries(expectedNamespaceCounts)) {
    if (namespaceCounts[namespace] !== count) {
      fail(`Solana capability status: expected ${count} ${namespace} rows, received ${namespaceCounts[namespace] ?? 0}`)
    }
  }
}
for (const expected of [
  '| `@App.get` | extended runtime | unverified | source parity only | LIVE-CROSS-APP-PROOF |',
  '| `@App.set` | extended runtime | unverified | source parity only | LIVE-CROSS-APP-PROOF |',
  '| `@AccountPlugin.getAccountAddress` | legacy runtime | unverified | source parity only | LIVE-PENDING; DEVNET-ESCROW-SENTINEL |',
  '| `DEVNET-ESCROW-SENTINEL` | `@AccountPlugin.getAccountAddress(@contract.address)` is unsupported on the current deployed Devnet runtime; bind the current Devnet program ID as a string argument when resolving the escrow. |',
  '| `@DeFiPlugin.swap` | legacy runtime | unsupported | not run | NO-DEVNET-JUPITER |',
  '| `@DeFiPlugin.createMeteoraConfig` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |',
  '| `@PhoenixPerpsPlugin.placeLong` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |',
  '| `@CPI.kaminoBorrow` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4 |',
  '| `@PumpFunPlugin.createToken` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |',
  '| `@TensorPlugin.buyNft` | legacy runtime | unverified | source parity only | LIVE-TENSOR-PROOF |',
  '| `@Solana.invokeAttested` | extended disabled | unsupported | not applicable | DISABLED |',
  '`@TokenPlugin.USDC` is mainnet-only',
  '`@PriceFeedPlugin.getPriceFeed` returns a decimal `String`',
  'Actual chain-query execution requires an authenticated `userAddress`',
]) {
  if (!solanaCapabilityStatus.includes(expected)) {
    fail(`Solana capability status: missing required boundary ${expected}`)
  }
}
if (/\| supported \|/.test(solanaCapabilityStatus) || /\| live_devnet_pass \|/.test(solanaCapabilityStatus)) {
  fail('Solana capability status: claims a live-supported function without a published receipt')
}

const policyPrimitives = readFileSync(path.join(root, 'bounded-onchain/docs/policy-primitives.md'), 'utf8')
for (const expected of [
  '`@contract.address` evaluates to the deployed Bounded Solana program ID',
  '`@AccountPlugin.getAccountAddress(@contract.address)` is unsupported on the current deployed Devnet runtime',
  '`@AccountPlugin.getAccountAddress("openTv7fbpYSseNHYmCZFZ1CZgj4r8D9fKNgEz1qo6F")`',
  'Every `@Solana.invoke` meta address must resolve to a concrete base58 public key',
  'Address resolution does not grant signing authority.',
  'Solana accounts are world-readable',
  'Every account sample must use finalized commitment',
  '"query": "@Solana.rentExemption(@data.space)"',
  'Require exactly `schemaVersion`, `release`, `environment`, `protocol`, `commit`, `appId`, `artifactSha256`, `policy`, `targets`, and `program`.',
  'one Devnet `getMultipleAccounts` request with base64 encoding and finalized commitment',
  '`deployment.apps` contains exactly the authenticated primary and cross-app target publications',
  'Every action-evidence entry contains exactly `actionId`, `contract`, `publicTransactionSignatures`, `transactions`, and `postconditions`.',
  'Reject duplicate action IDs, no-op actions, inherited postconditions, invented postconditions, contract drift',
]) {
  if (!policyPrimitives.includes(expected)) fail(`Solana policy primitives: missing contract-address boundary ${expected}`)
}
if (
  /\bUse `@AccountPlugin\.getAccountAddress\(@contract\.address\)`/u.test(publicText) ||
  /"query":\s*"@AccountPlugin\.getAccountAddress\(@contract\.address\)"/u.test(publicText)
) {
  fail('public Solana guidance still recommends the unsupported Devnet escrow-sentinel composition')
}

const solanaTrading = readFileSync(path.join(root, 'bounded-onchain/docs/onchain-trading.md'), 'utf8')
for (const expected of [
  'There is no `getPhUSDBalance` function',
  '`getMeteoraVirtualPoolAddress` / `getDammV2PoolAddress` / `getCpAmmPoolAddress`',
  'a program-ID sentinel that this built-in plugin resolves to the app escrow PDA',
]) {
  if (!solanaTrading.includes(expected)) fail(`Solana trading guide: missing catalog correction ${expected}`)
}
const solanaOnchain = readFileSync(path.join(root, 'bounded-onchain/docs/onchain.md'), 'utf8')
if (solanaOnchain.includes('@MathPlugin.getRandom')) {
  fail('Solana onchain guide: contains nonexistent @MathPlugin.getRandom')
}
for (const expected of [
  'receipt deliberately contains only `transactionId` and `chain`',
  'It never returns the raw server transaction, serialized transaction, or signed',
  'An onchain update object is a patch, not a replacement document.',
  'omit it from every update payload',
  'Anchor error name `FieldReadOnly`',
  'Treat the live Anchor `Error Code` name and `Error Message` as authoritative',
  'Do not renumber program errors merely to make a local numeric table agree.',
]) {
  if (!solanaOnchain.includes(expected)) fail(`Solana onchain guide: missing required boundary ${expected}`)
}

const cliReference = readFileSync(path.join(root, 'bounded-deploy/docs/cli-reference.md'), 'utf8')
for (const expected of [
  '{"transactionId":"<public-signature>","chain":"solana_devnet"}',
  'The JSON receipt never includes the raw server response, serialized',
  'Confirm `transactionId` independently at the required commitment',
  'a non-empty `BOUNDED_PRIVATE_KEY` overrides',
  '"keySource": "global"',
  '"keyLocation": "global (~/.bounded/credentials)"',
  '`keySource` is one of `global`, `project`, `env`, `web`, `profile`, or `unknown`',
  '"action": "deployPolicy"',
  '"policyDeployReceipt": {',
  '`policyDeployReceipt.status` is a separate app publication status',
  'operation-bound readback or recovery receipt may report `null`',
  'Never require receipt `status` to equal `committed` or `deployed`.',
  '### Recover an in-progress policy deploy',
  '"code": "deploy_in_progress"',
  '"recoveryCommand": "bounded deploy ./policy.json',
  'The server does not expose a recovery ID to collaborators, admins',
  'An older ambiguous Solana Devnet operation that predates the raw request hash can qualify only',
  'The CLI binds the exact operation and exact policy and never submits a second policy mutation.',
  'HTTP `202` with `state: "processing"`',
  'A normal deploy whose first policy mutation has an ambiguous outcome uses this same readback/recovery loop automatically.',
  'It returns to polling after `202` instead of submitting the policy mutation again.',
  'reads the finalized onchain policy inventory',
  'publishes the frozen app/runtime target without replaying an onchain mutation',
  'The retained operation becomes terminal and a fresh normal `bounded deploy`',
  'the operation remains locked and pollable',
  'the operation remains locked for manual intervention',
  'Do not infer success from a human line',
  'still requires an existing app ID',
]) {
  if (!cliReference.includes(expected)) fail(`CLI reference: missing sanitized onchain receipt contract ${expected}`)
}

const rootSkill = readFileSync(path.join(root, 'bounded/SKILL.md'), 'utf8')
for (const expected of [
  '`409` + `deploy_in_progress` / `operationId`',
  '`202` with `state: "processing"`',
  'let it poll and do not start a normal deploy',
]) {
  if (!rootSkill.includes(expected)) fail(`Bounded root skill: missing policy recovery boundary ${expected}`)
}

const deploySkill = readFileSync(path.join(root, 'bounded-deploy/SKILL.md'), 'utf8')
for (const expected of [
  '`deploy_in_progress` with an `operationId`',
  'The verified app owner must run the exact emitted `recoveryCommand`',
  '`202` with `state: "processing"`',
  'exact finalized target publishes the frozen app/runtime target without replaying an onchain mutation',
  'Unavailable finalized state remains locked and pollable',
  'partial or contradictory state remains locked for manual intervention',
]) {
  if (!deploySkill.includes(expected)) fail(`Bounded deploy skill: missing policy recovery boundary ${expected}`)
}

for (const dropIn of ['agents/AGENTS.md', 'agents/cursor-bounded.mdc', 'agents/windsurfrules.md']) {
  const source = readFileSync(path.join(root, dropIn), 'utf8')
  for (const expected of [
    '`deploy_in_progress` with an `operationId`',
    'runs the exact emitted `recoveryCommand` with unchanged policy inputs',
    '`202` with',
    'A normal deploy with an ambiguous outcome uses that polling loop',
    'without replaying an onchain mutation',
    'An older ambiguous Devnet operation can use the same recovery path only when',
    'unavailable state stays locked and pollable',
    'partial state requires',
  ]) {
    if (!source.includes(expected)) fail(`${dropIn}: missing public policy recovery boundary ${expected}`)
  }
}

const keySafety = readFileSync(path.join(root, 'bounded-deploy/docs/key-and-account-safety.md'), 'utf8')
for (const expected of [
  'a non-empty `BOUNDED_PRIVATE_KEY` has higher',
  'run `bounded whoami --json` and require the expected `keySource`',
  '`account.keySource:"web"` continues to use the web session',
  'The separate `keyLocation` field carries the descriptive source',
]) {
  if (!keySafety.includes(expected)) fail(`Key safety guide: missing identity precedence boundary ${expected}`)
}

const sdkReference = readFileSync(path.join(root, 'bounded-frontend/docs/sdk-reference.md'), 'utf8')
for (const expected of [
  'The runtime stages those fields into `@newData`',
  'requires an authenticated `userAddress`',
  'returns a decimal `String`',
  'does not activate standalone chain execution for an `onchain: false` path',
]) {
  if (!sdkReference.includes(expected)) fail(`SDK reference: missing Solana query boundary ${expected}`)
}

const dataPlane = readFileSync(path.join(root, 'bounded-backend/docs/data-plane.md'), 'utf8')
for (const expected of [
  '### Require companion writes with `requiresInBatch`',
  'code `incomplete_batch`',
  'A single-document set or delete is still a batch of one',
  'It is not an SMT proof obligation',
]) {
  if (!dataPlane.includes(expected)) fail(`Data plane: missing requiresInBatch contract ${expected}`)
}
const policyReference = readFileSync(path.join(root, 'bounded-backend/docs/policy-reference.md'), 'utf8')
if (!policyReference.includes('| `requiresInBatch` |')) {
  fail('Policy reference: missing requiresInBatch collection key')
}
for (const expected of [
  'The deployed Bounded Solana program-ID sentinel',
  'Omitted fields remain in the final document',
  'rejects it with `FieldReadOnly`, even when the supplied value is unchanged',
]) {
  if (!policyReference.includes(expected)) fail(`Policy reference: missing onchain update boundary ${expected}`)
}
const randomness = readFileSync(path.join(root, 'bounded-onchain/docs/randomness.md'), 'utf8')
for (const expected of [
  '### Freeze the resolution basis before the roll is readable',
  'non-blocking `UNKNOWN` advisory',
  'write-once snapshot',
]) {
  if (!randomness.includes(expected)) fail(`Randomness guide: missing VRF basis advisory ${expected}`)
}

const reactNative = readFileSync(path.join(root, 'bounded-frontend/docs/building-for-react-native.md'), 'utf8')
if (!/guest auth boundary on React Native/i.test(reactNative) || !/WebCrypto[\s\S]*IndexedDB/.test(reactNative)) {
  fail('React Native guide: missing the current secure guest-auth boundary')
}
for (const expected of [
  '@privy-io/expo@0.70.1',
  'from "@privy-io/expo/ui"',
  'decode as atob, encode as btoa',
  'PrivyElements',
  'useLogin',
  'clientId={PRIVY_CLIENT_ID}',
  'createOnLogin: "all-users"',
  '"wallets" in walletState',
  'provider.request',
  'method: "signMessage"',
  'method: "signTransaction"',
  'method: "signAndSendTransaction"',
]) {
  if (!reactNative.includes(expected)) fail(`React Native Privy guide: missing ${expected}`)
}
if (/login:\s*privy\.login\b|provider\.(?:signMessage|signTransaction|signAndSendTransaction)\b/.test(reactNative)) {
  fail('React Native Privy guide: contains the retired direct Privy 0.70 method shape')
}
const anonymousAccounts = readFileSync(path.join(root, 'bounded-frontend/docs/anonymous-accounts.md'), 'utf8')
if (!/two-login handoff/i.test(anonymousAccounts) || !/restoredGuest\.id !== pending\.guestId/.test(anonymousAccounts)) {
  fail('anonymous account guide: missing the old-owner guest migration protocol')
}
for (const expected of [
  'const real = await completeLoginFromRedirect()',
  'const raw = sessionStorage.getItem(HANDOFF_KEY)',
  'if (!raw) return real',
  'Guest handoff state was invalid and was cleared.',
  'if (account.owner === realId) continue',
  'sessionStorage.removeItem(HANDOFF_KEY)',
]) {
  if (!anonymousAccounts.includes(expected)) fail(`anonymous account guide: missing safe callback fragment ${expected}`)
}
if (/JSON\.parse\(sessionStorage\.getItem\([^)]*\)!\)/.test(anonymousAccounts)) {
  fail('anonymous account guide: dereferences handoff storage without a missing-state guard')
}
if (anonymousAccounts.indexOf('const real = await completeLoginFromRedirect()') > anonymousAccounts.indexOf('const raw = sessionStorage.getItem(HANDOFF_KEY)')) {
  fail('anonymous account guide: must complete ordinary hosted login before reading optional handoff state')
}

const functionsGuide = readFileSync(path.join(root, 'bounded-backend/docs/functions.md'), 'utf8')
for (const expected of [
  '"SUBS_SYNC_ACTOR": "AK5RcyBCHnMmiS9KN1RMPktVKpjeEZKMhV6oe6r7m9Hm"',
  '"actAs": "AK5RcyBCHnMmiS9KN1RMPktVKpjeEZKMhV6oe6r7m9Hm"',
  'await ctx.bounded.set(`subs/${userId}`',
  '{"customerId":"cus_123"}',
  'The original admin is not ctx.user.',
]) {
  if (!functionsGuide.includes(expected)) fail(`Functions guide: missing safe sync example fragment ${expected}`)
}
if (/"subs\/\$userId"\s*:\s*\{[\s\S]{0,400}?"create"\s*:\s*"false"/.test(functionsGuide)) {
  fail('Functions guide: sync example still denies the Function create path')
}
const syncPolicySource = functionsGuide.match(/## Declare a function \(policy\)[\s\S]*?```json\n([\s\S]*?)\n```/)?.[1]
if (!syncPolicySource) {
  fail('Functions guide: could not extract the sync policy example')
} else {
  try {
    JSON.parse(syncPolicySource)
  } catch (error) {
    fail(`Functions guide: sync policy example is invalid JSON: ${error.message}`)
  }
}

const proofBoundaryChecks = [
  ['bounded-backend/docs/functions-when-to-use.md', 'Authorization rules are **enforced** atomically. Declared invariants and generated safety obligations are **proved where supported**'],
  ['bounded-backend/docs/functions.md', 'A query participates in a proof only when a supported proof obligation references it.'],
  ['bounded-backend/docs/functions.md', '**enforced** — collection authorization rules on every'],
  ['bounded-backend/docs/queries.md', 'The runtime enforces the resulting authorization decision'],
  ['bounded-frontend/docs/sdk-reference.md', 'Policy `queries` are validated'],
  ['bounded-frontend/docs/frontend-hosting.md', 'runtime-enforced anonymous read rule'],
]
for (const [file, expected] of proofBoundaryChecks) {
  if (!readFileSync(path.join(root, file), 'utf8').includes(expected)) {
    fail(`${file}: missing precise proof-boundary language ${expected}`)
  }
}

const frontendHosting = readFileSync(path.join(root, 'bounded-frontend/docs/frontend-hosting.md'), 'utf8')
for (const expected of ['bounded site preview --app-id <id>', '--host <host>', '--ttl', '--open']) {
  if (!frontendHosting.includes(expected)) fail(`Frontend hosting guide: missing current private preview guidance ${expected}`)
}

if (process.argv.includes('--verify-policies')) {
  const temp = mkdtempSync(path.join(tmpdir(), 'bounded-skill-validate-'))
  try {
    const policies = [
      'bounded-backend/examples/ownership.policy.json',
      'bounded-onchain/examples/oapps-tokenomics/policy.verify-today.json',
      'bounded-onchain/examples/oapps-tokenomics/policy.json',
    ].map((policy) => ({ label: policy, file: policy }))
    if (syncPolicySource) {
      const file = path.join(temp, 'functions-sync.policy.json')
      writeFileSync(file, `${syncPolicySource}\n`)
      policies.push({ label: 'bounded-backend/docs/functions.md sync policy', file })
    }
    for (const policy of policies) {
      const result = spawnSync('bounded', ['verify', policy.file, '--quiet'], {
        cwd: root,
        encoding: 'utf8',
      })
      if (result.status !== 0) {
        fail(`${policy.label}: bounded verify failed\n${result.stdout}${result.stderr}`)
      }
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

if (errors.length > 0) {
  console.error(`Skill validation failed (${errors.length}):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Skill validation passed: ${expectedPublicSkills.length} public skills, ${textFiles.length} text files, ${skillFiles.length} skill manifests.`)
