import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

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
