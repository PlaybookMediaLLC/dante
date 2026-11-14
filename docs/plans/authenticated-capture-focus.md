# Reliable authenticated capture: research and execution plan

**Prepared:** 2026-11-14

**Status:** Working draft; execution results remain in the validation ledger

**Timebox:** Four focused working days, followed by an evidence-based decision

**Accountable owner:** Shots product engineering; assign a named driver at kickoff

## 1. The precise problem

Shots must turn an authorized product change into reviewable communication
using real evidence from the customer's application. The difficult part is
reliably reaching the correct signed-in application state, finding the relevant
feature with AI, and carrying the resulting screenshot into an editable draft.

The customer supplies an application, an environment, an authorized test
account or session, and a feature objective. They should not need to write
Playwright scripts. A one-time human sign-in can establish a session; subsequent
captures should reuse it while the application considers it valid. When it
expires, Shots must explain what happened and provide a working reconnection
path. We must not promise that every identity provider permits unattended login.

**The outcome for this timebox:** a representative release produces a genuine
feature screenshot, a persisted campaign, and editable platform drafts in
production. A second distinct release completes the same path. Re-delivering
either event does not create an unintended second campaign.

A Ready connection, a browser launch, a screenshot object, or generated copy
alone does not satisfy this outcome. The user must be able to open, edit, save,
and reopen the resulting draft with its real media attachment.

This document adds a daily work sequence and market evidence to the existing
[capture RFC](../rfcs/authenticated-capture-runtime-and-recovery.md). The RFC
owns the design; the [validation ledger](../release-campaign-validation-2026-11-14.md)
owns results and defects. It does not replace the [RFC execution order](../rfcs/README.md)
or expand this assignment into a general browser platform.

## 2. What market research establishes

Research checked on 2026-11-14. Browser Rendering is now named **Browser Run**;
older names remain in documentation and API paths. These are public-source
findings, not independent audits of vendor production systems.

| Reference | Public evidence | Relevance to Shots | Evidence limit |
| --- | --- | --- | --- |
| **Lovable** | Cloudflare publishes a named testimonial from founding engineer Emil Ahlbäck confirming screenshot capture at scale through Browser Rendering. [Source](https://www.cloudflare.com/products/browser-run/) | An application-building product uses this browser service for screenshots. | No disclosed customer-login, session-restoration, AI feature-discovery, or campaign workflow; no independent reliability measurement. |
| **RenderScreenshot** | Its operator describes a production Rails API, Cloudflare rendering Worker, headless Chromium, and R2 image storage. [Architecture](https://www.renderscreenshot.com/blog/how-we-built-renderscreenshot) | Closest external reference for building a screenshot product around the same infrastructure. | Operator-reported deployment; not evidence of autonomous release analysis or campaign generation. |
| **RenderScreenshot authenticated capture** | Documents cookies, bearer tokens, headers and HTTP Basic Auth, with a post-login selector to detect failed authentication. [Guide](https://www.renderscreenshot.com/docs/guides/screenshot-authenticated-pages) | Direct reference for capturing a signed-in application and rejecting login-page images. | Published examples used a local mock API and local Chrome. They do not prove production Google SSO or MFA automation. |
| **Cloudflare Radar URL Scanner** | Cloudflare documents browser navigation, screenshots, network evidence, asynchronous orchestration and R2 persistence. [Engineering case study](https://blog.cloudflare.com/building-urlscanner/) | Useful operational reference for browser jobs and retrievable evidence. | Cloudflare's own product, built for security scanning. Almost one million cumulative scans was a March 2024 claim, not a current throughput figure. |
| **Cequence AI Gateway** | Documents connecting AI tools to Cloudflare's Browser Rendering MCP server for screenshots and page content. [Integration](https://docs.aigateway.cequence.ai/docs/remote-mcp-servers/cloudflare-browser/) | Confirms a documented path from an AI tool to Cloudflare rendering. | An integration offering is not proof of a customer-app capture deployment. Its OAuth authenticates Cloudflare access, not the target application. |

Two additional findings need careful qualification:

- A former Cloudflare technical writer describes building an AI screenshot
  system with Browser Rendering and Workers AI to detect product changes and
  update documentation. This is a relevant individual work claim, not a company
  case study or production acceptance report.
  [Published résumé](https://maxvphillips.com/MaxPhillips_resume.pdf)
- TeN / LandingHub's customer story says it was considering Browser Rendering
  for performance evaluations. Count it as interest, not confirmed adoption.
  [Customer story](https://www.cloudflare.com/case-studies/ten/)

**Research conclusion:** there is credible public adoption of Cloudflare for
screenshot infrastructure and documented support for authenticated captures.
We did not find public proof of the complete Shots release-to-campaign workflow.
That absence is a research limit, not proof that no company does it.

RenderScreenshot's guide also states that stored captures receive a CDN URL
requiring no authentication. Shots must retain its private media contract for
customer application images; copying that delivery model would not meet our
requirements. The same guide is the source for both its authentication support
and this storage limitation.

## 3. Working decision for the next few days

Keep Cloudflare as the browser execution baseline. Measure the failures in our
actual workflow before choosing a replacement. A browser host, an AI agent,
application authentication, and a campaign generator are separate parts of the
system; changing one must address an observed failure in that part.

Cloudflare documents Live View and human intervention for login or other
blocked steps. It also publishes a Claude Managed Agents integration with
browser execution and screenshot tools. These are evaluation options, not
claims that Shots uses those tools or that Anthropic hosts all browsing there.
[Browser Run capabilities](https://blog.cloudflare.com/browser-run-for-ai-agents/)
and [managed-agent integration](https://blog.cloudflare.com/claude-managed-agents/).

The current [RFC's managed-agent evaluation](../rfcs/authenticated-capture-runtime-and-recovery.md#7-managed-ai-agent-evaluation)
remains in force: Browser Use is the first hosted-agent candidate and
Browserbase is a comparison candidate. Evaluate only if the baseline exposes a
specific gap. No new subscription, provider migration, browser fleet, queue,
credential store, campaign model, or mailbox connector is part of this document.

## 4. Starting evidence and open dependencies

The following is the **recorded November 14 baseline**, not a fresh health check.
Reconfirm the deployed revision, account access and session validity before a run.
See the [delivery record](../release-campaign-validation-2026-11-14.md#delivery-record)
for exact checks, PRs, CI runs and deployment evidence.

| Item | Recorded state | Next proof needed |
| --- | --- | --- |
| Recovery fixes | PRs [#599](https://github.com/PlaybookMediaLLC/shots/pull/599) and [#600](https://github.com/PlaybookMediaLLC/shots/pull/600) merged; production revision `f94ba8c9e4751e2b03fb8f6e2d1afdf5dd8be15c` deployed | Exercise the new diagnostics and same-session viewer controls in the deployed UI. |
| Verifier saved session | Real Cloudflare restoration, live identity proof, export and independent fresh-browser verification passed | Capture through the normal Shots UI and durable job path. |
| Verifier product page | `Verifier analytics validation`, URL `https://verifier.playbookmedia.io/app/analytics`, persisted; last recorded as Never captured | AI navigation, genuine screenshot, private retrieval and provenance. |
| Campaign and draft | No accepted screenshot, campaign or draft identifiers for this validation cycle | Complete the handoff, media attachment, edit, save and reload. |
| Production browser control | User deferred UI work because concurrent Chrome activity interrupted control | Re-establish an uninterrupted test window; controller failures are not application-auth failures. |
| GitHub release intake | Shots app lacks access to the selected Verifier repository | Organization owner grants only the intended repository, then verify the association and real event delivery. |

The recorded connection ID is `cmwfhd2jz00030a021gf9dvvc`; the product-page ID
is `cmwg2ycjd0003092v5wqrb0zp`. These identify the existing authorized test
fixture. They are not defaults to hardcode into application code.

The recorded GitHub installation is `178812766` in `Oppulence-Engineering`.
The repository discovered during setup was `paperless-check-if-email-exists`
(singular `email`; the initial request used a different spelling). Verify the
repository ID and full name before changing the installation or triggering a
release. The organization owner manages the
[selected repository grant](https://github.com/organizations/Oppulence-Engineering/settings/installations/178812766).

Manual current-state capture can unblock capture and draft testing while that
grant is pending. It must remain labeled manual validation and cannot satisfy
the release-ingestion gate.

## 5. Execution path and ownership

```text
Qualified release + application/environment configuration
  → existing release intake and durable orchestration
  → tenant-scoped capture admission and session lease
  → Cloudflare browser + saved-session identity check
  → bounded AI navigation + feature-state verification
  → original screenshot + private storage + provenance
  → existing campaign and platform draft generation
  → Shots review/editor → save → reload
```

| Responsibility | Existing owner | Work in this timebox |
| --- | --- | --- |
| Configuration, live sign-in and recovery UI | Web workflow components, capture tRPC contracts and backend SDK | Verify save/reload, Resume, Refresh, Start over and actionable failures. |
| Session ownership and completion | `server/internal/product/capture_connections.go` | Verify identity, tenant/actor scope, generation fencing, expiry and revocation. |
| Browser and state export | `server/internal/capture/browser` and existing session-state encryption | Verify guarded navigation, state restoration, live view and cleanup. |
| Capture admission and execution | `server/internal/product/capture_jobs.go`, `server/internal/temporalcapture` | Follow durable state, retries, cancellation and asset commit. |
| AI action selection | `server/internal/product/capture_navigation.go`, `server/internal/capture/browser/navigation.go` | Prove objective-driven navigation, evidence checks and bounded recovery. |
| Campaign, drafts and editor | Existing product campaign/draft domains and web editor handoff | Prove correct relationships, platform output, edit persistence and original-image preservation. |
| Quality and release | Existing Go, client and browser test suites; documented develop-to-main flow | Reproduce, fix, review, deploy, pin revision and retest. |

These are ownership roles, not separate services or new hiring requirements.
The implementation driver remains accountable for the complete result. Read
current callers, contracts and tests before each correction; this map is an
entry point rather than a substitute for source inspection.

## 6. Four-day work sequence

Days are working sessions, not promised calendar completion dates. Start each
day by reviewing the ledger, blockers and deployed revision. If a gate fails,
fix the underlying cause and repeat that gate before claiming the next one.

### Day 1 — Obtain one complete, usable result

1. Reconfirm the deployed revision and existing Verifier connection. Reuse its
   saved session if valid; do not force another login merely to begin the test.
2. Use the normal Shots UI to finish the existing analytics fixture. Start from
   the application entry page and give the agent a read-only Analytics objective.
3. Observe the durable run, navigation and capture. Verify the image contains
   the intended application state, not a login form, loading screen or error.
4. Open the original from Shots, follow the existing campaign handoff, and create
   editable drafts for two already-supported, configured platforms from that
   screenshot. Keep every output in draft state.
5. Edit copy and an image derivative, save, reload and reopen. Confirm attachments,
   relationships and the preserved original. Record artifact IDs and safe links.
6. Reproduce each failure at its owning layer; implement the smallest complete
   correction with regression coverage. Start the repository-access dependency
   in parallel with work that does not depend on it.

**Exit evidence:** one UI-visible capture-to-draft chain with saved edits and
retrievable original media. If initiated manually, the result remains a manual
capture-to-draft pass and release-trigger acceptance stays open.

### Day 2 — Make sign-in and reuse predictable

1. Separate three authentication boundaries: the user's Shots session, Shots'
   access to Cloudflare, and the test account inside Verifier. Record which one
   fails; a viewer/control failure is a fourth, separate category.
2. Verify Resume after reloading Shots and Refresh after viewer expiry, retaining
   the same active remote browser and the original sign-in deadline.
3. Verify live identity and fresh-browser restoration. A valid login landing on
   another page must still be checked at the configured protected path.
4. Repeat capture with the valid saved session and no new OTP. Check again on
   the next working day; application expiry always takes precedence over reuse.
5. Exercise wrong identity, incomplete login, expired/revoked state and restore
   failure in an isolated fixture. Verify clear errors and successful reconnect.

**Exit evidence:** session reuse works while valid, invalid state fails honestly,
and the normal user recovery path works. Document supported authentication
methods and limits. Email/password is not a universal prerequisite; email OTP
worked in the recorded Verifier baseline. Google SSO, passkeys and device-bound
sessions remain unverified unless separately demonstrated.

### Day 3 — Make navigation and failure handling dependable

1. Supply a release description with a supported feature objective. Record what
   the agent inferred from release facts and what it actually observed in the UI.
2. Prove navigation from the entry page using observed controls. Verify success
   from the reached UI state; the agent's completion message alone is insufficient.
3. Exercise insufficient release metadata and a missing target. Use bounded
   discovery or a clear partial result; do not invent features or capture success.
4. Test failed actions, repeated actions, slow rendering, model timeout, malformed
   model output, browser loss, storage failure and interrupted jobs. Inject faults
   in the isolated test stack, not by disrupting shared production services.
5. Verify bounded retries, cleanup, generation fencing and recovery without
   duplicated campaign outputs. Verify cross-tenant denial and that page content
   cannot instruct the agent to send credentials or leave allowed destinations.
6. Confirm regeneration preserves edits to other content and never schedules or
   publishes a draft. Missing capture coverage must remain visible to reviewers.

**Exit evidence:** relevant captured state plus a negative-case matrix showing
bounded, actionable outcomes. No false success, leaked session, orphaned browser,
or unintended duplicate is acceptable.

### Day 4 — Validate releases and repeat on the deployed revision

1. With repository access available, verify application/environment ownership and
   release qualification through the supported configuration UI. Inspect other
   side effects of the chosen test release before triggering it.
2. Submit an authorized representative release through the real intake path.
   Follow its event, capture run, screenshot, campaign and draft associations.
3. Deliver the same event again and confirm one logical campaign. Then submit a
   second distinct release and repeat the complete UI flow with saved-session reuse
   while valid. Record edit/save/reload evidence for both results.
4. For corrections, run required checks and independent implementation review,
   merge through develop, promote through a develop-to-main merge commit, monitor
   deployment, and confirm the actual image revision before production retesting.
5. Make the provider decision using the scorecard below. If an external dependency
   still blocks release intake, report partial acceptance with its exact owner and
   required action; do not substitute a synthetic database row or manual capture.

**Exit evidence:** two complete production release-to-draft runs, duplicate-event
proof, passing regressions, and the immutable deployed revision for those results.

## 7. Experiment controls and measurement

Use the existing configured limits for action steps, wall time, retries,
concurrency and model expenditure. Record their actual values before each batch.
If a required limit is absent, address it in the existing owner before running
an unattended batch. Do not increase a limit just to hide a loop or failure.

For the first repeatability batch, target **five complete attempts** on the same
known fixture, including at least one next-day saved-session attempt. This is
a proposed small pilot gate, not a statistical reliability claim. The two real
release runs can count toward the five when they exercise that same fixture.
Count every retry, failed attempt and human intervention; do not reset the
denominator after a fix. Report revision-specific results separately.

Stop the batch on unauthorized navigation, tenant leakage, an unexpected
mutation, unbounded resource use or false-success output. Provider or model
credit failures are explicit failures; do not enable new spending or silently
replace missing AI output with claimed success.

| Measure | Definition | Initial target |
| --- | --- | --- |
| Complete result | Valid capture, persisted campaign/media, platform drafts, edit/save/reload | 5/5 controlled attempts; report actual numerator and denominator. |
| Release acceptance | Full real release path on the confirmed production revision | Two distinct releases, both complete; duplicate delivery creates no extra campaign. |
| Session reuse | Capture succeeds without a new login while the target session is valid | Every valid-session attempt; expired sessions counted separately with recovery result. |
| Feature correctness | Reviewer confirms intended feature and meaningful UI state | Every accepted screenshot; unsupported or unavailable features remain unresolved. |
| False success | Success reported without the required image, persistence or association | Zero. |
| Isolation and side effects | Cross-tenant access, secret exposure, destructive action or publication | Zero. |
| Time to reviewable draft | Event receipt to a persisted draft with retrievable media | Record median and range; set a product latency target after the baseline. |
| Full task cost | Browser, model/agent, traffic, storage, retries and attributable operations | Record per accepted result; no claim that low browser cost means low total cost. |
| Human effort | Active operator minutes and intervention count, including reconnection | Record separately from machine duration and compare between revisions. |

The existing RFC defines the cost model. Do not copy vendor headline prices
into a buying decision without checking current terms and measuring the whole
task. No new provider is approved merely by appearing in this document.

## 8. Provider decision gate

| Observed result | Decision |
| --- | --- |
| Cloudflare completes the workflow; defects are in Shots' orchestration, UI or campaign handoff | Keep Cloudflare and fix the owning Shots layer. |
| Rendering and auth work, but the agent repeatedly fails navigation within bounds | Evaluate the AI controller at the existing capture boundary. Start with the RFC candidates or documented Cloudflare-compatible agent tooling. |
| A reproducible provider limitation prevents the supported auth/session workflow | Run a narrowly scoped comparison on the same authorized fixture, objective, budgets and evidence contract. |
| A replacement passes all hard safety and output gates and improves the measured failure | Propose the smallest adapter change with cost, retention, rollback and migration evidence. |
| No candidate meets the gates | Keep the failure visible and define a supported assisted path; do not claim general unattended capture. |

Compare browser hosting and managed-agent services as complete configurations,
including their different model costs and controls. A replacement must enforce
tenant isolation, destination restrictions, private media retrieval, bounded
execution, cancellation and revocation. A prompt asking the model to be safe
does not meet those requirements. Reconcile an ambiguously accepted provider
task before retrying a billable creation request.

Self-hosting remains deferred unless a measured requirement cannot be met by
managed options. This timebox must not become a browser-fleet construction project.

## 9. Acceptance checklist

- [ ] Application, environment, staging URL, auth and trigger configuration survive reload.
- [ ] The real release is attributed to the correct organization and application.
- [ ] The capture run is durable and traceable through its browser session.
- [ ] Saved authentication restores to the expected account; invalid state has working recovery.
- [ ] AI reaches a relevant feature from the entry page within configured bounds.
- [ ] A genuine screenshot shows a meaningful state and is privately retrievable.
- [ ] Provenance records release/manual context, app, environment, feature, URL, actions and asset commit.
- [ ] A persisted campaign uses actual release facts and capture evidence, with honest partial coverage.
- [ ] Two configured platform drafts can share a captured image and remain editable drafts.
- [ ] Copy and image edits persist after reload; the original and unrelated user edits remain intact.
- [ ] Two distinct production releases complete; duplicate delivery produces no unintended campaign.
- [ ] Expiry, missing features, model/browser/storage failures and interruptions have bounded recovery.
- [ ] Tenant, secret-handling, navigation and no-publication boundaries pass their tests.
- [ ] Required regression checks and independent implementation reviews pass.
- [ ] Tested production revision and terminal deployment evidence are recorded.

All boxes require observed evidence. Mark blocked, failed, partial and untested
explicitly in the ledger; none counts as passed. A screenshot without a usable
draft is a partial result. A manual capture without release intake is also partial.

## 10. Daily evidence and handoff

Extend the existing validation ledger instead of creating another defect tracker.
For each defect, retain ID, severity, reproduction, root cause, owner/files, fix,
regression coverage, local result, PR/SHA, deployment and production retest.

For each run, record:

| Field | Required content |
| --- | --- |
| Identity | Run timestamp, test case, tenant/app/environment IDs, real release ID or explicit manual context. |
| Revision | Deployed image SHA, configuration/recipe revision and connection generation. |
| Correlation | Existing release event → capture run → browser session → screenshot → campaign → post IDs, where created. |
| Execution | Objective, actual limits, sanitized action summary, final feature state, retries and cleanup outcome. |
| Artifacts | Authorized image/campaign/draft links or IDs, original/derivative lineage, save/reload result. |
| Outcome | Complete, partial, failed, blocked or untested; exact reason and recovery result. |
| Cost and effort | Browser/model use, total cost when available, elapsed time and human interventions. |

Never put raw cookies, tokens, OTPs, credential-bearing viewer URLs, or private
DOM dumps into this document, Git, routine logs, or campaign copy. Use the
existing private evidence storage and redact account details in review images.

End each working day with five statements: what became usable; what failed and
why; what is implemented versus locally validated, merged, deployed and production
verified; the next blocking experiment; and any external dependency with its owner.

**First action at kickoff:** open the existing Verifier connection and analytics
fixture on the confirmed production revision, then complete the capture-to-draft
UI test. That result determines the next fix.
