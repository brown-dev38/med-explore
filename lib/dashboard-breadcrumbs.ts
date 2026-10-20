type NavItem = { href: string; label: string };

export type DashboardCrumb = { href: string; label: string };

const pageLabels: Record<string, string> = {
  "academic-years": "ปีการศึกษา",
  users: "ผู้ใช้งาน",
  students: "ข้อมูลนิสิต",
  activities: "กิจกรรม",
  "green-stars": "ดาวสีเขียว / นิสิตช่วยงาน",
  "my-activities": "กิจกรรมของฉัน",
  upcoming: "กิจกรรมที่จะมาถึง",
  "year-activities": "กิจกรรมตามปีการศึกษา",
  profile: "โปรไฟล์",
  rewards: "ของรางวัล",
  redemptions: "คำขอแลกรางวัล",
  reports: "รายงานประจำปี",
};

export function dashboardBreadcrumbs(
  pathname: string,
  navItems: readonly NavItem[],
): DashboardCrumb[] {
  const root = navItems.find((item) => item.href.split("/").filter(Boolean).length === 1)?.href ?? "/dashboard";
  const crumbs: DashboardCrumb[] = [{ href: root, label: "แดชบอร์ด" }];
  const path = pathname.replace(/\/+$/, "");
  if (path === root || !path.startsWith(`${root}/`)) return crumbs;

  const segments = path.slice(root.length + 1).split("/");
  segments.forEach((segment, index) => {
    // Student IDs have no standalone page; their overview lives at /dashboard.
    if (segments[index - 1] === "students" && segments[index + 1] === "dashboard") return;

    const href = `${root}/${segments.slice(0, index + 1).join("/")}`;
    const navItem = navItems.find((item) => item.href === href);
    let label = navItem?.label ?? pageLabels[segment] ?? "รายละเอียด";
    if (segment === "dashboard" && segments[0] === "students") {
      label = "ภาพรวมนิสิต";
    } else if (segment === "my-activities" && segments[0] === "students") {
      label = "กิจกรรมของนิสิต";
    } else if (segment === "activities" && segments[0] === "green-stars") {
      label = "ช่วยงานกิจกรรม";
    } else if (index > 0 && segments[index - 1] === "activities") {
      label = "รายละเอียดกิจกรรม";
    }
    crumbs.push({ href, label });
  });
  return crumbs;
}
