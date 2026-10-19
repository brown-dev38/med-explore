import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import jsQR from "jsqr";
import { loadTypeScript } from "./load-typescript.mjs";

test("saved high-resolution check-in and checkout PNGs decode to the exact live scan URL", async () => {
  const qr = loadTypeScript("../lib/qr.ts", { "server-only": {} });
  for (const purpose of ["CHECK_IN", "CHECK_OUT"]) {
    let created;
    const { POST } = loadTypeScript("../app/api/qr-sessions/route.ts", {
      "@/lib/prisma": { prisma: {
        activity: { findUnique: async () => ({ id: 4n }) },
        qrSession: { create: async ({ data }) => { created = data; return { id: 9n, ...data }; } },
      } },
      "@/lib/dal": { getCurrentUser: async () => ({ id: "1", roles: ["ADMIN"], permissions: [] }) },
      "@/lib/permissions": loadTypeScript("../lib/permissions.ts"),
      "@/lib/validation": loadTypeScript("../lib/validation.ts"),
      "@/lib/api": loadTypeScript("../lib/api.ts"),
      "@/lib/audit": { recordAudit: async () => {} }, "@/lib/qr": qr,
    });
    const response = await POST(new Request("https://example.test/api/qr-sessions", {
      method: "POST", body: JSON.stringify({ activityId: "4", purpose, ttlMinutes: 15 }),
    }));
    assert.equal(response.status, 201);
    const { data } = await response.json();
    assert.equal(data.purpose, purpose);
    assert.ok(data.qrDataUrl.startsWith("data:image/png;base64,"));
    const png = Buffer.from(data.qrDataUrl.split(",")[1], "base64");
    const pixels = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(pixels.info.width, 1024);
    assert.equal(pixels.info.height, 1024);
    const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.info.width, pixels.info.height);
    assert.ok(decoded, `${purpose} PNG must remain scannable`);
    assert.equal(decoded.data, data.scanUrl);
    const url = new URL(decoded.data);
    assert.equal(url.origin, "https://example.test");
    assert.equal(url.pathname, "/scan");
    assert.equal(url.searchParams.get("token"), data.token);
    assert.equal(created.tokenHash, qr.hashQrToken(data.token));
    assert.equal(created.purpose, purpose);
  }
});
