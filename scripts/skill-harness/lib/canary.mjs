// Contamination canary. These strings exist only in maintainer context (this
// repo's tests, CLAUDE.md, the orchestrating conversation). A subject that
// emits or reads one did not learn it from the installed skill, so the run's
// isolation is broken and its result is void.
export const CANARY_PATTERNS = [
  // (bounded-monorepo, policy-e2e and extract-plugin-catalog are NOT canaries: the
  // public plugin pages, examples.md and plugin-catalog.json contain them.)
  /\bH00[0-9]\b/, /\bcp9311\b/i, /\bDS2-0\d{3}\b/, /scripts\/tests/,
  /skill-harness/, /validate\.mjs/, /em dash/i, /router-baseline/,
  // the maintainer checkout itself: a subject that reads or lists it did not learn from the installed skill
  /\/poof-new\/skill/, /\/Desktop\/workspace\//,
]

export function scanCanary(events, metrics, { condition } = {}) {
  const blob = JSON.stringify(events)
  const hits = []
  // A `with` subject reading the same family from the user-level install is
  // reading content it already has; not a contamination of its condition.
  const escapes = condition === 'with'
    ? metrics.escapes.filter((e) => !/\.claude\/skills\/(bounded|oapps-fun)/.test(e.path) && !/\.claude\/skills\/(bounded|oapps-fun)/.test(e.command || ''))
    : metrics.escapes
  for (const re of CANARY_PATTERNS) {
    const m = blob.match(re)
    if (m) hits.push({ pattern: re.source, sample: blob.slice(Math.max(0, m.index - 60), m.index + 80) })
  }
  return { hits, escapes, clean: hits.length === 0 && escapes.length === 0 }
}
