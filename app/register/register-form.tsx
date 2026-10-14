"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterForm() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    studentCode: "",
    firstname: "",
    lastname: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // ตรวจสอบความถูกต้องเบื้องต้น
    if (!formData.username.trim() || !formData.email.trim() || !formData.password) {
      setErrorMessage("กรุณากรอกชื่อผู้ใช้, อีเมล และรหัสผ่าน");
      return;
    }

    if (formData.password.length < 6) {
      setErrorMessage("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    try {
      setIsLoading(true);

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentCode: formData.studentCode.trim() || null,
          firstname: formData.firstname.trim() || null,
          lastname: formData.lastname.trim() || null,
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || "เกิดข้อผิดพลาดในการลงทะเบียน");
        setIsLoading(false);
        return;
      }

      setSuccessMessage("ลงทะเบียนสำเร็จ! กำลังนำคุณไปยังหน้าเข้าสู่ระบบ...");
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch {
      setErrorMessage("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* แจ้งเตือนสำเร็จ */}
      {successMessage && (
        <div
          role="status"
          className="flex items-start gap-3 p-3.5 text-sm rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 animate-in fade-in duration-200"
        >
          <svg
            className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="flex-1 font-medium">{successMessage}</span>
        </div>
      )}

      {/* แจ้งเตือนข้อผิดพลาด */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 p-3.5 text-sm rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 animate-in fade-in duration-200"
        >
          <svg
            className="w-5 h-5 shrink-0 mt-0.5 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="flex-1 font-medium leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* ชื่อ - นามสกุล (2 คอลัมน์) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor="firstname"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            ชื่อจริง
          </label>
          <input
            id="firstname"
            name="firstname"
            type="text"
            disabled={isLoading}
            value={formData.firstname}
            onChange={handleChange}
            placeholder="เช่น สมชาย"
            className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="lastname"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            นามสกุล
          </label>
          <input
            id="lastname"
            name="lastname"
            type="text"
            disabled={isLoading}
            value={formData.lastname}
            onChange={handleChange}
            placeholder="เช่น ใจดี"
            className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>
      </div>

      {/* รหัสนิสิต */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor="studentCode"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            รหัสนิสิต (สำหรับนิสิต)
          </label>
          <span className="text-[11px] text-slate-400">ไม่บังคับ</span>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
              />
            </svg>
          </div>
          <input
            id="studentCode"
            name="studentCode"
            type="text"
            disabled={isLoading}
            value={formData.studentCode}
            onChange={handleChange}
            placeholder="เช่น 6601xxxxxx"
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>
      </div>

      {/* ชื่อผู้ใช้ (Username) */}
      <div className="space-y-1">
        <label
          htmlFor="username"
          className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
        >
          ชื่อผู้ใช้ (Username) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            disabled={isLoading}
            value={formData.username}
            onChange={handleChange}
            placeholder="เช่น somchai_m"
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>
      </div>

      {/* อีเมล */}
      <div className="space-y-1">
        <label
          htmlFor="email"
          className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
        >
          อีเมล <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isLoading}
            value={formData.email}
            onChange={handleChange}
            placeholder="somchai@med.cmu.ac.th"
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
          />
        </div>
      </div>

      {/* รหัสผ่าน & ยืนยันรหัสผ่าน */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor="password"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            รหัสผ่าน <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              disabled={isLoading}
              value={formData.password}
              onChange={handleChange}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="confirmPassword"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              disabled={isLoading}
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* แสดง / ซ่อนรหัสผ่าน */}
      <div className="flex items-center justify-between text-xs pt-0.5">
        <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>แสดงรหัสผ่าน</span>
        </label>
      </div>

      {/* ปุ่มยืนยันการลงทะเบียน */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-2 py-2.5 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-md shadow-indigo-500/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <svg
              className="w-4 h-4 animate-spin text-white"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>กำลังลงทะเบียน...</span>
          </>
        ) : (
          <span>ลงทะเบียน</span>
        )}
      </button>

      {/* ลิงก์ไปหน้าเข้าสู่ระบบ */}
      <div className="text-center pt-2 text-xs text-slate-600 dark:text-slate-400">
        มีบัญชีผู้ใช้งานอยู่แล้ว?{" "}
        <Link
          href="/login"
          className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 underline-offset-2 hover:underline transition-colors"
        >
          เข้าสู่ระบบ
        </Link>
      </div>
    </form>
  );
}

