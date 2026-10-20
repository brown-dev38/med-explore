// Route Handler request.url can use the server's internal hostname. Next.js
// preserves the public host/protocol in these headers, including on LAN/HTTPS.
// A reverse proxy must overwrite forwarded headers with its trusted values.
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    if (source.origin !== origin || !["http:", "https:"].includes(source.protocol)) return false;
    const internal = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? internal.host;
    const protocol = request.headers.get("x-forwarded-proto") ?? internal.protocol.slice(0, -1);
    if (!host || /[\s,/@\\?#]/.test(host) || !["http", "https"].includes(protocol)) return false;
    const expected = new URL(`${protocol}://${host}`);
    return source.origin === expected.origin;
  } catch {
    return false;
  }
}
