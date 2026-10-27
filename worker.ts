/**
 * Video render worker.
 *
 * Runs the heavy ffmpeg/canvas pipeline outside the Next.js request cycle so it
 * can be deployed as a separate long-running process (Railway, Fly.io, Render,
 * a VM, or a Docker container) while the frontend stays on Vercel.
 */
import { claimNextJob, failStuckJobs, getJob, updateJob, appendJobLog, updateProject, getProject } from "./src/lib/db/repo";
import { RenderCanceledError, runRenderPipeline } from "./src/lib/render/pipeline";
import { env } from "./src/lib/env";
import { ffmpegAvailable } from "./src/lib/ffmpeg";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 1500);
let running = false;
let shuttingDown = false;

async function tick() {
  if (running || shuttingDown) return;
  running = true;
  try {
    const job = claimNextJob();
    if (!job) return;
    const project = getProject(job.projectId);
    console.log(`[worker] job ${job.id} (${job.type}) untuk proyek "${project?.title ?? job.projectId}"`);
    appendJobLog(job.id, "Worker mengambil job dari antrean");
    const params = safeParse(job.paramsJson ?? undefined);
    try {
      const result = await runRenderPipeline({
        jobId: job.id,
        projectId: job.projectId,
        sceneIds: Array.isArray(params?.sceneIds) ? (params.sceneIds as string[]) : undefined,
        onProgress: (fraction, step, note) => {
          if (note) appendJobLog(job.id, `${step}: ${note}`);
        },
      });
      console.log(`[worker] selesai ${job.id} → ${result.videoAssetId} (${result.durationSeconds.toFixed(1)}s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const current = getJob(job.id);
      if (err instanceof RenderCanceledError || current?.status === "canceled") {
        console.log(`[worker] dibatalkan ${job.id}`);
        updateJob(job.id, { status: "canceled", error: "Dibatalkan oleh pengguna", finishedAt: new Date().toISOString() });
        updateProject(job.projectId, { status: "story-ready", error: null });
        return;
      }
      console.error(`[worker] gagal ${job.id}: ${message}`);
      if (current && current.status !== "error") {
        updateJob(job.id, { status: "error", error: message, finishedAt: new Date().toISOString() });
        updateProject(job.projectId, { status: "error", error: message });
      }
    }
  } catch (err) {
    console.error("[worker] loop error:", err);
  } finally {
    running = false;
  }
}

function safeParse(json?: string): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function main() {
  const ff = await ffmpegAvailable();
  console.log("=======================================================");
  console.log(" AI Video Studio — render worker");
  console.log(` ffmpeg : ${ff.ok ? ff.version : "TIDAK TERSEDIA: " + ff.error}`);
  console.log(` tts    : ${env.tts.provider}`);
  console.log(` image  : ${env.image.provider}`);
  console.log(` llm    : ${env.llm.provider}`);
  console.log(` poll   : ${POLL_MS}ms`);
  console.log("=======================================================");
  if (!ff.ok) {
    console.error("FFmpeg tidak ditemukan. Set FFMPEG_PATH atau instal @ffmpeg-installer/ffmpeg.");
    process.exit(1);
  }
  failStuckJobs();
  while (!shuttingDown) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// A stray rejection (e.g. an aborted ffmpeg encoder) must never kill the worker.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection:", reason instanceof Error ? reason.stack ?? reason.message : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaughtException:", err instanceof Error ? err.stack ?? err.message : err);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`\n[worker] ${sig} diterima, menghentikan setelah job saat ini...`);
    shuttingDown = true;
    setTimeout(() => process.exit(0), 500);
  });
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
