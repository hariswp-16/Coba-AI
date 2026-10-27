"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  Check,
  Clock,
  Film,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import type { ReferenceAnalysis, StyleProfile, StyleProfileSpec } from "@/lib/types";
import { apiFetch, relativeTime } from "@/lib/client/api";
import { Badge, Card, Field, Modal, SectionTitle, Spinner, Toast } from "@/components/ui/Primitives";

export function StyleStudio({ initialStyles }: { initialStyles: StyleProfile[] }) {
  const [styles, setStyles] = useState(initialStyles);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);
  const [selected, setSelected] = useState<StyleProfile | null>(initialStyles[0] ?? null);
  const [deleting, setDeleting] = useState<StyleProfile | null>(null);

  async function remove() {
    if (!deleting) return;
    try {
      await apiFetch(`/api/styles/${deleting.id}`, { method: "DELETE" });
      setStyles((prev) => prev.filter((s) => s.id !== deleting.id));
      if (selected?.id === deleting.id) setSelected(null);
      setToast({ message: "Profil gaya dihapus", tone: "success" });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal menghapus", tone: "error" });
    } finally {
      setDeleting(null);
    }
  }

  async function toggleTemplate(style: StyleProfile) {
    try {
      const updated = await apiFetch<StyleProfile>(`/api/styles/${style.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isTemplate: !style.isTemplate }),
      });
      setStyles((prev) => prev.map((s) => (s.id === style.id ? updated : s)));
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal memperbarui", tone: "error" });
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-mist-400">
            <Palette className="h-3.5 w-3.5" /> Style studio
          </div>
          <h1 className="text-3xl font-bold text-white">Gaya dari video referensi</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
            Unggah video referensi (Reels/TikTok/Short). Sistem mengukur palet, kontras, tempo potongan, posisi subtitle, warna
            penekanan, dan HUD — lalu menyusun profil gaya yang dipakai renderer.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" /> Analisis video baru
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <SectionTitle hint={`${styles.length} profil`}>Profil gaya</SectionTitle>
          {styles.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-14 text-center">
              <Wand2 className="h-7 w-7 text-lime" />
              <p className="text-sm text-mist-300">Belum ada profil gaya. Analisis video referensi untuk memulai.</p>
              <button className="btn-primary" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4" /> Unggah referensi
              </button>
            </Card>
          ) : (
            styles.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className={clsx(
                  "card flex w-full items-center gap-3 p-3 text-left transition",
                  selected?.id === s.id ? "border-lime/40 bg-lime/[0.04]" : "hover:border-white/15"
                )}
              >
                <span className="flex h-16 w-10 shrink-0 overflow-hidden rounded-md border border-white/10">
                  {Object.values(s.spec.palette).slice(0, 4).map((c, i) => (
                    <span key={i} className="h-full flex-1" style={{ background: String(c) }} />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-white">{s.name}</span>
                    <Badge tone={s.source === "reference-video" ? "lime" : "neutral"}>
                      {s.source === "reference-video" ? "referensi" : s.source === "preset" ? "preset" : "manual"}
                    </Badge>
                    {s.isTemplate && <Badge tone="sky">template</Badge>}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-[11px] text-mist-400">{s.description || "Tanpa deskripsi"}</span>
                  <span className="mt-1 flex items-center gap-2 text-[10px] text-mist-400">
                    <Clock className="h-2.5 w-2.5" /> {relativeTime(s.updatedAt)}
                    {s.analysis ? ` · ${s.analysis.scenes.length} adegan terdeteksi` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col gap-1">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTemplate(s);
                    }}
                    className={clsx("rounded-md p-1.5 transition", s.isTemplate ? "text-lime" : "text-mist-400 hover:text-white")}
                    title={s.isTemplate ? "Template aktif" : "Jadikan template"}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(s);
                    }}
                    className="rounded-md p-1.5 text-mist-400 transition hover:text-red-300"
                    title="Hapus"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <>
              <Card className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">{selected.name}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-mist-400">{selected.description}</p>
                </div>
                <div>
                  <div className="label">Palet</div>
                  <div className="flex gap-1">
                    {Object.entries(selected.spec.palette).map(([k, v]) => (
                      <div key={k} className="flex-1">
                        <div className="h-10 rounded-md border border-white/10" style={{ background: String(v) }} />
                        <div className="mt-1 truncate text-[9px] uppercase tracking-wide text-mist-400">{k}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <SpecRow label="Resolusi" value={`${selected.spec.width}×${selected.spec.height} @${selected.spec.fps}`} />
                  <SpecRow label="Adegan rata-rata" value={`${selected.spec.pacing.avgSceneSeconds.toFixed(2)}s`} />
                  <SpecRow label="Kata/menit" value={String(selected.spec.pacing.wordsPerMinute)} />
                  <SpecRow label="Ukuran subtitle" value={`${selected.spec.subtitle.fontSize}px`} />
                  <SpecRow label="Posisi subtitle" value={`${(selected.spec.subtitle.positionY * 100).toFixed(0)}%`} />
                  <SpecRow label="Warna aksen" value={selected.spec.subtitle.emphasisColor} swatch={selected.spec.subtitle.emphasisColor} />
                  <SpecRow label="HUD" value={selected.spec.hud.enabled ? "aktif" : "nonaktif"} />
                  <SpecRow label="Karakter" value={`${selected.spec.characters.length} tokoh`} />
                </div>
                <Link href="/new" className="btn-primary w-full">
                  <Sparkles className="h-4 w-4" /> Pakai gaya ini
                </Link>
              </Card>

              {selected.analysis && <AnalysisCard analysis={selected.analysis} spec={selected.spec} />}
            </>
          ) : (
            <Card className="py-10 text-center text-sm text-mist-400">Pilih profil gaya untuk melihat detail.</Card>
          )}
        </div>
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(style) => {
          setStyles((prev) => [style, ...prev]);
          setSelected(style);
          setToast({ message: `Profil gaya "${style.name}" dibuat dari video referensi`, tone: "success" });
        }}
        onError={(message) => setToast({ message, tone: "error" })}
      />

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Hapus profil gaya?">
        <p className="text-sm text-mist-300">
          Profil <strong className="text-white">{deleting?.name}</strong> akan dihapus. Proyek yang memakainya akan kembali ke gaya
          preset bawaan.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setDeleting(null)}>
            Batal
          </button>
          <button className="btn-danger" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Hapus
          </button>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}

function SpecRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-mist-400">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 truncate text-white">
        {swatch && <span className="h-2.5 w-2.5 rounded-full border border-white/20" style={{ background: swatch }} />}
        {value}
      </div>
    </div>
  );
}

function AnalysisCard({ analysis, spec }: { analysis: ReferenceAnalysis; spec: StyleProfileSpec }) {
  return (
    <Card className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Film className="h-4 w-4 text-lime" /> Hasil analisis referensi
      </h3>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <SpecRow label="Adegan terdeteksi" value={String(analysis.scenes.length)} />
        <SpecRow label="Potongan/menit" value={analysis.cutPattern.cutsPerMinute.toFixed(1)} />
        <SpecRow label="Kecerahan" value={analysis.visual.brightness.toFixed(2)} />
        <SpecRow label="Kontras" value={analysis.visual.contrast.toFixed(2)} />
        <SpecRow label="Saturasi" value={analysis.visual.saturation.toFixed(2)} />
        <SpecRow label="Kepadatan detail" value={analysis.visual.edgeDensity.toFixed(3)} />
      </div>
      <div className="space-y-1.5">
        <Bar label="Subtitle" value={analysis.visual.subtitleBand.detected ? `${(analysis.visual.subtitleBand.centerYRatio * 100).toFixed(0)}% tinggi` : "tidak terdeteksi"} ok={analysis.visual.subtitleBand.detected} />
        <Bar label="HUD / UI" value={analysis.visual.hudBand.detected ? "terdeteksi" : "tidak"} ok={analysis.visual.hudBand.detected} />
        <Bar label="Irama" value={`${analysis.cutPattern.avgSceneSeconds.toFixed(2)}s/adegan`} ok />
        <Bar label="Kecepatan bicara" value={`±${analysis.audio.estimatedWpm} kata/menit`} ok />
        <Bar label="Loudness referensi" value={`${analysis.audio.integratedLufs.toFixed(1)} LUFS`} ok />
      </div>
      <p className="text-[10px] leading-relaxed text-mist-400">
        Spesifikasi memakai subtitle {spec.subtitle.fontSize}px di posisi {(spec.subtitle.positionY * 100).toFixed(0)}% dengan warna
        penekanan <span style={{ color: spec.subtitle.emphasisColor }}>{spec.subtitle.emphasisColor}</span>.
      </p>
    </Card>
  );
}

function Bar({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[11px]">
      <span className="text-mist-400">{label}</span>
      <span className={clsx("flex items-center gap-1 font-medium", ok ? "text-lime" : "text-mist-400")}>
        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {value}
      </span>
    </div>
  );
}

function UploadModal({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (style: StyleProfile) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [analysis, setAnalysis] = useState<ReferenceAnalysis | null>(null);
  const [spec, setSpec] = useState<StyleProfileSpec | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function pick(f: File | null) {
    setFile(f);
    setAnalysis(null);
    setSpec(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
  }

  async function analyze() {
    if (!file) return;
    setBusy(true);
    try {
      setStep("Mengunggah & menormalisasi video…");
      const form = new FormData();
      form.append("video", file);
      const data = await apiFetch<{ assetId: string; analysis: ReferenceAnalysis; spec: StyleProfileSpec }>("/api/upload/reference", {
        method: "POST",
        body: form,
      });
      setAnalysis(data.analysis);
      setSpec(data.spec);
      setStep("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Analisis gagal");
      setStep("");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!spec) return;
    setBusy(true);
    try {
      const created = await apiFetch<StyleProfile>("/api/styles", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || "Gaya referensi baru",
          description:
            description.trim() ||
            `Dianalisis dari ${file?.name ?? "video referensi"}: ${analysis?.scenes.length ?? 0} adegan, ${(
              analysis?.cutPattern.avgSceneSeconds ?? 0
            ).toFixed(2)}s/adegan.`,
          spec,
          analysis,
          source: "reference-video",
          isTemplate: true,
        }),
      });
      onCreated(created);
      onClose();
      pick(null);
      setName("");
      setDescription("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal menyimpan profil gaya");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Analisis video referensi" wide>
      <div className="space-y-4">
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) pick(f);
          }}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center transition hover:border-lime/40 hover:bg-lime/[0.03]"
        >
          <Upload className="h-6 w-6 text-mist-400" />
          <span className="text-sm font-medium text-white">{file ? file.name : "Klik atau seret video ke sini"}</span>
          <span className="text-[11px] text-mist-400">MP4, MOV, MKV, WEBM · maks 300 MB · ideal 5–60 detik</span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </button>

        {previewUrl && (
          <div className="flex gap-3">
            <video src={previewUrl} className="h-40 rounded-lg border border-white/10 bg-black" muted playsInline controls />
            <div className="flex-1 space-y-2">
              <Field label="Nama profil gaya">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Misal: Horor cepat vertikal" />
              </Field>
              <Field label="Deskripsi (opsional)">
                <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Catatan tentang gaya ini" />
              </Field>
            </div>
          </div>
        )}

        {busy && step && (
          <div className="flex items-center gap-2 rounded-lg border border-lime/20 bg-lime/[0.04] px-3 py-2 text-xs text-lime">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {step}
          </div>
        )}

        {analysis && spec && (
          <div className="animate-in space-y-3">
            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <SpecRow label="Adegan" value={String(analysis.scenes.length)} />
              <SpecRow label="Potongan/menit" value={analysis.cutPattern.cutsPerMinute.toFixed(1)} />
              <SpecRow label="Subtitle" value={analysis.visual.subtitleBand.detected ? `${(analysis.visual.subtitleBand.centerYRatio * 100).toFixed(0)}%` : "—"} />
              <SpecRow label="HUD" value={analysis.visual.hudBand.detected ? "ada" : "tidak"} />
            </div>
            <div className="flex gap-1">
              {Object.entries(spec.palette).map(([k, v]) => (
                <div key={k} className="flex-1">
                  <div className="h-8 rounded-md border border-white/10" style={{ background: String(v) }} />
                  <div className="mt-1 truncate text-[9px] text-mist-400">{k}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-mist-400">
              Spesifikasi dihasilkan otomatis: subtitle {spec.subtitle.fontSize}px, {spec.subtitle.maxCharsPerLine} karakter/baris,{" "}
              {spec.pacing.wordsPerMinute} kata/menit, tempo {spec.pacing.avgSceneSeconds.toFixed(2)}s per adegan.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          {!analysis ? (
            <button className="btn-primary" onClick={analyze} disabled={!file || busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />} Analisis video
            </button>
          ) : (
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Simpan profil gaya
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
