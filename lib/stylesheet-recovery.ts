// Runs before hydration so a failed stylesheet can recover without a page reload.
export const stylesheetRecoveryScript = `(() => {
  const attempts = new WeakMap();
  function retry(link) {
    if (!(link instanceof HTMLLinkElement) || link.rel !== "stylesheet" || link.disabled) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/_next/static/") || !url.pathname.endsWith(".css")) return;
    const attempt = (attempts.get(link) || 0) + 1;
    if (attempt > 2) return;
    attempts.set(link, attempt);
    url.searchParams.set("__css_retry", String(attempt));
    link.setAttribute("blocking", "render");
    link.href = url.href;
  }
  document.addEventListener("error", (event) => retry(event.target), true);
  function recoverFailedStylesheets() {
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      if (attempts.has(link)) return;
      try {
        if (link.sheet) {
          void link.sheet.cssRules;
          return;
        }
      } catch {}
      retry(link);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", recoverFailedStylesheets, { once: true });
  } else {
    recoverFailedStylesheets();
  }
})();`;
