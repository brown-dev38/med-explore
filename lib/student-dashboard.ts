import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { canViewStudents, dashboardPathFor, hasRole, ROLES } from "@/lib/permissions";

export type StudentArea = "admin" | "organizer";
export type StudentTarget = { area: StudentArea; id: string };

export async function requireStudentViewer(area: StudentArea) {
  const actor = await requireAuth();
  if (!canViewStudents(actor) || (area === "admin" && !hasRole(actor, ROLES.ADMIN))) {
    redirect("/forbidden");
  }
  return actor;
}

// Every view checks the actor and the target before querying student records.
export const getStudentDashboardContext = cache(async (target?: StudentTarget) => {
  if (!target) {
    const user = await requireAuth();
    if (canViewStudents(user)) redirect(dashboardPathFor(user));
    if (!hasRole(user, ROLES.STUDENT)) redirect("/forbidden");
    return { user, basePath: "/dashboard", readOnly: false };
  }

  await requireStudentViewer(target.area);
  if (!/^[1-9]\d{0,18}$/.test(target.id) || BigInt(target.id) > BigInt("9223372036854775807")) notFound();
  const student = await prisma.user.findFirst({
    where: { id: BigInt(target.id), userRoles: { some: { role: { name: ROLES.STUDENT } } } },
    select: { id: true, username: true, firstname: true, lastname: true, studentCode: true },
  });
  if (!student) notFound();
  const user = {
    id: String(student.id),
    name: [student.firstname, student.lastname].filter(Boolean).join(" ") || student.username,
    studentCode: student.studentCode,
  };
  return { user, basePath: `/${target.area}/students/${user.id}/dashboard`, readOnly: true };
});
