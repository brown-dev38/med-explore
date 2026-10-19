import { z } from "zod";

export const rewardIdSchema = z.string().regex(/^[1-9]\d{0,18}$/, "รหัสไม่ถูกต้อง")
  .refine((value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807"), "รหัสไม่ถูกต้อง");
const stock = z.number().int().min(0, "จำนวนคงเหลือต้องไม่ติดลบ").max(1000000).nullable();
const rewardFields = {
  name: z.string().trim().min(1, "กรุณาระบุชื่อรางวัล").max(100),
  description: z.string().trim().max(2000).nullable(),
  costPoints: z.number().int().min(1, "ต้องใช้ดาวอย่างน้อย 1 ดวง").max(1000000),
  stockQuantity: stock,
  isActive: z.boolean(),
};
export const rewardCreateSchema = z.object({ ...rewardFields, academicYearId: rewardIdSchema });
export const rewardUpdateSchema = z.object({ ...rewardFields, expectedStockQuantity: stock });
export const redemptionCreateSchema = z.object({ rewardTierId: rewardIdSchema, requestId: z.uuid(), expectedCostPoints: z.number().int().min(1).max(1000000) });
export const redemptionReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"]),
  note: z.string().trim().max(1000).default(""),
}).refine((value) => value.status !== "REJECTED" || value.note.length > 0, {
  message: "กรุณาระบุเหตุผลที่ไม่อนุมัติ", path: ["note"],
});
export type RewardCreateInput = z.infer<typeof rewardCreateSchema>;
export type RewardUpdateInput = z.infer<typeof rewardUpdateSchema>;
export type RedemptionCreateInput = z.infer<typeof redemptionCreateSchema>;
export type RedemptionReviewInput = z.infer<typeof redemptionReviewSchema>;
