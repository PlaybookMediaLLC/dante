#!/usr/bin/env node
// Decides which browser tests a CI run executes and how they are spread over
// shards. CI calls it from the `plan` job; `dev/e2e-plan.test` covers the
// decisions. test/e2e/README.md ("When the suite runs") is the prose version.
//
// Usage: node dev/e2e-plan.mjs
// Reads EVENT, REF, BASE, CHANGED_FILES, MERGE_QUEUE and SHARDS; writes
// `tier`, `run`, `stack` and `matrix` to GITHUB_OUTPUT, or to stdout when it
// is unset.
import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const SPEC_DIR = 'clients/apps/web/test/e2e'
export const DURATIONS_FILE = `${SPEC_DIR}/durations.json`

// Playwright never runs these through the sharded suite: the recovery spec is
// `testIgnore`d unless E2E_INCLUDE_RECOVERY is set, and the social gate spec
// skips itself outside dev/social-gate. Planning around them would hand a
// shard a file with nothing to run.
export const EXCLUDED_SPECS = ['dependency-recovery.spec.ts', 'social-gate.spec.ts']

/**
 * Work a browser shard does outside the suite, keyed by shard number. Shard 1
 * also runs the design renderer over CDP, the tenant isolation check and the
 * agent endpoint smoke test; shard 2 also runs the dependency recovery suite.
 * Without this the packer gave those shards a full share of tests as well, and
 * the whole run waited on them. Rough figures from CI step timings; they only
 * have to be the right size.
 *
 * @type {Record<number, number>}
 */
export const SHARD_OVERHEAD_MS = { 1: 130_000, 2: 45_000 }

// Tier A. A change here can break any flow, so no selection is safe: these run
// the whole suite on a pull request too. Keep it broad; the fallback on any
// doubt is the full suite, never a smaller one.
export const FULL_SUITE_PATTERNS = [
  /^server\//,
  /^dev\//,
  /^infra\//,
  /^Makefile$/,
  /^\.github\/workflows\//,
  /^clients\/packages\//,
  /^clients\/package-lock\.json$/,
  /^clients\/package\.json$/,
  /^clients\/eslint\.config\.mjs$/,
  /^clients\/apps\/collab-server\//,
  /^clients\/apps\/web\/Dockerfile/,
  /^clients\/apps\/web\/package\.json$/,
  /^clients\/apps\/web\/middleware\.ts$/,
  /^clients\/apps\/web\/next\.config\.ts$/,
  /^clients\/apps\/web\/playwright\.config\.ts$/,
  /^clients\/apps\/web\/lib\/(auth|billing|tenant|workspace|core|api)\//,
  /^clients\/apps\/web\/test\/e2e\/framework\//,
]

/**
 * When a merge queue runs the full suite before a pull request lands, the pull
 * request's own run skips the browser stack, except for a change to how CI or
 * the stack is built (so a CI change is proven on the pull request that makes
 * it) or to a lockfile.
 */
export const CI_CONFIG_PATTERNS = [
  /^\.github\//,
  /^dev\//,
  /(^|\/)Dockerfile[^/]*$/,
  /(^|\/)package-lock\.json$/,
  /^server\/go\.(mod|sum)$/,
]

/** Tier C. Prose only: nothing the browser suite can observe. */
export const DOCS_PATTERNS = [/^docs\//, /\.md$/]

/**
 * True when every changed file is prose, so no runtime check can observe the
 * change. An empty or unknown file list is never docs-only.
 *
 * @param {string[]} [changedFiles]
 * @returns {boolean}
 */
export function isDocsOnly(changedFiles) {
  const files = (changedFiles ?? []).filter(Boolean)
  return files.length > 0 && files.every((file) => DOCS_PATTERNS.some((p) => p.test(file)))
}

/**
 * Tier A (`full`), tier B (`smoke`) or tier C (`none`).
 *
 * The merge queue, a push to develop and a release pull request into main
 * always run the full suite. A pull request into develop runs the smoke set,
 * unless it touches something in FULL_SUITE_PATTERNS. When a merge queue
 * guards its base, it runs no browser tests unless it touches
 * CI_CONFIG_PATTERNS: the queue runs the full suite before it lands. No
 * history to compare against means the full suite, never fewer tests.
 *
 * @param {{event?: string, ref?: string, baseRef?: string, changedFiles?: string[], mergeQueue?: boolean}} input
 * @returns {'full' | 'smoke' | 'none'}
 */
export function planTier({ event, ref, baseRef, changedFiles, mergeQueue }) {
  if (event === 'merge_group') return 'full'
  if (event === 'push') return ref === 'refs/heads/develop' ? 'full' : 'none'
  if (baseRef === 'main') return 'full'
  if (!changedFiles) return 'full'
  const files = changedFiles.filter(Boolean)
  if (files.length === 0) return 'none'
  if (isDocsOnly(files)) return 'none'
  if (mergeQueue) {
    return files.some((file) => CI_CONFIG_PATTERNS.some((pattern) => pattern.test(file)))
      ? 'full'
      : 'none'
  }
  if (files.some((file) => FULL_SUITE_PATTERNS.some((pattern) => pattern.test(file)))) return 'full'
  return 'smoke'
}

/**
 * Whether the run builds the images and runs the Docker stack jobs (the
 * browser shards and the social gate). Only a pull request that a merge queue
 * will test in full, and that needs no browser tests of its own, skips them.
 *
 * @param {{event?: string, mergeQueue?: boolean, tier: string}} input
 * @returns {boolean}
 */
export function needsStack({ event, mergeQueue, tier }) {
  return !(event === 'pull_request' && mergeQueue && tier === 'none')
}

/**
 * The spec files the sharded suite runs, in a stable order.
 *
 * @param {string} [root]
 * @returns {string[]}
 */
export function listSpecs(root = ROOT) {
  const names = readdirSync(join(root, SPEC_DIR)).filter(
    (name) => name.endsWith('.spec.ts') && !EXCLUDED_SPECS.includes(name)
  )
  // The plan becomes a shell word list in the workflow, so a file name that is
  // not a plain identifier is a defect, not something to quote around.
  const unsafe = names.filter((name) => !/^[A-Za-z0-9._-]+$/.test(name))
  if (unsafe.length > 0) {
    throw new Error(`Spec file names must be plain identifiers: ${unsafe.join(', ')}`)
  }
  return names.sort().map((name) => `${SPEC_DIR.replace('clients/apps/web/', '')}/${name}`)
}

/**
 * The committed duration of each spec, or null when there is no manifest.
 *
 * @param {string} [root]
 * @returns {Record<string, number> | null}
 */
export function readDurations(root = ROOT) {
  const file = join(root, DURATIONS_FILE)
  if (!existsSync(file)) return null
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  return parsed && typeof parsed === 'object' ? (parsed.specs ?? parsed) : null
}

/**
 * Longest-processing-time bin packing: the slowest spec first, each one onto
 * the lightest shard so far. A spec the manifest has never seen is costed at
 * the p75 of the ones it has, so a new spec cannot land on a shard that is
 * already full.
 *
 * Returns null when the manifest is missing or too stale to trust, which is
 * the caller's signal to fall back to Playwright's own `--shard`.
 *
 * @param {{specs: string[], durations: Record<string, number> | null, shards: number, overhead?: Record<number, number>}} input
 * @returns {{specs: string[], total: number}[] | null}
 */
export function balanceShards({ specs, durations, shards, overhead = SHARD_OVERHEAD_MS }) {
  if (!durations || shards < 1) return null
  const known = specs
    .map((spec) => durations[spec])
    .filter((ms) => typeof ms === 'number' && ms > 0)
  if (known.length < specs.length * 0.6) return null
  const sorted = [...known].sort((a, b) => a - b)
  const fallbackMs = sorted[Math.min(sorted.length - 1, Math.floor(0.75 * sorted.length))]
  /** @type {{specs: string[], total: number}[]} */
  const bins = Array.from({ length: shards }, (_, index) => ({
    specs: [],
    total: overhead[index + 1] ?? 0,
  }))
  const costed = specs
    .map((spec) => ({ spec, ms: durations[spec] > 0 ? durations[spec] : fallbackMs }))
    // Ties break on the file name so the same tree always produces the same plan.
    .sort((a, b) => b.ms - a.ms || a.spec.localeCompare(b.spec))
  // An empty shard would run the whole suite: Playwright with no file argument
  // runs everything. So once only as many specs remain as there are empty
  // shards, each of those specs goes to an empty one, even if a shard that
  // already has work is lighter. A shard's own CI overhead can exceed the
  // whole suite, and without this rule it would be left with no tests at all.
  for (const [index, { spec, ms }] of costed.entries()) {
    const empty = bins.filter((bin) => bin.specs.length === 0)
    const candidates = costed.length - index <= empty.length ? empty : bins
    const lightest = candidates.reduce(
      (low, bin) => (bin.total < low.total ? bin : low),
      candidates[0]
    )
    lightest.specs.push(spec)
    lightest.total += ms
  }
  // More shards than specs is a misconfiguration, not a plan.
  if (bins.some((bin) => bin.specs.length === 0)) return null
  return bins.map((bin) => ({ specs: bin.specs.sort(), total: bin.total }))
}

/**
 * The `strategy.matrix.include` the browser job expands.
 *
 * @param {{tier: string, shards: number, specs: string[], durations: Record<string, number> | null}} input
 * @returns {{shard: string, shard_index: number, args: string, estimate_ms?: number}[]}
 */
export function buildMatrix({ tier, shards, specs, durations }) {
  if (tier === 'none') return []
  if (tier === 'smoke') {
    return [{ shard: 'smoke', shard_index: 1, args: '--grep=@smoke' }]
  }
  const balanced = balanceShards({ specs, durations, shards })
  if (!balanced) {
    return Array.from({ length: shards }, (_, index) => ({
      shard: `${index + 1}/${shards}`,
      shard_index: index + 1,
      args: `--shard=${index + 1}/${shards}`,
    }))
  }
  return balanced.map((bin, index) => ({
    shard: `${index + 1}/${shards}`,
    shard_index: index + 1,
    args: bin.specs.join(' '),
    estimate_ms: Math.round(bin.total),
  }))
}

function main() {
  const shards = Number(process.env.SHARDS || 3)
  // A blank list means the diff could not be read, which runs everything.
  const changedFiles = process.env.CHANGED_FILES?.trim()
    ? process.env.CHANGED_FILES.split('\n').map((line) => line.trim())
    : undefined
  const event = process.env.EVENT
  const mergeQueue = process.env.MERGE_QUEUE === 'true'
  const tier = planTier({
    event,
    ref: process.env.REF,
    baseRef: process.env.BASE,
    changedFiles,
    mergeQueue,
  })
  const specs = listSpecs()
  const durations = readDurations()
  const matrix = buildMatrix({ tier, shards, specs, durations })
  const outputs = {
    tier,
    docs_only: String(isDocsOnly(changedFiles)),
    run: String(matrix.length > 0),
    stack: String(needsStack({ event, mergeQueue, tier })),
    // An empty matrix would make the job fail to expand; the job's `if` keys
    // off `run`, so give it a shape it can parse either way.
    matrix: JSON.stringify(
      matrix.length > 0 ? matrix : [{ shard: 'none', shard_index: 1, args: '' }]
    ),
  }
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
  else console.log(lines.join('\n'))
  const summary = [
    `Browser test plan: tier ${tier}, ${matrix.length} job(s).`,
    durations
      ? 'Shards balanced by committed durations.'
      : 'No duration manifest; using Playwright sharding.',
  ]
  console.error(summary.join(' '))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
