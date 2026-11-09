# Arcade recovery status — 2026-11-09 UTC

Implementation runs in the selected Codex Cloud Linux workspace, Node 24.19.0,
pnpm 11.25.0. Work began on isolated task/151-agents-git-law at eea739db8a8075cfcea8c1ac1bdf12db4bb341ec.
The recovery patch is isolated on task/20261108-cloudflare-recovery from
dev a63c3b03b6c75530ab5c563d32f4c8f84f1e7280 so the existing Git-law branch is preserved.
No merge or production cutover is authorized by a successful local check.

## Implementation and verification

Worker/D1 and frontend paths now cover catalog, optional Clerk accounts,
email-free guest cards, profiles/settings, persistent scores and shared boards,
achievements/XP/streaks/badges, activity, follows, comments/replies, ratings,
favorites, waitlist/playtest forms, uploads/versioning/review and admin commands.
Temporary feature placeholders were removed. Existing game files are unchanged.

Twenty-five integration tests now pass, including concurrent account linking,
row ownership, private signup access, authorization revocation, manifest validation,
XP caps, immutable uploads and the complete migration with SQL semicolons. Root
lint/typecheck/build, eight game harnesses, redirect checks and seven account-transition
tests pass. Commit fa0728d passed hosted CI run 42607096774. Follow-up
checks and the next hosted run must be associated with their exact new commit;
real browser/provider testing remains outstanding.

The follow-up fixes stale verified primary email, daily-upload reservation races,
conflicting playtest/submission reviews, coming-soon social actions, stale private
query data after account changes and queued scores/unlocks moving to another
player or a later run. Immutable mutation variables retain the original player,
game, run, stats and achievement. Player-intent fields only reject mismatches; server identity still owns
all writes. Guest-to-account links retain the same player UUID.

The 2026-11-09 code review found that a 200-row query cap hid later favorites,
ratings and comments. Complete server aggregates now supply counts/averages and
the current player's state. Comment requests page with stable timestamp/ID
ordering, preserving complete threads and newly posted comments. A later-page
failure or cancellation cannot become a successful partial result. Real local
D1 tests cover 451 social rows and 425 comments, page boundaries, replies, new
posts, ownership and error/cancellation handling; both failed on the old Worker.

The independent security review also reproduced empty upload declarations filling
the shared 400 MiB reservation counter. The correction charges only stored chunk
bytes, atomically in the database, with duplicate-aware checks. Three regressions
cover the exact 80 empty 5 MiB declarations across seven accounts, concurrent
capacity/retry behavior and additive upgrade preservation/rollback. No file or
partial payload is deleted. The existing preview needs the prepared
`storage-byte-budget-2026-11-09` database upgrade before the matching Worker;
no remote upgrade or deployment was attempted. See the README's upgrade steps.

The pinned official Clerk signature verifier is retained with explicit session
token guards. Nineteen signed-token parity cases compare it with the previous
SDK request verifier; bounded provider reads check the current verified primary
email. This removes full management-client construction from the request path;
it does not cache verification or relax signature/issuer/authorized-party checks.
Synthetic CPU samples still include cold/warm requests over 10 ms. Workers Free
CPU acceptance is unresolved, even though the bundle is smaller. Real cold/warm
measurements, including the actual public-key/JWKS configuration, are required.

## Preview deployment completed; live HTTP test blocked

Only the Arcade preview database was initialized:
- D1: llm-arcade-preview, e02f72f5-b87a-4c72-9a87-4611e1df58a4.
- 15 reconstructed games, 14 playable; Lastwatch retains its source playtest gate.
- 110 reconstructed achievement definitions; zero initial players or scores.
- Foreign-key check returned no violations.
- Migration source SHA-256: 89d6a12ca0b22614b6db576f96e1e9c94485656e98c00f1d0b241679101beee9.

Worker llm-arcade-api-preview was uploaded at 17:42:31 UTC and workers.dev enabled:
https://llm-arcade-api-preview.jeffkazzee.workers.dev
Version ID: 75febdd3-e7be-48a1-b7ed-f4c33645cbed.
Deployment ID: d57b9a46-cbfa-4086-b7f7-0bb579753110.
Bundle SHA-256: 0bf076545a0c6ff5af249d88f6595d71656719c820c229693f9215aca259fb4a.
API readback confirms only this D1 and the exact Worker-origin APP_ORIGIN are bound;
there are no Clerk keys, owner email, R2 binding or other project credentials.
Read-only metadata on 2026-11-09 confirms the same version at 100% and only
APP_ORIGIN/ARCADE_DB binding names/types; no secret values were requested/output.
This deployment contains baseline 349a9f7, not the follow-up changes. Once access,
configuration and validation permit deployment, update the Worker before the
matching frontend: the new achievement request adds a player-intent argument that
the baseline Worker does not accept. No follow-up deployment was attempted.

Live GET /api/health could not reach the Worker from this environment:
Node direct DNS returned EAI_AGAIN; the configured curl proxy then denied CONNECT
with HTTP 403 (curl exit 56, HTTP 000). No application response or live test
succeeded. Do not try alternate routes or repeat it without relevant access
repair. Smallest setup action: allow this exact Worker hostname in the selected
Codex Cloud environment's network access, then retry the denied check once.

The first migration attempt returned API 400 because deployment preparation
split a source description at a semicolon. A read confirmed the database was
still empty. Preparation now shares the tested statement loader; the complete
migration test passed and the corrected 177-statement API batch succeeded.
No original data or resource was involved.

## Clerk setup: secure callback blocker

The owner approved one free development app and separately approved CLI browser
sign-in. clerk@4.1.0 init --framework react --accountless rejected plain React
before creating an app. The normal approved auth login then required
http://127.0.0.1:33979/callback inside Codex Cloud; browser launch failed and
there is no secure browser/terminal handoff here. The pending process was
stopped. No saved CLI session, Clerk app, generated keys or actual player exists.
Do not reuse the cancelled URL or paste callback codes/passwords/keys in chat.

The owner can create the approved free development app in their existing Clerk
dashboard with email-only signup/sign-in (no social OAuth), then place keys in
this project's ignored local files through a secure project/environment secret
interface. A secure cloud terminal/browser handoff is the other supported path.
Development approval covers ignored local storage only. Worker secret placement,
production Clerk keys and owned-domain DNS need their applicable approvals.
The actual owner must personally verify email; nobody was pre-signed-up/admin.

## Remaining acceptance and tradeoffs

- Clerk setup and real signup/login/recovery/owner verification.
- Exact Vercel preview-origin trust configuration and API proxy. A separate
  vercel.cloudflare-preview.json is prepared; the default production config is
  unchanged. Do not retry the previously denied Vercel preview without repair.
- Hosted CI for the follow-up commit, browser gameplay, sandbox/blob upload loading, live score/board
  persistence and cold/warm deployed CPU measurements.
- Review reconstructed metadata: seven games lack complete historical
  achievement labels/hints/XP; six badge identities are documented and two
  replacement rules are new configuration. No historical data was recovered.
- Free storage keeps 5 MB HTML/2 MB art limits, but uses up to 40/16 public chunk
  requests and 400 MiB shared payload capacity, 12 files/account/day and three
  pending submissions. Files are public including pending ones. A monolithic
  5 MB response sampled 363/109 ms and was rejected; bounded reads sampled
  0–6.7 ms and authenticated upload 8.9 ms locally, not deployed accounting.
- Jeff has authorized merging PR #2 once ready; required review and acceptance
  remain incomplete. Do not ask for the same merge approval again or treat it as
  permission to skip those gates. Production promotion remains a separate step.

The hosted security review failed because its paying account reached Codex usage
limits. Do not enable paid credits or retry unchanged. The local security-diff
workflow is also incomplete: its required configuration-preflight reference and
terminal scan helpers are unavailable in this executor. The hosted ordinary code
review completed with the pagination finding addressed above; that correction
does not establish a completed independent security review.

Deployment is explicitly authorized after acceptance; that does not authorize new
credentials, hosted key placement or persistent access/security changes. See
[SETUP_AND_ACCEPTANCE.md](SETUP_AND_ACCEPTANCE.md) for exact owner actions,
permission repairs and tests that can run independently. If actual verified-account
CPU exceeds Workers Free, a possible middle ground is Clerk verification in the
existing Vercel Hobby Node API with D1 remaining behind the Worker. That would
preserve accounts, guest cards, admin checks and scorekeeping, but needs review
and approval for its service trust/credentials. It is not implemented or selected.

The owner confirmed Workers Free/no paid subscription. Billing read remains
403; no permission expansion or paid resource was requested. Original private
repo, backup, current site, Patent Cabinet and unrelated resources are unchanged.
