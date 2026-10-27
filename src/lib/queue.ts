import { createJob } from "./db/repo";
import { getDb } from "./db/index";
import type { RenderJob } from "./types";

export function enqueueJob(params: {
  projectId: string;
  type: RenderJob["type"];
  estimatedCostUsd: number | null;
  payload?: Record<string, unknown>;
}): string {
  return createJob({
    projectId: params.projectId,
    type: params.type,
    estimatedCostUsd: params.estimatedCostUsd,
    params: params.payload,
  });
}

export function queueStats(): { queued: number; running: number } {
  const db = getDb();
  const q = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued'").get() as { n: number };
  const r = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'running'").get() as { n: number };
  return { queued: q.n, running: r.n };
}

export function jobQueuePosition(jobId: string): number {
  const db = getDb();
  const row = db.prepare("SELECT created_at, status FROM jobs WHERE id = ?").get(jobId) as { created_at: string; status: string } | undefined;
  if (!row || row.status !== "queued") return 0;
  const ahead = db
    .prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued' AND created_at < ?")
    .get(row.created_at) as { n: number };
  return ahead.n + 1;
}
