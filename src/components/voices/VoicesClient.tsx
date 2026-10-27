"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, Loader2, Mic2, Play, ShieldCheck, Trash2, Upload, Waves } from "lucide-react";
import type { VoiceProfile } from "@/lib/types";
import { apiFetch, relativeTime } from "@/lib/client/api";
import { Badge, Card, Field, Modal, SectionTitle, Spinner, Toast } from "@/components/ui/Primitives";

interface Preset {
  id: string;
  label?: string;
  name?: string;
  description?: string;
  gender?: string;
}

export function VoicesClient({
  initialProfiles,
  presets,
  ttsProvider,
  cloneStatus,
}: {
  initialProfiles: VoiceProfile[];
  presets: Preset[];
  ttsProvider: string;
  cloneStatus: { available: boolean; provider: string; reason: string };
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<VoiceProfile | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  async function remove() {
    if (!deleting) return;
    try {
      await apiFetch(`/api/voices/${deleting.id}`, { method: "DELETE" });
      setProfiles((p) => p.filter((x) => x.id !== deleting.id));
      setToast({ message: "Profil suara dihapus", tone: "success" });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal menghapus", tone: "error" });
    } finally {
      setDeleting(null);
    }
  }

  function preview(preset: Preset) {
    setPreviewing(preset.id);
    try {
      const synth = window.speechSynthesis;
      if (!synth) throw new Error("Browser tidak mendukung speechSynthesis");
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(
        "Malam itu, lampu di rumah kosong tiba-tiba menyala sendiri. Tidak ada yang berani masuk."
      );
      utter.lang = "id-ID";
      const voices = synth.getVoices();
      const idVoice = voices.find((v) => v.lang?.toLowerCase().startsWith("id"));
      if (idVoice) utter.voice = idVoice;
      utter.rate = preset.id.includes("casual") ? 1.06 : preset.id.includes("documentary") ? 0.94 : 0.98;
      utter.pitch = preset.id.includes("mystery") ? 0.85 : preset.id.includes("emotional") ? 1.05 : 0.95;
      utter.onend = () => setPreviewing(null);
      utter.onerror = () => setPreviewing(null);
      synth.speak(utter);
    } catch {
      setPreviewing(null);
      setToast({ message: "Pratinjau suara browser tidak tersedia. Suara asli dihasilkan saat render.", tone: "info" });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-mist-400">
            <Mic2 className="h-3.5 w-3.5" /> Suara
          </div>
          <h1 className="text-3xl font-bold text-white">Narator & suara kloning</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
            Mesin TTS aktif: <span className="font-semibold text-white">{ttsProvider}</span> (Bahasa Indonesia, biaya 0 untuk mesin
            lokal). Suara kloning opsional memakai rekaman 10–60 detik.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" /> Kloning suara
        </button>
      </header>

      {!cloneStatus.available && (
        <Card className="flex flex-col gap-2 border-amber-400/20 bg-amber-400/[0.04] sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-amber-100/90">
            <strong>Kloning suara belum aktif.</strong> {cloneStatus.reason}
          </div>
          <button className="btn-secondary shrink-0" onClick={() => router.push("/settings")}>
            Buka integrasi
          </button>
        </Card>
      )}

      <div>
        <SectionTitle hint={`${presets.length} suara bawaan`}>Narator preset</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((v) => (
            <Card key={v.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Waves className="h-3.5 w-3.5 text-lime" />
                    <h3 className="text-sm font-semibold text-white">{v.label ?? v.name ?? v.id}</h3>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-mist-400">{v.description ?? "Narator Bahasa Indonesia"}</p>
                </div>
                {v.gender && <Badge tone="neutral">{v.gender}</Badge>}
              </div>
              <div className="mt-auto flex items-center justify-between">
                <span className="font-mono text-[10px] text-mist-400">{v.id}</span>
                <button className="btn-ghost !py-1.5 text-xs" onClick={() => preview(v)} disabled={previewing === v.id}>
                  {previewing === v.id ? <Spinner className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Pratinjau
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle hint={`${profiles.length} profil`}>Suara kloning saya</SectionTitle>
        {profiles.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldCheck className="h-7 w-7 text-mist-400" />
            <p className="max-w-md text-sm text-mist-300">
              Belum ada suara kloning. Unggah rekaman bersih 10–60 detik untuk membuat narator dengan karakter suaramu sendiri.
            </p>
            <button className="btn-secondary" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" /> Unggah sampel
            </button>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <Card key={p.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                    <p className="mt-0.5 text-[11px] text-mist-400">
                      {p.provider} · {(p.sampleSeconds ?? 0).toFixed(1)}s sampel
                    </p>
                  </div>
                  <Badge tone={p.status === "ready" ? "lime" : p.status === "unavailable" ? "amber" : "red"}>{p.status}</Badge>
                </div>
                {p.notes && <p className="text-[11px] leading-relaxed text-mist-400">{p.notes}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-mist-400">{relativeTime(p.createdAt)}</span>
                  <button className="btn-ghost !px-2 !py-1 text-xs text-red-300/80 hover:text-red-300" onClick={() => setDeleting(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <UploadVoiceModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(profile) => {
          setProfiles((prev) => [profile, ...prev]);
          setToast({ message: `Profil "${profile.name}" dibuat`, tone: "success" });
        }}
        onError={(m) => setToast({ message: m, tone: "error" })}
      />

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Hapus profil suara?">
        <p className="text-sm text-mist-300">
          Profil <strong className="text-white">{deleting?.name}</strong> akan dihapus dari akun dan provider.
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

function UploadVoiceModal({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: VoiceProfile) => void;
  onError: (m: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; reason?: string; durationSeconds?: number } | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("sample", file);
      form.append("name", name.trim() || "Suara saya");
      form.append("consent", String(consent));
      const data = await apiFetch<{ id: string; status: string; reason?: string; durationSeconds: number }>("/api/voices", {
        method: "POST",
        body: form,
      });
      setResult({ status: data.status, reason: data.reason, durationSeconds: data.durationSeconds });
      const list = await apiFetch<{ profiles: VoiceProfile[] }>("/api/voices");
      const created = list.profiles.find((p) => p.id === data.id);
      if (created) onCreated(created);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal mengunggah sampel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Kloning suara" wide>
      <div className="space-y-4">
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center transition hover:border-lime/40"
        >
          <Mic2 className="h-6 w-6 text-mist-400" />
          <span className="text-sm font-medium text-white">{file ? file.name : "Unggah rekaman suara"}</span>
          <span className="text-[11px] text-mist-400">WAV, MP3, M4A, OGG · 10 detik–5 menit · tanpa musik latar</span>
          <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </button>

        <Field label="Nama profil suara">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Misal: Narator Andi" />
        </Field>

        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-mist-400">
          <p className="mb-2 font-semibold text-mist-300">Tips rekaman berkualitas:</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>Ruang tenang, tanpa gema atau musik.</li>
            <li>Mikrofon 15–20 cm dari mulut, volume stabil.</li>
            <li>Baca 4–6 kalimat dengan intonasi natural.</li>
          </ul>
        </div>

        <label className="flex items-start gap-2.5 rounded-xl border border-white/8 p-3 text-[11px] leading-relaxed text-mist-300">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-lime" />
          <span>
            Saya memiliki hak atas suara ini dan memberi izin untuk membuat profil suara sintetis. Saya tidak akan menyalahgunakan
            suara orang lain tanpa izin.
          </span>
        </label>

        {result && (
          <div
            className={clsx(
              "animate-in rounded-lg border px-3 py-2 text-xs",
              result.status === "ready" ? "border-lime/30 bg-lime/10 text-lime" : "border-amber-400/30 bg-amber-400/10 text-amber-200"
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              {result.status === "ready" ? <Check className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5" />}
              Status: {result.status}
            </div>
            {result.reason && <p className="mt-1 text-[11px] opacity-90">{result.reason}</p>}
            {result.durationSeconds ? <p className="mt-0.5 text-[11px] opacity-75">Sampel {result.durationSeconds.toFixed(1)} detik tervalidasi.</p> : null}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Tutup
          </button>
          <button className="btn-primary" onClick={submit} disabled={!file || !consent || busy || Boolean(result)}>
            {busy ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />} Buat profil suara
          </button>
        </div>
      </div>
    </Modal>
  );
}
