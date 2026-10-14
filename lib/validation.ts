import { z } from "zod";

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)");

const statusEnum = z.enum(["DRAFT", "ACTIVE", "CLOSED"]);

export const academicYearCreateSchema = z
  .object({
    code: z.string().trim().min(1, "กรุณาระบุรหัสปีการศึกษา").max(20),
    startsOn: dateString,
    endsOn: dateString,
    status: statusEnum.optional(),
  })
  .refine((value) => value.startsOn < value.endsOn, {
    message: "วันเริ่มต้นต้องอยู่ก่อนวันสิ้นสุด",
    path: ["endsOn"],
  });

export const academicYearUpdateSchema = z.object({
  code: z.string().trim().min(1).max(20).optional(),
  startsOn: dateString.optional(),
  endsOn: dateString.optional(),
  status: statusEnum.optional(),
});

export const userUpdateSchema = z.object({
  firstname: z.string().trim().nullable().optional(),
  lastname: z.string().trim().nullable().optional(),
  studentCode: z.string().trim().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
  roles: z.array(z.string().trim().min(1)).optional(),
});

const dateTime = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "รูปแบบวันเวลาไม่ถูกต้อง");

const activityStatusEnum = z.enum([
  "DRAFT",
  "PUBLISHED",
  "COMPLETED",
  "CANCELLED",
]);

export const activityCreateSchema = z
  .object({
    title: z.string().trim().min(1, "กรุณาระบุชื่อกิจกรรม").max(191),
    description: z.string().trim().max(5000).nullable().optional(),
    location: z.string().trim().max(191).nullable().optional(),
    startsAt: dateTime,
    endsAt: dateTime,
    minMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    academicYearId: z.string().trim().min(1).optional(),
  })
  .refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
    message: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น",
    path: ["endsAt"],
  });

export const activityUpdateSchema = z.object({
  title: z.string().trim().min(1).max(191).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  location: z.string().trim().max(191).nullable().optional(),
  startsAt: dateTime.optional(),
  endsAt: dateTime.optional(),
  minMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  status: activityStatusEnum.optional(),
});

export const qrSessionCreateSchema = z.object({
  activityId: z.string().trim().min(1, "ไม่พบกิจกรรม"),
  purpose: z.enum(["CHECK_IN", "CHECK_OUT"]),
  ttlMinutes: z.coerce.number().int().min(1).max(240).optional(),
});

export const attendanceScanSchema = z.object({
  token: z.string().trim().min(1, "ไม่พบรหัส QR"),
});

export const attendanceManualSchema = z.object({
  participationId: z.string().trim().min(1, "ไม่พบผู้เข้าร่วม"),
  eventType: z.enum(["CHECK_IN", "CHECK_OUT"]),
  occurredAt: dateTime.optional(),
});

export const bulkParticipantSchema = z.object({
  userIds: z
    .array(z.string().trim().min(1))
    .min(1, "กรุณาเลือกรายชื่ออย่างน้อย 1 คน"),
});

export const bulkAttendanceSchema = z
  .object({
    checkInAt: dateTime.optional(),
    checkOutAt: dateTime.optional(),
  })
  .refine((value) => Boolean(value.checkInAt || value.checkOutAt), {
    message: "กรุณาระบุเวลาอย่างน้อยหนึ่งรายการ",
  });
