import { z } from "zod";

const newPassword = z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "รหัสผ่านยาวเกินไป");

export const adminPasswordResetSchema = z.object({
  password: newPassword,
  confirmPassword: z.string(),
}).strict().refine((value) => value.password === value.confirmPassword, {
  message: "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน", path: ["confirmPassword"],
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "กรุณาระบุรหัสผ่านปัจจุบัน").max(1024),
  password: newPassword,
  confirmPassword: z.string(),
}).strict().refine((value) => value.password === value.confirmPassword, {
  message: "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน", path: ["confirmPassword"],
}).refine((value) => value.password !== value.currentPassword, {
  message: "รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน", path: ["password"],
});
