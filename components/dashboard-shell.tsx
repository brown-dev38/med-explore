"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
  Gift,
} from "lucide-react";
import { dashboardBreadcrumbs } from "@/lib/dashboard-breadcrumbs";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type IconName =
  | "dashboard"
  | "calendar"
  | "users"
  | "activities"
  | "list"
  | "qr"
  | "profile"
  | "home"
  | "rewards";

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
    case "rewards":
      return <Gift className={className} />;
  }
}

function DashboardNav({
  items,
  onNavigate,
  collapsed = false,
}: {
  items: DashboardNavItem[];
  onNavigate: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const academicYearId = useSearchParams().get("academicYearId");

  const isActive = (item: DashboardNavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <>
      {items.map((item) => {
        const active = isActive(item);
        const link = (
          <Link
            key={item.href}
            href={pathname.startsWith("/dashboard") && academicYearId && (item.href.startsWith("/dashboard") || item.href === "/scan") ? `${item.href}?academicYearId=${encodeURIComponent(academicYearId)}` : item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-xl py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${
              active
                ? "bg-primary/10 text-primary ring-1 ring-primary/10"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <NavIcon name={item.icon} />
            <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.href}>
            <TooltipTrigger render={link} />
            <TooltipContent side="right" sideOffset={12}>{item.label}</TooltipContent>
          </Tooltip>
        ) : link;
      })}
    </>
  );
}

function NavFallback({ items, collapsed = false }: { items: DashboardNavItem[]; collapsed?: boolean }) {
  return (
    <>
      {items.map((item) => (
        <span
          key={item.href}
          className={`flex min-h-11 items-center rounded-lg py-2 text-sm font-medium text-muted-foreground/60 ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
        >
          <NavIcon name={item.icon} />
          <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
        </span>
      ))}
    </>
  );
}

function DashboardBreadcrumb({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname();
  const academicYearId = useSearchParams().get("academicYearId");
  const crumbs = dashboardBreadcrumbs(pathname, items);

  return (
    <nav aria-label="เส้นทางหน้าปัจจุบัน" className="min-w-0 flex-1">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm sm:gap-x-2">
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              {index > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              {current ? (
                <span aria-current="page" className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                  {index === 0 && <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  <span className="max-w-[min(60vw,20rem)] truncate" title={crumb.label}>{crumb.label}</span>
                </span>
              ) : (
                <Link href={pathname.startsWith("/dashboard") && academicYearId ? `${crumb.href}?academicYearId=${encodeURIComponent(academicYearId)}` : crumb.href} className="flex min-w-0 items-center gap-2 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {index === 0 && <LayoutDashboard className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="max-w-[min(60vw,20rem)] truncate" title={crumb.label}>{crumb.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeMobileOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", closeMobileOnDesktop);
    return () => desktop.removeEventListener("change", closeMobileOnDesktop);
  }, []);

  return (
    <TooltipProvider delay={150}>
    <div className="min-h-dvh bg-background">
      <a href="#dashboard-content" className="sr-only z-90 rounded-lg bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">ข้ามไปเนื้อหาหลัก</a>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent id="dashboard-mobile-sidebar" variant="drawer">
          <DialogHeader className="border-b p-5 pr-12">
            <DialogTitle className="flex items-center gap-2"><Star className="size-5 fill-amber-300 text-primary" />{brand}</DialogTitle>
            <DialogDescription>{subtitle ?? "เมนูการใช้งาน"}</DialogDescription>
          </DialogHeader>
          <nav aria-label="เมนูหลักบนมือถือ" className="flex-1 space-y-1.5 overflow-y-auto px-3 py-6">
            <Suspense fallback={<NavFallback items={navItems} />}>
              <DashboardNav items={navItems} onNavigate={() => setMobileOpen(false)} />
            </Suspense>
          </nav>
          {userSlot && <div className="border-t bg-muted/20 p-4">{userSlot}</div>}
        </DialogContent>
      </Dialog>

      {/* Sidebar */}
      <aside
        id="dashboard-sidebar"
        aria-label="แถบเมนูหลัก"
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r bg-card transition-[width] duration-200 motion-reduce:transition-none lg:flex ${sidebarExpanded ? "w-64" : "w-20"}`}
      >
        <div className={`flex h-20 shrink-0 items-center border-b ${sidebarExpanded ? "gap-2.5 px-5" : "justify-center px-3"}`}>
          <span title={brand} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
            <Star className="h-4.5 w-4.5 fill-amber-300 text-amber-300" />
          </span>
          <div className={sidebarExpanded ? "min-w-0" : "sr-only"}>
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
          <Suspense fallback={<NavFallback items={navItems} collapsed={!sidebarExpanded} />}>
            <DashboardNav items={navItems} collapsed={!sidebarExpanded} onNavigate={() => setMobileOpen(false)} />
          </Suspense>
        </nav>

        {userSlot && (
          <div className={`border-t bg-muted/20 py-4 ${sidebarExpanded ? "px-4" : "px-3"}`}>
            {sidebarExpanded ? userSlot : <LogoutButton iconOnly className="h-11 w-full justify-center px-0" />}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className={`transition-[padding] duration-200 motion-reduce:transition-none ${sidebarExpanded ? "lg:pl-64" : "lg:pl-20"}`}>
        <header className="sticky top-0 z-30 flex min-h-20 items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur-sm sm:px-6 lg:h-20 lg:px-8 lg:py-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="เปิดแถบเมนู"
            aria-expanded={mobileOpen}
            aria-controls="dashboard-mobile-sidebar"
            aria-haspopup="dialog"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden shrink-0 lg:inline-flex"
            onClick={() => setSidebarExpanded((expanded) => !expanded)}
            aria-label={sidebarExpanded ? "ย่อแถบเมนู" : "ขยายแถบเมนู"}
            title={sidebarExpanded ? "ย่อแถบเมนู" : "ขยายแถบเมนู"}
            aria-expanded={sidebarExpanded}
            aria-controls="dashboard-sidebar"
          >
            {sidebarExpanded ? <PanelLeftClose className="size-5" aria-hidden="true" /> : <PanelLeftOpen className="size-5" aria-hidden="true" />}
          </Button>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          <Suspense fallback={<span className="text-sm text-muted-foreground">แดชบอร์ด</span>}>
            <DashboardBreadcrumb items={navItems} />
          </Suspense>
        </header>
        <main id="dashboard-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-7 outline-none sm:px-6 lg:px-8 lg:py-9">
          {children}
        </main>
      </div>
    </div>
    </TooltipProvider>
  );
}
