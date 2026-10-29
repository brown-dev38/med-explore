export const PRODUCTION_PERMISSIONS = [
  { code: "user.manage", description: "จัดการผู้ใช้งานและบทบาท" },
  { code: "academic_year.manage", description: "จัดการปีการศึกษา" },
  { code: "activity.manage", description: "สร้างและแก้ไขกิจกรรม" },
  { code: "attendance.record", description: "บันทึกการเข้า-ออกกิจกรรม" },
  { code: "participation.review", description: "ตรวจสอบการเข้าร่วมกิจกรรม" },
  { code: "star.approve", description: "อนุมัติการให้ดาว" },
  { code: "reward.manage", description: "จัดการของรางวัล" },
  { code: "reward.redeem", description: "แลกของรางวัล" },
  { code: "survey.manage", description: "จัดการแบบประเมิน" },
  { code: "audit.view", description: "ดูบันทึกการใช้งานระบบ" },
];

export const PRODUCTION_ROLES = [
  { name: "ADMIN", description: "ผู้ดูแลระบบ", permissions: PRODUCTION_PERMISSIONS.map((permission) => permission.code) },
  { name: "ORGANIZER", description: "ผู้จัดกิจกรรม", permissions: ["academic_year.manage", "activity.manage", "attendance.record", "participation.review", "star.approve", "reward.manage", "survey.manage"] },
  { name: "STUDENT", description: "นิสิตผู้เข้าร่วมกิจกรรม", permissions: ["reward.redeem"] },
];

const BOOTSTRAP_PLACEHOLDER = /^(?:change[-_ ]?me|replace(?:[-_ ]?me)?(?:[-_ ]|$)|your[-_ ](?:username|email|password))/i;

/** Validate before opening a database connection. Never include values in errors. */
export function productionBootstrapInput(environment) {
  if (environment.NODE_ENV !== "production") throw new Error("Production bootstrap requires NODE_ENV=production.");
  if (!environment.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required.");
  const username = environment.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const email = environment.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = environment.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || username.length > 191 || BOOTSTRAP_PLACEHOLDER.test(username)) throw new Error("Set BOOTSTRAP_ADMIN_USERNAME (1–191 characters); placeholders are not accepted.");
  if (!email || email.length > 191 || BOOTSTRAP_PLACEHOLDER.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set a valid BOOTSTRAP_ADMIN_EMAIL; placeholders are not accepted.");
  if (typeof password !== "string" || password.trim().length < 16 || Buffer.byteLength(password, "utf8") > 72 || BOOTSTRAP_PLACEHOLDER.test(password.trim())) {
    throw new Error("Set a unique BOOTSTRAP_ADMIN_PASSWORD with at least 16 characters and at most 72 UTF-8 bytes; placeholders are not accepted.");
  }
  return { username, email, password };
}

/** Run only against the intended production database after migrations. */
export async function bootstrapProduction(prisma, input, hashPassword) {
  return prisma.$transaction(async (tx) => {
    const matchingUsers = await tx.user.findMany({
      where: { OR: [{ username: input.username }, { email: input.email }] },
      include: { userRoles: { include: { role: true } } },
    });
    const existing = matchingUsers[0];
    if (matchingUsers.length > 1 || (existing && (existing.username !== input.username || existing.email.toLowerCase() !== input.email))) {
      throw new Error("Bootstrap username/email conflicts with an existing account. No accounts were changed.");
    }
    if (existing && (!existing.isActive || !existing.passwordHash || existing.userRoles.length !== 1 || existing.userRoles[0].role.name !== "ADMIN")) {
      throw new Error("Existing account is not an active ADMIN with a password. Bootstrap never changes its role, status or password.");
    }

    const permissionIds = new Map();
    for (const permission of PRODUCTION_PERMISSIONS) {
      const stored = await tx.permission.upsert({ where: { code: permission.code }, update: { description: permission.description }, create: permission });
      permissionIds.set(permission.code, stored.id);
    }
    let adminRoleId;
    for (const role of PRODUCTION_ROLES) {
      const stored = await tx.role.upsert({ where: { name: role.name }, update: { description: role.description }, create: { name: role.name, description: role.description } });
      if (role.name === "ADMIN") adminRoleId = stored.id;
      for (const code of role.permissions) {
        const permissionId = permissionIds.get(code);
        await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: stored.id, permissionId } }, update: {}, create: { roleId: stored.id, permissionId } });
      }
    }
    if (existing) return { created: false };
    if (!adminRoleId) throw new Error("ADMIN role initialization failed.");

    const passwordHash = await hashPassword(input.password, 12);
    const created = await tx.user.create({ data: {
      username: input.username, email: input.email, passwordHash, isActive: true,
      userRoles: { create: { roleId: adminRoleId } },
    } });
    await tx.auditLog.create({ data: {
      actorId: created.id, action: "user.bootstrap", entityType: "User", entityId: created.id,
      details: { roles: ["ADMIN"], isActive: true },
    } });
    return { created: true };
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
