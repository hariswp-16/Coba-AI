import { Ctx, applyGrade, clamp, easeOutCubic, hashString, mulberry32, roundRect } from "../geometry";
import type { SceneRenderSpec } from "../sceneRenderer";
import { gfxTheme, alpha, mix } from "./theme";
import { drawMotif, resolveMotif, isWet } from "./motifs";
import { drawCaption, drawCta, drawFooter, drawHeader } from "./type";

const STEP_BY_PURPOSE: Record<string, number> = {
  hook: 0,
  setup: 1,
  konflik: 2,
  klimaks: 3,
  resolusi: 4,
  cta: 5,
};

export interface GfxResult {
  subtitleActive: boolean;
}

/**
 * Motion-graphics frame: flat vector illustration, kinetic typography and
 * shape-led chrome instead of the illustrated character stage. Everything is
 * procedural, so a full video costs no API credits and renders identically
 * every time.
 */

/**
 * Full-bleed variant of the motion-graphics frame: the illustration fills the
 * whole canvas, type sits on top with scrims behind it, and an optional big
 * number callout carries the data point of the beat (reference-style
 * infographic explainer). No card, no paper margin.
 */
function renderFullFrame(ctx: Ctx, spec: SceneRenderSpec, tMs: number): GfxResult {
  const w = spec.width;
  const h = spec.height;
  const s = w / 720;
  const t = tMs / 1000;
  const total = Math.max(1, spec.durationMs);
  const p = clamp(tMs / total, 0, 1);
  const base = gfxTheme(spec.palette, spec.timeOfDay);
  const seed = hashString(spec.seedKey);
  const margin = 48 * s;

  // type always sits on top of art: white ink + accent keyword, like the reel
  const ink = "#FFFFFF";
  const theme = {
    ...base,
    mode: "dark" as const,
    ink,
    mute: "rgba(255,255,255,0.78)",
    onAccent: "#0B0F14",
  };

  const isCta = spec.purpose === "cta" && Boolean(spec.ctaPills?.length);
  const motif =
    (spec.gfxMotif as ReturnType<typeof resolveMotif>) ??
    resolveMotif({ location: spec.location, timeOfDay: spec.timeOfDay, weather: spec.weather, purpose: spec.purpose, seed });

  const enter = easeOutCubic(clamp(tMs / 700, 0, 1));
  // slow push so a static illustration still breathes
  const zoom = 1.02 + 0.06 * easeOutCubic(p) + (1 - enter) * 0.02;
  // The illustrations are authored for a ~0.9 aspect card. On a 9:16 canvas we
  // compose them in that aspect and crop the sides, instead of stretching every
  // hill and triangle to twice the height.
  const boxW = Math.max(w, Math.min(h * 0.92, w * 1.3));
  const boxX = (w - boxW) / 2;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);
  drawMotif(ctx, motif, {
    x: boxX,
    y: 0,
    w: boxW,
    h,
    t,
    p,
    seed,
    theme: base,
    weather: spec.weather,
    timeOfDay: spec.timeOfDay,
  });
  ctx.restore();

  // scrims: top for the chip, bottom for the caption
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.26);
  top.addColorStop(0, alpha("#000000", 0.42));
  top.addColorStop(1, alpha("#000000", 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.26);

  const bottom = ctx.createLinearGradient(0, h * 0.52, 0, h);
  bottom.addColorStop(0, alpha("#000000", 0));
  bottom.addColorStop(0.5, alpha("#000000", 0.4));
  bottom.addColorStop(1, alpha("#000000", 0.84));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.52, w, h * 0.48);

  // corners: soft vignette
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
  vig.addColorStop(0, alpha("#000000", 0));
  vig.addColorStop(1, alpha("#000000", 0.34));
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // ---------- header: chip + counter ----------
  const label = (spec.hudData?.label || "SAINS HARIAN").toUpperCase();
  ctx.save();
  ctx.globalAlpha = enter;
  ctx.font = `600 ${Math.round(13 * s)}px Poppins`;
  ctx.letterSpacing = `${2.2 * s}px`;
  const labelW = ctx.measureText(label).width;
  ctx.letterSpacing = "0px";
  const chipH = 30 * s;
  const chipW = labelW + 40 * s;
  ctx.fillStyle = alpha("#000000", 0.34);
  roundRect(ctx, margin, 44 * s, chipW, chipH, chipH / 2);
  ctx.fill();
  ctx.strokeStyle = alpha("#FFFFFF", 0.28);
  ctx.lineWidth = Math.max(1, 1.2 * s);
  roundRect(ctx, margin, 44 * s, chipW, chipH, chipH / 2);
  ctx.stroke();
  ctx.fillStyle = alpha(theme.accent, 0.95);
  ctx.beginPath();
  ctx.arc(margin + 15 * s, 44 * s + chipH / 2, 3.4 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.globalAlpha = enter * 0.92;
  ctx.font = `600 ${Math.round(13 * s)}px Poppins`;
  ctx.letterSpacing = `${2.2 * s}px`;
  ctx.fillText(label, margin + 25 * s, 44 * s + chipH / 2 + 4.6 * s);
  ctx.letterSpacing = "0px";

  // episode counter, top right
  const sceneCount = Math.max(spec.sceneCount ?? 4, spec.index + 1);
  const cur = String(spec.index + 1).padStart(2, "0");
  const tot = String(sceneCount).padStart(2, "0");
  ctx.textAlign = "right";
  ctx.font = `700 ${Math.round(30 * s)}px Anton`;
  ctx.fillStyle = alpha(ink, 0.92);
  ctx.fillText(cur, w - margin, 44 * s + 34 * s);
  const curW = ctx.measureText(cur).width;
  ctx.font = `600 ${Math.round(12 * s)}px Poppins`;
  ctx.fillStyle = alpha(ink, 0.55);
  ctx.fillText(`/ ${tot}`, w - margin, 44 * s + 56 * s);
  ctx.textAlign = "left";
  ctx.restore();

  // progress rail under the chip
  ctx.save();
  ctx.globalAlpha = enter * 0.5;
  ctx.fillStyle = alpha("#FFFFFF", 0.35);
  ctx.fillRect(margin, 86 * s, w - margin * 2, 2 * s);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(margin, 86 * s, (w - margin * 2) * clamp((spec.index + p) / sceneCount, 0, 1), 2 * s);
  ctx.restore();

  // ---------- stat callout ----------
  if (spec.stat?.value) {
    const enterAt = clamp((tMs - 380) / 520, 0, 1);
    const e = easeOutCubic(enterAt);
    if (e > 0.01) {
      const valueSize = Math.round(112 * s);
      const pool = ctx.createRadialGradient(w / 2, h * 0.26, 10 * s, w / 2, h * 0.26, h * 0.19);
      pool.addColorStop(0, alpha("#000000", 0.34 * e));
      pool.addColorStop(1, alpha("#000000", 0));
      ctx.fillStyle = pool;
      ctx.fillRect(0, h * 0.06, w, h * 0.4);
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate(w / 2, h * 0.26 + (1 - e) * 26 * s);
      ctx.scale(0.94 + 0.06 * e, 0.94 + 0.06 * e);
      ctx.textAlign = "center";
      ctx.font = `400 ${valueSize}px Anton`;
      ctx.letterSpacing = `${1 * s}px`;
      ctx.shadowColor = alpha("#000000", 0.5);
      ctx.shadowBlur = valueSize * 0.3;
      ctx.shadowOffsetY = valueSize * 0.06;
      ctx.fillStyle = theme.accent;
      ctx.fillText(spec.stat.value.toUpperCase(), 0, 0);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const labelText = spec.stat.label.toUpperCase();
      ctx.font = `700 ${Math.round(20 * s)}px Poppins`;
      ctx.letterSpacing = `${4 * s}px`;
      ctx.fillStyle = alpha(ink, 0.92);
      ctx.shadowColor = alpha("#000000", 0.5);
      ctx.shadowBlur = 18 * s;
      ctx.fillText(labelText, 0, 32 * s);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.letterSpacing = "0px";
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  // ---------- caption / cta ----------
  let subtitleActive = false;
  const captionTop = isCta ? h * 0.66 : h * (spec.subtitleStyle?.positionY ?? 0.76);
  if (isCta) {
    drawCta(ctx, {
      width: w,
      height: h,
      tMs,
      question: spec.ctaQuestion,
      pills: spec.ctaPills ?? [],
      theme: { ...theme, surface: alpha("#000000", 0.35) },
      top: captionTop,
    });
  } else if (spec.showSubtitles !== false && spec.words?.length) {
    drawCaption(ctx, {
      words: spec.words,
      tMs,
      width: w,
      top: captionTop,
      style: { ...spec.subtitleStyle, fill: ink, emphasisColor: theme.accent, uppercase: false },
      theme,
      noFade: spec.subtitleNoFade,
    });
    subtitleActive = spec.words.some((word) => tMs >= word.startMs - 90 && tMs <= word.endMs + 240);
  }

  // ---------- footer: timecode + dots ----------
  ctx.save();
  ctx.globalAlpha = clamp((tMs - 320) / 500, 0, 1) * 0.55;
  const fmt = (ms: number) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };
  ctx.font = `500 ${Math.round(12 * s)}px Poppins`;
  ctx.fillStyle = ink;
  ctx.fillText(`${fmt(tMs)} / ${fmt(total)}`, margin, h - 34 * s);
  ctx.textAlign = "right";
  ctx.fillText(`EPISODE ${spec.hudData?.episode?.replace(/[^\d]/g, "") || 1}`, w - margin, h - 34 * s);
  ctx.textAlign = "left";
  ctx.restore();

  applyGrade(ctx, w, h, { vignette: 0, grain: 0.22, warm: 0, seed: Math.floor(tMs / 33) });

  if (spec.index === 0 && tMs < 260) {
    ctx.save();
    ctx.fillStyle = alpha("#000000", 1 - easeOutCubic(clamp(tMs / 260, 0, 1)));
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  void mix;
  void mulberry32;
  return { subtitleActive };
}

export function renderGfxFrame(ctx: Ctx, spec: SceneRenderSpec, tMs: number): GfxResult {
  if (spec.style.graphics?.layout === "full") return renderFullFrame(ctx, spec, tMs);
  const w = spec.width;
  const h = spec.height;
  const s = w / 720;
  const t = tMs / 1000;
  const total = Math.max(1, spec.durationMs);
  const p = clamp(tMs / total, 0, 1);
  const theme = gfxTheme(spec.palette, spec.timeOfDay);
  const seed = hashString(spec.seedKey);
  const margin = 56 * s;

  // ---------- base surface ----------
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, w, h);

  // drifting colour fields: two soft blobs on a slow, non-repeating path
  const blob = (cx: number, cy: number, r: number, color: string, a: number) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, alpha(color, a));
    g.addColorStop(0.55, alpha(color, a * 0.35));
    g.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(w * 0.18 + Math.sin(t * 0.22) * w * 0.05, h * 0.12 + Math.cos(t * 0.18) * h * 0.02, w * 0.6, theme.accent, theme.mode === "dark" ? 0.16 : 0.2);
  blob(w * 0.92 + Math.cos(t * 0.16) * w * 0.04, h * 0.78 + Math.sin(t * 0.2) * h * 0.02, w * 0.62, theme.accent2, theme.mode === "dark" ? 0.14 : 0.12);

  // faint blueprint grid
  ctx.strokeStyle = alpha(theme.ink, theme.mode === "dark" ? 0.035 : 0.03);
  ctx.lineWidth = Math.max(1, s);
  const grid = 72 * s;
  ctx.beginPath();
  for (let x = grid; x < w; x += grid) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = grid; y < h; y += grid) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.restore();

  // ---------- header ----------
  const sceneCount = Math.max(spec.sceneCount ?? 4, spec.index + 1);
  drawHeader(ctx, {
    width: w,
    label: spec.hudData?.label || "CERITA",
    episode: spec.hudData?.episode || `EPISODE 1`,
    index: spec.index,
    total: sceneCount,
    progress: p,
    theme,
    enter: tMs / 420,
  });

  // ---------- illustration card ----------
  const isCta = spec.purpose === "cta" && Boolean(spec.ctaPills?.length);
  const cardTop = 206 * s;
  const cardH = (isCta ? 470 : 690) * s;
  const cardX = margin;
  const cardW = w - margin * 2;

  const cardEnter = easeOutCubic(clamp(tMs / 620, 0, 1));
  const scale = 0.94 + 0.06 * cardEnter;
  const floatY = Math.sin(t * 0.7) * 2.2 * s * cardEnter;

  ctx.save();
  ctx.globalAlpha = cardEnter;
  ctx.translate(cardX + cardW / 2, cardTop + cardH / 2 + floatY + (1 - cardEnter) * 26 * s);
  ctx.scale(scale, scale);
  ctx.translate(-(cardX + cardW / 2), -(cardTop + cardH / 2));

  // plate under the art (tiny offset = sticker feel)
  ctx.fillStyle = alpha(theme.accent, 0.14);
  roundRect(ctx, cardX + 8 * s, cardTop + 8 * s, cardW, cardH, 26 * s);
  ctx.fill();

  const motif = (spec.gfxMotif as ReturnType<typeof resolveMotif>) ?? resolveMotif({
    location: spec.location,
    timeOfDay: spec.timeOfDay,
    weather: spec.weather,
    purpose: spec.purpose,
    seed,
  });
  drawMotif(ctx, motif, {
    x: cardX,
    y: cardTop,
    w: cardW,
    h: cardH,
    t,
    p,
    seed,
    theme,
    weather: spec.weather,
    timeOfDay: spec.timeOfDay,
  });

  // card edge
  ctx.strokeStyle = alpha(theme.ink, 0.14);
  ctx.lineWidth = Math.max(1.2, 1.4 * s);
  roundRect(ctx, cardX, cardTop, cardW, cardH, 26 * s);
  ctx.stroke();

  // framing ticks, corner marks like a camera viewfinder
  const tick = 22 * s;
  const tickOff = 14 * s;
  ctx.strokeStyle = alpha(theme.accent, 0.85);
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.lineCap = "round";
  const corners: [number, number, 1 | -1, 1 | -1][] = [
    [cardX, cardTop, 1, 1],
    [cardX + cardW, cardTop, -1, 1],
    [cardX, cardTop + cardH, 1, -1],
    [cardX + cardW, cardTop + cardH, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * tickOff, cy + sy * tickOff + sy * tick);
    ctx.lineTo(cx + sx * tickOff, cy + sy * tickOff);
    ctx.lineTo(cx + sx * tickOff + sx * tick, cy + sy * tickOff);
    ctx.stroke();
  }
  ctx.restore();

  // rotating dashed accent ring, tucked behind the card's lower-right corner
  ctx.save();
  ctx.globalAlpha = 0.3 * cardEnter;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = Math.max(1.5, 2 * s);
  ctx.setLineDash([6 * s, 9 * s]);
  ctx.lineDashOffset = -t * 20 * s;
  ctx.beginPath();
  ctx.arc(cardX + cardW, cardTop + cardH, 34 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ---------- headline kicker ----------
  if (spec.headline) {
    const kick = easeOutCubic(clamp((tMs - 180) / 420, 0, 1));
    ctx.save();
    ctx.globalAlpha = kick;
    ctx.font = `700 ${Math.round(15 * s)}px Poppins`;
    ctx.fillStyle = theme.mute;
    ctx.letterSpacing = `${2 * s}px`;
    ctx.fillText(spec.headline.toUpperCase(), margin, cardTop - 26 * s + (1 - kick) * 8 * s);
    ctx.letterSpacing = "0px";
    ctx.restore();
  }

  // ---------- narration / call to action ----------
  const captionTop = (isCta ? cardTop / s + 500 : 938) * s;
  let subtitleActive = false;
  if (isCta) {
    drawCta(ctx, {
      width: w,
      height: h,
      tMs,
      question: spec.ctaQuestion,
      pills: spec.ctaPills ?? [],
      theme,
      top: captionTop - 46 * s,
    });
  } else if (spec.showSubtitles !== false && spec.words?.length) {
    drawCaption(ctx, {
      words: spec.words,
      tMs,
      width: w,
      top: captionTop,
      style: spec.subtitleStyle,
      theme,
      noFade: spec.subtitleNoFade,
      keepInk: true,
    });
    subtitleActive = spec.words.some((word) => tMs >= word.startMs - 90 && tMs <= word.endMs + 240);
  }

  // ---------- footer ----------
  drawFooter(ctx, {
    width: w,
    height: h,
    tMs,
    durationMs: spec.durationMs,
    step: STEP_BY_PURPOSE[spec.purpose] ?? 0,
    steps: 6,
    theme,
    enter: (tMs - 320) / 500,
  });

  // ---------- grade ----------
  applyGrade(ctx, w, h, {
    vignette: theme.mode === "dark" ? 0.4 : 0.16,
    grain: 0.32,
    warm: 0,
    seed: Math.floor(tMs / 33),
  });

  // opening fade so the first frame never flashes
  if (spec.index === 0 && tMs < 260) {
    ctx.save();
    ctx.fillStyle = alpha(theme.base, 1 - easeOutCubic(clamp(tMs / 260, 0, 1)));
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  void mix;
  void isWet;
  void mulberry32;
  return { subtitleActive };
}
