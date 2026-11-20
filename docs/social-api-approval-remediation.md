# LinkedIn and TikTok approval remediation

Status: in progress. Evidence checked on 19 November 2026. This is an execution
record, not a claim that either provider has granted unrestricted production
access. The review messages were found in the corrected Gmail mailbox.

## Confirmed provider decisions

| Provider                                                                           | Decision                                                                                                                                                                                                                                                        | Required response                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LinkedIn app `266690999`, **Shots**, client `78f9jn6fgiym90`                       | Community Management Development Tier denied on 16 November: business verification failed, case `015285039372799`. Its Auth page currently lists only `w_member_social`.                                                                                        | Do not keep retrying Page OAuth with this app. Production used this client before the approved-app configuration rollout.                                                         |
| LinkedIn app `266682906`, **Shots Local Page Publishing**, client `78mtmqhl9lv5kq` | Community Management **Development Tier approved** on 16 November, case `015285039369799`. The portal confirms the product and organization scopes. The app is verified under Solomon AI.                                                                       | Configure the exact production callback and its matching client/secret, verify Page publishing, then apply for Standard Tier. Development approval is not Standard Tier approval. |
| TikTok app `7704089936651438088`, **Shots**                                        | Production **Not approved**, email dated 13 November. The portal reviewer requires a visible full website URL and a real end-to-end UI demonstration. It explicitly prohibits AI agents, automation and simulated screens from driving the submitted recording. | An applicant must manually perform and record the flow. Replace the current Direct Post and Login Kit videos after the technical and scope checks below.                          |

Portal references:

- [Approved LinkedIn app](https://www.linkedin.com/developers/apps/266682906/products)
- [Rejected LinkedIn app](https://www.linkedin.com/developers/apps/266690999/auth)
- [TikTok pending application](https://developers.tiktok.com/app/7704089936651438088/pending)

## Reproduced production failure

After a fresh Shots sign-in, connecting LinkedIn Page returned:

```text
error=unauthorized_scope_error
Scope "w_organization_social" is not authorized for your application
```

The callback displayed a generic “connection was not completed” message. No
account was connected. The production client ID matched the rejected LinkedIn
app exactly. Its callback is already registered; its missing Page permission is
the immediate cause. The approved app had the Page permission but no registered
redirect URLs at initial inspection. With explicit user approval, the exact
Shots Page callback was registered and its saved state verified on 19 November.

The approved app's existing credential pair was then saved to Infisical
production `/screenshot-studio` at the user's request. CLI read-back confirmed
client ID `78mtmqhl9lv5kq` and a nonempty secret. A before/after fingerprint
confirmed the separate member credential pair was unchanged. The secret was
copied directly between the provider and vault UIs and was not printed. This
vault update alone was not proof that the running backend loaded the new values.
The two-key configuration-only deployment `8c7f1614-25c6-458b-9827-9d68e471f19a`
subsequently reached **ACTIVE**. DigitalOcean validated the exact proposal;
images, routes and other environment values were preserved. The public health
endpoint returned 200 throughout the rollout. A subsequent browser retry reached
the approved app's Page selection, offering Oppulence and Solomon AI. The final
Shots profile visibly lists **Solomon AI, @getsolomonai**, as **Connected and
ready to publish**. The Page connection is verified; real publishing is not.

The initial live Shots profile had a connected TikTok account and no LinkedIn
account. It now also has the Solomon AI LinkedIn Page. “Connected and ready” is
connection state, not proof of successful
publishing or app approval. No post was published during this investigation.

The production deployment inspected was active, with web and backend images at
`b501d58fce41032fbc746d912034d172e489919f`. The implementation worktree started
from develop `1911e23a415e3a383d1b6d2a23ffeed2c10e9668`; local source and live
production are different revisions. Recheck both before rollout.

## LinkedIn execution order

1. Use approved app `266682906`. Confirm its business details, verified Page,
   business email, website and privacy policy accurately describe the operator
   of Shots. Do not invent business verification information or submit another
   application under a different entity to work around the refusal.
2. Register exactly
   `https://shots.playbookmedia.io/integrations/social/linkedin-page` on that
   app. Retain any legitimate callbacks added by another operator meanwhile.
3. Update `PLATFORM_LINKEDIN_PAGE_CLIENT_ID` and
   `PLATFORM_LINKEDIN_PAGE_CLIENT_SECRET` as a matching pair in Infisical's
   production `/screenshot-studio` configuration. Keep secrets out of source,
   terminals, screenshots and this document. Keep the separate member app's
   `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` intact.
4. Review the exact deployment diff, deploy the configuration through the
   repository release procedure, and verify the active backend uses the approved
   client ID. Preserve the prior pair for rollback. Tokens belong to their
   issuing app: reconnect Page accounts after the switch, rather than attempting
   to refresh old-app tokens using the new secret.
5. Connect an administrator's eligible Page through Shots. Verify the consent,
   Page picker, selected Page name and completion in the intended workspace.
   Reject an unauthorized Page and a stale or tampered OAuth state.
6. Publish one explicitly approved, harmless Page canary. Verify the canonical
   scheduled post, provider receipt and actual Page permalink. Check text and a
   media post if both are claimed in the application. Check analytics and any
   other feature claimed in the Standard Tier request.
7. Open **Request upgrade** on the approved Community Management product. Supply
   accurate business/use-case details, reviewer access through an approved
   mechanism, and a downloadable high-resolution screencast of every claimed
   use case. Review any binding terms before submission. Save the submission
   receipt and monitor the decision email.
8. After Standard Tier approval, reconnect if the grant changed and repeat the
   live canary. Only then describe Page publishing as generally available under
   the approved limits.

LinkedIn's [review guidance](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)
requires business verification for Development Tier and a screencast for Standard
Tier. The [tier guide](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-migration-guide)
describes Development Tier's restricted limits and Standard Tier for production.

## TikTok implementation and configuration gates

The current composer already implements creator identity, a blank initial
privacy choice, provider-returned privacy options, disabled interaction controls,
commercial-content choices, branded-content restrictions, music/branded-content
disclosures and explicit publish consent. Reuse these controls. Confirm them
visually on the deployed revision rather than replacing them for the demo.

Two technical checks must precede a new review submission:

1. **App environment:** production configuration currently contains TikTok
   client key `sbawohftozdnj5qq14`. The reviewed app's Production portal shows
   client key `awzbk59h4enugvjj`, so the keys demonstrably differ. The current
   key was matched exactly to **Shots Local Publishing**, app
   `7704005451087611911`, sandbox **Shots Local Development**
   (`7704011086399522823`). That sandbox has `the_dark_lightskin` as its target
   user and still lists an ngrok website, terms and privacy URL, although it
   also permits the Shots callback. Configure the reviewed app's own sandbox
   before recording. Do not switch an existing account to a different app
   without reconnecting.
   Keep sandbox review proof and the later approved Production key/grant separate.
2. **Owned media URL:** the deployed TikTok adapter streams hosted R2 videos via
   `FILE_UPLOAD`. TikTok's current content-sharing guidelines require
   `PULL_FROM_URL` for media already on a server. Add or configure a secure,
   owned delivery origin before changing the adapter. A private R2 API hostname
   is not automatically a verified Shots domain.

The Production URL properties panel was checked: both `playbookmedia.io` and
`shots.playbookmedia.io` are listed under **Verified properties**. Its Sandbox
initially reported **No sandboxes yet**. With explicit user approval, **Shots
Review** (`7710081020557412360`) was created under the reviewed app by cloning
its rejected production configuration. The website, terms, privacy, callback,
Login Kit, Content Posting API, Direct Post setting and six scopes were verified
in the new sandbox. The user completed target-account authorization; the saved
Target Users table lists **foundertalks**, added 19 November at 10:43 PM. Use
that explicitly authorized account for the new review flow. No live credentials
have been replaced. The existing submitted application text explicitly says
`FILE_UPLOAD`; replace that description with the observed pull-based flow when
updating the application and manual demonstration.

Use this sandbox for the review, then activate the matching Production pair
only after approval. TikTok's [sandbox instructions](https://developers.tiktok.com/docs/en/add-a-sandbox)
separate sandbox configuration from Production and require a signed-in target
user. Sandbox video publishing cannot prove public production access.

Media delivery acceptance criteria:

- An HTTPS domain or URL prefix verified in the same TikTok app/environment.
- A direct response, with no redirect to R2. Reachable throughout TikTok's
  download window, which can last one hour.
- Expiring, authenticated access to exactly the tenant-authorized object. Keep
  the bucket private; do not create a permanent public asset URL or an arbitrary
  URL-fetch proxy.
- Streaming and byte-range support without loading a large video into memory;
  cancellation and upstream errors close the stream. No signed query string,
  token, credential or private object key in logs.
- Tests reject tampered/expired grants, foreign-tenant objects and invalid
  ranges; prove valid GET/range delivery and no redirects.
- The adapter sends `source=PULL_FROM_URL` with `video_url` for hosted media,
  performs no upload PUT for that path, and preserves pending-status polling and
  the existing no-retry rule for ambiguous publish initialization.

Reuse candidates inspected: `media.TenantObjects.SignDelivery` already checks
tenant object ownership and issues 24-hour provider URLs. Browser asset-download
grants are intentionally limited to two minutes and recheck the original user;
their current full-buffer read is unsuitable for large provider video delivery.
Public share links change sharing semantics and redirect to storage. Neither
should be weakened to serve as the provider delivery path. The existing
`R2_DELIVERY_ENDPOINT` changes the S3 signing host; it does not by itself provide
an authenticated custom-domain gateway for Cloudflare R2.

The local implementation extends the existing S3 store and tenant-authorized
delivery signer. `PLATFORM_PROVIDER_MEDIA_ORIGIN` enables an encrypted 24-hour
grant at `/provider-media/` on the public backend, without redirecting to R2.
It uses the existing backend service token with purpose-separated key
derivation, streams GET/HEAD/range requests, bounds transfers to ten minutes,
and rejects invalid or expired grants before storage access. It changes neither
browser upload/download URLs nor the bucket's privacy. The deploy configuration
accepts only an existing app HTTPS domain and preserves unrelated MCP routes.
The TikTok adapter now selects `PULL_FROM_URL` for hosted HTTPS video while
retaining the local-file upload path and pending-status reconciliation.

Before rollout, verify the same domain/prefix in TikTok, set
`PLATFORM_PROVIDER_MEDIA_ORIGIN=https://shots.playbookmedia.io` in production,
and deploy the reviewed backend plus routing change together. The gateway must
be live before workers issue its grants. A service-token rotation invalidates
outstanding grants; do not rotate it during a provider download window.

Sources: [TikTok content-sharing requirements](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
and [media-transfer requirements](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide).

## TikTok scope-to-demo checklist

The application and adapter currently request the same six scopes. Show every
retained capability. If a capability cannot be demonstrated, remove it from both
the portal request and the OAuth contract, and assess affected consumers first.

| Scope               | Proof required in the actual Shots UI                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.info.basic`   | Authorize login/connection and show the returned creator identity.                                                                                  |
| `user.info.profile` | Show the profile information that Shots actually uses, such as username.                                                                            |
| `user.info.stats`   | Show the real profile statistics feature that consumes the grant.                                                                                   |
| `video.list`        | Show the actual video/analytics feature backed by the creator's videos.                                                                             |
| `video.publish`     | Complete Direct Post through Shots and verify the final TikTok outcome.                                                                             |
| `video.upload`      | Send a separate clip to the TikTok app, open the inbox/draft there, and show the user finishing that flow. Do not label `SENT_TO_APP` as published. |

## Proposed TikTok submission text

The following draft is 911 characters, within the portal's 1,000-character limit.
Submit it only after the described deployment, features and manual recordings
have been verified. Remove any unsupported capability from both the text and
scope request through the existing owners before submission.

```text
Shots (https://shots.playbookmedia.io) helps teams draft, review and publish social posts.
Login Kit (user.info.basic, user.info.profile): users connect TikTok in Profiles; Shots displays the returned creator identity.
Direct Post (video.publish): users attach a video, review creator limits, choose privacy with no default, set permitted interactions, disclose commercial content and consent. TikTok pulls hosted media from our verified Shots domain; Shots tracks the final result.
Upload to TikTok (video.upload): users send a separate video to the TikTok inbox and finish it in the TikTok app. Shots labels it sent to app, not published.
user.info.stats displays account statistics; video.list powers public-video results and analytics.
This revision uses PULL_FROM_URL for hosted media. New applicant-operated recordings show the full website URL and each retained integration with the Shots Review sandbox.
```

## Manual TikTok recording script

The applicant must operate the UI throughout the submitted recording. Agent
clicks, browser automation, simulated accounts and generated screen footage are
not acceptable substitutes for this reviewer requirement. Agent investigation or
test footage must not be presented as the applicant's recording.

1. Use a normal browser window with the complete address bar visible. Open
   `https://shots.playbookmedia.io`, then show accessible Terms and Privacy Policy.
   The site/domain must match the application. Use the sandbox target account
   and the permissions approved for that review environment.
2. Sign into Shots, open Profiles, select the intended profile and connect
   TikTok. Show the real TikTok consent and the return to Shots with the correct
   creator. Pause recording for any password or MFA entry, without replacing the
   actual user interactions with simulated footage.
3. Open Publish, create a new task-specific draft, upload an original short MP4,
   preview it and edit its caption. Show creator name and upload-duration limit.
4. Show that privacy initially has no selection and interactions are not enabled
   by default. Choose an available privacy option. For an unaudited app, respect
   the private-post restrictions. Show disabled provider restrictions.
5. Show commercial-content controls, the applicable disclosures and the branded
   content/private-visibility restriction. Do not falsely label the canary as
   advertising merely to publish it; demonstrate the controls and return to the
   truthful settings for the actual clip.
6. Show the Music Usage Confirmation and any applicable Branded Content Policy,
   give explicit consent, and submit the approved canary. Show processing and the
   final result in Shots, then verify the actual TikTok post/account outcome.
   If delivery is unknown, reconcile it; do not retry to improve the recording.
7. Demonstrate the retained analytics/profile/video-list capabilities with real
   data. `video.list` reads public videos; use an existing public video from the
   authorized account instead of expecting the private sandbox canary to appear.
   A static screenshot or source-code explanation does not prove a scope.
8. In a second short clip if needed, use Send to TikTok app as draft, show
   `SENT_TO_APP`, and manually open TikTok to complete the user-side draft flow.

Keep videos in the portal's accepted MP4/MOV format, each at most 50 MB, with at
most five uploads. Review readability and complete URL visibility before
uploading. Existing submitted filenames were `shots-tiktok-direct-post-demo.mp4`
and `shots-tiktok-login-kit-demo.mp4`; their names do not prove compliance.

[TikTok's app-review guidance](https://developers.tiktok.com/docs/en/app-review-guidelines)
also requires a working public product/site and an end-to-end demonstration of
the requested integrations. The manual-recording requirement above comes from
this application's specific rejection note.

## Submission and release checklist

- [x] Register and verify the approved LinkedIn app's production callback.
- [x] Save the approved Page credential pair and verify the member pair is unchanged.
- [x] Deploy only the approved Page credential pair; verify ACTIVE and health.
- [x] Complete Page connection and verify Solomon AI in the live Shots profile.
- [x] Identify the current TikTok key's exact app and sandbox.
- [x] Create and verify Shots Review under the application being reviewed.
- [x] Verify foundertalks is authorized as the new sandbox's target user.
- [ ] Configure the matching credential pair and connect foundertalks before
      recording. Account tokens belong to the issuing app; plan reconnection
      for any existing accounts affected by a global key change.
- [ ] Confirm business details for the LinkedIn Standard Tier submission.
- [x] Implement and independently review compliant TikTok media delivery.
- [ ] Deploy compliant TikTok media delivery and verify live private-object retrieval.
- [ ] Verify TikTok app environment and all retained scope demonstrations.
- [x] Run focused tests, client quality checks and applicable Go/integration
      checks; record failures and unavailable checks separately.
- [x] Run the required independent review, resolve blockers and recheck.
- [ ] Obtain real provider receipts and visible canary results with approved
      content. Tests and sandbox success do not prove unrestricted production access.
- [ ] Applicant records the TikTok demo manually; review files against the script.
- [ ] Review exact application text, files, scopes and any terms; submit and save
      provider acknowledgements. Do not claim submission merely from saving a draft.
- [ ] Wait for provider approval, verify granted products/scopes, activate the
      matching production keys, and repeat live acceptance.

## Work completed and evidence boundary

- Read the decision emails and application status in the signed-in browser.
- Correlated production's LinkedIn Page client with the rejected app and
  reproduced the missing-scope callback after fresh sign-in.
- Inspected the existing TikTok composer, validators, adapter, media signer,
  LinkedIn adapters and deployment configuration.
- Baseline Go tests passed for `internal/postoptions`, TikTok, LinkedIn and
  LinkedIn Page adapters. These tests do not prove provider approval or delivery.
- Prepared a narrow callback correction and its regression tests so a known
  LinkedIn scope refusal gives an app-approval explanation without reflecting
  untrusted provider error text. Verification and review are recorded below.
- Implemented the private media gateway, TikTok hosted-video pull flow and
  deployment routing by extending the existing media and provider owners.
- Verified the approved LinkedIn app reaches Page selection and Solomon AI
  appears connected in the live Shots profile.
- Matched the current TikTok runtime key to the separate local-development
  app's sandbox, then created Shots Review under the reviewed app with explicit
  approval. No live TikTok credentials were changed.

The LinkedIn callback and Infisical Page credential pair have been changed as
authorized, the configuration-only rollout is active, and the Solomon AI Page is
connected. No deployed image,
review submission or real-provider publication has been changed by this work.
The media delivery rollout and both provider review outcomes remain open.

Verification so far:

- `npm run quality:check` passed: format, lint, workspace types, 1,792 web tests,
  26 editor tests and 45 server-module tests. The collab Redis-replica test was
  skipped because `COLLAB_TEST_REDIS_URL` was unset.
- `make -C server check` passed, including generation, format, unit tests,
  repository race checks, vet and generated/dependency drift checks. Database
  integration tests requiring `PUBLISHING_TEST_DATABASE_URL` or
  `SOCIAL_TEST_DATABASE_URL`, and external storage tests requiring
  `PUBLISHING_TEST_LOCAL_OBJECT_STORE`, were unavailable in this shell.
- Focused media, public-server, TikTok, publisher and telemetry tests passed.
  The new media package also passed `go test -race ./internal/media`.
- All 28 DigitalOcean deployment-script tests passed, including origin
  validation, repeat configuration and preservation of MCP routing.
- `./dev/social-gate` passed all eight production-image full-stack cases in
  7.6 minutes, including TikTok Send to App, video rendering and scheduling,
  single-delivery behavior, and thread deletion. Its isolated stack and volumes
  were cleaned up. These cases use fake providers, not live social delivery.
- Independent structure, performance, chaos, QA, lean and Go reviewers examined
  the complete task diff and untracked files. All reported no findings. The Go
  specialist was included because the media and provider changes are primarily
  Go. Lean verdict: **Lean already**. Code verdict: **Ship for PR review**;
  live ingress/R2/provider acceptance and manual review footage remain open.
- `git diff --check` passed. No Gauntlet is configured for this repository.
