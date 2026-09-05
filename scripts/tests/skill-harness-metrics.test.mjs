import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { extractMetrics } from '../skill-harness/lib/metrics.mjs'
import { summarize } from '../skill-harness/lib/summary.mjs'
import { fileURLToPath } from 'node:url'

const use = (id, name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } })
const result = (id, content, extra = {}) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content, ...extra }] } })

test('returned text counts partial, repeated and shell reads without charging the whole file', () => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'skill-metrics-'))
  try {
    const file = path.join(work, '.claude/skills/bounded/SKILL.md')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'First line.\nSecond line with café.\nThird line.\n')
    const line = '1→First line.\n'
    const shell = execFileSync('cat', [file], { encoding: 'utf8' })
    const events = [
      use('one', 'Read', { file_path: file, offset: 1, limit: 1 }), result('one', line),
      use('two', 'Read', { file_path: file, offset: 1, limit: 1 }), result('two', line),
      use('three', 'Bash', { command: `cat '${file}'` }), result('three', shell),
    ]
    const metrics = extractMetrics(events, work)
    assert.equal(metrics.observedToolResultTextBytes, 2 * Buffer.byteLength(line) + Buffer.byteLength(shell))
    assert.equal(metrics.toolResultTextBytesByTool.Read, 2 * Buffer.byteLength(line))
    assert.equal(metrics.toolResultTextBytesByTool.Bash, Buffer.byteLength(shell))
    assert.equal(metrics.skillFileFootprintBytes, readFileSync(file).length)
    assert.equal(metrics.toolResultCoverage, 'complete')
    assert.equal('skillBytesRead' in metrics, false)
    rmSync(path.join(work, '.claude'), { recursive: true })
    const rechecked = extractMetrics(events, work, { previousMetrics: metrics })
    assert.equal(rechecked.observedToolResultTextBytes, metrics.observedToolResultTextBytes)
    assert.equal(rechecked.skillFileFootprintBytes, metrics.skillFileFootprintBytes)
    assert.equal(rechecked.skillFileFootprintSource, 'recorded')
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('shell-only reads are measured without guessing their source files', () => {
  const metrics = extractMetrics([use('shell', 'Bash', { command: 'cat "$PAGE" | head -2' }), result('shell', 'returned text')], '/tmp/work')
  assert.equal(metrics.observedToolResultTextBytes, Buffer.byteLength('returned text'))
  assert.equal(metrics.toolResultTextBytesByTool.Bash, metrics.observedToolResultTextBytes)
  assert.equal(metrics.skillFileFootprintBytes, 0)
  assert.equal(metrics.toolResultCoverage, 'complete')
})

test('error text and text blocks count; duplicate delivery and parsed metadata do not', () => {
  const response = result('r', [{ type: 'text', text: 'café' }, { type: 'text', text: ' declined' }], { is_error: true })
  response.tool_use_result = { output: 'metadata that was not in the model-facing result' }
  const metrics = extractMetrics([use('r', 'Read', { file_path: '/tmp/not-a-skill' }), response, response], '/tmp/work')
  assert.equal(metrics.observedToolResultTextBytes, Buffer.byteLength('café declined'))
  assert.equal(metrics.toolResultsObserved, 1)
  assert.equal(metrics.toolResultCoverage, 'complete')
})

test('partial and missing traces stay distinguishable from a measured zero', () => {
  const call = use('r', 'Read', { file_path: '/tmp/not-a-skill' })
  const missing = extractMetrics([call], '/tmp/work')
  assert.equal(missing.observedToolResultTextBytes, null)
  assert.equal(missing.toolResultCoverage, 'unavailable')
  assert.equal(missing.toolCallsWithoutResult, 1)
  assert.equal(extractMetrics([], '/tmp/work').observedToolResultTextBytes, null)
  const zero = extractMetrics([call, result('r', '')], '/tmp/work')
  assert.equal(zero.observedToolResultTextBytes, 0)
  assert.equal(zero.toolResultCoverage, 'complete')
  const partial = extractMetrics([call, result('r', 'one'), use('s', 'Bash', { command: 'unfinished' })], '/tmp/work')
  assert.equal(partial.observedToolResultTextBytes, 3)
  assert.equal(partial.toolResultCoverage, 'partial')
  assert.equal(partial.toolCallsWithoutResult, 1)
  const image = extractMetrics([call, result('r', [{ type: 'text', text: 'one' }, { type: 'image', source: { data: 'opaque' } }])], '/tmp/work')
  assert.equal(image.observedToolResultTextBytes, 3)
  assert.equal(image.toolResultNonTextBlocks, 1)
  assert.equal(image.toolResultCoverage, 'partial')
  const unmatched = extractMetrics([result('unknown', 'one')], '/tmp/work')
  assert.equal(unmatched.unmatchedToolResults, 1)
  assert.equal(unmatched.toolResultCoverage, 'partial')
  const unparsed = extractMetrics([call, result('r', 'one'), { type: 'unparsed', line: 'lost event' }], '/tmp/work')
  assert.equal(unparsed.toolResultCoverage, 'partial')
})

test('a removed skill copy can retain only its recorded footprint, not invented read bytes', () => {
  const work = mkdtempSync(path.join(os.tmpdir(), 'skill-metrics-legacy-'))
  try {
    const events = [use('r', 'Read', { file_path: path.join(work, '.claude/skills/bounded/SKILL.md'), limit: 1 })]
    const old = { skillBytesRead: 5000 }
    const metrics = extractMetrics(events, work, { previousMetrics: old })
    assert.equal(metrics.skillFileFootprintBytes, 5000)
    assert.equal(metrics.skillFileFootprintSource, 'legacy-recorded')
    assert.equal(metrics.observedToolResultTextBytes, null)
    assert.equal(metrics.toolResultCoverage, 'unavailable')
    const absent = extractMetrics(events, work)
    assert.equal(absent.skillFileFootprintBytes, null)
    assert.equal(absent.skillFileFootprintSource, 'unavailable')
    assert.deepEqual(absent.skillFilesUnavailable, ['bounded/SKILL.md'])
    const withResult = extractMetrics([...events, result('r', 'tiny')], work, { previousMetrics: old })
    assert.equal(withResult.observedToolResultTextBytes, 4)
    assert.equal(withResult.skillFileFootprintBytes, 5000)
  } finally { rmSync(work, { recursive: true, force: true }) }
})

test('usage preserves cache categories and unknown totals rather than silently adding zero', () => {
  const usage = { input_tokens: 3, cache_read_input_tokens: 5, cache_creation_input_tokens: 7, output_tokens: 11 }
  const metrics = extractMetrics([{ type: 'result', usage }], '/tmp/work')
  assert.equal(metrics.inputTokens, 15)
  assert.equal(metrics.uncachedInputTokens, 3)
  assert.equal(metrics.cacheReadInputTokens, 5)
  assert.equal(metrics.cacheCreationInputTokens, 7)
  assert.equal(metrics.outputTokens, 11)
  const absent = extractMetrics([{ type: 'result' }], '/tmp/work')
  assert.equal(absent.inputTokens, null)
  assert.equal(absent.outputTokens, null)
  const incomplete = extractMetrics([{ type: 'result', usage: { input_tokens: 3 } }], '/tmp/work')
  assert.equal(incomplete.uncachedInputTokens, 3)
  assert.equal(incomplete.inputTokens, null)
})

function record(metrics, clean = true) {
  return { task: 'fixture', phase: 'test', condition: 'with', metrics: { docsOpened: [], skillsLoaded: [], ...metrics }, canary: { clean }, checks: [], score: { allPass: true, fraction: 1 } }
}

test('summary means exclude incomplete and missing context samples, and still exclude dirty runs', () => {
  const records = [
    record({ observedToolResultTextBytes: 1024, toolResultCoverage: 'complete', skillFileFootprintBytes: 100, inputTokens: 20 }),
    record({ observedToolResultTextBytes: 2048, toolResultCoverage: 'complete', skillFileFootprintBytes: 200, inputTokens: 40 }),
    record({ observedToolResultTextBytes: 10, toolResultCoverage: 'partial', skillFileFootprintBytes: null, inputTokens: null }),
    record({ skillBytesRead: 300 }),
    record({ observedToolResultTextBytes: 999999, toolResultCoverage: 'complete', inputTokens: 999999 }, false),
  ]
  const c = summarize(records).tasks.fixture.conditions.with
  assert.equal(c.n, 4)
  assert.equal(c.canaryDirty, 1)
  assert.equal(c.meanToolResultTextBytes, 1536)
  assert.equal(c.contextSamples.toolResultTextBytes, 2)
  assert.equal(c.meanSkillFileFootprintBytes, 200)
  assert.equal(c.contextSamples.skillFileFootprintBytes, 3)
  assert.equal(c.meanInputTokens, 30)
  assert.equal(c.contextSamples.inputTokens, 2)
  assert.deepEqual(c.toolResultCoverage, { complete: 2, partial: 1, unavailable: 1 })
  assert.equal(summarize([record({}, false)]).tasks.fixture.conditions.with.meanToolResultTextBytes, null)
})

test('report and usage commands show measured tool text separately from legacy file footprints', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'skill-metrics-report-'))
  try {
    const current = record({ observedToolResultTextBytes: 1024, toolResultCoverage: 'complete', skillFileFootprintBytes: 2048, inputTokens: 30 })
    const old = record({ skillBytesRead: 4096 })
    const label = path.join(tmp, 'current')
    for (const [i, r] of [current, old].entries()) {
      const dir = path.join(label, 'runs/fixture/with', String(i))
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, 'run.json'), JSON.stringify(r))
    }
    writeFileSync(path.join(label, 'summary.json'), JSON.stringify(summarize([current, old])))
    const legacy = path.join(tmp, 'legacy')
    mkdirSync(legacy)
    writeFileSync(path.join(legacy, 'summary.json'), JSON.stringify({ runs: 1, tasks: { fixture: { task: 'fixture', phase: 'test', conditions: { with: { n: 1, meanSkillBytes: 4096, checks: {}, docs: {}, skills: {} } } } } }))
    const reportPath = fileURLToPath(new URL('../skill-harness/report.mjs', import.meta.url))
    const output = execFileSync(process.execPath, [reportPath, label, legacy], { encoding: 'utf8' })
    assert.match(output, /1\.0 \(n=1\/2\)/)
    assert.match(output, /- \(n=0\/1\)/)
    assert.match(output, /4\.0 \(legacy\)/)
    assert.doesNotMatch(output, /skill bytes read|undefined|NaN/)
    const lift = execFileSync(process.execPath, [reportPath, label], { encoding: 'utf8' })
    assert.match(lift, /1\.0 \(n=1\/2\)/)
    const skill = path.join(tmp, 'skills')
    for (const name of ['bounded', 'bounded-backend', 'bounded-frontend', 'bounded-deploy', 'bounded-onchain', 'oapps-fun']) mkdirSync(path.join(skill, name), { recursive: true })
    const usagePath = fileURLToPath(new URL('../skill-harness/usage.mjs', import.meta.url))
    const usage = execFileSync(process.execPath, [usagePath, label, skill], { encoding: 'utf8' })
    assert.match(usage, /1\.0 \(n=1\)/)
    assert.match(usage, /30 \(n=1\)/)
    assert.doesNotMatch(usage, /mean skill bytes|undefined|NaN/)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
