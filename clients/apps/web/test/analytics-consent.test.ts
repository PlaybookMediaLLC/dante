import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { POST_MANAGEMENT_USED, scrubEvent, scrubUrl } from '@/lib/analytics-scrub'
import { adsAllowed, CONSENT_CHANGE_EVENT, type Consent } from '@/lib/consent'

test('share, review, invitation and reset secrets never reach analytics', () => {
  assert.equal(
    scrubUrl('https://shots.example/s/abc123/embed?x=1'),
    'https://shots.example/s/[redacted]/embed?x=1'
  )
  assert.equal(
    scrubUrl('/en/review/tok_9?invitationId=inv1&ok=1'),
    '/en/review/[redacted]?invitationId=[redacted]&ok=1'
  )
  assert.equal(scrubUrl('/reset-password?token=secret#top'), '/reset-password?token=[redacted]#top')
  assert.equal(scrubUrl('/sign-in?callbackURL=%2Fs%2Fabc'), '/sign-in?callbackURL=[redacted]')
  assert.equal(scrubUrl('/settings/security'), '/settings/security')

  const event = scrubEvent({
    properties: { $current_url: '/s/abc', count: 2 },
    $set: { $referrer: '/review/x' },
  })
  assert.deepEqual(event, {
    properties: { $current_url: '/s/[redacted]', count: 2 },
    $set: { $referrer: '/review/[redacted]' },
  })
})

test('a post-management use event carries its workspace and feature, never filter values', () => {
  const page = 'https://shots.example/publish?set=s1&account=acc1&from=2026-11-04&to=2026-11-04#top'
  assert.deepEqual(
    scrubEvent({
      event: POST_MANAGEMENT_USED,
      properties: { $current_url: page, feature: 'library_filter', workspace_id: 'org_1' },
      $set: { $referrer: '/s/abc?q=Launch%20title' },
    }),
    {
      event: POST_MANAGEMENT_USED,
      properties: {
        $current_url: 'https://shots.example/publish',
        feature: 'library_filter',
        workspace_id: 'org_1',
      },
      $set: { $referrer: '/s/[redacted]' },
    }
  )
  // Other events keep their query; only its secrets go.
  assert.deepEqual(scrubEvent({ event: '$pageview', properties: { $current_url: page } }), {
    event: '$pageview',
    properties: { $current_url: page },
  })
})

test('ads load only after an explicit yes', () => {
  assert.equal(adsAllowed(null), false)
  assert.equal(adsAllowed({ analytics: true, ads: false }), false)
  assert.equal(adsAllowed({ analytics: false, ads: true }), true)
})

function runAnalyticsSource(
  path: string,
  modules: Record<string, unknown>,
  globals: Record<string, unknown>
): void {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  })
  runInNewContext(outputText, {
    exports: {},
    process: { env: { NEXT_PUBLIC_POSTHOG_KEY: 'test-key' } },
    console,
    require: (name: string): unknown => {
      assert.ok(name in modules, `Unexpected analytics import: ${name}`)
      return modules[name]
    },
    ...globals,
  })
}

test('withdrawal during analytics loading cancels initialization and queued navigation capture', async () => {
  const calls: string[] = []
  const provider = {
    init: () => calls.push('init'),
    opt_in_capturing: () => calls.push('in'),
    opt_out_capturing: () => calls.push('out'),
    capture: () => calls.push('capture'),
  }
  let resolve: (value: typeof provider) => void = () => {}
  const loaded = new Promise<typeof provider>((done) => {
    resolve = done
  })
  const window = Object.assign(new EventTarget(), { location: { origin: 'https://shots.example' } })
  let consent: Consent = { analytics: false, ads: false }
  let observe: (list: { getEntries: () => object[] }) => void = () => {}
  let downloads = 0
  runAnalyticsSource(
    '../instrumentation-client.ts',
    {
      '@/lib/analytics': {
        loadPostHog: () => {
          downloads++
          return loaded
        },
      },
      '@/lib/analytics-scrub': { scrubEvent },
      '@/lib/consent': { CONSENT_CHANGE_EVENT, readConsent: () => consent },
      '@/lib/canvas/navigation-diagnostics': {
        canvasNavigationFailure: () => ({ path: '/canvas' }),
      },
    },
    {
      window,
      PerformanceObserver: class {
        static supportedEntryTypes = ['resource']
        constructor(callback: typeof observe) {
          observe = callback
        }
        observe(): void {}
      },
    }
  )
  const choose = (analytics: boolean) => {
    consent = { analytics, ads: false }
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: consent }))
  }
  assert.equal(downloads, 0)
  choose(true)
  observe({ getEntries: () => [{}] })
  choose(false)
  resolve(provider)
  await setImmediate()
  assert.deepEqual(calls.slice(), [])

  choose(true)
  await setImmediate()
  assert.deepEqual(calls.slice(), ['init'])
  choose(false)
  await setImmediate()
  assert.deepEqual(calls.slice(), ['init', 'out'])
  choose(true)
  choose(false)
  await setImmediate()
  assert.equal(calls.includes('in'), false)
  choose(true)
  await setImmediate()
  assert.equal(calls.at(-1), 'in')
  assert.equal(calls.filter((call) => call === 'init').length, 1)
})

test('analytics helpers recheck consent after loading and for a loaded client', async () => {
  const calls: string[] = []
  let consent: Consent = { analytics: true, ads: false }
  const provider = {
    capture: () => calls.push('capture'),
    identify: () => calls.push('identify'),
    reset: () => calls.push('reset'),
  }
  const exported: Record<string, unknown> = {}
  runAnalyticsSource(
    '../lib/analytics.ts',
    {
      '@/lib/consent': { readConsent: () => consent },
      'posthog-js': { default: provider },
    },
    { exports: exported, window: { location: { hostname: 'shots.example' } } }
  )
  const track = exported.trackEvent as (name: string) => void
  track('pending')
  consent = { analytics: false, ads: false }
  await setImmediate()
  assert.deepEqual(calls.slice(), [])
  track('denied')
  ;(exported.identifyUser as (id: string) => void)('private-user')
  ;(exported.resetUser as () => void)()
  assert.deepEqual(calls.slice(), [])
  consent = { analytics: true, ads: false }
  track('allowed')
  assert.deepEqual(calls.slice(), ['capture'])
})
