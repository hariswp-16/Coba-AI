import { guard, jsonError } from "@/lib/api";
import { getAssetRow } from "@/lib/db/repo";
import { storage } from "@/lib/storage";
import { serveFile } from "@/lib/serve";

/**
 * Streams a stored asset. Supports HTTP Range so <video>/<audio> can seek and
 * so Safari (which requires 206 responses) can play the MP4 at all.
 */
async function respond(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const asset = getAssetRow(id);
  if (!asset) return jsonError("Asset tidak ditemukan", 404);
  const url = new URL(req.url);
  const driver = storage();
  try {
    let filePath: string | null = null;
    try {
      filePath = await driver.localPath(asset.storageKey);
    } catch {
      filePath = null;
    }
    const buffer = filePath ? null : await driver.get(asset.storageKey);
    return await serveFile({
      filePath,
      buffer,
      contentType: asset.mime,
      fileName: asset.fileName,
      download: Boolean(url.searchParams.get("download")),
      rangeHeader: req.headers.get("range"),
    });
  } catch (err) {
    console.error("[assets] gagal menyajikan file", asset.storageKey, err);
    return jsonError("File tidak tersedia", 404);
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return respond(req, ctx);
}

export async function HEAD(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const res = await respond(req, ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}
