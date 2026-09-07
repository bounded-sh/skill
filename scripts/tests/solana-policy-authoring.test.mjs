import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const artifact = fileURLToPath(new URL('../../bounded-onchain/scripts/solana-policy.cjs', import.meta.url))
const builders = createRequire(import.meta.url)(artifact)
const options = {
  cluster: 'mainnet', source: { account: 'treasury' },
  config: 'A1BBtTYJd4i3xU8D6Tc2FzU6ZN4oXZWXKZnCxwbHXr8x',
  mint0: 'So11111111111111111111111111111111111111112',
  mint1: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  token0: 'spl', token1: 'spl', sqrtPriceX64: '18446744073709551616',
}

test('shipped authoring tool works without an installed SDK and preserves u128 precision', () => {
  assert.deepEqual(builders.splitLaunchU128('18446744073709551616'), { lo: '0', hi: '1' })
  const result = spawnSync(process.execPath, [artifact, 'createPool', '-'], {
    input: JSON.stringify(options), encoding: 'utf8', cwd: '/tmp',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), builders.buildClmmCreatePoolPolicy(options))
  assert.match(JSON.parse(result.stdout).expression, /signerName: "treasury"/)
})

test('invalid precision and inherited command names produce no policy output', () => {
  for (const [command, input] of [
    ['createPool', { ...options, sqrtPriceX64: 18446744073709551616 }],
    ['constructor', options],
  ]) {
    const result = spawnSync(process.execPath, [artifact, command, '-'], { input: JSON.stringify(input), encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.ok(result.stderr.length > 0)
  }
})
