// Extract behaviour and cost metrics from a subject run's stream-json events.
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

export function toolUses(events) {
  const out = []
  for (const e of events) {
    if (e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) continue
    for (const c of e.message.content) if (c.type === 'tool_use') out.push(c)
  }
  return out
}

export function assistantText(events) {
  const parts = []
  for (const e of events) {
    if (e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) continue
    for (const c of e.message.content) if (c.type === 'text' && c.text) parts.push(c.text)
  }
  return parts.join('\n')
}

// Outside the fixture, only these count as leaving for material the subject was not
// given: another run under the harness root, the home tree (npm/nvm caches and the
// real CLI binary excepted), any .claude/skills. Scratch under /tmp does not.
export function isForeign(p, work) {
  const outRoot = path.resolve(work, '..', '..', '..', '..', '..', '..')
  if (p.startsWith(outRoot + path.sep)) return true
  if (/\.claude\/skills/.test(p)) return true
  if (/^\/(Users|home)\/[^/]+\//.test(p) && !/node_modules|\/\.npm\/|\/\.nvm\/|\/\.local\/bin\/bounded$|\/\.cache\//.test(p)) return true
  return false
}

export function extractMetrics(events, work) {
  const result = events.find((e) => e.type === 'result') || {}
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init') || {}
  const uses = toolUses(events)
  const toolCounts = {}
  for (const u of uses) toolCounts[u.name] = (toolCounts[u.name] || 0) + 1
  const skillsRoot = path.join(work, '.claude', 'skills') + path.sep
  const docsOpened = []
  const escapes = []
  let skillBytesRead = 0
  const seen = new Set()
  for (const u of uses) {
    const fp = u.input && (u.input.file_path || u.input.path)
    if (!fp || typeof fp !== 'string') continue
    const abs = path.isAbsolute(fp) ? fp : path.join(work, fp)
    if (['Read', 'Glob', 'Grep'].includes(u.name) && !abs.startsWith(work + path.sep) && abs !== work && isForeign(abs, work)) escapes.push({ tool: u.name, path: abs })
    if (u.name === 'Read' && abs.startsWith(skillsRoot)) {
      const rel = abs.slice(skillsRoot.length)
      docsOpened.push(rel)
      if (!seen.has(rel) && existsSync(abs)) { seen.add(rel); skillBytesRead += statSync(abs).size }
    }
  }
  const skillsLoaded = uses.filter((u) => u.name === 'Skill').map((u) => u.input && u.input.skill).filter(Boolean)
  for (const s of skillsLoaded) {
    const p = path.join(skillsRoot, s, 'SKILL.md')
    if (!seen.has(`${s}/SKILL.md`) && existsSync(p)) { seen.add(`${s}/SKILL.md`); skillBytesRead += statSync(p).size }
  }
  const bash = uses.filter((u) => u.name === 'Bash').map((u) => u.input && u.input.command).filter(Boolean)
  // A shell command that leaves the fixture for material it was not given is an
  // escape: another run under the harness root, the home tree, any .claude/skills,
  // parent traversal, a filesystem-wide find. Scratch files under /tmp are not.
  const outRoot = path.resolve(work, '..', '..', '..', '..', '..', '..')
  const ABS = /(?:^|[\s'"=:])(\/(?:private|Users|tmp|var|home|opt)\/[^\s'"`;|)]*)/g
  for (const cmd of bash) {
    let m
    while ((m = ABS.exec(cmd))) {
      const p = m[1]
      if (p.startsWith(work + path.sep) || p === work) continue
      // Executing its own shim by absolute path (after `which bounded`) is normal; reading it is not.
      const ownBin = path.join(path.dirname(work), 'bin')
      if (p.startsWith(ownBin) && !/\b(cat|less|more|head|tail|sed|awk|grep|bat|strings|file|wc)\b[^|;&]*bin\/bounded/.test(cmd)) continue
      if (isForeign(p, work)) escapes.push({ tool: 'Bash', path: p, command: cmd.slice(0, 160) })
    }
    if (/(^|[\s;&|])cd\s+\.\.|\.\.\/\.\.|find\s+\/\s|find\s+~|ls\s+~|\$HOME\b|~\/\.claude/.test(cmd)) escapes.push({ tool: 'Bash', path: '(traversal)', command: cmd.slice(0, 160) })
    // Outbound network from the shell is how a subject fetches material it was
    // not given (the public repo holds the contract tests). A network client
    // aimed anywhere but the loopback is an escape; package managers are not
    // flagged (registry installs are part of real frontend work).
    if (/\b(curl|wget|aria2c|ncat|websocat)\b|\bgit\s+(clone|fetch|pull|ls-remote)\b|\bnc\s+-?\w*\s+\S+\s+\d+/.test(cmd)) {
      const hosts = [...cmd.matchAll(/(?:https?:\/\/|git@|ftp:\/\/)?\b((?:[a-z0-9-]+\.)+[a-z]{2,}|localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/gi)].map((x) => x[1].toLowerCase())
      const allLocal = hosts.length > 0 && hosts.every((h) => ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(h))
      if (!allLocal) escapes.push({ tool: 'Bash', path: '(network)', command: cmd.slice(0, 160) })
    }
  }
  const rate = [...events].reverse().find((e) => e.type === 'rate_limit_event')
  const u = result.usage || {}
  return {
    costUsd: result.total_cost_usd ?? null,
    turns: result.num_turns ?? null,
    durationMs: result.duration_ms ?? null,
    stopReason: result.stop_reason ?? result.subtype ?? null,
    isError: Boolean(result.is_error),
    inputTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
    outputTokens: u.output_tokens || 0,
    toolCounts,
    docsOpened,
    skillsLoaded,
    skillBytesRead,
    bash,
    escapes,
    initTools: init.tools || [],
    initMcp: init.mcp_servers || [],
    rateLimitUtilization: rate && rate.rate_limit_info && rate.rate_limit_info.unifiedWindows ? rate.rate_limit_info.unifiedWindows : null,
    finalText: typeof result.result === 'string' ? result.result : '',
  }
}
