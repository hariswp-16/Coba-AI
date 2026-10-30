import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { ffmpegPath, runFfmpeg } from "../ffmpeg";
import { ensureFonts } from "./fonts";
import { renderSceneFrame, resetMotionState, type SceneRenderSpec, type StageCharacter } from "../anim/sceneRenderer";
import { planMotifs } from "../anim/gfx/motifs";
import { buildTimeline, transitionWindows, type TimedScene } from "./timeline";
import type { CharacterSpec, Scene, StoryDoc, StyleProfileSpec, SubtitleStyle, HudStyle } from "../types";
import { hashString, clamp, smoothstep, mulberry32 } from "../anim/geometry";
import { hudClockFor } from "../anim/hud";

export interface FrameRenderOptions {
  story: StoryDoc;
  style: StyleProfileSpec;
  subtitleStyle: SubtitleStyle;
  hudStyle: HudStyle;
  hudData: { label: string; episode: string; clock?: string };
  showHud: boolean;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  audioByScene: Record<string, number>;
  stagingByScene?: Record<string, StageCharacter[]>;
  imagesByScene?: Record<string, { path: string } | undefined>;
  onProgress?: (fraction: number, frame: number, total: number) => void;
  signal?: AbortSignal;
}

export interface FrameRenderResult {
  timelineMs: number;
  frames: number;
  elapsedMs: number;
}

function sceneSpec(
  o: FrameRenderOptions,
  scene: TimedScene,
  image: import("@napi-rs/canvas").Image | null,
  motif?: string
): SceneRenderSpec {
  return {
    index: scene.index,
    width: o.width,
    height: o.height,
    durationMs: scene.durationMs,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    weather: scene.weather,
    camera: scene.camera,
    mood: scene.mood,
    characters: o.story.characters,
    staging: o.stagingByScene?.[scene.id] ?? [],
    palette: o.style.palette,
    style: o.style,
    subtitleStyle: o.subtitleStyle,
    hudStyle: o.hudStyle,
    hudData: { label: o.hudData.label, clock: o.hudData.clock ?? "21:49", episode: o.hudData.episode },
    words: scene.words,
    seedKey: `${scene.id}-${scene.location}-${scene.mood}`,
    showHud: o.showHud,
    purpose: scene.purpose,
    ctaPills: scene.purpose === "cta" ? scene.ctaPills ?? ["MENYUSUL TEMANMU", "BAWA ADIK PULANG"] : undefined,
    ctaQuestion: scene.purpose === "cta" ? scene.ctaQuestion ?? "APA PILIHANMU?" : undefined,
    image,
    showSubtitles: true,
    sceneCount: o.story.scenes.length,
    gfxMotif: motif,
    stat: scene.stat,
  };
}

/**
 * Renders the full timeline to an MP4 (video only; audio is muxed later).
 * Frames are pushed as JPEG into a single ffmpeg process for speed, with
 * cross-fades blended inside the compositor (no ffmpeg xfade needed).
 */
export async function renderVideoTrack(o: FrameRenderOptions, outPath: string): Promise<FrameRenderResult> {
  ensureFonts();
  // every render starts from a clean spring state so output is reproducible
  resetMotionState();
  const started = Date.now();
  const timelineMs = o.durationMs;
  const fps = o.fps;
  const totalFrames = Math.max(1, Math.round((timelineMs / 1000) * fps));
  const timeline = buildTimeline(o.story, {
    targetMs: timelineMs,
    audioByScene: o.audioByScene,
  });
  const scenes = timeline.scenes;
  const windows = transitionWindows(scenes, 380);
  // one illustration per scene, no two consecutive shots alike
  const motifByScene = new Map(
    planMotifs(
      scenes.map((s) => ({
        location: s.location,
        timeOfDay: s.timeOfDay,
        weather: s.weather,
        purpose: s.purpose,
        seed: hashString(`${s.id}-${s.location}`),
      }))
    ).map((motif, i) => [scenes[i].id, motif] as const)
  );
  // an explicit `gfxMotif` on the scene always wins over the auto planner
  for (const s of scenes) {
    if (s.gfxMotif) motifByScene.set(s.id, s.gfxMotif as ReturnType<typeof planMotifs>[number]);
  }

  const images = new Map<string, import("@napi-rs/canvas").Image | null>();
  if (o.imagesByScene) {
    const { loadImage } = await import("@napi-rs/canvas");
    for (const [id, entry] of Object.entries(o.imagesByScene)) {
      if (!entry?.path) continue;
      try {
        images.set(id, await loadImage(entry.path));
      } catch {
        images.set(id, null);
      }
    }
  }

  const baseCanvas = createCanvas(o.width, o.height);
  const blendCanvas = createCanvas(o.width, o.height);
  const baseCtx = baseCanvas.getContext("2d") as unknown as import("../anim/geometry").Ctx;
  const blendCtx = blendCanvas.getContext("2d") as unknown as import("../anim/geometry").Ctx;

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-c:v",
    "mjpeg",
    "-framerate",
    String(fps),
    "-i",
    "-",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    o.height >= 1920 ? "21" : "22",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    "-y",
    outPath,
  ];

  const child = spawn(ffmpegPath(), args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d: string) => {
    stderr += d;
    if (stderr.length > 40_000) stderr = stderr.slice(-20_000);
  });
  // `killed` lets us abandon the encoder without leaving a rejected promise
  // behind: an unhandled rejection would take down the whole worker process.
  let killed = false;
  const done = new Promise<void>((resolve, reject) => {
    child.stdin.on("error", () => {
      /* EPIPE after an aborted render is expected */
    });
    child.on("error", (err) => (killed ? resolve() : reject(err)));
    child.on("close", (code) => {
      if (killed) return resolve();
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg render gagal (${code}): ${stderr.slice(-2000)}`));
    });
  });

  let sceneA: TimedScene | null = scenes[0] ?? null;
  let sceneB: TimedScene | null = null;
  let windowIndex = 0;

  try {
    for (let f = 0; f < totalFrames; f++) {
      if (o.signal?.aborted) throw new Error("Render dibatalkan");
      const t = (f / fps) * 1000;

      // pick scenes
      while (windowIndex < windows.length && t > windows[windowIndex].endMs) windowIndex++;
      const win = windows[windowIndex] && t >= windows[windowIndex].startMs ? windows[windowIndex] : null;
      if (win) {
        sceneA = scenes[win.aIndex];
        sceneB = scenes[win.bIndex];
      } else {
        const idx = scenes.findIndex((s) => t >= s.startMs && t < s.endMs);
        sceneA = idx >= 0 ? scenes[idx] : scenes[scenes.length - 1];
        sceneB = null;
      }
      if (!sceneA) break;

      const tA = clamp(t - sceneA.startMs, 0, sceneA.durationMs);
      renderSceneFrame(baseCtx, sceneSpec(o, sceneA, images.get(sceneA.id) ?? null, motifByScene.get(sceneA.id)), tA);

      if (win && sceneB) {
        const p = smoothstep((t - win.startMs) / Math.max(1, win.endMs - win.startMs));
        const tB = clamp(t - sceneB.startMs, 0, sceneB.durationMs);
        blendCtx.save();
        blendCtx.clearRect(0, 0, o.width, o.height);
        renderSceneFrame(blendCtx, sceneSpec(o, sceneB, images.get(sceneB.id) ?? null, motifByScene.get(sceneB.id)), tB);
        blendCtx.restore();
        baseCtx.save();
        if (win.type === "whip") {
          // horizontal slide
          const shift = (1 - p) * o.width;
          baseCtx.globalAlpha = 1;
          baseCtx.translate(-shift * 0.6, 0);
          baseCtx.fillStyle = "#000";
          baseCtx.fillRect(0, 0, o.width, o.height);
          baseCtx.drawImage(baseCanvas, 0, 0);
          baseCtx.restore();
          baseCtx.save();
          baseCtx.clearRect(0, 0, o.width, o.height);
          baseCtx.drawImage(blendCanvas, shift, 0);
          baseCtx.restore();
        } else if (win.type === "zoom") {
          baseCtx.globalAlpha = p;
          baseCtx.translate(o.width / 2, o.height / 2);
          baseCtx.scale(1 + (1 - p) * 0.16, 1 + (1 - p) * 0.16);
          baseCtx.translate(-o.width / 2, -o.height / 2);
          baseCtx.drawImage(blendCanvas, 0, 0);
          baseCtx.restore();
        } else {
          baseCtx.globalAlpha = p;
          baseCtx.drawImage(blendCanvas, 0, 0);
          baseCtx.restore();
        }
      }

      // global fade to black at the very end
      const remaining = timelineMs - t;
      if (remaining < 420) {
        baseCtx.save();
        baseCtx.fillStyle = `rgba(0,0,0,${1 - remaining / 420})`;
        baseCtx.fillRect(0, 0, o.width, o.height);
        baseCtx.restore();
      }

      const jpeg = await baseCanvas.encode("jpeg", 88);
      const ok = child.stdin.write(jpeg);
      if (!ok) {
        await new Promise<void>((resolve) => child.stdin.once("drain", () => resolve()));
      }
      if (o.onProgress && (f % Math.max(1, Math.round(fps / 3)) === 0 || f === totalFrames - 1)) {
        o.onProgress(f / totalFrames, f, totalFrames);
      }
    }
    child.stdin.end();
    await done;
  } catch (err) {
    killed = true;
    try {
      child.stdin.destroy();
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    // swallow the encoder's exit so only the original error propagates
    await done.catch(() => undefined);
    throw err;
  }
  return { timelineMs, frames: totalFrames, elapsedMs: Date.now() - started };
}

export async function muxAudio(videoPath: string, audioPath: string, outPath: string, opts: { loudnessTarget?: number } = {}) {
  const target = opts.loudnessTarget ?? -14;
  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-c:v",
    "copy",
    "-af",
    `loudnorm=I=${target}:TP=-1.5:LRA=11,aresample=48000`,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-shortest",
    "-movflags",
    "+faststart",
    "-y",
    outPath,
  ], { timeoutMs: 10 * 60 * 1000 });
}

export async function extractThumbnail(videoPath: string, outPath: string, atSeconds: number, width: number) {
  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    atSeconds.toFixed(2),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-vf",
    `scale=${width}:-2`,
    "-q:v",
    "4",
    "-y",
    outPath,
  ]);
}

export function sceneStaging(style: StyleProfileSpec, scenes: TimedScene[]): Record<string, StageCharacter[]> {
  const map: Record<string, StageCharacter[]> = {};
  for (const s of scenes) {
    map[s.id] = buildStaging(s, style, scenes);
  }
  return map;
}

function buildStaging(scene: TimedScene, style: StyleProfileSpec, all: TimedScene[]): StageCharacter[] {
  const chars: CharacterSpec[] = style.characters ?? [];
  const presentIds = scene.characters.length ? scene.characters : chars.slice(0, 2).map((c) => c.id);
  const cast = presentIds.map((id) => chars.find((c) => c.id === id)).filter((c): c is CharacterSpec => Boolean(c));
  const seed = hashString(`${scene.id}-${scene.mood}-${scene.purpose}-${scene.location}`);
  const rnd = mulberry32(seed);

  const actionByMood: Record<string, StageCharacter["action"]> = {
    takut: "scared",
    tegang: "talk",
    sedih: "cry",
    haru: "talk",
    marah: "point",
    kaget: "scared",
    misterius: "lookUp",
    dramatis: "talk",
    gelisah: "walk",
    khidmat: "pray",
    semangat: "point",
    hangat: "talk",
    tenang: "idle",
  };
  const baseAction: StageCharacter["action"] =
    scene.purpose === "cta"
      ? "point"
      : scene.purpose === "klimaks"
        ? rnd() > 0.4
          ? "scared"
          : "cry"
        : actionByMood[scene.mood] ?? "idle";

  const framing = pickFraming(scene, rnd);
  if (framing === "solo") {
    const hero = cast[0] ?? chars[0];
    if (!hero) return [];
    const soloAction = scene.purpose === "klimaks" ? "scared" : baseAction;
    const soloX = 340 + Math.round(rnd() * 60);
    const soloFacing: 1 | -1 = soloX >= 360 ? 1 : -1;
    return [
      {
        id: hero.id,
        x: soloX,
        xTo:
          soloAction === "walk" || soloAction === "run"
            ? clamp(soloX + soloFacing * (soloAction === "run" ? 150 : 115), 110, 610)
            : undefined,
        action: soloAction,
        facing: soloFacing,
        heldItem: "none",
        scale: 1.28,
        enterDelayMs: 0,
      },
    ];
  }

  const n = Math.max(1, Math.min(3, framing === "duo" ? Math.min(2, cast.length) : cast.length));
  const chosen = cast.slice(0, n);
  const baseX = 360;
  // A walker must not stroll through a neighbour: aim it at the open side.
  const groupCentre = baseX;
  // Silhouettes (hijab, shoulders, an extended arm) run ~150-180 px wide at
  // this scale, so the gap has to clear that or the cast merges into one blob.
  // Two characters sit 210 px apart, three sit 165 px apart inside the safe
  // area so nobody gets clipped by the frame edge.
  const spread = n >= 3 ? 165 : n === 2 ? 210 : 0;
  const centered = (i: number) => baseX + (i - (n - 1) / 2) * spread;
  return chosen.map((c, i) => {
    let action = baseAction;
    if (c.age === "anak" && action === "scared") action = "cry";
    if (i > 0 && action === "point") action = "idle";
    const isChild = c.age === "anak";
    // jitter is deliberately small: silhouettes (hijab, shoulders, extended
    // arms) are ~150 px wide, so larger random offsets made characters overlap.
    const jitter = Math.round((rnd() - 0.5) * 12);
    const depth = framing === "crowd" && i === 2 ? 0.88 : 1;
    const x = clamp(centered(i) + jitter, 120, 600);
    // standing characters face each other; walkers head for the open edge so
    // they never stroll through a neighbour, and always face where they walk
    const outward: 1 | -1 = x >= groupCentre ? 1 : -1;
    const inward: 1 | -1 = x <= groupCentre ? 1 : -1;
    const locomotion = action === "walk" || action === "run";
    const travel = action === "run" ? 150 : 115;
    const roomOut = outward > 0 ? 610 - x : x - 110;
    const walkDir: 1 | -1 = roomOut >= 60 ? outward : inward === outward ? outward : (-outward as 1 | -1);
    const facing: 1 | -1 = locomotion ? walkDir : inward;
    // every gait needs a destination: a walk played in place is exactly the
    // foot-skating this rewrite is meant to remove
    const roomAhead = walkDir > 0 ? 610 - x : x - 110;
    const xTo = locomotion ? clamp(x + walkDir * Math.min(travel, roomAhead), 110, 610) : undefined;
    return {
      id: c.id,
      x,
      xTo,
      action,
      facing,
      heldItem: "none",
      scale: (isChild ? 0.92 : 1) * depth,
      enterDelayMs: i * 120,
    };
  });
}

function pickFraming(scene: TimedScene, rnd: () => number): "solo" | "duo" | "crowd" {
  if (scene.purpose === "klimaks") return "solo";
  if (scene.purpose === "hook") return rnd() > 0.5 ? "duo" : "solo";
  if (scene.purpose === "cta") return "duo";
  const r = rnd();
  return r > 0.66 ? "crowd" : r > 0.3 ? "duo" : "solo";
}

export { hudClockFor };
export type { TimedScene, Scene };
