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
