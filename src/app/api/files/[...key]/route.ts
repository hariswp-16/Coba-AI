import { guard, jsonError } from "@/lib/api";
import { storage } from "@/lib/storage";
import { serveFile } from "@/lib/serve";

/** Local storage driver passthrough (only used when STORAGE_DRIVER=local). */
function mimeFor(key: string): string {
  if (key.endsWith(".mp4") || key.endsWith(".m4v")) return "video/mp4";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".srt")) return "application/x-subrip";
  if (key.endsWith(".vtt")) return "text/vtt";
  return "application/octet-stream";
}

async function respond(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { key } = await ctx.params;
  const storageKey = key.map(decodeURIComponent).join("/");
  if (storageKey.includes("..")) return jsonError("Path tidak valid", 400);
  const url = new URL(req.url);
  const driver = storage();
  try {
    let filePath: string | null = null;
    try {
      filePath = await driver.localPath(storageKey);
    } catch {
      filePath = null;
    }
    const buffer = filePath ? null : await driver.get(storageKey);
    return await serveFile({
      filePath,
      buffer,
      contentType: mimeFor(storageKey),
      fileName: storageKey.split("/").pop(),
      download: Boolean(url.searchParams.get("download")),
      rangeHeader: req.headers.get("range"),
    });
  } catch {
    return jsonError("File tidak ditemukan", 404);
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  return respond(req, ctx);
}

export async function HEAD(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const res = await respond(req, ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}
