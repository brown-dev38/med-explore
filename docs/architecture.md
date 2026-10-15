# สถาปัตยกรรม (Architecture)

## เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
| --- | --- |
| Framework | Next.js `16.4.0` (App Router, Turbopack, Server Components) |
| UI | React `19`, Tailwind CSS `4` |
| ฐานข้อมูล | MySQL ผ่าน Prisma `7` + `@prisma/adapter-mariadb` |
| Auth | NextAuth `4` (Credentials Provider) + `bcrypt` |
| Validation | `zod` 4 |
| QR | `qrcode` (สร้างภาพ QR ฝั่งเซิร์ฟเวอร์), `jsqr` (ถอดรหัสจากกล้องฝั่ง client) |

การตั้งค่า Next.js ที่สำคัญ (`next.config.ts`):

- `cacheComponents: true` — เปิด Cache Components (Partial Prerender)
- `partialPrefetching: true`
- `allowedDevOrigins: ["192.168.1.49"]` — อนุญาตให้เข้า dev server จาก LAN

## โครงสร้างโปรเจกต์

```
app/
  layout.tsx, page.tsx                 # landing (ผู้ที่ล็อกอินแล้วจะถูก proxy เด้งไปแดชบอร์ด)
  login/, register/                    # หน้าเข้าสู่ระบบ/สมัครสมาชิก (ฟอร์ม + API)
  forbidden/                           # หน้า 403
  activities/                          # เด้งไป /dashboard/activities
  scan/                                # หน้าสแกน QR (สแกนกล้องในแอป + กรอกรหัส)
  profile/                             # โปรไฟล์ (สำหรับนิสิต)
  dashboard/                           # แดชบอร์ดนิสิต
    page.tsx                           #   ภาพรวม + กิจกรรมที่กำลังจะมาถึง (4 รายการ)
    upcoming/                          #   กิจกรรมที่จะมาถึงทั้งหมด
    activities/                        #   ลงทะเบียนกิจกรรม (PUBLISHED เท่านั้น) + ปุ่มสแกน
    my-activities/                     #   กิจกรรมของฉัน
    profile/                           #   โปรไฟล์
  admin/                               # แดชบอร์ดผู้ดูแลระบบ (ต้องเป็นบทบาท ADMIN)
    page.tsx                           #   ภาพรวม + การ์ดสถิติ
    academic-years/, users/            #   จัดการปีการศึกษา / ผู้ใช้งาน
    activities/, activities/[id]/      #   จัดการกิจกรรม + รายละเอียด
    profile/
  organizer/                           # แดชบอร์ดผู้จัดกิจกรรม (ต้องมี activity.manage)
    activities/, activities/[id]/, profile/
  api/                                 # Route Handlers (ดู api-reference.md)

components/
  dashboard-shell.tsx                  # โครงแดชบอร์ด + sidebar (ใช้ร่วมทุกบทบาท)
  dashboard-user.tsx                   # บล็อกผู้ใช้/ปุ่มออกจากระบบ ใน sidebar
  session-nav.tsx                      # เมนูสำหรับหน้าทั่วไป (ไม่ใช่แดชบอร์ด)
  logout-button.tsx
  profile-view.tsx                     # เนื้อหาโปรไฟล์ (ใช้ร่วม 3 ที่)
  activities-manager.tsx               # ตาราง/ฟอร์มจัดการกิจกรรม (ผู้จัด/แอดมิน)
  activities-browser.tsx               # การ์ดกิจกรรมสำหรับนิสิต (ลงทะเบียน + สแกน)
  activity-detail.tsx                  # รายละเอียดกิจกรรม: QR, ผู้ลงทะเบียน, บันทึกเวลา, bulk tools
  qr-scanner.tsx                       # ตัวสแกน QR ด้วยกล้อง (getUserMedia + jsqr)

lib/
  auth.ts                              # NextAuth options + auth()
  auth-client.ts                       # signIn/signOut/session ฝั่ง client (ยิง relative URL)
  prisma.ts                            # PrismaClient (mariadb adapter)
  permissions.ts                       # ค่าคงที่ permission, helper, dashboardPathFor (pure)
  dal.ts                               # Data Access Layer: getCurrentUser/requireAuth/requirePermission
  audit.ts                             # recordAudit()
  api.ts                               # errorResponse/successResponse/parseId
  validation.ts                        # zod schemas
  qr.ts                                # generateQrToken/hashQrToken (sha256)
  activities.ts, participations.ts, attendance.ts, academic-years.ts, users.ts, datetime.ts

proxy.ts                               # Proxy (middleware) — เด้ง/กันเส้นทางก่อนถึงหน้า
prisma/schema.prisma, prisma/seed.ts, prisma/migrations/
types/                                 # next-auth.d.ts, activity.ts, user.ts, academic-year.ts
```

## Authentication (การยืนยันตัวตน)

- ใช้ **NextAuth Credentials Provider** (`lib/auth.ts`) ล็อกอินด้วย **ชื่อผู้ใช้ / รหัสนิสิต / อีเมล** + รหัสผ่าน
- ตรวจรหัสผ่านด้วย `bcrypt.compare` กับ `users.password_hash`
- ถ้า `is_active = false` จะล็อกอินไม่ได้
- Session เป็น **JWT** (`session.strategy = "jwt"`) เก็บ `uid`, `role`, `roles[]`, `permissions[]`
- ทุกครั้งที่อ่าน session จะตรวจว่าบัญชียังอยู่และเปิดใช้งาน หากลบ/ปิดบัญชีจะล้างข้อมูลสิทธิ์ออกจาก session; Proxy ตรวจบัญชีก่อน redirect จากหน้าเข้าสู่ระบบ/สมัครสมาชิก/หน้าแรก และล้าง session cookie ที่ใช้ต่อไม่ได้
- `components/session-guard.tsx` ตรวจ session บนหน้าใช้งานทุก 5 วินาที และเมื่อกลับแท็บ/ออนไลน์ โดยส่ง `cache: no-store`; เก็บ `accountStatus` เพื่อแยกการระงับ/ลบ/หมดอายุ แล้ว sign out อัตโนมัติ กรณีระงับใช้ `SuspendedAccountDialog` ค้างไว้จนกดกลับหน้าเข้าสู่ระบบ และหยุด monitor ระหว่างนั้น หน้า `/login?reason=account-suspended` ใช้ modal เดียวกันให้รับทราบ รวมถึงกรณี DAL redirect ระหว่างเปลี่ยนหน้า
- ฝั่ง client ใช้ `lib/auth-client.ts` (`signInWithCredentials`, `signOutClient`, `fetchSession`) ที่ยิง `/api/auth/...` แบบ **relative URL** เพื่อให้ใช้ได้ทั้ง `localhost`, LAN IP และ HTTPS โดยไม่ผูกกับ `NEXTAUTH_URL`
- หลังล็อกอินสำเร็จ ระบบเด้งไปแดชบอร์ดตามบทบาท (`dashboardPathFor`)

## RBAC (การกำหนดสิทธิ์)

หลักการ: **ตรวจสิทธิ์จริงที่ชั้นข้อมูล** (Dal / Route Handler) ส่วน `proxy.ts` ทำ **optimistic check** เพื่อความเร็ว

- `lib/permissions.ts` (pure module — ใช้ได้ใน proxy, ไม่ดึง Prisma):
  - Codes: `user.manage`, `academic_year.manage`, `activity.manage`, `attendance.record`, `participation.review`, `star.approve`, `reward.manage`, `reward.redeem`, `survey.manage`, `audit.view`
  - Helpers: `hasRole`, `hasPermission`, `canAccessAdmin`, `dashboardPathFor`
- `lib/dal.ts`:
  - `getCurrentUser()` (ห่อด้วย React `cache`)
  - `requireAuth()`, `requireRole()`, `requirePermission(code)`, `requireAdminAccess()` → เด้ง `/login` หรือ `/forbidden`
- **แดชบอร์ด ADMIN** กำหนดด้วย **บทบาท `ADMIN`** เท่านั้น (`canAccessAdmin`) — organizer ไม่สามารถเข้า `/admin/*`
- **แดชบอร์ด ORGANIZER** กำหนดด้วยสิทธิ์ `activity.manage`

ตัวอย่างการตรวจใน Route Handler:

```ts
const user = await getCurrentUser();
if (!user) return errorResponse("กรุณาเข้าสู่ระบบ", 401);
if (!hasPermission(user, PERMISSIONS.ACTIVITY_MANAGE)) {
  return errorResponse("ไม่มีสิทธิ์", 403);
}
```

## proxy.ts

`proxy.ts` (Next.js 16 เปลี่ยนชื่อจาก `middleware`) ทำงานทุก request ยกเว้น `api`, `_next/static`, `_next/image`, `favicon.ico`:

- ผู้ที่ **ยังไม่ล็อกอิน** เข้า `/admin/*` หรือ `/organizer/*` → เด้ง `/login`
- ผู้ที่ **ล็อกอินแล้ว** เข้า `/`, `/login`, `/register` → เด้งไปแดชบอร์ดของตน
- เข้า `/admin/*` แต่ไม่ใช่บทบาท ADMIN → `/forbidden`
- เข้า `/organizer/*` แต่ไม่มี `activity.manage` และไม่ใช่ ADMIN → `/forbidden`

## ข้อจำกัดสำคัญ: cacheComponents

โปรเจกต์เปิด `cacheComponents` จึงมีข้อควรระวังในการเขียนโค้ด:

1. การอ่าน session/`cookies()` ต้องอยู่ใน `<Suspense>` (หรือกำหนด `export const instant = false`) — หน้าต่าง ๆ จึงอ่าน session ในคอมโพเนนต์ย่อยใต้ `<Suspense>`
2. คอมโพเนนต์ client ที่ใช้ `usePathname()` (เช่นเมนู sidebar ที่ไฮไลต์เมนูปัจจุบัน) ต้องถูกห่อด้วย `<Suspense>` — ใน `components/dashboard-shell.tsx` แยก `DashboardNav` ไปห่อ `<Suspense>`
3. **ห้าม** `setState` แบบ synchronous ใน `useEffect` (React Compiler lint) — จึงโหลดข้อมูลตั้งต้นจากฝั่ง server ส่งเป็น prop แล้วให้ client fetch เฉพาะตอนผู้ใช้กด (event handler)

## แนวทางเขียนโค้ด (conventions)

- **อ่านข้อมูล**: Server Component เรียก Prisma โดยตรง (ผ่าน DAL เมื่อต้องตรวจสิทธิ์)
- **เขียนข้อมูล**: client เรียก Route Handler → เรียก `router.refresh()` และ/หรือ reload ข้อมูล
- **รูปแบบ response**: สำเร็จ `{ success: true, data }` (200/201) · ผิดพลาด `{ message }` (400/401/403/404/409/500)
- **Validation**: ตรวจ input ด้วย zod ใน `lib/validation.ts`
- **หลายขั้นตอน**: ห่อด้วย `prisma.$transaction`
- **Audit**: ทุก mutation ของผู้ดูแล/ผู้จัดเรียก `recordAudit()` (ดูรายการ action ใน [features.md](./features.md#audit-log))
- **BigInt**: ค่า `id` เป็น `BigInt` — แปลงเป็น string ก่อนส่ง JSON (`lib/api.ts` มี `parseId`)
