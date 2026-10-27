"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clapperboard,
  FileText,
  Lightbulb,
  Loader2,
  Music2,
  Palette,
  Sparkles,
  Wand2,
} from "lucide-react";
import { DURATION_OPTIONS, type DurationOption } from "@/lib/types";
import { apiFetch } from "@/lib/client/api";
import { Badge, Card, Field, Toast } from "@/components/ui/Primitives";

interface StyleOption {
  id: string;
  name: string;
  description: string;
  source: string;
}

interface Props {
  styles: StyleOption[];
  voices: { id: string; label?: string; name?: string; description?: string }[];
  ttsProvider: string;
}

const MODES = [
  { key: "idea", label: "Ide cerita", icon: Lightbulb, hint: "Tulis satu-dua kalimat ide, sistem mengembangkan jadi naskah penuh." },
  { key: "topic", label: "Topik / tema", icon: BookOpen, hint: "Contoh: persahabatan, kejujuran, bahaya bohong." },
  { key: "script", label: "Naskah sendiri", icon: FileText, hint: "Tempel naskah narasi. Sistem memecahnya jadi adegan." },
  { key: "continue", label: "Lanjut episode", icon: Clapperboard, hint: "Lanjutkan cerita dari episode sebelumnya." },
] as const;

const MOODS = [
  { id: "sedih", label: "Sedih / haru" },
  { id: "horor", label: "Horor / gelisah" },
  { id: "semangat", label: "Semangat" },
  { id: "inspiratif", label: "Inspiratif" },
  { id: "lucu", label: "Lucu" },
];

export function NewProjectWizard({ styles, voices, ttsProvider }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("idea");
  const [idea, setIdea] = useState("");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [audience, setAudience] = useState("umum");
  const [duration, setDuration] = useState<DurationOption>(30);
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? "narrator-dramatic");
  const [musicMood, setMusicMood] = useState("sedih");
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [quality, setQuality] = useState<"draft" | "standard" | "high">("standard");
  const [previousProjectId, setPreviousProjectId] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState(2);
  const [prevProjects, setPrevProjects] = useState<{ id: string; title: string; episode?: number }[]>([]);

  useEffect(() => {
    if (mode !== "continue" || prevProjects.length) return;
    apiFetch<{ id: string; title: string; story: { episodeNumber?: number } | null }[]>("/api/projects")
      .then((list) =>
        setPrevProjects(list.filter((p) => p.story).map((p) => ({ id: p.id, title: p.title, episode: p.story?.episodeNumber })))
      )
      .catch(() => setPrevProjects([]));
  }, [mode, prevProjects.length]);

  const content = mode === "idea" ? idea : mode === "topic" ? topic : mode === "script" ? script : previousProjectId;
  const canContinue = useMemo(() => {
    if (!styleId) return false;
    if (mode === "continue") return Boolean(previousProjectId);
    return content.trim().length >= (mode === "script" ? 60 : 8);
  }, [styleId, mode, content, previousProjectId]);

  async function createAndGenerate() {
    setBusy(true);
    try {
      const finalTitle = title.trim() || autoTitle();
      const project = await apiFetch<{ id: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          title: finalTitle,
          durationTarget: duration,
          styleProfileId: styleId,
          resolution,
          quality,
          storyInput: {
            mode,
            idea: mode === "idea" ? idea : "",
            topic: mode === "topic" ? topic : "",
            script: mode === "script" ? script : "",
            previousProjectId: mode === "continue" ? previousProjectId : undefined,
            episodeNumber: mode === "continue" ? episodeNumber : 1,
            audience,
            language: "id",
          },
          voiceSettings: { mode: "preset", voiceId, provider: ttsProvider, rate: 1, pitch: 0, persona: "dramatis" },
          audioSettings: { musicMood, musicEnabled: true, musicVolume: 0.22, voiceVolume: 1, ducking: 0.65, sfxEnabled: true, loudnessTarget: -14 },
        }),
      });
      setStep(3);
      const result = await apiFetch<{ story: { title: string; scenes: unknown[] }; fallbackReason?: string }>(
        `/api/projects/${project.id}/story`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setToast({
        message: `Storyboard siap: ${result.story.scenes.length} adegan${result.fallbackReason ? " (mesin lokal)" : ""}`,
        tone: "success",
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal membuat proyek", tone: "error" });
      setStep((s) => (s === 3 ? 0 : s));
    } finally {
      setBusy(false);
    }
  }

  function autoTitle() {
    if (mode === "topic" && topic.trim()) return humanize(topic);
    if (mode === "idea" && idea.trim()) return humanize(idea.split(/[.!?]/)[0].slice(0, 70));
    if (mode === "continue") return `Episode ${episodeNumber}`;
    return "Cerita Baru";
  }

  function humanize(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  const steps = ["Cerita", "Gaya & durasi", "Suara", "Proses"];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="btn-ghost !px-2">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Buat video baru</h1>
          <p className="text-sm text-mist-400">Empat langkah singkat, lalu worker akan membuat video.</p>
        </div>
      </div>

      <ol className="flex items-center gap-2">
        {steps.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={clsx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                i < step ? "bg-lime text-ink-950" : i === step ? "border border-lime text-lime" : "border border-white/15 text-mist-400"
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={clsx("hidden text-xs font-medium sm:block", i <= step ? "text-white" : "text-mist-400")}>{label}</span>
            {i < steps.length - 1 && <span className={clsx("h-px flex-1", i < step ? "bg-lime/50" : "bg-white/10")} />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="animate-in space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Apa ceritanya?</h2>
            <p className="text-sm text-mist-400">Pilih cara memasukkan cerita. Semua hasil bisa diedit setelah storyboard dibuat.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={clsx(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                    mode === m.key ? "border-lime/50 bg-lime/[0.07]" : "border-white/8 bg-white/[0.02] hover:border-white/15"
                  )}
                >
                  <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", mode === m.key ? "text-lime" : "text-mist-400")} />
                  <span>
                    <span className="block text-sm font-semibold text-white">{m.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-400">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <Field label="Judul proyek (opsional)" hint="Kosongkan untuk membuat judul otomatis dari cerita.">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Misal: Lampu di Rumah Kosong" />
          </Field>

          {mode === "idea" && (
            <Field label="Ide cerita" hint="Sebutkan tokoh, konflik, dan suasana. Contoh: “Anak kos penakut menemukan suara tangisan di kamar mandi setiap pukul 12 malam.”">
              <textarea className="input min-h-[110px] resize-y" value={idea} onChange={(e) => setIdea(e.target.value)} />
            </Field>
          )}
          {mode === "topic" && (
            <Field label="Topik" hint="Tema atau pesan moral yang ingin disampaikan.">
              <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Berani jujur walau sulit" />
            </Field>
          )}
          {mode === "script" && (
            <Field label="Naskah narasi" hint="Minimal 60 karakter. Satu paragraf per ide adegan akan membantu mesin memecah scene.">
              <textarea className="input min-h-[180px] resize-y font-mono text-[13px]" value={script} onChange={(e) => setScript(e.target.value)} />
            </Field>
          )}
          {mode === "continue" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Episode sebelumnya">
                <select className="input" value={previousProjectId} onChange={(e) => setPreviousProjectId(e.target.value)}>
                  <option value="">Pilih proyek…</option>
                  {prevProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} {p.episode ? `(Ep. ${p.episode})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nomor episode">
                <input className="input" type="number" min={2} value={episodeNumber} onChange={(e) => setEpisodeNumber(Number(e.target.value))} />
              </Field>
            </div>
          )}

          <Field label="Audiens" hint="Mempengaruhi pilihan kata dan tingkat ketegangan.">
            <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="umum">Umum</option>
              <option value="anak">Anak-anak</option>
              <option value="remaja">Remaja</option>
              <option value="dewasa">Dewasa</option>
              <option value="keluarga">Keluarga</option>
            </select>
          </Field>

          <div className="flex justify-end">
            <button className="btn-primary" disabled={!canContinue} onClick={() => setStep(1)}>
              Lanjut <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="animate-in space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Gaya visual & durasi</h2>
            <p className="text-sm text-mist-400">Gaya menentukan palet warna, tipografi subtitle, dan tempo adegan.</p>
          </div>

          <div>
            <label className="label">Durasi target</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={clsx(
                    "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                    duration === d ? "border-lime bg-lime/10 text-lime" : "border-white/10 bg-white/[0.02] text-mist-300 hover:border-white/20"
                  )}
                >
                  {d} detik
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Profil gaya</label>
            {styles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-mist-400">
                Belum ada profil gaya.{" "}
                <Link href="/styles" className="text-lime underline">
                  Buat dari video referensi
                </Link>
                .
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {styles.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStyleId(s.id)}
                    className={clsx(
                      "rounded-xl border p-3 text-left transition",
                      styleId === s.id ? "border-lime/50 bg-lime/[0.07]" : "border-white/8 bg-white/[0.02] hover:border-white/15"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{s.name}</span>
                      <Badge tone={s.source === "reference-video" ? "lime" : "neutral"}>
                        <Palette className="h-2.5 w-2.5" /> {s.source === "reference-video" ? "referensi" : "preset"}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-mist-400">{s.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Resolusi">
              <select className="input" value={resolution} onChange={(e) => setResolution(e.target.value as "720p" | "1080p")}>
                <option value="720p">720 × 1280 (HD)</option>
                <option value="1080p">1080 × 1920 (Full HD)</option>
              </select>
            </Field>
            <Field label="Kualitas render" hint="Draft paling cepat untuk uji cerita.">
              <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
                <option value="draft">Draft (cepat)</option>
                <option value="standard">Standar</option>
                <option value="high">Tinggi</option>
              </select>
            </Field>
          </div>

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="h-4 w-4" /> Kembali
            </button>
            <button className="btn-primary" disabled={!styleId} onClick={() => setStep(2)}>
              Lanjut <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="animate-in space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Suara & musik</h2>
            <p className="text-sm text-mist-400">
              Mesin TTS aktif: <span className="text-white">{ttsProvider}</span>. Suara kloning dapat dipilih dari halaman Suara Saya.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {voices.map((v) => (
              <button
                key={v.id}
                onClick={() => setVoiceId(v.id)}
                className={clsx(
                  "rounded-xl border p-3 text-left transition",
                  voiceId === v.id ? "border-lime/50 bg-lime/[0.07]" : "border-white/8 bg-white/[0.02] hover:border-white/15"
                )}
              >
                <span className="text-sm font-semibold text-white">{v.label ?? v.name ?? v.id}</span>
                <p className="mt-0.5 text-[11px] text-mist-400">{v.description ?? "Narator Bahasa Indonesia"}</p>
              </button>
            ))}
          </div>

          <div>
            <label className="label">Suasana musik</label>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMusicMood(m.id)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                    musicMood === m.id ? "border-lime bg-lime/10 text-lime" : "border-white/10 text-mist-300 hover:border-white/20"
                  )}
                >
                  <Music2 className="h-3.5 w-3.5" /> {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" /> Kembali
            </button>
            <button className="btn-primary" onClick={createAndGenerate} disabled={busy || !canContinue}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Membuat storyboard…" : "Buat storyboard"}
            </button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="animate-in flex flex-col items-center gap-4 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime/10 text-lime">
            <Wand2 className="h-6 w-6 animate-pulse" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-white">Menyusun cerita & storyboard…</h2>
            <p className="mt-1 max-w-sm text-sm text-mist-400">
              Mesin menulis naskah, memecah adegan, dan menandai emosi tiap scene. Kamu akan diarahkan ke editor.
            </p>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-mist-400" />
        </Card>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
