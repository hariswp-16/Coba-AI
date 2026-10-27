import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import { tempDir, cleanupDir, probe, runFfmpeg } from "../ffmpeg";
import { assetKey, saveFile, sha256, storage } from "../storage";
import {
  appendJobLog,
  getCache,
  getJob,
  getProjectRow,
  getStyle,
  getVoiceProfile,
  insertAsset,
  mapProjectRow,
  recordCost,
  setCache,
  updateJob,
  updateProject,
} from "../db/repo";
import type { RenderJob, Scene, StoryDoc, StyleProfileSpec, SubtitleStyle, VoiceSettings } from "../types";
import { RENDER_STEPS } from "../types";
import { getTtsAdapter, type TtsResult } from "../providers/tts";
import { findPreset } from "../providers/voices";
import { getImageAdapter, hasAiImages } from "../providers/image";
import { buildTimeline, transitionWindows, type TimedScene } from "./timeline";
import { renderVideoTrack, muxAudio, extractThumbnail, sceneStaging } from "./video";
import { mixAudio, type SfxEvent, type VoiceSegment } from "../audio/mix";
import { moodFromText, renderMusicBed, renderSfx, type SfxName } from "../audio/music";
import { toWav, wavToStereo } from "../audio/synth";
import { wordsToSrt } from "../anim/subtitle";
import type { SceneWord } from "../types";
import { ensureFonts } from "./fonts";
import { hudClockFor } from "../anim/hud";
import { buildShortLabel } from "../story/labels";

export interface PipelineOptions {
  jobId: string;
  projectId: string;
  sceneIds?: string[]; // regenerate only these scenes
  reuseVideo?: boolean;
  onProgress?: (progress: number, step: string, note?: string) => void;
}

/** Thrown when the user cancels a queued/running job. */
export class RenderCanceledError extends Error {
  constructor(jobId: string) {
    super(`Render ${jobId} dibatalkan oleh pengguna`);
    this.name = "RenderCanceledError";
  }
}

export interface PipelineResult {
  videoAssetId: string;
  srtAssetId: string;
  thumbnailAssetId: string;
  durationSeconds: number;
  costUsd: number;
}

function stepList(active: string, done: string[] = []): RenderJob["steps"] {
  return RENDER_STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    status: done.includes(s.key) ? "done" : s.key === active ? "active" : "pending",
  }));
}

export async function runRenderPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  ensureFonts();
  const row = getProjectRow(opts.projectId);
  if (!row) throw new Error("Proyek tidak ditemukan");
  const project = mapProjectRow(row);
  const story = project.story;
  if (!story) throw new Error("Proyek belum memiliki storyboard");
  const styleRow = project.styleProfileId ? getStyle(project.styleProfileId) : null;
  if (!styleRow) throw new Error("Profil gaya tidak ditemukan");
  const style = styleRow.spec;
  const subtitleStyle: SubtitleStyle = { ...style.subtitle, ...(project.subtitleSettings as Partial<SubtitleStyle>) };
  const voice = project.voiceSettings;
  const audioSettings = project.audioSettings;
  const targetMs = project.durationTarget * 1000;

  const work = tempDir("render");
  let cost = 0;
  /** Cooperative cancellation: the API marks the job `canceled`, the pipeline stops at the next checkpoint. */
  const assertNotCanceled = () => {
    if (getJob(opts.jobId)?.status === "canceled") throw new RenderCanceledError(opts.jobId);
  };
  const progress = (step: string, fraction: number, note?: string) => {
    assertNotCanceled();
    updateJob(opts.jobId, { step: step as never, progress: Math.round(fraction * 100), steps: stepList(step, RENDER_STEPS.filter((s) => stepOrder(s.key) < stepOrder(step)).map((s) => s.key)) });
    opts.onProgress?.(fraction, step, note);
  };

  try {
    /* ---------------- 1. analyze ---------------- */
    progress("analyze", 0.02, "Menyiapkan timeline");
    appendJobLog(opts.jobId, `Mulai render proyek ${project.title} (${project.durationTarget}s, ${project.width}x${project.height})`);
    updateProject(project.id, { status: "generating", error: null });
    const scenes = story.scenes;

    /* ---------------- 2. storyboard ---------------- */
    progress("storyboard", 0.06, "Menyiapkan storyboard & staging");
    const estimated: Record<string, number> = {};
    for (const s of scenes) estimated[s.id] = Math.round((s.narration.split(/\s+/).length / 150) * 60000);
    let timeline = buildTimeline(story, { targetMs, audioByScene: estimated });
    appendJobLog(opts.jobId, `Storyboard: ${scenes.length} adegan`);

    /* ---------------- 3. visual ---------------- */
    progress("visual", 0.1, "Menyiapkan visual");
    const imagesByScene: Record<string, { path: string } | undefined> = {};
    const imageAdapter = hasAiImages() ? getImageAdapter() : null;
    if (imageAdapter) {
      let i = 0;
      for (const s of scenes) {
        i++;
        if (opts.sceneIds && !opts.sceneIds.includes(s.id)) continue;
        progress("visual", 0.1 + (i / scenes.length) * 0.12, `Menggambar adegan ${i}/${scenes.length}`);
        const cacheKey = `img:${imageAdapter.id}:${sha256(s.imagePrompt)}:${project.width}x${project.height}`;
        const cached = getCache(cacheKey);
        if (cached) {
          const p = await storage().localPath((await getAssetKey(cached.assetId)) ?? "");
          if (p) imagesByScene[s.id] = { path: p };
          continue;
        }
        try {
          const res = await imageAdapter.generate({
            prompt: s.imagePrompt,
            width: project.width,
            height: project.height,
            seed: Math.floor(Math.random() * 1_000_000),
          });
          const key = assetKey("image", `${s.id}.png`);
          const saved = await saveFile(key, await writeTemp(work, `${s.id}-img.png`, res.buffer), res.mime);
          const assetId = insertAsset({
            kind: "image",
            storageKey: saved.key,
            fileName: `${s.id}.png`,
            mime: res.mime,
            bytes: saved.bytes,
            sha256: saved.sha256,
            width: project.width,
            height: project.height,
            provider: res.provider,
          });
          setCache(cacheKey, "image", assetId);
          cost += res.costUsd;
          recordCost(project.id, res.provider, "image", 1, "gambar", res.costUsd);
          const local = await storage().localPath(saved.key);
          if (local) imagesByScene[s.id] = { path: local };
        } catch (err) {
          appendJobLog(opts.jobId, `Peringatan: gambar AI untuk ${s.id} gagal (${err instanceof Error ? err.message : err}). Memakai animasi prosedural.`);
        }
      }
    } else {
      appendJobLog(opts.jobId, "Provider gambar AI tidak aktif — memakai animasi prosedural 2D (fallback) untuk semua adegan.");
    }

    /* ---------------- 4. voice ---------------- */
    progress("voice", 0.24, "Membuat voice-over");
    const voiceSegments: VoiceSegment[] = [];
    const audioByScene: Record<string, number> = {};
    const updatedScenes: Scene[] = [];
    const tts = getTtsAdapter(voice.mode === "cloned" ? voice.provider : undefined);
    const providerVoiceId = await resolveProviderVoiceId(voice);
    let sceneIndex = 0;
    for (const scene of scenes) {
      sceneIndex++;
      const needsTts = !opts.sceneIds || opts.sceneIds.includes(scene.id) || !scene.audioAssetId;
      let ttsResult: TtsResult | null = null;
      let audioAssetId = scene.audioAssetId ?? null;

      if (needsTts) {
        progress("voice", 0.24 + (sceneIndex / scenes.length) * 0.16, `Voice-over ${sceneIndex}/${scenes.length}`);
        const cacheKey = `tts:${tts.id}:${providerVoiceId ?? voice.voiceId}:${voice.rate}:${voice.pitch}:${sha256(scene.narration)}`;
        const cached = getCache(cacheKey);
        if (cached) {
          const wavBuf = await readAssetBuffer(cached.assetId);
          if (wavBuf) {
            const parsed = wavToStereo(wavBuf);
            const meta = cached.meta as { words?: TtsResult["words"]; durationMs?: number };
            ttsResult = {
              audio: wavBuf,
              mime: "audio/wav",
              sampleRate: parsed.sampleRate,
              durationMs: meta.durationMs ?? Math.round((parsed.buf.left.length / parsed.sampleRate) * 1000),
              words: meta.words ?? [],
              provider: "cache",
              voiceId: voice.voiceId,
              costUsd: 0,
            };
            audioAssetId = cached.assetId;
            appendJobLog(opts.jobId, `Voice-over ${scene.id}: memakai cache`);
          }
        }
        if (!ttsResult) {
          const result = await tts.synthesize({
            text: scene.narration,
            voiceId: voice.voiceId,
            providerVoiceId: providerVoiceId ?? undefined,
            rate: voice.rate,
            pitch: voice.pitch,
            persona: voice.persona,
            mode: voice.mode,
          });
          // remote providers don't return word timings — align from the audio
          let normalized = result;
          let words = result.words;
          let durationMs = result.durationMs;
          if (!words.length || result.mime !== "audio/wav") {
            const wavPath = path.join(work, `${scene.id}-tts.wav`);
            await runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", await writeTemp(work, `${scene.id}-tts-raw`, result.audio, result.mime), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", wavPath]);
            const p = await probe(wavPath);
            durationMs = Math.round(p.duration * 1000);
            words = words.length ? words : distributeWords(scene.narration, durationMs);
            normalized = { ...result, audio: await fs.readFile(wavPath), mime: "audio/wav", sampleRate: 16000, durationMs, words };
          } else if (!durationMs) {
            durationMs = result.words.at(-1)?.endMs ?? 0;
          }
          ttsResult = normalized;
          const key = assetKey("audio", `${scene.id}-${tts.id}.wav`);
          const wavPath = await writeTemp(work, `${scene.id}-tts-save.wav`, await ensureWav(ttsResult.audio, ttsResult.mime, work, scene.id));
          const saved = await saveFile(key, wavPath, "audio/wav");
          audioAssetId = insertAsset({
            kind: "audio",
            storageKey: saved.key,
            fileName: `${scene.id}.wav`,
            mime: "audio/wav",
            bytes: saved.bytes,
            durationSeconds: ttsResult.durationMs / 1000,
            provider: ttsResult.provider,
            sha256: saved.sha256,
          });
          setCache(cacheKey, "audio", audioAssetId, { words: ttsResult.words, durationMs: ttsResult.durationMs });
          cost += ttsResult.costUsd;
          if (ttsResult.costUsd > 0) recordCost(project.id, ttsResult.provider, "tts", scene.narration.length, "karakter", ttsResult.costUsd);
        }
      } else if (scene.audioAssetId) {
        const wavBuf = await readAssetBuffer(scene.audioAssetId);
        if (wavBuf) {
          const parsed = wavToStereo(wavBuf);
          const words = (scene.words ?? []).length ? scene.words : distributeWords(scene.narration, Math.round((parsed.buf.left.length / parsed.sampleRate) * 1000));
          ttsResult = {
            audio: wavBuf,
            mime: "audio/wav",
            sampleRate: parsed.sampleRate,
            durationMs: Math.round((parsed.buf.left.length / parsed.sampleRate) * 1000),
            words,
            provider: "cache",
            voiceId: voice.voiceId,
            costUsd: 0,
          };
        }
      }
      if (!ttsResult) throw new Error(`Voice-over untuk ${scene.id} gagal dibuat`);

      audioByScene[scene.id] = ttsResult.durationMs;
      updatedScenes.push({ ...scene, words: toSceneWords(ttsResult.words, scene), audioAssetId, status: "ready" });
    }

    /* ---------------- timeline with real audio ---------------- */
    const storyWithAudio: StoryDoc = { ...story, scenes: updatedScenes };
    timeline = buildTimeline(storyWithAudio, { targetMs, audioByScene });
    const acc = accumulateTimeline(timeline.scenes);
    // if narration overruns the target, speed the voice up once and retry
    if (timeline.totalMs > targetMs * 1.02) {
      appendJobLog(opts.jobId, `Narasi ${(timeline.totalMs / 1000).toFixed(1)}s melebihi target ${project.durationTarget}s — mempercepat TTS.`);
      const factor = Math.min(1.35, timeline.totalMs / targetMs);
      for (let i = 0; i < updatedScenes.length; i++) {
        const s = updatedScenes[i];
        const res = await tts.synthesize({
          text: s.narration,
          voiceId: voice.voiceId,
          providerVoiceId: providerVoiceId ?? undefined,
          rate: Math.min(1.4, voice.rate * factor),
          pitch: voice.pitch,
          persona: voice.persona,
          mode: voice.mode,
        });
        const wav = await ensureWav(res.audio, res.mime, work, `${s.id}-fast`);
        const parsed = wavToStereo(wav);
        const durMs = res.durationMs || Math.round((parsed.buf.left.length / parsed.sampleRate) * 1000);
        const words = res.words.length ? res.words : distributeWords(s.narration, durMs);
        const scaledWords = res.words.length ? words : words;
        updatedScenes[i] = { ...s, words: toSceneWords(scaledWords, s) };
        audioByScene[s.id] = durMs;
        const key = assetKey("audio", `${s.id}-fast.wav`);
        const saved = await saveFile(key, await writeTemp(work, `${s.id}-fast.wav`, wav), "audio/wav");
        updatedScenes[i].audioAssetId = insertAsset({
          kind: "audio",
          storageKey: saved.key,
          fileName: `${s.id}-fast.wav`,
          mime: "audio/wav",
          bytes: saved.bytes,
          durationSeconds: durMs / 1000,
          provider: res.provider,
        });
      }
      timeline = buildTimeline({ ...story, scenes: updatedScenes }, { targetMs, audioByScene });
    }

    for (const s of timeline.scenes) {
      const buf = await readAssetBuffer(s.audioAssetId ?? "");
      if (!buf) continue;
      voiceSegments.push({ startMs: s.startMs, wav: buf, gain: audioSettings.voiceVolume });
    }
    void acc;

    /* ---------------- 5. subtitle ---------------- */
    progress("subtitle", 0.42, "Menyusun subtitle");
    const srt = wordsToSrt(
      timeline.scenes.map((s) => ({ startMs: s.startMs, words: s.words, narration: s.narration })),
      { wordsPerCue: subtitleStyle.wordsPerChunk ?? 4 }
    );
    const srtKey = assetKey("subtitle", `${project.id}.srt`);
    const srtPath = path.join(work, "subtitle.srt");
    await fs.writeFile(srtPath, srt, "utf8");
    const srtSaved = await saveFile(srtKey, srtPath, "application/x-subrip");
    const srtAssetId = insertAsset({
      kind: "subtitle",
      storageKey: srtSaved.key,
      fileName: `${project.title}.srt`,
      mime: "application/x-subrip",
      bytes: srtSaved.bytes,
    });

    /* ---------------- 6. mix ---------------- */
    progress("mix", 0.48, "Menggabungkan audio");
    const totalMs = timeline.totalMs;
    const musicMood = audioSettings.musicEnabled ? moodFromText(audioSettings.musicMood || style.audio.musicMood) : null;
    let music = null;
    if (musicMood) {
      progress("mix", 0.5, `Menyiapkan musik (${musicMood})`);
      music = renderMusicBed(musicMood, totalMs / 1000 + 1, 7);
    }
    const sfxEvents: SfxEvent[] = [];
    if (audioSettings.sfxEnabled) {
      for (const s of timeline.scenes) {
        for (const name of s.sfx.slice(0, 2)) {
          if (!isSfxName(name)) continue;
          sfxEvents.push({
            name,
            atMs: s.startMs + 120,
            gain: name === "petir" ? 0.55 : name === "hujan" ? 0.32 : 0.28,
            wav: toWav(renderSfx(name, name === "hujan" ? Math.min(8, s.durationMs / 1000) : 3, 3)),
          });
        }
      }
    }
    const mixed = mixAudio(voiceSegments, music, sfxEvents, {
      durationMs: totalMs,
      voiceVol: audioSettings.voiceVolume,
      musicVol: audioSettings.musicEnabled ? audioSettings.musicVolume * 0.55 : 0,
      ducking: audioSettings.ducking,
      sfxVol: audioSettings.sfxEnabled ? 0.8 : 0,
      sfxEnabled: audioSettings.sfxEnabled,
    });
    const audioPath = path.join(work, "mix.wav");
    await fs.writeFile(audioPath, mixed.wav);
    const audioStats = await probe(audioPath);
    appendJobLog(opts.jobId, `Audio mix: ${audioStats.duration.toFixed(1)}s, peak -1.0 dBFS, durasi narasi ${(mixed.voiceActiveRatio * 100).toFixed(0)}%`);

    /* ---------------- 7. render ---------------- */
    progress("render", 0.56, "Merender video");
    const silentVideo = path.join(work, "video.mp4");
    const hudLabel = buildShortLabel(story, style);
    const hud = style.hud;
    const staging = sceneStaging(style, timeline.scenes);
    await renderVideoTrack(
      {
        story: storyWithAudio,
        style,
        subtitleStyle,
        hudStyle: { ...hud, labelText: hudLabel },
        hudData: {
          label: hudLabel,
          episode: `EPISODE ${story.episodeNumber ?? 1}`,
          clock: hudClockFor(timeline.scenes[0]?.timeOfDay ?? "malam", 17),
        },
        showHud: hud.enabled,
        width: project.width,
        height: project.height,
        fps: project.fps,
        durationMs: totalMs,
        audioByScene,
        stagingByScene: staging,
        imagesByScene,
        onProgress: (fraction, frame, total) => {
          // check for cancellation every ~30 frames so a long render can be stopped
          if (frame % 30 === 0) assertNotCanceled();
          updateJob(opts.jobId, { progress: Math.round((0.56 + fraction * 0.34) * 100) });
        },
      },
      silentVideo
    );

    const finalVideo = path.join(work, "final.mp4");
    progress("render", 0.92, "Muxing audio & video");
    await muxAudio(silentVideo, audioPath, finalVideo, { loudnessTarget: audioSettings.loudnessTarget });

    const thumbPath = path.join(work, "thumb.jpg");
    await extractThumbnail(finalVideo, thumbPath, Math.min(2.5, totalMs / 2000), 540);

    /* ---------------- 8. done ---------------- */
    progress("done", 0.96, "Menyimpan hasil");
    const videoKey = assetKey("render", `${project.id}.mp4`);
    const savedVideo = await saveFile(videoKey, finalVideo, "video/mp4");
    const finalProbe = await probe(finalVideo);
    const videoAssetId = insertAsset({
      kind: "render",
      storageKey: savedVideo.key,
      fileName: `${project.title}.mp4`,
      mime: "video/mp4",
      bytes: savedVideo.bytes,
      durationSeconds: finalProbe.duration,
      width: finalProbe.width,
      height: finalProbe.height,
      provider: "ffmpeg + canvas",
      sha256: savedVideo.sha256,
    });
    const thumbKey = assetKey("image", `${project.id}-thumb.jpg`);
    const savedThumb = await saveFile(thumbKey, thumbPath, "image/jpeg");
    const thumbAssetId = insertAsset({
      kind: "image",
      storageKey: savedThumb.key,
      fileName: `${project.id}-thumb.jpg`,
      mime: "image/jpeg",
      bytes: savedThumb.bytes,
    });

    updateProject(project.id, {
      status: "ready",
      story: { ...storyWithAudio, scenes: timeline.scenes.map(({ startMs, endMs, audioMs, ...rest }) => ({ ...rest, durationMs: rest.durationMs })) },
      videoAssetId,
      srtAssetId,
      thumbnailAssetId: thumbAssetId,
      durationSeconds: finalProbe.duration,
      error: null,
    });
    updateJob(opts.jobId, {
      status: "done",
      progress: 100,
      step: "done",
      steps: RENDER_STEPS.map((s) => ({ key: s.key, label: s.label, status: "done" as const })),
      outputAssetId: videoAssetId,
      srtAssetId,
      actualCostUsd: cost,
      finishedAt: new Date().toISOString(),
    });
    appendJobLog(opts.jobId, `Selesai: ${finalProbe.duration.toFixed(1)}s, ${(savedVideo.bytes / 1e6).toFixed(1)} MB`);

    return {
      videoAssetId,
      srtAssetId,
      thumbnailAssetId: thumbAssetId,
      durationSeconds: finalProbe.duration,
      costUsd: cost,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(opts.jobId, {
      status: "error",
      error: message,
      steps: RENDER_STEPS.map((s) => ({ key: s.key, label: s.label, status: "error" as const })),
      finishedAt: new Date().toISOString(),
    });
    updateProject(opts.projectId, { status: "error", error: message });
    appendJobLog(opts.jobId, `ERROR: ${message}`);
    throw err;
  } finally {
    await cleanupDir(work);
  }
}

function stepOrder(key: string): number {
  return RENDER_STEPS.findIndex((s) => s.key === key);
}

function accumulateTimeline(scenes: TimedScene[]) {
  return scenes.reduce((a, s) => a + s.durationMs, 0);
}

function isSfxName(name: string): name is SfxName {
  return ["hujan", "petir", "angin", "jantung", "langkah", "pintu", "whoosh", "dentang", "napas"].includes(name);
}

async function resolveProviderVoiceId(voice: VoiceSettings): Promise<string | null> {
  if (voice.mode === "cloned") {
    const profile = getVoiceProfile(voice.voiceId);
    if (!profile?.providerVoiceId) {
      throw new Error("Profil suara belum siap atau provider voice cloning belum aktif.");
    }
    return profile.providerVoiceId;
  }
  const preset = findPreset(voice.voiceId);
  return preset?.providerVoiceId ?? null;
}

async function writeTemp(dir: string, name: string, data: Buffer, ext?: string): Promise<string> {
  const file = path.join(dir, ext ? `${name}.${ext.replace(/[^a-z0-9]/gi, "")}` : name);
  await fs.writeFile(file, data);
  return file;
}

/** Converts any audio buffer to a plain WAV buffer. */
async function ensureWav(buffer: Buffer, mime: string, work: string, name: string): Promise<Buffer> {
  if (mime.includes("wav")) return buffer;
  const raw = path.join(work, `${name}-src.bin`);
  await fs.writeFile(raw, buffer);
  const wav = path.join(work, `${name}.wav`);
  await runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", raw, "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", "-y", wav]);
  return fs.readFile(wav);
}

async function readAssetBuffer(assetId: string): Promise<Buffer | null> {
  if (!assetId) return null;
  const { getAssetRow } = await import("../db/repo");
  const row = getAssetRow(assetId);
  if (!row) return null;
  try {
    return await storage().get(row.storageKey);
  } catch {
    return null;
  }
}

async function getAssetKey(assetId: string): Promise<string | null> {
  const { getAssetRow } = await import("../db/repo");
  return getAssetRow(assetId)?.storageKey ?? null;
}

/** Marks the emphasis words of a scene so subtitles can colour them. */
export function toSceneWords(words: { text: string; startMs: number; endMs: number }[], scene: Scene): SceneWord[] {
  const emphasis = new Set(
    (scene.emphasisWords ?? [])
      .map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((w) => w.length > 2)
  );
  return words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
    emphasis: emphasis.size > 0 && emphasis.has(w.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")),
  }));
}

/** Fallback word timings used when a provider returns audio without alignment. */
export function distributeWords(text: string, durationMs: number) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const weights = tokens.map((t) => 0.6 + Math.min(6, t.length) / 3);
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return tokens.map((t, i) => {
    const dur = (weights[i] / total) * durationMs;
    const startMs = Math.round(cursor);
    cursor += dur;
    return { text: t, startMs, endMs: Math.round(cursor) };
  });
}

export function estimateProjectCost(project: ReturnType<typeof mapProjectRow>): { usd: number; breakdown: { label: string; usd: number }[] } {
  const scenes = project.story?.scenes.length ?? 0;
  const chars = project.story?.scenes.reduce((a, s) => a + s.narration.length, 0) ?? 0;
  const breakdown = [
    { label: `Cerita (${env.llm.provider})`, usd: env.llm.provider === "local" ? 0 : env.cost.llmPerProject },
    { label: `Visual ${scenes} adegan (${hasAiImages() ? env.image.provider : "prosedural"})`, usd: hasAiImages() ? scenes * env.cost.imagePerScene : 0 },
    { label: `Voice-over ${chars} karakter (${env.tts.provider})`, usd: env.tts.provider === "local" ? 0 : (chars / 1000) * env.cost.ttsPer1kChars },
    { label: "Musik & efek suara (digenerate lokal)", usd: 0 },
    { label: "Rendering video (server sendiri)", usd: 0 },
  ];
  return { usd: breakdown.reduce((a, b) => a + b.usd, 0), breakdown };
}

export { transitionWindows };
