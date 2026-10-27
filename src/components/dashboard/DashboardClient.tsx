"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Clapperboard,
  Clock,
  Download,
  Film,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import type { Project } from "@/lib/types";
import { apiFetch, formatDuration, relativeTime } from "@/lib/client/api";
import { Badge, Card, Modal, ProgressBar, Spinner, Toast } from "@/components/ui/Primitives";

interface Props {
  initialProjects: Project[];
  queue: { queued: number; running: number };
  integrations: Record<string, { configured: boolean; [key: string]: unknown }>;
}

const STATUS: Record<string, { label: string; tone: "neutral" | "lime" | "flare" | "sky" | "red" | "amber" }> = {
  draft: { label: "Draf", tone: "neutral" },
  "story-ready": { label: "Siap render", tone: "sky" },
  queued: { label: "Dalam antrean", tone: "amber" },
  generating: { label: "Generasi berjalan", tone: "flare" },
  rendering: { label: "Rendering", tone: "flare" },
  ready: { label: "Selesai", tone: "lime" },
  error: { label: "Gagal", tone: "red" },
};

export function DashboardClient({ initialProjects, queue, integrations }: Props) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);
  const [player, setPlayer] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Project[]>("/api/projects");
      setProjects(data);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal memuat proyek", tone: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  // live updates while something is rendering
  const busy = projects.some((p) => ["queued", "generating", "rendering"].includes(p.status));
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.title.toLowerCase().includes(q) || (p.story?.tone ?? "").toLowerCase().includes(q));
  }, [projects, query]);

  const stats = useMemo(() => {
    const ready = projects.filter((p) => p.status === "ready");
    const totalSeconds = ready.reduce((a, p) => a + (p.durationSeconds ?? 0), 0);
    return { total: projects.length, ready: ready.length, seconds: totalSeconds, rendering: queue.queued + queue.running };
  }, [projects, queue]);

  const activeIntegrations = Object.entries(integrations).filter(([, v]) => v.configured).length;

  async function handleDelete() {
    if (!deleting) return;
    try {
      await apiFetch(`/api/projects/${deleting.id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== deleting.id));
      setToast({ message: "Proyek dihapus", tone: "success" });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal menghapus", tone: "error" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-mist-400">
            <Clapperboard className="h-3.5 w-3.5" /> Dashboard
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Studio Video Cerita</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
            Buat video cerita animasi vertikal hingga 2 menit dengan gaya dari video referensi, voice-over Bahasa Indonesia,
            subtitle sinkron, dan render MP4 di backend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Muat ulang
          </button>
          <Link href="/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Buat Video Baru
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-mist-300">
            <Film className="h-5 w-5" />
          </span>
          <div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-[11px] uppercase tracking-wider text-mist-400">Total proyek</div>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime/10 text-lime">
            <Play className="h-5 w-5" />
          </span>
          <div>
            <div className="text-2xl font-bold text-white">{stats.ready}</div>
            <div className="text-[11px] uppercase tracking-wider text-mist-400">Video selesai</div>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky/10 text-sky">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <div className="text-2xl font-bold text-white">{formatDuration(stats.seconds)}</div>
            <div className="text-[11px] uppercase tracking-wider text-mist-400">Total durasi</div>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-flare/10 text-flare">
            <Loader2 className={clsx("h-5 w-5", stats.rendering > 0 && "animate-spin")} />
          </span>
          <div>
            <div className="text-2xl font-bold text-white">{stats.rendering}</div>
            <div className="text-[11px] uppercase tracking-wider text-mist-400">Dalam antrean</div>
          </div>
        </Card>
      </div>

      {activeIntegrations < 3 && (
        <Card className="flex flex-col gap-3 border-amber-400/20 bg-amber-400/[0.04] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="text-sm text-amber-100/90">
              <strong>{activeIntegrations} dari 5 integrasi</strong> aktif. Aplikasi tetap bisa membuat video memakai mesin lokal
              (story engine, animasi prosedural 2D, TTS Bahasa Indonesia). Tambahkan API key untuk kualitas lebih tinggi.
            </div>
          </div>
          <Link href="/settings" className="btn-secondary shrink-0">
            Lihat integrasi
          </Link>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-mist-400">Proyek terbaru</h2>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
          <input className="input pl-9" placeholder="Cari judul atau genre…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime/10 text-lime">
            <Wand2 className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-white">Belum ada proyek</h3>
            <p className="mt-1 max-w-md text-sm text-mist-400">
              Mulai dengan ide cerita sederhana. Sistem akan membuat storyboard, visual, voice-over, subtitle, lalu merender MP4
              vertikal.
            </p>
          </div>
          <Link href="/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Buat video pertama
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onPlay={() => setPlayer(p)}
              onDelete={() => setDeleting(p)}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}

      <Modal open={Boolean(player)} onClose={() => setPlayer(null)} title={player?.title ?? "Preview"} wide>
        {player?.videoUrl ? (
          <div className="space-y-3">
            <VideoPlayer src={player.videoUrl} poster={player.thumbnailUrl} title={player.title} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mist-400">
              <span>
                {player.width}×{player.height} · {player.fps} fps · {formatDuration(player.durationSeconds)}
              </span>
              <div className="flex gap-2">
                <a className="btn-secondary" href={`${player.videoUrl}?download=1`}>
                  <Download className="h-4 w-4" /> Unduh MP4
                </a>
                {player.srtUrl && (
                  <a className="btn-ghost" href={`${player.srtUrl}?download=1`}>
                    SRT
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-mist-400">Video belum tersedia.</p>
        )}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Hapus proyek?">
        <p className="text-sm text-mist-300">
          Proyek <strong className="text-white">{deleting?.title}</strong> beserta file video, audio, dan riwayat render akan
          dihapus permanen.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setDeleting(null)}>
            Batal
          </button>
          <button className="btn-danger" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" /> Hapus permanen
          </button>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}

function VideoPlayer({ src, poster, title }: { src: string; poster?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-center text-sm text-amber-100/90">
        <p className="font-semibold">Browser tidak bisa memutar video ini secara langsung.</p>
        <p className="mt-1 text-xs text-amber-100/70">Unduh MP4-nya untuk diputar di pemutar video perangkatmu.</p>
        <a className="btn-primary mt-3" href={`${src}?download=1`}>
          <Download className="h-4 w-4" /> Unduh {title}.mp4
        </a>
      </div>
    );
  }
  return (
    <video
      src={src}
      poster={poster ?? undefined}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className="mx-auto max-h-[70vh] w-full rounded-xl bg-black"
    />
  );
}

function ProjectCard({
  project,
  onPlay,
  onDelete,
  onRefresh,
}: {
  project: Project;
  onPlay: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const status = STATUS[project.status] ?? STATUS.draft;
  const busy = ["queued", "generating", "rendering"].includes(project.status);
  const [rerendering, setRerendering] = useState(false);

  async function reRender() {
    setRerendering(true);
    try {
      await apiFetch(`/api/projects/${project.id}/render`, {
        method: "POST",
        body: JSON.stringify({ type: "full", confirmed: true }),
      });
      onRefresh();
    } catch {
      /* surfaced by refresh */
    } finally {
      setRerendering(false);
    }
  }

  return (
    <div className="card group overflow-hidden p-0 transition hover:border-white/15">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink-850">
        {project.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.thumbnailUrl} alt={project.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-mist-600">
            <Film className="h-8 w-8" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {project.story?.tone && <Badge tone="neutral">{project.story.tone}</Badge>}
        </div>
        {project.videoUrl && (
          <button
            onClick={onPlay}
            className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100"
            aria-label="Putar video"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime text-ink-950 shadow-xl">
              <Play className="ml-0.5 h-5 w-5" />
            </span>
          </button>
        )}
        <div className="absolute bottom-2 right-3 text-[11px] font-semibold text-white/90">{formatDuration(project.durationSeconds)}</div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="line-clamp-1 font-semibold text-white">{project.title}</h3>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-mist-400">
            {project.sceneCount} adegan · {project.durationTarget}s target · {relativeTime(project.updatedAt)}
          </p>
        </div>

        {busy && (
          <div className="space-y-1.5">
            <ProgressBar value={project.lastRenderProgress ?? 5} />
            <p className="text-[11px] text-mist-400">
              {project.lastRenderStatus === "queued" ? "Menunggu worker…" : "Sedang diproses worker…"}
            </p>
          </div>
        )}

        {project.status === "error" && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-300">
            Render gagal. Buka proyek untuk melihat detail.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/projects/${project.id}`} className="btn-secondary flex-1 !px-3 !py-2 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
          {project.videoUrl ? (
            <>
              <button onClick={onPlay} className="btn-ghost !px-2.5 !py-2" title="Putar">
                <Play className="h-3.5 w-3.5" />
              </button>
              <a href={`${project.videoUrl}?download=1`} className="btn-ghost !px-2.5 !py-2" title="Unduh">
                <Download className="h-3.5 w-3.5" />
              </a>
              <button onClick={reRender} className="btn-ghost !px-2.5 !py-2" title="Render ulang" disabled={rerendering || busy}>
                {rerendering ? <Spinner className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </button>
            </>
          ) : null}
          <button onClick={onDelete} className="btn-ghost !px-2.5 !py-2 text-red-400/80 hover:text-red-300" title="Hapus">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
