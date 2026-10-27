import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ffmpegPath, probe, tempDir, cleanupDir, runFfmpeg } from "../ffmpeg";
import type { ReferenceAnalysis, StyleProfileSpec, CharacterSpec } from "../types";
import { STICKMAN_CINEMATIC, cloneSpec } from "./presets";

export interface AnalyzeOptions {
  filePath: string;
  fileName: string;
  onStage?: (stage: string, fraction: number) => void;
}

/** Decodes N frames as raw RGB at a small size for pixel analysis. */
async function sampleFrames(filePath: string, count: number, width: number, height: number, dir: string): Promise<{ frames: Buffer[]; times: number[]; duration: number }> {
  const info = await probe(filePath);
  const duration = info.duration;
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    times.push(Math.min(duration - 0.05, (duration * (i + 0.5)) / count));
  }
  const frames: Buffer[] = [];
  for (const t of times) {
    const out = path.join(dir, `f-${t.toFixed(2)}.rgb`);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      t.toFixed(3),
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:${height}`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-y",
      out,
    ]);
    frames.push(await fs.readFile(out));
  }
  return { frames, times, duration };
}

interface FrameStats {
  meanLuma: number;
  contrast: number;
  saturation: number;
  edgeDensity: number;
  dominant: string[];
  subtitleRows: { y0: number; y1: number; coverage: number } | null;
  hudPresent: boolean;
  emphasisColor: string | null;
}

function analyzeFrame(buf: Buffer, w: number, h: number): FrameStats {
  let lumaSum = 0;
  let lumaSq = 0;
  let satSum = 0;
  let edge = 0;
  const colorBuckets = new Map<string, number>();
  const brightRows = new Array(h).fill(0);
  const rowPixels = w;

  const lumas = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumas[y * w + x] = luma;
      lumaSum += luma;
      lumaSq += luma * luma;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      satSum += max === 0 ? 0 : (max - min) / max;
      // bright text-like pixels
      if (luma > 210) brightRows[y]++;
      // quantised colour bucket
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      colorBuckets.set(key, (colorBuckets.get(key) ?? 0) + 1);
      if (x > 0) {
        const prev = lumas[y * w + x - 1];
        if (Math.abs(luma - prev) > 45) edge++;
      }
    }
  }
  const total = w * h;
  const mean = lumaSum / total;
  const variance = Math.max(0, lumaSq / total - mean * mean);

  // subtitle band: contiguous rows in the lower 60% where many pixels are near-white
  const bands: { y0: number; y1: number; coverage: number }[] = [];
  let inBand = false;
  let bandStart = 0;
  let bandMax = 0;
  for (let y = Math.floor(h * 0.28); y < h; y++) {
    const cov = brightRows[y] / rowPixels;
    if (cov > 0.045) {
      if (!inBand) {
        inBand = true;
        bandStart = y;
        bandMax = 0;
      }
      bandMax = Math.max(bandMax, cov);
    } else if (inBand && cov < 0.02) {
      if (y - bandStart >= 3) bands.push({ y0: bandStart / h, y1: y / h, coverage: bandMax });
      inBand = false;
    }
  }
  if (inBand && h - bandStart >= 3) bands.push({ y0: bandStart / h, y1: 1, coverage: bandMax });
  // prefer bands that look like a text line (short height, high coverage)
  bands.sort((a, b) => {
    const score = (x: typeof a) => x.coverage * Math.min(1, (x.y1 - x.y0) / 0.02);
    return score(b) - score(a);
  });
  const bestBand = bands.find((b) => b.y0 > 0.4 && b.y0 < 0.9) ?? bands[0] ?? null;

  // HUD: bright clusters in the top 22% (typically label + clock + episode)
  let hudBrightRows = 0;
  let hudBrightPixels = 0;
  for (let y = Math.floor(h * 0.04); y < Math.floor(h * 0.22); y++) {
    let c = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const l = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      if (l > 190) c++;
    }
    if (c / w > 0.012) hudBrightRows++;
    hudBrightPixels += c;
  }
  const hudPresent = hudBrightRows >= 3 && hudBrightPixels / (w * h * 0.18) > 0.001;

  const dominant = [...colorBuckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key]) => {
      const [r, g, b] = key.split("-").map((v) => (Number(v) << 5) + 16);
      return `#${[r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`;
    });

  // look for coloured (non-white) subtitle words inside the detected band
  let emphasisColor: string | null = null;
  if (bestBand) {
    const y0 = Math.floor(bestBand.y0 * h);
    const y1 = Math.ceil(bestBand.y1 * h);
    const hits = new Map<string, number>();
    for (let y = y0; y < Math.min(h, y1); y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        const r = buf[i];
        const g = buf[i + 1];
        const b = buf[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max < 110) continue;
        const sat = (max - min) / Math.max(1, max);
        if (sat < 0.45) continue;
        // yellow / lime emphasis words used by the reference style
        // yellow / lime: green channel dominant relative to red and much higher than blue
        if (g > 120 && g >= r * 0.82 && b < g - 70) {
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
          hits.set(key, (hits.get(key) ?? 0) + 1);
        }
      }
    }
    const ranked = [...hits.entries()].sort((a, b2) => b2[1] - a[1]);
    if (ranked.length && ranked[0][1] > 12) {
      const [r, g, b] = ranked[0][0].split("-").map((v) => Math.min(255, (Number(v) << 4) + 8));
      emphasisColor = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    }
  }

  return {
    meanLuma: mean,
    contrast: Math.sqrt(variance),
    saturation: satSum / total,
    edgeDensity: edge / total,
    dominant,
    subtitleRows: bestBand,
    hudPresent,
    emphasisColor,
  };
}

async function detectScenes(filePath: string, threshold = 0.28): Promise<{ index: number; startSeconds: number; endSeconds: number; durationSeconds: number }[]> {
  const info = await probe(filePath);
  const times: number[] = [];
  await new Promise<void>((resolve) => {
    const child = spawn(ffmpegPath(), [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-filter:v",
      `select='gt(scene,${threshold})',showinfo`,
      "-f",
      "null",
      "-",
    ]);
    let buf = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      buf += d;
      const re = /pts_time:([0-9.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(buf)) !== null) {
        times.push(Number(m[1]));
      }
      if (buf.length > 100_000) buf = buf.slice(-50_000);
    });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
  const cuts = Array.from(new Set(times.map((t) => Math.round(t * 100) / 100))).sort((a, b) => a - b);
  const points = [0, ...cuts.filter((c) => c > 0.25 && c < info.duration - 0.2), info.duration];
  const scenes = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end - start < 0.35) continue;
    scenes.push({
      index: scenes.length,
      startSeconds: Math.round(start * 100) / 100,
      endSeconds: Math.round(end * 100) / 100,
      durationSeconds: Math.round((end - start) * 100) / 100,
    });
  }
  return scenes;
}

function parseLoudnorm(stderr: string): { input_i: number; input_tp: number; input_lra: number } {
  const grab = (k: string) => {
    const m = stderr.match(new RegExp(`"${k}"\\s*:\\s*"(-?[0-9.]+)"`));
    return m ? Number(m[1]) : 0;
  };
  return { input_i: grab("input_i"), input_tp: grab("input_tp"), input_lra: grab("input_lra") };
}

async function audioStats(filePath: string): Promise<{ lufs: number; peak: number; lra: number; silenceRatio: number; voiceRatio: number }> {
  let loud = { input_i: -70, input_tp: -70, input_lra: 0 };
  try {
    const { stderr } = await runFfmpeg(["-hide_banner", "-nostats", "-i", filePath, "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
    loud = parseLoudnorm(stderr);
  } catch {
    /* silent audio */
  }
  let silence = 0;
  let voiced = 0;
  try {
    const { stderr } = await runFfmpeg([
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-af",
      "silencedetect=noise=-32dB:d=0.35",
      "-f",
      "null",
      "-",
    ]);
    const dur = await probe(filePath).then((p) => p.duration);
    const re = /silence_duration:\s*([0-9.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stderr)) !== null) silence += Number(m[1]);
    silence = Math.min(silence, dur);
    voiced = Math.max(0, dur - silence);
  } catch {
    /* ignore */
  }
  const info = await probe(filePath);
  return {
    lufs: loud.input_i,
    peak: loud.input_tp,
    lra: loud.input_lra,
    silenceRatio: info.duration ? silence / info.duration : 0,
    voiceRatio: info.duration ? voiced / info.duration : 0,
  };
}

function langFromHeuristics(): string {
  return "id";
}

/**
 * Analyses a reference video and derives a reusable style profile.
 * Everything here is measured from the real file with ffmpeg — nothing is faked.
 */
export async function analyzeReferenceVideo(o: AnalyzeOptions): Promise<{ analysis: ReferenceAnalysis; spec: StyleProfileSpec }> {
  const info = await probe(o.filePath);
  const dir = tempDir("analyze");
  try {
    o.onStage?.("Membaca metadata video", 0.05);
    if (!info.width || !info.height) throw new Error("File tidak memiliki stream video yang valid");

    o.onStage?.("Mendeteksi pergantian adegan", 0.15);
    const scenes = await detectScenes(o.filePath, 0.28);

    o.onStage?.("Menganalisis audio", 0.35);
    const audio = info.hasAudio ? await audioStats(o.filePath) : { lufs: -70, peak: -70, lra: 0, silenceRatio: 1, voiceRatio: 0 };

    o.onStage?.("Menganalisis visual", 0.5);
    const smallW = 216;
    const smallH = Math.max(2, Math.round((smallW * info.height) / info.width));
    const { frames, times } = await sampleFrames(o.filePath, 16, smallW, smallH, dir);
    const stats = frames.map((f) => analyzeFrame(f, smallW, smallH));
    const avg = (pick: (s: FrameStats) => number) => stats.reduce((a, s) => a + pick(s), 0) / Math.max(1, stats.length);

    const subtitleFrames = stats.filter((s) => s.subtitleRows);
    const subtitleBand = subtitleFrames.length
      ? {
          detected: true,
          centerYRatio:
            subtitleFrames.reduce((a, s) => a + ((s.subtitleRows!.y0 + s.subtitleRows!.y1) / 2), 0) / subtitleFrames.length,
          coverageRatio: subtitleFrames.reduce((a, s) => a + s.subtitleRows!.coverage, 0) / subtitleFrames.length,
        }
      : { detected: false, centerYRatio: 0.7, coverageRatio: 0 };
    const hudDetected = stats.filter((s) => s.hudPresent).length >= Math.ceil(stats.length / 2);
    const emphasisColors = stats.map((s) => s.emphasisColor).filter((c): c is string => Boolean(c));

    // colour palette from the middle frame (avoids intro/outro cards)
    const mid = stats[Math.floor(stats.length / 2)] ?? stats[0];
    const dominant = mid?.dominant ?? [];

    o.onStage?.("Menyusun profil gaya", 0.8);
    const sceneDurations = scenes.map((s) => s.durationSeconds);
    const avgScene = sceneDurations.length ? sceneDurations.reduce((a, b) => a + b, 0) / sceneDurations.length : info.duration;
    const cutPattern = {
      avgSceneSeconds: Math.round(avgScene * 100) / 100,
      cutsPerMinute: Math.round((scenes.length / Math.max(1, info.duration / 60)) * 10) / 10,
      shortest: sceneDurations.length ? Math.min(...sceneDurations) : info.duration,
      longest: sceneDurations.length ? Math.max(...sceneDurations) : info.duration,
    };

    // speech rate estimate: words ≈ voiced seconds × 2.6 (Indonesian narration average)
    const estimatedWpm = Math.round(Math.min(200, Math.max(80, audio.voiceRatio * 165)));

    const aspect = info.width / info.height;
    const aspectLabel = Math.abs(aspect - 9 / 16) < 0.05 ? "9:16" : Math.abs(aspect - 16 / 9) < 0.05 ? "16:9" : Math.abs(aspect - 1) < 0.05 ? "1:1" : `${info.width}:${info.height}`;
    const meanLuma = avg((s) => s.meanLuma);
    const contrast = avg((s) => s.contrast);
    const saturation = avg((s) => s.saturation);
    const edgeDensity = avg((s) => s.edgeDensity);

    const notes: string[] = [];
    notes.push(`Terdeteksi ${scenes.length} adegan dengan durasi rata-rata ${cutPattern.avgSceneSeconds}s.`);
    notes.push(
      subtitleBand.detected
        ? `Subtitle terdeteksi pada ${(subtitleBand.centerYRatio * 100).toFixed(0)}% tinggi frame dengan cakupan ${(subtitleBand.coverageRatio * 100).toFixed(1)}%.`
        : "Tidak ada subtitle yang terdeteksi secara otomatis; gaya subtitle memakai preset."
    );
    if (hudDetected) notes.push("Ada elemen grafis di bagian atas frame (label/jam/episode).");
    notes.push(`Tingkat pencahayaan rata-rata ${meanLuma.toFixed(0)}/255, kontras ${contrast.toFixed(0)}, saturasi ${(saturation * 100).toFixed(0)}%.`);
    notes.push("Kecepatan narasi adalah estimasi dari rasio suara aktif; transkripsi otomatis memerlukan provider STT.");
    if (!info.hasAudio) notes.push("Video referensi tidak memiliki audio — pengaturan suara memakai preset.");

    // preview frames as data urls (jpg via ffmpeg)
    o.onStage?.("Mengambil contoh frame", 0.9);
    const sampleFramesOut: { timeSeconds: number; dataUrl: string }[] = [];
    for (const t of [times[0], times[Math.floor(times.length / 2)], times[times.length - 1]]) {
      const p = path.join(dir, `thumb-${t.toFixed(2)}.jpg`);
      try {
        await runFfmpeg(["-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", o.filePath, "-frames:v", "1", "-vf", "scale=270:-2", "-q:v", "6", "-y", p]);
        const bytes = await fs.readFile(p);
        sampleFramesOut.push({ timeSeconds: Math.round(t * 100) / 100, dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}` });
      } catch {
        /* skip frame */
      }
    }

    const analysis: ReferenceAnalysis = {
      source: {
        fileName: o.fileName,
        durationSeconds: Math.round(info.duration * 100) / 100,
        width: info.width,
        height: info.height,
        aspect: aspectLabel,
        fps: info.fps,
        videoCodec: info.videoCodec ?? "unknown",
        audioCodec: info.audioCodec ?? "none",
        bitrateKbps: Math.round(info.bitrate / 1000),
        sizeBytes: info.sizeBytes,
      },
      scenes,
      cutPattern,
      audio: {
        integratedLufs: audio.lufs,
        truePeakDb: audio.peak,
        loudnessRange: audio.lra,
        silenceRatio: Math.round(audio.silenceRatio * 100) / 100,
        hasVoice: audio.voiceRatio > 0.15,
        musicPresence: audio.voiceRatio > 0.8 ? "narasi hampir penuh (musik pelan/ducking)" : "narasi dengan jeda & musik latar",
        estimatedWpm,
      },
      visual: {
        dominantColors: dominant,
        brightness: Math.round((meanLuma / 255) * 100) / 100,
        contrast: Math.round((contrast / 128) * 100) / 100,
        saturation: Math.round(saturation * 100) / 100,
        edgeDensity: Math.round(edgeDensity * 1000) / 1000,
        subtitleBand,
        hudBand: { detected: hudDetected, centerYRatio: hudDetected ? 0.1 : 0 },
        lineWork: edgeDensity > 0.08 ? "garis tebal, bentuk sederhana" : "garis halus, detail rendah",
        estimatedStyle: meanLuma < 110 ? "animasi 2D gelap sinematik" : "animasi 2D terang",
        emphasisColors,        
      },
      sampleFrames: sampleFramesOut,
      notes,
      analyzedAt: new Date().toISOString(),
    };

    return { analysis, spec: deriveSpec(analysis, o.fileName) };
  } finally {
    await cleanupDir(dir);
  }
}

/** Turns measured data into an editable style profile. */
export function deriveSpec(a: ReferenceAnalysis, name: string): StyleProfileSpec {
  const base = cloneSpec(STICKMAN_CINEMATIC);
  const night = a.visual.brightness < 0.45;
  const dominant = a.visual.dominantColors;

  base.aspect = a.source.aspect === "16:9" ? "16:9" : a.source.aspect === "1:1" ? "1:1" : "9:16";
  base.width = a.source.width >= 1080 ? 1080 : 720;
  base.height = a.source.width >= 1080 ? Math.round((1080 * a.source.height) / a.source.width) : Math.round((720 * a.source.height) / a.source.width);
  base.fps = a.source.fps >= 25 ? Math.round(a.source.fps) : 30;

  if (dominant.length) {
    base.palette.wall = dominant[1] ?? dominant[0];
    base.palette.floor = dominant[2] ?? dominant[0];
    base.palette.background = dominant[0];
    const accent = dominant.find((c) => isWarm(c)) ?? base.palette.accent;
    base.palette.accent = accent;
  }
  base.lighting.vignette = a.visual.brightness < 0.4 ? 0.85 : 0.55;
  base.lighting.grain = a.visual.contrast < 0.5 ? 0.55 : 0.4;
  base.lighting.contrast = a.visual.contrast;
  base.lighting.colorTemp = night ? "hangat" : "netral";

  if (a.visual.subtitleBand.detected) {
    base.subtitle.enabled = true;
    base.subtitle.positionY = Math.min(0.86, Math.max(0.55, a.visual.subtitleBand.centerYRatio));
    const coverage = a.visual.subtitleBand.coverageRatio;
    base.subtitle.fontSize = Math.round(Math.min(76, Math.max(40, 40 + coverage * 260)));
    base.subtitle.wordsPerChunk = 3;
  }
  if (a.visual.emphasisColors.length >= 2) {
    base.subtitle.emphasisColor = mostCommon(a.visual.emphasisColors);
    base.palette.highlight = base.subtitle.emphasisColor;
  }
  base.hud.enabled = a.visual.hudBand.detected;
  base.hud.positionY = a.visual.hudBand.detected ? Math.max(0.06, a.visual.hudBand.centerYRatio - 0.03) : 0.1;

  base.pacing.avgSceneSeconds = a.cutPattern.avgSceneSeconds;
  base.pacing.wordsPerMinute = a.audio.estimatedWpm;
  base.transitions.durationMs = a.cutPattern.avgSceneSeconds < 2.5 ? 220 : 380;
  base.transitions.type = a.cutPattern.avgSceneSeconds < 2 ? "cut" : "fade";
  base.audio.loudnessTarget = Number.isFinite(a.audio.integratedLufs) && a.audio.integratedLufs < -5 ? Math.round(a.audio.integratedLufs) : -14;
  base.audio.musicVolume = a.audio.silenceRatio > 0.4 ? 0.26 : 0.18;
  base.opening.hookFirst = a.cutPattern.shortest < 2.5;
  base.characterStyle.description = `${a.visual.lineWork}, karakter kartun sederhana dengan warna solid dan wajah minimalis.`;
  base.background.style = `${a.visual.estimatedStyle} dengan ${dominant.length} warna dominan.`;
  base.narration.styleNotes = `Mengikuti referensi "${name}": ${a.cutPattern.cutsPerMinute} potongan per menit, tempo ${a.audio.estimatedWpm} kata/menit.`;
  return base;
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function isWarm(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r > b + 30;
}

export const DEFAULT_CHARACTER_TEMPLATE: CharacterSpec[] = STICKMAN_CINEMATIC.characters;
