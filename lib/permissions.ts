export const PERMISSIONS = {
  USER_MANAGE: "user.manage",
  ACADEMIC_YEAR_MANAGE: "academic_year.manage",
  ACTIVITY_MANAGE: "activity.manage",
  ATTENDANCE_RECORD: "attendance.record",
  PARTICIPATION_REVIEW: "participation.review",
  STAR_APPROVE: "star.approve",
  REWARD_MANAGE: "reward.manage",
  REWARD_REDEEM: "reward.redeem",
  SURVEY_MANAGE: "survey.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  ADMIN: "ADMIN",
  ORGANIZER: "ORGANIZER",
  STUDENT: "STUDENT",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export type Principal = {
  role?: string | null;
  roles?: string[] | null;
  permissions?: string[] | null;
} | null | undefined;

export function hasRole(principal: Principal, role: RoleName): boolean {
  return Boolean(principal?.roles?.includes(role));
}

export function hasPermission(
  principal: Principal,
  code: PermissionCode,
): boolean {
  return Boolean(principal?.permissions?.includes(code));
}

export function canAccessAdmin(principal: Principal): boolean {
  return hasRole(principal, ROLES.ADMIN);
}

export function dashboardPathFor(principal: Principal): string {
  if (hasRole(principal, ROLES.ADMIN)) return "/admin";
  if (hasPermission(principal, PERMISSIONS.ACTIVITY_MANAGE)) {
    return "/organizer/activities";
  }
  return "/dashboard";
}
