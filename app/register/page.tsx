import RegisterForm from "./register-form";

export const metadata = {
  title: "ลงทะเบียนผู้ใช้งานใหม่ | MedExplore Star",
  description: "สมัครสมาชิกและลงทะเบียนเข้าร่วมระบบ MedExplore Star",
};

export default function RegisterPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-slate-50 via-sky-50/50 to-indigo-50/40 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 py-12">
      <div className="w-full max-w-lg">
        {/* ส่วนหัวและโลโก้ */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 text-white shadow-lg shadow-indigo-500/30 mb-3 ring-4 ring-white dark:ring-neutral-800">
            {/* MedExplore Star Icon */}
            <svg
              className="w-7 h-7 text-amber-300 drop-shadow-sm"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            สร้างบัญชีผู้ใช้ใหม่
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            สมัครสมาชิกเพื่อเริ่มสะสมดาวในระบบ MedExplore Star
          </p>
        </div>

        {/* กล่องแบบฟอร์มลงทะเบียน */}
        <div className="bg-white/95 dark:bg-neutral-900/90 backdrop-blur-md rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-neutral-800 p-6 sm:p-8">
          <RegisterForm />
        </div>

        {/* ข้อความช่วยเหลือ */}
        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          สำหรับนิสิตและบุคลากรทางการแพทย์ | โครงการ MedExplore Star
        </p>
      </div>
    </main>
  );
}

