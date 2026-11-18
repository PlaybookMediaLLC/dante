# Release-to-campaign capture: investigation — 2026-11-17

**Question.** Can Shots sign in to a customer's staging app, use AI to work out
what a release changed, have AI drive the app to show those changes and capture
them, and place the screenshots into a marketing campaign?

**Baseline.** `develop` at `1126781cb2f0edc3a0d76677b784826fc8d0c285`. Source
was read directly; the code graph was still building. Production state comes
from the [2026-11-14 ledger](release-campaign-validation-2026-11-14.md) and was
not rechecked. The findings below describe that baseline; the same branch then
closed the code gaps, recorded in [Implemented on this branch](#implemented-on-this-branch).

## Answer

Every stage exists, and the database-backed chain runs end to end in tests: a
signed deployment event creates a release, a campaign with draft posts, an
authenticated capture, and a branded render of that exact screenshot, then stops
at human review. It falls short of the goal in four places:

1. **Nothing decides which screens a release changed.** A workflow captures one
   page that a person chose when building it, using a navigation objective a
   person wrote. AI only answers "is this worth marketing?" and writes copy.
2. **The AI "drive" is narrow.** It reads text, follows navigation links and
   switches tabs. It cannot click buttons, open dialogs or menus, type, or
   scroll, and it never sees the screen. One 1x viewport PNG per run.
3. **Drafts carry the raw screenshot, not the branded render.** Renders sit
   beside the drafts. One capture and one render per run; the render's
   headline is the release title cut to 60 characters.
4. **A saved session lasts 24 hours from the last human sign-in**, however often
   it is used. A release that lands later parks until a person signs in again.

Production has not yet produced a capture-to-draft result. The 11-14 ledger
records the deferred UI run and a missing GitHub App repository grant.

## Stage by stage

| Stage | What exists | Verified in this session | Main gap |
| --- | --- | --- | --- |
| 1. Sign in to staging | Cloudflare Live View sign-in by a person, identity check, cookie and localStorage export, encrypted state, fresh-browser restore check, `needs_auth` parking and reconnect | Real-Chrome tests and 35 capture integration tests pass | 24-hour fixed lifetime; no unattended re-login; IndexedDB/sessionStorage apps fail |
| 2. Understand the release | GitHub release/PR/tag/milestone/deployment intake, dedupe, PR titles, bodies, labels, changed paths; AI relevance verdict | 40 release-automation integration tests pass | No feature extraction per change; no diff or code reading by design |
| 3. Choose screens and objectives | Deterministic feature-to-page lookup, used only by person-started paths | Read in source | Release automation binds one fixed page or recipe; objectives are hand-written |
| 4. AI drives and captures | Bounded text-only navigator over links and tabs; markers, masks, version proof; private storage; provenance | Real-Chrome navigation test with a scripted model passes | No buttons, dialogs, typing, scroll, vision, element crop, 2x, or video |
| 5. Place into a campaign | `render_creatives` fills 1–3 of the 7 layout templates that carry copy with brand gradient, text colour and font; links renders to the campaign | Covered by the integration tests above, with a recorded renderer | Drafts attach the raw capture; one image per run; no logo; canvas not rendered |
| 6. Review | Submit for review ends the run; approval pins exact renders; scheduling needs an approved variant | Not exercised beyond tests | None for this goal |

### 1. Signing in to the customer's staging app

How it works ([capture_connections.go](../server/internal/product/capture_connections.go),
[browser/state.go](../server/internal/capture/browser/state.go),
[sessionstate.go](../server/internal/capture/sessionstate/sessionstate.go)):

- Each `PlatformAppConnection` row (unique by name in a workspace, optionally tied
  to a source app, for one environment) holds the origin, approved hosts, sign-in
  hosts, protected path, CSS identity selector, expected account, encrypted state,
  generation and lease ([schema](../server/ent/schema/capture.go)).
- An owner or admin starts a sign-in. Shots allocates a Cloudflare Browser Run
  session and returns a Live View link with no-store headers; it is never stored,
  and the same person can refresh it for the same browser. The person
  signs in by hand, so OTP, password, SSO and MFA all depend on what the app
  and the person can do. Nothing types credentials.
- **I've signed in** proves the expected account on the live page, exports
  cookies for approved hosts and localStorage for the signed-in origin, closes
  that browser, and restores the state into a fresh browser. Only that passes
  the connection to Ready. Failures are classified as `sign_in_incomplete`,
  `wrong_account`, `session_restore_failed`, or a provider, page or recipe error (RC-013/RC-014,
  shipped in [#599](https://github.com/PlaybookMediaLLC/shots/pull/599)).
- State is AES-256-GCM sealed, bound to organization, connection, environment
  and generation. Each capture re-seals rotated cookies.
- An expired session parks the job as `needs_auth` for up to seven days and
  emits `capture.failed`. Reconnecting resumes it.

Limits that matter for unattended release capture:

- **24-hour lifetime.** `state_expires_at` is set only when a person finishes
  signing in ([capture_connections.go:446](../server/internal/product/capture_connections.go)).
  Re-sealing after a capture does not extend it
  ([capture_jobs.go:893-905](../server/internal/product/capture_jobs.go)). The
  default is RFC 007's pilot limit; `PLATFORM_CAPTURE_STATE_MAX_AGE` changes it
  for the whole deployment, with no upper bound.
- **No unattended re-login.** No stored passwords, TOTP, mailbox OTP or
  app-provided session bootstrap exists. The RFCs defer all of them.
- **Portable state is cookies and one origin's localStorage.** Apps that keep
  their session in IndexedDB, sessionStorage, device-bound credentials or
  passkeys fail the restore check
  ([state.go:16-19](../server/internal/capture/browser/state.go)). Firebase
  Auth's web SDK persists to IndexedDB by default, so such apps will not connect.
- **Setup is manual.** The customer types the origin, hosts, protected path and
  a CSS identity selector ([CaptureConnections.tsx](../clients/apps/web/components/workflows/CaptureConnections.tsx)).
- **Notification is quiet.** `capture.failed` is restricted to operators with
  email off by default ([activity/events.go:42](../server/internal/activity/events.go)).
- **Cloudflare is the only provider.** Browser Use and Browserbase are
  evaluation candidates in the [addendum](rfcs/authenticated-capture-runtime-and-recovery.md#7-managed-ai-agent-evaluation);
  no code exists.

### 2. Working out what the release changed

- Intake: the GitHub App webhook (HMAC-verified) accepts published releases,
  merged PRs, created tags, closed milestones and successful deployments, plus
  signed per-source GitHub, GitLab and generic webhooks, and signed Vercel and
  Netlify webhooks on frontend deployment connections.
  A unique `(organization, source, semantic key)` deduplicates redelivery.
- Evidence: release name, tag and notes; PR title, body, labels, size counts;
  changed file paths (never contents). Feature bullets are parsed from notes by
  a regex ([releasenotes.go](../server/internal/releasenotes/releasenotes.go)).
  Code is read only by **Render a code visual**, with explicit consent.
- AI, all through OpenRouter (`OPENROUTER_API_KEY`, default
  `anthropic/claude-haiku-5.5` per role in
  [platformai.go](../server/internal/platformai/platformai.go)):
  - `classify`: one verdict, confidence and rationale ([release_automation_relevance.go](../server/internal/product/release_automation_relevance.go));
  - `generate_copy`: post copy grounded in title and notes, fenced as untrusted ([release_automation_generation.go](../server/internal/product/release_automation_generation.go));
  - the web launch pipeline's spec extracts named capabilities, but only when a
    person starts it, and its GitHub reads carry no token, so private PR text is
    likely missing there ([lib/launch/sources.ts](../clients/apps/web/lib/launch/sources.ts)).
- RFC 016's classifier fields (`suggestedFeatureName`, `affectedSurfaceHints`)
  exist only in the RFC.

### 3. Choosing the screens to capture

- `capture_product` takes one `surfaceId` or one `recipeId`, fixed in the graph
  ([release_automation_capture.go](../server/internal/product/release_automation_capture.go)).
  The validator allows one capture per run ([graph.go:129-138](../server/internal/releaseautomation/graph.go)).
- On deployment, every registered page in the deployment's environment on the
  deployed origin (up to ten), plus every active recipe on that source's connections
  for that environment, is captured, whatever changed.
- `FindSurfacesForFeature` scores pages by tag, name and token overlap, with no
  model, and falls back to the homepage ([surfaces.go:363](../server/internal/product/surfaces.go)).
  Only person-started paths use it (the launch pipeline, for its first three
  capabilities, and the chat assistant); release automation never does.
- The navigation objective is written by a person on a capture recipe
  ([recipe.go:84-88](../server/internal/capture/browser/recipe.go)). Nothing
  generates one from a release.
- Product pages come from manual entry or onboarding, and onboarding adds only
  pricing, features, docs and changelog pages
  ([temporalonboarding/activities.go:374-385](../server/internal/temporalonboarding/activities.go)).
  No in-app screen is discovered automatically.

### 4. AI driving the app

[navigation.go](../server/internal/capture/browser/navigation.go),
[capture_navigation.go](../server/internal/product/capture_navigation.go),
[run.go](../server/internal/capture/browser/run.go):

- **Observation:** current path, up to 12 headings, up to 60 controls from
  `nav a[href]`, `[role=navigation] a[href]` and `[role=tab]`, and a `ready`
  flag. Forms, masked elements, the identity element and email addresses are
  removed. No screenshot, accessibility tree or DOM.
- **Decision:** one strict-JSON call per step on the fast model:
  `select | capture | stop` with a control ID. A link is a direct navigation;
  a tab is a scripted click.
- **Bounds:** 1–6 actions and 1–20 credits per attempt, 20 s per model call,
  90 s per attempt, 3 navigation attempts per job, loop detection.
- **Safety outside the model:** HTTPS to approved hosts only; GET, HEAD and
  OPTIONS, plus POST only to a recipe's listed paths; no private IPs,
  WebSockets, workers, popups, downloads or dialogs; off-origin and
  auth/delete/checkout links dropped before the model sees them.
- **Success:** the recipe's CSS markers present and visible, forbidden selectors
  absent, optional deployed-commit proof. No vision check.
- **Output:** one viewport PNG at device scale 1, masked areas painted black,
  stored privately as a `capture` asset; the attempt records URL, revision and
  refused requests. The action trace is only an audit entry
  (`product.capture_navigation_completed`), not shown in the UI.

Cannot do today: click a button or menu, open a dialog, expand a panel, type,
scroll, hover, choose from a dropdown, capture an element or the full page,
capture at 2x or in dark mode, or record a clip.

### 5. Placing the screenshots into a campaign

- `create_campaign` makes one post per destination from the release title and
  notes. `capture_product` links the capture as `product-shot`.
- `render_creatives` signs a request to the web, which fills each chosen
  template with the capture, the release title and the notes' first line,
  applies the brand gradient, text colour and font, renders through the editor's
  export path, and links each render as `design-render`
  ([render.ts:85-112](../clients/apps/web/lib/workflows/render.ts)).
- Templates: Headline spotlight, Browser launch, Laptop launch, Product suite,
  Phone duo, Editorial (16:9), Social phone card (1:1), Story phone (9:16)
  ([lib/design/templates.ts](../clients/apps/web/lib/design/templates.ts)). The
  workflow builder offers the seven that carry copy; Phone duo shows no headline.

Gaps:

- Drafts attach the raw capture ([release_automation_drafts.go:129-130](../server/internal/product/release_automation_drafts.go));
  `RenderedAssetIDs` stay on the run outputs.
- The headline is the release title, not generated copy
  ([release_automation_render.go:154-161](../server/internal/product/release_automation_render.go)).
- The brand logo is read but never placed ([lib/launch/brand.ts:50-53, 83-100](../clients/apps/web/lib/launch/brand.ts)).
- No zoom or highlight on the changed element: captures record no bounding box.
- One capture and one render node per run; a campaign post holds one creative
  variant, so there is no carousel ([ent/schema/bootstrap.go:39](../server/ent/schema/bootstrap.go)).
- `create_canvas` stores a canvas but never renders it or links it to the
  campaign ([lib/workflows/canvas.ts:150-176](../clients/apps/web/lib/workflows/canvas.ts)).
- The launch pipeline does pick templates with AI, adjust zoom, annotate and
  critique renders with a vision model, but it is a separate, person-started
  path. Its design tools accept only `capture-*` links, so they cannot use an
  automation `product-shot` ([design-studio.ts:78-81](../clients/apps/web/lib/ai/tools/design-studio.ts)),
  and its signed-in pages are only queued
  ([campaign-studio.ts:111-118](../clients/apps/web/lib/ai/tools/campaign-studio.ts)).

## What ran in this session

| Check | Result |
| --- | --- |
| `go test ./internal/capture/browser -run TestRealBrowser` with local Chromium | 5/5 pass: sign-in, export, fresh restore, scripted-model navigation, masks, approved hosts, refusals |
| `^TestCapture` in `internal/product` on a migrated local Postgres | Pass (35 tests): sign-in stages, viewer refresh, tenant denial, parking, fencing, crash recovery, capture → render |
| Release-automation integration tests (40) | Pass: AI verdicts reused and billed once, charge-once copy, tag releases, renders with and without a capture |
| `temporalcapture`, `temporalreleaseautomation`, `releaseautomation`, `capture/...`, `platformai` | Pass |

Running the real-Chrome tests as root in a cloud container needs a wrapper that
adds `--no-sandbox` and `--no-proxy-server`; without the second flag Chrome
sends the test hosts to the agent proxy and every test fails with `page_failed`.

Not run: live Cloudflare tests (no `PLATFORM_CAPTURE_CDP_*`), any real model
call (no `OPENROUTER_API_KEY`), object storage, the browser suite, and any
production UI. Every navigation test uses a scripted model, so no test
measures how often a real model reaches the right screen.

## Gaps, ranked, with the smallest change for each

Order follows what blocks the goal first. Sizes are rough. Items 3–6 add
product scope under RFC 007, which is conditional; they need an owner decision
or scoped authorization in [the RFC index](rfcs/README.md).

1. **Prove the existing chain in production (no code).** Run Day 1 of the
   [focus plan](plans/authenticated-capture-focus.md#day-1--obtain-one-complete-usable-result)
   on the Verifier fixture: capture, campaign, two drafts, edit, save, reload.
   Needs a person at an uninterrupted browser. In parallel, the
   Oppulence-Engineering org owner grants the GitHub App the Verifier repository.
2. **Decide the session lifetime (policy, then small code).** Options: raise
   `PLATFORM_CAPTURE_STATE_MAX_AGE`; or extend `state_expires_at` after each
   verified capture, under an absolute cap from the last human sign-in. Turn on
   email for `capture.failed` when it means `needs_auth`.
3. **Drafts carry the branded render (small).** When `render_creatives` ran,
   attach its first render to the drafts instead of the raw capture, keeping
   the capture linked as evidence. Use generated copy, or the feature name, for
   the headline when available. Place the brand logo.
4. **Release-derived capture plan (medium).** Let `capture_product` choose up to
   three of the workspace's **active recipes** for the release: features from
   the release notes and PR titles, matched with `FindSurfacesForFeature` and
   optionally re-ranked by one structured model call restricted to existing
   recipe IDs. Append the feature text to each recipe's objective as fenced
   untrusted evidence. This lifts the one-capture-per-run limit, carries a list
   of capture IDs to `render_creatives`, and needs a new graph language version
   with Temporal replay care.
5. **Wider, still read-only navigation (medium).** Offer `button`,
   `[aria-expanded]`, `[aria-haspopup]` and menu items (never submit buttons) as
   clickable controls. The network policy already refuses writes. Record the
   target marker's bounding box and allow an element crop at device scale 2 so
   templates can zoom on the change. Measure on real staging apps, then run the
   addendum's managed-agent evaluation only if failures remain.
6. **Composition across features (medium).** One render per captured feature,
   a carousel or one post per feature, and render plus link the release canvas.
   Accept `product-shot` in the launch pipeline's design tools so its AI
   designer can work on automation captures.
7. **Smaller fixes.**
   - A navigation recipe on a worker with no model or meter fails as retryable
     `navigation_unavailable` before allocating a browser, so the job retries
     with backoff until its 30-minute deadline instead of failing fast
     ([capture_jobs.go:680-681](../server/internal/product/capture_jobs.go),
     [run.go:50](../server/internal/capture/browser/run.go)).
   - Show the navigation trace on the capture, not only in the audit log.
   - Assisted setup that proposes the identity selector and protected path.
   - Test IndexedDB-backed sign-in before promising it.

## Documentation drift found

- The addendum's ledger still lists RC-013 and RC-014 as "correction pending";
  [#599](https://github.com/PlaybookMediaLLC/shots/pull/599) shipped both.
- RFC 029's 2026-10-16 status note says authenticated capture is not built;
  recipes, jobs and the navigator are implemented.
- [Notification events](workspace-notification-events.md) and the catalogue name
  `handleDeploymentEvent` as the `capture.failed` emitter; no such function exists.
  The emitters are `captureDeployment`, `failCapture` and, until this branch,
  `parkCaptureJob`.

## Dependencies outside the code

| Need | Owner |
| --- | --- |
| Production capture-to-draft UI run | Shots operator with an uninterrupted browser |
| GitHub App access to the Verifier repository | Oppulence-Engineering organization owner |
| `OPENROUTER_API_KEY`, Cloudflare capture credentials and object storage, to run a real model and provider outside production | Platform engineering |
| Session-lifetime policy above 24 hours | Product owner, against RFC 007's pilot limit |

## Implemented on this branch

Every code gap above is closed on this branch. Production acceptance (gap 1) and the
dependencies outside the code remain open: they need people and credentials, not code.

| Gap | What changed | Proof |
| --- | --- | --- |
| 2. Session lifetime | Each verified capture renews saved state for another `PLATFORM_CAPTURE_STATE_MAX_AGE` (24 hours by default), capped 30 days after the person's last sign-in. A lapsed sign-in emits the new `capture.needs_auth` event once per connection and generation, emailed to operators by default. | `TestCaptureRenewsTheSessionWithinItsCap`, notification assertion in `TestCaptureExpiredSessionParksTheJobUntilAPersonReconnects` |
| 3. Drafts carry the render | Drafts attach the branded renders, one per captured change (or the first render of one capture), within each channel's media limit; captures stay linked as evidence. The headline is the captured change, else the first sentence of the first post. Renders place the brand logo. | `TestAutomationCapturedCampaignCreatesEditableDraft`, `TestAutomationDraftMediaPrefersOneRenderPerCapturedChange`, `TestAutomationHeadlineText` |
| 4. Release-derived capture plan | `capture_product` with `matchRelease` (language version 4): one bounded model call chooses up to three of the source's active recipes that show the release, stored before it is charged; each navigating recipe runs a job steered by the change as untrusted evidence, kept out of the page's history; the node waits out the captures' deadline; `capture_unmatched` when none fits. Editor, contracts, run outputs and run page support it, and copy generation can describe a steered capture. | `TestCaptureReleaseMatchChoosesPagesAndSteersNavigation`, `TestCaptureProductLanguage`, web contract test |
| 5. Wider navigation | AI navigation may press controls that open a menu, panel, dialog or disclosure (`aria-haspopup`, `aria-expanded`, `summary`); never a toggle, a grid row, a control in a form, one that submits, one named for a risky action, or any button when the recipe allows a POST path. Every press rechecks what the observation checked, and requests to sign-out paths are refused. Recipes may capture at scale 2 and crop to the first marker; every result records the marker's focus box. | `TestRealBrowserPressesOnlySafeButtons`, `TestRealBrowserCropsTheMarkerAtDoubleScale` |
| 6. Composition across features | One render per captured change, numbered parts so designs never collide; a release-matched run's canvas lays out its captures first and renders up to three artboards into the campaign when the web renderer is on; the launch designer accepts automation captures. | `TestAutomationRenderCreativesRendersEachCapturedChange` |
| 7. Smaller fixes | `navigation_unconfigured` fails a navigation recipe at once on a worker without a model. Capture jobs show the AI's path and the release change. The account element is optional: without it, the expected account must be an email, shown as visible text in the header or navigation and outside main content, sidebars, tables, option lists and dialogs. IndexedDB-only sessions are pinned as refused. | `TestCaptureNavigationWithoutAModelFailsAtOnce`, `TestRealBrowserProvesTheAccountWithoutASelector`, `TestRealBrowserRefusesAnIndexedDBOnlySession` |

Still open, unchanged by code: the production capture-to-draft run, the GitHub App
repository grant, a real-model and real-provider measurement of navigation success,
and the decision on whether 30 days is the right absolute cap for saved sessions.
