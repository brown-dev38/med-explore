import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import dotenv from "dotenv";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { loadTypeScript } from "./load-typescript.mjs";

dotenv.config({ quiet: true });
const db = process.env.DATABASE_URL ? new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) }) : null;
after(async () => { await db?.$disconnect(); });

async function fixture(run) {
  const token = randomUUID();
  const year = await db.academicYear.create({ data: { code: `rw-${token.slice(0, 16)}`, startsOn: new Date("1970-01-01"), endsOn: new Date("1970-12-31"), status: "ACTIVE" } });
  const users = [];
  try {
    for (const [index, roleName] of ["ADMIN", "ORGANIZER", "STUDENT", "STUDENT"].entries()) {
      const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
      const user = await db.user.create({ data: { username: `rw-${token}-${index}`, email: `rw-${token}-${index}@example.test`, userRoles: { create: { roleId: role.id } } } });
      users.push(user);
      if (roleName === "STUDENT") await db.starTransaction.create({ data: { userId: user.id, academicYearId: year.id, starType: "GREEN", status: "APPROVED", points: 12 } });
    }
    const api = loadTypeScript("../lib/rewards.ts", { "server-only": {}, "@/lib/prisma": { prisma: db } });
    const [admin, organizer, student, otherStudent] = users;
    const create = async (changes = {}) => {
      const input = { name: `Reward ${randomUUID()}`, description: "Test fixture", costPoints: 5, stockQuantity: 2, isActive: true, academicYearId: String(year.id), ...changes };
      const result = await api.createReward(input, organizer.id);
      return db.rewardTier.findUniqueOrThrow({ where: { id: BigInt(result.id) } });
    };
    const request = (reward, user = student, requestId = randomUUID()) => api.requestRedemption({ rewardTierId: String(reward.id), expectedCostPoints: reward.costPoints, requestId }, user.id);
    await run({ api, year, admin, organizer, student, otherStudent, create, request });
  } finally {
    // Only remove fixtures created by this test's year and user IDs.
    await db.starTransaction.deleteMany({ where: { academicYearId: year.id } });
    await db.rewardRedemption.deleteMany({ where: { academicYearId: year.id } });
    await db.rewardTier.deleteMany({ where: { academicYearId: year.id } });
    const ids = users.map((user) => user.id);
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.userRole.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.academicYear.delete({ where: { id: year.id } });
  }
}

test("reward images persist atomically, survive ordinary edits, and support replacement and removal", { skip: !db }, async () => fixture(async ({ api, year, admin, organizer }) => {
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).webp().toBuffer();
  const image = { imageData: new Uint8Array(bytes), imageMimeType: "image/webp", imageUpdatedAt: new Date("2026-01-01T00:00:00.000Z") };
  const input = { academicYearId: String(year.id), name: "Image reward", description: null, costPoints: 3, stockQuantity: 4, isActive: false };
  const { id } = await api.createReward(input, organizer.id, image);
  const key = BigInt(id);
  const get = () => db.rewardTier.findUniqueOrThrow({ where: { id: key } });
  assert.deepEqual(Buffer.from((await get()).imageData), bytes);
  const catalog = await api.rewardCatalog(year.id);
  assert.equal(catalog[0].imageUrl, `/api/rewards/${id}/image?v=${image.imageUpdatedAt.getTime()}`);
  assert.equal("imageData" in catalog[0], false);
  const { academicYearId, ...fields } = input;
  const update = { ...fields, name: "Updated", expectedStockQuantity: 4 };
  await api.updateReward(key, update, admin.id);
  assert.deepEqual(Buffer.from((await get()).imageData), bytes);
  const replacement = { ...image, imageUpdatedAt: new Date("2026-01-02T00:00:00.000Z") };
  await assert.rejects(api.updateReward(key, { ...update, expectedStockQuantity: 99 }, admin.id, replacement), (error) => error.status === 409);
  assert.equal((await get()).imageUpdatedAt.getTime(), image.imageUpdatedAt.getTime());
  await api.updateReward(key, update, organizer.id, replacement);
  assert.notEqual((await api.rewardCatalog(year.id))[0].imageUrl, catalog[0].imageUrl);
  await api.updateReward(key, update, admin.id, { imageData: null, imageMimeType: null, imageUpdatedAt: null });
  assert.equal((await get()).imageData, null);
  assert.equal((await get()).imageMimeType, null);
  assert.equal((await api.rewardCatalog(year.id))[0].imageUrl, null);
}));

test("request reserves stars and stock once; approval and delivery preserve the exact charged price", { skip: !db }, async () => fixture(async ({ api, year, admin, organizer, student, create, request }) => {
  const reward = await create();
  const requestId = randomUUID();
  const result = await request(reward, student, requestId);
  const replay = await request(reward, student, requestId);
  assert.equal(result.id, replay.id);
  assert.equal(replay.replayed, true);
  assert.deepEqual(await api.rewardBalance(student.id, year.id), { balance: 12, reserved: 5, available: 7 });
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 1);
  await api.updateReward(reward.id, { name: reward.name, description: null, costPoints: 8, stockQuantity: 1, expectedStockQuantity: 1, isActive: true }, organizer.id);
  await api.reviewRedemption(BigInt(result.id), { status: "APPROVED", note: "Collect from staff" }, admin.id);
  assert.deepEqual(await api.rewardBalance(student.id, year.id), { balance: 7, reserved: 0, available: 7 });
  await api.reviewRedemption(BigInt(result.id), { status: "APPROVED", note: "" }, organizer.id);
  await api.reviewRedemption(BigInt(result.id), { status: "COMPLETED", note: "" }, organizer.id);
  const row = await db.rewardRedemption.findUnique({ where: { id: BigInt(result.id) }, include: { ledgerTransaction: true } });
  assert.equal(row.costPoints, 5);
  assert.equal(row.ledgerTransaction.points, -5);
  assert.equal(row.status, "COMPLETED");
  assert.equal(row.note, "Collect from staff");
  assert.ok(row.completedAt);
}));

test("rejection and student cancellation refund once and cannot be applied to another student's request", { skip: !db }, async () => fixture(async ({ api, year, admin, student, otherStudent, create, request }) => {
  const reward = await create();
  const first = await request(reward);
  await assert.rejects(api.reviewRedemption(BigInt(first.id), { status: "CANCELLED", note: "" }, otherStudent.id), (e) => e.status === 403);
  await api.reviewRedemption(BigInt(first.id), { status: "REJECTED", note: "Unavailable" }, admin.id);
  await api.reviewRedemption(BigInt(first.id), { status: "REJECTED", note: "Unavailable" }, admin.id);
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 2);
  const second = await request(reward);
  await api.reviewRedemption(BigInt(second.id), { status: "CANCELLED", note: "Changed mind" }, student.id);
  assert.deepEqual(await api.rewardBalance(student.id, year.id), { balance: 12, reserved: 0, available: 12 });
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 2);
  await assert.rejects(api.reviewRedemption(BigInt(second.id), { status: "APPROVED", note: "" }, admin.id), (e) => e.status === 409);
}));

test("two students competing for the last reward create exactly one reservation", { skip: !db }, async () => fixture(async ({ api, year, student, otherStudent, create, request }) => {
  const reward = await create({ stockQuantity: 1 });
  const results = await Promise.allSettled([request(reward, student), request(reward, otherStudent)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const failure = results.find((r) => r.status === "rejected").reason;
  assert.equal(failure.status, 409, inspect({ code: failure.code, meta: failure.meta }, { depth: 8 }));
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 0);
  assert.equal(await db.rewardRedemption.count({ where: { academicYearId: year.id } }), 1);
}));

test("one student cannot double-spend stars across concurrent requests for different rewards", { skip: !db }, async () => fixture(async ({ api, year, student, create, request }) => {
  const a = await create({ costPoints: 8 });
  const b = await create({ costPoints: 8 });
  const results = await Promise.allSettled([request(a), request(b)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(await api.rewardBalance(student.id, year.id), { balance: 12, reserved: 8, available: 4 });
}));

test("multiple affordable redemptions in the same year are allowed and stale prices/stock are rejected", { skip: !db }, async () => fixture(async ({ api, admin, create, request }) => {
  const reward = await create();
  const first = await request(reward);
  await api.reviewRedemption(BigInt(first.id), { status: "APPROVED", note: "" }, admin.id);
  await request(reward);
  assert.equal(await db.rewardRedemption.count({ where: { rewardTierId: reward.id } }), 2);
  await assert.rejects(api.updateReward(reward.id, { name: reward.name, description: null, costPoints: 5, stockQuantity: 100, expectedStockQuantity: 2, isActive: true }, admin.id), (e) => e.status === 409);
  await assert.rejects(api.requestRedemption({ rewardTierId: String(reward.id), expectedCostPoints: 1, requestId: randomUUID() }, admin.id), (e) => e.status === 403);
}));

test("pending requests block deletion; used rewards are archived without losing history", { skip: !db }, async () => fixture(async ({ api, admin, create, request, year }) => {
  const reward = await create();
  const redemption = await request(reward);
  await assert.rejects(api.deleteReward(reward.id, admin.id), (e) => e.status === 409);
  await api.reviewRedemption(BigInt(redemption.id), { status: "REJECTED", note: "Withdrawn" }, admin.id);
  assert.equal((await api.deleteReward(reward.id, admin.id)).archived, true);
  assert.ok((await db.rewardTier.findUnique({ where: { id: reward.id } })).deletedAt);
  assert.equal((await api.rewardCatalog(year.id)).length, 0);
  assert.equal((await api.redemptionHistory(year.id)).records.length, 1);
  await assert.rejects(request(reward), (e) => e.status === 409);
}));

test("inactive roles, closed years, stale prices and insufficient stars fail before any reservation", { skip: !db }, async () => fixture(async ({ api, admin, student, create, request, year }) => {
  await assert.rejects(api.createReward({ name: "Forbidden", description: null, academicYearId: String(year.id), costPoints: 1, stockQuantity: 1, isActive: true }, student.id), (e) => e.status === 403);
  const costly = await create({ costPoints: 20 });
  await assert.rejects(request(costly), (e) => e.status === 409);
  const reward = await create();
  await assert.rejects(api.requestRedemption({ rewardTierId: String(reward.id), expectedCostPoints: 1, requestId: randomUUID() }, student.id), (e) => e.status === 409);
  await db.user.update({ where: { id: student.id }, data: { isActive: false } });
  await assert.rejects(request(reward), (e) => e.status === 403);
  await db.user.update({ where: { id: student.id }, data: { isActive: true } });
  await db.academicYear.update({ where: { id: year.id }, data: { status: "CLOSED" } });
  await assert.rejects(request(reward), (e) => e.status === 409);
  assert.equal(await db.rewardRedemption.count({ where: { academicYearId: year.id } }), 0);
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 2);
}));

test("an audit failure rolls back the request, stock and reserved stars together", { skip: !db }, async () => fixture(async ({ create, student, year }) => {
  const reward = await create();
  const prisma = { $transaction: (work, options) => db.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
    if (key === "auditLog") return { create: async () => { throw new Error("AUDIT_FAILED"); } };
    return target[key];
  } })), options) };
  const api = loadTypeScript("../lib/rewards.ts", { "server-only": {}, "@/lib/prisma": { prisma } });
  await assert.rejects(api.requestRedemption({ rewardTierId: String(reward.id), expectedCostPoints: 5, requestId: randomUUID() }, student.id), /AUDIT_FAILED/);
  assert.equal(await db.rewardRedemption.count({ where: { academicYearId: year.id } }), 0);
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 2);
  assert.equal(await db.starTransaction.count({ where: { academicYearId: year.id, redemptionId: { not: null } } }), 0);
}));

test("concurrent identical retries and concurrent reviewers do not reserve or charge twice", { skip: !db }, async () => fixture(async ({ api, year, student, admin, organizer, create, request }) => {
  const reward = await create();
  const requestId = randomUUID();
  const results = await Promise.all([request(reward, student, requestId), request(reward, student, requestId)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(await db.rewardRedemption.count({ where: { academicYearId: year.id } }), 1);
  await Promise.all([
    api.reviewRedemption(BigInt(results[0].id), { status: "APPROVED", note: "" }, admin.id),
    api.reviewRedemption(BigInt(results[0].id), { status: "APPROVED", note: "" }, organizer.id),
  ]);
  assert.deepEqual(await api.rewardBalance(student.id, year.id), { balance: 7, reserved: 0, available: 7 });
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 1);
  assert.equal(await db.auditLog.count({ where: { entityId: BigInt(results[0].id), entityType: "RewardRedemption", action: "reward.approved" } }), 1);
}));

test("stars revoked after reservation cannot be approved into a negative wallet", { skip: !db }, async () => fixture(async ({ api, admin, student, year, create, request }) => {
  const reward = await create();
  const result = await request(reward);
  await db.starTransaction.updateMany({ where: { userId: student.id, academicYearId: year.id, starType: "GREEN" }, data: { points: 2 } });
  await assert.rejects(api.reviewRedemption(BigInt(result.id), { status: "APPROVED", note: "" }, admin.id), (e) => e.status === 409);
  await api.reviewRedemption(BigInt(result.id), { status: "REJECTED", note: "Eligibility changed" }, admin.id);
  assert.deepEqual(await api.rewardBalance(student.id, year.id), { balance: 2, reserved: 0, available: 2 });
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 2);
}));

test("unlimited inventory cannot switch stock modes while reservations remain", { skip: !db }, async () => fixture(async ({ api, admin, student, create, request }) => {
  const reward = await create({ stockQuantity: null });
  const result = await request(reward);
  const input = { name: reward.name, description: null, costPoints: 5, stockQuantity: 3, expectedStockQuantity: null, isActive: true };
  await assert.rejects(api.updateReward(reward.id, input, admin.id), (e) => e.status === 409);
  await api.reviewRedemption(BigInt(result.id), { status: "CANCELLED", note: "" }, student.id);
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, null);
  await api.updateReward(reward.id, input, admin.id);
  assert.equal((await db.rewardTier.findUnique({ where: { id: reward.id } })).stockQuantity, 3);
}));

test("closed rewards remain visible to students but cannot reserve stars or inventory until reopened", { skip: !db }, async () => fixture(async ({ api, admin, student, year, create, request }) => {
  const reward = await create({ isActive: false });
  const catalog = await api.rewardCatalog(year.id);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, String(reward.id));
  assert.equal(catalog[0].isActive, false);
  await assert.rejects(request(reward), (e) => e.status === 409);
  assert.equal(await db.rewardRedemption.count({ where: { academicYearId: year.id } }), 0);
  assert.deepEqual(await api.rewardBalance(student.id, year.id), { balance: 12, reserved: 0, available: 12 });
  await api.updateReward(reward.id, { name: reward.name, description: reward.description, costPoints: 5, stockQuantity: 2, expectedStockQuantity: 2, isActive: true }, admin.id);
  assert.equal((await api.rewardCatalog(year.id))[0].isActive, true);
  await request(reward);
  assert.deepEqual(await api.rewardBalance(student.id, year.id), { balance: 12, reserved: 5, available: 7 });
}));
