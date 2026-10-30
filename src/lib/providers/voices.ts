import type { VoicePreset } from "../types";

/**
 * Voice presets. `local` presets are guaranteed to exist: they run the bundled
 * Paradee-8M neural Indonesian narrator (24 kHz, ONNX, offline) at different
 * rates and personas. Remote presets are only listed when the configured
 * provider actually exposes them.
 */
export const LOCAL_VOICE_PRESETS: VoicePreset[] = [
  {
    id: "narrator-dramatic",
    name: "Narator Dramatis",
    persona: "dramatis",
    description: "Narator pria neural, tempo sedang dengan jeda tegang untuk cerita misteri dan konflik.",
    provider: "local",
    providerVoiceId: "id",
    rate: 0.92,
    pitch: -0.06,
  },
  {
    id: "narrator-mystery",
    name: "Narator Misterius",
    persona: "misterius",
    description: "Lebih pelan dan rendah, terasa seperti bisikan di kegelapan.",
    provider: "local",
    providerVoiceId: "id",
    rate: 0.84,
    pitch: -0.18,
  },
  {
    id: "narrator-documentary",
    name: "Narator Dokumenter",
    persona: "dokumenter",
    description: "Netral, jelas, dan stabil — pilihan terbaik untuk dokumenter dan video edukasi.",
    provider: "local",
    providerVoiceId: "id",
    rate: 1.0,
    pitch: 0.0,
  },
  {
    id: "narrator-casual",
    name: "Narator Santai",
    persona: "santai",
    description: "Sedikit lebih cepat dan ringan, seperti bercerita ke teman.",
    provider: "local",
    providerVoiceId: "id",
    rate: 1.08,
    pitch: 0.06,
  },
  {
    id: "narrator-emotional",
    name: "Narator Emosional",
    persona: "emosional",
    description: "Lambat dan bergetar untuk adegan haru dan kehilangan.",
    provider: "local",
    providerVoiceId: "id",
    rate: 0.88,
    pitch: 0.12,
  },
];

export const ELEVENLABS_VOICES: VoicePreset[] = [
  {
    id: "el-adam",
    name: "Adam — Narator Dokumenter",
    persona: "dokumenter",
    description: "Suara pria dalam dan tenang (ElevenLabs multilingual).",
    provider: "elevenlabs",
    providerVoiceId: "pNInz6obpgDQGcFmaJgB",
    rate: 0.95,
    pitch: 0,
  },
  {
    id: "el-rachel",
    name: "Rachel — Narator Lembut",
    persona: "emosional",
    description: "Suara wanita hangat, cocok untuk cerita emosional.",
    provider: "elevenlabs",
    providerVoiceId: "21m00Tcm4TlvDq8ikWAM",
    rate: 0.92,
    pitch: 0,
  },
  {
    id: "el-antoni",
    name: "Antoni — Narator Dramatis",
    persona: "dramatis",
    description: "Suara pria ekspresif untuk cerita dramatis.",
    provider: "elevenlabs",
    providerVoiceId: "ErXwobaYiN019PkySvjV",
    rate: 0.9,
    pitch: 0,
  },
];

export const OPENAI_VOICES: VoicePreset[] = [
  {
    id: "oa-onyx",
    name: "Onyx — Narator Misterius",
    persona: "misterius",
    description: "Suara pria berat, cocok untuk suasana gelap.",
    provider: "openai",
    providerVoiceId: "onyx",
    rate: 0.92,
    pitch: 0,
  },
  {
    id: "oa-nova",
    name: "Nova — Narator Emosional",
    persona: "emosional",
    description: "Suara wanita jernih dengan artikulasi jelas.",
    provider: "openai",
    providerVoiceId: "nova",
    rate: 0.95,
    pitch: 0,
  },
  {
    id: "oa-alloy",
    name: "Alloy — Narator Netral",
    persona: "dokumenter",
    description: "Suara netral untuk narasi informatif.",
    provider: "openai",
    providerVoiceId: "alloy",
    rate: 1,
    pitch: 0,
  },
];

export function presetsForProvider(provider: string): VoicePreset[] {
  switch (provider) {
    case "elevenlabs":
      return ELEVENLABS_VOICES;
    case "openai":
      return OPENAI_VOICES;
    case "local":
    default:
      return LOCAL_VOICE_PRESETS;
  }
}

export function findPreset(id: string): VoicePreset | undefined {
  return [...LOCAL_VOICE_PRESETS, ...ELEVENLABS_VOICES, ...OPENAI_VOICES].find((v) => v.id === id);
}
