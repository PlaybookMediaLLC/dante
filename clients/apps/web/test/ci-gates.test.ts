import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

/**
 * `CI validation` is the only required status check on develop and main
 * (.github/rulesets, docs/ci.md). A job it does not name gates nothing: the
 * pipeline once spent 50 to 140 runner-minutes per run on checks that could
 * not block a merge, because `validate` required the client checks and the
 * web image alone.
 *
 * Parsed as text rather than YAML on purpose: this tier has no YAML parser as
 * a declared dependency, and the two shapes it reads are fixed by the file's
 * own formatting.
 */
const workflow = readFileSync('../../../.github/workflows/ci.yml', 'utf8')

/** Job identifiers, which are the only keys at two-space indentation. */
function jobIds(): string[] {
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n'))
  return [...jobs.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((match) => match[1]!)
}

/** The `needs:` list of one job, in either the inline or the block form. */
function needsOf(job: string): string[] {
  const start = workflow.indexOf(`\n  ${job}:\n`)
  assert.notEqual(start, -1, `ci.yml has no ${job} job`)
  const rest = workflow.slice(start + 1)
  const end = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  const block = end === -1 ? rest : rest.slice(0, end)
  const inline = block.match(/^ {4}needs: \[([^\]]*)\]$/m)
  if (inline) return inline[1]!.split(',').map((entry) => entry.trim())
  const single = block.match(/^ {4}needs: ([a-z][a-z0-9-]*)$/m)
  if (single) return [single[1]!]
  const list = block.slice(block.indexOf('\n    needs:\n') + '\n    needs:\n'.length)
  return [...list.matchAll(/^ {6}- ([a-z][a-z0-9-]*)$/gm)].map((match) => match[1]!)
}

test('every CI job is gated by the one required check', () => {
  // The merged browser report is diagnostics; it reports no verdict.
  const reporting = new Set(['validate', 'e2e-report'])
  const gated = new Set(needsOf('validate'))
  const ungated = jobIds().filter((job) => !reporting.has(job) && !gated.has(job))
  assert.deepEqual(ungated, [], 'add these jobs to the `validate` job\u2019s `needs`')
})

test('the gate runs even when a job it watches failed or was skipped', () => {
  assert.match(
    workflow,
    /\n {2}validate:\n[\s\S]*?\n {4}if: always\(\) && github\.event\.action != 'closed'\n/
  )
})

test('a push run is never cancelled by the next push', () => {
  // A cancelled develop push left its commit with no full-suite result.
  for (const file of ['ci.yml', 'founder-hub-integration.yml']) {
    const source = readFileSync(`../../../.github/workflows/${file}`, 'utf8')
    assert.match(
      source,
      /group: .*\$\{\{ github\.event\.pull_request\.number \|\| github\.run_id \}\}$/m
    )
  }
})

test('the gate is the context the rulesets require', () => {
  assert.match(workflow, /\n {2}validate:\n {4}name: CI validation\n/)
  for (const branch of ['develop', 'main']) {
    const ruleset = JSON.parse(readFileSync(`../../../.github/rulesets/${branch}.json`, 'utf8'))
    const checks = ruleset.rules
      .find((rule: { type: string }) => rule.type === 'required_status_checks')
      .parameters.required_status_checks.map((check: { context: string }) => check.context)
    assert.ok(checks.includes('CI validation'), `${branch} must require CI validation`)
    // Shard names change with the measured plan, and a release pull request
    // may legitimately reuse the suite the push already ran.
    assert.ok(
      !checks.some((context: string) => context.startsWith('integration')),
      `${branch} must not require a shard by name`
    )
  }
})

// The unit job runs each workspace's tests itself rather than one npm test, so
// a workspace that gains a test script, or a web script that changes, would
// otherwise drop out of CI without a failure.
test('the sharded unit job runs every workspace test script as written', () => {
  const root = JSON.parse(readFileSync('../../package.json', 'utf8'))
  const withTests = (root.workspaces as string[])
    .flatMap((glob) => {
      const dir = glob.replace('/*', '')
      return readdirSync(`../../${dir}`).map((name) => `../../${dir}/${name}/package.json`)
    })
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, 'utf8')))
    .filter((pkg) => pkg.scripts?.test)
  const rest = workflow.slice(workflow.indexOf('\n  client-unit:\n') + 1)
  const unit = rest.slice(0, rest.search(/\n {2}[a-z][a-z0-9-]*:\n/))
  // A shard missing from the matrix, or a step for a shard that does not
  // exist, would drop tests while the job still passed.
  assert.match(unit, /^ {8}shard: \[1, 2\]$/m)
  for (const [, shard] of unit.matchAll(/matrix\.shard == (\d+)/g)) {
    assert.ok(['1', '2'].includes(shard!), `no shard ${shard}`)
  }
  for (const pkg of withTests) {
    if (pkg.name === 'screenshot-studio') {
      assert.equal(pkg.scripts.test, 'tsx --test test/*.test.ts')
      assert.match(
        unit,
        /npx tsx --test --test-shard=\$\{\{ matrix\.shard \}\}\/2 test\/\*\.test\.ts/
      )
    } else {
      assert.match(
        unit,
        new RegExp(`npm test( -w \\S+)* -w ${pkg.name}(\\s|$)`, 'm'),
        `${pkg.name} runs in no shard`
      )
    }
  }
})

const repoRoot = resolve('../../..')

/** The pattern the Plan job matches changed files against for one area job. */
function areaPattern(area: string): RegExp {
  const match = workflow.match(new RegExp(`area ${area} '([^']+)'`))
  assert.ok(match, `ci.yml has no ${area} area`)
  return new RegExp(match[1]!)
}

// Selection may skip a job only when nothing its tests read changed. These
// recompute what each area's tests read, so a new cross-tree read cannot
// leave a pull request green while the job that would fail is skipped.
test('the Go checks run when a file outside server/ that Go reads changes', () => {
  const go = areaPattern('go')
  const reads = readdirSync(join(repoRoot, 'server'), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.go'))
    .flatMap((file) => {
      const source = readFileSync(join(repoRoot, 'server', file), 'utf8')
      // Only a path written as one literal can be checked here.
      assert.doesNotMatch(
        source,
        /filepath\.Join\([^)]*"\.\."/,
        `${file}: write the path as one literal`
      )
      return [...source.matchAll(/["`]((?:\.\.\/)+[^"`]+)["`]/g)].map(
        (match) =>
          // A directory literal (`"../.github/workflows/" + file`) keeps its slash.
          relative(repoRoot, resolve(repoRoot, 'server', dirname(file), match[1]!)) +
          (match[1]!.endsWith('/') ? '/' : '')
      )
    })
    .filter((path) => !path.startsWith('server/'))
  assert.ok(reads.includes('clients/apps/web/lib/auth/permissions.ts'))
  assert.deepEqual(
    reads.filter((path) => !go.test(path)),
    []
  )
})

test('the native clients run when a module their code or tests import changes', () => {
  const native = areaPattern('native')
  // The Raycast tests run with the web app's tsconfig (its package.json).
  const config = ts.getParsedCommandLineOfConfigFile(
    'tsconfig.json',
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    }
  )
  assert.ok(config)
  const options = { ...config.options, resolveJsonModule: true }
  const raycast = join(repoRoot, 'clients/integrations/raycast')
  const queue = ['src', 'test'].flatMap((dir) =>
    readdirSync(join(raycast, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => join(raycast, dir, file))
  )
  const seen = new Set<string>()
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.tsx?$/.test(file)) continue
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles) {
      const resolved = ts.resolveModuleName(fileName, file, options, ts.sys).resolvedModule
      if (resolved && !resolved.resolvedFileName.includes('/node_modules/')) {
        queue.push(resolved.resolvedFileName)
      }
    }
  }
  const files = [...seen].map((file) => relative(repoRoot, file))
  assert.ok(files.includes('clients/apps/web/lib/api/contracts/write.ts'))
  assert.deepEqual(
    files.filter((path) => !native.test(path)),
    []
  )
})

test('the content-keyed ESLint cache only serves single-file rules', () => {
  // A cached result is reused while its file is unchanged, which is safe only
  // while no rule reads type information from other files.
  assert.match(workflow, /npm run lint -- --max-warnings=0 --cache-strategy content/)
  const config = readFileSync('../../eslint.config.mjs', 'utf8')
  assert.doesNotMatch(config, /projectService|parserOptions:\s*\{[^}]*\bproject\b/)
})

test('the Go checks never replay a cached test result', () => {
  // The restored build cache holds develop's test results, and the database
  // tests read a schema migrated from SQL outside their binaries.
  const goChecks = workflow.slice(workflow.indexOf('\n  go-checks:\n'))
  assert.match(goChecks.slice(0, goChecks.indexOf('\n    steps:\n')), /^ {6}GOFLAGS: -count=1$/m)
})

test('every Go check runs in exactly one leg, and every leg exists', () => {
  const goChecks = workflow.slice(workflow.indexOf('\n  go-checks:\n') + 1)
  const job = goChecks.slice(0, goChecks.search(/\n {2}[a-z][a-z0-9-]*:\n/))
  const suites = job
    .match(/^ {8}suite: \[([^\]]+)\]$/m)![1]!
    .split(',')
    .map((s) => s.trim())
  // A leg named in a step's condition but missing from the matrix, or the
  // reverse, would report success having run nothing.
  const referenced = new Set(
    [...job.matchAll(/matrix\.suite [!=]= '([a-z0-9-]+)'/g)].map((m) => m[1])
  )
  assert.deepEqual([...referenced].sort(), [...suites].sort())
  for (const target of ['generate', 'fmt-check', 'vet', 'test', 'race']) {
    const runs = job.match(new RegExp(`run: make ${target}( SHARD=.*)?$`, 'gm')) ?? []
    assert.equal(runs.length, 1, `make ${target} must run once`)
  }
  // Each shard runs half of internal/product's tests and half of the other
  // packages: a missing shard drops them.
  assert.deepEqual(
    suites.filter((suite) => suite.startsWith('test')),
    ['test-1', 'test-2']
  )
  assert.match(
    job,
    /run: make test SHARD=\$\{\{ matrix\.suite == 'test-1' && '1\/2' \|\| '2\/2' \}\}$/m
  )
})

test('every check develop requires also reports in its merge queue', () => {
  // A required check that never runs on the queue's commit holds every pull
  // request in the queue until it times out.
  const ruleset = JSON.parse(readFileSync('../../../.github/rulesets/develop.json', 'utf8'))
  assert.ok(ruleset.rules.some((rule: { type: string }) => rule.type === 'merge_queue'))
  for (const file of ['ci.yml', 'branch-policy.yml']) {
    const source = readFileSync(`../../../.github/workflows/${file}`, 'utf8')
    assert.match(source, /^ {2}merge_group:$/m, `${file} must run on merge_group`)
  }
})

// The wiring that turns plan outputs into accepted skips. Each regression
// below would let `CI validation` pass with checks that never ran.
test('the gate accepts a skip only for a plan output that exists', () => {
  const outputs = workflow.slice(
    workflow.indexOf('\n    outputs:\n'),
    workflow.indexOf('\n    steps:\n')
  )
  const declared = new Set([...outputs.matchAll(/^ {6}([a-z0-9_]+):/gm)].map((match) => match[1]))
  const used = new Set(
    [...workflow.matchAll(/needs\.plan\.outputs\.([a-z0-9_]+)/g)].map((match) => match[1])
  )
  assert.deepEqual(
    [...used].filter((name) => !declared.has(name)),
    []
  )
  // An unset output must not read as a reason to skip the stack.
  assert.doesNotMatch(workflow, /outputs\.stack != 'true'/)
})

test('nothing may be skipped in the merge queue', () => {
  assert.match(workflow, /if \[\[ "\$GITHUB_EVENT_NAME" == merge_group \]\]; then SKIPPABLE=''; fi/)
  assert.match(workflow, /area\(\) \{\n\s+if \[\[ "\$GITHUB_EVENT_NAME" == merge_group \|\|/)
})

test('a pull request narrows only behind a queue that waits for CI validation', () => {
  const step = workflow.slice(workflow.indexOf('name: Check the base branch for a merge queue'))
  assert.match(step, /\.type == "merge_queue"/)
  assert.match(step, /\.type == "required_status_checks"[\s\S]*\.context == "CI validation"/)
})

test('the API contract gate never compares the document with itself', () => {
  assert.match(
    workflow,
    /BASE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.merge_group\.base_sha \|\|/
  )
  assert.match(workflow, /\[\[ -n "\$BASE" \]\] \|\| \{/)
})

test('the Go build cache keeps one entry per leg and dependency set', () => {
  // About 1.1 GB each: a new entry per develop push filled the repository's
  // 10 GB and evicted every other cache.
  const rest = workflow.slice(workflow.indexOf('\n  go-checks:\n') + 1)
  const job = rest.slice(0, rest.search(/\n {2}[a-z][a-z0-9-]*:\n/))
  assert.doesNotMatch(job, /key: go-.*github\.sha/)
  // Only the legs that compile everything they share a key with may save it.
  assert.match(
    job,
    /if: \(matrix\.suite == 'test-1' \|\| matrix\.suite == 'race'\) && steps\.go-cache\.outputs\.cache-hit != 'true'/
  )
})
