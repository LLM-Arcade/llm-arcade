# Arcade recovery implementation

This branch contains a Cloudflare D1/Worker migration with an isolated API preview.
See [CURRENT_STATUS.md](CURRENT_STATUS.md) for exact deployment/setup state and
[RECOVERY.md](RECOVERY.md) for data recovery evidence. The old private repository,
production site, Patent Cabinet and unrelated resources remain unchanged.

## Chosen behavior

Guest cards require no email: a username and secure 30-day browser cookie own
persistent scores. Clearing cookies, switching browsers/devices or expiration
can lose access; a username alone cannot recover a card. New optional Clerk
accounts can retain the guest UUID and all linked records. An existing account
keeps its own history rather than silently merging another card.

Clerk Free email sign-in is selected. React uses the official SDK; the Worker
verifies signed session tokens, exact issuer and authorized party. Account
linking checks the verified primary email through Clerk's backend API. Only
server configuration plus verified owner identity can create the sole initial
admin. Real players, provider passwords and actual admin accounts were not
created. No Google OAuth flow or credentials remain in this implementation.

Public responses show usernames, never private email, provider subjects or
private player names. The legacy backend remains the default build; enable the
migration only with `VITE_ARCADE_BACKEND=cloudflare` after preview acceptance.
Clerk also needs `VITE_CLERK_PUBLISHABLE_KEY` and Worker-only approved keys.

## Current code

- Catalog, profiles, personal bests, all-time/daily/weekly leaderboards and
  persistent per-player score submission with server identity, score caps,
  bounded stats, atomic rate checks and idempotent run IDs.
- Comments/replies, ratings, favorites, follows, public profiles and editing;
  waitlist/playtest forms with admin-only reading of submitted personal data.
- D1 transaction triggers for XP, daily caps, UTC streaks, badges, level curve,
  manifest-validated idempotent achievements and public activity. The documented
  First Flight/first score example is tested at 220 XP, level 3, streak 1.
- Administrative role, publication, spotlight, playtest review and score reset
  commands recheck server-side authorization. No direct progression/role writes
  are accepted from clients. Upload/version review is tested transactionally.
- A candidate immutable, chunked D1 file store preserves the original 5 MB HTML
  and 2 MB art limits without activating R2 or paid storage. Public HTML is
  sandboxed, with browser-side assembly of bounded public chunks. Some local
  chunk operations sampled below 10 ms, but account-verification samples include
  cold/warm requests above that budget. Real browser/deployed CPU acceptance
  remains required. Capacity is 400 MiB; uploads use a verified account.

Original game files and engine code have not changed. The reconstructed catalog
contains 15 shipped games, with 14 source-selected playable entries and one
source playtest gate. All reconstructed content is marked as such; source does not
recover original IDs, accounts, scores, uploads or production settings.

Some metadata is absent from source. SQL achievement definitions are retained
where available; fallback names/hints/XP for seven games and two replacement
badge rules are explicitly new configuration. Review these before launch.
The owner requires all existing features before launch; all temporary recovery
placeholders are removed; acceptance is still pending.

## Local verification

Node 24, pnpm 11.25, separate root/backend dependency installations:

```sh
pnpm run ci
cd cloudflare-backend
pnpm check
node scripts/reconstruct-catalog.mjs
node scripts/reconstruct-achievements.mjs
ARCADE_D1_ID="$ARCADE_PREVIEW_D1_ID" ARCADE_APP_ORIGIN="$ARCADE_PREVIEW_ORIGIN" cf deploy --mode preview --dry-run --provision=false
```

Backend tests use real local workerd/D1 with synthetic Clerk tokens and an
isolated mock provider API. They cover signature/issuer/authorized-party/expiry,
unverified email, guest-to-account ID retention and credential revocation,
sole initial admin, score separation/retry/rate/cap checks, ownership, injection
rejection, private signup access, XP/streak/award math and admin revocation. Twenty
tests include verified-email changes, concurrent upload reservations/reviews,
coming-soon social actions, queued player intents, actual frontend file assembly
and parity against the prior Clerk SDK request verifier. Seven frontend tests cover
account/cache transitions. The official token verifier remains in use; provider
responses have a fixed endpoint, pinned API version, no redirects and a body cap.
Two further regression tests cover complete social totals and comment pagination
after 200 rows, including actual adapter/loader transport, tied timestamps,
replies, new posts, cancellation and later-page errors. The local suite now has
22 tests. The storage-budget correction adds three more cases for metadata-only
exhaustion, concurrent byte charging/retries and non-destructive legacy upgrade.
These are synthetic provider/runtime tests. Hosted CI passed fa0728d;
real Clerk email delivery, browser gameplay and the live site remain unverified.

The local workerd compatibility date is 2026-07-30; proposed deployment uses
2026-11-08. CPU sampling is diagnostic and does not establish deployed CPU
billing/accounting or guarantee Workers Free's 10 ms request budget.

## Resource/setup state

The owner confirmed Workers Free with no paid Workers subscription. The isolated
`llm-arcade-preview` database is initialized with reconstructed content and no
players/scores. The new API Worker was uploaded and workers.dev enabled. The
cloud network proxy denied its HTTP health check with CONNECT 403. Live API
behavior is therefore unverified; no frontend deployment/cutover was applied.

Clerk development app creation and browser CLI login were approved separately.
The accountless CLI does not support plain React. The normal login then failed
browser launch and required a callback to localhost inside this cloud task;
no secure handoff exists here. The pending process was stopped without saving
a session or creating an app/key. Use a secure owner/browser setup and project
secret interface; do not send passwords, callback codes or keys through chat.
Clerk production keys/DNS still need their action-time approvals.
See [SETUP_AND_ACCEPTANCE.md](SETUP_AND_ACCEPTANCE.md) for the exact authentication,
credential-placement and access-repair steps. The deployed Worker is still the
baseline build; future deployment must update it before the follow-up frontend.

Initial schemas/artifacts target a NEW EMPTY Arcade database only. No automatic
migration runs. The existing preview instead needs the separately prepared
`storage-byte-budget-2026-11-09` upgrade described below. Preserve UUIDs/links and
review trigger behavior before importing any
recovered export. Never copy private backup bundles or original PR refs into
this repository. D1 binding IDs must be explicit: a missing ID may otherwise
cause `cf deploy` to provision resources unexpectedly.

Both the Worker HTTP egress denial and earlier Vercel preview 403 remain
unresolved and were not retried. The dedicated vercel.cloudflare-preview.json
keeps the default production config unchanged. Relevant
access repair, complete feature parity, hosted CI, browser acceptance and normal
merge approval remain necessary before production cutover. Do not modify DNS
or assume a change from the existing `www.llmarcade.fun` domain.

## Existing database storage upgrade

The previous Worker charged the shared 400 MiB quota at metadata creation. Empty
5 MiB declarations could exhaust it without storing payload. The new Worker uses
`storage_budget.stored_bytes`, maintained atomically by chunk INSERT/DELETE
triggers. Metadata does not charge bytes; the 12-files/account/day and three
pending-submission limits remain. No expiry, deletion endpoint or automatic
cleanup is introduced. Completed and recoverable partial files stay intact.

Prepare the additive upgrade without calling a service:

```sh
node scripts/prepare-storage-upgrade-artifact.mjs
```

Before an authorized deployment, preserve an Arcade-only backup and inspect its
migration ledger and `PRAGMA table_info(storage_budget)`. Apply the entire prepared
batch once to that reviewed database, then verify its version/hash, triggers,
foreign keys and that `stored_bytes` equals `SUM(length(data))` across **all**
chunks. The batch adds/backfills the counter and records its migration atomically;
it retains legacy `reserved_bytes`, file IDs, paths and every chunk. Do not run
initial schemas on the initialized database. If the column/version already exists
or a result is uncertain, read back state before considering any retry.

Apply the database upgrade before the matching Worker, then its frontend. The old
Worker may still reject metadata using its legacy reservation counter during this
staged transition; the new counter is kept accurate for inserts from both versions.
No upgrade or deployment was executed by this correction.

Metadata creation checks current free payload capacity but does not promise a
reservation. If another upload consumes the remaining capacity, a chunk returns
507; previously saved chunks and the immutable path remain available to resume.
Identical chunks never charge twice, even at a full cap; conflicting retries still
return 409. The payload cap leaves intended headroom but does not prove physical
database size, daily free allowances or deployed CPU acceptance.
