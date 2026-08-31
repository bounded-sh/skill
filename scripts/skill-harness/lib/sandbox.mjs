// Sandboxed subject runs: a fresh fixture directory per run, the skill family
// copied in (never the repo itself), a read-only `bounded` shim on PATH, every
// CLAUDE* variable scrubbed, and `claude -p` driven with isolation flags.
//
// Tier A isolation (process-level). The subject cannot see this repo, its
// tests, its git history, the maintainer CLAUDE.md, user settings, plugins,
// MCP servers, or the orchestrating conversation. HOME stays real: Claude Code's
// keychain credential is bound to the config-dir identity, so a fake HOME (plain,
// minimal config, or symlinked) is always "Not logged in". Residual holes: the
// filesystem and outbound network. lib/canary.mjs + the escape detector in
// lib/metrics.mjs void a run that uses them.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { writeShim } from './shim.mjs'

export const SKILL_FAMILY = ['bounded', 'bounded-backend', 'bounded-frontend', 'bounded-deploy', 'bounded-onchain', 'oapps-fun']

export function scrubEnv(env) {
  const out = {}
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('CLAUDE')) continue
    out[k] = v
  }
  return out
}

export function buildFixture({ runDir, skillDir, withSkill, files = {}, shim = {} }) {
  const work = path.join(runDir, 'work')
  mkdirSync(work, { recursive: true })
  if (withSkill) {
    for (const name of SKILL_FAMILY) {
      const src = path.join(skillDir, name)
      if (!existsSync(src)) throw new Error(`skill dir missing: ${src}`)
      cpSync(src, path.join(work, '.claude', 'skills', name), {
        recursive: true,
        filter: (s) => !s.split(path.sep).includes('.git'),
      })
    }
  }
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(work, rel)
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n')
  }
  const bin = path.join(runDir, 'bin')
  mkdirSync(bin, { recursive: true })
  writeShim({ binDir: bin, runDir, faults: shim.verifyFaults || 0 })
  return { work, bin }
}

export function runSubject({ work, bin, prompt, model, maxTurns, maxBudgetUsd, timeoutMs, env = process.env }) {
  const args = [
    '-p', prompt,
    '--model', model,
    '--output-format', 'stream-json',
    '--verbose',
    '--max-turns', String(maxTurns),
    '--max-budget-usd', String(maxBudgetUsd),
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--disallowedTools', 'WebFetch,WebSearch',
    '--permission-mode', 'bypassPermissions',
  ]
  const childEnv = scrubEnv(env)
  childEnv.PATH = `${bin}:${childEnv.PATH || ''}`
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn('claude', args, { cwd: work, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (code) => {
      clearTimeout(timer)
      const events = []
      for (const line of stdout.split('\n')) {
        const t = line.trim()
        if (!t) continue
        try { events.push(JSON.parse(t)) } catch { events.push({ type: 'unparsed', line: t.slice(0, 2000) }) }
      }
      resolve({ code, timedOut, stderr, events, wallMs: Date.now() - started })
    })
  })
}

export function readShimLog(runDir) {
  const p = path.join(runDir, 'bounded-shim.log')
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return { raw: l } } })
}
