# Exact remaining setup and acceptance

Use the existing repository, task branch and PR #2. Keep the current site
and original data/backup intact. Passing local or hosted tests does not establish
real provider sign-in, public gameplay or a completed production cutover.

## Clerk: authentication, credentials and placement are separate

1. **Confirmed setup:** the parent verified that the approved free **LLM Arcade
   Development** app was created on 2026-11-09. Email is required and verified;
   one-time email codes handle signup/sign-in. Password signup and adding
   passwords are off, as are email links and Google. No keys were accessed or
   placed. This records the parent's dashboard evidence, not a live sign-in test.
   Jeff completes his own email verification during acceptance. Stop at any new
   consent, persistent grant or terms that lacks its applicable approval.
2. **Existing app only:** use that Development instance; do not create a duplicate,
   rotate keys, enable paid features or add social OAuth. If its secret key has
   no securely stored copy, creating a new key needs separate credential-creation
   approval. App creation approval did not approve hosted key placement.
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
   Use the same Development instance's `pk_test` and `sk_test` values. The issuer
   is its exact Frontend API HTTPS URL, not `api.clerk.com`. The frontend receives
   only `VITE_CLERK_PUBLISHABLE_KEY`, scoped to the existing Vercel project's
   Preview environment and `task/20261108-cloudflare-recovery` branch. The secret
   key never belongs in Vite variables or browser code. No provider user/admin
   is precreated. The exact canonical HTTPS frontend preview origin is not yet
   known; obtain it from the accepted deployment before requesting approval to
   set `APP_ORIGIN`/authorized-party trust. Do not substitute the Worker origin,
   production domain, a guessed preview URL or a wildcard.

The owner can copy values directly from the selected Clerk app into the approved
project secret interfaces; CLI login is not required. Preview identities stay in
the isolated preview database: Clerk users do not transfer between instances,
and the server refuses automatic email-only relinking to a new production subject.
Review the production data/identity transition before switching to live keys.

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
trust change and hosted key placement need their applicable approval. The
production domain stays unchanged until acceptance and review.

## Environment-specific Vercel release config

After PR #2, the routing follow-up uses one automatic `vercel.mjs` with Vercel's
named `config` export. No new package is needed. The config uses
`VERCEL_TARGET_ENV` with `VERCEL_ENV` fallback; it never infers Production from
`NODE_ENV`, Vite's production mode or a production-domain variable on a preview.

| Build context | Same-origin API destination | Clerk publishable key |
| --- | --- | --- |
| Production | `https://llm-arcade-api.jeffkazzee.workers.dev/api/*` | Valid `pk_live`, never a development host |
| Preview / custom / Development | `https://llm-arcade-api-preview.jeffkazzee.workers.dev/api/*` | Valid development `pk_test`, or absent for guest play |

The config selects `node scripts/build-vercel.mjs production` or `preview`.
Conflicting context or a changed target between config evaluation and build
fails closed. Config discovery without target variables stays on the preview
side, but an actual managed build requires explicit target context; it cannot
silently publish that fallback. The build wrapper and Vite config validate the effective key,
including `.env.production` fallback; missing/test keys stop Production, live
keys stop non-production. Both managed targets force the Cloudflare flag even
if the project has a stale flag value. Ordinary local builds retain the opt-in.
The `/api` root and wildcard rewrites come before the existing SPA fallback;
frontend requests remain relative and use same-origin cookies.

Keep explicit preview compatibility: `vercel.cloudflare-preview.json` uses the
same guarded preview build and only the preview Worker. For CLI
`--local-config vercel.cloudflare-preview.json`, require Vercel CLI 65.1.0+,
which fixes explicit overrides alongside programmatic config. If a file snapshot
instead renames that file to `vercel.json`, omit `vercel.mjs` from the snapshot.
Only one automatic config may be submitted. Normal Git builds use `vercel.mjs`.

Source verification: `pnpm test:vercel` (also in `pnpm run ci`) checks real config
selection, key failures, dotenv precedence and both actual app builds with
synthetic keys in temporary output directories. It makes no provider requests
and does not verify a key belongs to the intended Clerk instance.

Before release, the coordinator must verify the production Git branch/target,
the separately approved production-only D1/Worker and real production Clerk
instance, exact Worker origin/authorized parties, and protected hosted checks.
Build fresh with the Production target; do not promote a preview artifact,
whose key and rewrites remain baked in. Then verify API content/status, cookies,
guest play/reload, account sign-in/linking, persisted scores/leaderboards and SPA
deep links on the actual deployment. Never print secret values for evidence.
This source follow-up grants no provider, credential or data mutation authority.

Rollback is a fresh reviewed build of the prior configuration/source, preserving
D1/player data and old resources; do not route a preview to production as a
shortcut. Provider promotion and rollback remain the coordinator's operations.

References: [Vercel programmatic config](https://vercel.com/docs/project-configuration/vercel-ts),
[system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables),
[CLI release notes](https://vercel.com/docs/cli/release-notes),
[Vite environment precedence](https://vite.dev/guide/env-and-mode).

## Checks available without the blockers

- Root lint, TypeScript, default and Cloudflare frontend builds, game-engine
  harnesses, redirect and auth-transition tests, plus hosted CI on this branch.
- Real local workerd/D1 tests using synthetic Clerk identities: guest creation,
  account linking and identity changes, profile/privacy, score ownership/retries,
  boards, XP/streaks, social actions, uploads and concurrent admin decisions.
- Full migration preparation against an empty local D1, artifact hashes,
  authorization review, public-data scan and Cloudflare build dry run.
- Prepare/test the additive storage-byte upgrade against a local copy of the old
  schema: retained completed/partial data, atomic rollback and replay-safe counters.
  This does not authorize applying it remotely.
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
- Jeff has authorized merging this PR once ready. Complete the required review
  and acceptance before using that approval; do not request it again or bypass
  gates. Production promotion/configuration and complete live verification are
  separate steps with their applicable approvals. Preserve old resources and
  recovery artifacts throughout.

Before a later authorized deployment, back up and inspect the reviewed Arcade
database, then apply/verify `storage-byte-budget-2026-11-09` as one atomic batch.
Use the README upgrade procedure; never rerun initial schemas on the initialized
preview. Upgrade the database before the matching Worker, then the frontend.
The correction only prepares/tests this migration; no remote data was changed.

The hosted security review exhausted its paying account's Codex allowance. Do not
enable hosted paid-credit settings or touch the usage reset. The separately
authorized independent review may use the owner's existing agent allowance; it
must satisfy the existing review policy rather than waive it.
The local security-diff skill's required configuration-preflight resource and
scan helpers are unavailable here, so that workflow cannot be claimed complete.
