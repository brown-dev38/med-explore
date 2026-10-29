import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { loadTypeScript } from "./load-typescript.mjs";

const { stylesheetRecoveryScript } = loadTypeScript("../lib/stylesheet-recovery.ts");

function browser({ readyState = "loading", links = [] } = {}) {
  const listeners = new Map();
  class Link {
    constructor(href, sheet = null) {
      this.href = href;
      this.rel = "stylesheet";
      this.disabled = false;
      this.sheet = sheet;
      this.attributes = new Map();
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
  }
  const elements = links.map(([href, sheet]) => new Link(href, sheet));
  const document = {
    readyState,
    addEventListener: (name, handler) => listeners.set(name, handler),
    querySelectorAll: () => elements,
  };
  runInNewContext(stylesheetRecoveryScript, {
    WeakMap, URL, HTMLLinkElement: Link, document,
    location: new URL("https://example.test/"),
  });
  return { elements, fail: (target) => listeners.get("error")({ target }), ready: () => listeners.get("DOMContentLoaded")() };
}

test("failed app CSS retries without navigating, preserves deployment parameters and stops after two attempts", () => {
  const ui = browser({ links: [["https://example.test/_next/static/chunks/app.css?dpl=build-1"]] });
  const [link] = ui.elements;
  ui.fail(link);
  assert.equal(new URL(link.href).searchParams.get("__css_retry"), "1");
  assert.equal(new URL(link.href).searchParams.get("dpl"), "build-1");
  assert.equal(link.attributes.get("blocking"), "render");
  ui.ready();
  assert.equal(new URL(link.href).searchParams.get("__css_retry"), "1");
  ui.fail(link);
  assert.equal(new URL(link.href).searchParams.get("__css_retry"), "2");
  const lastHref = link.href;
  ui.fail(link);
  assert.equal(link.href, lastHref);
});

test("CSS that failed before the script ran recovers even if the browser exposes an unreadable sheet", () => {
  const failedSheet = { get cssRules() { throw new Error("Stylesheet failed to load"); } };
  for (const readyState of ["loading", "complete"]) {
    const ui = browser({ readyState, links: [
      ["https://example.test/_next/static/chunks/global.css", failedSheet],
      ["https://example.test/_next/static/chunks/page.css", null],
      ["https://example.test/_next/static/chunks/loaded.css", { cssRules: [] }],
    ] });
    if (readyState === "loading") ui.ready();
    assert.ok(ui.elements[0].href.endsWith("?__css_retry=1"));
    assert.ok(ui.elements[1].href.endsWith("?__css_retry=1"));
    assert.ok(ui.elements[2].href.endsWith("loaded.css"));
  }
});

test("recovery ignores external assets, scripts, non-Next stylesheets and disabled sheets", () => {
  const ui = browser({ links: [
    ["https://cdn.example.test/_next/static/remote.css"],
    ["https://example.test/_next/static/app.js"],
    ["https://example.test/custom.css"],
    ["https://example.test/_next/static/disabled.css"],
  ] });
  ui.elements[3].disabled = true;
  const before = ui.elements.map((link) => link.href);
  for (const link of ui.elements) ui.fail(link);
  ui.fail({ rel: "stylesheet" });
  ui.ready();
  assert.deepEqual(ui.elements.map((link) => link.href), before);
});
