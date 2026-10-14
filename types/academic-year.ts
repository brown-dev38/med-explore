export type AcademicYearStatus = "DRAFT" | "ACTIVE" | "CLOSED";

export type AcademicYearDto = {
  id: string;
  code: string;
  startsOn: string;
  endsOn: string;
  status: AcademicYearStatus;
  createdAt: string;
};
