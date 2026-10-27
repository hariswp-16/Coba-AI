import { guard, jsonError } from "@/lib/api";
import { getAssetRow } from "@/lib/db/repo";
import { storage } from "@/lib/storage";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const asset = getAssetRow(id);
  if (!asset) return jsonError("Asset tidak ditemukan", 404);
  const url = new URL(req.url);
  const download = url.searchParams.get("download");
  try {
    const buf = await storage().get(asset.storageKey);
    const headers: Record<string, string> = {
      "Content-Type": asset.mime,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=3600",
    };
    if (download) headers["Content-Disposition"] = `attachment; filename="${asset.fileName.replace(/"/g, "")}"`;
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return jsonError("File tidak tersedia", 404);
  }
}
