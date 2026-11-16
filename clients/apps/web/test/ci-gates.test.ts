import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
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
