import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

export interface CloneRequest {
  name: string;
  samplePath: string;
  sampleSeconds: number;
  consent: boolean;
}

export interface CloneResult {
  providerVoiceId: string | null;
  provider: string;
  status: "ready" | "unavailable" | "error";
  note: string;
}

export interface VoiceCloneAdapter {
  id: string;
  label: string;
  available(): boolean;
  createVoice(req: CloneRequest): Promise<CloneResult>;
  deleteVoice?(providerVoiceId: string): Promise<void>;
}

/** ElevenLabs instant voice cloning (persistent voice IDs). */
export const elevenLabsClone: VoiceCloneAdapter = {
  id: "elevenlabs",
  label: "ElevenLabs Instant Voice Cloning",
  available: () => Boolean(env.voiceClone.apiKey || env.tts.apiKey),
  async createVoice(req) {
    const key = env.voiceClone.apiKey || env.tts.apiKey;
    if (!key) throw new Error("VOICE_CLONE_API_KEY belum diatur");
    if (!req.consent) throw new Error("Persetujuan hak suara wajib diberikan");
    const sample = await fs.readFile(req.samplePath);
    const form = new FormData();
    form.append("name", req.name);
    form.append("files", new Blob([new Uint8Array(sample)], { type: "audio/wav" }), path.basename(req.samplePath));
    form.append("description", "AI Video Studio — Suara Saya");
    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      return { providerVoiceId: null, provider: "elevenlabs", status: "error", note: `Gagal membuat voice profile: ${body.slice(0, 300)}` };
    }
    const json = (await res.json()) as { voice_id: string };
    return {
      providerVoiceId: json.voice_id,
      provider: "elevenlabs",
      status: "ready",
      note: "Voice profile tersimpan di ElevenLabs dan dapat dipakai berulang tanpa unggah ulang.",
    };
  },
  async deleteVoice(providerVoiceId: string) {
    const key = env.voiceClone.apiKey || env.tts.apiKey;
    if (!key) return;
    await fetch(`https://api.elevenlabs.io/v1/voices/${providerVoiceId}`, {
      method: "DELETE",
      headers: { "xi-api-key": key },
    });
  },
};

/** Fish Audio — also supports persistent voice models. */
export const fishAudioClone: VoiceCloneAdapter = {
  id: "fishaudio",
  label: "Fish Audio Voice Clone",
  available: () => Boolean(env.voiceClone.apiKey),
  async createVoice(req) {
    const key = env.voiceClone.apiKey;
    if (!key) throw new Error("VOICE_CLONE_API_KEY belum diatur");
    const sample = await fs.readFile(req.samplePath);
    const form = new FormData();
    form.append("title", req.name);
    form.append("type", "tts");
    form.append("train_mode", "fast");
    form.append("voices", new Blob([new Uint8Array(sample)], { type: "audio/wav" }), path.basename(req.samplePath));
    const res = await fetch("https://api.fish.audio/model", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      return { providerVoiceId: null, provider: "fishaudio", status: "error", note: `Fish Audio gagal: ${body.slice(0, 300)}` };
    }
    const json = (await res.json()) as { _id?: string; id?: string };
    return {
      providerVoiceId: json._id ?? json.id ?? null,
      provider: "fishaudio",
      status: "ready",
      note: "Voice model tersimpan di Fish Audio.",
    };
  },
};

const ADAPTERS = [elevenLabsClone, fishAudioClone];

export function getCloneAdapter(): VoiceCloneAdapter | null {
  if (env.voiceClone.provider === "none") return null;
  return ADAPTERS.find((a) => a.id === env.voiceClone.provider) ?? null;
}

export function voiceCloneStatus(): { available: boolean; provider: string; reason: string } {
  const adapter = getCloneAdapter();
  if (!adapter) {
    return {
      available: false,
      provider: env.voiceClone.provider,
      reason:
        "Voice cloning belum aktif. Atur VOICE_CLONE_PROVIDER=elevenlabs (atau fishaudio) dan VOICE_CLONE_API_KEY untuk mengaktifkan \"Suara Saya\" dengan profil suara permanen.",
    };
  }
  if (!adapter.available()) {
    return {
      available: false,
      provider: adapter.id,
      reason: `Provider "${adapter.label}" dipilih tetapi API key belum diatur.`,
    };
  }
  return { available: true, provider: adapter.id, reason: `${adapter.label} siap dipakai.` };
}
