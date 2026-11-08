# Exact remaining setup and acceptance

Use the existing repository, task branch and draft PR #2. Keep the current site
and original data/backup intact. Passing local or hosted tests does not establish
real provider sign-in, public gameplay or a completed production cutover.

## Clerk: authentication, credentials and placement are separate

1. **Owner authentication:** Jeff signs into his existing Clerk account in the
   parent's existing cloud browser, completing his own password/MFA or chosen
   existing sign-in method. The browser has only reached a signed-out page.
   No identifier or sign-in method was selected by this task. Stop at any new
   consent, persistent grant or terms that lacks its applicable approval.
2. **App/credential creation:** inspect existing applications first. Reuse an
   existing Arcade-specific app if one exists; otherwise the earlier approval
   covered one free development app named LLM Arcade and development keys stored
   only in this project's ignored local files. That app was not created by this
   task. Do not create another app, rotate keys, enable paid features or add
   social OAuth. The current resumed work performs no credential creation.
3. **Secure handoff:** the CLI process is stopped. Its former localhost callback
   URL and OAuth request cannot be reused. This executor has no browser handoff,
   environment-edit or secure port-forward tool. A login in another browser does
   not sign this CLI in, because its loopback callback belongs to this VM.
   Either provide a supported, authorized browser/terminal callback into this
   executor for a fresh flow, or use the platform's project/environment secret
   interface with scope restricted to Arcade. Never put keys, callback URLs with
   authorization codes, passwords or login cookies in chat, a PR or Git.
4. **Preview secret placement approval:** local development approval did not
   approve copying secrets into hosted services. Before doing so, approve the
   exact existing development app's key placement into the named preview Worker
   and frontend preview environment. The Worker needs `CLERK_SECRET_KEY`,
   `CLERK_PUBLISHABLE_KEY`, `CLERK_ISSUER` and the private
   `INITIAL_ADMIN_EMAIL`; `CLERK_JWT_KEY` is an optional public verification key.
   The frontend receives only `VITE_CLERK_PUBLISHABLE_KEY`. The secret key never
   belongs in Vite variables or browser code. No provider user/admin is precreated.

Codex Cloud's current environment configuration supports direct environment
variables and proxy-substituted HTTP secrets. The SDK needs readable configuration;
do not assume an HTTP-secret placeholder can be written to an env file or used as
the raw key. Environment-owned values can reach other tasks using that environment,
so confirm the Arcade-only scope before any persistent configuration change.
See [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments).

Clerk production uses separate live keys and owned-domain setup. Once preview
acceptance succeeds, obtain action-time approval for that production instance/key
creation, exact hosting secret destinations and the actual DNS records displayed
by Clerk. Do not guess records, change the site's domain, select a paid plan or
reuse development keys as a production shortcut. Email-only sign-in does not
require Google OAuth credentials. See
[Clerk production setup](https://clerk.com/docs/guides/development/deployment/production).

## Worker HTTP access: an environment network repair

The exact denied action is GET
`https://llm-arcade-api-preview.jeffkazzee.workers.dev/api/health`.
The selected VM's configured proxy returned CONNECT 403, HTTP 000, curl exit 56.
That is not evidence of an application HTTP 403, an unhealthy Worker or a Clerk
failure. No public API request has been verified by this task.

The smallest requested network change is allowing that exact hostname for this
Arcade executor, subject to workspace policy. Do not enable unrestricted internet,
use a proxy escape, change DNS, route through GitHub Actions/another service, or
use a different deployment to get around the denial. The owner/platform must make
the authorized policy change. Published environment changes may apply only to new
tasks; verify the current executor received the repair or coordinate a single
writer handoff on this same branch. Do not start a duplicate writer or claim an
environment edit automatically repaired this running session. After materially
relevant repair, retry the denied request once and stop again if denied.

## Vercel: existing connection/project permission repair

The denied operation was `POST /v13/deployments`, preview target, under the
installed Vercel connection for user `jeffkazzee`, existing team/project
`llm-arcade`. Error: permission to create a Preview Deployment denied, HTTP 403.
The last recorded request ID is
`iad1:sfo1:iad1:sfo1::vwxmd-1793842411068-6fbda5260673`.
It was already retried once after the Vercel GitHub app installation became
visible. Do not repeat the app installation or deployment request unchanged.

The owner should inspect the existing Vercel app connection's access to this
existing team/project and deployment-write permission. If a missing team grant
is identified, the supported team-specific consent flow can authorize the
connection's existing permissions with the required action-time approval. No new
pasted token, paid member, replacement project, broader repo access or protection
bypass is needed. If the exact grant is already valid, no automatic fix is known:
use the recorded request ID for provider support rather than assuming reconnect
will solve it. Do not switch the production Git connection during this access step.

After access repair, use the existing PR branch and dedicated
`vercel.cloudflare-preview.json`. Set the Worker's exact `APP_ORIGIN` and Clerk
authorized party to the actual accepted frontend preview origin; that origin
trust change and hosted key placement need their applicable approval. The default
`vercel.json` and production domain stay unchanged until acceptance and review.

## Checks available without the blockers

- Root lint, TypeScript, default and Cloudflare frontend builds, game-engine
  harnesses, redirect and auth-transition tests, plus hosted CI on this branch.
- Real local workerd/D1 tests using synthetic Clerk identities: guest creation,
  account linking and identity changes, profile/privacy, score ownership/retries,
  boards, XP/streaks, social actions, uploads and concurrent admin decisions.
- Full migration preparation against an empty local D1, artifact hashes,
  authorization review, public-data scan and Cloudflare build dry run.
- Read-only provider metadata to identify the deployed Worker, preview D1 binding
  and branch/ref/check state. Metadata readback does not prove public HTTP behavior.

## Acceptance still requiring access or the owner

- Real email signup, delivery, verification, sign-in, return across devices and
  recovery using the selected Clerk app. Jeff verifies his own primary email;
  the Worker grants the sole initial owner role only after provider verification.
- Public frontend/browser gameplay, account changes without stale private cache,
  persistent scores, reload/login readback, shared boards and guest recovery limits.
- Actual sandbox/blob file loading and browser isolation; Node header/script tests
  cannot prove sandbox inheritance. Measure cold/warm deployed CPU, including
  verified-account chunk uploads, without weakening password or token security.
- Review the source-reconstructed achievement metadata and badge rules, public
  pending uploads and free storage/request limits already listed in the PR. No
  missing working feature may be silently removed to get a deployment through.
- Normal review and Jeff's required merge approval, then authorized production
  configuration, deployment and complete live verification. Preserve old resources
  and recovery artifacts throughout.
