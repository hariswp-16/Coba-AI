import { guard, jsonOk, jsonError } from "@/lib/api";
import { getJob, getProject } from "@/lib/db/repo";
import { jobQueuePosition } from "@/lib/queue";
import { getAssetRow } from "@/lib/db/repo";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return jsonError("Job tidak ditemukan", 404);
  const project = getProject(job.projectId);
  const outputUrl = job.outputAssetId ? `/api/assets/${job.outputAssetId}/file` : null;
  const srtUrl = job.srtAssetId ? `/api/assets/${job.srtAssetId}/file` : null;
  const output = job.outputAssetId ? getAssetRow(job.outputAssetId) : null;
  return jsonOk({
    ...job,
    outputUrl,
    srtUrl,
    queuePosition: jobQueuePosition(id),
    video: output
      ? { bytes: output.bytes, durationSeconds: output.durationSeconds, width: output.width, height: output.height }
      : null,
    projectStatus: project?.status ?? null,
    projectTitle: project?.title ?? null,
    thumbnailUrl: project?.thumbnailUrl ?? null,
  });
}
