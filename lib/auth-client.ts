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
  const res = await fetch("/api/auth/csrf", { credentials: "include", signal });
  const data = await res.json().catch(() => ({}));
  return data.csrfToken as string;
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
}
