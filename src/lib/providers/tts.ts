import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import { wavHeader } from "../ffmpeg";

export interface WordTiming {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TtsResult {
  audio: Buffer;
  mime: string;
  sampleRate: number;
  durationMs: number;
  words: WordTiming[];
  provider: string;
  voiceId: string;
  costUsd: number;
  notes?: string;
}

export interface TtsRequest {
  text: string;
  voiceId: string;
  /** provider-specific voice identifier */
  providerVoiceId?: string;
  rate?: number; // 0.6 - 1.4
  pitch?: number; // -0.4 - 0.4
  persona?: string;
  /** for cloned voices */
  mode?: "preset" | "cloned";
}

export interface TtsAdapter {
  id: string;
  label: string;
  available(): boolean;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

/* ------------------------------------------------------------------ */
/* eSpeak-NG (bundled, Indonesian) — always available, no API key      */
/* ------------------------------------------------------------------ */

type EspeakWorker = {
  set_voice: (v: string) => void;
  set_rate: (r: number) => void;
  set_pitch: (p: number) => void;
  set_range: (r: number) => void;
  get_samplerate: () => number;
  list_voices: () => { name: string; identifier: string; languages: { name: string }[] }[];
  synthesize: (text: string, cb: (audio: unknown, events: unknown[]) => boolean) => void;
};

let workerPromise: Promise<EspeakWorker> | null = null;

async function getEspeakWorker(): Promise<EspeakWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const mod = await import("@echogarden/espeak-ng-emscripten");
    const factory = (mod as unknown as { default: () => Promise<{ eSpeakNGWorker: new () => EspeakWorker }> }).default;
    const lib = await factory();
    return new lib.eSpeakNGWorker();
  })();
  return workerPromise;
}

function normalizeForSpeech(text: string): string {
  return text
    .replace(/["""'']/g, "")
    .replace(/[—–]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split narration into spoken tokens so eSpeak word events can be mapped reliably. */
export function tokenizeForTiming(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}.,!?%:'’-]*/gu) ?? [];
}

export const espeakTts: TtsAdapter = {
  id: "local",
  label: "eSpeak-NG Indonesia (lokal, tanpa API key)",
  available: () => true,
  async synthesize(req) {
    const worker = await getEspeakWorker();
    const text = normalizeForSpeech(req.text);
    worker.set_voice("id");
    // eSpeak rate: 80..500 wpm-ish, 175 default
    const rate = Math.round(168 * (req.rate ?? 1));
    worker.set_rate(Math.max(90, Math.min(320, rate)));
    worker.set_pitch(Math.round(48 + (req.pitch ?? 0) * 70));
    worker.set_range(Math.round(52 + Math.abs(req.pitch ?? 0) * 40));

    const chunks: Int16Array[] = [];
    const tokens = tokenizeForTiming(text);
    const rawWords: { text: string; startMs: number }[] = [];
    let sampleRate = worker.get_samplerate();
    let samplesSoFar = 0;
    let tokenPtr = 0;

    // NOTE: eSpeak-NG event `audio_position` is absolute milliseconds and
    // `text_position` is a byte offset (unreliable for UTF-8), so word events
    // are matched sequentially against the narration tokens instead.
    // Returning `false` keeps synthesis going; `true` aborts it.
    worker.synthesize(text, (audioRaw, events) => {
      const audio = audioRaw as Int16Array;
      const rateNow = worker.get_samplerate();
      sampleRate = rateNow;
      for (const ev of events as { type: string; word_length: number; audio_position: number }[]) {
        if (ev.type === "word") {
          const token = tokens[tokenPtr] ?? "";
          if (token) {
            // audio_position is absolute (ms) from the start of this synthesis call
            rawWords.push({ text: token, startMs: Math.round(ev.audio_position) });
            tokenPtr++;
          }
        }
      }
      chunks.push(audio);
      samplesSoFar += audio.length;
      return false;
    });

    const totalSamples = chunks.reduce((s, c) => s + c.length, 0);
    const pcm = Buffer.alloc(totalSamples * 2);
    let off = 0;
    for (const c of chunks) {
      Buffer.from(c.buffer, c.byteOffset, c.byteLength).copy(pcm, off);
      off += c.byteLength;
    }
    const totalMs = Math.round((totalSamples / sampleRate) * 1000);
    // close every word with the next word's start so subtitles stay in sync
    const words = rawWords.map((w, i) => {
      const next = rawWords[i + 1];
      const start = Math.max(0, Math.min(w.startMs, totalMs));
      const end = next ? Math.max(start + 120, Math.min(next.startMs - 20, totalMs)) : totalMs;
      return { text: w.text, startMs: start, endMs: Math.max(start + 100, end) };
    });
    const wav = Buffer.concat([wavHeader(pcm.length, sampleRate, 1, 16), pcm]);
    return {
      audio: wav,
      mime: "audio/wav",
      sampleRate,
      durationMs: Math.round((totalSamples / sampleRate) * 1000),
      words: words
        .map((w) => ({ ...w, text: w.text.replace(/[^\p{L}\p{N}.,!?%-]/gu, "").trim() }))
        .filter((w) => w.text.length > 0),
      provider: "local",
      voiceId: req.voiceId,
      costUsd: 0,
      notes: "Suara sintetis lokal (eSpeak-NG). Nada robotik; gunakan provider TTS berbayar untuk kualitas komersial.",
    };
  },
};

/* ------------------------------------------------------------------ */
/* ElevenLabs                                                          */
/* ------------------------------------------------------------------ */

function estimateElevenLabsCost(chars: number) {
  // ~ $0.30 / 1000 chars on the starter plan (informational only)
  return (chars / 1000) * env.cost.ttsPer1kChars;
}

export const elevenLabsTts: TtsAdapter = {
  id: "elevenlabs",
  label: "ElevenLabs (multilingual, mendukung voice cloning)",
  available: () => Boolean(env.tts.apiKey || env.voiceClone.apiKey),
  async synthesize(req) {
    const key = env.tts.apiKey || env.voiceClone.apiKey;
    if (!key) throw new Error("ELEVENLABS_API_KEY belum diatur");
    const voice = req.providerVoiceId || "pNInz6obpgDQGcFmaJgB";
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: req.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ElevenLabs TTS gagal (${res.status}): ${body.slice(0, 300)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    return {
      audio,
      mime: "audio/mpeg",
      sampleRate: 44100,
      // filled in by the caller after probing the audio, timings come from alignment
      durationMs: 0,
      words: [],
      provider: "elevenlabs",
      voiceId: req.voiceId,
      costUsd: estimateElevenLabsCost(req.text.length),
    };
  },
};

/* ------------------------------------------------------------------ */
/* OpenAI TTS                                                          */
/* ------------------------------------------------------------------ */

export const openAiTts: TtsAdapter = {
  id: "openai",
  label: "OpenAI gpt-4o-mini-tts",
  available: () => Boolean(env.tts.apiKey),
  async synthesize(req) {
    if (!env.tts.apiKey) throw new Error("TTS_API_KEY belum diatur");
    const res = await fetch(`${env.llm.baseUrl || "https://api.openai.com/v1"}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.tts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: req.providerVoiceId || "alloy",
        input: req.text,
        response_format: "mp3",
        instructions: `Bacakan dalam Bahasa Indonesia dengan intonasi ${req.persona || "dramatis"}, tempo ${req.rate ?? 1}x.`,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI TTS gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const audio = Buffer.from(await res.arrayBuffer());
    return {
      audio,
      mime: "audio/mpeg",
      sampleRate: 24000,
      durationMs: 0,
      words: [],
      provider: "openai",
      voiceId: req.voiceId,
      costUsd: (req.text.length / 1000) * env.cost.ttsPer1kChars,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Google Cloud TTS (WaveNet/Neural2 Indonesian voices)                */
/* ------------------------------------------------------------------ */

const GOOGLE_ID_VOICES: Record<string, string> = {
  "narrator-documentary": "id-ID-Wavenet-C", // male
  "narrator-dramatic": "id-ID-Wavenet-C",
  "narrator-mystery": "id-ID-Wavenet-C",
  "narrator-casual": "id-ID-Wavenet-B", // female
  "narrator-emotional": "id-ID-Wavenet-B",
};

export const googleTts: TtsAdapter = {
  id: "google",
  label: "Google Cloud TTS (id-ID)",
  available: () => Boolean(env.tts.apiKey),
  async synthesize(req) {
    if (!env.tts.apiKey) throw new Error("TTS_API_KEY (Google) belum diatur");
    const voiceName = req.providerVoiceId || GOOGLE_ID_VOICES[req.voiceId] || "id-ID-Wavenet-C";
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${env.tts.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: req.text },
        voice: { languageCode: "id-ID", name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate: req.rate ?? 1, pitch: (req.pitch ?? 0) * 10 },
      }),
    });
    if (!res.ok) throw new Error(`Google TTS gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { audioContent: string };
    const audio = Buffer.from(json.audioContent, "base64");
    return {
      audio,
      mime: "audio/mpeg",
      sampleRate: 24000,
      durationMs: 0,
      words: [],
      provider: "google",
      voiceId: req.voiceId,
      costUsd: (req.text.length / 1_000_000) * 16,
    };
  },
};

/* ------------------------------------------------------------------ */

export function getTtsAdapter(provider?: string): TtsAdapter {
  const id = provider || env.tts.provider;
  const adapter = [espeakTts, elevenLabsTts, openAiTts, googleTts].find((a) => a.id === id);
  if (!adapter) return espeakTts;
  if (!adapter.available()) {
    throw new Error(
      `Provider TTS "${id}" dipilih tetapi API key belum diatur. Tambahkan TTS_API_KEY di environment, atau gunakan provider "local".`
    );
  }
  return adapter;
}

export async function writeWav(buffer: Buffer, dir: string, name: string): Promise<string> {
  const file = path.join(dir, name);
  await fs.writeFile(file, buffer);
  return file;
}
