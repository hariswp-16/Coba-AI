import { createCanvas, type Canvas, type Image } from "@napi-rs/canvas";
import type { CharacterSpec, HudStyle, SceneWord, StyleProfileSpec, SubtitleStyle, PaletteSpec } from "../types";
import { Ctx, Rect, clamp, easeOutCubic, hashString, mulberry32, rgba, shade, smoothstep } from "./geometry";
import { drawCharacter, type CharacterAnchors, type Pose } from "./character";
import { ACTIONS, Action, mouthForMood } from "./poses";
import { CharacterMotion } from "./motion";
import { getEnvironment, resolveLocation, type EnvironmentDef, type LocationKey } from "./environments";
import { drawAtmosphere } from "./atmosphere";
import { applyCamera, cameraAt, type CameraMove } from "./camera";
import { drawHud, drawChoicePills, hudClockFor, type HudData } from "./hud";
import { drawSubtitle } from "./subtitle";
import { applyGrade, radialGlow } from "./geometry";

export interface StageCharacter {
  id: string;
  x: number;
  xTo?: number;
  action: Action;
  facing: 1 | -1;
  heldItem?: "botol" | "ponsel" | "tas" | "senter" | "payung" | "none";
  scale?: number;
  enterDelayMs?: number;
  exitAtMs?: number;
}

export interface SceneRenderSpec {
  index: number;
  width: number;
  height: number;
  durationMs: number;
  location: string;
  timeOfDay: "pagi" | "siang" | "sore" | "malam";
  weather?: string;
  camera: CameraMove;
  mood: string;
  characters: CharacterSpec[];
  staging: StageCharacter[];
  palette: PaletteSpec;
  style: StyleProfileSpec;
  subtitleStyle: SubtitleStyle;
  hudStyle: HudStyle;
  hudData: HudData;
  words: SceneWord[];
  seedKey: string;
  showHud: boolean;
  purpose: string;
  ctaPills?: string[];
  ctaQuestion?: string;
  headline?: string;
  /** AI generated still used instead of the procedural environment */
  image?: Image | null;
  imageFit?: "cover" | "contain";
  applyGrade?: boolean;
  subtitleOpacity?: number;
  /** Static preview frames render subtitles fully opaque (no crossfade). */
  subtitleNoFade?: boolean;
  showSubtitles?: boolean;
}

interface Prepared {
  bg: Canvas;
  env: EnvironmentDef;
  seed: number;
  lights: { x: number; y: number; r: number; color: string; intensity: number }[];
}

const prepCache = new Map<string, Prepared>();
const MAX_CACHE = 8;

function prepare(spec: SceneRenderSpec): Prepared {
  // Backgrounds are rasterised at the exact output size, so the cache key must
  // include the resolution: a 540px preview must never reuse a 720px plate.
  const cacheKey = `${spec.seedKey}|${spec.width}x${spec.height}`;
  if (prepCache.has(cacheKey)) {
    const hit = prepCache.get(cacheKey)!;
    prepCache.delete(cacheKey);
    prepCache.set(cacheKey, hit);
    return hit;
  }
  const seed = hashString(spec.seedKey);
  const env = getEnvironment(resolveLocation(spec.location, spec.timeOfDay));
  const bg = createCanvas(spec.width, spec.height);
  const bctx = bg.getContext("2d") as unknown as Ctx;
  const ectx = {
    ctx: bctx,
    w: spec.width,
    h: spec.height,
    t: 0,
    palette: spec.palette,
    style: spec.style,
    seed,
    weather: spec.weather,
    timeOfDay: spec.timeOfDay,
  };
  bctx.save();
  bctx.scale(spec.width / 720, spec.width / 720);
  env.drawStatic(ectx);
  bctx.restore();
  const lights = env.lights(ectx);
  const prepared: Prepared = { bg, env, seed, lights };
  prepCache.set(cacheKey, prepared);
  if (prepCache.size > MAX_CACHE) {
    const first = prepCache.keys().next().value;
    if (first) prepCache.delete(first);
  }
  return prepared;
}

export function clearSceneCache() {
  prepCache.clear();
}

export interface FrameResult {
  headRects: Rect[];
  subtitleActive: boolean;
}

/** Renders a complete frame (background, characters, atmosphere, subtitle, HUD) into ctx. */
export function renderSceneFrame(ctx: Ctx, spec: SceneRenderSpec, tMs: number): FrameResult {
  const { width: w, height: h } = spec;
  const p = clamp(tMs / Math.max(1, spec.durationMs), 0, 1);
  const seed = hashString(spec.seedKey);
  const prepared = prepare(spec);
  const env = prepared.env;
  const ectx = {
    ctx,
    w,
    h,
    t: tMs / 1000,
    palette: spec.palette,
    style: spec.style,
    seed: prepared.seed,
    weather: spec.weather,
    timeOfDay: spec.timeOfDay,
  };

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  const cam = cameraAt(spec.camera, p, { seed: prepared.seed, width: w, height: h, intensity: 0.9 });

  // ---------- background ----------
  if (spec.image) {
    drawImageBackdrop(ctx, spec.image, cam, w, h);
  } else {
    applyCamera(ctx as unknown as Parameters<typeof applyCamera>[0], cam, w, h, 0.55);
    // prepared.bg is already rasterised at w×h, so it must be blitted 1:1.
    // (Scaling it again by w/720 cropped the plate on every non-720 render.)
    ctx.drawImage(prepared.bg, 0, 0, w, h);
    ctx.restore();
    // dynamic environment layer under characters
    applyCamera(ctx as unknown as Parameters<typeof applyCamera>[0], cam, w, h, 1);
    ctx.scale(w / 720, w / 720);
    env.drawDynamic?.(ectx);
    ctx.restore();
  }

  // ---------- character / fx layer ----------
  const headRects: Rect[] = [];
  let anchors: CharacterAnchors[] = [];
  if (!spec.image) {
    applyCamera(ctx as unknown as Parameters<typeof applyCamera>[0], cam, w, h, 1);
    ctx.scale(w / 720, w / 720);
    const groundY = env.groundY;
    anchors = drawCast(ctx, spec, tMs, groundY, prepared.seed);

    // light sources
    for (const l of prepared.lights) {
      const flicker = 0.92 + Math.sin(tMs / 180 + l.x) * 0.05;
      radialGlow(ctx, l.x, l.y, l.r * flicker, l.color, l.intensity * 0.55);
    }
    const indoor = /rumah|kamar|sekolah|masjid|teras/.test(env.key);
    drawAtmosphere(ctx, {
      weather: indoor ? (env.key === "teras_hujan" ? spec.weather : undefined) : spec.weather,
      timeOfDay: spec.timeOfDay,
      t: tMs / 1000,
      seed: prepared.seed,
      width: w,
      height: h,
    });
    env.drawForeground?.(ectx);
    ctx.restore();

    // anchors come back in 720-wide scene units (that is how drawCast was
    // scaled); the subtitle pass works in output pixels, so convert here or a
    // 1080p render computes its face-clearance against the wrong rectangle
    const anchorScale = w / 720;
    for (const a of anchors) {
      headRects.push({
        x: (a.head.x - a.head.r * 0.95) * anchorScale,
        y: (a.head.y - a.head.r) * anchorScale,
        w: a.head.r * 1.9 * anchorScale,
        h: a.head.r * 2 * anchorScale,
      });
    }
  } else {
    // atmosphere over AI stills so scenes still feel alive
    applyCamera(ctx as unknown as Parameters<typeof applyCamera>[0], cam, w, h, 1);
    ctx.scale(w / 720, w / 720);
    drawAtmosphere(ctx, {
      weather: spec.weather,
      timeOfDay: spec.timeOfDay,
      t: tMs / 1000,
      seed: prepared.seed,
      width: w,
      height: h,
    });
    // subtle breathing zoom of light
    radialGlow(ctx, w * 0.62, h * 0.16, w * 0.7, "#ffcf9a", 0.12 + Math.sin(tMs / 900) * 0.02);
    ctx.restore();
  }

  // ---------- opening fade ----------
  const fadeIn = 240;
  if (spec.index === 0 && tMs < fadeIn) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${1 - smoothstep(tMs / fadeIn)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ---------- grade ----------
  ctx.save();
  const nightFactor = spec.timeOfDay === "malam" ? 0.1 : 0.04;
  applyGrade(ctx, w, h, {
    vignette: spec.style.lighting.vignette,
    grain: spec.style.lighting.grain,
    warm: spec.timeOfDay === "malam" ? nightFactor * 2.4 : spec.timeOfDay === "sore" ? 0.07 : 0.01,
    seed: Math.floor(tMs / 33),
  });
  ctx.restore();

  // ---------- overlay text ----------
  const scale = w / 720;
  let subtitleActive = false;
  // CTA pills occupy the lower third: hide subtitles as soon as the pills start
  // animating in so text never collides with the cards.
  const ctaVisible = spec.purpose === "cta" && Boolean(spec.ctaPills?.length) && tMs > 650;
  if (spec.showSubtitles !== false && !ctaVisible) {
    const res = drawSubtitle(ctx, spec.words, spec.subtitleStyle, {
      width: w,
      height: h,
      tMs,
      avoidRects: headRects.map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h })),
      opacity: spec.subtitleOpacity ?? 1,
      noFade: spec.subtitleNoFade,
    });
    subtitleActive = res.active;
  }

  if (spec.showHud) {
    const hudFade = clamp(Math.min(tMs / 500, (spec.durationMs - tMs) / 600), 0, 1);
    // top scrim keeps the label/clock readable over bright skies and pale walls
    const scrim = ctx.createLinearGradient(0, 0, 0, h * 0.34);
    scrim.addColorStop(0, `rgba(6,6,10,${0.62 * hudFade})`);
    scrim.addColorStop(0.55, `rgba(6,6,10,${0.34 * hudFade})`);
    scrim.addColorStop(1, "rgba(6,6,10,0)");
    ctx.save();
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h * 0.34);
    ctx.restore();
    drawHud(ctx, spec.hudStyle, spec.hudData, { width: w, height: h, opacity: hudFade, scale });
  }

  if (spec.purpose === "cta" && spec.ctaPills?.length) {
    const pillIn = clamp((tMs - 700) / 500, 0, 1);
    if (pillIn > 0.01) {
      // darken the lower third so the choice cards stay legible on any plate
      const scrim = ctx.createLinearGradient(0, h * 0.42, 0, h);
      scrim.addColorStop(0, "rgba(6,6,10,0)");
      scrim.addColorStop(0.45, `rgba(6,6,10,${0.5 * pillIn})`);
      scrim.addColorStop(1, `rgba(6,6,10,${0.8 * pillIn})`);
      ctx.save();
      ctx.fillStyle = scrim;
      ctx.fillRect(0, h * 0.42, w, h * 0.58);
      ctx.restore();
    }
    drawChoicePills(ctx, spec.ctaPills, {
      width: w,
      height: h,
      // sit the CTA cards in the lower third, below the speaker's chin
      y: h * clamp(spec.subtitleStyle.positionY + 0.12, 0.72, 0.9),
      opacity: pillIn,
      question: spec.ctaQuestion,
    });
  }

  if (spec.headline) {
    drawHeadline(ctx, spec.headline, w, h, clamp((tMs - 200) / 400, 0, 1));
  }

  return { headRects, subtitleActive };
}

function drawHeadline(ctx: Ctx, text: string, w: number, h: number, alpha: number) {
  const s = w / 720;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.font = `400 ${Math.round(54 * s)}px Anton`;
  ctx.fillStyle = "#f7f3e8";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 18 * s;
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > w - 110 * s && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  const y0 = h * 0.3;
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, w / 2, y0 + i * 64 * s));
  ctx.restore();
}

function drawImageBackdrop(ctx: Ctx, image: Image, cam: { x: number; y: number; scale: number; rotation: number }, w: number, h: number) {
  const imgW = image.width || w;
  const imgH = image.height || h;
  const scaleCover = Math.max(w / imgW, h / imgH);
  // A slow "breathing" zoom on a still image reads as a rendering fault, so the
  // only motion here is the camera move itself.
  const zoom = 1.06 + (cam.scale - 1) * 0.9;
  const drawW = imgW * scaleCover * zoom;
  const drawH = imgH * scaleCover * zoom;
  ctx.save();
  ctx.translate(w / 2 + cam.x * 0.8, h / 2 + cam.y * 0.8);
  if (cam.rotation) ctx.rotate(cam.rotation * 0.8);
  ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
  // cinematic falloff so subtitles read well
  const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.55, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.45, w, h * 0.55);
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.35);
  top.addColorStop(0, "rgba(0,0,0,0.32)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.35);
  ctx.restore();
}

const motionRegistry = new Map<string, CharacterMotion>();

/** Clears per-character animation state (called before each full render). */
export function resetMotionState() {
  motionRegistry.clear();
}

interface CastTrack {
  x: number;
  speed: number;
  /** 0..1 progress along the walk path */
  move: number;
}

/**
 * Position of a staged character at a given time.
 *
 * Walk/run travel uses a smoothstep ramp so the body accelerates and settles
 * instead of teleporting between frames, and the reported speed is the exact
 * derivative of that ramp so the gait cadence can lock onto it.
 */
function castTrack(st: StageCharacter, spec: SceneRenderSpec, tMs: number): CastTrack {
  const start = st.enterDelayMs ?? 0;
  const locomotion = st.action === "walk" || st.action === "run";
  if (st.xTo === undefined || !locomotion) {
    return { x: st.x, speed: 0, move: 0 };
  }
  const dist = st.xTo - st.x;
  const nominal = (st.action === "run" ? 0.62 : 0.27) * (spec.height / 1280) * 560;
  const durMs = clamp((Math.abs(dist) / Math.max(40, nominal)) * 1000, 550, Math.max(700, spec.durationMs * 0.82));
  const p = clamp((tMs - start) / durMs, 0, 1);
  const eased = smoothstep(p);
  // |d/dt smoothstep(p)| = 6p(1-p) / dur
  const speed = (Math.abs(dist) * 6 * p * (1 - p)) / (durMs / 1000);
  return { x: st.x + dist * eased, speed, move: p };
}

/** True while the current scene's narration is actually being spoken. */
function isSpeakingAt(spec: SceneRenderSpec, tMs: number): boolean {
  if (!spec.words?.length) return false;
  for (const w of spec.words) {
    if (tMs >= w.startMs - 40 && tMs <= w.endMs + 60) return true;
  }
  return false;
}

function drawCast(ctx: Ctx, spec: SceneRenderSpec, tMs: number, groundY: number, seed: number): CharacterAnchors[] {
  const anchors: CharacterAnchors[] = [];
  const baseHeight = 560 * (spec.height / 1280);
  const cast = spec.staging.length ? spec.staging : autoStage(spec);
  // Only the character carrying the line moves its mouth. Having the whole
  // cast flap at once read as a glitch, not a conversation.
  const speakerId = cast.length ? cast[0].id : "";
  const speaking = isSpeakingAt(spec, tMs);
  const moodMouth = mouthForMood(spec.mood);
  const frameMs = 1000 / 30;

  for (const st of cast) {
    const spec2 = spec.characters.find((c) => c.id === st.id) ?? spec.characters[0];
    if (!spec2) continue;
    const isChild = spec2.age === "anak" || spec2.gender === "anak";
    const h = baseHeight * (isChild ? 0.68 : 1) * (st.scale ?? 1) * (spec2.heightScale || 1);

    // ---- entrance: a short rise + fade beats characters popping into frame
    const enterStart = st.enterDelayMs ?? 0;
    const enter = clamp((tMs - enterStart) / 260, 0, 1);
    if (enter <= 0) continue;
    const enterEase = easeOutCubic(enter);

    const track = castTrack(st, spec, tMs);
    const key = `${spec.seedKey}|${st.id}`;
    let motion = motionRegistry.get(key);
    if (!motion) {
      motion = new CharacterMotion(hashString(st.id + spec.seedKey));
      motionRegistry.set(key, motion);
    }

    const at = Math.max(0, (tMs - enterStart) / 1000);
    const dt = (tMs - Math.max(enterStart, motion.lastT)) / 1000;

    // A preview can ask for an arbitrary timestamp. Fast-forward the springs
    // from the scene start so a still matches the video frame exactly instead
    // of snapping to a fresh rig.
    if (motion.lastT < 0 || tMs < motion.lastT - 1 || tMs - motion.lastT > 400) {
      motion.reset();
      for (let wt = enterStart; wt < tMs; wt += frameMs) {
        const tr = castTrack(st, spec, wt);
        motion.update({
          action: st.action,
          t: Math.max(0, (wt - enterStart) / 1000),
          dtMs: frameMs,
          speedPx: tr.speed,
          heightPx: h,
          speaking: speaking && st.id === speakerId,
          mouth: moodMouth,
        });
      }
    }

    const pose = motion.update({
      action: st.action,
      t: at,
      dtMs: Math.min(frameMs * 2, Math.max(0, dt * 1000)),
      speedPx: track.speed,
      heightPx: h,
      speaking: speaking && st.id === speakerId,
      mouth: moodMouth,
    });

    ctx.save();
    ctx.globalAlpha = enterEase;
    anchors.push(
      drawCharacter(ctx, spec2, {
        x: track.x,
        groundY: groundY + (1 - enterEase) * h * 0.03,
        heightPx: h,
        facing: st.facing,
        pose,
        heldItem: st.heldItem ?? "none",
        rimLight: { color: spec.palette.lampWarm, strength: spec.timeOfDay === "malam" ? 0.5 : 0.18 },
        shadowAlpha: 0.34 * enterEase,
        detail: 1,
      })
    );
    ctx.restore();
  }
  void seed;
  return anchors;
}

export function autoStage(spec: SceneRenderSpec): StageCharacter[] {
  const chars = spec.characters;
  if (!chars.length) return [];
  const purpose = spec.purpose;
  const mood = spec.mood;
  const seed = hashString(spec.seedKey);
  const rnd = mulberry32(seed);

  const pick = (): Action => {
    if (purpose === "klimaks") return mood === "takut" ? "scared" : rnd() > 0.5 ? "scared" : "cry";
    if (purpose === "cta") return "point";
    if (purpose === "hook") return rnd() > 0.5 ? "lookUp" : "idle";
    if (purpose === "konflik") return rnd() > 0.45 ? "talk" : "point";
    if (purpose === "resolusi") return rnd() > 0.5 ? "talk" : "idle";
    return rnd() > 0.7 ? "walk" : "idle";
  };

  const withWalkTarget = (entry: StageCharacter, dir: 1 | -1): StageCharacter => {
    if (entry.action !== "walk" && entry.action !== "run") return entry;
    const dist = entry.action === "run" ? 150 : 110;
    return { ...entry, xTo: clamp(entry.x + dir * dist, 120, 600) };
  };

  if (chars.length === 1) {
    const facing: 1 | -1 = rnd() > 0.5 ? 1 : -1;
    return [
      withWalkTarget(
        {
          id: chars[0].id,
          x: 360 + (rnd() - 0.5) * 80,
          action: pick(),
          facing,
          heldItem: "none",
        },
        facing
      ),
    ];
  }
  const n = Math.min(3, chars.length);
  const spread = n === 2 ? 190 : 150;
  return chars.slice(0, n).map((c, i) => {
    const facing: 1 | -1 = i < (n - 1) / 2 ? 1 : -1;
    return withWalkTarget(
      {
        id: c.id,
        x: 360 + (i - (n - 1) / 2) * spread * 2 * 0.5 + (rnd() - 0.5) * 30,
        action: pick(),
        facing,
        heldItem: "none",
      },
      facing
    );
  });
}

export function stagingFromScene(params: {
  characters: CharacterSpec[];
  location: string;
  timeOfDay: string;
  mood: string;
  purpose: string;
  seedKey: string;
  durationMs: number;
}): StageCharacter[] {
  const env = getEnvironment(resolveLocation(params.location, params.timeOfDay));
  const pseudo: SceneRenderSpec = {
    ...(params as unknown as SceneRenderSpec),
    index: 0,
    width: 720,
    height: 1280,
    staging: [],
  } as SceneRenderSpec;
  const staged = autoStage(pseudo);
  void env;
  return staged;
}

export { ACTIONS };
export type { Action };
