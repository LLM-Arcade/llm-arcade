# The game floor and the cabinets

`/games` lists every cabinet. Each card opens `/game/<slug>`, where a visitor presses PLAY.

| Row | How the check works |
|---|---|
| A5 | Reads every "N PLAYABLE" label from the rendered text of `/games` and counts the distinct paths matching `/game/<slug>` among the page's same-origin links. Every label must equal the count, there must be at least one label, and the count must be at least 1 |
| A6 | Opens each of those paths. A page with any Missing pages `h1` in its DOM, shown or hidden, fails as a missing page. Otherwise its first `h1` must be visible and non-empty, and the rendered text of some link to it on `/games` must contain that `h1` |
| D7 | Reads every rendered game-count element on `/`, the elements the mockup marks `data-count`. Each one's rendered text, with whitespace collapsed, must equal the A5 count. With no rendered game count the row fails |
| D10 | On each cabinet, finds the first rendered `header` and reads the three-digit numbers in visible text and `::before` or `::after` content, outside that header and outside links, whose box ends above the header's top. There must be exactly one distinct number. It must be between 301 and 389 and unique across cabinets, and `/game/brickstorm` must show 303 |
| H1 | Lists every cabinet route with its screenshot (the idle poster, before PLAY). On the build side it adds every `/dev/<slug>` route from the dev server's `/dev` index with a screenshot taken 6 seconds after load, and names the cabinets the branch changes |

The cabinet pages are the paths A5 finds. A7, A8, A10's harnesses and D2 use the same list.

D7 depends on the `data-count` attribute of the approved mockup. A redesign that renders the
count without it fails D7 until this map and the check change together.

## For a cabinet PR

A10 runs `pnpm run ci`, and `ci.log` names every harness in the `test:games` chain (Lastwatch's
is `scripts/harness/lastwatch.mjs`). H1's `changed on this branch` line names the cabinet. Jeff
plays it on `/dev/<slug>` in a dev build, then on `/game/<slug>` once the row is published.
A cabinet whose `games` row is not published has no `/game/<slug>` card, so it appears only
under `/dev/<slug>`.
