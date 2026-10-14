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
```

> `.env` ไม่ถูก commit ขึ้น git
> หมายเหตุ: ฝั่ง client ของระบบยิง API แบบ relative URL (`lib/auth-client.ts`) จึงไม่ผูกกับค่า `NEXTAUTH_URL` — เข้าใช้งานผ่าน localhost หรือ LAN IP ก็ล็อกอินได้

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

## ผลตรวจสอบคุณภาพก่อนส่งงาน

```bash
npx tsc --noEmit      # typecheck
npm run lint          # eslint
npm run build         # production build (มี TypeScript check ในตัว)
```

ทั้งสามคำสั่งต้องผ่านโดยไม่มี error

## ข้อควรทราบ / ข้อจำกัด

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
