// Every browser row of the key on one side, as an anonymous visitor in one reused tab.
// Usage: node browser.mjs SIDE BASE_URL KEY_JSON CHROME EVIDENCE_DIR [DEV_URL]
//   SIDE build: BASE_URL is vite preview of the tree under test. DEV_URL is its vite dev server,
//   used only for the H1 screenshots of /dev/<slug>, which exist only in dev builds.
//   SIDE live: BASE_URL is https://www.llmarcade.fun.
// Writes the receipt browser-SIDE.json with the results and the rendered text per route for A11.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './cdp.mjs';
import { RECEIPT_SCHEMA } from './receipt.mjs';

const [side, base, keyFile, chrome, evidence, devUrl] = process.argv.slice(2);
const key = JSON.parse(readFileSync(keyFile, 'utf8'));
const origin = new URL(base).origin;
const screens = join(evidence, 'screens');
mkdirSync(screens, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function report(id, ok, name, details = []) {
  const row = key.rows.find((r) => r.id === id);
  if (!row) throw new Error(`check ${id} has no row in the key`);
  const known = key.known.filter((k) => k.id === id).map((k) => k.detail);
  let verdict = row.status === 'human' ? 'HUMAN' : ok === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL';
  if (verdict === 'FAIL' && known.length && details.length && details.every((d) => known.some((k) => d.includes(k)))) verdict = 'KNOWN';
  results.push({ id, side, verdict, status: row.status, step: row.step, name, details });
  const tag = row.status === 'target' ? `[target, step ${row.step}] ` : '';
  console.log(`${verdict.padEnd(7)} ${id.padEnd(4)} ${side.padEnd(5)} ${tag}${name}`);
  for (const d of details.slice(0, 12)) console.log(`        ${d}`);
  if (details.length > 12) console.log(`        ... ${details.length - 12} more in browser-${side}.json`);
}

// Helpers that run inside the page. inPage() prepends them to the function it evaluates.
const KIT = String.raw`
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const rgba = (c) => {
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) { const v = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [v[0], v[1], v[2], v[3] ?? 1]; }
  probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = c; probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
};
const over = (top, base) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const same = (a, b) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1);
const canvasColor = () => {
  const d = document.createElement('div');
  d.style.background = 'Canvas';
  document.documentElement.append(d);
  const c = rgba(getComputedStyle(d).backgroundColor);
  d.remove();
  return c;
};
// A side of a computed box in px, padding and border included when box-sizing leaves them out.
const outer = (cs, axis) => {
  const [a, b] = axis === 'x' ? ['Left', 'Right'] : ['Top', 'Bottom'];
  const extra = cs.boxSizing === 'content-box' ? ['padding' + a, 'padding' + b, 'border' + a + 'Width', 'border' + b + 'Width'].reduce((s, k) => s + parseFloat(cs[k]), 0) : 0;
  return parseFloat(cs[axis === 'x' ? 'width' : 'height']) + extra;
};
// The background of n's ::before or ::after when that pseudo-element is absolutely positioned
// over the point (x, y), such as the highlight block behind "machines.". Its box comes from its
// containing block, its computed offsets and size, and the translation in its transform.
const pseudoFill = (n, pseudo, x, y) => {
  const cs = getComputedStyle(n, pseudo);
  if (cs.content === 'none' || cs.content === 'normal' || cs.position !== 'absolute') return null;
  const bg = rgba(cs.backgroundColor);
  if (bg[3] === 0) return null;
  let cb = n;
  while (cb.parentElement && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
  const r = cb.getBoundingClientRect();
  const cbs = getComputedStyle(cb);
  const m = /matrix\(([^)]+)\)/.exec(cs.transform);
  const [tx, ty] = m ? m[1].split(',').slice(4).map(parseFloat) : [0, 0];
  const left = r.left + parseFloat(cbs.borderLeftWidth) + parseFloat(cs.left) + tx;
  const top = r.top + parseFloat(cbs.borderTopWidth) + parseFloat(cs.top) + ty;
  return x >= left && x <= left + outer(cs, 'x') && y >= top && y <= top + outer(cs, 'y') ? bg : null;
};
// The colour behind the point (x, y) of el. Walking up from el, it takes each element's ::after,
// then its ::before, then its own background, until one is opaque. Translucent layers above it
// are composited on. With nothing opaque it is Canvas. background-image is not read.
const behind = (el, x, y) => {
  const layers = [];
  for (let n = el; n; n = n.parentElement) {
    for (const bg of [pseudoFill(n, '::after', x, y), pseudoFill(n, '::before', x, y), rgba(getComputedStyle(n).backgroundColor)]) {
      if (!bg || bg[3] === 0) continue;
      layers.push(bg);
      if (bg[3] >= 1) return layers.reverse().reduce((b, t) => over(t, b));
    }
  }
  return layers.reverse().reduce((b, t) => over(t, b), canvasColor());
};
// Visible to a visitor: rendered, not transparent, larger than the 1px clip of a screen-reader-only
// element, and inside the page area a visitor can scroll to.
const seen = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const page = document.documentElement;
  return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && r.width > 1 && r.height > 1 &&
    r.right + scrollX > 0 && r.bottom + scrollY > 0 && r.left + scrollX < page.scrollWidth && r.top + scrollY < page.scrollHeight;
};
// The text of el that seen() keeps, with a word break at every element that does not render inline.
const shownText = (el) => {
  const walk = (n) => {
    if (n.nodeType === Node.TEXT_NODE) return seen(n.parentElement) ? n.data : ' ';
    if (n.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(n.tagName)) return '';
    const inner = [...n.childNodes].map(walk).join('');
    const display = getComputedStyle(n).display;
    return n.tagName === 'BR' || !(display.startsWith('inline') || display === 'contents') ? ' ' + inner + ' ' : inner;
  };
  return el ? walk(el).replace(/\s+/g, ' ').trim() : '';
};
// Text nodes a visitor sees, aria-hidden text included.
const visibleTexts = (root = document.body) => {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const el = t.parentElement;
    if (!t.data.trim() || !el || el.closest('svg, script, style') || !seen(el)) continue;
    const r = document.createRange();
    r.selectNodeContents(t);
    const box = r.getBoundingClientRect();
    if (box.width >= 1 && box.height >= 1) out.push({ t, el, text: t.data, box });
  }
  return out;
};
// visibleTexts() plus the string content of every ::before and ::after of a seen element in root,
// such as a page number drawn with CSS. A pseudo-element's box is taken as its element's.
const shownPieces = (root = document.body) => {
  const out = visibleTexts(root);
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.closest('svg') || !seen(el)) continue;
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      const m = /^"(.*)"$/.exec(cs.content);
      if (m?.[1].trim() && cs.display !== 'none') out.push({ el, pseudo, text: m[1], box: el.getBoundingClientRect() });
    }
  }
  return out;
};
// Every h1 as the DOM has it, shown or not, so a missing page with a hidden heading is still
// recognised as missing.
const allH1s = () => [...document.querySelectorAll('h1')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
const firstFamily = (cs) => cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
const where = (el, pseudo) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.') : '') + (pseudo ?? '');
const THREE = /(?<![\d,.])\d{3}(?![\d,.])/g;
`;
const inPage = (tab, fn, arg = null) => tab.evaluate(`(async () => {${KIT}\nreturn (${fn})(${JSON.stringify(arg)});\n})()`);

// The SPA has rendered: an h1 with text, no loading skeleton or spinner showing, finite animations
// done, and the path unchanged for 600 ms. Raw CDP has no network-idle wait.
const SETTLED = `(() => {
  const h1 = document.querySelector('h1');
  const busy = [...document.querySelectorAll('.animate-pulse, .animate-spin')].some((e) => e.checkVisibility());
  const moving = document.getAnimations().some((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
  return { path: location.pathname + location.search, ready: document.readyState === 'complete' && !!h1 && h1.textContent.trim() !== '' && !busy && !moving };
})()`;
async function settle(tab) {
  let last = null;
  let since = Date.now();
  for (const end = Date.now() + 20000; Date.now() < end; await sleep(200)) {
    const s = await tab.evaluate(SETTLED).catch(() => null);
    if (!s) continue;
    if (s.path !== last || !s.ready) { last = s.path; since = Date.now(); continue; }
    if (Date.now() - since >= 600) return null;
  }
  return 'did not settle in 20 s (no h1, or a loader still showing)';
}

let tab;
try {
  tab = await launch(chrome);
} catch (e) {
  console.log(`FAIL    BROWSER ${side} could not launch ${chrome}: ${e.message}`);
  console.log('BROWSER_RESULT=fail');
  process.exit(1);
}
const shot = (name, full = true) => tab.screenshot(join(screens, `${side}-${name.replace(/[^a-z0-9-]+/gi, '_')}.png`), full);
const urlOf = (path) => new URL(path, base).href;
// A URL as the key's routes are written: its path when it is on this site, its whole href when it
// is not. A path compared with this never matches another origin.
const siteRoute = (href) => {
  const u = new URL(href);
  return u.origin === origin ? u.pathname : u.href;
};
const here = async () => siteRoute(await tab.evaluate('location.href'));
// A page is missing when any of its h1s, shown or hidden, is a Missing pages h1.
const missingOf = (page) => key.missing.find((m) => page.h1s.includes(m.h1));

// One visit: open the path, wait for it to render, read what the rows need.
async function visit(path, { style = false } = {}) {
  const navError = await tab.goto(urlOf(path));
  const unsettled = navError ? `navigation failed: ${navError}` : await settle(tab);
  await sleep(300);
  const data = await inPage(tab, async ({ style, tokens }) => {
    const h1 = document.querySelector('h1');
    const out = {
      href: location.href,
      h1: shownText(h1),
      h1Seen: seen(h1),
      h1s: allH1s(),
      links: [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: shownText(a) })),
      halloween: document.querySelectorAll('[data-halloween]').length,
      text: shownText(document.body),
    };
    // D10: the three-digit numbers outside links in visible text rendered above the site header.
    const header = [...document.querySelectorAll('header')].find(seen);
    const headerTop = header && header.getBoundingClientRect().top;
    out.strip = header ? shownPieces().filter((p) => !header.contains(p.el) && !p.el.closest('a[href]') && p.box.bottom <= headerTop + 1)
      .flatMap((p) => p.text.match(THREE) ?? []) : null;
    // D7: every rendered instance of the game-count component, marked data-count in the mockup.
    out.counts = [...document.querySelectorAll('[data-count]')].filter(seen).map((e) => shownText(e));
    if (!style) return out;
    await document.fonts.ready;
    // D9: three-digit numbers in the header nav, the index (a list in <main> that holds links) and
    // the button bar (a nav outside the header and the footer).
    const zones = [
      ...[...document.querySelectorAll('header nav')].map((n) => ['header nav', n]),
      ...[...document.querySelectorAll('main li')].filter((li) => li.closest('ul, ol')?.querySelector('a[href]')).map((n) => ['index', n]),
      ...[...document.querySelectorAll('nav')].filter((n) => !n.closest('header, footer')).map((n) => ['button bar', n]),
    ];
    // A piece inside two zones counts once.
    const counted = { text: new Set(), '::before': new Set(), '::after': new Set() };
    out.numbers = [];
    for (const [zone, root] of zones) {
      for (const p of shownPieces(root)) {
        const done = counted[p.pseudo ?? 'text'];
        if (done.has(p.t ?? p.el)) continue;
        done.add(p.t ?? p.el);
        for (const n of p.text.match(THREE) ?? []) out.numbers.push({ zone, n, href: p.el.closest('a[href]')?.href ?? null });
      }
    }
    out.tokens = Object.fromEntries(Object.keys(tokens).map((n) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return [n, { v, rgb: v && CSS.supports('color', v) ? rgba(v) : null }];
    }));
    const pieces = shownPieces();
    out.vt323 = pieces.map((p) => ({ p, cs: getComputedStyle(p.el, p.pseudo ?? null) })).filter(({ cs }) => firstFamily(cs) === 'VT323')
      .map(({ p, cs }) => ({ text: p.text.trim().slice(0, 30), size: parseFloat(cs.fontSize) }));
    // D6: text on a pink or yellow fill, judged at the centre of the text itself.
    const ink = rgba(tokens['--ink']);
    out.onFill = [];
    for (const { t, el, box } of visibleTexts()) {
      const ground = behind(el, box.left + box.width / 2, box.top + box.height / 2);
      const fill = same(ground, rgba(tokens['--pink'])) ? '--pink' : same(ground, rgba(tokens['--yellow'])) ? '--yellow' : null;
      if (!fill) continue;
      const fg = over(rgba(getComputedStyle(el).color), ground);
      out.onFill.push({ text: t.data.trim().slice(0, 30), fill, fg: hex(fg), ok: same(fg, ink) });
    }
    // D4 and D5. Pseudo-elements with content count as elements.
    // The first shadow in the list with a blur radius above 0, or undefined.
    const blurred = (shadow) => shadow.split(/,(?![^(]*\))/).find((s) => parseFloat((s.replace(/[a-z-]+\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? [])[2] ?? '0') > 0)?.trim();
    const dots = (size) => size.split(',').every((s) => /^\s*[\d.]+px(\s+[\d.]+px)?\s*$/.test(s) && s.match(/[\d.]+/g).every((v) => parseFloat(v) <= 32));
    // The radii a w by h box draws, as [horizontal, vertical] for each corner from top left
    // clockwise. A computed radius is one value or two ("50% 10%"). When two radii on one side
    // add up to more than that side, CSS scales every radius by the same factor (css-backgrounds-3,
    // 4.5 Overlapping curves), so "100% / 50%" on a square draws 50% by 25%.
    const usedRadii = (cs, w, h) => {
      const px = (v, side) => (v.endsWith('%') ? (parseFloat(v) * side) / 100 : parseFloat(v));
      const r = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
        .map((c) => { const [x, y = x] = c.split(' '); return [px(x, w), px(y, h)]; });
      const sides = [[w, r[0][0] + r[1][0]], [h, r[1][1] + r[2][1]], [w, r[2][0] + r[3][0]], [h, r[3][1] + r[0][1]]];
      const f = Math.min(1, ...sides.filter(([, sum]) => sum > 0).map(([len, sum]) => len / sum));
      return r.map(([x, y]) => [x * f, y * f]);
    };
    out.d4 = [];
    out.d5 = [];
    for (const el of document.querySelectorAll('html, body, body *')) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
        if (cs.display === 'none') continue;
        const w = pseudo ? outer(cs, 'x') : el.offsetWidth;
        const h = pseudo ? outer(cs, 'y') : el.offsetHeight;
        const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
        const circle = w > 0 && Math.abs(w - h) <= 1 && usedRadii(cs, w, h).every(([x, y]) => x >= w / 2 - 0.5 && y >= h / 2 - 0.5);
        const name = where(el, pseudo);
        if (radii.some((r) => r !== '0px') && !circle) out.d5.push(`${name} border-radius ${cs.borderRadius}`);
        for (const prop of ['boxShadow', 'textShadow']) {
          const b = cs[prop] !== 'none' && blurred(cs[prop]);
          if (b) out.d4.push(`${name} ${prop === 'boxShadow' ? 'box-shadow' : 'text-shadow'} ${b}`);
        }
        for (const f of ['filter', 'backdropFilter']) if (/blur\(|drop-shadow\(/.test(cs[f])) out.d4.push(`${name} ${f} ${cs[f].slice(0, 60)}`);
        const bg = cs.backgroundImage;
        if (/linear-gradient/.test(bg)) out.d4.push(`${name} ${bg.slice(0, 70)}`);
        if (/(?<!repeating-)conic-gradient/.test(bg) || (/repeating-conic-gradient/.test(bg) && !circle)) out.d4.push(`${name} conic gradient outside the coin rim`);
        if (/radial-gradient/.test(bg) && !dots(cs.backgroundSize)) out.d4.push(`${name} radial-gradient on a ${cs.backgroundSize} tile, not ground dots`);
      }
    }
    out.d4 = [...new Set(out.d4)];
    out.d5 = [...new Set(out.d5)];
    return out;
  }, { style, tokens: key.tokens });
  const offSite = new URL(data.href).origin === origin ? null : `left the site for ${data.href}`;
  // broken says why the page cannot be judged, when it did not render or it left the site.
  return { path, broken: unsettled ?? offSite, ...data };
}

const v = {};
const text = {};
const pages = key.pages.map((p) => p.path);
for (const p of pages) {
  v[p] = await visit(p, { style: true });
  text[p] = v[p].text;
  await shot(`page${p}`);
}

const gameLink = /^\/game\/[^/?#]+$/;
const games = v['/games'];
const cards = new Map();
for (const l of games.links) {
  const u = new URL(l.href);
  if (u.origin === origin && gameLink.test(u.pathname)) cards.set(u.pathname, [...(cards.get(u.pathname) ?? []), l.text]);
}
const slugs = [...cards.keys()];
{
  const labels = [...games.text.matchAll(/(\d+) PLAYABLE/g)].map((m) => Number(m[1]));
  const bad = [];
  if (games.broken) bad.push(`/games ${games.broken}`);
  if (!labels.length) bad.push('/games shows no "N PLAYABLE" label');
  for (const n of labels) if (n !== slugs.length) bad.push(`a label says ${n} PLAYABLE, the page links ${slugs.length} distinct /game/<slug> routes`);
  if (slugs.length < 1) bad.push('/games links no /game/<slug> route');
  report('A5', !bad.length, `"N PLAYABLE" equals the ${slugs.length} distinct cabinet links on /games`, bad);
}

for (const g of slugs) {
  v[g] = await visit(g);
  text[g] = v[g].text;
  await shot(`game-${g.split('/').pop()}`, false);
}
{
  const bad = [];
  for (const g of slugs) {
    const m = missingOf(v[g]);
    if (v[g].broken) bad.push(`${g} ${v[g].broken}`);
    if (m) bad.push(`${g} is a missing page (${m.state}, h1 "${m.h1}"${v[g].h1 === m.h1 ? '' : ', present but not visible'})`);
    else if (!v[g].h1 || !v[g].h1Seen) bad.push(`${g} shows no visible h1 to match its card`);
    else if (!cards.get(g).some((t) => t.includes(v[g].h1))) bad.push(`${g} h1 "${v[g].h1}" is not in its /games card text "${cards.get(g)[0]}"`);
  }
  report('A6', slugs.length > 0 && !bad.length, `${slugs.length} cabinets from /games open and match their card`, bad);
}
{
  const bad = [];
  for (const p of pages) {
    if (v[p].broken) bad.push(`${p} ${v[p].broken}`);
    else if (v[p].h1 !== key.pages.find((x) => x.path === p).h1) bad.push(`${p} h1 "${v[p].h1}", expected "${key.pages.find((x) => x.path === p).h1}"`);
    else if (!v[p].h1Seen) bad.push(`${p} h1 is not visible`);
  }
  report('A1', !bad.length, `${pages.length} Pages routes show their h1`, bad);
}

for (const m of key.missing) {
  v[m.path] = await visit(m.path);
  text[m.path] = v[m.path].text;
  await shot(`missing${m.path}`, false);
}
{
  const bad = [];
  for (const m of key.missing) {
    const got = v[m.path];
    if (got.broken) bad.push(`${m.path} ${got.broken}`);
    if (got.h1 !== m.h1) bad.push(`${m.path} h1 "${got.h1}", expected "${m.h1}"`);
    // A link's text is its rendered text, so an invisible link has none. The link must lead to the
    // row's path on this site, not to that path on another host.
    const named = got.links.filter((a) => a.text === m.link.text);
    if (!named.some((a) => siteRoute(a.href) === m.link.to)) {
      bad.push(`${m.path} shows no visible "${m.link.text}" link to ${m.link.to} on ${origin}${named.length ? `, it links to ${named.map((a) => a.href).join(' ')}` : ''}`);
    }
  }
  report('A3', !bad.length, `${key.missing.length} missing states show their h1 and link`, bad);
}

{
  const bad = [];
  for (const r of key.redirects) {
    await tab.goto(urlOf(r.path));
    const unsettled = await settle(tab);
    const landed = await here();
    if (landed !== r.to) bad.push(`${r.path} ended on ${landed}, expected ${r.to}${unsettled ? ` (${unsettled})` : ''}`);
  }
  report('A2', !bad.length, `${key.redirects.length} signed-in routes send an anonymous visitor where the key says`, bad);
}

{
  const bad = [];
  await tab.goto(urlOf('/'));
  await settle(tab);
  const navLinks = await inPage(tab, (o) => [...document.querySelectorAll('header nav a[href]')].filter((a) => new URL(a.href).origin === o)
    .map((a) => ({ href: a.href, text: shownText(a) })), origin);
  if (!navLinks.length) bad.push('/ has no internal link in a nav inside a header');
  for (const [i, link] of navLinks.entries()) {
    await tab.goto(urlOf('/'));
    await settle(tab);
    const box = await inPage(tab, ([o, i]) => {
      const a = [...document.querySelectorAll('header nav a[href]')].filter((x) => new URL(x.href).origin === o)[i];
      if (!a || !seen(a)) return null;
      a.scrollIntoView({ block: 'center' });
      const r = a.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [origin, i]);
    if (!box) { bad.push(`"${link.text}" (${link.href}) is not visible to click`); continue; }
    await tab.clickAt(box.x, box.y);
    await sleep(300);
    const unsettled = await settle(tab);
    const path = await here();
    const got = await inPage(tab, () => {
      const h = document.querySelector('h1');
      return { h1: shownText(h), seen: seen(h), h1s: allH1s() };
    });
    await shot(`A4-${i}-${link.text}`, false);
    const page = key.pages.find((p) => p.path === path);
    const cabinet = gameLink.test(path) && got.h1 && got.seen && !missingOf(got);
    if (unsettled) bad.push(`"${link.text}" landed on ${path}, ${unsettled}`);
    else if (page ? got.h1 !== page.h1 || !got.seen : !cabinet) bad.push(`"${link.text}" landed on ${path} with h1 "${got.h1}", not a Pages route showing its h1 or a cabinet showing its own`);
  }
  report('A4', navLinks.length > 0 && !bad.length, `${navLinks.length} header nav links on / land on a page with its h1`, bad);
}

// A7: every link on the Pages routes, the cabinets and the two missing states, whose recovery links
// a visitor follows too. Internal targets are opened and judged by
// the Missing pages table. External ones get one HTTP request from this host.
const linkJudge = new Map();
const internal = [];
const external = [];
for (const p of [...pages, ...slugs, ...key.missing.map((m) => m.path)]) {
  for (const l of v[p].links) {
    const u = new URL(l.href);
    if (!/^https?:$/.test(u.protocol)) continue;
    const target = u.origin === origin ? u.pathname + u.search : u.href.split('#')[0];
    (u.origin === origin ? internal : external).push({ from: p, text: l.text, target });
  }
}
for (const target of new Set(internal.map((l) => l.target))) {
  v[target] ??= await visit(target);
  const m = missingOf(v[target]);
  const hidden = m && v[target].h1 !== m.h1 ? ', heading present but not visible' : '';
  linkJudge.set(target, m ? `reaches the ${m.state} missing page ("${m.h1}"${hidden})` : v[target].broken ? `cannot be judged: ${v[target].broken}` : null);
}
const externalStatus = new Map();
for (const target of new Set(external.map((l) => l.target))) {
  let status;
  try {
    let r = await fetch(target, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (r.status === 405 || r.status === 403) r = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
    status = r.status;
  } catch (e) {
    status = `network failure (${e.cause?.code ?? e.name})`;
  }
  externalStatus.set(target, status);
  linkJudge.set(target, typeof status === 'number' && status >= 500 ? `answered ${status}` : null);
}
{
  const bad = [];
  const warn = [];
  for (const l of internal) if (linkJudge.get(l.target)) bad.push(`${l.from} link "${l.text}" to ${l.target} ${linkJudge.get(l.target)}`);
  for (const l of external) {
    const s = externalStatus.get(l.target);
    if (typeof s === 'number' && s >= 500) bad.push(`${l.from} link "${l.text}" to ${l.target} answered ${s}`);
    else if (typeof s !== 'number' || s >= 400) warn.push(`WARN ${l.from} link to ${l.target}: ${s}`);
  }
  report('A7', bad.length ? false : warn.length ? 'warn' : true,
    `${new Set(internal.map((l) => l.target)).size} internal and ${externalStatus.size} external link targets`, [...new Set([...bad, ...warn])]);
}

{
  const bad = [];
  for (const [name, want] of Object.entries(key.tokens)) {
    const got = v['/'].tokens[name];
    const rgb = got?.rgb;
    const hex = rgb && '#' + rgb.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
    if (!got?.v) bad.push(`${name} is not defined on :root`);
    else if (hex !== want || rgb[3] !== 1) bad.push(`${name} computes to "${got.v}", expected ${want}`);
  }
  report('D1', !bad.length, `${Object.keys(key.tokens).length} Direction K tokens on :root of /`, bad);
}
{
  const all = pages.flatMap((p) => v[p].vt323.map((t) => ({ p, ...t })));
  const bad = all.filter((t) => t.size < 20).map((t) => `${t.p} "${t.text}" in VT323 at ${t.size}px`);
  report('D3', !bad.length, `no VT323 text below 20px (${all.length} pieces of text in VT323)`, bad);
}
report('D4', pages.every((p) => !v[p].d4.length), 'no blurred shadow or filter, no gradient but ground dots and the coin rim',
  pages.flatMap((p) => v[p].d4.map((d) => `${p} ${d}`)));
report('D5', pages.every((p) => !v[p].d5.length), 'square corners everywhere except a circle', pages.flatMap((p) => v[p].d5.map((d) => `${p} ${d}`)));
{
  const all = pages.flatMap((p) => v[p].onFill.map((t) => ({ p, ...t })));
  const bad = all.filter((t) => !t.ok).map((t) => `${t.p} "${t.text}" on ${t.fill} computes to ${t.fg}, expected ${key.tokens['--ink']}`);
  report('D6', !bad.length, `text on --pink and --yellow is --ink (${all.length} text nodes on a fill)`, bad);
}
{
  const counts = v['/'].counts;
  const bad = counts.filter((c) => c !== String(slugs.length)).map((c) => `a game count on / shows "${c}", /games links ${slugs.length} cabinets`);
  if (!counts.length) bad.push('/ shows no game count (no visible [data-count] element)');
  report('D7', !bad.length, `every game count on / equals the ${slugs.length} cabinets on /games (${counts.length} shown)`, bad);
}
{
  const bad = [];
  for (const width of [360, 390]) {
    await tab.viewport(width);
    for (const p of ['/', '/games']) {
      await tab.goto(urlOf(p));
      const unsettled = await settle(tab);
      const s = await tab.evaluate('({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })');
      if (unsettled) bad.push(`${p} at ${width}px ${unsettled}`);
      if (s.sw > s.cw) bad.push(`${p} at ${width}px scrolls sideways, ${s.sw} > ${s.cw}`);
    }
  }
  await tab.viewport(1280);
  report('D8', !bad.length, 'no horizontal scroll on / and /games at 360 and 390', bad);
}
const numbered = pages.flatMap((p) => v[p].numbers.map((n) => ({ p, ...n })));
{
  const bad = [];
  for (const n of numbered) {
    if (!n.href) { bad.push(`${n.p} ${n.zone} "${n.n}" is not inside a link`); continue; }
    const u = new URL(n.href);
    const t = u.origin === origin ? u.pathname + u.search : u.href.split('#')[0];
    if (linkJudge.get(t)) bad.push(`${n.p} ${n.zone} "${n.n}" links to ${t}, which ${linkJudge.get(t)}`);
  }
  report('D9', !bad.length, `${numbered.length} page numbers are links that pass A7`, [...new Set(bad)]);
}
{
  const bad = [];
  const seenNumbers = new Map();
  for (const g of slugs) {
    if (v[g].strip === null) { bad.push(`${g} has no site header to find the strip above`); continue; }
    const own = [...new Set(v[g].strip)];
    if (own.length !== 1) { bad.push(own.length ? `${g} strip shows ${own.join(', ')}, not one number` : `${g} shows no three-digit number above the header`); continue; }
    const n = Number(own[0]);
    if (n < 301 || n > 389) bad.push(`${g} number ${n} is outside 301 to 389`);
    if (seenNumbers.has(n)) bad.push(`${g} reuses ${n} from ${seenNumbers.get(n)}`);
    seenNumbers.set(n, g);
    if (g === '/game/brickstorm' && n !== 303) bad.push(`/game/brickstorm is ${n}, expected 303`);
  }
  report('D10', slugs.length > 0 && !bad.length, `${slugs.length} cabinets show their own number in the top strip`, bad);
}

// H2 and H3: screenshots for Jeff. The skill never submits the form.
{
  await tab.goto(urlOf('/'));
  await settle(tab);
  const form = await inPage(tab, () => {
    const f = document.querySelector('input[type="email"]')?.closest('form');
    if (!f) return false;
    f.scrollIntoView({ block: 'center' });
    return true;
  });
  await sleep(300);
  await shot('H2-email-form', false);
  report('H2', true, 'Jeff drives the email form on / through idle, sending, success, invalid and error', [
    form ? `route ${urlOf('/')}, form shown in screens/${side}-H2-email-form.png` : `route ${urlOf('/')} has no email form, screens/${side}-H2-email-form.png`,
    'the skill never submits it. Use a test address.']);
  const files = [];
  for (const width of [1440, 390]) {
    await tab.viewport(width);
    await tab.goto(urlOf('/'));
    await settle(tab);
    await shot(`H3-home-${width}`);
    files.push(`screens/${side}-H3-home-${width}.png`);
  }
  await tab.viewport(1280);
  report('H3', true, 'Jeff compares / at 1440 and 390 with the Direction K mockup', [...files,
    'mockup: Shared/sprints/2026-11-01-riso-teletext-sites/prototype-k/arcade-home.html']);
}

// D11, last, because it starts a game. The PLAY button fires increment_play_count, a Supabase
// write, which the tab's guard fails before it leaves the browser. Events from the play phase are
// D11's own. Every other phase is loading, which the guard and the load rows judge.
{
  const bad = [];
  const game = slugs.includes('/game/brickstorm') ? '/game/brickstorm' : slugs[0];
  // The digits of a real page link in the header nav, when there is one, so a page-keys shortcut
  // would have somewhere to go.
  const digits = v['/'].numbers.find((n) => n.zone === 'header nav' && n.href)?.n ?? '390';
  if (game) {
    await tab.goto(urlOf(game));
    await settle(tab);
    const play = await inPage(tab, () => {
      const b = [...document.querySelectorAll('main button')].find((x) => seen(x) && /play|start/i.test(shownText(x)));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!play) bad.push(`${game} has no PLAY button`);
    else {
      tab.state.phase = 'play';
      await tab.clickAt(play.x, play.y);
      await sleep(3000);
      const stage = await inPage(tab, () => {
        const s = [...document.querySelectorAll('main iframe, main canvas')].find(seen);
        if (!s) return null;
        const r = s.getBoundingClientRect();
        return { tag: s.tagName.toLowerCase(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (!stage) bad.push(`${game} shows no running game after PLAY`);
      else {
        await tab.clickAt(stage.x, stage.y);
        await tab.typeDigits(digits);
        await sleep(2500);
        await shot('D11-game-focused', false);
        const now = await here();
        if (now !== game) bad.push(`typing ${digits} into the ${stage.tag} on ${game} navigated to ${now}`);
      }
    }
  }
  if (!game) bad.push('/games links no cabinet to play');
  // The next navigation unloads the game, so loading starts again only after it.
  await tab.goto('about:blank');
  tab.state.phase = 'load';
  report('D11', !bad.length, `${digits} typed into a running game does not navigate${game ? ` (${game})` : ''}`, bad);
}

// H1: every cabinet route with a screenshot. /dev/<slug> exists only in a dev build.
{
  const details = [];
  const changed = (process.env.CHANGED_CABINETS ?? '').split(' ').filter(Boolean);
  if (side === 'build') details.push(`changed on this branch: ${changed.length ? changed.join(', ') : 'none'}`);
  for (const g of slugs) details.push(`${urlOf(g)} screens/${side}-game-${g.split('/').pop()}.png`);
  if (devUrl) {
    await tab.goto(new URL('/dev', devUrl).href);
    await settle(tab);
    // Only /dev/<slug> links on the dev server itself.
    const dev = await inPage(tab, (o) => [...new Set([...document.querySelectorAll('a[href]')].map((a) => new URL(a.href))
      .filter((u) => u.origin === o && /^\/dev\/[^/]+$/.test(u.pathname)).map((u) => u.pathname))], new URL(devUrl).origin);
    for (const p of dev) {
      await tab.goto(new URL(p, devUrl).href);
      await sleep(6000);
      const name = `dev_${p.split('/').pop()}`;
      await shot(name, false);
      details.push(`${p} (pnpm dev) screens/${side}-${name}.png`);
    }
    if (!dev.length) details.push(`${devUrl}/dev listed no /dev/<slug> route`);
  }
  report('H1', true, `${slugs.length} cabinet routes${devUrl ? ' and the /dev routes' : ''} for Jeff to play`, details);
}

// A8, A9 and D2 judge every load of their routes in every phase, A4's clicks, D8's widths and
// H2 and H3's reloads included. D11's play phase is playing, not loading, so it is left out.
// An error the guard itself caused, by failing a blocked write, is the guard's to report.
await tab.close();
const pathOf = (u) => {
  try {
    const x = new URL(u);
    return x.origin === origin ? x.pathname : null;
  } catch {
    return null;
  }
};
const loading = (entries, routes) => entries.filter((e) => e.phase === 'load' && routes.includes(pathOf(e.at)));
const blockedUrls = new Set(tab.log.blocked.map((b) => b.url));
{
  const bad = loading(tab.log.errors, [...pages, ...slugs]).filter((e) => !blockedUrls.has(e.url)).map((e) => `${pathOf(e.at)} ${e.text}`);
  report('A8', !bad.length, `no uncaught exception or error log on any load of ${pages.length} pages and ${slugs.length} cabinets`, [...new Set(bad)]);
}
{
  const bad = loading(tab.log.requests, pages).filter((r) => r.url.includes('/halloween/')).map((r) => `${pathOf(r.at)} requested ${r.url}`);
  for (const p of pages) if (v[p].halloween) bad.push(`${p} has ${v[p].halloween} element(s) with data-halloween`);
  report('A9', !bad.length, 'no Halloween request or attribute on the Pages routes', [...new Set(bad)]);
}
{
  const fontHost = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
  // The key leaves out only this site's own typestorm.html, not a file of that name elsewhere.
  const outside = (r) => siteRoute(r.document || r.url) === '/games/typestorm.html';
  const routes = [...pages, ...slugs];
  const bad = loading(tab.log.requests, routes).filter((r) => fontHost.test(r.url) && !outside(r)).map((r) => `${pathOf(r.at)} requested ${r.url.slice(0, 90)}`);
  for (const r of loading(tab.log.responses, routes).filter((x) => x.type === 'Font')) {
    const u = new URL(r.url);
    if (u.origin !== origin || !u.pathname.endsWith('.woff2')) bad.push(`${pathOf(r.at)} font ${r.url.slice(0, 90)} is not a woff2 from ${origin}`);
  }
  report('D2', !bad.length, 'no Google Fonts request, every font a woff2 from this origin', [...new Set(bad)]);
}
// Every blocked write lands in one of the two lists, whatever phase it came from.
const d11Blocked = tab.log.blocked.filter((b) => b.phase === 'play').map((b) => b.text);
const unexpected = tab.log.blocked.filter((b) => b.phase !== 'play').map((b) => b.text);
writeFileSync(join(evidence, `browser-${side}.json`), JSON.stringify({ schema: RECEIPT_SCHEMA, side, base, chrome: tab.product,
  finished: new Date().toISOString(), results, text, blockedDuringD11: d11Blocked, unexpectedWrites: unexpected }, null, 1));
if (unexpected.length) console.log(`FAIL    GUARD ${side} the site tried to write to Supabase while browsing: ${[...new Set(unexpected)].join(', ')}`);
if (d11Blocked.length) console.log(`        guard failed ${d11Blocked.length} write(s) during D11's PLAY click: ${[...new Set(d11Blocked)].join(', ')}`);
const failed = results.filter((r) => r.status === 'invariant' && r.verdict === 'FAIL').length + (unexpected.length ? 1 : 0);
const targets = results.filter((r) => r.status === 'target' && r.verdict !== 'PASS').length;
console.log(`BROWSER_RESULT=${failed ? 'fail' : 'pass'} side=${side} failed=${failed} targets_failed=${targets} ${tab.product} screenshots ${screens}`);
process.exit(failed ? 1 : 0);
