# เข้าสู่ระบบด้วย Microsoft

ระบบรองรับบัญชี Microsoft Entra ของ **องค์กร/มหาวิทยาลัยเดียว** ผู้ใช้ต้องมีบัญชีในระบบก่อน และเข้าสู่ระบบด้วยรหัสผ่านเพื่อผูก Microsoft ในหน้าโปรไฟล์ บัญชี Microsoft ที่ยังไม่ผูกจะเข้าสู่ระบบไม่ได้ แม้อีเมลตรงกับบัญชีเดิม

## ตั้งค่า Microsoft Entra

1. เปิด Microsoft Entra admin center → Entra ID → App registrations → New registration ใน tenant ขององค์กร
2. เลือกประเภทบัญชี **Single tenant only** (บางหน้าจอใช้ชื่อ Accounts in this organizational directory only) แล้วลงทะเบียนแอป
3. เก็บ Application (client) ID และ Directory (tenant) ID จาก Overview
4. ใน Authentication เพิ่ม Redirect URI โดยเลือกแพลตฟอร์ม **Web**:

   ```text
   # ทดสอบบนเครื่อง
   http://localhost:3000/api/auth/callback/azure-ad

   # เครื่องใช้งานจริง: เปลี่ยนเป็นโดเมนของระบบ
   https://your-domain.example/api/auth/callback/azure-ad
   ```

5. ใน Certificates & secrets → Client secrets → New client secret ให้บันทึก **Value** ลงการตั้งค่าของเซิร์ฟเวอร์ ไม่ใช่ Secret ID และติดตามวันหมดอายุ
6. แอปขอเฉพาะ `openid profile email` เพื่อเข้าสู่ระบบ ไม่เรียก Microsoft Graph หรือขอสิทธิ์อ่านเมล/ไฟล์ หากองค์กรบังคับอนุมัติแอป ให้ผู้ดูแล Entra อนุมัติตามนโยบายองค์กร

Single tenant อาจรวม guest ที่องค์กรเชิญเข้า tenant ด้วย หากต้องการจำกัดเฉพาะกลุ่ม ให้ตั้ง User assignment ของ Enterprise application ใน Entra เพิ่มเติม

ดูขั้นตอนจาก [Microsoft: ลงทะเบียนแอป](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [เพิ่ม Redirect URI](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri) และ [สร้าง credentials](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials)

## ตั้งค่าในโปรเจกต์

เพิ่มค่าต่อไปนี้ใน `.env` ของเครื่องพัฒนา หรือ environment ของเซิร์ฟเวอร์ โดยไม่ commit ค่า secret:

```dotenv
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<ค่า secret ของระบบเดิม>"
MICROSOFT_TENANT_ID="<Directory tenant ID แบบ GUID>"
MICROSOFT_CLIENT_ID="<Application client ID แบบ GUID>"
MICROSOFT_CLIENT_SECRET="<Client secret Value>"
```

`NEXTAUTH_URL` ต้องเป็น URL หลักที่ผู้ใช้เปิดจริง และ Redirect URI ใน Entra ต้องตรงกับ URL นี้ตามด้วย `/api/auth/callback/azure-ad` เครื่องใช้งานจริงใช้ HTTPS การเข้า Microsoft ผ่าน LAN IP ที่ต่างจาก URL หลักจะถูกปฏิเสธ ให้เปิดผ่าน URL หลักที่ลงทะเบียนไว้ก่อน

รัน migration และสร้าง Prisma Client ก่อนเริ่มแอป:

```bash
npm run db:deploy
npx prisma generate
npm run build
npm run start
```

สำหรับพัฒนาใช้ `npm run dev` หลังตั้งค่า เมื่อแก้ environment ต้องเริ่มเซิร์ฟเวอร์ใหม่ หน้าเข้าสู่ระบบแสดงปุ่ม Microsoft เสมอ แต่ปุ่มจะกดได้เมื่อ client ID, tenant ID และ client secret ตั้งค่าครบและรูปแบบถูกต้อง ระหว่างที่ยังไม่พร้อม ปุ่มจะถูกปิดพร้อมข้อความแจ้งว่ายังไม่เปิดให้บริการ การล็อกอินด้วยรหัสผ่านยังใช้งานได้

## วิธีใช้งาน

1. เข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสนิสิต/อีเมลและรหัสผ่านเดิม
2. เปิด **โปรไฟล์ของฉัน → บัญชี Microsoft** ยืนยันรหัสผ่านปัจจุบัน แล้วกด **ผูกบัญชี Microsoft**
3. เลือกบัญชีขององค์กรและยืนยันกับ Microsoft ภายใน 10 นาที ระบบกลับหน้าโปรไฟล์พร้อมผลการผูก
4. ออกจากระบบ แล้วใช้ปุ่ม **เข้าสู่ระบบด้วย Microsoft** ในครั้งถัดไป ข้อมูลกิจกรรม ดาว และบทบาทยังเป็นบัญชีเดิม
5. หากต้องการเปลี่ยนหรือยกเลิกบัญชี ให้ยืนยันรหัสผ่านเดิมแล้วกด **ยกเลิกการผูก Microsoft** ในโปรไฟล์ เซสชันที่เข้าโดย Microsoft จะใช้ต่อไม่ได้เมื่อตรวจ session ครั้งถัดไป ส่วนการเข้าสู่ระบบด้วยรหัสผ่านยังใช้ได้

ผู้ใช้ใหม่สมัครบัญชีนิสิตตามปกติก่อน ผู้จัดและผู้ดูแลใช้บัญชีที่ ADMIN สร้างให้ ผู้ดูแลที่เปิดดูโปรไฟล์นิสิตจะไม่เห็นเครื่องมือผูกบัญชีแทนผู้อื่น

## การตรวจสอบและข้อมูลที่จัดเก็บ

- NextAuth/openid-client ตรวจ ID token พร้อม state, PKCE และ nonce ก่อนตรวจ tenant/issuer เพิ่มเติมในระบบ
- จับคู่ด้วย `tenant ID + object ID` ซึ่งเป็นรหัสบัญชีถาวรภายในองค์กร ใช้อีเมลเป็นป้ายแสดงผลเท่านั้น การเปลี่ยนอีเมลจึงไม่สร้างบัญชีใหม่ ตามคำอธิบาย [Microsoft ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)
- แต่ละบัญชีในระบบผูก Microsoft ได้หนึ่งบัญชี และ Microsoft หนึ่งบัญชีผูกผู้ใช้ได้หนึ่งคน ไม่จับคู่หรือสร้างผู้ใช้จากอีเมลอัตโนมัติ
- คำขอผูกมีอายุ 10 นาที ใช้ได้ครั้งเดียว ผูกกับผู้ใช้ที่ยืนยันรหัสผ่าน เก็บเฉพาะ hash ในฐานข้อมูล และส่งโทเคนผ่าน cookie แบบ HttpOnly
- เก็บ mapping ใน `microsoft_accounts` และคำขอผูกใน `microsoft_link_intents` ไม่บันทึก access token, refresh token หรือ ID token ของ Microsoft ลงฐานข้อมูล/JWT ของระบบ
- บทบาทและสิทธิ์อ่านจากบัญชีในระบบ ไม่ใช้ role จาก Microsoft บัญชีที่ถูกระงับหรือลบเข้าสู่ระบบไม่ได้
- การผูก/ยกเลิกผูกบันทึก Audit Log `auth.microsoft.link` / `auth.microsoft.unlink`

## หากเข้าไม่ได้

| อาการ | สิ่งที่ต้องตรวจ |
| --- | --- |
| ปุ่ม Microsoft กดไม่ได้และแจ้งว่ายังไม่เปิดให้บริการ | ตรวจสามค่า `MICROSOFT_*` และเริ่มเซิร์ฟเวอร์ใหม่ |
| Redirect URI mismatch | URI ใน Entra ต้องตรงกับ `NEXTAUTH_URL` และเส้นทาง callback รวมพอร์ตและ HTTPS |
| บัญชียังไม่ผูก | เข้าด้วยรหัสผ่านเดิม แล้วผูกในโปรไฟล์ก่อน |
| บัญชีคนละองค์กร | เลือกบัญชีที่อยู่ใน tenant ที่กำหนด |
| การผูกหมดอายุ | เข้าด้วยรหัสผ่านเดิม แล้วยืนยันรหัสผ่านเพื่อเริ่มผูกใหม่ |
| Client secret หมดอายุ | สร้าง Value ใหม่ อัปเดต environment และเริ่มเซิร์ฟเวอร์ใหม่ |

ก่อนเปิดใช้งาน ให้ทดสอบกับบัญชี Entra จริง: ผูกบัญชี → ออกจากระบบ → เข้า Microsoft → ตรวจข้อมูล/สิทธิ์เดิม → ยกเลิกการผูก → ตรวจว่า Microsoft เข้าไม่ได้ และยังใช้รหัสผ่านเดิมได้ รวมถึงลองบัญชีคนละ tenant
