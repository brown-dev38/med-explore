import { sessionExitReason, type SessionExitReason } from "@/lib/session-notices";

export const SESSION_CHECK_INTERVAL_MS = 5000;

export function monitorSession(onInvalid: (reason: SessionExitReason) => void | Promise<void>) {
  let stopped = false;
  let invalid = false;
  let checking = false;
  let controller: AbortController | null = null;

  async function check() {
    if (stopped || invalid || checking || document.visibilityState === "hidden") return;
    checking = true;
    controller = new AbortController();
    const timeout = window.setTimeout(() => controller?.abort(), 8000);
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) return;
      const reason = sessionExitReason(await response.json());
      if (!stopped && reason) {
        invalid = true;
        await onInvalid(reason);
      }
    } catch {
      // A lost connection or temporary server failure does not mean suspension.
    } finally {
      window.clearTimeout(timeout);
      controller = null;
      checking = false;
    }
  }

  const checkNow = () => { void check(); };
  const interval = window.setInterval(checkNow, SESSION_CHECK_INTERVAL_MS);
  window.addEventListener("focus", checkNow);
  window.addEventListener("online", checkNow);
  document.addEventListener("visibilitychange", checkNow);
  checkNow();

  return () => {
    stopped = true;
    controller?.abort();
    window.clearInterval(interval);
    window.removeEventListener("focus", checkNow);
    window.removeEventListener("online", checkNow);
    document.removeEventListener("visibilitychange", checkNow);
  };
}
