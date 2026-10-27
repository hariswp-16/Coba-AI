import { z } from "zod";
import { guard, jsonOk, jsonError, parseBody, errorMessage } from "@/lib/api";
import { getProject, getLatestJob, getProjectRow, updateProject } from "@/lib/db/repo";
import { enqueueJob, jobQueuePosition } from "@/lib/queue";
import { estimateProjectCost } from "@/lib/render/pipeline";
import { mapProjectRow } from "@/lib/db/repo";
import { env } from "@/lib/env";

const schema = z.object({
  sceneIds: z.array(z.string()).optional(),
  type: z.enum(["full", "scene", "audio", "visual"]).default("full"),
  confirmed: z.boolean().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = getProjectRow(id);
  if (!row) return jsonError("Proyek tidak ditemukan", 404);
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  const project = getProject(id)!;
  if (!project.story?.scenes.length) return jsonError("Buat storyboard terlebih dahulu", 400);
  if (!body.confirmed) {
    const estimate = estimateProjectCost(mapProjectRow(row));
    return jsonError("Konfirmasi diperlukan sebelum generasi dimulai", 428, { requiresConfirmation: true, estimate });
  }
  const active = getLatestJob(id);
  if (active && (active.status === "queued" || active.status === "running")) {
    return jsonError("Masih ada proses render yang berjalan untuk proyek ini", 409, { jobId: active.id });
  }
  const estimate = estimateProjectCost(mapProjectRow(row));
  const jobId = enqueueJob({
    projectId: id,
    type: body.type,
    estimatedCostUsd: estimate.usd,
    payload: { sceneIds: body.sceneIds ?? null },
  });
  updateProject(id, { status: "queued" as never });
  return jsonOk({ jobId, queuePosition: jobQueuePosition(jobId), estimate, note: "Render antre di worker backend. Jangan tutup halaman ini; progres akan terus diperbarui." });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = getProjectRow(id);
  if (!row) return jsonError("Proyek tidak ditemukan", 404);
  const estimate = estimateProjectCost(mapProjectRow(row));
  return jsonOk({
    estimate,
    limits: env.limits,
  });
}
