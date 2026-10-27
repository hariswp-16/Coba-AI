"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clapperboard, Loader2, Lock } from "lucide-react";
import { apiFetch } from "@/lib/client/api";

export function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      router.replace(params.get("next") || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime text-ink-950">
            <Clapperboard className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-bold text-white">AI Video Studio</h1>
            <p className="text-[11px] uppercase tracking-[0.16em] text-mist-400">Akses terlindungi</p>
          </div>
        </div>
        <div>
          <label className="label">Kata sandi</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
            <input
              className="input pl-9"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !password}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Masuk ke studio
        </button>
        <p className="text-center text-[10px] leading-relaxed text-mist-400">
          Sesi berlaku 30 hari di perangkat ini. Sandi diatur melalui variabel APP_PASSWORD.
        </p>
      </form>
    </div>
  );
}
