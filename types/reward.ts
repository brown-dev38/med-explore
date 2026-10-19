export type RewardDto = {
  id: string;
  academicYearId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  costPoints: number;
  stockQuantity: number | null;
  isActive: boolean;
  pendingQuantity: number;
};

export type RewardBalance = { balance: number; reserved: number; available: number };
export type RedemptionStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELLED";
export type RedemptionDto = {
  id: string;
  rewardName: string;
  studentName: string;
  studentCode: string | null;
  costPoints: number;
  status: RedemptionStatus;
  requestedAt: string;
  reviewedAt: string | null;
  note: string | null;
};
export const redemptionLabels: Record<RedemptionStatus, string> = {
  PENDING: "รออนุมัติ", APPROVED: "อนุมัติแล้ว / รอรับรางวัล", REJECTED: "ไม่อนุมัติ",
  COMPLETED: "รับรางวัลแล้ว", CANCELLED: "ยกเลิกแล้ว",
};
