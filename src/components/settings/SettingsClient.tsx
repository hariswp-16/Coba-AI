"use client";
import { useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, Cpu, DollarSign, KeyRound, Lock, RefreshCw, Server, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { Badge, Card, SectionTitle, Toast } from "@/components/ui/Primitives";

interface Integration {
  provider?: string;
  driver?: string;
  configured: boolean;
  model?: string;
  requiresKey?: boolean;
}

export function SettingsClient({
  integrations,
  voiceClone,
  ffmpeg,
  authOn,
  queue,
  cost,
  limits,
}: {
  integrations: Record<string, Integration>;
  voiceClone: { available: boolean; provider: string; reason: string };
  ffmpeg: { ok: boolean; version?: string | null; error?: string | null };
  authOn: boolean;
  queue: { queued: number; running: number };
  cost: { totalUsd: number; events: number; byProvider: { provider: string; usd: number; events: number }[]; byDay: { day: string; usd: number }[]; byOperation: { operation: string; usd: number }[] };
  limits: { maxProjectSeconds: number; maxUploadBytes: number };
}) {
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" | "success" } | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const labels: Record<string, { title: string; description: string; fallback: string; envKey: string }> = {
    llm: {
      title: "Language Model (naskah)",
      description: "Menulis naskah, memecah adegan, dan menandai emosi. Tanpa key, dipakai story engine lokal deterministik.",
      fallback: "Story engine lokal",
      envKey: "OPENAI_API_KEY / LLM_PROVIDER",
    },
    image: {
      title: "Generator visual",
      description: "Menghasilkan latar/ilustrasi AI. Tanpa key, renderer prosedural 2D menggambar semua frame.",
      fallback: "Renderer prosedural 2D",
      envKey: "IMAGE_API_KEY / IMAGE_PROVIDER",
    },
    tts: {
      title: "Text-to-Speech",
      description: "Narator Bahasa Indonesia. Mesin lokal espeak-ng memberi biaya 0 dan tidak perlu internet.",
      fallback: "eSpeak-NG lokal",
      envKey: "TTS_API_KEY / TTS_PROVIDER",
    },
    voiceClone: {
      title: "Kloning suara",
      description: "Membuat suara sintetis dari sampel 10–60 detik. Butuh provider pihak ketiga dengan izin pengguna.",
      fallback: "Tidak aktif",
      envKey: "VOICE_CLONE_API_KEY / ELEVENLABS_API_KEY",
    },
    video: {
      title: "AI video (opsional)",
      description: "Klip video AI untuk scene tertentu. Bila tidak aktif, animasi prosedural tetap dipakai.",
      fallback: "Tidak aktif",
      envKey: "VIDEO_API_KEY / REPLICATE_API_TOKEN",
    },
    storage: {
      title: "Penyimpanan file",
      description: "Driver lokal menyimpan di folder storage/; S3/R2 untuk deployment produksi.",
      fallback: "Lokal (storage/)",
      envKey: "STORAGE_DRIVER / S3_BUCKET",
    },
  };

  async function login() {
    setBusy(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ password: pw }) });
      setToast({ message: "Sesi diperbarui", tone: "success" });
      setPw("");
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Gagal", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const maxCost = Math.max(0.0001, ...cost.byDay.map((d) => d.usd));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-mist-400">
          <Server className="h-3.5 w-3.5" /> Integrasi & sistem
        </div>
        <h1 className="text-3xl font-bold text-white">Pengaturan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
          Semua integrasi bersifat opsional. Aplikasi tetap berjalan penuh dengan mesin lokal; provinsi berbayar hanya menaikkan
          kualitas visual/suara.
        </p>
      </header>

      <div>
        <SectionTitle hint="status runtime">Kesehatan sistem</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthCard
            ok={ffmpeg.ok}
            icon={Cpu}
            title="FFmpeg"
            value={ffmpeg.ok ? ffmpeg.version?.split(" ").slice(0, 3).join(" ") ?? "tersedia" : ffmpeg.error ?? "tidak ditemukan"}
          />
          <HealthCard ok icon={Server} title="Worker" value={queue.running > 0 ? `${queue.running} job aktif` : "siap"} sub={`${queue.queued} antre`} />
          <HealthCard
            ok={voiceClone.available}
            icon={ShieldCheck}
            title="Kloning suara"
            value={voiceClone.available ? voiceClone.provider : "nonaktif"}
          />
          <HealthCard ok={authOn} icon={Lock} title="Proteksi sandi" value={authOn ? "aktif" : "terbuka"} />
        </div>
      </div>

      <div>
        <SectionTitle hint="dibaca dari environment">Provider</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          {Object.entries(integrations).map(([key, info]) => {
            const meta = labels[key];
            if (!meta) return null;
            return (
              <Card key={key} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{meta.title}</h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-mist-400">{meta.description}</p>
                  </div>
                  <Badge tone={info.configured ? "lime" : "amber"}>{info.configured ? "aktif" : "fallback"}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="chip">
                    <KeyRound className="h-3 w-3" /> {info.provider ?? info.driver ?? "lokal"}
                  </span>
                  {info.model && <span className="chip">{info.model}</span>}
                  {!info.configured && <span className="chip">→ {meta.fallback}</span>}
                </div>
                <div className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5 font-mono text-[10px] text-mist-400">
                  <span>{meta.envKey}</span>
                  <span className="text-mist-400/70">.env</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <DollarSign className="h-4 w-4 text-lime" /> Ringkasan biaya API
            </h3>
            <p className="text-[11px] text-mist-400">Total {cost.events} peristiwa berbiaya. TTS lokal dan renderer prosedural = $0.</p>
          </div>
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold text-white">${cost.totalUsd.toFixed(4)}</div>
            <span className="pb-1 text-[11px] text-mist-400">akumulatif</span>
          </div>
          {cost.byDay.length > 0 ? (
            <div className="flex h-24 items-end gap-1.5">
              {cost.byDay.map((d) => (
                <div key={d.day} className="group relative flex-1">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-lime/40 to-lime"
                    style={{ height: `${Math.max(3, (d.usd / maxCost) * 80)}px` }}
                    title={`${d.day}: $${d.usd.toFixed(4)}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-mist-400">Belum ada biaya tercatat — semua berjalan di mesin lokal.</p>
          )}
          {cost.byProvider.length > 0 && (
            <div className="space-y-1">
              {cost.byProvider.map((p) => (
                <div key={p.provider} className="flex justify-between text-[11px]">
                  <span className="text-mist-300">{p.provider}</span>
                  <span className="font-mono text-mist-400">
                    ${p.usd.toFixed(4)} · {p.events}x
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Lock className="h-4 w-4 text-sky" /> Akses & batas
            </h3>
            <p className="text-[11px] text-mist-400">
              {authOn
                ? "Halaman dan API dilindungi kata sandi (cookie bertanda tangan HMAC)."
                : "APP_PASSWORD belum diset — aplikasi dapat diakses tanpa login. Set APP_PASSWORD untuk produksi."}
            </p>
          </div>
          {authOn && (
            <div className="flex gap-2">
              <input
                className="input"
                type="password"
                placeholder="Kata sandi untuk perbarui sesi"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              <button className="btn-secondary shrink-0" onClick={login} disabled={!pw || busy}>
                <RefreshCw className="h-4 w-4" /> Masuk
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-white/[0.03] p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-mist-400">Durasi maks</div>
              <div className="text-white">{limits.maxProjectSeconds} detik</div>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-mist-400">Upload maks</div>
              <div className="text-white">{Math.round(limits.maxUploadBytes / 1024 / 1024)} MB</div>
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-mist-400">
            <p className="mb-1 font-semibold text-mist-300">Menjalankan worker</p>
            <code className="block rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-lime">npm run worker</code>
            <p className="mt-1.5">Worker memproses antrean render. Tanpa worker, job akan tetap menunggu di status antrean.</p>
          </div>
        </Card>
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}

function HealthCard({
  ok,
  icon: Icon,
  title,
  value,
  sub,
}: {
  ok: boolean;
  icon: typeof Cpu;
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="flex items-start gap-3">
      <span
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          ok ? "bg-lime/10 text-lime" : "bg-red-500/10 text-red-300"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-mist-400">
          {title} {ok ? <Check className="h-2.5 w-2.5 text-lime" /> : <X className="h-2.5 w-2.5 text-red-400" />}
        </div>
        <div className="truncate text-[13px] font-medium text-white">{value}</div>
        {sub && <div className="text-[10px] text-mist-400">{sub}</div>}
      </div>
    </Card>
  );
}
