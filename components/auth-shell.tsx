import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthShell({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_65%)] px-4 py-10 sm:py-16">
      <div className="w-full max-w-lg space-y-7">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-4" /> กลับหน้าแรก
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/15">
            <Star className="size-6 fill-amber-300 text-amber-300" />
          </span>
          <div>
            <p className="text-lg font-bold tracking-tight">MedExplore Star</p>
            <p className="text-sm text-muted-foreground">ทุกการเรียนรู้ มีความหมาย</p>
          </div>
        </div>
        <Card className="shadow-xl shadow-primary/5">
          <CardHeader className="p-6 pb-5 sm:p-8 sm:pb-5">
            <CardTitle className="text-2xl font-bold">{title}</CardTitle>
            <CardDescription className="leading-relaxed">{description}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 sm:p-8 sm:pt-0">{children}</CardContent>
        </Card>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          พบปัญหาการใช้งาน กรุณาติดต่อผู้ดูแลระบบโครงการ
        </p>
      </div>
    </main>
  );
}
