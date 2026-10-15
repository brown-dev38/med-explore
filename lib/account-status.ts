import { prisma } from "@/lib/prisma";

export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DELETED" | "UNAUTHENTICATED";

export async function getAccountStatus(id: unknown): Promise<AccountStatus> {
  if (typeof id !== "string" || !/^\d+$/.test(id)) return "UNAUTHENTICATED";
  const user = await prisma.user.findUnique({ where: { id: BigInt(id) }, select: { isActive: true } });
  if (!user) return "DELETED";
  return user.isActive ? "ACTIVE" : "SUSPENDED";
}

export async function isActiveAccount(id: unknown): Promise<boolean> {
  return (await getAccountStatus(id)) === "ACTIVE";
}
