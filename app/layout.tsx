import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Kanit, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SessionGuard } from "@/components/session-guard";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  // Keep Inter's Arial fallback from taking precedence over Kanit for Thai text.
  adjustFontFallback: false,
  fallback: [],
});

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedExplore Star",
  description: "ระบบสะสมดาวและแลกของรางวัลกิจกรรม MedExplore Star",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      className={`${inter.variable} ${kanit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Suspense fallback={null}><SessionGuard /></Suspense>
        <Toaster richColors closeButton position="top-right" duration={5000} />
      </body>
    </html>
  );
}
