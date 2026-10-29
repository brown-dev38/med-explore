import { Suspense } from "react";
import Link from "next/link";
import {
  Calendar,
  MapPin,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getStudentDashboardContext, type StudentTarget } from "@/lib/student-dashboard";
import { formatThaiDateTime } from "@/lib/datetime";
import { getStudentYearContext } from "@/lib/student-academic-years";
import type { StudentYearPageProps } from "@/lib/student-activity-filters";
import { StudentYearSelector } from "@/components/student-year-selector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";



export default function UpcomingActivitiesPage({ searchParams, target }: StudentYearPageProps & { target?: StudentTarget }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          กำลังโหลดข้อมูล...
        </div>
      }
    >
      <UpcomingActivitiesContent searchParams={searchParams} target={target} />
    </Suspense>
  );
}

async function UpcomingActivitiesContent({ searchParams, target }: StudentYearPageProps & { target?: StudentTarget }) {
  const { basePath } = await getStudentDashboardContext(target);
  const now = new Date();
  const { years, selectedYear } = await getStudentYearContext(searchParams);

  const activities = selectedYear ? await prisma.activity.findMany({
    where: {
      academicYearId: BigInt(selectedYear.id),
      status: "DRAFT",
      endsAt: { gt: now },
    },
    orderBy: { startsAt: "asc" },
  }) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          กิจกรรมที่จะมาถึงทั้งหมด
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedYear ? `ปีการศึกษา ${selectedYear.code} · เฉพาะกิจกรรมฉบับร่างที่เตรียมเปิดให้เข้าร่วม` : "ยังไม่มีปีการศึกษา"}
        </p>
      </div>

      <StudentYearSelector years={years} selectedId={selectedYear?.id ?? null} basePath={`${basePath}/upcoming`} />
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={selectedYear ? `${basePath}?academicYearId=${selectedYear.id}` : basePath} />}>กลับหน้าภาพรวม</Button>

      {activities.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/60 mb-3" />
            <p className="text-base font-semibold text-foreground">
              ยังไม่มีกิจกรรมฉบับร่างที่กำลังจะมาถึงในปีที่เลือก
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              กิจกรรมฉบับร่างใหม่ของปีที่เลือกจะแสดงที่นี่
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {activities.map((activity) => (
            <Card
              key={String(activity.id)}
              className="h-full transition-all hover:shadow-md"
            >
              <CardHeader className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg font-bold tracking-tight text-foreground line-clamp-2">
                    {activity.title}
                  </CardTitle>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    ฉบับร่าง
                  </Badge>
                </div>

                <div className="space-y-1.5 pt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatThaiDateTime(activity.startsAt.toISOString())}
                  </div>
                  <div className="pl-5">
                    ถึง {formatThaiDateTime(activity.endsAt.toISOString())}
                  </div>
                  {activity.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {activity.location}
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardFooter className="mt-auto flex-wrap justify-between gap-3 px-5 py-4">
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  เช็คอินเพื่อรับดาวหลัง QR หมดอายุ
                </span>
                <Badge variant="outline" className="text-xs font-normal">
                  รอเปิดรับลงทะเบียน
                </Badge>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
