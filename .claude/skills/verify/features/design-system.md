# The Direction K design system

The target rows describe `llmarcade-DESIGN.md` (Direction K, "Riso teletext"). They report on
every run and do not gate until a key PR moves them to invariant.

| Row | How the check works |
|---|---|
| D1 | Reads each token the row names from `getComputedStyle(document.documentElement)` on `/` and compares its resolved colour with the key's hex |
| D2 | On every load of the Pages routes and the cabinets in the run, as A8 counts loads, fails any request to `fonts.googleapis.com` or `fonts.gstatic.com`, and any font response that is not a `.woff2` from the site's own origin. A request made by the document `/games/typestorm.html` is outside the row, as the key says |
| D3 | Fails visible text, or `::before` and `::after` string content, whose first computed `font-family` is VT323 at a computed size below 20px. With no VT323 text the row passes, as its words say |
| D4 | On every element and its `::before` and `::after`: a `box-shadow` or `text-shadow` with a blur radius above 0, a `filter` or `backdrop-filter` with `blur()` or `drop-shadow()`, any `linear-gradient`, a `radial-gradient` that is not dots (a tile of 32px or less), and a conic gradient that is not a `repeating-conic-gradient` on a circle (the coin rim) |
| D5 | Every element and pseudo-element computes all four corner radii to `0px`, except a circle: a square box (width and height within 1px) whose every corner draws a horizontal radius of at least half its width and a vertical radius of at least half its height. The drawn radii are the used ones. The check scales all eight radii by the CSS overlap factor (css-backgrounds-3, 4.5) before it compares, so `50% / 10%` and `100% / 50%` both fail while `50%` and `9999px` pass. D4's coin-rim exception uses the same test |
| D6 | For each visible text node, the fill behind the centre of its text box: walking up from its element, each element's `::after`, then `::before` (when absolutely positioned over that point), then its own background, until one is opaque, with translucent layers composited. When that fill is `--pink` or `--yellow`, the text colour must be `--ink`. The mockup's highlight behind "machines." is a `::before` and `::after` pair, so it counts. With no text on a fill the row passes, as its words say |
| D8 | `/` and `/games` at 360 and 390 px wide: `scrollWidth` must not exceed `clientWidth` |
| D12 | Reads `AI_RULES.md` and `CLAUDE.md`. A line naming cream, terracotta or terra fails unless it also says the palette is retired, replaced, old, or not to be used. A line banning pixel fonts fails. Each file must mention `DESIGN.md` |
| H3 | Full-page screenshots of `/` at 1440 and 390, beside the mockup `prototype-k/arcade-home.html` |

Token values come from D1's own words in the key, so a key PR that changes a value changes the
check.

## Literal rows

D3 and D6 follow the key's words. Neither requires VT323 or a pink or yellow fill to exist, so
on today's site both pass with nothing to judge. A key PR could add a presence requirement
separately. D12's palette test reads words, not intent. A rules line that mentions terracotta
for another reason fails until it says the palette is retired.
