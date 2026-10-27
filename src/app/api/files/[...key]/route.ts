import { guard, jsonError } from "@/lib/api";
import { storage } from "@/lib/storage";

/** Local storage driver passthrough (only used when STORAGE_DRIVER=local). */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { key } = await ctx.params;
  const storageKey = key.map(decodeURIComponent).join("/");
  if (storageKey.includes("..")) return jsonError("Path tidak valid", 400);
  try {
    const buf = await storage().get(storageKey);
    const mime = storageKey.endsWith(".mp4")
      ? "video/mp4"
      : storageKey.endsWith(".png")
        ? "image/png"
        : storageKey.endsWith(".wav")
          ? "audio/wav"
          : storageKey.endsWith(".mp3")
            ? "audio/mpeg"
            : storageKey.endsWith(".srt")
              ? "application/x-subrip"
              : "application/octet-stream";
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" } });
  } catch {
    return jsonError("File tidak ditemukan", 404);
  }
}
