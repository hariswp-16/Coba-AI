import { z } from "zod";
import { guard, jsonOk, jsonError, parseBody, errorMessage } from "@/lib/api";
import { deleteProject, getProject, getProjectRow, updateProject } from "@/lib/db/repo";
import { storage } from "@/lib/storage";
import { getAssetRow } from "@/lib/db/repo";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const project = getProject(id);
  if (!project) return jsonError("Proyek tidak ditemukan", 404);
  return jsonOk(project);
}

const patchSchema = z.object({
  title: z.string().min(1).max(140).optional(),
  story: z.record(z.string(), z.unknown()).optional(),
  subtitleSettings: z.record(z.string(), z.unknown()).optional(),
  audioSettings: z.record(z.string(), z.unknown()).optional(),
  voiceSettings: z.record(z.string(), z.unknown()).optional(),
  durationTarget: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]).optional(),
  styleProfileId: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!getProjectRow(id)) return jsonError("Proyek tidak ditemukan", 404);
  const parsed = await parseBody(req, patchSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  try {
    updateProject(id, {
      title: body.title,
      story: body.story,
      subtitleSettings: body.subtitleSettings,
      audioSettings: body.audioSettings,
      voiceSettings: body.voiceSettings,
      durationTarget: body.durationTarget,
      styleProfileId: body.styleProfileId,
    });
    return jsonOk(getProject(id));
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = getProjectRow(id);
  if (!row) return jsonError("Proyek tidak ditemukan", 404);
  // remove stored files created by this project
  for (const assetId of [row.video_asset_id, row.srt_asset_id, row.thumbnail_asset_id]) {
    if (!assetId) continue;
    const asset = getAssetRow(String(assetId));
    if (asset) {
      try {
        await storage().delete(asset.storageKey);
      } catch {
        /* orphaned file is acceptable */
      }
    }
  }
  deleteProject(id);
  return jsonOk({ deleted: id });
}
