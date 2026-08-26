import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The retry protocol must never make a deploy replayable. In particular,
// retrying `bounded deploy --create` can create another app.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const sources = [
  'bounded-deploy/SKILL.md',
  'bounded-deploy/docs/quickstart.md',
].map((file) => ({ file, source: readFileSync(path.join(root, file), 'utf8') }))

for (const { file, source } of sources) {
  test(`${file}: retries only bounded verify`, () => {
    assert.match(source, /proof_substrate_unavailable/, 'must identify the retryable proof failure')
    assert.match(source, /only to `bounded verify`|retry protocol never\s+applies to `bounded deploy`/, 'must limit the protocol to verify')
    assert.match(source, /never\s+retry\s+`bounded deploy --create`/, 'must prohibit replaying create deploys')
    assert.doesNotMatch(source, /from `bounded verify`\s+or `bounded deploy`|If verify or deploy returns/, 'must not restore deploy retry guidance')
  })

  test(`${file}: bounds verify retries and reports terminal failure`, () => {
    assert.match(source, /Wait 30 seconds/, 'must use the server retry delay')
    assert.match(source, /3 attempts total/, 'must cap total attempts at three')
    assert.match(source, /initial attempt plus 2 retries/, 'must make the retry count unambiguous')
    assert.match(source, /proving service is degraded|report the proving service as\s+degraded/, 'must report terminal degradation')
    assert.match(source, /correlationId/, 'must preserve the correlation id for support')
  })
}
