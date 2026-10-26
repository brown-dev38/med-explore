import { z } from "zod";

export const MAX_STUDENT_IMPORT_ROWS = 500;
export const MAX_STUDENT_IMPORT_BYTES = 5 * 1024 * 1024;

const databaseId = z.string().regex(/^[1-9]\d{0,18}$/)
  .refine((value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807"));

export const greenStarImportTargetSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("work"), academicYearId: databaseId }),
  z.object({ mode: z.literal("activity"), academicYearId: databaseId, activityId: databaseId }),
]);

export const greenStarImportSchema = z.object({
  target: greenStarImportTargetSchema,
  studentCodes: z.array(z.string().trim().min(1).max(50)).min(1, "ไม่มีรายชื่อที่นำเข้าได้").max(MAX_STUDENT_IMPORT_ROWS)
    .refine((codes) => new Set(codes).size === codes.length, "มีรหัสนักศึกษาซ้ำ กรุณาตรวจสอบรายชื่อ"),
  description: z.string().trim().max(1000),
  requestId: z.uuid(),
}).refine((input) => input.target.mode !== "work" || input.description.length > 0, {
  message: "กรุณาระบุงานที่ช่วยเหลือ", path: ["description"],
});

export type GreenStarImportTarget = z.infer<typeof greenStarImportTargetSchema>;
export type GreenStarImportInput = z.infer<typeof greenStarImportSchema>;
export type StudentImportRow = {
  row: number;
  studentCode: string;
  name?: string;
  status: "ready" | "invalid" | "duplicate" | "not-found" | "assigned";
  message: string;
};
