import { guard, jsonOk, jsonError } from "@/lib/api";
import { appendJobLog, getJob, updateJob, updateProject } from "@/lib/db/repo";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return jsonError("Job tidak ditemukan", 404);
  if (job.status === "queued") {
    updateJob(id, { status: "canceled", finishedAt: new Date().toISOString(), error: "Dibatalkan oleh pengguna" });
    updateProject(job.projectId, { status: "story-ready" });
    return jsonOk({ canceled: true });
  }
  if (job.status === "running") {
    // cooperative cancel: the worker notices at its next checkpoint and aborts
    updateJob(id, { status: "canceled", finishedAt: new Date().toISOString(), error: "Dibatalkan oleh pengguna" });
    appendJobLog(id, "Permintaan pembatalan diterima — worker akan berhenti di checkpoint berikutnya");
    return jsonOk({ canceled: true, note: "Render akan berhenti pada checkpoint berikutnya." });
  }
  return jsonError("Job sudah selesai", 400);
}
