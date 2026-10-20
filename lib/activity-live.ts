export const ACTIVITY_UPDATED_EVENT = "med-explore:activity-updated";
let activityRevision = 0;

export function getActivityRevision() {
  return activityRevision;
}

export function notifyActivityUpdate() {
  activityRevision++;
  window.dispatchEvent(new Event(ACTIVITY_UPDATED_EVENT));
}

// Effects are restarted when Next.js restores a page hidden by React Activity.
export function watchActivityData(refresh: (force: boolean) => void, intervalMs = 0) {
  const check = () => {
    if (document.visibilityState !== "hidden" && navigator.onLine !== false) refresh(false);
  };
  const changed = () => {
    if (document.visibilityState !== "hidden" && navigator.onLine !== false) refresh(true);
  };
  const timer = intervalMs > 0 ? window.setInterval(check, intervalMs) : null;
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  window.addEventListener(ACTIVITY_UPDATED_EVENT, changed);
  document.addEventListener("visibilitychange", check);
  check();
  return () => {
    if (timer !== null) window.clearInterval(timer);
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    window.removeEventListener(ACTIVITY_UPDATED_EVENT, changed);
    document.removeEventListener("visibilitychange", check);
  };
}

export function createActivityResource<T>(url: string, onData: (data: T) => void, onError: (failed: boolean) => void) {
  let stopped = false;
  let current: AbortController | null = null;
  let pending: Promise<boolean> | null = null;

  function refresh(force = false): Promise<boolean> {
    if (stopped) return Promise.resolve(false);
    if (pending && !force) return pending;
    current?.abort();
    const controller = new AbortController();
    current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const request = (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error("Activity data unavailable");
        const json = await response.json();
        if (!json.success || json.data === undefined) throw new Error("Invalid activity data");
        if (stopped || current !== controller || controller.signal.aborted) return false;
        onData(json.data);
        onError(false);
        return true;
      } catch {
        // Retain the last successful data during network errors or session changes.
        if (!stopped && current === controller) onError(true);
        return false;
      } finally {
        window.clearTimeout(timeout);
        if (current === controller) {
          current = null;
          pending = null;
        }
      }
    })();
    pending = request;
    return request;
  }

  return { refresh, dispose() { stopped = true; current?.abort(); } };
}
