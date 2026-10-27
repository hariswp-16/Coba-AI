import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

let cachedFfmpeg: string | null = null;
let cachedFfprobe: string | null = null;

function resolveBinary(kind: "ffmpeg" | "ffprobe"): string {
  const override = kind === "ffmpeg" ? env.ffmpeg.ffmpegPath : env.ffmpeg.ffprobePath;
  if (override) return override;
  try {
    if (kind === "ffmpeg") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("@ffmpeg-installer/ffmpeg");
      if (mod?.path && fs.existsSync(mod.path)) return mod.path as string;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("ffprobe-static");
      if (mod?.path && fs.existsSync(mod.path)) return mod.path as string;
    }
  } catch {
    /* fall through to PATH */
  }
  return kind;
}

export function ffmpegPath(): string {
  if (!cachedFfmpeg) cachedFfmpeg = resolveBinary("ffmpeg");
  return cachedFfmpeg;
}
export function ffprobePath(): string {
  if (!cachedFfprobe) cachedFfprobe = resolveBinary("ffprobe");
  return cachedFfprobe;
}

export function runFfmpeg(args: string[], opts?: { onStderr?: (line: string) => void; timeoutMs?: number }): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = opts?.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("ffmpeg timeout"));
        }, opts.timeoutMs)
      : null;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      stderr += d;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      if (opts?.onStderr) {
        for (const line of String(d).split(/\r?\n/)) if (line.trim()) opts.onStderr(line);
      }
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrate: number;
  sizeBytes: number;
  hasAudio: boolean;
  sampleRate: number | null;
  channels: number | null;
  formatName: string | null;
}

export async function probe(filePath: string): Promise<ProbeResult> {
  const out = await new Promise<string>((resolve, reject) => {
    execFile(
      ffprobePath(),
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath],
      { maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      }
    );
  });
  const data = JSON.parse(out) as {
    format?: Record<string, unknown>;
    streams?: Record<string, unknown>[];
  };
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  const fmt = data.format ?? {};
  const fpsRaw = (v?.avg_frame_rate as string) || (v?.r_frame_rate as string) || "0/1";
  const [n, d] = fpsRaw.split("/").map(Number);
  return {
    duration: Number(fmt.duration ?? v?.duration ?? a?.duration ?? 0),
    width: Number(v?.width ?? 0),
    height: Number(v?.height ?? 0),
    fps: d ? Math.round((n / d) * 100) / 100 : 0,
    videoCodec: (v?.codec_name as string) ?? null,
    audioCodec: (a?.codec_name as string) ?? null,
    bitrate: Number(fmt.bit_rate ?? 0),
    sizeBytes: Number(fmt.size ?? 0),
    hasAudio: Boolean(a),
    sampleRate: a?.sample_rate ? Number(a.sample_rate) : null,
    channels: a?.channels ? Number(a.channels) : null,
    formatName: (fmt.format_name as string) ?? null,
  };
}

export async function extractFrame(filePath: string, atSeconds: number, outPath: string, width = 360) {
  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    atSeconds.toFixed(3),
    "-i",
    filePath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:-2`,
    "-y",
    outPath,
  ]);
}

export async function extractAudioWav(filePath: string, outPath: string, sampleRate = 44100) {
  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    filePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(sampleRate),
    "-c:a",
    "pcm_s16le",
    "-y",
    outPath,
  ]);
}

export function wavHeader(dataLength: number, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

export async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

export function tempDir(prefix = "studio"): string {
  const dir = path.join(env.storage.localDir, "_tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function cleanupDir(dir: string) {
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function ffmpegAvailable(): Promise<{ ok: boolean; version: string | null; error: string | null }> {
  try {
    const out = await new Promise<string>((resolve, reject) => {
      execFile(ffmpegPath(), ["-version"], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
    return { ok: true, version: out.split("\n")[0] ?? null, error: null };
  } catch (e) {
    return { ok: false, version: null, error: e instanceof Error ? e.message : String(e) };
  }
}
