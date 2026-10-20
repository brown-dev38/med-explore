"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getActivityRevision, watchActivityData } from "@/lib/activity-live";

export function ActivityNavigationRefresh() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const route = `${pathname}?${params.toString()}`;
  const refreshed = useRef(new Map<string, number>());

  useEffect(() => {
    if (!/^\/(dashboard|admin|organizer)(\/|$)/.test(pathname)) return;
    return watchActivityData(() => {
      const revision = getActivityRevision();
      if (revision === 0 || refreshed.current.get(route) === revision) return;
      refreshed.current.set(route, revision);
      // Refresh each affected route once after a mutation, including preserved pages.
      router.refresh();
    });
  }, [pathname, route, router]);

  return null;
}
