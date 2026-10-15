# ฐานข้อมูล (Database)

- **Provider**: MySQL (Prisma `7.10.0`) เชื่อมผ่าน driver adapter `@prisma/adapter-mariadb`
- **Schema**: [`prisma/schema.prisma`](../prisma/schema.prisma)
- **Client**: `lib/prisma.ts` — สร้าง `PrismaClient({ adapter })` จาก `DATABASE_URL`
- **Prisma config**: [`prisma.config.ts`](../prisma.config.ts) (schema path, migrations path, seed command)

## ตาราง/enum ที่ใช้งานแล้ว (Sprint 1–2)

### `User` (`users`)
| ฟิลด์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `id` | BigInt PK | auto increment |
| `student_code` | VarChar(50) unique? | รหัสนิสิต (ออปชัน) |
| `username` | Text | ใช้ล็อกอินได้ |
| `email` | VarChar(191) unique | ใช้ล็อกอินได้ |
| `password_hash` | VarChar(255)? | bcrypt |
| `firstname`, `lastname` | Text? | ชื่อ-นามสกุล |
| `is_active` | Boolean | ปิดใช้งาน = ล็อกอินไม่ได้ |
| `created_at`, `updated_at` | DateTime(3) | |

### `Role` (`roles`) / `Permission` (`permissions`)
- `Role.name` unique (`ADMIN` / `ORGANIZER` / `STUDENT`)
- `Permission.code` unique (10 รหัส ดู [architecture.md](./architecture.md#rbac-การกำหนดสิทธิ์))

### `UserRole` (`user_roles`) — PK `(user_id, role_id)`
- `user_id` unique: ผู้ใช้มีบทบาทได้ไม่เกิน 1 รายการ และฟอร์ม/API สร้างบัญชีพร้อมบทบาท 1 รายการเสมอ
- Migration `20261015090000_single_user_role` เพิ่ม unique index โดยไม่เปลี่ยนบทบาทเดิม หากฐานข้อมูลอื่นมีหลายบทบาทต่อคน ต้องเลือกบทบาทให้เหลือคนละ 1 รายการก่อน deploy migration

### `RolePermission` (`role_permissions`) — PK `(role_id, permission_id)`

### `AcademicYear` (`academic_years`)
| ฟิลด์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `code` | VarChar(20) unique | เช่น `2569` |
| `starts_on`, `ends_on` | Date | |
| `status` | `AcademicYearStatus` | `DRAFT` / `ACTIVE` / `CLOSED` |

### `Activity` (`activities`)
| ฟิลด์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `academic_year_id` | FK → AcademicYear | |
| `organizer_id` | FK → User | ผู้สร้าง |
| `title`, `description`, `location` | | |
| `starts_at`, `ends_at` | DateTime(3) | ช่วงเวลา (ต้อง start < end) |
| `min_minutes` | Int (default 90) | นาทีขั้นต่ำเพื่อให้ดาวสีเหลืองอัตโนมัติ |
| `status` | `ActivityStatus` | `DRAFT` / `PUBLISHED` / `COMPLETED` / `CANCELLED` |

### `Participation` (`participations`)
| ฟิลด์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `activity_id`, `user_id` | FK | **`@@unique([activityId, userId])`** กันลงทะเบียนซ้ำ |
| `status` | `ParticipationStatus` | `REGISTERED` เป็นค่าเริ่มต้น |
| `eligibility_status` | `ReviewStatus` | `PENDING` เมื่อเวลาไม่ครบ, `APPROVED` เมื่อผ่านเกณฑ์, `REJECTED` เมื่อไม่ผ่าน |
| `attended_minutes` | Int? | นาทีเต็มจากเช็คอินถึงเช็คเอาท์จริง; null เมื่อยังไม่ครบ |
| `reviewed_at`, `reviewed_by`, `review_note` | | ผลประเมินเวลาอัตโนมัติ (ผู้ประเมินเป็น null), เหตุผลไม่ได้ดาว/ติดเพดาน |
| `review_due_at` | DateTime? | เตรียมไว้สำหรับรอบตรวจสอบของผู้จัด |

### `AttendanceRecord` (`attendance_records`)
| ฟิลด์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `participation_id` | FK | |
| `event_type` | `AttendanceEvent` | `CHECK_IN` / `CHECK_OUT` |
| `method` | `AttendanceMethod` | `QR` / `ORGANIZER` |
| `occurred_at` | DateTime(3) | เวลาที่บันทึก |
| `recorded_by` | FK → User | ผู้บันทึก |

**`@@unique([participationId, eventType])`** → หนึ่งคนมีได้ครั้งละ 1 check-in และ 1 check-out (แก้ไขได้ แต่เพิ่มซ้ำไม่ได้)

### `QrSession` (`qr_sessions`)
| ฟิลด์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `activity_id`, `created_by` | FK | |
| `purpose` | `QrPurpose` | `CHECK_IN` / `CHECK_OUT` |
| `token_hash` | VarChar(255) unique | เก็บเฉพาะ sha256 ของโทเคน |
| `expires_at` | DateTime(3) | หมดอายุ |
| `revoked_at` | DateTime(3)? | ปิด QR ก่อนกำหนด |

### `AuditLog` (`audit_logs`)
`actor_id?`, `action`, `entity_type`, `entity_id?`, `details` (Json), `created_at`

## ดาวและตารางที่เตรียมไว้สำหรับขั้นถัดไป

- `StarTransaction` ใช้งานแล้วสำหรับดาวสีเหลืองอัตโนมัติ: `points=1`, `status=APPROVED`; ประเมินไม่ผ่านภายหลังหรือเกินเพดานใช้ `REJECTED` โดยเก็บรายการเดิมไว้ ยอดสะสมนับเฉพาะ `APPROVED`
- `HelperAssignment` และดาวสีเขียวยังเตรียมไว้สำหรับขั้นถัดไป
- `RewardTier`, `RewardRedemption` (รางวัล/แลกคะแนน — Sprint 4)
- `SurveyResponse` (แบบประเมิน)

## Enum ทั้งหมด

| Enum | ค่า |
| --- | --- |
| `AcademicYearStatus` | `DRAFT`, `ACTIVE`, `CLOSED` |
| `ActivityStatus` | `DRAFT`, `PUBLISHED`, `COMPLETED`, `CANCELLED` |
| `ParticipationStatus` | `REGISTERED`, `ATTENDED`, `INCOMPLETE`, `ABSENT` |
| `ReviewStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `AttendanceEvent` | `CHECK_IN`, `CHECK_OUT` |
| `AttendanceMethod` | `QR`, `ORGANIZER` |
| `StarType` | `YELLOW`, `GREEN`, `ADJUSTMENT` |
| `TransactionStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `HelperStatus` | `ASSIGNED`, `COMPLETED`, `CANCELLED` |
| `RedemptionStatus` | `PENDING`, `APPROVED`, `COMPLETED`, `CANCELLED` |
| `QrPurpose` | `CHECK_IN`, `CHECK_OUT` |

## กฎเชิงธุรกิจที่บังคับที่ชั้นฐานข้อมูล/แอป

- เปิดใช้งาน (ACTIVE) ปีการศึกษาได้ทีละ 1 ปี — เมื่อ activate ปีใหม่ ระบบจะปิดปีที่ ACTIVE เดิม
- ห้ามลงทะเบียนกิจกรรมเดียวกันซ้ำ (unique `activityId + userId`)
- หนึ่งคนมี check-in/check-out ได้อย่างละ 1 ครั้งต่อกิจกรรม (unique `participationId + eventType`) — แก้ไขเวลาได้
- โทเคน QR เก็บเป็น hash และใช้ได้ครั้งเดียวต่อ session จนหมดอายุ/ถูกปิด
- ต้องเช็คอินก่อนจึงจะเช็คเอาท์ได้

## Migration & Seed

```bash
npm run db:migrate     # prisma migrate dev (สร้าง/apply migration ใหม่ตอนพัฒนา)
npm run db:deploy      # prisma migrate deploy (apply migration บน production)
npm run db:seed        # prisma db seed (รัน prisma/seed.ts)
npm run db:studio      # prisma studio (เปิดดูข้อมูล)
```

- Migration แรก: `prisma/migrations/20261014120116_init`
- `prisma/seed.ts` เป็น **idempotent** (ใช้ `upsert`) — รันซ้ำได้ ไม่สร้างซ้ำ

### บัญชีทดสอบ (seed)

| บทบาท | studentCode | username | email | รหัสผ่าน |
| --- | --- | --- | --- | --- |
| ADMIN | — | `admin` | admin@medexplore.local | `Admin@1234` |
| ORGANIZER | — | `organizer` | organizer@medexplore.local | `Organizer@1234` |
| STUDENT | 6601000001 | `student` | student@medexplore.local | `Student@1234` |
| STUDENT | 6601000002 | `student2` | student2@medexplore.local | `Student@1234` |
| STUDENT | 6601000003 | `student3` | student3@medexplore.local | `Student@1234` |
| STUDENT | 6601000004 | `student4` | student4@medexplore.local | `Student@1234` |
| STUDENT | 6601000005 | `student5` | student5@medexplore.local | `Student@1234` |

Seed ยังสร้าง 10 permissions และผูกกับบทบาท:
- **ADMIN**: ทุก permission
- **ORGANIZER**: `activity.manage`, `attendance.record`, `participation.review`, `star.approve`, `survey.manage`
- **STUDENT**: `reward.redeem`
