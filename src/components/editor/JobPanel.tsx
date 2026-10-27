"use client";
import clsx from "clsx";
import { Check, CircleDashed, Loader2, X, XCircle } from "lucide-react";
import type { RenderJob } from "@/lib/types";
import { ProgressBar, Spinner } from "@/components/ui/Primitives";

export function JobPanel({ job, onCancel }: { job: RenderJob; onCancel: () => void }) {
  const canCancel = job.status === "queued" || job.status === "running";
  return (
    <div className="card animate-in space-y-3 border-lime/20 bg-lime/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {job.status === "queued" ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-lime" />
          )}
          <div>
            <div className="text-sm font-semibold text-white">
              {job.status === "queued" ? `Menunggu worker${job.queuePosition ? ` · antrean #${job.queuePosition}` : ""}` : "Worker sedang memproses"}
            </div>
            <div className="text-[11px] text-mist-400">
              Job {job.id.slice(0, 8)} · {Math.round(job.progress)}%
            </div>
          </div>
        </div>
        {canCancel && (
          <button className="btn-ghost !py-1.5 text-xs text-red-300 hover:bg-red-500/10" onClick={onCancel}>
            <X className="h-3.5 w-3.5" /> {job.status === "running" ? "Hentikan render" : "Batalkan"}
          </button>
        )}
      </div>

      <ProgressBar value={job.progress} />

      <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {job.steps.map((step) => (
          <li
            key={step.key}
            className={clsx(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]",
              step.status === "active" && "bg-lime/10 text-lime",
              step.status === "done" && "text-mist-300",
              step.status === "pending" && "text-mist-400/60",
              step.status === "error" && "bg-red-500/10 text-red-300"
            )}
          >
            {step.status === "done" ? (
              <Check className="h-3.5 w-3.5 text-lime" />
            ) : step.status === "active" ? (
              <CircleDashed className="h-3.5 w-3.5 animate-spin" />
            ) : step.status === "error" ? (
              <XCircle className="h-3.5 w-3.5" />
            ) : (
              <span className="h-3.5 w-3.5 rounded-full border border-current opacity-40" />
            )}
            <span className="truncate">{step.label}</span>
            {step.note ? <span className="truncate text-mist-400/70">— {step.note}</span> : null}
          </li>
        ))}
      </ol>

      {job.logs?.length > 0 && (
        <details className="rounded-lg bg-black/40 p-2">
          <summary className="cursor-pointer text-[11px] text-mist-400">Log worker ({job.logs.length})</summary>
          <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-mist-400">
            {job.logs.slice(-40).join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}
