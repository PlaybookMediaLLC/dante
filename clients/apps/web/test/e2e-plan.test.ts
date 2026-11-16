import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  balanceShards,
  buildMatrix,
  listSpecs,
  needsStack,
  planTier,
  SHARD_OVERHEAD_MS,
} from '../../../../dev/e2e-plan.mjs'

/** Most cases are about the packing itself, not the shards' extra CI work. */
const noOverhead = {}

test('a push runs the full suite on develop and nothing on main', () => {
  assert.equal(planTier({ event: 'push', ref: 'refs/heads/develop' }), 'full')
  // A push to main follows a release pull request, which ran the full suite.
  assert.equal(planTier({ event: 'push', ref: 'refs/heads/main' }), 'none')
})

test('a release pull request into main runs the full suite', () => {
  assert.equal(
    planTier({ event: 'pull_request', baseRef: 'main', changedFiles: ['README.md'] }),
    'full'
  )
})

test('a docs-only pull request runs no browser tests', () => {
  assert.equal(
    planTier({
      event: 'pull_request',
      baseRef: 'develop',
      changedFiles: ['docs/vision.md', 'README.md', 'docs/rfcs/README.md'],
    }),
    'none'
  )
})

test('a pull request touching app code runs the smoke set', () => {
  assert.equal(
    planTier({
      event: 'pull_request',
      baseRef: 'develop',
      changedFiles: ['clients/apps/web/components/platform-ui/card.tsx'],
    }),
    'smoke'
  )
})

// The invariant that keeps selection safe: anything that can break any flow
// escalates to the whole suite, even on a pull request.
for (const file of [
  'server/internal/httpapi/handler.go',
  'server/ent/schema/organization.go',
  'clients/apps/web/lib/auth/access.ts',
  'clients/apps/web/lib/billing/stripe-events.ts',
  'clients/apps/web/lib/tenant/campaign-status.ts',
  'clients/apps/web/lib/api/route.ts',
  'clients/apps/web/middleware.ts',
  'clients/apps/web/playwright.config.ts',
  'clients/apps/web/test/e2e/framework/index.ts',
  'clients/packages/platejs-editor/src/index.ts',
  'clients/package-lock.json',
  'dev/studio',
  '.github/workflows/ci.yml',
  'infra/charts/screenshot-studio/values.yaml',
]) {
  test(`a pull request touching ${file} runs the full suite`, () => {
    assert.equal(
      planTier({ event: 'pull_request', baseRef: 'develop', changedFiles: [file] }),
      'full'
    )
  })
}

test('an unreadable diff runs the full suite rather than fewer tests', () => {
  assert.equal(planTier({ event: 'pull_request', baseRef: 'develop' }), 'full')
  assert.equal(planTier({ event: 'pull_request', baseRef: 'develop', mergeQueue: true }), 'full')
})

// The rule that lets a pull request skip the browser stack: the merge queue
// runs the full suite on the exact tree before it lands.
test('the merge queue runs the full suite, whatever changed', () => {
  assert.equal(planTier({ event: 'merge_group', changedFiles: ['docs/vision.md'] }), 'full')
  assert.equal(planTier({ event: 'merge_group' }), 'full')
  assert.equal(needsStack({ event: 'merge_group', tier: 'full' }), true)
})

for (const file of [
  'clients/apps/web/components/platform-ui/card.tsx',
  'server/internal/httpapi/handler.go',
  'clients/apps/web/lib/auth/access.ts',
]) {
  test(`with a merge queue, a pull request touching ${file} leaves the browser stack to it`, () => {
    const tier = planTier({
      event: 'pull_request',
      baseRef: 'develop',
      changedFiles: [file],
      mergeQueue: true,
    })
    assert.equal(tier, 'none')
    assert.equal(needsStack({ event: 'pull_request', mergeQueue: true, tier }), false)
  })
}

// A change to CI or the stack is proven on the pull request that makes it.
for (const file of [
  '.github/workflows/ci.yml',
  '.github/actions/load-ci-image/action.yml',
  'dev/studio',
  'dev/compose.e2e.yaml',
  'clients/apps/web/Dockerfile',
  'server/Dockerfile',
  'clients/package-lock.json',
  'server/go.sum',
]) {
  test(`with a merge queue, a pull request touching ${file} still runs the full suite`, () => {
    const tier = planTier({
      event: 'pull_request',
      baseRef: 'develop',
      changedFiles: ['clients/apps/web/app/page.tsx', file],
      mergeQueue: true,
    })
    assert.equal(tier, 'full')
    assert.equal(needsStack({ event: 'pull_request', mergeQueue: true, tier }), true)
  })
}

test('without a merge queue, every run builds the stack', () => {
  for (const tier of ['none', 'smoke', 'full']) {
    assert.equal(needsStack({ event: 'pull_request', mergeQueue: false, tier }), true)
    assert.equal(needsStack({ event: 'push', tier }), true)
  }
})

/** What the CI step reads: the script's outputs for one environment. */
function planOutputs(env: Record<string, string>): Record<string, string> {
  const output = execFileSync(process.execPath, ['../../../dev/e2e-plan.mjs'], {
    encoding: 'utf8',
    // Blank every input, and GITHUB_OUTPUT so the script prints instead of
    // writing into the CI job's own outputs.
    env: {
      ...process.env,
      GITHUB_OUTPUT: '',
      EVENT: '',
      BASE: '',
      CHANGED_FILES: '',
      MERGE_QUEUE: '',
      SHARDS: '6',
      REF: 'refs/pull/1/merge',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return Object.fromEntries(
    output
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
  )
}

test('the plan step runs everything in the queue and when the diff is unreadable', () => {
  const queue = planOutputs({ EVENT: 'merge_group', CHANGED_FILES: 'docs/ci.md' })
  assert.deepEqual([queue.tier, queue.run, queue.stack], ['full', 'true', 'true'])
  // The workflow passes an empty list when `git diff` fails.
  const blank = planOutputs({
    EVENT: 'pull_request',
    BASE: 'develop',
    CHANGED_FILES: '',
    MERGE_QUEUE: 'true',
  })
  assert.deepEqual([blank.tier, blank.stack], ['full', 'true'])
  const queued = planOutputs({
    EVENT: 'pull_request',
    BASE: 'develop',
    CHANGED_FILES: 'clients/apps/web/app/page.tsx',
    MERGE_QUEUE: 'true',
  })
  assert.deepEqual([queued.tier, queued.run, queued.stack], ['none', 'false', 'false'])
  const unqueued = planOutputs({
    EVENT: 'pull_request',
    BASE: 'develop',
    CHANGED_FILES: 'clients/apps/web/app/page.tsx',
  })
  assert.equal(unqueued.stack, 'true')
})

test('a release pull request into main runs the full suite even beside a queue', () => {
  assert.equal(
    planTier({
      event: 'pull_request',
      baseRef: 'main',
      changedFiles: ['README.md'],
      mergeQueue: true,
    }),
    'full'
  )
})

test('shards are balanced by measured duration, not by file count', () => {
  const specs = ['test/e2e/a.spec.ts', 'test/e2e/b.spec.ts', 'test/e2e/c.spec.ts']
  const durations = {
    'test/e2e/a.spec.ts': 100_000,
    'test/e2e/b.spec.ts': 60_000,
    'test/e2e/c.spec.ts': 50_000,
  }
  const bins = balanceShards({ specs, durations, shards: 2, overhead: noOverhead })
  assert.ok(bins)
  assert.deepEqual(
    bins.map((bin) => bin.total),
    [100_000, 110_000]
  )
})

// Shard 1 also runs the renderer, tenant isolation and the agent smoke test;
// shard 2 also runs dependency recovery. Given a full share of tests too,
// those shards decided the whole run's wall clock.
test('a shard that carries extra CI work is given fewer tests', () => {
  const specs = ['test/e2e/a.spec.ts', 'test/e2e/b.spec.ts', 'test/e2e/c.spec.ts']
  const durations = Object.fromEntries(specs.map((spec) => [spec, 100_000]))
  const bins = balanceShards({ specs, durations, shards: 3 })
  assert.ok(bins)
  assert.deepEqual(
    bins.map((bin) => bin.specs.length),
    [1, 1, 1]
  )
  assert.deepEqual(
    bins.map((bin) => bin.total),
    [100_000 + SHARD_OVERHEAD_MS[1]!, 100_000 + SHARD_OVERHEAD_MS[2]!, 100_000]
  )
  const unevenly = balanceShards({
    specs: [...specs, 'test/e2e/d.spec.ts'],
    durations: { ...durations, 'test/e2e/d.spec.ts': 100_000 },
    shards: 3,
  })
  assert.ok(unevenly)
  // The fourth spec goes to the shard with no extra work, not round-robin.
  assert.deepEqual(
    unevenly.map((bin) => bin.specs.length),
    [1, 1, 2]
  )
})

test('a spec the manifest has never seen is costed at the p75, not at zero', () => {
  const specs = ['test/e2e/a.spec.ts', 'test/e2e/b.spec.ts', 'test/e2e/new.spec.ts']
  const durations = { 'test/e2e/a.spec.ts': 100_000, 'test/e2e/b.spec.ts': 60_000 }
  const bins = balanceShards({ specs, durations, shards: 2, overhead: noOverhead })
  assert.ok(bins)
  const costed = bins.flatMap((bin) => bin.specs)
  assert.equal(costed.length, 3)
  assert.ok(bins.every((bin) => bin.total > 0))
})

test('a stale or missing manifest falls back to Playwright sharding', () => {
  const specs = Array.from({ length: 10 }, (_, index) => `test/e2e/${index}.spec.ts`)
  assert.equal(balanceShards({ specs, durations: null, shards: 3 }), null)
  assert.equal(balanceShards({ specs, durations: { 'test/e2e/0.spec.ts': 1 }, shards: 3 }), null)
  const matrix = buildMatrix({ tier: 'full', shards: 3, specs, durations: null })
  assert.deepEqual(
    matrix.map((entry) => entry.args),
    ['--shard=1/3', '--shard=2/3', '--shard=3/3']
  )
})

test('a plan never hands a shard an empty file list', () => {
  const specs = ['test/e2e/a.spec.ts', 'test/e2e/b.spec.ts']
  const durations = { 'test/e2e/a.spec.ts': 1000, 'test/e2e/b.spec.ts': 1000 }
  assert.equal(balanceShards({ specs, durations, shards: 4 }), null)
  const matrix = buildMatrix({ tier: 'full', shards: 4, specs, durations })
  assert.ok(matrix.every((entry) => entry.args.startsWith('--shard=')))
})

test('the smoke tier is one job regardless of the shard count', () => {
  const matrix = buildMatrix({ tier: 'smoke', shards: 6, specs: [], durations: null })
  assert.deepEqual(matrix, [{ shard: 'smoke', shard_index: 1, args: '--grep=@smoke' }])
})

// The plan becomes a shell word list in the browser job's `run:`.
test('a spec file name that is not a plain identifier fails the plan', () => {
  const directory = mkdtempSync(join(tmpdir(), 'e2e-plan-'))
  try {
    mkdirSync(join(directory, 'clients/apps/web/test/e2e'), { recursive: true })
    writeFileSync(join(directory, 'clients/apps/web/test/e2e/a b;rm.spec.ts'), '')
    assert.throws(() => listSpecs(directory), /plain identifiers/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the plan covers every committed spec exactly once', () => {
  const specs = listSpecs()
  assert.ok(specs.length > 100, 'the suite should be discovered from disk')
  assert.ok(!specs.includes('test/e2e/dependency-recovery.spec.ts'))
  assert.ok(!specs.includes('test/e2e/social-gate.spec.ts'))
  const durations = Object.fromEntries(specs.map((spec, index) => [spec, 1000 + index]))
  const bins = balanceShards({ specs, durations, shards: 6 })
  assert.ok(bins)
  assert.deepEqual(bins.flatMap((bin) => bin.specs).sort(), [...specs].sort())
})
