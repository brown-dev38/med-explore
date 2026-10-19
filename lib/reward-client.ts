export async function mutateReward(path: string, method: "POST" | "PATCH" | "DELETE", data?: unknown) {
  const multipart = data instanceof FormData;
  const response = await fetch(path, {
    method, headers: multipart ? undefined : { "Content-Type": "application/json" },
    body: multipart ? data : data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message ?? "ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
  return result?.data;
}
