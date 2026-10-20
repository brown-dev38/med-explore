export type AuthSession = {
  accountStatus?: "ACTIVE" | "SUSPENDED" | "DELETED" | "UNAUTHENTICATED";
  user?: {
    id?: string;
    name?: string | null;
    role?: string | null;
    roles?: string[];
    permissions?: string[];
  };
} | null;

export async function fetchSession(): Promise<AuthSession> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    return await res.json();
  } catch {
    return null;
  }
}

async function getCsrfToken(signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/auth/csrf", { credentials: "include", cache: "no-store", signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data?.csrfToken !== "string" || !data.csrfToken) throw new Error("Unable to prepare authentication request");
  return data.csrfToken;
}

export async function signInWithCredentials(
  username: string,
  password: string,
  callbackUrl = "/",
): Promise<{ ok: boolean; session: AuthSession }> {
  const csrfToken = await getCsrfToken();

  await fetch("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    credentials: "include",
    body: new URLSearchParams({
      csrfToken,
      username,
      password,
      callbackUrl,
      json: "true",
    }),
  });

  const session = await fetchSession();
  return { ok: Boolean(session?.user?.id), session };
}

export async function signOutClient(callbackUrl = "/", signal?: AbortSignal): Promise<void> {
  const csrfToken = await getCsrfToken(signal);
  const res = await fetch("/api/auth/signout", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    credentials: "include",
    signal,
    body: new URLSearchParams({ csrfToken, callbackUrl, json: "true" }),
  });
  if (!res.ok) throw new Error("Sign out failed");
  // NextAuth can return a successful HTML/redirect response when CSRF fails.
  // Confirm the session is actually gone before reporting a successful logout.
  const check = await fetch("/api/auth/session", { credentials: "include", cache: "no-store", signal });
  if (!check.ok) throw new Error("Unable to verify sign out");
  const session = await check.json();
  if (!session || typeof session !== "object" || Array.isArray(session) || session.user?.id) throw new Error("Sign out did not clear the session");
}

export async function getMicrosoftSignInUrl(callbackUrl = "/", linking = false): Promise<string> {
  if (!linking) {
    const ready = await fetch("/api/auth/microsoft-link", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login" }),
    });
    if (!ready.ok) {
      const result = await ready.json().catch(() => ({}));
      throw new Error(result.message || "ไม่สามารถเริ่มเข้าสู่ระบบด้วย Microsoft ได้");
    }
  }
  const csrfToken = await getCsrfToken();
  if (!csrfToken) throw new Error("ไม่สามารถเริ่มเข้าสู่ระบบได้ กรุณาโหลดหน้าใหม่");
  const localCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !callbackUrl.includes("\\") ? callbackUrl : "/";
  const response = await fetch("/api/auth/signin/azure-ad", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl: localCallback, json: "true" }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.url !== "string") throw new Error("ไม่สามารถเชื่อมต่อ Microsoft ได้ กรุณาลองใหม่");
  const destination = new URL(result.url, window.location.origin);
  if (destination.origin !== window.location.origin && destination.origin !== "https://login.microsoftonline.com") throw new Error("ที่อยู่สำหรับเข้าสู่ระบบไม่ถูกต้อง");
  return destination.href;
}
