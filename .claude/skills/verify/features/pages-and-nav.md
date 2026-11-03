# Pages, redirects, missing pages and the header nav

An anonymous visitor lands on the home page, moves through the header nav, and is sent to sign
up when they open a page that needs an account.

| Row | How the check works |
|---|---|
| A1 | Opens each route in the Pages table and reads the rendered text of the first `h1`. It must equal the table and be visible |
| A2 | Opens each route in the Redirects table and waits until the path stops changing. The final path must equal the table. A query string is ignored, so `/login` landing on `/signup?next=...` passes |
| A3 | Opens each example route in the Missing pages table. The `h1` must match and be visible, and a visible link with the row's text must point to the row's path on this site. The same path on another host fails |
| A4 | Finds every link in a `nav` inside a `header` on `/` whose origin is the site's own, and clicks each one with the mouse, from a fresh load of `/`. The landing route must be a Pages route showing its `h1`, or a cabinet showing a visible, non-empty `h1` of its own. A page with any Missing pages `h1` in its DOM, shown or hidden, is never a cabinet. A hidden link fails, because a visitor cannot click it |
| D9 | Reads every visible three-digit number in three zones on each Pages route: `header nav`, the index, and the button bar. Text nodes and the string content of `::before` and `::after` count. Each number must sit inside an `a[href]` whose target passes A7. With no number in the zones the row passes, as its words say |
| D11 | Presses PLAY on `/game/brickstorm` (or the first cabinet), clicks the centre of the running `iframe` or `canvas`, types three digits, and expects the path to stay the same. The digits are the first page-number link in the header nav of `/`, or 390 when there is none |
| H2 | Screenshots the email form on `/`. The skill never submits it |

## The D9 zones

- Header nav: every element matching `header nav`.
- Index: every `li` inside `main` whose list (`ul` or `ol`) holds at least one `a[href]`. In the
  Direction K mockup that is the game card grid.
- Button bar: every `nav` that is not inside a `header` or a `footer`. In the mockup that is
  `nav.buttonbar`.

The top strip is outside all three zones, as the key says. Section-head tags such as
`<span class="tag">390</span>` sit outside them too, because the mockup does not make them links.

A number is three digits with no digit, comma or period next to it, so `1,234 PLAYS` is not a
page number.

## Literal rows

D9 and D11 follow the key's words. Neither requires page numbers or a page-keys shortcut to
exist, so on today's site D9 passes with nothing to judge and D11 only proves the game keeps
its keys. A key PR could add a presence requirement separately.
