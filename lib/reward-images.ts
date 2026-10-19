import "server-only";
import sharp from "sharp";
import { RewardError } from "@/lib/rewards";
import { MAX_REWARD_IMAGE_BYTES, REWARD_IMAGE_TYPES } from "@/lib/reward-image-rules";

export type RewardImageChange = {
  imageData: Uint8Array<ArrayBuffer> | null;
  imageMimeType: string | null;
  imageUpdatedAt: Date | null;
};

export async function normalizeRewardImage(file: File): Promise<RewardImageChange> {
  if (!file.size || !REWARD_IMAGE_TYPES.includes(file.type)) throw new RewardError("กรุณาเลือกไฟล์ JPG, PNG หรือ WebP", 400);
  if (file.size > MAX_REWARD_IMAGE_BYTES) throw new RewardError("รูปภาพต้องมีขนาดไม่เกิน 2 MB", 413);
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 20000000 });
    const metadata = await image.metadata();
    const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    const mime = formats[metadata.format ?? ""];
    if (!mime || mime !== file.type || (metadata.pages ?? 1) > 1) throw new RewardError("รองรับเฉพาะภาพนิ่ง JPG, PNG และ WebP ที่ถูกต้อง", 400);
    const data = await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    if (data.length > MAX_REWARD_IMAGE_BYTES) throw new RewardError("รูปภาพมีขนาดใหญ่เกินไป กรุณาลดขนาดแล้วลองใหม่", 413);
    return { imageData: new Uint8Array(data), imageMimeType: "image/webp", imageUpdatedAt: new Date() };
  } catch (error) {
    if (error instanceof RewardError) throw error;
    throw new RewardError("ไฟล์รูปภาพไม่ถูกต้องหรือมีขนาดภาพใหญ่เกินไป", 400);
  }
}

export async function parseRewardBody(request: Request): Promise<{ data: unknown; image?: RewardImageChange }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return { data: await request.json().catch(() => null) };
  }
  // Bound the full stream, including chunked uploads, before parsing multipart data.
  const limit = MAX_REWARD_IMAGE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new RewardError("รูปภาพต้องมีขนาดไม่เกิน 2 MB", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RewardError("ไม่พบข้อมูลที่อัปโหลด", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RewardError("รูปภาพต้องมีขนาดไม่เกิน 2 MB", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  } catch { throw new RewardError("ข้อมูลอัปโหลดไม่ถูกต้อง", 400); }
  const raw = form.get("data");
  let data: unknown;
  try { data = typeof raw === "string" ? JSON.parse(raw) : null; } catch { data = null; }
  const file = form.get("image");
  const remove = form.get("removeImage") === "true";
  if (file !== null && (!(file instanceof File) || remove)) throw new RewardError("ข้อมูลรูปภาพไม่ถูกต้อง", 400);
  if (file instanceof File) return { data, image: await normalizeRewardImage(file) };
  return { data, ...(remove ? { image: { imageData: null, imageMimeType: null, imageUpdatedAt: null } } : {}) };
}
