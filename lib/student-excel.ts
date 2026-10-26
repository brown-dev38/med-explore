import "server-only";
import ExcelJS from "exceljs";
import { MAX_STUDENT_IMPORT_BYTES, MAX_STUDENT_IMPORT_ROWS, type StudentImportRow } from "@/lib/green-star-import-schema";

export class StudentExcelError extends Error {}

function studentCodeFromCell(cell: ExcelJS.Cell): string | null {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    const code = String(value);
    return /^0{1,50}$/.test(cell.numFmt) ? code.padStart(cell.numFmt.length, "0") : code;
  }
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("").trim();
  if (typeof value === "object" && "hyperlink" in value) return value.text.trim();
  return null;
}

const headers = new Set(["รหัสนักศึกษา", "รหัสนิสิต", "studentcode", "studentid", "studentnumber", "studentno"]);

export async function readStudentExcel(buffer: ArrayBuffer): Promise<StudentImportRow[]> {
  if (!buffer.byteLength || buffer.byteLength > MAX_STUDENT_IMPORT_BYTES) throw new StudentExcelError("ไฟล์ต้องมีขนาดไม่เกิน 5 MB และไม่เป็นไฟล์ว่าง");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new StudentExcelError("อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ Excel .xlsx ที่ถูกต้อง"); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new StudentExcelError("ไม่พบชีตในไฟล์ Excel");
  if (sheet.rowCount > 10000) throw new StudentExcelError("ชีตมีจำนวนแถวมากเกินไป กรุณาใช้ไฟล์ที่มีเฉพาะรายชื่อที่ต้องการนำเข้า");
  const rows: StudentImportRow[] = [];
  const seen = new Set<string>();
  let first = true;
  sheet.eachRow((row, rowNumber) => {
    const code = studentCodeFromCell(row.getCell(1));
    if (code === "") return;
    if (first && code !== null && headers.has(code.toLowerCase().replace(/[\s_.-]/g, ""))) { first = false; return; }
    first = false;
    if (rows.length >= MAX_STUDENT_IMPORT_ROWS) throw new StudentExcelError(`นำเข้าได้ครั้งละไม่เกิน ${MAX_STUDENT_IMPORT_ROWS} แถว`);
    if (code === null || code.length > 50) {
      rows.push({ row: rowNumber, studentCode: code?.slice(0, 50) ?? "", status: "invalid", message: "รหัสต้องเป็นข้อความหรือตัวเลขจำนวนเต็ม ไม่เกิน 50 ตัวอักษร และไม่ใช่สูตร" });
    } else if (seen.has(code)) {
      rows.push({ row: rowNumber, studentCode: code, status: "duplicate", message: "รหัสซ้ำในไฟล์ จะไม่นำเข้าแถวนี้" });
    } else {
      seen.add(code);
      rows.push({ row: rowNumber, studentCode: code, status: "ready", message: "พร้อมตรวจสอบ" });
    }
  });
  if (!rows.length) throw new StudentExcelError("ไม่พบรหัสนักศึกษาในคอลัมน์ A ของชีตแรก");
  return rows;
}
