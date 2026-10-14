# MedExplore Star — เอกสารระบบ

ระบบสะสมดาวและแลกของรางวัลกิจกรรม **MedExplore Star** (Next.js 16 + Prisma + MySQL)

> เอกสารชุดนี้อธิบายสิ่งที่พัฒนาแล้วในโค้ดจริงของโปรเจกต์
> เอกสารความต้องการตั้งต้นของโครงการอยู่ใน [`Flow.md`](./Flow.md) และ ER diagram ใน [`er-diagram.drawio`](./er-diagram.drawio)

## สารบัญ

| ไฟล์ | เนื้อหา |
| --- | --- |
| [architecture.md](./architecture.md) | สถาปัตยกรรม เทคโนโลยี โครงสร้างโปรเจกต์, auth/RBAC, ข้อจำกัด cacheComponents |
| [database.md](./database.md) | โมเดลฐานข้อมูล, enum, migration, seed, บัญชีทดสอบ |
| [api-reference.md](./api-reference.md) | รายการ API ทั้งหมด (สิทธิ์, payload, สถานะตอบกลับ) |
| [features.md](./features.md) | ฟีเจอร์และลำดับการทำงาน (แดชบอร์ด, กิจกรรม, QR, บันทึกเวลา ฯลฯ) |
| [operations.md](./operations.md) | การตั้งค่า/รันโปรเจกต์, env, HTTPS, ทดสอบผ่าน LAN/มือถือ |

## ภาพรวมสิ่งที่พัฒนาแล้ว

- **ฐานข้อมูล + Schema**: MySQL + Prisma 7 (mariadb adapter) พร้อม migration และ seed
- **Authentication**: NextAuth (Credentials) + bcrypt, session แบบ JWT
- **RBAC**: บทบาท `ADMIN` / `ORGANIZER` / `STUDENT` + สิทธิ์ราย `permission code`
- **แดชบอร์ด 3 บทบาท** พร้อม sidebar (ผู้ดูแลระบบ / ผู้จัดกิจกรรม / นิสิต)
- **จัดการปีการศึกษา**: สร้าง/แก้ไข/เปิดใช้งาน/ปิด (มี ACTIVE ได้ทีละปี)
- **จัดการผู้ใช้งาน**: ค้นหา แก้โปรไฟล์ มอบ/ถอดบทบาท เปิด-ปิดบัญชี
- **กิจกรรม + การเข้างาน**:
  - สร้างกิจกรรม/กำหนดช่วงเวลา, วงจรสถานะ DRAFT → PUBLISHED → COMPLETED/CANCELLED
  - ลงทะเบียนผู้เข้าร่วม (นิสิตลงเอง หรือ ผู้จัด/แอดมินเพิ่มให้แบบเดี่ยว/หลายคน)
  - QR Check-in / Check-out (มีเวลานับถอยหลัง + ปิด QR ได้) และสแกนด้วยกล้องในแอป
  - บันทึกเวลาแทน: เพิ่ม/แก้ไขเวลารายคน และตั้งเวลาให้ผู้ลงทะเบียนทุกคนพร้อมกัน
  - กันบันทึกซ้ำด้วย unique constraint + บันทึก Audit Log ทุกการเปลี่ยนแปลง

## Quick start

```bash
npm install
npx prisma migrate deploy     # หรือ npm run db:migrate ตอนพัฒนา
npm run db:seed               # สร้าง roles/permissions และบัญชีทดสอบ
npm run dev                   # http://localhost:3000
```

บัญชีทดสอบเริ่มต้น (ดูรายละเอียดใน [database.md](./database.md#บัญชีทดสอบ-seed)):

| บทบาท | ชื่อผู้ใช้ | รหัสผ่าน |
| --- | --- | --- |
| ADMIN | `admin` | `Admin@1234` |
| ORGANIZER | `organizer` | `Organizer@1234` |
| STUDENT | `student` … `student5` | `Student@1234` |
