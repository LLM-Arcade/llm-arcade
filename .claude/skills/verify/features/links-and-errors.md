# Links, errors and the Halloween removal

| Row | How the check works |
|---|---|
| A7 | Collects every `a[href]` with an http or https URL on the Pages routes, the cabinets and the two missing states, whose recovery links a visitor follows too. Each internal target (path and query) is opened in the tab. A target with any Missing pages `h1` in its DOM fails, whatever page linked to it, and also when that heading is hidden or transparent. Each external target gets one `HEAD` request from the host (a `GET` after 403 or 405). A 5xx fails. A 4xx, a timeout or a network failure is a WARN |
| A8 | Fails uncaught exceptions, `console.error` calls and error-level log entries (failed resource loads included) on every load of a Pages route or a cabinet in the whole run. That covers the first visits, A4's clicks, A7's opens, D8's widths, H2 and H3's reloads and D11's load of its cabinet. Each event is tagged with the page the tab showed. Events from D11's play phase are playing, not loading, and are left out. A log entry for a write the guard failed is GUARD's to report |
| A9 | Fails any request whose URL contains `/halloween/` on any load of a Pages route in the run, and any element with a `data-halloween` attribute on the Pages routes |

The missing pages log a `console.error` by design (`NotFound.tsx`). A8 covers only the Pages
routes and the cabinets, as the key says, so that error does not count.

A WARN from a sandbox whose network resets most external hosts is expected. Read the live side
for the true external status.
