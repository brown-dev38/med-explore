"use client";

import { useState } from "react";
import { FileSpreadsheet, Plus, LockKeyhole } from "lucide-react";
import type { GreenWorkCandidate } from "@/lib/green-star-work";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GreenWorkAwardForm } from "@/components/green-work-award-form";
import { GreenStarExcelImport } from "@/components/green-star-excel-import";

export function GreenWorkActions({ yearId, yearCode, closed, initialCandidates }: {
  yearId: string; yearCode: string; closed: boolean; initialCandidates: GreenWorkCandidate[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  return <div className="space-y-4">
    {closed && <p role="status" className="flex items-start gap-2 rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" />ปีการศึกษานี้ปิดแล้ว สามารถดูประวัติงานช่วยเหลือได้</p>}
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1"><CardTitle className="text-lg">งานช่วยเหลือทั่วไป</CardTitle><CardDescription>ปีการศึกษา {yearCode}</CardDescription></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={closed} aria-haspopup="dialog" aria-expanded={importOpen} aria-controls="work-import-dialog" onClick={() => setImportOpen(true)}><FileSpreadsheet className="size-4" />นำเข้า Excel</Button>
            <Button size="sm" disabled={closed} aria-haspopup="dialog" aria-expanded={addOpen} aria-controls="work-add-dialog" onClick={() => setAddOpen(true)}><Plus className="size-4" />เพิ่มนิสิตช่วยงาน</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">เพิ่มนิสิตช่วยงานหรือนำเข้า Excel แล้วได้รับคนละ 1 ดาวสีเขียวสำหรับงานเดียวกัน</p>
      </CardHeader>
    </Card>
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent id="work-add-dialog" className="sm:max-w-lg">
        <DialogHeader className="sr-only"><DialogTitle>เพิ่มนิสิตช่วยงาน</DialogTitle><DialogDescription>บันทึกงานช่วยเหลือทั่วไป ปีการศึกษา {yearCode} และให้คนละ 1 ดาวสีเขียว</DialogDescription></DialogHeader>
        <GreenWorkAwardForm yearId={yearId} yearCode={yearCode} closed={closed} initialCandidates={initialCandidates} onAwarded={() => setAddOpen(false)} />
      </DialogContent>
    </Dialog>
    <Dialog open={importOpen} onOpenChange={setImportOpen}>
      <DialogContent id="work-import-dialog" className="sm:max-w-3xl">
        <DialogHeader className="sr-only"><DialogTitle>นำเข้า Excel</DialogTitle><DialogDescription>นำเข้ารายชื่อนิสิตช่วยงานทั่วไป ปีการศึกษา {yearCode} และให้คนละ 1 ดาวสีเขียว</DialogDescription></DialogHeader>
        <GreenStarExcelImport target={{ mode: "work", academicYearId: yearId }} targetLabel={`ปีการศึกษา ${yearCode}`} disabled={closed} />
      </DialogContent>
    </Dialog>
  </div>;
}
