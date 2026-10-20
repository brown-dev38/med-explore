import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { MICROSOFT_LINK_LIFETIME, type MicrosoftIdentity } from "@/lib/microsoft-config";

export class MicrosoftAccountError extends Error {
  constructor(public code: "password" | "expired" | "in-use" | "already-linked" | "unavailable", public status: number) { super(code); }
}

export const authUserRelations = { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } as const;
const hashIntent = (token: string) => createHash("sha256").update(token).digest("hex");

export async function findMicrosoftAccount(identity: MicrosoftIdentity) {
  return prisma.microsoftAccount.findUnique({ where: { tenantId_objectId: { tenantId: identity.tenantId, objectId: identity.objectId } }, include: { user: { include: authUserRelations } } });
}

export async function microsoftSessionIsLinked(accountId: string, userId: string) {
  if (!/^[1-9]\d{0,18}$/.test(accountId) || !/^[1-9]\d{0,18}$/.test(userId)) return false;
  return Boolean(await prisma.microsoftAccount.findFirst({ where: { id: BigInt(accountId), userId: BigInt(userId) }, select: { id: true } }));
}

export async function prepareMicrosoftLink(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: BigInt(userId) }, select: { isActive: true, passwordHash: true } });
  if (!user?.isActive || !user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) throw new MicrosoftAccountError("password", 403);
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.microsoftAccount.findUnique({ where: { userId: BigInt(userId) }, select: { id: true } });
    if (existing) throw new MicrosoftAccountError("already-linked", 409);
    await tx.microsoftLinkIntent.deleteMany({ where: { OR: [{ userId: BigInt(userId) }, { expiresAt: { lte: new Date() } }] } });
    await tx.microsoftLinkIntent.create({ data: { id: hashIntent(token), userId: BigInt(userId), expiresAt: new Date(Date.now() + MICROSOFT_LINK_LIFETIME * 1000) } });
  });
  return token;
}

export async function completeMicrosoftLink(token: string, userId: string, identity: MicrosoftIdentity) {
  if (!/^[\w-]{43}$/.test(token)) throw new MicrosoftAccountError("expired", 400);
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: BigInt(userId) }, select: { isActive: true } });
      if (!user?.isActive) throw new MicrosoftAccountError("expired", 403);
      const consumed = await tx.microsoftLinkIntent.deleteMany({ where: { id: hashIntent(token), userId: BigInt(userId), expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) throw new MicrosoftAccountError("expired", 400);
      const existing = await tx.microsoftAccount.findUnique({ where: { tenantId_objectId: { tenantId: identity.tenantId, objectId: identity.objectId } } });
      if (existing && existing.userId !== BigInt(userId)) throw new MicrosoftAccountError("in-use", 409);
      const mine = await tx.microsoftAccount.findUnique({ where: { userId: BigInt(userId) } });
      if (mine && (mine.tenantId !== identity.tenantId || mine.objectId !== identity.objectId)) throw new MicrosoftAccountError("already-linked", 409);
      if (!mine) await tx.microsoftAccount.create({ data: { userId: BigInt(userId), ...identity } });
      await tx.auditLog.create({ data: { actorId: BigInt(userId), action: "auth.microsoft.link", entityType: "User", entityId: BigInt(userId), details: { tenantId: identity.tenantId, objectId: identity.objectId } } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (["P2002", "P2034"].includes((error as { code?: string }).code ?? "")) throw new MicrosoftAccountError("in-use", 409);
    throw error;
  }
}

export async function unlinkMicrosoftAccount(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: BigInt(userId) }, select: { isActive: true, passwordHash: true } });
  if (!user?.isActive || !user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) throw new MicrosoftAccountError("password", 403);
  await prisma.$transaction(async (tx) => {
    await tx.microsoftAccount.deleteMany({ where: { userId: BigInt(userId) } });
    await tx.microsoftLinkIntent.deleteMany({ where: { userId: BigInt(userId) } });
    await tx.auditLog.create({ data: { actorId: BigInt(userId), action: "auth.microsoft.unlink", entityType: "User", entityId: BigInt(userId) } });
  });
}
