import { attendanceMinutesFromRecords } from "@/lib/attendance-calculation";
import { ANNUAL_REPORTS, ACTIVITY_REPORT_STATUSES, STAR_REPORT_TYPES, REDEMPTION_REPORT_STATUSES, annualReportFilterLabel,
  type AnnualReportFilters, type AnnualReportSummary, type ReportCell, type ReportSheet } from "@/lib/annual-report-options";
import type { AnnualReportData } from "@/lib/annual-report-data";

type Person = AnnualReportData["participations"][number]["user"];
const yearStatuses = { DRAFT: "ฉบับร่าง", ACTIVE: "กำลังใช้งาน", CLOSED: "ปิดปีแล้ว" };
const reviews = { PENDING: "รอพิจารณา", APPROVED: "อนุมัติ", REJECTED: "ไม่อนุมัติ" };
const participationStatuses = { REGISTERED: "ลงทะเบียน", ATTENDED: "ผ่านเกณฑ์เวลา", INCOMPLETE: "บันทึกไม่ครบหรือไม่ผ่านเกณฑ์", ABSENT: "ไม่เข้าร่วม" };
const dateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export function reportPersonName(user: Person) {
  return [user.firstname, user.lastname].filter(Boolean).join(" ") || user.username;
}

export function reportDate(value: Date | null | undefined) {
  if (!value) return "";
  return dateFormatter.format(value);
}

export function buildAnnualReport(data: AnnualReportData, filters: AnnualReportFilters, exporter: string, exportId: string) {
  const { year, generatedAt, activities, participations, helpers, stars, redemptions } = data;
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const participationById = new Map(participations.map((p) => [p.id, p]));
  const helperById = new Map(helpers.map((h) => [h.id, h]));
  const redemptionById = new Map(redemptions.map((r) => [r.id, r]));
  const issues: ReportCell[][] = [];
  const issue = (kind: string, reference: string, title: string, user: Person | null, detail: string) => {
    issues.push([kind, reference, title, user?.studentCode ?? "", user ? reportPersonName(user) : "", detail]);
  };
  const people = new Map<bigint, { user: Person; registered: number; checkedIn: number; completed: number; qualified: number; minutes: number; helped: number; yellow: number; green: number; earned: number; spent: number; balance: number; reserved: number }>();
  function person(user: Person) {
    if (!people.has(user.id)) people.set(user.id, { user, registered: 0, checkedIn: 0, completed: 0, qualified: 0, minutes: 0, helped: 0, yellow: 0, green: 0, earned: 0, spent: 0, balance: 0, reserved: 0 });
    return people.get(user.id)!;
  }
  const activityTotals = new Map(activities.map((a) => [a.id, { registered: 0, checkedIn: 0, completed: 0, qualified: 0, minutes: 0 }]));
  const yellowByParticipation = new Map<bigint, number>();
  for (const star of stars) {
    if (star.participationId !== null && star.starType === "YELLOW" && star.status === "APPROVED") {
      yellowByParticipation.set(star.participationId, (yellowByParticipation.get(star.participationId) ?? 0) + star.points);
    }
  }
  const attendanceRows: ReportCell[][] = [];
  const uniqueAttendees = new Set<bigint>();
  for (const p of participations) {
    const activity = activityById.get(p.activityId)!;
    const totals = activityTotals.get(p.activityId)!;
    const student = person(p.user);
    const checkIn = p.attendanceRecords.find((r) => r.eventType === "CHECK_IN");
    const checkOut = p.attendanceRecords.find((r) => r.eventType === "CHECK_OUT");
    const measuredMinutes = attendanceMinutesFromRecords(p.attendanceRecords);
    const countable = activity.status === "PUBLISHED" || activity.status === "COMPLETED";
    const entered = countable && Boolean(checkIn && checkIn.occurredAt <= generatedAt);
    const complete = entered && Boolean(checkOut && checkOut.occurredAt <= generatedAt && measuredMinutes !== null);
    const minutes = complete ? measuredMinutes! : 0;
    const qualified = complete && minutes >= activity.minMinutes;
    student.registered++; totals.registered++;
    if (entered) { student.checkedIn++; totals.checkedIn++; uniqueAttendees.add(p.user.id); }
    if (complete) { student.completed++; totals.completed++; student.minutes += minutes; totals.minutes += minutes; }
    if (qualified) { student.qualified++; totals.qualified++; }
    if (checkOut && !checkIn) issue("เวลาเข้า–ออกไม่ครบ", String(p.id), activity.title, p.user, "มีเช็คเอาท์แต่ไม่มีเช็คอิน");
    if (checkIn && !checkOut && (activity.status === "COMPLETED" || activity.endsAt <= generatedAt)) issue("ขาดเช็คเอาท์", String(p.id), activity.title, p.user, "กิจกรรมถึงกำหนดสิ้นสุดแล้ว แต่ยังไม่มีเวลาออก");
    if (checkIn && checkOut && measuredMinutes === null) issue("ลำดับเวลาไม่ถูกต้อง", String(p.id), activity.title, p.user, "เวลาออกอยู่ก่อนเวลาเข้า");
    if (p.attendanceRecords.some((r) => r.occurredAt > generatedAt)) issue("เวลาในอนาคต", String(p.id), activity.title, p.user, "ไม่นับเวลาในอนาคตในยอดเข้าร่วมจริง");
    if (complete && measuredMinutes !== p.attendedMinutes) issue("เวลาสรุปไม่ตรงกับบันทึก", String(p.id), activity.title, p.user, `จากบันทึก ${measuredMinutes} นาที / ค่าที่บันทึกสรุป ${p.attendedMinutes ?? "ยังไม่มี"}`);
    if (complete && p.eligibilityStatus === "PENDING") issue("ผลประเมินรอพิจารณา", String(p.id), activity.title, p.user, p.reviewNote ?? "มีบันทึกเวลาเข้า–ออกครบ แต่ผลประเมินยังรอพิจารณา");
    if (filters.activityStatus === "all" || activity.status === filters.activityStatus) {
      attendanceRows.push([String(p.id), String(activity.id), activity.title, ACTIVITY_REPORT_STATUSES[activity.status], String(p.user.id), p.user.studentCode ?? "", reportPersonName(p.user),
        participationStatuses[p.status], reportDate(checkIn?.occurredAt), checkIn?.method === "QR" ? "QR" : checkIn ? "ผู้จัดบันทึก" : "",
        reportDate(checkOut?.occurredAt), checkOut?.method === "QR" ? "QR" : checkOut ? "ผู้จัดบันทึก" : "", measuredMinutes,
        activity.minMinutes, qualified ? "ผ่าน" : complete ? "ไม่ผ่าน" : "ยังประเมินไม่ได้", reviews[p.eligibilityStatus], yellowByParticipation.get(p.id) ?? 0,
        p.reviewNote ?? "", countable ? "นับตามบันทึกที่ไม่ใช่อนาคต" : "ไม่นับในยอดเข้าร่วมจริง"]);
    }
  }
  for (const h of helpers) {
    const student = person(h.student);
    if (h.status === "COMPLETED") student.helped++;
  }

  const starRows: ReportCell[][] = [];
  for (const star of stars) {
    const student = person(star.user);
    const activityId = star.participationId !== null ? participationById.get(star.participationId)?.activityId
      : star.helperAssignmentId !== null ? helperById.get(star.helperAssignmentId)?.activityId : undefined;
    const title = activityId !== undefined ? activityById.get(activityId)?.title ?? "" : "";
    if (star.status === "APPROVED") {
      student.balance += star.points;
      if (star.points > 0) {
        student.earned += star.points;
        if (star.starType === "YELLOW") student.yellow += star.points;
        if (star.starType === "GREEN") student.green += star.points;
      }
      if (star.redemptionId !== null && star.points < 0) student.spent += -star.points;
    }
    if (star.status === "PENDING" && star.redemptionId !== null && star.points < 0) student.reserved += -star.points;
    if (star.status === "PENDING" && star.redemptionId === null) issue("ดาวรอพิจารณา", String(star.id), title, star.user, star.reason ?? "รอพิจารณารายการดาว");
    if (filters.starType === "all" || star.starType === filters.starType) {
      starRows.push([String(star.id), String(star.user.id), star.user.studentCode ?? "", reportPersonName(star.user), STAR_REPORT_TYPES[star.starType], star.points,
        reviews[star.status], title, star.participationId === null ? "" : String(star.participationId), star.helperAssignmentId === null ? "" : String(star.helperAssignmentId),
        star.redemptionId === null ? "" : String(star.redemptionId), star.redemptionId === null ? "" : redemptionById.get(star.redemptionId)?.rewardTier.name ?? "",
        star.reason ?? "", star.approver ? reportPersonName(star.approver) : star.approvedAt ? "ระบบอัตโนมัติ" : "", reportDate(star.createdAt), reportDate(star.approvedAt)]);
    }
  }
  for (const r of redemptions) {
    person(r.user);
    if (r.status === "PENDING" || r.status === "APPROVED") issue("คำขอรางวัลค้าง", String(r.id), r.rewardTier.name, r.user, REDEMPTION_REPORT_STATUSES[r.status]);
  }
  for (const a of activities) {
    if (a.endsAt <= generatedAt && (a.status === "DRAFT" || a.status === "PUBLISHED")) {
      issue(a.status === "DRAFT" ? "ฉบับร่างเลยกำหนด" : "กิจกรรมเลยกำหนด", String(a.id), a.title, null,
        a.status === "DRAFT" ? "ยังไม่ได้เปิดรับลงทะเบียน กรุณาแก้เวลาหรือยกเลิก" : "ยังไม่ได้เปลี่ยนสถานะเป็นสิ้นสุดกิจกรรม");
    }
  }
  const students = [...people.values()].sort((a, b) => (a.user.studentCode ?? "").localeCompare(b.user.studentCode ?? "") || reportPersonName(a.user).localeCompare(reportPersonName(b.user), "th"));
  const available = (p: typeof students[number]) => year.status === "CLOSED" ? 0 : Math.max(0, p.balance - p.reserved);
  const summary: AnnualReportSummary = {
    activities: activities.length, registrations: participations.length, uniqueAttendees: uniqueAttendees.size,
    attendanceCount: students.reduce((n, p) => n + p.checkedIn, 0), completedCount: students.reduce((n, p) => n + p.completed, 0),
    qualifiedCount: students.reduce((n, p) => n + p.qualified, 0), minutes: students.reduce((n, p) => n + p.minutes, 0),
    yellowStars: students.reduce((n, p) => n + p.yellow, 0), greenStars: students.reduce((n, p) => n + p.green, 0),
    earned: students.reduce((n, p) => n + p.earned, 0), spent: students.reduce((n, p) => n + p.spent, 0), balance: students.reduce((n, p) => n + p.balance, 0),
    reserved: students.reduce((n, p) => n + p.reserved, 0), available: students.reduce((n, p) => n + available(p), 0), redemptions: redemptions.length, issues: issues.length,
  };
  const overview: ReportCell[][] = [
    ["ปีการศึกษา", year.code], ["สถานะปี", yearStatuses[year.status]], ["ช่วงปีการศึกษา", `${year.startsOn.toISOString().slice(0, 10)} ถึง ${year.endsOn.toISOString().slice(0, 10)}`],
    ["ข้อมูล ณ เวลา (Asia/Bangkok)", reportDate(generatedAt)], ["ผู้ส่งออก", exporter], ["รหัสรายงาน", exportId],
    ["ประเภทรายงาน", ANNUAL_REPORTS.find((option) => option.id === filters.report)!.label], ["ตัวกรองรายละเอียด", annualReportFilterLabel(filters)], ["ขอบเขตภาพรวม", "ทั้งปีการศึกษาที่เลือก ทุกสถานะ"],
    ["กิจกรรมทั้งหมด", summary.activities], ...Object.entries(ACTIVITY_REPORT_STATUSES).map(([key, label]) => [`กิจกรรม: ${label}`, activities.filter((a) => a.status === key).length]),
    ["ลงทะเบียน (คนครั้ง)", summary.registrations], ["ผู้เช็คอิน (คนไม่ซ้ำ)", summary.uniqueAttendees], ["เช็คอิน (คนครั้ง)", summary.attendanceCount],
    ["บันทึกเวลาเข้า–ออกครบ (คนครั้ง)", summary.completedCount], ["ผ่านเกณฑ์เวลา (คนครั้ง)", summary.qualifiedCount], ["เวลาเข้าร่วมจริงรวม (นาที)", summary.minutes],
    ["ดาวเหลืองที่ได้รับอนุมัติ", summary.yellowStars], ["ดาวเขียวที่ได้รับอนุมัติ", summary.greenStars], ["ดาวเพิ่มที่อนุมัติทั้งหมด รวมปรับเพิ่ม", summary.earned],
    ["ดาวที่ใช้แลกรางวัล (อนุมัติ)", summary.spent], ["ยอดคงเหลือตามบัญชีประวัติ", summary.balance], ["ดาวกันไว้สำหรับคำขอรางวัล", summary.reserved],
    ["ดาวที่ใช้แลกได้ในระบบขณะนี้", summary.available], ["คำขอแลกรางวัลทั้งหมด", summary.redemptions], ["รายการที่ต้องตรวจสอบ", summary.issues],
    ["นิยามผู้เข้าร่วม", "นับเช็คอินของกิจกรรมเปิดรับลงทะเบียนหรือสิ้นสุดแล้ว และไม่นับบันทึกเวลาในอนาคต"],
    ["นิยามเวลาเข้าร่วม", "ใช้เวลาเข้า–ออกจริงที่ครบและเรียงลำดับถูกต้อง ไม่นับฉบับร่างและกิจกรรมยกเลิก"],
    ["ผ่านเวลา / ได้รับดาว", "แยกผลผ่านเกณฑ์เวลาออกจากดาวที่ได้รับอนุมัติจริง ดาวเหลืองมีเพดานรายปี"],
    ["ยอดย้อนหลังเมื่อปิดปี", "แสดงยอดบัญชีประวัติไว้ แต่ดาวที่ใช้แลกได้ในระบบเป็นศูนย์เมื่อปิดปี"],
    ["ขอบเขตรายบุคคล", "เฉพาะผู้ที่มีรายการในปีนี้ ไม่ใช่ทะเบียนนิสิตทั้งปี และไม่ใช้ระบุผู้ที่ไม่เข้าร่วมเลย"],
    ["ข้อมูลชื่อบุคคล", "ใช้ชื่อและรหัสบุคคลปัจจุบัน ณ เวลาส่งออก"],
    ["สำเนารายงาน", "ไฟล์เป็นข้อมูล ณ เวลาส่งออก โปรดเก็บไฟล์ฉบับสรุปไว้หลังปิดปี การส่งออกใหม่อาจต่างหากมีการแก้ไขข้อมูล"],
  ];
  const sheets: ReportSheet[] = [
    { id: "overview", name: "ภาพรวมประจำปี", columns: ["รายการ", "ข้อมูล / จำนวน"], rows: overview },
    { id: "activities", name: "สรุปรายกิจกรรม", columns: ["รหัสกิจกรรม", "ชื่อกิจกรรม", "ผู้จัด", "สถานที่", "เริ่ม (เวลาประเทศไทย)", "สิ้นสุด (เวลาประเทศไทย)", "สถานะ", "เกณฑ์ขั้นต่ำ (นาที)", "ลงทะเบียน (คน)", "เช็คอิน (คน)", "เข้า–ออกครบ (คน)", "ผ่านเวลา (คน)", "เวลารวม (นาที)"],
      rows: activities.filter((a) => filters.activityStatus === "all" || a.status === filters.activityStatus).map((a) => {
        const t = activityTotals.get(a.id)!;
        return [String(a.id), a.title, reportPersonName(a.organizer), a.location ?? "", reportDate(a.startsAt), reportDate(a.endsAt), ACTIVITY_REPORT_STATUSES[a.status], a.minMinutes, t.registered, t.checkedIn, t.completed, t.qualified, t.minutes];
      }) },
    { id: "students", name: "สรุปรายบุคคล", columns: ["รหัสบุคคล", "รหัสนิสิต", "ชื่อ–นามสกุล", "ลงทะเบียน (กิจกรรม)", "เช็คอิน (กิจกรรม)", "เข้า–ออกครบ (กิจกรรม)", "ผ่านเวลา (กิจกรรม)", "เวลารวม (นาที)", "งานช่วยเหลือสำเร็จ", "ดาวเหลืองได้รับ", "ดาวเขียวได้รับ", "ดาวเพิ่มอนุมัติทั้งหมด", "ดาวใช้แลกรางวัล", "ยอดบัญชีประวัติ", "ดาวกันไว้", "ดาวใช้แลกได้ขณะนี้"],
      rows: students.map((p) => [String(p.user.id), p.user.studentCode ?? "", reportPersonName(p.user), p.registered, p.checkedIn, p.completed, p.qualified, p.minutes, p.helped, p.yellow, p.green, p.earned, p.spent, p.balance, p.reserved, available(p)]) },
    { id: "attendance", name: "รายละเอียดการเข้าร่วม", columns: ["รหัสลงทะเบียน", "รหัสกิจกรรม", "กิจกรรม", "สถานะกิจกรรม", "รหัสบุคคล", "รหัสนิสิต", "ชื่อ–นามสกุล", "สถานะการเข้าร่วม", "เวลาเข้า (ไทย)", "วิธีเช็คอิน", "เวลาออก (ไทย)", "วิธีเช็คเอาท์", "นาทีจากบันทึก", "เกณฑ์ขั้นต่ำ (นาที)", "ผลเกณฑ์เวลา", "ผลประเมิน", "ดาวเหลืองอนุมัติ", "หมายเหตุประเมิน", "การนับยอดรวม"], rows: attendanceRows },
    { id: "stars", name: "ประวัติรายการดาว", columns: ["รหัสรายการดาว", "รหัสบุคคล", "รหัสนิสิต", "ชื่อ–นามสกุล", "ประเภทดาว", "จำนวนเพิ่ม / ลด", "สถานะ", "กิจกรรม", "รหัสลงทะเบียน", "รหัสงานช่วยเหลือ", "รหัสคำขอรางวัล", "ของรางวัล", "เหตุผล", "ผู้อนุมัติ", "สร้างเมื่อ (ไทย)", "อนุมัติเมื่อ (ไทย)"], rows: starRows },
    { id: "redemptions", name: "การแลกรางวัล", columns: ["รหัสคำขอ", "รหัสบุคคล", "รหัสนิสิต", "ชื่อ–นามสกุล", "รางวัล", "ดาวที่ใช้ต่อคำขอ", "สถานะ", "วันที่ขอ (ไทย)", "วันที่พิจารณา (ไทย)", "วันที่แลก (ไทย)", "วันที่รับของ (ไทย)", "รหัสผู้พิจารณา", "หมายเหตุ"],
      rows: redemptions.filter((r) => filters.redemptionStatus === "all" || r.status === filters.redemptionStatus).map((r) => [String(r.id), String(r.user.id), r.user.studentCode ?? "", reportPersonName(r.user), r.rewardTier.name, r.costPoints, REDEMPTION_REPORT_STATUSES[r.status], reportDate(r.requestedAt), reportDate(r.reviewedAt), reportDate(r.redeemedAt), reportDate(r.completedAt), r.reviewedBy === null ? "" : String(r.reviewedBy), r.note ?? ""]) },
    { id: "issues", name: "รายการที่ต้องตรวจสอบ", columns: ["ประเภท", "รหัสรายการอ้างอิง", "กิจกรรม / รางวัล", "รหัสนิสิต", "ชื่อ–นามสกุล", "รายละเอียด"], rows: issues },
  ];
  return {
    year: { id: String(year.id), code: year.code, status: year.status }, generatedAt: generatedAt.toISOString(), exporter, exportId, filters, summary,
    sheets: sheets.filter((sheet) => filters.report === "all" || sheet.id === "overview" || sheet.id === filters.report),
  };
}

export type AnnualReport = ReturnType<typeof buildAnnualReport>;
