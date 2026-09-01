// Contamination canary. These strings exist only in maintainer context (this
// repo's tests, CLAUDE.md, the orchestrating conversation). A subject that
// emits or reads one did not learn it from the installed skill, so the run's
// isolation is broken and its result is void.
export const CANARY_PATTERNS = [
  // (bounded-monorepo, policy-e2e and extract-plugin-catalog are NOT canaries: the
  // public plugin pages, examples.md and plugin-catalog.json contain them.)
  /\bH00[0-9]\b/, /\bcp9311\b/i, /\bDS2-0\d{3}\b/, /scripts\/tests/,
  /skill-harness/, /validate\.mjs/, /em dash/i, /router-baseline/,
  // (the maintainer checkout's own path is added at runtime via extraPatterns,
  // so the canary works on any machine, not just the one this was written on)
]

export function checkoutPatterns(...dirs) {
  return dirs.filter(Boolean).map((d) => new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, (ch) => '\\' + ch)))
}

export function scanCanary(events, metrics, { condition, allowEscapes, extraPatterns = [] } = {}) {
  const blob = JSON.stringify(events)
  const hits = []
  // No waiver for reading a user-level skill install: it can be a DIFFERENT
  // revision of the family than the one under test. allowEscapes is for the
  // isolation probe, whose whole job is to look around; its findings are read
  // by a human, never scored.
  const escapes = allowEscapes ? [] : metrics.escapes
  for (const re of [...CANARY_PATTERNS, ...extraPatterns]) {
    const m = blob.match(re)
    if (m) hits.push({ pattern: re.source, sample: blob.slice(Math.max(0, m.index - 60), m.index + 80) })
  }
  return { hits, escapes, clean: hits.length === 0 && escapes.length === 0 }
}
