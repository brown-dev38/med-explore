import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { loadTypeScript } from "./load-typescript.mjs";

class RewardError extends Error { constructor(message, status) { super(message); this.status = status; } }
const rules = loadTypeScript("../lib/reward-image-rules.ts");
const { normalizeRewardImage, parseRewardBody } = loadTypeScript("../lib/reward-images.ts", {
  "server-only": {}, "@/lib/rewards": { RewardError }, "@/lib/reward-image-rules": rules,
});
const pixels = (width = 10) => sharp({ create: { width, height: 10, channels: 3, background: "red" } });
const multipart = (form) => new Request("https://example.test", { method: "POST", body: form });

test("JPG, PNG and WebP uploads become bounded, metadata-free WebP images", async () => {
  for (const [format, type] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
    const source = await pixels(2000).toFormat(format).withMetadata().toBuffer();
    const image = await normalizeRewardImage(new File([source], `reward.${format}`, { type }));
    const info = await sharp(image.imageData).metadata();
    assert.equal(info.format, "webp");
    assert.equal(info.width, 1600);
    assert.equal(info.exif, undefined);
    assert.equal(image.imageMimeType, "image/webp");
    assert.ok(image.imageUpdatedAt instanceof Date);
  }
});

test("invalid, spoofed, empty and oversized image files are rejected", async () => {
  const jpeg = await pixels().jpeg().toBuffer();
  for (const file of [new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
    new File([jpeg], "fake.png", { type: "image/png" }), new File(["bad"], "bad.jpg", { type: "image/jpeg" }),
    new File([], "empty.png", { type: "image/png" })]) {
    await assert.rejects(normalizeRewardImage(file), (error) => error.status === 400);
  }
  await assert.rejects(normalizeRewardImage(new File([new Uint8Array(rules.MAX_REWARD_IMAGE_BYTES + 1)], "large.jpg", { type: "image/jpeg" })), (error) => error.status === 413);
});

test("multipart supports upload, explicit removal and preserving existing images; JSON remains compatible", async () => {
  const data = { name: "Reward" };
  assert.deepEqual(await parseRewardBody(new Request("https://example.test", { method: "POST", body: JSON.stringify(data) })), { data });
  const form = new FormData();
  form.set("data", JSON.stringify(data));
  assert.deepEqual(await parseRewardBody(multipart(form)), { data });
  form.set("removeImage", "true");
  assert.deepEqual(await parseRewardBody(multipart(form)), { data, image: { imageData: null, imageMimeType: null, imageUpdatedAt: null } });
  form.set("image", new File([await pixels().png().toBuffer()], "reward.png", { type: "image/png" }));
  await assert.rejects(parseRewardBody(multipart(form)), (error) => error.status === 400);
  form.delete("removeImage");
  assert.equal((await parseRewardBody(multipart(form))).image.imageMimeType, "image/webp");
  form.set("image", "not a file");
  await assert.rejects(parseRewardBody(multipart(form)), (error) => error.status === 400);
});

test("multipart stream limit is enforced even without Content-Length", async () => {
  const request = new Request("https://example.test", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: new Uint8Array(rules.MAX_REWARD_IMAGE_BYTES + 65537) });
  assert.equal(request.headers.get("content-length"), null);
  await assert.rejects(parseRewardBody(request), (error) => error.status === 413);
});

test("image endpoint requires a session and returns private WebP bytes only for existing rewards", async () => {
  const bytes = await pixels().webp().toBuffer();
  let row = { imageData: bytes, imageMimeType: "image/webp" };
  let session = null;
  let queries = 0;
  const { GET } = loadTypeScript("../app/api/rewards/[id]/image/route.ts", {
    "@/lib/api": loadTypeScript("../lib/api.ts"),
    "@/lib/dal": { getCurrentUser: async () => session },
    "@/lib/prisma": { prisma: { rewardTier: { findFirst: async (query) => { queries++; assert.equal(query.where.deletedAt, null); return row; } } } },
    "@/lib/reward-validation": loadTypeScript("../lib/reward-validation.ts"),
  });
  const get = (id = "1") => GET(new Request("https://example.test"), { params: Promise.resolve({ id }) });
  assert.equal((await get()).status, 401);
  assert.equal(queries, 0);
  session = { id: "7", roles: ["STUDENT"] };
  assert.equal((await get("bad")).status, 404);
  const result = await get();
  assert.equal(result.headers.get("content-type"), "image/webp");
  assert.match(result.headers.get("cache-control"), /private/);
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  row = null;
  assert.equal((await get()).status, 404);
});
