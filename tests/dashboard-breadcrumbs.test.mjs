import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "./load-typescript.mjs";

const { dashboardBreadcrumbs } = loadTypeScript("../lib/dashboard-breadcrumbs.ts");

function navigation(area) {
  return [
    { href: `/${area}`, label: "ภาพรวม" },
    { href: `/${area}/activities`, label: area === "organizer" ? "กิจกรรมที่จัด" : "กิจกรรม" },
    { href: `/${area}/students`, label: "ข้อมูลนิสิต" },
    { href: `/${area}/green-stars`, label: "ดาวสีเขียว / นิสิตช่วยงาน" },
    { href: `/${area}/profile`, label: "โปรไฟล์" },
  ];
}

test("each dashboard root links to its own area and handles trailing slashes", () => {
  for (const area of ["admin", "organizer", "dashboard"]) {
    assert.deepEqual(dashboardBreadcrumbs(`/${area}/`, navigation(area)), [
      { href: `/${area}`, label: "แดชบอร์ด" },
    ]);
  }
});

test("activity details retain the area's navigation label and hide the raw ID", () => {
  assert.deepEqual(dashboardBreadcrumbs("/organizer/activities/42", navigation("organizer")), [
    { href: "/organizer", label: "แดชบอร์ด" },
    { href: "/organizer/activities", label: "กิจกรรมที่จัด" },
    { href: "/organizer/activities/42", label: "รายละเอียดกิจกรรม" },
  ]);
});

test("student drill-downs link to real overview pages without a nonexistent ID-only parent", () => {
  for (const area of ["admin", "organizer"]) {
    const crumbs = dashboardBreadcrumbs(`/${area}/students/42/dashboard/year-activities`, navigation(area));
    assert.deepEqual(crumbs, [
      { href: `/${area}`, label: "แดชบอร์ด" },
      { href: `/${area}/students`, label: "ข้อมูลนิสิต" },
      { href: `/${area}/students/42/dashboard`, label: "ภาพรวมนิสิต" },
      { href: `/${area}/students/42/dashboard/year-activities`, label: "กิจกรรมตามปีการศึกษา" },
    ]);
  }
});

test("green-star activity assignments are distinguished from the main activities section", () => {
  const crumbs = dashboardBreadcrumbs("/admin/green-stars/activities", navigation("admin"));
  assert.equal(crumbs.at(-1).label, "ช่วยงานกิจกรรม");
  assert.equal(crumbs.at(-2).href, "/admin/green-stars");
});

test("year-activity views absent from the sidebar still have a readable breadcrumb", () => {
  assert.deepEqual(dashboardBreadcrumbs("/dashboard/year-activities", navigation("dashboard")), [
    { href: "/dashboard", label: "แดชบอร์ด" },
    { href: "/dashboard/year-activities", label: "กิจกรรมตามปีการศึกษา" },
  ]);
});

test("annual reports have a readable breadcrumb in both staff areas", () => {
  for (const area of ["admin", "organizer"]) assert.equal(dashboardBreadcrumbs(`/${area}/reports`, navigation(area)).at(-1).label, "รายงานประจำปี");
});

test("staff viewing another student's activities do not see a 'my activities' label", () => {
  const crumbs = dashboardBreadcrumbs("/admin/students/42/dashboard/my-activities", navigation("admin"));
  assert.equal(crumbs.at(-1).label, "กิจกรรมของนิสิต");
});
