// A small Chrome DevTools Protocol driver over Node's global WebSocket, so the skill adds no
// dependency to the app. launch() starts a headless Chromium with a fresh profile and returns
// one tab that every check reuses.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The site reads Supabase with the public anon key, so any write would be real. Reads are GET,
// and the read-only RPCs are POSTs named get_*. Every other request to Supabase is failed here,
// before it leaves the browser, and recorded.
const SUPABASE = /^https:\/\/[a-z0-9]+\.supabase\.co\//;
const allowedSupabase = (method, url) => ['GET', 'HEAD', 'OPTIONS'].includes(method) ||
  (method === 'POST' && /^\/rest\/v1\/rpc\/get_[a-z_]+$/.test(new URL(url).pathname));

export async function launch(chrome) {
  const profile = mkdtempSync(join(tmpdir(), 'arcade-verify-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio', '--hide-scrollbars', '--deny-permission-prompts', 'about:blank'];
  if (process.getuid?.() === 0) args.unshift('--no-sandbox');
  const proc = spawn(chrome, args, { stdio: 'ignore' });
  const exited = new Promise((res) => proc.once('exit', res));
  // Chrome holds its profile open until it exits, so the profile goes only after the exit.
  const stop = async () => {
    proc.kill();
    await Promise.race([exited, sleep(10000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  };
  // A run that dies before close() still takes its Chrome with it, and its profile when Chrome lets
  // go of it in time. An exit hook cannot wait.
  process.once('exit', () => {
    proc.kill();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // Chrome still held the profile. It stays in the temp folder.
    }
  });
  let spawnError = null;
  proc.once('error', (e) => { spawnError = e; });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile) && !spawnError; i++) await sleep(200);
  if (spawnError) { rmSync(profile, { recursive: true, force: true }); throw new Error(`${chrome} did not start: ${spawnError.code ?? spawnError.message}`); }
  if (!existsSync(portFile)) { await stop(); throw new Error(`${chrome} wrote no DevToolsActivePort`); }
  // Any failure from here on, the socket included, stops Chrome and removes its profile.
  try {
    const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = ({ data }) => {
      const m = JSON.parse(data);
      if (m.id && pending.has(m.id)) {
        const { res, rej, method } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(`${method}: ${m.error.message}`)); else res(m.result);
      } else if (m.method) {
        for (const l of listeners) if (l.method === m.method && l.sessionId === m.sessionId) l.fn(m.params);
      }
    };
    const raw = (method, params = {}, sessionId) => new Promise((res, rej) => {
      id += 1;
      pending.set(id, { res, rej, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const { product } = await raw('Browser.getVersion');
    const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => raw(method, params, sessionId);
    const on = (method, fn) => {
      const l = { method, fn, sessionId };
      listeners.push(l);
      return () => listeners.splice(listeners.indexOf(l), 1);
    };

    // Every event of the whole run is kept, with the page the tab showed (at) and the phase the
    // caller set (state.phase), so no row and no guard list misses an event from a late phase.
    const state = { phase: 'load', at: 'about:blank' };
    const log = { errors: [], requests: [], responses: [], blocked: [] };
    const stamp = (entry) => ({ ...entry, at: state.at, phase: state.phase });
    on('Page.frameNavigated', (p) => { if (!p.frame.parentId) state.at = p.frame.url; });
    on('Page.navigatedWithinDocument', (p) => { if (p.frameId === targetId) state.at = p.url; });
    on('Runtime.exceptionThrown', (p) => log.errors.push(stamp({ text: `uncaught ${p.exceptionDetails.exception?.description?.split('\n')[0] ?? p.exceptionDetails.text}` })));
    on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') log.errors.push(stamp({ text: `console.error ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}` }));
    });
    on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') log.errors.push(stamp({ text: `log ${p.entry.source} ${p.entry.text.slice(0, 160)} ${p.entry.url ?? ''}`.trim(), url: p.entry.url ?? null }));
    });
    on('Network.requestWillBeSent', (p) => log.requests.push(stamp({ url: p.request.url, type: p.type, document: p.documentURL })));
    on('Network.responseReceived', (p) => log.responses.push(stamp({ url: p.response.url, status: p.response.status, type: p.type })));
    on('Fetch.requestPaused', (p) => {
      const { method, url } = p.request;
      if (!SUPABASE.test(url) || allowedSupabase(method, url)) send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
      else {
        log.blocked.push(stamp({ text: `${method} ${url.split('?')[0]}`, url }));
        send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      }
    });
    for (const d of ['Page', 'Runtime', 'Log', 'Network']) await send(`${d}.enable`);
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*.supabase.co/*', requestStage: 'Request' }] });
    // The two halves run on different hosts. A fixed zone and locale keep "5 days ago" and
    // "4,500" the same on both, so A11 compares the site and not the host clock.
    await send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
    await send('Emulation.setLocaleOverride', { locale: 'en-US' });
    // The default viewport. A visitor on a laptop.
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text);
      return r.result.value;
    };

    const tab = {
      product,
      log,
      state,
      send,
      evaluate,
      async goto(url) {
        let off;
        const loaded = new Promise((res) => { const t = setTimeout(res, 20000); off = on('Page.loadEventFired', () => { clearTimeout(t); res(); }); });
        const r = await send('Page.navigate', { url });
        if (!r.errorText) await loaded;
        off();
        return r.errorText ?? null;
      },
      async clickAt(x, y) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      },
      async typeDigits(digits) {
        for (const ch of digits) {
          const code = ch.charCodeAt(0);
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: `Digit${ch}`, text: ch, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: `Digit${ch}`, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
        }
      },
      async viewport(width, height = 800) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      },
      async screenshot(file, fullPage = false) {
        const params = { format: 'png' };
        if (fullPage) {
          const { cssContentSize: s } = await send('Page.getLayoutMetrics');
          params.captureBeyondViewport = true;
          params.clip = { x: 0, y: 0, width: Math.ceil(s.width), height: Math.min(Math.ceil(s.height), 8000), scale: 1 };
        }
        const { data } = await send('Page.captureScreenshot', params);
        writeFileSync(file, Buffer.from(data, 'base64'));
      },
      async close() {
        ws.close();
        await stop();
      },
    };
    return tab;
  } catch (e) {
    await stop();
    throw e;
  }
}
