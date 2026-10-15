# API Reference

## หลักการตอบกลับ

- สำเร็จ: `{ "success": true, "data": ... }` (HTTP 200/201)
- ผิดพลาด: `{ "message": "..." }` (HTTP 400 / 401 / 403 / 404 / 409 / 500)
- ทุก endpoint ที่ต้องล็อกอินจะตอบ `401` ถ้าไม่มี session
- ค่า `id` ทั้งหมดเป็น **string** (ฐานข้อมูลเป็น BigInt)
- ทุก mutation ของผู้ดูแล/ผู้จัดจะบันทึก `audit_logs`

## Authentication (NextAuth)

| Method | Path | คำอธิบาย |
| --- | --- | --- |
| GET/POST | `/api/auth/[...nextauth]` | handler ของ NextAuth (session, csrf, callback, signout) |

ฝั่ง client ใช้ `lib/auth-client.ts`:
- `signInWithCredentials(username, password, callbackUrl)` — POST `/api/auth/callback/credentials` (relative) แล้วเช็ค `/api/auth/session`
- `signOutClient(callbackUrl)` — POST `/api/auth/signout`
- `fetchSession()` — GET `/api/auth/session`

`GET /api/auth/session` ส่ง `accountStatus` เป็น `ACTIVE`, `SUSPENDED`, `DELETED` หรือ `UNAUTHENTICATED`; เมื่อถูกระงับ/ลบบัญชีจะล้าง `user.id`, บทบาท และสิทธิ์ พร้อมคงเหตุผลเพื่อแสดงข้อความก่อนออกจากระบบ หน้าใช้งานตรวจแบบ `no-store` ทุก 5 วินาทีและเมื่อกลับแท็บ โดยไม่ออกจากระบบเพียงเพราะเครือข่าย/API ขัดข้อง

## สมัครสมาชิก

| Method | Path | สิทธิ์ | Body |
| --- | --- | --- | --- |
| POST | `/api/register` | สาธารณะ (สมัครบัญชีนิสิต) | `{ studentCode, username, email, password, firstname?, lastname? }` |

- รหัสผ่านขั้นต่ำ 6 ตัวอักษร
- บังคับรหัสนิสิตเป็นข้อความที่ไม่ว่างหลังตัดช่องว่าง และยาวไม่เกิน 50 ตัวอักษร; ข้อมูลไม่ถูกต้อง → `400`
- username / email / studentCode ซ้ำ → `409`
- สร้างผู้ใช้พร้อมบทบาท `STUDENT` เท่านั้นใน transaction เดียว; ไม่รับบทบาทจากผู้สมัคร และหากไม่มีบทบาท STUDENT จะไม่สร้างบัญชี
- ผู้จัดกิจกรรมและพนักงานให้ ADMIN เพิ่มผ่าน `/admin/users` (POST `/api/users`)

## ปีการศึกษา (Academic Years)

ต้องมีสิทธิ์ `academic_year.manage`

| Method | Path | Body / Query | หมายเหตุ |
| --- | --- | --- | --- |
| GET | `/api/academic-years` | `?status=DRAFT\|ACTIVE\|CLOSED` | เรียงตาม `startsOn` ใหม่→เก่า |
| POST | `/api/academic-years` | `{ code, startsOn, endsOn, status? }` | `startsOn < endsOn`; รหัสซ้ำ 409; ถ้า `status=ACTIVE` จะปิดปีที่ ACTIVE เดิม |
| GET | `/api/academic-years/[id]` | — | |
| PATCH | `/api/academic-years/[id]` | `{ code?, startsOn?, endsOn?, status? }` | ปีที่ `CLOSED` แก้รายละเอียดไม่ได้ (409) เว้นแต่เปิดใหม่; ตั้ง `ACTIVE` = ปิดปีอื่น |
| DELETE | `/api/academic-years/[id]` | — | เฉพาะบทบาท `ADMIN`; ลบได้ทุกสถานะ พร้อมกิจกรรมและข้อมูลที่ผูกกับปีนั้น โดยเก็บ Audit Log ไว้ |

`startsOn/endsOn` ใช้รูปแบบ `YYYY-MM-DD`

## กิจกรรม (Activities)

| Method | Path | สิทธิ์ | Body / Query |
| --- | --- | --- | --- |
| GET | `/api/activities` | ล็อกอิน | `?status=`, `?academicYearId=` (สำหรับผู้จัดการ) |
| POST | `/api/activities` | `activity.manage` | `{ title, startsAt, endsAt, description?, location?, minMinutes?, academicYearId? }` |
| GET | `/api/activities/[id]` | ล็อกอิน | — |
| PATCH | `/api/activities/[id]` | `activity.manage` | `{ title?, description?, location?, startsAt?, endsAt?, minMinutes?, status? }` |
| DELETE | `/api/activities/[id]` | `ADMIN` หรือ `activity.manage` | ADMIN ลบได้ทุกสถานะพร้อมข้อมูลที่ผูกกับกิจกรรม; ผู้จัดอื่นลบได้เฉพาะ DRAFT ที่ไม่มีผู้เข้าร่วมหรือผู้ช่วยงาน |

- `startsAt/endsAt` เป็น ISO datetime, ต้อง `startsAt < endsAt`
- ถ้าไม่ส่ง `academicYearId` จะผูกกับปีที่ `ACTIVE` (ถ้าไม่มี → 400)
- `GET /api/activities` มุมนิสิต (ไม่มี `activity.manage`) คืนเฉพาะ `PUBLISHED`
- รายการคืนข้อมูลเพิ่ม: `participantCount`, `myParticipation` = `{ id, status, checkInAt, checkOutAt } | null`

### ผู้เข้าร่วม

| Method | Path | สิทธิ์ | Body / Query |
| --- | --- | --- | --- |
| GET | `/api/activities/[id]/participations` | `activity.manage` | รายชื่อผู้ลงทะเบียน + เวลาเช็คอิน/เอาท์ |
| POST | `/api/activities/[id]/participations` | ล็อกอิน / `activity.manage` | ลงทะเบียน **ตัวเอง** (กิจกรรมต้อง `PUBLISHED`) หรือ `{ userId }` เพื่อเพิ่มให้ผู้อื่น (ต้องมี `activity.manage`, ทำได้ทุกสถานะ) |
| POST | `/api/activities/[id]/participants` | `activity.manage` | `{ userIds: string[] }` เพิ่มหลายคนพร้อมกัน (ข้ามคนที่ซ้ำอัตโนมัติ) → `{ added, requested }` |
| GET | `/api/activities/[id]/participants/candidates` | `activity.manage` | `?q=` (เว้นว่าง = คืนทั้งหมด สูงสุด 200 คน) ตัดคนที่ลงทะเบียนแล้ว |
| POST | `/api/activities/[id]/attendance/bulk` | `activity.manage` หรือ `attendance.record` | `{ checkInAt?, checkOutAt? }` ตั้งเวลาให้ผู้ลงทะเบียนทุกคน → `{ participants, updated, skippedCheckOut }` |
| DELETE | `/api/participations/[id]` | เจ้าของ หรือ `activity.manage` | ยกเลิกการลงทะเบียน (ถ้ามีบันทึกเวลาแล้ว → 409) |

## ผู้ใช้งาน (Users)

ต้องมีสิทธิ์ `user.manage`

| Method | Path | Body / Query |
| --- | --- | --- |
| GET | `/api/users` | `?q=&role=&page=&pageSize=` (ค่าเริ่มต้น pageSize 20, สูงสุด 100) |
| POST | `/api/users` | เฉพาะบทบาท `ADMIN`: `{ username, email, password, firstname?, lastname?, studentCode?, roles?, isActive? }` |
| GET | `/api/users/[id]` | — |
| PATCH | `/api/users/[id]` | `{ firstname?, lastname?, studentCode?, isActive?, roles?: string[] }` |
| DELETE | `/api/users/[id]` | เฉพาะ `ADMIN`; ลบบัญชีที่ไม่มีประวัติ พร้อมบทบาทและบันทึก Audit Log |

- `roles` ต้องมีชื่อบทบาทที่รองรับเพียง 1 รายการ เช่น `["STUDENT"]`, `["ORGANIZER"]` หรือ `["ADMIN"]`; รายการว่าง หลายรายการ หรือบทบาทอื่นตอบ `400`; PATCH ที่ไม่ส่ง `roles` จะคงบทบาทเดิม
- `POST` สร้างผู้ใช้พร้อมบทบาท (ค่าเริ่มต้น `STUDENT`) และ Audit Log ใน transaction เดียว; รหัสผ่านอย่างน้อย 6 ตัวอักษร, เก็บ bcrypt hash, คืน DTO โดยไม่คืนรหัสผ่าน/hash, ชื่อผู้ใช้/อีเมล/รหัสนิสิตซ้ำตอบ 409
- การลบกิจกรรม/ปีการศึกษาทำงานพร้อมการลบข้อมูลที่ผูกอยู่และบันทึก Audit Log ใน transaction เดียว; หากขั้นตอนใดล้มเหลว rollback ทั้งชุด และไม่ลบบัญชีผู้ใช้
- ห้ามถอดบทบาท `ADMIN` ออกจากแอดมินคนสุดท้าย (409)
- PATCH: ห้ามปิดใช้งานบัญชีตัวเอง และห้ามปิด/เปลี่ยนบทบาท ADMIN จนไม่เหลือ ADMIN ที่เปิดใช้งาน (`409`); ตรวจจากข้อมูลปัจจุบันใน transaction รวมกรณีส่งเฉพาะ `isActive: false` และไม่นับ ADMIN ที่ปิดใช้งานแล้ว
- GET `/api/users` คืน `activeAdminCount` (จำนวน ADMIN ที่เปิดใช้งานทั้งระบบ ไม่ขึ้นกับตัวกรองหรือหน้าปัจจุบัน) สำหรับล็อก checkbox
- `studentCode` ซ้ำ → 409
- DELETE: ลบบัญชีตัวเอง / ADMIN คนสุดท้ายที่เปิดใช้งาน / บัญชีที่มีประวัติกิจกรรม เวลา ดาว งานผู้ช่วย รางวัล แบบประเมิน QR การตรวจสอบ หรือ Audit Log → `409` พร้อมแนะนำปิดใช้งานแทน; ไม่ลบประวัติหรือข้อมูลของผู้อื่น
- DELETE ทำใน transaction เดียวกับการลบบทบาทและสร้าง `user.delete` Audit Log; เมื่อขั้นตอนใดล้มเหลว rollback ทั้งชุด; ไม่พบบัญชี → `404`
- บัญชีที่ถูกลบหรือปิดใช้งานจะไม่สามารถใช้ JWT session เดิมเข้าถึงข้อมูล/API ได้
- คำค้น `q` ค้นจาก username / email / studentCode / ชื่อ / นามสกุล

## QR Session

| Method | Path | สิทธิ์ | Body |
| --- | --- | --- | --- |
| POST | `/api/qr-sessions` | `activity.manage` | `{ activityId, purpose: "CHECK_IN" \| "CHECK_OUT", ttlMinutes? }` (ค่าเริ่มต้น 15 นาที) |
| DELETE | `/api/qr-sessions/[id]` | `activity.manage` | ปิด (revoke) QR ก่อนหมดเวลา |

`POST` คืนค่า:

```json
{
  "success": true,
  "data": {
    "id": "12",
    "activityId": "5",
    "purpose": "CHECK_IN",
    "expiresAt": "2026-06-01T09:15:00.000Z",
    "token": "สุ่ม 32 ไบต์ (base64url) — คืนครั้งเดียว",
    "scanUrl": "https://192.168.1.49:3000/scan?token=...",
    "qrDataUrl": "data:image/png;base64,..."
  }
}
```

- เซิร์ฟเวอร์เก็บเฉพาะ `sha256(token)` ใน `qr_sessions.token_hash`
- `scanUrl` สร้างจาก origin ของคำขอ (ลำดับ: `Referer` → `x-forwarded-host/host`) เพื่อให้ใช้ได้ทั้ง localhost / LAN / HTTPS

## การบันทึกเวลา (Attendance)

| Method | Path | สิทธิ์ | Body |
| --- | --- | --- | --- |
| POST | `/api/attendance/scan` | ล็อกอิน | `{ token }` |
| POST | `/api/attendance/manual` | `activity.manage` หรือ `attendance.record` | `{ participationId, eventType: "CHECK_IN" \| "CHECK_OUT", occurredAt? }` |
| POST | `/api/activities/[id]/attendance/recalculate` | `activity.manage` | คำนวณนาทีและประเมินดาวจากเวลาเดิมของทุกคน |

การลงเวลาผ่าน QR/รายคน/bulk คำนวณนาทีจากช่วงเข้า–ออกจริงทั้งหมดโดยปัดลง ไม่ตัดตามกำหนดกิจกรรม ผ่าน `minMinutes` แล้วให้ STUDENT ดาวสีเหลือง `APPROVED` 1 ดาว (สูงสุด 12 ต่อปี); การแก้เวลา/เปลี่ยนเกณฑ์/ยกเลิกกิจกรรมจะประเมินใหม่และปรับสถานะดาวเดิมโดยไม่สร้างซ้ำ ทั้งเวลา ผลประเมิน ดาว และ Audit Log อยู่ใน transaction เดียว

คำตอบ scan/manual เพิ่ม `data.evaluation = { attendedMinutes, status, eligibilityStatus, yellowStarPoints, message }`; รายชื่อผู้เข้าร่วมเพิ่ม `attendedMinutes`, `yellowStarPoints`, `reviewNote` เพื่อแสดงนาทีและเหตุผลที่ไม่ได้ดาว กรณีมีเวลาเข้าหรือออกไม่ครบจะยังไม่ให้ดาว

**`/api/attendance/scan`**
- หา `qr_session` ที่ `tokenHash` ตรง, ยังไม่ถูก revoke และ `expiresAt > now` → ไม่เจอ = 400
- ต้องมี `Participation` ของผู้ใช้ในกิจกรรมนั้น → ถ้าไม่มี ตอบ `400` พร้อม:
  ```json
  { "message": "คุณยังไม่ได้ลงทะเบียนกิจกรรมนี้", "code": "NOT_REGISTERED",
    "activity": { "id": "5", "title": "...", "status": "PUBLISHED" } }
  ```
- บันทึกเป็น `method: "QR"`, `occurredAt = now`
- ซ้ำ (มี event เดียวกันอยู่แล้ว) → `409`
- `CHECK_OUT` ก่อนมี `CHECK_IN` → `400`

**`/api/attendance/manual`** (ใช้ทั้งเพิ่มและแก้ไขเวลา)
- ไม่มีข้อมูลเดิม → สร้างใหม่ (201, `method: "ORGANIZER"`)
- มีข้อมูลเดิม → **อัปเดตเวลา** (200) โดยคง `method` เดิมไว้
- `CHECK_OUT` ก่อนมี `CHECK_IN` → `400`

## รหัสสถานะที่พบบ่อย

| สถานะ | ความหมาย |
| --- | --- |
| 400 | ข้อมูลไม่ถูกต้อง / เงื่อนไขทางธุรกิจไม่ผ่าน (เช่น ยังไม่เปิดรับลงทะเบียน, QR หมดอายุ) |
| 401 | ยังไม่ล็อกอิน |
| 403 | ไม่มีสิทธิ์ |
| 404 | ไม่พบข้อมูล |
| 409 | ข้อมูลซ้ำ / สถานะขัดแย้ง (ลงทะเบียนซ้ำ, สแกนซ้ำ, ลบปีที่ไม่ใช่ DRAFT) |
| 500 | ข้อผิดพลาดเซิร์ฟเวอร์ |
