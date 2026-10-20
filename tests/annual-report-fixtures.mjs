export function annualFixture(status = "ACTIVE") {
  const student = { id: 9007199254740993n, username: "student", firstname: '=HYPERLINK("https://example.test","test")', lastname: null, studentCode: "00001234" };
  const other = { id: 2n, username: "another", firstname: "Another", lastname: "Student", studentCode: "00000002" };
  const helper = { id: 3n, username: "helper", firstname: "Helper", lastname: null, studentCode: "00000003" };
  const organizer = { id: 1n, username: "organizer", firstname: "Organizer", lastname: null, studentCode: null };
  const date = (value) => new Date(value);
  const start = date("2025-12-31T23:00:00+07:00");
  const end = date("2026-01-01T01:00:00+07:00");
  const activities = [
    [1n, "COMPLETED"], [2n, "CANCELLED"], [3n, "DRAFT"], [4n, "PUBLISHED"], [5n, "COMPLETED"],
  ].map(([id, activityStatus]) => ({ id, title: `Activity ${id}`, status: activityStatus, location: null, organizer,
    startsAt: start, endsAt: id === 4n ? date("2099-01-01T00:00:00Z") : end, minMinutes: 90 }));
  const attendance = (...times) => times.map(([eventType, occurredAt]) => ({ eventType, occurredAt, method: "QR" }));
  const complete = attendance(["CHECK_IN", start], ["CHECK_OUT", end]);
  const partial = attendance(["CHECK_IN", start]);
  const participations = [
    { id: 11n, activityId: 1n, user: student, attendanceRecords: complete, attendedMinutes: 120 },
    { id: 12n, activityId: 2n, user: student, attendanceRecords: complete, attendedMinutes: 120 },
    { id: 13n, activityId: 4n, user: student, attendanceRecords: partial, attendedMinutes: null },
    { id: 14n, activityId: 5n, user: other, attendanceRecords: partial, attendedMinutes: null },
    { id: 15n, activityId: 1n, user: other, attendanceRecords: attendance(["CHECK_IN", start], ["CHECK_OUT", date("2026-01-01T00:00:00+07:00")]), attendedMinutes: 60 },
  ].map((p) => ({ status: "REGISTERED", eligibilityStatus: "APPROVED", reviewNote: null, ...p }));
  const stars = [
    { id: 1n, starType: "YELLOW", points: 1, participationId: 11n },
    { id: 2n, starType: "GREEN", points: 5 },
    { id: 3n, starType: "ADJUSTMENT", points: 2 },
    { id: 4n, starType: "ADJUSTMENT", points: -3, redemptionId: 21n },
    { id: 5n, starType: "ADJUSTMENT", points: -2, redemptionId: 22n, status: "PENDING" },
    { id: 6n, starType: "GREEN", points: 9, status: "PENDING" },
    { id: 7n, starType: "YELLOW", points: 1, status: "REJECTED", user: other, participationId: 15n, reason: "Below threshold" },
    { id: 8n, starType: "ADJUSTMENT", points: -1 },
  ].map((s) => ({ user: student, status: "APPROVED", reason: null, participationId: null, helperAssignmentId: null, redemptionId: null, createdAt: end, approvedAt: end, approver: organizer, ...s }));
  const redemptions = [[21n, "APPROVED", 3], [22n, "PENDING", 2], [23n, "REJECTED", 99]].map(([id, redemptionStatus, costPoints]) => ({
    id, status: redemptionStatus, costPoints, user: student, rewardTier: { id: 1n, name: "Notebook" },
    requestedAt: end, reviewedAt: null, redeemedAt: null, completedAt: null, reviewedBy: null, note: null,
  }));
  return {
    year: { id: 2n, code: "2569", status, startsOn: date("2025-07-01Z"), endsOn: date("2026-06-30Z") },
    generatedAt: date("2026-10-20T13:00:00+07:00"), activities, participations, stars, redemptions,
    helpers: [{ id: 31n, activityId: 1n, student: other, status: "COMPLETED", description: "Registration desk" },
      { id: 32n, activityId: 1n, student: helper, status: "ASSIGNED", description: "Support" }],
  };
}
