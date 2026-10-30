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
export function renderGfxFrame(ctx: Ctx, spec: SceneRenderSpec, tMs: number): GfxResult {
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
