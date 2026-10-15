"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { StudentActivityFilter, StudentYearOption } from "@/lib/student-activity-filters";

const STATUS_LABEL = { ACTIVE: "กำลังใช้งาน", CLOSED: "ปิดแล้ว", DRAFT: "ฉบับร่าง" };

export function StudentYearSelector({ years, selectedId, basePath = "/dashboard", filter }: {
  years: StudentYearOption[];
  selectedId: string | null;
  basePath?: "/dashboard" | "/dashboard/upcoming" | "/dashboard/year-activities";
  filter?: StudentActivityFilter;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3" aria-busy={pending}>
      <Label htmlFor={id}>ปีการศึกษา</Label>
      <select
        id={id}
        value={selectedId ?? ""}
        disabled={pending || years.length === 0}
        className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50 sm:max-w-72"
        onChange={(event) => {
          const params = new URLSearchParams({ academicYearId: event.target.value });
          if (filter && filter !== "all") params.set("filter", filter);
          startTransition(() => router.push(`${basePath}?${params}`, { scroll: false }));
        }}
      >
        {years.length === 0 && <option value="">ยังไม่มีปีการศึกษา</option>}
        {years.map((year) => <option key={year.id} value={year.id}>{year.code} · {STATUS_LABEL[year.status]}</option>)}
      </select>
      {pending && <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />กำลังโหลดข้อมูล...</span>}
    </div>
  );
}
