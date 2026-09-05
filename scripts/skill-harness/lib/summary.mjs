import { skillFileFootprint } from './metrics.mjs'

const contextKeys = ['skillFileFootprintBytes', 'toolResultTextBytes', 'inputTokens', 'uncachedInputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'outputTokens']

export function addContextMetrics(target, metrics) {
  target.contextSamples ||= {}
  target.toolResultCoverage ||= { complete: 0, partial: 0, unavailable: 0 }
  const coverage = ['complete', 'partial'].includes(metrics.toolResultCoverage) ? metrics.toolResultCoverage : 'unavailable'
  target.toolResultCoverage[coverage]++
  const values = {
    ...metrics,
    skillFileFootprintBytes: skillFileFootprint(metrics),
    // Partial traces remain visible in each run, but must not dilute the mean
    // used to compare complete traces against one another.
    toolResultTextBytes: coverage === 'complete' ? metrics.observedToolResultTextBytes : null,
  }
  for (const key of contextKeys) {
    target[key] ??= 0
    target.contextSamples[key] ??= 0
    if (!Number.isFinite(values[key]) || values[key] < 0) continue
    target[key] += values[key]
    target.contextSamples[key]++
  }
}

export function finishContextMetrics(target) {
  for (const key of contextKeys) {
    const n = target.contextSamples?.[key] || 0
    target[`mean${key[0].toUpperCase()}${key.slice(1)}`] = n ? target[key] / n : null
  }
}

export function summarize(records) {
  const byTask = {}
  for (const r of records) {
    const t = (byTask[r.task] ||= { task: r.task, phase: r.phase, conditions: {} })
    const c = (t.conditions[r.condition] ||= { n: 0, allPass: 0, fraction: 0, cost: 0, turns: 0, checks: {}, docs: {}, skills: {}, canaryDirty: 0, timeouts: 0 })
    // Dirty runs (canary hit or escape) are void: counted, never scored.
    if (!r.canary.clean) { c.canaryDirty++; continue }
    c.n++; c.allPass += r.score.allPass ? 1 : 0; c.fraction += r.score.fraction; c.cost += r.metrics.costUsd || 0; c.turns += r.metrics.turns || 0
    addContextMetrics(c, r.metrics)
    c.timeouts += r.timedOut ? 1 : 0
    for (const ch of r.checks) { const k = (c.checks[ch.id] ||= { pass: 0, n: 0 }); k.n++; k.pass += ch.pass ? 1 : 0 }
    for (const d of new Set(r.metrics.docsOpened)) c.docs[d] = (c.docs[d] || 0) + 1
    for (const s of new Set(r.metrics.skillsLoaded)) c.skills[s] = (c.skills[s] || 0) + 1
  }
  for (const t of Object.values(byTask)) for (const c of Object.values(t.conditions)) {
    finishContextMetrics(c)
    if (!c.n) { c.allPassRate = null; c.meanFraction = null; c.meanCost = null; c.meanTurns = null; continue }
    c.allPassRate = c.allPass / c.n; c.meanFraction = c.fraction / c.n; c.meanCost = c.cost / c.n; c.meanTurns = c.turns / c.n
    for (const k of Object.values(c.checks)) k.rate = k.pass / k.n
  }
  return { contextMetricsVersion: 2, generatedAt: new Date().toISOString(), runs: records.length, tasks: byTask }
}
