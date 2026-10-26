#!/usr/bin/env node

// Builds the OpenApps skill family from this repository.
//
//   node scripts/openapps/build.mjs --out <dir>
//
// OpenApps users see one product, so its skills name the CLI `openapps` and the
// platform OpenApps. This repository stays the only source: the build reads the
// tracked files of the working tree, renames the bounded-* skills to
// openapps-*, folds the `bounded` router into the `openapps` root skill, and
// rewrites CLI commands and product names in the text. Package names, config
// files, environment variables and hosts are left alone because the runtime
// still answers to them. The build refuses when a relative link breaks, when a
// skill's frontmatter name does not match its folder, or when an expected
// section of the root skills is missing, so upstream drift fails loudly here
// instead of shipping a broken twin.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const here = path.dirname(fileURLToPath(import.meta.url))

export const OPENAPPS_SKILL_REPO = 'poofdotnew/openapps-skill'
export const OPENAPPS_CLI_PACKAGE = 'openapps'

const SOURCE_DIRS = ['bounded', 'bounded-backend', 'bounded-frontend', 'bounded-deploy', 'bounded-onchain', 'openapps', 'agents']
const SKILL_SUFFIXES = 'backend|frontend|deploy|onchain'
// Maintainer inputs of the generated plugin pages; agents read the pages.
const SKIPPED = [/^bounded-onchain\/data\//, /\/_fragments\//]
const TEXT_EXTENSIONS = new Set(['.md', '.mdc'])

// Subcommands of the CLI, plus retired ones the docs still name. A `bounded`
// followed by one of these is a command line; anywhere else the word is
// ordinary English ("bounded polling") and stays.
const CLI_COMMANDS = [
  'access', 'account', 'analytics', 'apps', 'audit', 'billing', 'builds', 'cap', 'clone', 'collaborators',
  'completion', 'create', 'dashboard', 'data', 'decisions', 'deploy', 'dev', 'domains', 'edit', 'evidence',
  'functions', 'help', 'init', 'link', 'live', 'live-edit', 'login', 'logout', 'oapp', 'plugins', 'proposals',
  'propose', 'pull', 'runtime', 'secret', 'secrets', 'services', 'share', 'site', 'subscribe', 'tests',
  'transfer-apps', 'unshare', 'update', 'upgrade', 'verify', 'version', 'wallet', 'whoami',
]

const ROOT_DESCRIPTION = [
  'Build and ship apps on OpenApps (openapps.xyz, formerly oapps.fun): start here for a complete app,',
  "including work by an app's own agent, its keys and capabilities, and opening, then load the focused",
  'OpenApps skill for backend, frontend, deployment, or onchain work.',
]

function die(message) {
  console.error(`openapps build: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { out: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i]
    else die(`unknown argument ${argv[i]}`)
  }
  if (!args.out) die('usage: build.mjs --out <dir>')
  return args
}

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function filesBelow(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...filesBelow(absolute))
    else files.push(absolute)
  }
  return files
}

// targetPath maps a source path to its place in the OpenApps family.
function targetPath(source) {
  const [top, ...rest] = source.split('/')
  let dir = top
  if (top === 'bounded') dir = 'openapps'
  else if (top.startsWith('bounded-')) dir = `openapps-${top.slice('bounded-'.length)}`
  const file = rest.join('/').replace(/(^|\/|-)bounded(?=[.-])/g, '$1openapps')
  return `${dir}/${file}`
}

const commandAlternation = CLI_COMMANDS.map((command) => command.replace('-', '\\-')).join('|')

// rewrite turns Bounded wording into OpenApps wording. Each rule is narrow on
// purpose: identifiers the runtime still reads (@bounded-sh/client, bounded.json,
// BOUNDED_*, ~/.bounded, ctx.bounded, bounded_ seeds, *.bounded.sh hosts) never
// match, and neither does the English adjective.
export function rewrite(text) {
  return text
    .replace(/^<!-- GENERATED FILE\.[\s\S]*?-->\n\n?/, '')
    .replace(/Without Node, the shell installer\s+`curl -fsSL https:\/\/get\.bounded\.sh\/install\.sh \| sh` installs a global `bounded`\s+on macOS and Linux\./g,
      'For a global command, `npm install -g openapps` installs `openapps`.')
    .replace(/^# If this old shell-installed build has no `update` command, run the installer once:\ncurl -fsSL https:\/\/get\.bounded\.sh\/install\.sh \| sh\n/gm, '')
    .replace(/ If an older shell-installed\s+CLI does not recognize `update`, run\s+`curl -fsSL https:\/\/get\.bounded\.sh\/install\.sh \| sh` once\./g, '')
    .replace(/; this skill family writes commands in the\s+bare `bounded <command>` form, which is what a global install answers to\./g,
      ', as this skill family\nwrites them; npx runs the installed CLI, or fetches it from npm when it is missing.')
    .replace(/\bbounded-sh\/skill\b/g, OPENAPPS_SKILL_REPO)
    .replace(/@bounded-sh\/cli(?![\w-])/g, OPENAPPS_CLI_PACKAGE)
    .replace(new RegExp(`\\bbounded-(${SKILL_SUFFIXES})\\b`, 'g'), 'openapps-$1')
    .replace(/(^|[\s(`'"/])bounded\/(?=[\w.-])/gm, '$1openapps/')
    .replace(/\bnpx bounded\b/g, 'npx openapps')
    // Commands run through npx so they work without an install; headings keep the bare name and their anchors.
    .replace(new RegExp(`(?<!^#.*)(^|[^\\w.@/-])bounded(?= (?:${commandAlternation})\\b| --?[a-z]| <)`, 'gm'), '$1npx openapps')
    .replace(new RegExp(`(^|[^\\w.@/-])bounded(?= (?:${commandAlternation})\\b| --?[a-z]| <)`, 'gm'), '$1openapps')
    .replace(new RegExp(`(\\]\\([^)#\\s]*#[\\w-]*?)bounded-(?=(?:${commandAlternation})\\b)`, 'g'), '$1openapps-')
    .replace(/(['"])bounded\1(?=, \[)/g, '$1openapps$1')
    .replace(/\brules\/bounded\.mdc\b/g, 'rules/openapps.mdc')
    .replace(/\bThe bounded app\b/g, 'The OpenApps app')
    .replace(/`bounded`/g, '`openapps`')
    .replace(/\*\*bounded\*\*/g, '**openapps**')
    .replace(/\bthe bounded skill\b/g, 'the openapps skill')
    .replace(/\bBounded \(bounded\.sh\)/g, 'OpenApps (openapps.xyz)')
    .replace(/(^|[^\w.@/-])Bounded\b(?!\.sh)/gm, '$1OpenApps')
    .replace(/\[OpenApps\]\(https:\/\/bounded\.sh\/?\)/g, '[OpenApps](https://openapps.xyz)')
    .replace(/\b([Aa]) OpenApps\b/g, '$1n OpenApps')
    .replace(/\bOpenApps's\b/g, "OpenApps'")
}

function splitFrontmatter(source, file) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) die(`${file} has no frontmatter`)
  return { frontmatter: match[1], body: source.slice(match[0].length) }
}

// sections splits a markdown body into its preamble and `## ` sections, keyed
// by heading text.
function sections(body, file) {
  const parts = body.split(/^(?=## )/m)
  const preamble = parts.shift()
  const byHeading = new Map()
  for (const part of parts) byHeading.set(part.match(/^## (.+)$/m)[1].trim(), part)
  return {
    preamble,
    take(heading) {
      const part = byHeading.get(heading)
      if (part === undefined) die(`${file} no longer has a "## ${heading}" section; update scripts/openapps/build.mjs`)
      return part
    },
  }
}

function withoutLines(part, patterns, file) {
  const lines = part.split('\n')
  const kept = lines.filter((line) => !patterns.some((pattern) => pattern.test(line)))
  if (lines.length - kept.length !== patterns.length) die(`${file}: expected to drop ${patterns.length} lines, dropped ${lines.length - kept.length}`)
  return kept.join('\n')
}

// mergeRoot folds the Bounded router into the OpenApps skill, so an OpenApps
// user has one entry point that both starts an app and explains what an oApp is.
function mergeRoot(routerSource, openappsSource) {
  const router = sections(splitFrontmatter(routerSource, 'bounded/SKILL.md').body, 'bounded/SKILL.md')
  const openapps = sections(splitFrontmatter(openappsSource, 'openapps/SKILL.md').body, 'openapps/SKILL.md')
  const workByPhase = withoutLines(router.take('Work by phase'), [/\*\*openapps\*\*/], 'bounded/SKILL.md')
  const coreRules = withoutLines(router.take('Core rules'), [/^Do not use `--all`/, /^The retired `oapps-fun`/], 'bounded/SKILL.md')
  const frontmatter = ['---', 'name: openapps', 'description: >-', ...ROOT_DESCRIPTION.map((line) => `  ${line}`), '---', ''].join('\n')
  return frontmatter + [
    openapps.preamble,
    openapps.take('Choose the workflow'),
    openapps.take('Capability constraints'),
    router.take('Start'),
    workByPhase,
    router.take('Cross-cutting references'),
    coreRules,
    openapps.take('References'),
  ].map((part) => part.replace(/\n*$/, '\n')).join('\n')
}

// githubSlug and headingAnchors match scripts/validate.mjs, so an anchor the
// rewrite renamed is caught the same way a hand-written broken anchor is.
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

function checkOutput(out) {
  const problems = []
  for (const file of filesBelow(out)) {
    const relative = path.relative(out, file)
    if (relative.endsWith('/SKILL.md')) {
      const name = readFileSync(file, 'utf8').match(/^name:\s*(\S+)$/m)?.[1]
      if (name !== path.dirname(relative)) problems.push(`${relative}: frontmatter name ${name} does not match its folder`)
    }
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\]\(([^)\s]+)\)/g)) {
      const [target, anchor] = match[1].split('#')
      if (/^[a-z]+:/i.test(target)) continue
      const linked = target ? path.resolve(path.dirname(file), target) : file
      if (!existsSync(linked)) problems.push(`${relative}: broken link ${match[1]}`)
      else if (anchor && linked.endsWith('.md') && !headingAnchors(linked).has(decodeURIComponent(anchor).toLowerCase())) problems.push(`${relative}: broken anchor ${match[1]}`)
    }
  }
  if (problems.length) die(`the generated family is broken:\n  ${problems.join('\n  ')}`)
}

// residue counts what still says bounded, so a reviewer sees what the rewrite
// deliberately kept.
function residue(out) {
  const counts = new Map()
  for (const file of filesBelow(out)) {
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue
    for (const match of readFileSync(file, 'utf8').matchAll(/[\w@.~/-]*bounded[\w.-]*/gi)) {
      const token = match[0].replace(/^.*?(@bounded-sh\/[\w-]+|[\w-]*\.?bounded\.(?:sh|app|json)|BOUNDED_\w*|ctx\.bounded|\.bounded\/?|bounded_\w*).*$/i, '$1')
      counts.set(token, (counts.get(token) || 0) + 1)
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])
}

export function build({ out }) {
  const sources = git('ls-files', '-z', '--', ...SOURCE_DIRS).split('\0').filter(Boolean)
  if (!sources.includes('bounded/SKILL.md') || !sources.includes('openapps/SKILL.md')) die('the bounded and openapps root skills are missing')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const written = new Set()
  for (const source of sources) {
    if (source === 'bounded/SKILL.md' || source === 'openapps/SKILL.md') continue
    if (SKIPPED.some((pattern) => pattern.test(source))) continue
    const target = targetPath(source)
    if (written.has(target)) die(`${source} collides with another file at ${target}`)
    written.add(target)
    const file = path.join(root, source)
    const destination = path.join(out, target)
    mkdirSync(path.dirname(destination), { recursive: true })
    const bytes = readFileSync(file)
    writeFileSync(destination, TEXT_EXTENSIONS.has(path.extname(file)) ? rewrite(bytes.toString('utf8')) : bytes, { mode: statSync(file).mode })
  }
  const merged = mergeRoot(readFileSync(path.join(root, 'bounded/SKILL.md'), 'utf8'), readFileSync(path.join(root, 'openapps/SKILL.md'), 'utf8'))
  writeFileSync(path.join(out, 'openapps/SKILL.md'), rewrite(merged))
  writeFileSync(path.join(out, 'README.md'), readFileSync(path.join(here, 'README.md.tmpl'), 'utf8'))
  checkOutput(out)
  return { residue: residue(out) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  const { residue: kept } = build({ out: path.resolve(args.out) })
  console.log(`built the OpenApps skill family into ${args.out}`)
  console.log('kept on purpose (identifiers the runtime still reads, and plain English):')
  for (const [token, count] of kept) console.log(`  ${String(count).padStart(5)}  ${token}`)
}
