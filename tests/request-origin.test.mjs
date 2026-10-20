import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadTypeScript } from "./load-typescript.mjs";

const require = createRequire(import.meta.url);
const { isSameOriginRequest } = loadTypeScript("../lib/request-origin.ts");
const request = (headers, url = "http://localhost:3000/api/users/me/password") => new Request(url, { method: "PATCH", headers });

test("origin checks support localhost, LAN, explicit ports and IPv6 without allowing a different port or scheme", () => {
  for (const [origin, host] of [
    ["http://localhost:3000", "localhost:3000"], ["http://127.0.0.1:3000", "127.0.0.1:3000"],
    ["http://192.168.1.49:3000", "192.168.1.49:3000"], ["http://[::1]:3000", "[::1]:3000"],
    ["http://portal.example.test", "portal.example.test:80"],
  ]) assert.equal(isSameOriginRequest(request({ Origin: origin, Host: host })), true);
  assert.equal(isSameOriginRequest(request({ Origin: "http://localhost:3000" })), true);
  assert.equal(isSameOriginRequest(request({ Origin: "https://localhost:3000", Host: "localhost:3000" })), false);
  assert.equal(isSameOriginRequest(request({ Origin: "http://192.168.1.49:3001", Host: "192.168.1.49:3000" })), false);
});

test("Next.js request adapter keeps the public host while constructing an internal URL", () => {
  const { NextRequestAdapter } = require("next/dist/server/web/spec-extension/adapters/next-request");
  const { addRequestMeta } = require("next/dist/server/request-meta");
  const incoming = {
    method: "PATCH", url: "/api/users/me/password",
    headers: { origin: "https://192.168.1.49:3000", host: "192.168.1.49:3000", "x-forwarded-host": "192.168.1.49:3000", "x-forwarded-proto": "https" },
  };
  addRequestMeta(incoming, "initURL", "https://localhost:3000/api/users/me/password");
  const adapted = NextRequestAdapter.fromNodeNextRequest(incoming, new AbortController().signal);
  assert.equal(new URL(adapted.url).hostname, "localhost");
  assert.notEqual(adapted.headers.get("origin"), new URL(adapted.url).origin);
  assert.equal(isSameOriginRequest(adapted), true);
});

test("HTTPS forwarding uses the public origin and rejects both hostile and internal origins", () => {
  const headers = { Host: "internal:3000", "X-Forwarded-Host": "portal.example.test", "X-Forwarded-Proto": "https" };
  assert.equal(isSameOriginRequest(request({ ...headers, Origin: "https://portal.example.test" })), true);
  assert.equal(isSameOriginRequest(request({ ...headers, Origin: "http://internal:3000" })), false);
  assert.equal(isSameOriginRequest(request({ ...headers, Origin: "https://attacker.test" })), false);
  assert.equal(isSameOriginRequest(request({ ...headers, Origin: "https://portal.example.test.attacker.test" })), false);
  assert.equal(isSameOriginRequest(request({ Host: "portal.example.test", "X-Forwarded-Proto": "https", Origin: "https://portal.example.test" })), true);
});

test("missing, opaque, malformed and non-origin URL values are rejected", () => {
  for (const origin of [undefined, "", "null", "bad", "file://", "https://portal.example.test/", "https://portal.example.test/path", "https://portal.example.test?query=1", "https://name:pass@portal.example.test", "https://portal.example.test, https://attacker.test"]) {
    assert.equal(isSameOriginRequest(request({ Host: "portal.example.test", ...(origin === undefined ? {} : { Origin: origin }) })), false);
  }
});

test("ambiguous or malformed forwarded headers fail closed rather than falling back to the internal URL", () => {
  for (const extra of [
    { "X-Forwarded-Host": "" }, { "X-Forwarded-Host": "localhost:3000, attacker.test" },
    { "X-Forwarded-Host": "localhost:3000/path" }, { "X-Forwarded-Host": "name@localhost:3000" },
    { "X-Forwarded-Host": "localhost:3000\\path" }, { "X-Forwarded-Host": "localhost:3000?query=1" },
    { "X-Forwarded-Proto": "https,http" }, { "X-Forwarded-Proto": "javascript" },
  ]) assert.equal(isSameOriginRequest(request({ Host: "localhost:3000", Origin: "http://localhost:3000", ...extra })), false);
});
