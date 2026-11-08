# Arcade recovery status — 2026-11-08 UTC

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

Eleven integration tests passed, including concurrent account linking, row
ownership, private signup access, authorization revocation, manifest validation,
XP caps, immutable uploads and the complete migration with SQL semicolons. Root lint/typecheck/build, game harnesses,
redirect tests, Cloudflare-flag build and cf deploy dry-run passed locally.
Hosted CI and real browser/provider testing remain outstanding.

## Preview deployment completed; live HTTP test blocked

Only the Arcade preview database was initialized:
- D1: llm-arcade-preview, e02f72f5-b87a-4c72-9a87-4611e1df58a4.
- 15 reconstructed games, 14 playable; Lastwatch retains its source playtest gate.
- 110 reconstructed achievement definitions; zero initial players or scores.
- Foreign-key check returned no violations.
- Migration source SHA-256: 89d6a12ca0b22614b6db576f96e1e9c94485656e98c00f1d0b241679101beee9.

Worker llm-arcade-api-preview was uploaded at 17:42:31 UTC and workers.dev enabled:
https://llm-arcade-api-preview.jeffkazzee.workers.dev
Deployment ID: 75febdd3e7be48a1b7edf4c33645cbed.
Bundle SHA-256: 0bf076545a0c6ff5af249d88f6595d71656719c820c229693f9215aca259fb4a.
API readback confirms only this D1 and the exact Worker-origin APP_ORIGIN are bound;
there are no Clerk keys, owner email, R2 binding or other project credentials.

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
- Hosted CI, browser gameplay, sandbox/blob upload loading, live score/board
  persistence and cold/warm deployed CPU measurements.
- Review reconstructed metadata: seven games lack complete historical
  achievement labels/hints/XP; six badge identities are documented and two
  replacement rules are new configuration. No historical data was recovered.
- Free storage keeps 5 MB HTML/2 MB art limits, but uses up to 40/16 public chunk
  requests and 400 MiB shared payload capacity, 12 files/account/day and three
  pending submissions. Files are public including pending ones. A monolithic
  5 MB response sampled 363/109 ms and was rejected; bounded reads sampled
  0–6.7 ms and authenticated upload 8.9 ms locally, not deployed accounting.
- Normal review and Jeff's merge approval before any production cutover.

The owner confirmed Workers Free/no paid subscription. Billing read remains
403; no permission expansion or paid resource was requested. Original private
repo, backup, current site, Patent Cabinet and unrelated resources are unchanged.
