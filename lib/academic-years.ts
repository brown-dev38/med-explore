import "server-only";
import type { AcademicYear } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AcademicYearDto } from "@/types/academic-year";

export type { AcademicYearDto } from "@/types/academic-year";

export function toAcademicYearDto(year: AcademicYear): AcademicYearDto {
  return {
    id: String(year.id),
    code: year.code,
    startsOn: year.startsOn.toISOString().slice(0, 10),
    endsOn: year.endsOn.toISOString().slice(0, 10),
    status: year.status,
    createdAt: year.createdAt.toISOString(),
  };
}

export async function setActiveAcademicYear(id: bigint): Promise<AcademicYear> {
  return prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({
      where: { status: "ACTIVE", id: { not: id } },
      data: { status: "CLOSED" },
    });
    return tx.academicYear.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
  });
}
