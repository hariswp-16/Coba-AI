/**
 * Paradee-8M neural Indonesian voice (ArboTTS, MIT).
 *
 * A ~9 MB single-speaker VITS-style model running fully offline through
 * ONNX Runtime's WASM backend — no API key, no network, no native binaries.
 * It replaces the robotic eSpeak-NG output that the "local" provider used to
 * give, at roughly 3.5x real time on one CPU core.
 *
 * Model + vocab live in `models/tts/` (see `TTS_MODEL_DIR` to override).
 */
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { detectLang, syllableWeight, textToIdIpa } from "./g2p-id";

export const PARADEE_SAMPLE_RATE = 24000;

type OrtModule = typeof import("onnxruntime-web");
type OrtSession = import("onnxruntime-web").InferenceSession;

let ortPromise: Promise<OrtModule> | null = null;
let sessionPromise: Promise<OrtSession> | null = null;
let vocabPromise: Promise<Record<string, number>> | null = null;

function modelDir(): string {
  return process.env.TTS_MODEL_DIR || path.join(process.cwd(), "models", "tts");
}

async function getOrt(): Promise<OrtModule> {
  if (ortPromise) return ortPromise;
  ortPromise = (async () => {
    const ort = await import("onnxruntime-web");
    // The WASM artifacts ship inside the npm package; point the runtime at them
    // instead of letting it look for a CDN (this box has no outbound network).
    const candidates = [
      path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist"),
      path.join(process.cwd(), "..", "node_modules", "onnxruntime-web", "dist"),
    ];
    const dist = candidates.find((c) => existsSync(path.join(c, "ort-wasm-simd-threaded.wasm")));
    if (dist) ort.env.wasm.wasmPaths = `${dist}${path.sep}`;
    // Threaded WASM needs cross-origin isolation in browsers and worker support
    // in Node; one thread is plenty for an 8M-parameter model.
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = "error";
    return ort;
  })();
  return ortPromise;
}

async function getVocab(): Promise<Record<string, number>> {
  if (vocabPromise) return vocabPromise;
  vocabPromise = (async () => {
    const raw = await fs.readFile(path.join(modelDir(), "vocab.json"), "utf8");
    return JSON.parse(raw) as Record<string, number>;
  })();
  return vocabPromise;
}

async function getSession(): Promise<OrtSession> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const ort = await getOrt();
    const modelPath = process.env.TTS_MODEL_PATH || path.join(modelDir(), "arbo_paradee_8m.onnx");
    const bytes = await fs.readFile(modelPath);
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    return session;
  })();
  return sessionPromise;
}

/** Warm the model up in the background (first call pays ~2-3 s of WASM init). */
export function warmParadee(): void {
  void getSession().catch(() => undefined);
}

/** Synthesize one short passage. Returns mono float32 audio at 24 kHz. */
export async function synthPassage(text: string, speed = 1): Promise<Float32Array> {
  const [session, vocab, ort] = await Promise.all([getSession(), getVocab(), getOrt()]);
  const lang = detectLang(text);
  // English is rare here; the Indonesian G2P still produces readable output for
  // loanwords, which is why we do not pull in a second phonemizer.
  const ipa = textToIdIpa(text);

  const ids: bigint[] = [0n];
  for (const ch of ipa) {
    const id = vocab[ch];
    if (id !== undefined) ids.push(BigInt(id));
  }
  if (ids.length <= 2) return new Float32Array(0);
  ids.push(0n);

  const inputIds = new ort.Tensor("int64", BigInt64Array.from(ids), [1, ids.length]);
  const speedTensor = new ort.Tensor("float32", Float32Array.from([Math.max(0.5, Math.min(1.6, speed))]), [1]);
  const out = await session.run({ input_ids: inputIds, speed: speedTensor });
  const waveform = out.waveform?.data as Float32Array | undefined;
  if (!waveform) return new Float32Array(0);
  return lang === "en" ? waveform : waveform;
}

/** Trim near-silent head/tail so concatenated sentences do not drift. */
function trimSilence(audio: Float32Array, threshold = 0.008): Float32Array {
  let start = 0;
  let end = audio.length;
  while (start < end && Math.abs(audio[start]) < threshold) start++;
  while (end > start && Math.abs(audio[end - 1]) < threshold) end--;
  if (start >= end) return audio;
  const pad = Math.round(PARADEE_SAMPLE_RATE * 0.012);
  start = Math.max(0, start - pad);
  end = Math.min(audio.length, end + pad);
  return audio.subarray(start, end);
}

function peakNormalize(audio: Float32Array, target = 0.89): Float32Array {
  let peak = 0;
  for (let i = 0; i < audio.length; i++) peak = Math.max(peak, Math.abs(audio[i]));
  if (peak < 1e-4) return audio;
  const gain = target / peak;
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    // soft clip keeps plosives from snapping when we push the level up
    const v = audio[i] * gain;
    out[i] = v > 1 || v < -1 ? Math.tanh(v) : v;
  }
  return out;
}

export interface ParadeeWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface ParadeeSpeech {
  audio: Float32Array;
  sampleRate: number;
  durationMs: number;
  words: ParadeeWord[];
}

function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [clean];
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Synthesize a whole narration block: one ONNX pass per sentence (the model is
 * trained on utterances, not paragraphs), then join with natural pauses and
 * spread word timings across each sentence by syllable weight.
 */
export async function synthesizeNarration(
  text: string,
  opts: { speed?: number; pauseMs?: number } = {}
): Promise<ParadeeSpeech> {
  const speed = opts.speed ?? 1;
  const pauseMs = opts.pauseMs ?? 190;
  const sentences = splitSentences(text);
  const chunks: Float32Array[] = [];
  const words: ParadeeWord[] = [];

  const leadIn = Math.round((PARADEE_SAMPLE_RATE * 90) / 1000);
  const pause = Math.round((PARADEE_SAMPLE_RATE * pauseMs) / 1000);
  let cursor = 0; // samples

  // leading breath
  chunks.push(new Float32Array(leadIn));
  cursor += leadIn;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const raw = await synthPassage(sentence, speed);
    if (!raw.length) continue;
    const audio = peakNormalize(trimSilence(raw));
    chunks.push(audio);
    const startSample = cursor;
    cursor += audio.length;

    const tokens = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}.'’-]*/gu) ?? [];
    const weights = tokens.map((t) => syllableWeight(t));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const durMs = (audio.length / PARADEE_SAMPLE_RATE) * 1000;
    let acc = 0;
    tokens.forEach((tok, k) => {
      const wordStart = startSample / PARADEE_SAMPLE_RATE + (acc / total) * (durMs / 1000);
      acc += weights[k];
      const wordEnd = startSample / PARADEE_SAMPLE_RATE + (acc / total) * (durMs / 1000);
      words.push({
        text: tok,
        startMs: Math.round(wordStart * 1000),
        endMs: Math.round(wordEnd * 1000),
      });
    });

    if (i < sentences.length - 1) {
      chunks.push(new Float32Array(pause));
      cursor += pause;
    }
  }

  // trailing breath so the last word is not clipped by the next scene
  chunks.push(new Float32Array(Math.round((PARADEE_SAMPLE_RATE * 140) / 1000)));

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const audio = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    audio.set(c, off);
    off += c.length;
  }
  const durationMs = Math.round((total / PARADEE_SAMPLE_RATE) * 1000);
  return { audio, sampleRate: PARADEE_SAMPLE_RATE, durationMs, words };
}

/** Convert float32 mono audio to a 16-bit PCM WAV buffer. */
export function toWav(audio: Float32Array, sampleRate = PARADEE_SAMPLE_RATE): Buffer {
  const dataBytes = audio.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < audio.length; i++) {
    const v = Math.max(-1, Math.min(1, audio[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}
