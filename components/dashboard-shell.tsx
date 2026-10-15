"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Calendar,
  Users,
  CalendarDays,
  ListChecks,
  QrCode,
  User,
  Home,
  Menu,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const className = "h-4.5 w-4.5 shrink-0";
  switch (name) {
    case "dashboard":
      return <LayoutDashboard className={className} />;
    case "calendar":
      return <Calendar className={className} />;
    case "users":
      return <Users className={className} />;
    case "activities":
      return <CalendarDays className={className} />;
    case "list":
      return <ListChecks className={className} />;
    case "qr":
      return <QrCode className={className} />;
    case "profile":
      return <User className={className} />;
    case "home":
      return <Home className={className} />;
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
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-primary/10 text-primary ring-1 ring-primary/10"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/60"
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
    <div className="min-h-dvh bg-background">
      <a href="#dashboard-content" className="sr-only z-90 rounded-lg bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">ข้ามไปเนื้อหาหลัก</a>
      {/* Mobile Topbar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
          <span>{brand}</span>
        </div>
        <span className="h-9 w-9" />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-0 left-0 h-dvh max-h-dvh w-80 max-w-[calc(100%-3rem)] translate-x-0 translate-y-0 rounded-none border-r p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Star className="size-5 fill-amber-300 text-primary" />{brand}</DialogTitle>
            <DialogDescription>{subtitle ?? "เมนูการใช้งาน"}</DialogDescription>
          </DialogHeader>
          <nav aria-label="เมนูหลักบนมือถือ" className="space-y-1.5 self-start">
            <Suspense fallback={<NavFallback items={navItems} />}>
              <DashboardNav items={navItems} onNavigate={() => setOpen(false)} />
            </Suspense>
          </nav>
          {userSlot && <div className="self-end border-t pt-5">{userSlot}</div>}
        </DialogContent>
      </Dialog>

      {/* Sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card lg:flex"
      >
        <div className="flex items-center gap-2.5 px-5 py-5 border-b">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
            <Star className="h-4.5 w-4.5 fill-amber-300 text-amber-300" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {brand}
            </p>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <nav aria-label="เมนูหลัก" className="flex-1 space-y-1.5 overflow-y-auto px-3 py-6">
          <Suspense fallback={<NavFallback items={navItems} />}>
            <DashboardNav items={navItems} onNavigate={() => setOpen(false)} />
          </Suspense>
        </nav>

        {userSlot && (
          <div className="border-t bg-muted/20 px-4 py-4">
            {userSlot}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="lg:pl-64">
        <div className="hidden h-16 items-center justify-between border-b bg-card/70 px-8 lg:flex">
          <p className="text-sm font-medium text-muted-foreground">{subtitle ?? brand}</p>
          <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />MedExplore Star</span>
        </div>
        <main id="dashboard-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-7 outline-none sm:px-6 lg:px-8 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
