export type ActivityStatus = "DRAFT" | "PUBLISHED" | "COMPLETED" | "CANCELLED";

export type ParticipationStatus =
  | "REGISTERED"
  | "ATTENDED"
  | "INCOMPLETE"
  | "ABSENT";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AttendanceEvent = "CHECK_IN" | "CHECK_OUT";

export type AttendanceMethod = "QR" | "ORGANIZER";

export type QrPurpose = "CHECK_IN" | "CHECK_OUT";

export type AttendanceRecordDto = {
  id: string;
  eventType: AttendanceEvent;
  method: AttendanceMethod;
  occurredAt: string;
};

export type ActivityDto = {
  id: string;
  academicYearId: string;
  organizerId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  minMinutes: number;
  status: ActivityStatus;
  createdAt: string;
};

export type ActivityListItem = ActivityDto & {
  participantCount: number;
  myParticipation: {
    id: string;
    status: ParticipationStatus;
    checkInAt: string | null;
    checkOutAt: string | null;
  } | null;
};

export type ParticipationDto = {
  id: string;
  activityId: string;
  userId: string;
  userName: string;
  studentCode: string | null;
  email: string;
  status: ParticipationStatus;
  eligibilityStatus: ReviewStatus;
  attendedMinutes: number | null;
  yellowStarPoints: number;
  reviewNote: string | null;
  createdAt: string;
  attendance: AttendanceRecordDto[];
};

export type QrSessionDto = {
  id: string;
  activityId: string;
  purpose: QrPurpose;
  expiresAt: string;
  token: string;
  scanUrl: string;
  qrDataUrl: string;
};

export type HelperStatus = "ASSIGNED" | "COMPLETED" | "CANCELLED";
export type StarType = "YELLOW" | "GREEN" | "ADJUSTMENT";
export type TransactionStatus = "PENDING" | "APPROVED" | "REJECTED";

export type HelperAssignmentDto = {
  id: string;
  activityId: string;
  userId: string;
  userName: string;
  studentCode: string | null;
  email: string;
  assignedBy: string;
  status: HelperStatus;
  description: string | null;
  completedAt: string | null;
  greenStarAwarded: boolean;
  greenStarPoints: number;
  createdAt: string;
};

export type StudentStarSummaryDto = {
  yellowStars: number;
  greenStars: number;
  totalStars: number;
  academicYearCode: string | null;
  targetTier: {
    name: string;
    targetStars: number;
    remaining: number;
  } | null;
  activitiesCount: number;
  helpersCount: number;
};

