"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createActivityResource, watchActivityData } from "@/lib/activity-live";

export function useLiveActivityData<T>(url: string, initial: T, intervalMs = 10000) {
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const resource = useRef<ReturnType<typeof createActivityResource<T>> | null>(null);

  // Re-fetch when fresh Server Component props arrive as well as on activation.
  useEffect(() => {
    const active = createActivityResource<T>(url, setData, setFailed);
    resource.current = active;
    const stop = watchActivityData((force) => { void active.refresh(force); }, intervalMs);
    return () => {
      stop();
      active.dispose();
      if (resource.current === active) resource.current = null;
    };
  }, [url, initial, intervalMs]);

  const refresh = useCallback(() => resource.current?.refresh(true) ?? Promise.resolve(false), []);
  return { data, setData, failed, refresh };
}
