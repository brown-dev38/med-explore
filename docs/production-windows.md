# นำ MedExplore Star ขึ้น Windows Server

คู่มือนี้เตรียมสำหรับโดเมนหลัก `https://medexplore.medicine.up.ac.th` บนเครื่อง `10.205.10.200` ที่มีหลายโปรเจกต์ โดยแยก IIS Site, Application Pool, Windows Service, โฟลเดอร์ และพอร์ต Node.js ของ MedExplore Star ต่างหาก ใช้ IIS รับ HTTPS พอร์ต 443 แยกแต่ละเว็บไซต์ด้วย hostname/SNI แล้วส่งคำขอไป Next.js ที่รันเป็น Windows Service และใช้ MariaDB/MySQL เป็นฐานข้อมูล เริ่มจาก Node.js เพียงหนึ่ง process ไม่ใช้ `next dev` บนเครื่องจริง และไม่ต้องใช้ `output: standalone` สำหรับขั้นตอนนี้

โดเมนนี้อยู่ระหว่างการเตรียมใช้งาน ยังไม่ได้ตรวจว่า DNS และใบรับรองพร้อมแล้ว พอร์ต **3101 (Node.js) เป็นค่าที่เสนอเท่านั้น ยังไม่ได้ตรวจว่าพอร์ตว่าง** ส่วน HTTPS 443 ใช้ร่วมกับเว็บไซต์อื่นผ่าน hostname/SNI โดยต้องไม่ซ้ำ binding เดิม ไฟล์ใน `deploy/windows/` ต้องให้ผู้ดูแลทบทวนก่อนใช้ ยังไม่มีการเชื่อมต่อหรือเปลี่ยนเซิร์ฟเวอร์จริง ติดตั้ง service หรือรัน migration โดยอัตโนมัติ ห้ามคัดลอกทับ configuration ของโปรเจกต์อื่น

```text
นิสิต/ผู้จัด -> https://medexplore.medicine.up.ac.th -> IIS Site ของ MedExplore -> 127.0.0.1:3101 -> MariaDB
```

## 1. เตรียมเครื่อง พอร์ต และใบรับรอง HTTPS

- ติดตั้ง Node.js 24 LTS x64 ที่องค์กรอนุมัติและทดสอบกับโปรเจกต์ รวมถึง Git หรือช่องทางส่ง source ที่มี `package-lock.json`
- ให้ผู้ดูแลตรวจ IIS, URL Rewrite 2 และ Application Request Routing (ARR) ที่มีอยู่ก่อน หากต้องติดตั้ง/เปิดคุณสมบัติเพิ่ม ให้ประเมินผลกับโปรเจกต์เดิมก่อน
- เตรียม MariaDB/MySQL และบัญชีฐานข้อมูลของแอปแยกจาก `root` บัญชีที่ใช้ migration ต้องมีสิทธิ์เปลี่ยน schema ส่วนบัญชี runtime ให้สิทธิ์เท่าที่แอปต้องใช้ หากใช้คนละบัญชีให้สลับ `DATABASE_URL` ตามขั้นตอนโดยไม่เปิดเผยรหัสผ่านในประวัติคำสั่ง
- ให้ฝ่าย IT ตั้ง DNS ของ `medexplore.medicine.up.ac.th` ชี้ไปที่ `10.205.10.200` สำหรับเครือข่ายที่ต้องการใช้งาน และเตรียมใบรับรองที่ครอบคลุม **DNS name `medexplore.medicine.up.ac.th`** พร้อมให้มือถือ/คอมพิวเตอร์นิสิตเชื่อถือ CA ที่ออกใบรับรอง การกดข้ามคำเตือน certificate ไม่ใช่แนวทาง production และไม่รับประกันว่ากล้องจะทำงาน ใบรับรอง `localhost` ใน `certificates/` ใช้กับโดเมนนี้ไม่ได้
- ให้ฝ่าย IT ตรวจพอร์ต Node.js ที่ว่างและขอบเขตการเข้าถึง HTTPS 443 ไม่เปิด Node.js 3101 ให้เครื่องอื่น และไม่เปิดฐานข้อมูลสู่ Internet เพิ่ม binding เฉพาะ hostname ของ MedExplore พร้อมเปิด SNI โดยไม่ลบหรือเปลี่ยน binding ของเว็บไซต์เดิม
- ตั้งเวลาระบบให้ตรงด้วยบริการเวลาขององค์กร เพราะเวลาหมดอายุ QR และการให้ดาวอ้างอิงเวลาของเซิร์ฟเวอร์

ให้ผู้ดูแลตรวจทั้งพอร์ตที่กำลังฟังและ IIS bindings ที่จองไว้บนเครื่องจริงด้วยคำสั่งอ่านอย่างเดียวต่อไปนี้ (คู่มือนี้ไม่ได้รันกับเซิร์ฟเวอร์ให้):

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 443, 3101 } | Select-Object LocalAddress, LocalPort, OwningProcess
Import-Module WebAdministration
Get-WebBinding | Select-Object protocol, bindingInformation
Get-Service -Name 'MedExploreStar' -ErrorAction SilentlyContinue
```

หาก Node.js port หรือชื่อ service ถูกใช้แล้ว ให้เลือกใหม่และเปลี่ยน `.env.production`, IIS template และ service ที่เกี่ยวข้องให้ตรงกัน การพบ IIS ฟังพอร์ต 443 อยู่แล้วเป็นเรื่องปกติเมื่อมีหลายเว็บไซต์ ให้ตรวจ hostname/SNI binding แทนการแย่งพอร์ต `10.205.10.200` เป็น private IP อุปกรณ์ต้องมีเส้นทางเข้าเครือข่ายนี้ได้ เช่น Wi-Fi มหาวิทยาลัยหรือ VPN การมีโดเมนไม่ได้เปิดให้เน็ตมือถือภายนอกเข้าถึง IP นี้ได้เอง และไม่ได้บังคับว่าเป็น Wi-Fi จุดใด

อย่าใช้ virtual directory เช่น `/med-explore` บน site เดิมในขั้นตอนนี้ เพราะโปรเจกต์ใช้ URL จาก root (`/api`, `/login`, `/scan`) และยังไม่มี `basePath` ให้ใช้ IIS Site แยกที่ hostname `medexplore.medicine.up.ac.th` โดยแต่ละโปรเจกต์ใช้ hostname ของตัวเอง

### การเพิ่มโดเมนอื่นบนเครื่องเดียวกัน

- ถ้าเป็นคนละโปรเจกต์ ให้แยก DNS hostname, IIS Site/binding, Application Pool, service, โฟลเดอร์ และพอร์ต backend ของโปรเจกต์นั้น ใช้ public IP และพอร์ต HTTPS 443 ร่วมกันได้ผ่าน SNI พร้อมใบรับรองที่ครอบคลุม hostname ของแต่ละเว็บไซต์
- ตัวอย่าง IIS ของ MedExplore ยอมรับเฉพาะ `medexplore.medicine.up.ac.th` ไม่ใช้ wildcard รับโดเมนอื่นทั้งหมด และ `NEXTAUTH_URL` ของโปรเจกต์นี้กำหนดโดเมนหลักเพียงค่าเดียว
- ถ้าเป็นชื่อเพิ่มเติมของ MedExplore เอง ให้แจ้งชื่อ alias ที่แน่นอนเพื่อเพิ่ม DNS/ใบรับรอง/binding และ redirect ไปโดเมนหลักก่อนล็อกอิน ยังคง `NEXTAUTH_URL` เป็น `https://medexplore.medicine.up.ac.th` เพื่อให้ session และ QR ใช้โดเมนเดียวกัน ปัจจุบันยังไม่ได้เพิ่ม alias ที่ไม่ทราบชื่อ

## 2. แยกโฟลเดอร์แอปออกจาก IIS

ตัวอย่างโครงสร้าง:

```text
C:\Apps\MedExploreStar\current\   source + node_modules + .next + .env.production
C:\Apps\MedExploreStar\service\   MedExploreStar.exe + MedExploreStar.xml
C:\Apps\MedExploreStar\logs\      log ของ Windows Service
C:\Apps\MedExploreStar\backups\   สำรองที่จำกัดสิทธิ์; ส่งสำเนาออกนอกเครื่องด้วย
C:\inetpub\med-explore-proxy\     web.config เท่านั้น
```

สร้าง IIS Site และ Application Pool ใหม่ชื่อเฉพาะของแอป ไม่เปลี่ยน root/app pool/binding ของ site เดิม Site ต้องชี้ไปที่ `C:\inetpub\med-explore-proxy` ไม่ชี้ไปที่ repository เพื่อไม่เปิดเผย source, `.env`, migration, คู่มือ หรือไฟล์ฐานข้อมูลสำรอง ตั้ง Application Pool แบบ No Managed Code ได้ เพราะ Node.js รันเป็น service แยกจาก IIS

ใช้บัญชี service ของแอปที่ไม่ใช่ Administrator ให้สิทธิ์อ่าน source, `node_modules`, build และค่าระบบ และให้สิทธิ์เขียน `.next`/cache และโฟลเดอร์ log ตามที่จำเป็น บัญชี IIS ไม่ต้องอ่าน `.env.production` หรือโฟลเดอร์แอป ให้สิทธิ์อ่านเฉพาะ proxy root อย่าใส่รหัสผ่าน service account ใน Git หรือ XML ตัวอย่าง

## 3. เตรียม environment ของ production

ใช้ `.env.production.example` เป็นแนวทางสร้าง `.env.production` ในโฟลเดอร์แอป (คัดลอกเฉพาะเมื่อยังไม่มีไฟล์ ไม่เขียนทับค่าจริง) กำหนด `DATABASE_URL` ของแอปนี้, `NEXTAUTH_URL="https://medexplore.medicine.up.ac.th"`, `PORT=3101` และ `NEXTAUTH_SECRET` แบบสุ่มใหม่ ค่า secret ต้องคงเดิมเมื่อเปลี่ยนรุ่นและไม่ใช้ค่าตัวอย่าง

```powershell
Set-Location -LiteralPath 'C:\Apps\MedExploreStar\current'
if (-not (Test-Path -LiteralPath '.env.production')) { Copy-Item -LiteralPath '.env.production.example' -Destination '.env.production' }
```

ใน PowerShell สามารถสุ่ม secret ด้วย Node.js โดยไม่ใช้ secret ของระบบจริงเป็น argument:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
```

นำผลไปเก็บใน environment/ไฟล์ที่จำกัดสิทธิ์ และอย่าคัดลอกผลไปยัง issue, log หรือแชต ค่า `NEXTAUTH_SECRET` และรหัสผ่านฐานข้อมูลไม่ต้องมี prefix `NEXT_PUBLIC_`

คำสั่ง production ที่เตรียมไว้โหลด `.env.production` และบังคับ `NODE_ENV=production` ตรวจให้ไฟล์ไม่มีค่าฐานข้อมูลพัฒนา โดย environment variables ที่สืบทอดมาจากเครื่อง/service มีลำดับความสำคัญเหนือไฟล์ ให้ใช้ค่าเดียวกันสำหรับตรวจ, migration, build และ runtime ดูผล `prod:check` ก่อนทุกครั้ง ไม่ตั้ง `PORT` หรือรหัสฐานข้อมูลแบบ global ให้กระทบโปรเจกต์อื่น

production wrappers ไม่ใช้ `.env` ของเครื่องพัฒนาเป็น fallback ค่าหลักที่จำเป็นต้องมาจาก `.env.production` หรือ environment ที่กำหนดไว้ชัดเจน หากขาดหรือยังเป็น placeholder คำสั่งจะหยุดก่อนทำงาน ไม่ต้องคัดลอก `.env` เดิมทั้งไฟล์ไปเซิร์ฟเวอร์

production ใช้ชื่อ cookie เฉพาะ `__Host-medexplore.*` แบบ host-only บน `medexplore.medicine.up.ac.th` เพื่อไม่ชนชื่อ cookie ปกติของ NextAuth ในแอปอื่น และไม่กำหนด `Domain` ร่วมกับโปรเจกต์อื่น การอัปเดตจากรุ่นที่ใช้ชื่อเดิมจะทำให้ผู้ใช้ต้องล็อกอินใหม่ ให้ผู้ใช้เข้าผ่านโดเมนหลักเสมอ ไม่สลับล็อกอินผ่าน IP เพราะ **cookie ใช้ร่วมกันบน host/IP เดียวกันแม้คนละพอร์ต** การแยกพอร์ตอย่างเดียวจึงไม่ใช่ขอบเขตความปลอดภัยระหว่างแอปที่ไม่เชื่อใจกัน

## 4. ติดตั้ง dependencies, migration และ build

ทำในโฟลเดอร์แอปด้วย PowerShell ติดตั้ง dependencies บน Windows เครื่องเป้าหมายใหม่ ไม่คัดลอก `node_modules` มาจาก Linux หรือเครื่องอื่น เพราะมี native packages เช่น `sharp` และ `bcrypt` การ build ต้องติดตั้ง devDependencies ด้วย

ไฟล์ CSS ของโปรเจกต์ import ชุด style จาก `shadcn`/Tailwind ในขั้นตอน build จึงต้องใช้ `npm ci --include=dev` แม้ `NODE_ENV` ของเครื่องจะเป็น production อย่าใช้ `--omit=dev` ก่อน build หรือถอน build dependencies ระหว่างกำลัง build

```powershell
Set-Location -LiteralPath 'C:\Apps\MedExploreStar\current'
npm.cmd ci --include=dev
npm.cmd run prod:check
npm.cmd run db:deploy:production
```

`prod:check` ตรวจค่าตั้งและการเชื่อมต่อฐานข้อมูลแบบอ่านอย่างเดียว ไม่ได้นำ migration ไปใช้และไม่ต้องมีตารางครบก่อน ตรวจฐานข้อมูลปลายทางก่อน `db:deploy:production` และสำรองข้อมูลหากมีข้อมูลแล้ว คำสั่งนี้ใช้ `migrate deploy` โดยโหลดค่าระบบจริงให้ ไม่ใช้ `migrate dev`, `db push` หรือ `migrate reset` หากฐานข้อมูลเดิมไม่มีประวัติ Prisma migration ต้องวางแผน baseline ก่อน ไม่บังคับใช้กับฐานข้อมูลนั้นทันที

สำหรับฐานข้อมูลใหม่ ให้สร้าง roles/permissions และ ADMIN เริ่มต้นด้วย bootstrap ที่เตรียมไว้ โดยกำหนด `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` ใน environment ที่จำกัดสิทธิ์ก่อน รหัสผ่านต้องเป็นของจริงที่ไม่ซ้ำกับบัญชีทดสอบ:

```powershell
npm.cmd run db:bootstrap
```

ตรวจผลแล้วลบตัวแปร `BOOTSTRAP_ADMIN_*` ออกจากไฟล์และ environment ก่อนเริ่ม service คำสั่งนี้มีไว้สร้างผู้ดูแลเริ่มต้น ไม่ใช้เปลี่ยนรหัสผ่าน ADMIN ที่มีอยู่ หลีกเลี่ยง `npm run db:seed` บน production เพราะ seed สำหรับพัฒนามีบัญชีตัวอย่าง

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build:production
npm.cmd run start:production
```

`build:production` สร้าง Prisma Client และ production build ภายใต้ environment เดียวกัน ต้องสำเร็จก่อนเริ่มโปรแกรม ไฟล์ `.next/BUILD_ID` ต้องเป็น build ของ source รุ่นเดียวกัน โปรเจกต์ใช้ Google Fonts ตอน build จึงต้องเข้าถึงบริการดังกล่าวได้ หากเครือข่ายองค์กรปิดไว้ ให้เตรียม self-hosted fonts และทดสอบ build แยกก่อนนำขึ้นจริง

ทดสอบ process ด้วยการเปิด `http://127.0.0.1:3101/login` บนเซิร์ฟเวอร์ แล้วหยุดด้วย Ctrl+C ก่อนเริ่ม Windows Service ไม่ให้แย่งพอร์ตกัน ขั้นตอนนี้ใช้ทดสอบ backend เท่านั้น การทดสอบล็อกอินและกล้องจริงให้เปิดผ่าน `https://medexplore.medicine.up.ac.th` ของ IIS ที่ใบรับรองเชื่อถือได้

## 5. ตั้ง IIS/HTTPS และ forwarded headers

คัดลอก `deploy/windows/web.config.example` ไป proxy root ใหม่เป็น `web.config` เมื่อผู้ดูแลตรวจ binding และใบรับรองแล้ว ตัวอย่างรับเฉพาะ host `medexplore.medicine.up.ac.th` (รวมกรณีระบุ `:443`) และ rewrite ไป `127.0.0.1:3101` หากเปลี่ยน hostname หรือพอร์ต public ให้เปลี่ยนทั้ง regex ของ host, `HTTP_X_FORWARDED_HOST`, IIS binding และ `NEXTAUTH_URL` ถ้าเปลี่ยนพอร์ต Node.js ให้เปลี่ยน `PORT` และ rewrite destination ให้ตรงกัน

ที่ IIS Manager:

1. สร้าง Site และ Application Pool ใหม่ ตั้ง binding `https / IP 10.205.10.200 / port 443 / Host name medexplore.medicine.up.ac.th` เปิด **Require Server Name Indication (SNI)** และเลือกใบรับรองที่ครอบคลุมโดเมนนี้ ตรวจความเข้ากันได้กับ binding เดิมร่วมกับผู้ดูแล ไม่เปลี่ยน hostless/default binding ของ site อื่น ตัวอย่างนี้เป็น HTTPS-only จึงไม่มี HTTP redirect ที่ไปแย่ง port 80 เดิม
2. ให้ผู้ดูแลตรวจ ARR Proxy ที่ใช้อยู่ การเปิด proxy/เปลี่ยน `preserveHostHeader` หรือ `reverseRewriteHostInResponseHeaders` แบบ global อาจกระทบแอปอื่น จึงต้องคงค่าของแอปเดิมและกำหนดเฉพาะ Site ของ MedExplore ผ่าน configuration scope/location ที่ IIS รุ่นนั้นรองรับและอนุญาตก่อน หาก scope ไม่รองรับ ให้ฝ่าย IT ออกแบบเส้นทาง proxy ที่ไม่เปลี่ยนพฤติกรรม site อื่น ไม่รันคำสั่งเปลี่ยน global ตามตัวอย่างจากอินเทอร์เน็ตทันที
3. ที่ URL Rewrite -> View Server Variables ให้ผู้ดูแลอนุญาต `HTTP_X_FORWARDED_HOST`, `HTTP_X_FORWARDED_PROTO`, `HTTP_X_FORWARDED_FOR` เฉพาะ scope ที่จำเป็นก่อนใช้กฎในไฟล์ การ delegate/allow server variables อาจต้องทำผ่านผู้ดูแลระดับเซิร์ฟเวอร์ ตรวจผลกระทบกับ site อื่นก่อน หากไม่อนุญาต IIS จะปฏิเสธกฎด้วยข้อผิดพลาด 500.50
4. ค่า forwarded host/proto ในไฟล์เป็นค่าคงที่จากผู้ดูแลและเขียนทับค่าที่ client ส่งมา โปรเจกต์ใช้ค่าเหล่านี้ตรวจ Origin ของการเปลี่ยนรหัสผ่าน/นำเข้า Excel และสร้าง URL ของ QR ไม่ส่ง header หลายค่าหรือปล่อยให้ client กำหนดเอง
5. ไม่เปิด ARR disk/output cache สำหรับ session, API, HTML หรือข้อมูลที่ล็อกอิน และอย่าเพิ่มกฎ cache ทั้งเว็บไซต์ กฎตัวอย่างส่งไฟล์ `/_next` ผ่าน Next.js เพื่อให้แอปกำหนด cache header ของแต่ละชนิดเอง

ไฟล์ตัวอย่างรับ TLS โดยตรงที่ IIS หากมี load balancer/CDN รับ TLS อีกชั้น ต้องออกแบบ trusted proxy ให้ตรงเส้นทางจริงก่อนใช้ ไม่เปิด Proxy Mode ตาม header ที่ client ปลอมได้ การตั้ง IP เพื่อบังคับเครือข่ายยังต้องตรวจเส้นทาง IP จริงขององค์กร และ private IP นี้ไม่ยืนยันว่าผู้ใช้ต่อ Wi-Fi จุดกิจกรรมนั้น

ขนาด request ที่ IIS กำหนดไว้ 6 MiB เพื่อรองรับ Excel สูงสุด 5 MiB พร้อม multipart overhead ส่วน API รูปรางวัลยังจำกัดรูป 2 MiB ตามเดิม ไม่เพิ่ม upload limit ทั่วระบบโดยไม่ตรวจฝั่ง API

ก่อนเปิดใช้งาน ให้ฝ่าย IT กำหนด rate limit สำหรับการล็อกอิน `/api/auth/callback/credentials` และการสมัคร `/api/register` ที่ proxy/เครื่องมือขององค์กร โดยพิจารณาทั้งบัญชีและแหล่งคำขอ ระวังการบล็อก IP รวมของมหาวิทยาลัย เพราะนิสิตจำนวนมากอาจออกผ่าน NAT เดียวกัน การตรวจ session/เช็คอินถี่ไม่ใช่เหตุผลให้ตั้งเพดานทั้งเว็บไซต์เท่ากับหน้าล็อกอิน และ template นี้ยังไม่ได้เปิด rate limit ให้อัตโนมัติ

## 6. ติดตั้งเป็น Windows Service

ดาวน์โหลด WinSW x64 รุ่นที่ผู้ดูแลอนุมัติจากโครงการทางการและตรวจไฟล์ตามกระบวนการองค์กร คู่มือนี้ใช้รูปแบบ bundled: ตั้งชื่อ executable `MedExploreStar.exe` และวางคู่กับไฟล์ `MedExploreStar.xml` ที่คัดลอกจาก `deploy/windows/MedExplore.xml.example` ในโฟลเดอร์ service แก้ executable, arguments, workingdirectory และ logpath ให้ตรงพาธจริง ตรวจว่าชื่อ service `MedExploreStar` ยังไม่ถูกใช้ ไม่ใช้ wrapper/service ของแอปอื่นร่วมกัน `PORT` โหลดจาก environment ของแอป จึงต้องไม่มีค่า global ของแอปอื่นมาทับ

ตั้ง dedicated service account ที่มีสิทธิ์ Log on as a service ก่อนเปิดรับผู้ใช้จริง ค่าเริ่มต้นของ wrapper อาจใช้ LocalSystem จึงต้องตรวจแท็บ Log On ของ service ให้เรียบร้อย ห้ามใส่ service account password ไว้ในไฟล์ตัวอย่าง/คู่มือ WinSW จะเริ่ม Node.js โดยตรง ไม่ผ่าน `npm.cmd` จึงติดตาม process และหยุดโปรแกรมได้ชัดเจนกว่า shell หลายชั้น

คำสั่งต่อไปนี้ให้ผู้ดูแลรันใน PowerShell แบบ Administrator เมื่อทบทวนไฟล์แล้ว:

```powershell
Set-Location -LiteralPath 'C:\Apps\MedExploreStar\service'
.\MedExploreStar.exe install
```

ตั้งบัญชี Log On/สิทธิ์ก่อน แล้วเริ่ม service:

```powershell
.\MedExploreStar.exe start
.\MedExploreStar.exe status
```

ตัวอย่าง XML ตั้ง Automatic delayed start, เริ่มใหม่เมื่อ process ล้ม, รอ shutdown 30 วินาที และหมุน stdout/stderr log เมื่อขนาดเกินเกณฑ์ ตรวจ Windows Event Viewer เพิ่มเมื่อ service เริ่มไม่ได้ ไม่เก็บรหัสผ่าน, cookie หรือ QR token ลง log การหมุน log ไม่ใช่การสำรองฐานข้อมูล

**ต้องให้ Node.js ทำงานต่อเนื่องแม้ไม่มีใครเปิดหน้าเว็บ** เพราะ `instrumentation.ts` เริ่มตัวประเมินดาวเมื่อเซิร์ฟเวอร์เริ่ม งานตรวจรายการค้างมีรอบสำรองทุก 15 วินาที และการสร้าง QR/เช็คอินตั้งเวลาประเมินตาม expiry การหยุด service ทำให้รอจนเปิดใหม่จึงประเมินรายการค้างได้ Service restart ไม่ครอบคลุมกรณี process ยังอยู่แต่ฐานข้อมูลล่ม ต้องเฝ้าดู error log และทดสอบการให้ดาวหลังเปิดใช้งาน

## 7. ทดสอบก่อนเปิดให้ผู้ใช้จริง

รันชุดตรวจสอบจากโฟลเดอร์โปรเจกต์ก่อน deploy (ต้องติดตั้ง devDependencies):

```powershell
npm.cmd run check
```

คำสั่งนี้รัน unit tests, ESLint และ TypeScript ตามลำดับ และหยุดเมื่อขั้นตอนใดล้มเหลว ใช้ `npm.cmd test` เพื่อรันเฉพาะ unit tests โดยไม่ต้องเปิดเว็บหรือเชื่อมต่อฐานข้อมูล ชุดทดสอบใช้ข้อมูลจำลองและไม่รวมไฟล์ `*.integration.test.mjs` ซึ่งบางไฟล์เขียนฐานข้อมูลจาก `.env` ห้ามใช้คำสั่ง `node --test tests/*.test.mjs` กับฐานข้อมูล production

หลังผ่านแล้วให้รัน `npm.cmd run build:production` ตามขั้นตอน build ด้านบน และทดสอบการใช้งานผ่าน IIS ต่อไป เพราะ unit tests ไม่ยืนยันการตั้งค่า HTTPS, Windows Service หรือการเชื่อมต่อฐานข้อมูลจริง

- เข้า `https://medexplore.medicine.up.ac.th` ผ่านมือถือและคอมพิวเตอร์ที่เข้าถึงเครือข่ายได้ ตรวจ DNS และ HTTPS ว่าไม่มีคำเตือนและทุกอุปกรณ์เชื่อถือ CA รวมถึงตรวจว่าโดเมนอื่นบนเครื่องยังเข้าเว็บไซต์ของตัวเองได้ตามเดิม
- ล็อกอิน/ออกจากระบบ เปลี่ยนรหัสผ่าน และดูว่า `/api/auth/session` ไม่ถูก cache; ปิดบัญชีทดสอบแล้วตรวจการแจ้งระงับและการปฏิเสธ API
- สร้างปีการศึกษาและกิจกรรมทดสอบ นำเข้า Excel และเพิ่มผู้เข้าร่วม เปิดใช้กล้องผ่าน HTTPS
- สร้าง QR ผ่าน origin ของแอปและตรวจ URL ภายใน QR ต้องเริ่มด้วย `https://medexplore.medicine.up.ac.th/scan` ไม่เป็น IP, localhost หรือโดเมนของแอปอื่น ให้นิสิตเช็คอินแล้วปิดหน้า admin ทั้งหมด รอ QR หมดอายุและตรวจว่าได้ดาวอัตโนมัติเพียงหนึ่งครั้ง
- restart service และ reboot เครื่องในช่วงทดสอบ ตรวจว่าเริ่มกลับมาเองและรายการค้างประเมินต่อได้
- ทดสอบข้อมูลจากทุกบทบาทและปิดการเข้าถึง Node.js `:3101` จากเครื่องอื่น ตรวจว่า URL เช่น `/.env.production`, `/.git/config` และ `/prisma/schema.prisma` ไม่คืนไฟล์ใน source
- ตรวจ DB connection, log rotation, พื้นที่ดิสก์ และเวลาตอบสนองภายใต้จำนวนผู้ใช้พร้อมกันที่คาดว่าจะใช้งานจริง

ใช้บัญชีและกิจกรรมทดสอบแยกจากข้อมูลจริง ไม่รัน integration tests ที่เขียนฐานข้อมูลบน production โดยไม่ตรวจขอบเขต fixtures และแผน rollback

## 8. สำรอง อัปเดต และย้อนรุ่น

รุ่นที่เตรียม production นี้อัปเดต Next.js เป็น `16.4.3`, Prisma เป็น `7.10.1` และกำหนด override `uuid@11.1.1` เฉพาะใต้ ExcelJS ตาม `package-lock.json` ผลตรวจ ณ การเตรียมรุ่นคือ `npm audit --omit=dev` ไม่พบช่องโหว่ ส่วน audit ทุก dependencies เหลือระดับ low 3 รายการในสายเครื่องมือพัฒนา `shadcn`/`deepmerge` ผล audit เปลี่ยนได้เมื่อฐานข้อมูล advisory อัปเดต จึงตรวจใหม่ก่อน deploy และอย่าใช้ `npm audit fix --force` โดยไม่ทบทวน เพราะอาจเปลี่ยน/ลดรุ่น dependency จน build หรือการทำงานเปลี่ยน

สำรองฐานข้อมูลด้วยเครื่องมือที่เข้ากับ MariaDB/MySQL รุ่นที่ใช้ ตั้งงานอัตโนมัติ และทดลอง restore ลงฐานข้อมูลทดสอบ เก็บ backup นอกโฟลเดอร์ IIS และมีสำเนานอกเครื่อง รหัสผ่านของโปรแกรม backup ให้เก็บในไฟล์ credentials ที่จำกัดสิทธิ์ ไม่ใส่ใน command line รูปรางวัลถูกเก็บในฐานข้อมูล จึงต้องรวมตารางรูปและข้อมูล binary ใน backup ด้วย

เก็บ source/lockfile รุ่นที่ใช้งาน, environment และ IIS/service configuration ที่จำกัดสิทธิ์ ตลอดจน certificate/ขั้นตอนต่ออายุที่องค์กรดูแลไว้แยกจาก Git ค่า secret ของ NextAuth ต้องคงเดิมระหว่างรุ่น

ลำดับอัปเดตที่แนะนำ:

1. เตรียม release ใหม่ในโฟลเดอร์แยก ติดตั้ง dependencies และ build โดยใช้ environment ที่ตั้งใจ อย่า build ทับ `.next` ขณะ process เดิมกำลังให้บริการ
2. อ่าน SQL ของ migrations ที่กำลังจะใช้และประเมินว่ารุ่นก่อนหน้ายังอ่าน schema ใหม่ได้หรือไม่ หากเป็นการลบ/เปลี่ยนข้อมูลให้วางแผน maintenance และ restore ก่อน
3. สำรองฐานข้อมูล ณ จุดก่อนเปลี่ยน ปิดรับการเขียนตามแผน maintenance และหยุด service รอ process จบ
4. รัน `prod:check` และ `db:deploy:production` จาก release ใหม่โดยตรวจ exit code ทุกขั้น หากไม่สำเร็จหยุดขั้นตอน ไม่เริ่ม service ด้วย schema ที่ไม่ตรง
5. เปลี่ยน arguments/workingdirectory ของ service ไป release ใหม่หรือคัดลอก release ที่ตรวจแล้วเข้าโฟลเดอร์ `current` ขณะ service หยุดอยู่ เริ่ม service แล้วทดสอบผ่าน IIS
6. หากต้องย้อนรุ่น ห้ามเริ่มโค้ดเก่ากับ schema ใหม่โดยเดาว่าเข้ากันได้ ถ้า migration ย้อนเข้ากันได้ให้ใช้ release ก่อนหน้า หากไม่เข้ากันต้องมีแผน restore ฐานข้อมูลที่ยอมรับผลกระทบต่อข้อมูลหลัง backup ห้ามใช้ `migrate reset` เป็น rollback ของ production

## เอกสารอ้างอิง

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [IIS ARR และ URL Rewrite](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing)
- [IIS HTTPS หลายโดเมนบน IP เดียวด้วย SNI](https://learn.microsoft.com/en-us/iis/get-started/whats-new-in-iis-8/iis-80-server-name-indication-sni-ssl-scalability)
- [IIS allowed server variables](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/setting-http-request-headers-and-iis-server-variables)
- [IIS request limits](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/security/requestfiltering/requestlimits/)
- [WinSW XML configuration](https://github.com/winsw/winsw/blob/v3/docs/xml-config-file.md)
- [WinSW logging](https://github.com/winsw/winsw/blob/v3/docs/logging-and-error-reporting.md)
