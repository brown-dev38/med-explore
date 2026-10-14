"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type IconName =
  | "dashboard"
  | "calendar"
  | "users"
  | "activities"
  | "list"
  | "qr"
  | "profile"
  | "home";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
};

function NavIcon({ name }: { name: IconName }) {
  const props = {
    className: "h-5 w-5 shrink-0",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "dashboard":
      return (
        <svg {...props}>
          <path d="M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-4H4v4Zm10-11h6V4h-6v5Z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <path d="M8 3v4m8-4v4M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 8v-1a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
        </svg>
      );
    case "activities":
      return (
        <svg {...props}>
          <path d="M9 5h6m-7 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm-.5-1.5h9" />
          <path d="M9 13h6M9 16h4" />
        </svg>
      );
    case "list":
      return (
        <svg {...props}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "qr":
      return (
        <svg {...props}>
          <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 3h3v3h-3v-3Zm3-3h3M14 14h.01" />
        </svg>
      );
    case "profile":
      return (
        <svg {...props}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />
        </svg>
      );
    case "home":
      return (
        <svg {...props}>
          <path d="M4 10.5 12 4l8 6.5M6 9v10h12V9" />
        </svg>
      );
  }
}

function DashboardNav({
  items,
  onNavigate,
}: {
  items: DashboardNavItem[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  const isActive = (item: DashboardNavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <>
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-neutral-800 dark:hover:text-white"
            }`}
          >
            <NavIcon name={item.icon} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

function NavFallback({ items }: { items: DashboardNavItem[] }) {
  return (
    <>
      {items.map((item) => (
        <span
          key={item.href}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400"
        >
          <NavIcon name={item.icon} />
          <span className="truncate">{item.label}</span>
        </span>
      ))}
    </>
  );
}

export function DashboardShell({
  brand,
  subtitle,
  navItems,
  userSlot,
  children,
}: {
  brand: string;
  subtitle?: string;
  navItems: DashboardNavItem[];
  userSlot?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-neutral-800 dark:bg-neutral-900">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 dark:border-neutral-700 dark:text-slate-300"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-sm font-bold text-slate-900 dark:text-white">
          {brand}
        </span>
        <span className="h-9 w-9" />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 dark:border-neutral-800 dark:bg-neutral-900 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-400 text-amber-300">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {brand}
            </p>
            {subtitle && (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="ปิดเมนู"
            className="ml-auto text-slate-400 lg:hidden"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          <Suspense fallback={<NavFallback items={navItems} />}>
            <DashboardNav items={navItems} onNavigate={() => setOpen(false)} />
          </Suspense>
        </nav>

        {userSlot && (
          <div className="border-t border-slate-200 px-4 py-4 dark:border-neutral-800">
            {userSlot}
          </div>
        )}
      </aside>

      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
