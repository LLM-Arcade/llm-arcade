import assert from "node:assert/strict";
import { after, test } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { Window } from "happy-dom";

// Mount the actual Settings component and Cloudflare adapter. Only auth,
// surrounding layout and toasts are isolated; fetch never leaves this process.
// This verifies component behavior, not real-browser/provider acceptance.
const sourceRoot = new URL("../../src/", import.meta.url);
const adapterUrl = new URL("lib/cloudflare-community.ts", sourceRoot).href;
const mocks = new Map([
  ["@/contexts/AuthContext", "export const useAuth = () => globalThis.__settingsTestAuth;"],
  ["@/lib/legacy-supabase", `export { cloudflareCommunity as supabase } from ${JSON.stringify(adapterUrl)};`],
  ["@/lib/backend-config", "export const isCloudflareBackend = true;"],
  ["@/components/layout/SiteHeader", "export default function SiteHeader() { return null; }"],
  ["@/components/layout/SiteFooter", "export default function SiteFooter() { return null; }"],
  ["@/utils/toast", "export const showError = () => {}; export const showSuccess = () => {};"],
]);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks.has(specifier)) return { url: "settings-test:" + specifier, shortCircuit: true };
    if (specifier.startsWith("@/") || specifier.startsWith(".") && context.parentURL?.startsWith(sourceRoot.href)) {
      const path = fileURLToPath(specifier.startsWith("@/") ? new URL(specifier.slice(2), sourceRoot) : new URL(specifier, context.parentURL));
      for (const suffix of [".ts", ".tsx"]) {
        if (existsSync(path + suffix)) return { url: pathToFileURL(path + suffix).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("settings-test:")) return { format: "module", source: mocks.get(url.slice("settings-test:".length)), shortCircuit: true };
    if (url.startsWith(sourceRoot.href) && /\.tsx?$/.test(url)) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        fileName: fileURLToPath(url),
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const window = new Window({ url: "https://settings.example.test/settings" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "MouseEvent", "Node", "MutationObserver"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { default: Settings } = await import(new URL("pages/Settings.tsx", sourceRoot));
const { cloudflareCommunity } = await import(adapterUrl);
const originalFetch = globalThis.fetch;

after(async () => {
  globalThis.fetch = originalFetch;
  delete globalThis.__settingsTestAuth;
  hooks.deregister();
  await window.happyDOM.close();
});

async function mount(t, transport) {
  globalThis.__settingsTestAuth = {
    user: { id: "settings-test-player" }, loading: false, isGuest: true, signOut: async () => {},
    profile: { id: "settings-test-player", username: "original_player", display_name: "Private name", bio: "A public bio",
      role: "player", created_at: "2026-11-01T00:00:00Z" },
  };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/community/query");
    assert.equal(options.credentials, "same-origin");
    const body = JSON.parse(options.body);
    requests.push(body);
    return transport(body);
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Settings))));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(async () => {
    await act(async () => root.unmount());
    client.clear();
    t.mock.timers.reset();
    container.remove();
    globalThis.fetch = originalFetch;
  });
  const input = container.querySelector("#username");
  const save = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Save changes");
  const status = () => input.parentElement.parentElement.querySelector("p").textContent;
  const edit = async (field, value) => act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  return {
    container, input, save, status, requests, editField: edit,
    edit: value => edit(input, value),
    check: async () => act(async () => { t.mock.timers.tick(450); }),
  };
}

test("Settings does not call a failed availability lookup available or permit saving", async t => {
  const page = await mount(t, async () => Response.json({ error: "Synthetic service outage" }, { status: 503 }));
  await page.edit("new_candidate");
  await page.check();
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].single, "optional");
  assert.equal(page.save().disabled, true, `Failed lookup displayed ${JSON.stringify(page.status())} with Save enabled`);
  assert.doesNotMatch(page.status(), /Available|Already taken/);
  assert.match(page.status(), /couldn't check/i);
  await act(async () => page.save().click());
  assert.equal(page.requests.length, 1, "A failed check must not submit a profile update");
});

test("Settings retries an indeterminate lookup before enabling Save", async t => {
  let calls = 0;
  const page = await mount(t, async () => ++calls === 1
    ? Response.json({ error: "Synthetic service outage" }, { status: 503 })
    : Response.json({ data: null }));
  await page.edit("retry_candidate");
  await page.check();
  assert.equal(page.save().disabled, true);
  const retry = [...page.container.querySelectorAll("button")].find(button => button.textContent.trim() === "Retry");
  assert.ok(retry);
  await act(async () => retry.click());
  assert.match(page.status(), /checking/i);
  assert.equal(page.save().disabled, true);
  await page.check();
  assert.match(page.status(), /Available/);
  assert.equal(page.save().disabled, false);
  assert.equal(calls, 2);
  assert.ok(page.requests.every(request => request.filters[0].value === "retry_candidate"));
});

test("Settings preserves available, taken, unchanged and existing username eligibility", async t => {
  const page = await mount(t, async body => Response.json({
    data: body.filters[0].value === "taken_candidate" ? { id: "another-test-player" } : null,
  }));
  assert.equal(page.input.maxLength, 20);
  assert.equal(page.save().disabled, false);
  assert.equal(page.container.querySelector("#displayName").value, "Private name");
  assert.equal(page.container.querySelector("#bio").value, "A public bio");
  for (const candidate of ["NEW", "a".repeat(20), "abc_123"]) {
    await page.edit(candidate);
    assert.equal(page.save().disabled, true, "A previous verdict must not enable an unchecked candidate");
    await page.check();
    assert.match(page.status(), /Available/);
    assert.equal(page.save().disabled, false);
    assert.equal(page.input.value, candidate.toLowerCase());
    const checked = page.requests.length;
    await page.edit(candidate.toUpperCase());
    assert.match(page.status(), /Available/, "Case-only input must not leave an unchanged normalized value stuck checking");
    assert.equal(page.input.value, candidate.toLowerCase());
    await page.check();
    assert.equal(page.requests.length, checked);
  }
  for (const candidate of ["aa", "a".repeat(21), "bad-name"]) {
    const before = page.requests.length;
    await page.edit(candidate);
    await page.check();
    assert.match(page.status(), /3–20/);
    assert.equal(page.save().disabled, true);
    assert.equal(page.requests.length, before);
  }
  await page.edit("taken_candidate");
  await page.check();
  assert.match(page.status(), /Already taken/);
  assert.equal(page.save().disabled, true);
  await page.edit("original_player");
  assert.equal(page.save().disabled, false);
});

test("Settings keeps failures and malformed lookup responses indeterminate", async t => {
  let calls = 0;
  const page = await mount(t, async () => {
    if (++calls === 1) throw new Error("Synthetic transport failure");
    return Response.json(calls === 2 ? {} : { data: {} });
  });
  for (const candidate of ["network_failure", "missing_result", "malformed_row"]) {
    await page.edit(candidate);
    await page.check();
    assert.match(page.status(), /couldn't check/i);
    assert.doesNotMatch(page.status(), /Available|Already taken/);
    assert.equal(page.save().disabled, true);
  }
  const originalFrom = cloudflareCommunity.from;
  cloudflareCommunity.from = () => { throw new Error("Synthetic query construction failure"); };
  t.after(() => { cloudflareCommunity.from = originalFrom; });
  await page.edit("thrown_failure");
  await page.check();
  assert.match(page.status(), /couldn't check/i);
  assert.equal(page.save().disabled, true);
});

for (const staleFailure of [false, true]) {
  test(`Settings ignores a stale ${staleFailure ? "failure" : "available result"} for a previous candidate`, async t => {
    const pending = Promise.withResolvers();
    const page = await mount(t, body => body.filters[0].value === "old_candidate"
      ? pending.promise : Response.json({ data: staleFailure ? null : { id: "another-test-player" } }));
    await page.edit("old_candidate");
    await page.check();
    assert.match(page.status(), /checking/i);
    await page.edit("current_candidate");
    await page.check();
    const verdict = page.status();
    const disabled = page.save().disabled;
    await act(async () => {
      pending.resolve(staleFailure ? Response.json({ error: "Late synthetic outage" }, { status: 503 }) : Response.json({ data: null }));
    });
    assert.equal(page.status(), verdict);
    assert.equal(page.save().disabled, disabled);
    assert.match(verdict, staleFailure ? /Available/ : /Already taken/);
  });
}

test("Settings can still save private name and bio without renaming the player", async t => {
  const page = await mount(t, async body => {
    assert.equal(body.operation, "update");
    return Response.json({ data: null });
  });
  await page.editField(page.container.querySelector("#displayName"), "Updated private name");
  await act(async () => page.save().click());
  assert.equal(page.requests.length, 1);
  assert.deepEqual(page.requests[0].values, {
    username: "original_player", display_name: "Updated private name", bio: "A public bio",
  });
  assert.deepEqual(page.requests[0].filters, [{ column: "id", op: "eq", value: "settings-test-player" }]);
});
