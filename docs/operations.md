# การติดตั้งและใช้งาน (Operations)

## Environment variables (`.env`)

```dotenv
# ฐานข้อมูล (MySQL)
DATABASE_URL="mysql://root:<password>@localhost/med-explore"
DATABASE_USER="root"
DATABASE_PASSWORD="<password>"
DATABASE_NAME="med-explore"
DATABASE_HOST="localhost"
DATABASE_PORT=3306

# NextAuth
NEXTAUTH_SECRET="<สุ่มด้วย `openssl rand -base64 32`>"
NEXTAUTH_URL="http://localhost:3000"

# Microsoft (ไม่บังคับ; เฉพาะองค์กรเดียว)
MICROSOFT_TENANT_ID=""
MICROSOFT_CLIENT_ID=""
MICROSOFT_CLIENT_SECRET=""
```

> `.env` ไม่ถูก commit ขึ้น git
> การล็อกอินด้วยรหัสผ่านยิง API แบบ relative URL (`lib/auth-client.ts`) จึงใช้ผ่าน localhost หรือ LAN IP ได้ ส่วน Microsoft ต้องเปิดผ่าน URL หลักตาม `NEXTAUTH_URL` และลงทะเบียน callback ใน Entra ให้ตรงกัน ดู [คู่มือตั้งค่า Microsoft](microsoft-login.md)

## คำสั่งที่ใช้บ่อย

```bash
npm install             # ติดตั้ง dependency (มี postinstall: prisma generate)

npm run dev             # dev server (http://localhost:3000)
npm run dev:https       # dev server แบบ HTTPS (self-signed) — จำเป็นสำหรับทดสอบกล้อง
npm run build           # production build
npm run start           # รัน production

npm run db:migrate      # prisma migrate dev
npm run db:deploy       # prisma migrate deploy (production)
npm run db:seed         # seed roles/permissions + บัญชีทดสอบ
npm run db:studio       # Prisma Studio

npm run lint            # eslint
npx tsc --noEmit        # typecheck
```

## ทดสอบผ่าน LAN / มือถือ

1. หา IP ของเครื่องในวง LAN (เช่น `192.168.1.49`)
2. ถ้า IP ไม่ใช่ค่าเดิม ให้เพิ่ม hostname ใน `next.config.ts`:
   ```ts
   allowedDevOrigins: ["192.168.1.49"],
   ```
   (ใส่เฉพาะ hostname ไม่ต้องมี `https://` หรือ port) — Next.js จะบล็อก request ข้าม origin ที่ไม่ได้ประกาศไว้
3. รัน `npm run dev` แล้วเปิด `http://192.168.1.49:3000` จากเครื่องอื่น
4. ถ้าเครื่องอื่นเข้าไม่ได้เลย ให้ตรวจ **Windows Firewall** ว่าอนุญาต inbound พอร์ต 3000

### กล้องสแกน QR ต้องเป็น secure context

เบราว์เซอร์อนุญาต `getUserMedia` เฉพาะ **HTTPS หรือ localhost** เท่านั้น

- ทดสอบบนคอม: `http://localhost:3000` ใช้กล้องได้ทันที
- ทดสอบบนมือถือผ่าน LAN (http) จะ **เรียกกล้องไม่ได้** → ต้องรัน HTTPS:
  ```bash
  npm run dev:https       # http://localhost:3000 → https://localhost:3000
  ```
  แล้วมือถือเปิด `https://192.168.1.49:3000` (กดAdvanced → Proceed เพื่อข้ามคำเตือน self-signed)
- ทางเลือกที่ไม่ต้องใช้กล้อง: สแกนด้วยกล้องมือถือเพื่อเปิด **ลิงก์ใน QR** หรือคัดลอกรหัสไปวางในหน้า `/scan`

> ลิงก์ใน QR ใช้ origin ของหน้าที่ผู้จัดเปิดอยู่ ดังนั้นควรเปิดหน้าผู้จัดผ่าน host ที่มือถือเข้าถึงได้ (เช่น IP ใน LAN) ตอนสร้าง QR

### การเปลี่ยนรหัสผ่านผ่าน LAN / reverse proxy

API เปลี่ยนรหัสผ่านตรวจ Origin กับ host/protocol ของคำขอที่ผู้ใช้เปิดจริง จึงใช้ผ่าน localhost, LAN HTTP/HTTPS และ reverse proxy ได้ โดยไม่ต้องเปลี่ยน `NEXTAUTH_URL` สำหรับการเปลี่ยนรหัสผ่าน

หากมี reverse proxy ให้ตั้ง `Host` หรือ `X-Forwarded-Host` เป็น public host พร้อมพอร์ตตามจริง และ `X-Forwarded-Proto` เป็น `http` หรือ `https` ตาม URL ที่ผู้ใช้เปิด Proxy ต้องเขียนทับ forwarded headers จาก client ด้วยค่าที่เชื่อถือได้ ใช้ค่าเดียวต่อ header ระบบปฏิเสธคำขอที่ Origin ไม่ตรง ไม่มี Origin หรือมี forwarded headers หลายค่าที่กำกวม Microsoft ยังต้องใช้ URL หลักที่ลงทะเบียนไว้ตามคู่มือ

## ผลตรวจสอบคุณภาพก่อนส่งงาน

```bash
npx tsc --noEmit      # typecheck
npm run lint          # eslint
npm run build         # production build (มี TypeScript check ในตัว)
```

ทั้งสามคำสั่งต้องผ่านโดยไม่มี error

### ทดสอบรหัสผ่านผ่านเซิร์ฟเวอร์จริง

เปิด dev server ไว้ก่อน แล้วรันทดสอบนี้ด้วย PowerShell อีกหน้าต่าง (เปลี่ยนเป็น `http://localhost:3000` หากไม่ได้เปิด HTTPS):

```powershell
$env:PASSWORD_HTTP_TEST_ORIGIN = "https://localhost:3000"
node --test tests/password-http.integration.test.mjs
Remove-Item Env:PASSWORD_HTTP_TEST_ORIGIN
```

ต้องเป็นเซิร์ฟเวอร์และฐานข้อมูลบนเครื่องตัวเองเท่านั้น การทดสอบสร้างบัญชีชั่วคราวสำหรับทั้งสามบทบาท ตรวจล็อกอิน → เปลี่ยนรหัสผ่าน → รหัสเดิมเข้าไม่ได้/รหัสใหม่เข้าได้ → ออกจากระบบแล้ว session ว่างและหน้าโปรไฟล์บังคับล็อกอิน รวมถึง ADMIN ตั้งรหัสผ่าน STUDENT / ORGANIZER จากนั้นล้างเฉพาะบัญชีและ Audit Log ที่สร้างเพื่อทดสอบ ไม่ใช้รหัสผ่านของบัญชีจริง หากไม่กำหนด environment นี้ ชุดทดสอบจะข้ามการทดสอบ HTTP

หลังเพิ่ม export ของตัวตรวจข้อมูลใหม่ระหว่าง `next dev` ให้ตรวจผ่าน HTTP ด้วย เพราะ dev server อาจยังอ้างโมดูลเดิมแม้ typecheck และ build ผ่าน ปัจจุบันตัวตรวจรหัสผ่านแยกอยู่ใน `lib/password-validation.ts`; หากพบอาการโมดูลค้างระหว่างพัฒนา ให้เริ่ม dev server ใหม่

## ข้อควรทราบ / ข้อจำกัด

- **เปลี่ยนรหัสผ่าน**: ทุกบทบาทใช้หน้าโปรไฟล์ของตัวเอง โดยยืนยันรหัสผ่านปัจจุบันก่อน หาก STUDENT / ORGANIZER ลืมรหัสผ่าน ให้ ADMIN ตั้งใหม่ผ่านหน้าจัดการผู้ใช้ รหัสผ่าน Microsoft ต้องเปลี่ยนกับองค์กรโดยตรง

- **สิทธิ์ใน JWT จะค้าง**: เมื่อแอดมินแก้บทบาท/สิทธิ์ของผู้ใช้ ผู้ใช้นั้นต้อง **ล็อกอินใหม่** จึงจะได้สิทธิ์ใหม่ (token มีอายุตาม session)
- **`cacheComponents`**: การอ่าน session/`cookies()` ต้องอยู่ใน `<Suspense>` และห้าม `setState` แบบ synchronous ใน `useEffect`
- **ปีการศึกษา ACTIVE ได้ทีละปี**: การ "เปิดใช้งาน" ปีใหม่จะปิดปีเดิมเสมอ
- **กล้อง**: ต้อง HTTPS/localhost และผู้ใช้ต้องกดอนุญาต
- **โทเคน QR ถูกเก็บเป็น hash**: ไม่สามารถแสดงโทเคนเดิมซ้ำได้ (ระบบแสดงให้เฉพาะตอนสร้าง)
- **BigInt**: ค่า id เป็น BigInt แปลงเป็น string ใน API แล้ว

## การ deploy (แนวทาง)

1. ตั้งค่า env (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` เป็น URL จริง/HTTPS)
2. `npm ci && npx prisma migrate deploy`
3. `npm run build && npm run start`
4. สำรองฐานข้อมูลสม่ำเสมอ (เช่น `mysqldump`) ตามข้อกำหนด Sprint 5
