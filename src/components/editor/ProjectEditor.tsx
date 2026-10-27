"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clapperboard,
  Download,
  Film,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { Project, RenderJob, Scene, StyleProfileSpec } from "@/lib/types";
import { apiFetch, formatDuration } from "@/lib/client/api";
import { Badge, Card, Field, Modal, ProgressBar, Spinner, Stat, Toast } from "@/components/ui/Primitives";
import { SceneCard } from "./SceneCard";
import { JobPanel } from "./JobPanel";

interface Props {
  project: Project;
  style: { id: string; name: string; spec: StyleProfileSpec } | null;
  styles: { id: string; name: string }[];
  initialJob: RenderJob | null;
  limits: { maxProjectSeconds: number; allowedSeconds: readonly number[]; maxUploadBytes: number };
}

type Tab = "storyboard" | "subtitle" | "audio" | "style";

export function ProjectEditor({ project: initial, style, styles, initialJob, limits }: Props) {
  const [project, setProject] = useState(initial);
  const [job, setJob] = useState<RenderJob | null>(initialJob);
  const [tab, setTab] = useState<Tab>("storyboard");
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewScene, setPreviewScene] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const dirtyRef = useRef(false);

  const scenes = project.story?.scenes ?? [];
  const active = job && (job.status === "queued" || job.status === "running");
  const totalSeconds = useMemo(() => scenes.reduce((a, s) => a + s.durationMs, 0) / 1000, [scenes]);

  // Poll the active job. The effect keys on the job id + status (not the whole
  // object) so a poll result does not restart the interval and hammer the API.
  const jobId = job?.id ?? null;
  const jobStatus = job?.status ?? null;
  useEffect(() => {
    if (!jobId || (jobStatus !== "queued" && jobStatus !== "running")) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const data = await apiFetch<RenderJob>(`/api/jobs/${jobId}`);
        if (stop) return;
        setJob(data);
        if (data.status === "done") {
          const refreshed = await apiFetch<Project>(`/api/projects/${project.id}`);
          if (stop) return;
          setProject(refreshed);
          setToast({ message: "Render selesai! Video siap diunduh.", tone: "success" });
          return;
        }
        if (data.status === "error") {
          setToast({ message: data.error ?? "Render gagal", tone: "error" });
          return;
        }
        if (data.status === "canceled") return;
      } catch {
        /* transient network error: keep polling */
      }
      if (!stop) timer = setTimeout(tick, 1800);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId, jobStatus, project.id]);

  const updateField = useCallback((patch: Partial<Project>) => {
    dirtyRef.current = true;
    setProject((p) => ({ ...p, ...patch }));
  }, []);

  function updateScene(index: number, patch: Partial<Scene>) {
    setProject((prev) => {
      if (!prev.story) return prev;
      const next = [...prev.story.scenes];
      next[index] = { ...next[index], ...patch };
      return { ...prev, story: { ...prev.story, scenes: next } };
    });
    dirtyRef.current = true;
  }

  async function save() {
    setSaving(true);
    try {
      const data = await apiFetch<Project>(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: project.title,
          story: project.story,
          subtitleSettings: project.subtitleSettings,
          audioSettings: project.audioSettings,
          styleProfileId: project.styleProfileId,
          durationTarget: project.durationTarget,
        }),
      });
      setProject(data);
      dirtyRef.current = false;
      setToast({ message: "Perubahan tersimpan", tone: "success" });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal menyimpan", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function regenerateStory() {
    setRegenerating(true);
    try {
      const data = await apiFetch<{ story: Project["story"]; fallbackReason?: string }>(`/api/projects/${project.id}/story`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setProject((p) => ({ ...p, story: data.story, status: "story-ready" }));
      setToast({ message: `Storyboard dibuat ulang (${data.story?.scenes.length ?? 0} adegan)`, tone: "success" });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal membuat storyboard", tone: "error" });
    } finally {
      setRegenerating(false);
    }
  }

  async function startRender() {
    setStarting(true);
    try {
      if (dirtyRef.current) await save();
      const data = await apiFetch<{ jobId: string; queuePosition: number }>(`/api/projects/${project.id}/render`, {
        method: "POST",
        body: JSON.stringify({ type: "full", confirmed: true }),
      });
      const created = await apiFetch<RenderJob>(`/api/jobs/${data.jobId}`);
      setJob(created);
      setConfirmOpen(false);
      setProject((p) => ({ ...p, status: "queued" as unknown as Project["status"] }));
      setToast({
        message: data.queuePosition > 1 ? `Render masuk antrean (posisi ${data.queuePosition})` : "Render dimulai oleh worker",
        tone: "success",
      });
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 428) setConfirmOpen(true);
      else setToast({ message: e.message, tone: "error" });
    } finally {
      setStarting(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Film }[] = [
    { key: "storyboard", label: `Storyboard (${scenes.length})`, icon: Film },
    { key: "subtitle", label: "Subtitle", icon: Clapperboard },
    { key: "audio", label: "Audio", icon: Settings2 },
    { key: "style", label: "Gaya visual", icon: Sparkles },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link href="/" className="btn-ghost mt-0.5 !px-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge>
              {project.story && <Badge tone="neutral">{project.story.tone}</Badge>}
              <Badge tone="neutral">
                {project.width}×{project.height} · {project.fps}fps
              </Badge>
              {style && <Badge tone="sky">{style.name}</Badge>}
            </div>
            <input
              value={project.title}
              onChange={(e) => updateField({ title: e.target.value })}
              className="w-full max-w-xl truncate rounded-lg border border-transparent bg-transparent px-0 py-0 text-2xl font-bold text-white outline-none hover:border-white/10 focus:border-lime/40 focus:bg-ink-900 focus:px-2 sm:text-3xl"
            />
            {project.story && <p className="mt-1 max-w-2xl text-sm text-mist-400">{project.story.logline}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={save} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Simpan
          </button>
          {project.videoUrl && (
            <>
              <button className="btn-secondary" onClick={() => setPreviewOpen(true)}>
                <Play className="h-4 w-4" /> Putar
              </button>
              <a className="btn-secondary" href={`${project.videoUrl}?download=1`}>
                <Download className="h-4 w-4" /> MP4
              </a>
            </>
          )}
          <button className="btn-primary" onClick={startRender} disabled={starting || Boolean(active) || scenes.length === 0}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {active ? "Sedang render…" : "Render video"}
          </button>
        </div>
      </div>

      {active && job && (
        <JobPanel job={job} onCancel={async () => {
          try {
            const res = await apiFetch<{ canceled: boolean; note?: string }>(`/api/jobs/${job.id}/cancel`, { method: "POST" });
            const data = await apiFetch<RenderJob>(`/api/jobs/${job.id}`);
            setJob(data);
            const refreshed = await apiFetch<Project>(`/api/projects/${project.id}`);
            setProject(refreshed);
            setToast({ message: res.note ?? "Render dibatalkan", tone: "info" });
          } catch (err) {
            setToast({ message: err instanceof Error ? err.message : "Gagal membatalkan", tone: "error" });
          }
        }} />
      )}

      {project.status === "error" && (
        <Card className="flex items-start gap-3 border-red-500/25 bg-red-500/[0.05]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
          <div className="text-sm text-red-200/90">
            <strong>Render terakhir gagal.</strong> {job?.error ?? "Lihat log job untuk detail."} Periksa integrasi dan coba lagi.
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Adegan" value={scenes.length} sub={`${scenes.filter((s) => s.status === "ready").length} siap`} />
        <Stat label="Durasi storyboard" value={formatDuration(totalSeconds)} sub={`target ${project.durationTarget}s`} />
        <Stat
          label="Suara"
          value={project.voiceSettings?.voiceId ?? "—"}
          sub={project.voiceSettings?.mode === "cloned" ? "suara kloning" : "preset"}
        />
        <Stat label="Progres render" value={`${job?.progress ?? 0}%`} sub={job ? jobLabel(job) : "belum dirender"} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-white/8 pb-px">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition",
                tab === t.key ? "border-lime text-lime" : "border-transparent text-mist-400 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "storyboard" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-mist-400">
              Klik kartu adegan untuk mengedit narasi, emosi, kamera, dan kata penekanan. Preview diambil dari renderer yang sama
              dengan video final.
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost !py-2 text-xs" onClick={regenerateStory} disabled={regenerating}>
                {regenerating ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Buat ulang storyboard
              </button>
            </div>
          </div>
          {scenes.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-14 text-center">
              <Sparkles className="h-7 w-7 text-lime" />
              <p className="text-sm text-mist-300">Proyek ini belum punya storyboard.</p>
              <button className="btn-primary" onClick={regenerateStory} disabled={regenerating}>
                {regenerating ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} Buat storyboard sekarang
              </button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {scenes.map((scene, i) => (
                <SceneCard
                  key={scene.id}
                  projectId={project.id}
                  scene={scene}
                  index={i}
                  total={scenes.length}
                  defaultOpen={i === 0}
                  onChange={(patch) => updateScene(i, patch)}
                  onPreview={() => {
                    setPreviewScene(i);
                    setPreviewOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "subtitle" && (
        <SubtitlePanel project={project} style={style} onChange={updateField} onSave={save} saving={saving} />
      )}

      {tab === "audio" && <AudioPanel project={project} onChange={updateField} onSave={save} saving={saving} />}

      {tab === "style" && (
        <StylePanel project={project} style={style} styles={styles} onChange={updateField} onSave={save} saving={saving} />
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Konfirmasi render video">
        <p className="text-sm text-mist-300">
          Render akan memproses <strong className="text-white">{scenes.length} adegan</strong> (~{Math.round(totalSeconds)} detik) pada{" "}
          {project.width}×{project.height} {project.quality}. Proses berjalan di worker backend dan bisa memakan beberapa menit.
        </p>
        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-xs text-mist-400">
          <div className="flex items-center gap-2 text-mist-300">
            <Zap className="h-3.5 w-3.5 text-lime" /> Estimasi biaya API mengikuti integrasi yang aktif (TTS lokal = 0).
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setConfirmOpen(false)}>
            Batal
          </button>
          <button className="btn-primary" onClick={startRender} disabled={starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Mulai render
          </button>
        </div>
      </Modal>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={project.videoUrl ? "Preview video" : "Pratinjau adegan"} wide>
        {project.videoUrl ? (
          <div className="space-y-3">
            <video
              src={project.videoUrl}
              poster={project.thumbnailUrl ?? undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="mx-auto max-h-[66vh] w-full rounded-xl bg-black"
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-mist-400">
              <span>{formatDuration(project.durationSeconds)} · {project.width}×{project.height}</span>
              <div className="flex gap-2">
                <a className="btn-secondary" href={`${project.videoUrl}?download=1`}>
                  <Download className="h-4 w-4" /> Unduh MP4
                </a>
                {project.srtUrl && (
                  <a className="btn-ghost" href={`${project.srtUrl}?download=1`}>
                    Subtitle SRT
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : scenes.length ? (
          <div className="space-y-3">
            <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-xl border border-white/10 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/projects/${project.id}/preview?scene=${previewScene}&t=1600&w=540`}
                alt={`Preview adegan ${previewScene + 1}`}
                className="aspect-[9/16] w-full object-cover"
              />
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, scenes.length - 1)}
              value={previewScene}
              onChange={(e) => setPreviewScene(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-center text-xs text-mist-400">
              Adegan {previewScene + 1} dari {scenes.length} — {scenes[previewScene]?.narration.slice(0, 80)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-mist-400">Belum ada adegan untuk dipreview.</p>
        )}
      </Modal>

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}

function statusLabel(s: string) {
  return (
    { draft: "Draf", "story-ready": "Siap render", queued: "Antre", generating: "Generasi", rendering: "Rendering", ready: "Selesai", error: "Gagal" }[
      s
    ] ?? s
  );
}
function statusTone(s: string): "neutral" | "lime" | "flare" | "sky" | "red" | "amber" {
  return ((
    { draft: "neutral", "story-ready": "sky", queued: "amber", generating: "flare", rendering: "flare", ready: "lime", error: "red" } as Record<
      string,
      "neutral" | "lime" | "flare" | "sky" | "red" | "amber"
    >
  )[s] ?? "neutral");
}
function jobLabel(job: RenderJob) {
  if (job.status === "queued") return `menunggu worker · antrean #${job.queuePosition ?? "-"}`;
  if (job.status === "done") return "selesai";
  if (job.status === "error") return "gagal";
  if (job.status === "canceled") return "dibatalkan";
  return `tahap ${job.step}`;
}

/* ------------------------------ panels ------------------------------ */

function SubtitlePanel({
  project,
  style,
  onChange,
  onSave,
  saving,
}: {
  project: Project;
  style: { spec: StyleProfileSpec } | null;
  onChange: (p: Partial<Project>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const base = { ...(style?.spec.subtitle ?? {}), ...(project.subtitleSettings ?? {}) } as Record<string, unknown>;
  const set = (key: string, value: unknown) => onChange({ subtitleSettings: { ...project.subtitleSettings, [key]: value } });
  const num = (key: string, fallback: number) => Number(base[key] ?? fallback);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-white">Tipografi subtitle</h3>
          <p className="text-xs text-mist-400">Nilai dari profil gaya sudah diterapkan; ubah di sini untuk proyek ini saja.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ukuran font" hint={`${num("fontSize", 52)} px (ruang 720×1280)`}>
            <input type="range" min={32} max={92} value={num("fontSize", 52)} onChange={(e) => set("fontSize", Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="Posisi vertikal" hint={`${(num("positionY", 0.7) * 100).toFixed(0)}% dari atas`}>
            <input
              type="range"
              min={40}
              max={92}
              value={Math.round(num("positionY", 0.7) * 100)}
              onChange={(e) => set("positionY", Number(e.target.value) / 100)}
              className="w-full"
            />
          </Field>
          <Field label="Maks karakter per baris" hint="Subtitle akan mengecil otomatis bila melebihi lebar aman.">
            <input className="input" type="number" min={8} max={40} value={num("maxCharsPerLine", 16)} onChange={(e) => set("maxCharsPerLine", Number(e.target.value))} />
          </Field>
          <Field label="Kata per potongan">
            <input className="input" type="number" min={1} max={8} value={num("wordsPerChunk", 4)} onChange={(e) => set("wordsPerChunk", Number(e.target.value))} />
          </Field>
          <Field label="Warna teks">
            <input className="input h-10 !p-1" type="color" value={String(base.fill ?? "#ffffff")} onChange={(e) => set("fill", e.target.value)} />
          </Field>
          <Field label="Warna penekanan" hint="Dipakai untuk kata yang ditekan oleh narator.">
            <input className="input h-10 !p-1" type="color" value={String(base.emphasisColor ?? "#d4f24a")} onChange={(e) => set("emphasisColor", e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={clsx("btn-secondary", base.uppercase === false && "!border-lime/40 !text-lime")}
            onClick={() => set("uppercase", !(base.uppercase !== false))}
          >
            <Check className="h-4 w-4" /> HURUF BESAR
          </button>
          <button
            className={clsx("btn-secondary", base.mode === "word" && "!border-lime/40 !text-lime")}
            onClick={() => set("mode", base.mode === "word" ? "phrase" : "word")}
          >
            <Check className="h-4 w-4" /> Mode {base.mode === "word" ? "per kata" : "per frasa"}
          </button>
          <button
            className={clsx("btn-secondary", base.background === true && "!border-lime/40 !text-lime")}
            onClick={() => set("background", !(base.background === true))}
          >
            <Check className="h-4 w-4" /> Latar subtitle
          </button>
        </div>
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Simpan pengaturan
        </button>
      </Card>
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Pratinjau</h3>
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/projects/${project.id}/preview?scene=0&t=1800&w=480`} alt="Pratinjau subtitle" className="aspect-[9/16] w-full object-cover" />
        </div>
        <p className="text-[11px] leading-relaxed text-mist-400">
          Preview memakai frame renderer asli, termasuk subtitle sinkron dan HUD bila aktif pada profil gaya.
        </p>
      </Card>
    </div>
  );
}

function AudioPanel({
  project,
  onChange,
  onSave,
  saving,
}: {
  project: Project;
  onChange: (p: Partial<Project>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const a = project.audioSettings;
  const set = (patch: Partial<typeof a>) => onChange({ audioSettings: { ...a, ...patch } });
  return (
    <Card className="max-w-2xl space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Musik & mixing</h3>
        <p className="text-xs text-mist-400">Musik disintesis lokal, bebas royalti. Ducking menurunkan musik saat narator bicara.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Suasana musik">
          <select className="input" value={a?.musicMood ?? "sedih"} onChange={(e) => set({ musicMood: e.target.value })}>
            {["sedih", "horor", "semangat", "inspiratif", "lucu", "tenang"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Volume musik" hint={`${Math.round((a?.musicVolume ?? 0.22) * 100)}%`}>
          <input type="range" min={0} max={60} value={Math.round((a?.musicVolume ?? 0.22) * 100)} onChange={(e) => set({ musicVolume: Number(e.target.value) / 100 })} className="w-full" />
        </Field>
        <Field label="Volume narator" hint={`${Math.round((a?.voiceVolume ?? 1) * 100)}%`}>
          <input type="range" min={40} max={160} value={Math.round((a?.voiceVolume ?? 1) * 100)} onChange={(e) => set({ voiceVolume: Number(e.target.value) / 100 })} className="w-full" />
        </Field>
        <Field label="Ducking" hint={`${Math.round((a?.ducking ?? 0.65) * 100)}%`}>
          <input type="range" min={0} max={100} value={Math.round((a?.ducking ?? 0.65) * 100)} onChange={(e) => set({ ducking: Number(e.target.value) / 100 })} className="w-full" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={clsx("btn-secondary", a?.musicEnabled && "!border-lime/40 !text-lime")} onClick={() => set({ musicEnabled: !a?.musicEnabled })}>
          <Check className="h-4 w-4" /> Musik latar
        </button>
        <button className={clsx("btn-secondary", a?.sfxEnabled && "!border-lime/40 !text-lime")} onClick={() => set({ sfxEnabled: !a?.sfxEnabled })}>
          <Check className="h-4 w-4" /> Efek suara
        </button>
      </div>
      <button className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Simpan pengaturan
      </button>
    </Card>
  );
}

function StylePanel({
  project,
  style,
  styles,
  onChange,
  onSave,
  saving,
}: {
  project: Project;
  style: { id: string; name: string; spec: StyleProfileSpec } | null;
  styles: { id: string; name: string }[];
  onChange: (p: Partial<Project>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const spec = style?.spec;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Profil gaya</h3>
          <p className="text-xs text-mist-400">Mengganti profil akan mengubah palet, tipografi subtitle, dan irama kamera.</p>
        </div>
        <Field label="Gaya aktif">
          <select className="input" value={project.styleProfileId ?? ""} onChange={(e) => onChange({ styleProfileId: e.target.value })}>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {spec && (
          <div className="space-y-3">
            <div>
              <div className="label">Palet</div>
              <div className="flex gap-1.5">
                {Object.entries(spec.palette).map(([k, v]) => (
                  <div key={k} className="flex-1">
                    <div className="h-9 rounded-lg border border-white/10" style={{ background: String(v) }} />
                    <div className="mt-1 truncate text-[9px] uppercase tracking-wider text-mist-400">{k}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="rounded-lg bg-white/[0.03] p-2">
                <div className="text-white">{spec.pacing.avgSceneSeconds.toFixed(1)}s</div>
                <div className="text-mist-400">rata adegan</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-2">
                <div className="text-white">{spec.pacing.wordsPerMinute}</div>
                <div className="text-mist-400">kata/menit</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-2">
                <div className="text-white">{spec.characters.length}</div>
                <div className="text-mist-400">karakter</div>
              </div>
            </div>
          </div>
        )}
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Simpan gaya
        </button>
      </Card>
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Pratinjau frame</h3>
        <div className="rounded-xl border border-white/10 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/projects/${project.id}/preview?scene=0&t=2200&w=480`} alt="Pratinjau gaya" className="aspect-[9/16] w-full rounded-xl object-cover" />
        </div>
      </Card>
    </div>
  );
}
