#!/usr/bin/env node

// Publishes the OpenApps skill family built from this repository.
//
//   node scripts/openapps/publish.mjs [--dry-run]
//
// It builds the family from the committed skills (build.mjs), replaces the
// contents of the OpenApps skill repository's main with it, and pushes one
// commit naming the source commit. Nothing is pushed when the build matches
// what is already published. .github/workflows/openapps-skill.yml runs this on
// every push to main, so publishing this repository publishes the OpenApps
// family too; run it by hand to republish.
//
// In CI the push authenticates with the OPENAPPS_SKILL_DEPLOY_KEY deploy key.
// Locally it uses your own git credentials for github.com.
//
// It finishes by printing the pin a CLI release needs for `openapps init`: the
// published commit, the SHA-256 of its GitHub archive, and of openapps/SKILL.md.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OPENAPPS_SKILL_REPO, build } from './build.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dryRun = process.argv.includes('--dry-run')

function die(message) {
  console.error(`openapps publish: ${message}`)
  process.exit(1)
}

function git(cwd, args, env = process.env) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env }).trim()
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function archiveSha256(commit) {
  const url = `https://github.com/${OPENAPPS_SKILL_REPO}/archive/${commit}.tar.gz`
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(url)
    if (response.ok) return sha256(Buffer.from(await response.arrayBuffer()))
    await new Promise((resolve) => setTimeout(resolve, attempt * 3000))
  }
  return `unavailable (fetch ${url} and hash it)`
}

const dirty = git(root, ['status', '--porcelain', '--', '.'])
if (dirty) die(`commit or discard local changes first; publishing builds what is committed:\n${dirty}`)
const source = git(root, ['rev-parse', 'HEAD'])

const work = mkdtempSync(path.join(tmpdir(), 'openapps-skill-publish-'))
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
let remote = `https://github.com/${OPENAPPS_SKILL_REPO}.git`
try {
  if (process.env.OPENAPPS_SKILL_DEPLOY_KEY) {
    const key = path.join(work, 'deploy-key')
    writeFileSync(key, process.env.OPENAPPS_SKILL_DEPLOY_KEY.trim() + '\n', { mode: 0o600 })
    env.GIT_SSH_COMMAND = `ssh -i ${key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`
    remote = `git@github.com:${OPENAPPS_SKILL_REPO}.git`
  }
  const clone = path.join(work, 'repo')
  execFileSync('git', ['clone', '--quiet', '--depth', '1', remote, clone], { env, stdio: 'inherit' })
  git(clone, ['symbolic-ref', 'HEAD', 'refs/heads/main'])

  const built = path.join(work, 'built')
  build({ out: built })
  for (const entry of readdirSync(clone)) {
    if (entry !== '.git') rmSync(path.join(clone, entry), { recursive: true, force: true })
  }
  cpSync(built, clone, { recursive: true })
  git(clone, ['add', '--all'])
  if (!git(clone, ['status', '--porcelain'])) {
    console.log(`${OPENAPPS_SKILL_REPO} already matches ${source}`)
  } else {
    const identity = process.env.CI
      ? ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com']
      : []
    git(clone, [...identity, 'commit', '--quiet', '-m', `Sync ${source.slice(0, 12)}`])
    if (dryRun) {
      console.log(`dry run: would push to ${OPENAPPS_SKILL_REPO} main:`)
      console.log(git(clone, ['show', '--stat', '--format=%s', 'HEAD']).split('\n').slice(0, 12).join('\n'))
    } else {
      execFileSync('git', ['-C', clone, 'push', '--quiet', remote, 'HEAD:main'], { env, stdio: 'inherit' })
      console.log(`published ${OPENAPPS_SKILL_REPO} main from ${source}`)
    }
  }
  if (!dryRun) {
    const published = git(clone, ['rev-parse', 'HEAD'])
    console.log('pin for the CLI (internal/skillinstall OpenApps pin):')
    console.log(`  commit          ${published}`)
    console.log(`  archive sha256  ${await archiveSha256(published)}`)
    console.log(`  root sha256     ${sha256(readFileSync(path.join(clone, 'openapps/SKILL.md')))}`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
