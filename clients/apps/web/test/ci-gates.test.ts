import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
