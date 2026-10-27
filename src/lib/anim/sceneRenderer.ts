import { createCanvas, type Canvas, type Image } from "@napi-rs/canvas";
import type { CharacterSpec, HudStyle, SceneWord, StyleProfileSpec, SubtitleStyle, PaletteSpec } from "../types";
import { Ctx, Rect, clamp, hashString, mulberry32, rgba, shade, smoothstep } from "./geometry";
import { drawCharacter, type CharacterAnchors, type Pose } from "./character";
import { ACTIONS, Action, makePose, mouthForMood } from "./poses";
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
    drawImageBackdrop(ctx, spec.image, cam, w, h, tMs);
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

    for (const a of anchors) {
      headRects.push({ x: a.head.x - a.head.r * 0.95, y: a.head.y - a.head.r, w: a.head.r * 1.9, h: a.head.r * 2 });
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

  // ---------- opening flash / fade ----------
  ctx.save();
  const fadeIn = 220;
  const fadeOut = 180;
  if (spec.index === 0 && tMs < fadeIn) {
    ctx.fillStyle = `rgba(0,0,0,${1 - tMs / fadeIn})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (tMs > spec.durationMs - fadeOut) {
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // ---------- grade ----------
  ctx.save();
  const nightFactor = spec.timeOfDay === "malam" ? 0.1 : 0.04;
  applyGrade(ctx, w, h, {
    vignette: spec.style.lighting.vignette,
    grain: spec.style.lighting.grain,
    warm: spec.timeOfDay === "malam" ? nightFactor * 2.4 : spec.timeOfDay === "sore" ? 0.07 : 0.01,
    seed: Math.floor(tMs / 60),
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

function drawImageBackdrop(ctx: Ctx, image: Image, cam: { x: number; y: number; scale: number; rotation: number }, w: number, h: number, tMs: number) {
  const imgW = image.width || w;
  const imgH = image.height || h;
  const scaleCover = Math.max(w / imgW, h / imgH);
  const zoom = 1.05 + (cam.scale - 1) * 0.9 + Math.sin(tMs / 5200) * 0.008;
  const drawW = imgW * scaleCover * zoom;
  const drawH = imgH * scaleCover * zoom;
  const dx = (w - drawW) / 2 + cam.x * 0.8;
  const dy = (h - drawH) / 2 + cam.y * 0.8;
  ctx.save();
  ctx.drawImage(image, dx, dy, drawW, drawH);
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

function drawCast(ctx: Ctx, spec: SceneRenderSpec, tMs: number, groundY: number, seed: number): CharacterAnchors[] {
  const anchors: CharacterAnchors[] = [];
  const p = clamp(tMs / Math.max(1, spec.durationMs), 0, 1);
  const baseHeight = 560 * (spec.height / 1280);
  const cast = spec.staging.length ? spec.staging : autoStage(spec);
  const speaking = false;

  for (const st of cast) {
    const spec2 = spec.characters.find((c) => c.id === st.id) ?? spec.characters[0];
    if (!spec2) continue;
    const isChild = spec2.age === "anak" || spec2.gender === "anak";
    const h = baseHeight * (isChild ? 0.68 : 1) * (st.scale ?? 1) * (spec2.heightScale || 1);
    let x = st.x;
    if (st.xTo !== undefined) {
      const moveStart = st.enterDelayMs ?? 0;
      const moveP = clamp((tMs - moveStart) / Math.max(600, spec.durationMs - moveStart), 0, 1);
      x = st.x + (st.xTo - st.x) * moveP;
    } else if (st.action === "walk" || st.action === "run") {
      const stride = st.action === "run" ? 220 : 90;
      x = st.x + Math.sin(p * Math.PI * 1.2) * stride * 0.35;
    }
    const local = Math.max(0, (tMs - (st.enterDelayMs ?? 0)) / 1000);
    const pose = makePose(st.action, local, {
      seed: hashString(st.id + spec.seedKey),
      mouth: mouthForMood(spec.mood),
      speaking,
    });
    anchors.push(
      drawCharacter(
        ctx,
        spec2,
        {
          x,
          groundY,
          heightPx: h,
          facing: st.facing,
          pose,
          heldItem: st.heldItem ?? "none",
          rimLight: { color: spec.palette.lampWarm, strength: spec.timeOfDay === "malam" ? 0.5 : 0.18 },
          shadowAlpha: 0.34,
          detail: 1,
        }
      )
    );
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

  if (chars.length === 1) {
    return [
      {
        id: chars[0].id,
        x: 360 + (rnd() - 0.5) * 80,
        action: pick(),
        facing: rnd() > 0.5 ? 1 : -1,
        heldItem: "none",
      },
    ];
  }
  const n = Math.min(3, chars.length);
  const spread = n === 2 ? 190 : 150;
  return chars.slice(0, n).map((c, i) => ({
    id: c.id,
    x: 360 + (i - (n - 1) / 2) * spread * 2 * 0.5 + (rnd() - 0.5) * 30,
    action: pick(),
    facing: (i < (n - 1) / 2 ? 1 : -1) as 1 | -1,
    heldItem: "none",
  }));
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
