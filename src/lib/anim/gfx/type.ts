import type { SceneWord, SubtitleStyle } from "../../types";
import { Ctx, clamp, easeOutCubic, roundRect } from "../geometry";
import { buildChunks } from "../subtitle";
import { GfxTheme, alpha, mix, toRgb } from "./theme";

export interface CaptionOpts {
  words: SceneWord[];
  tMs: number;
  width: number;
  /** top of the caption block, in pixels */
  top: number;
  style: SubtitleStyle;
  theme: GfxTheme;
  /** hide the fade-out so static previews never catch a half-transparent chunk */
  noFade?: boolean;
}

interface Line {
  words: SceneWord[];
  widths: number[];
  width: number;
}

const EASE_MS = 240;
const LEAD_MS = 90;

function layoutWords(
  ctx: Ctx,
  words: SceneWord[],
  style: SubtitleStyle,
  fontSize: number,
  maxWidth: number,
  letterSpacing: number
): Line[] {
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  const space = fontSize * 0.26 + letterSpacing;
  const lines: Line[] = [];
  let line: Line = { words: [], widths: [], width: 0 };
  for (const w of words) {
    const text = style.uppercase ? w.text.toUpperCase() : w.text;
    const width = ctx.measureText(text).width + letterSpacing * Math.max(0, text.length - 1);
    const added = line.words.length ? space + width : width;
    if (line.words.length && line.width + added > maxWidth) {
      lines.push(line);
      line = { words: [w], widths: [width], width };
    } else {
      line.words.push(w);
      line.widths.push(width);
      line.width += added;
    }
  }
  if (line.words.length) lines.push(line);
  return lines;
}

/**
 * Kinetic narration: every word slides up out of the baseline as it is spoken,
 * the word being voiced sits at full ink, already-spoken words dim, and
 * emphasis words get an accent block that grows behind them.
 */
export function drawCaption(ctx: Ctx, o: CaptionOpts) {
  if (!o.words?.length) return;
  const { theme, style } = o;
  const s = o.width / 720;
  const fontSize = Math.round((style.fontSize || 52) * 0.96 * s);
  const letterSpacing = (style.letterSpacing || 0) * s;
  const lineHeight = fontSize * (style.lineHeight || 1.08);
  const maxWidth = o.width - 120 * s;
  const chunks = buildChunks(o.words, { wordsPerChunk: style.wordsPerChunk || 3 });

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const next = chunks[ci + 1];
    // Hand the caption over cleanly: the outgoing chunk is gone before the
    // first word of the next one rises in, so two lines never overlap.
    const handoff = next ? next.startMs - LEAD_MS : Number.POSITIVE_INFINITY;
    if (o.tMs < chunk.startMs - LEAD_MS) continue;
    if (o.tMs > (next ? chunk.endMs + 260 : chunk.endMs + 1400)) continue;
    if (next && o.tMs >= handoff) continue;
    // the closing line holds rather than blinking out while the scene runs on
    const fadeStart = next ? Math.min(chunk.endMs - 40, handoff - 240) : chunk.endMs + 1000;
    const outro = o.noFade ? 0 : clamp((o.tMs - fadeStart) / 300, 0, 1);
    const chunkAlpha = 1 - outro;
    if (chunkAlpha <= 0.01) continue;

    const lines = layoutWords(ctx, chunk.words, style, fontSize, maxWidth, letterSpacing);
    const blockHeight = lines.length * lineHeight;
    const top = o.top;

    lines.forEach((line, li) => {
      const space = fontSize * 0.26 + letterSpacing;
      let x = o.width / 2 - line.width / 2;
      const baseline = top + li * lineHeight + fontSize * 0.86;

      line.words.forEach((word, wi) => {
        const text = style.uppercase ? word.text.toUpperCase() : word.text;
        const appear = easeOutCubic(clamp((o.tMs - (word.startMs - LEAD_MS)) / EASE_MS, 0, 1));
        if (appear <= 0.001) {
          x += line.widths[wi] + space;
          return;
        }
        const active = o.tMs >= word.startMs - 60 && o.tMs <= word.endMs + 40;
        const spoken = o.tMs > word.endMs + 40;
        const rise = (1 - appear) * lineHeight * 0.44;
        const y = baseline + rise;
        const emphasis = Boolean(word.emphasis);

        ctx.save();
        ctx.globalAlpha = chunkAlpha * appear;

        const colourMode = style.emphasisStyle === "color";
        if (emphasis && !colourMode) {
          const grow = easeOutCubic(clamp((o.tMs - (word.startMs - LEAD_MS - 40)) / 320, 0, 1));
          const padX = fontSize * 0.14;
          const barH = fontSize * 0.92;
          const barW = (line.widths[wi] + padX * 2) * (0.15 + 0.85 * grow);
          ctx.fillStyle = theme.accent;
          roundRect(ctx, x - padX, y - barH * 0.78, Math.max(barW, 2), barH, fontSize * 0.12);
          ctx.fill();
        }

        ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
        ctx.letterSpacing = `${letterSpacing}px`;
        const ink = emphasis
          ? colourMode
            ? theme.accent
            : theme.onAccent
          : active
            ? theme.ink
            : mix(theme.ink, theme.mute, spoken ? 0.45 : 0.18);
        ctx.fillStyle = ink;
        if (!emphasis && active) {
          ctx.shadowColor = alpha(theme.accent, 0.45);
          ctx.shadowBlur = fontSize * 0.35;
        }
        if (style.emphasisStyle === "color" && style.shadow > 0) {
          ctx.shadowColor = alpha("#000000", 0.55);
          ctx.shadowBlur = fontSize * style.shadow;
          ctx.shadowOffsetY = fontSize * 0.05;
        }
        ctx.fillText(text, x, y);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.restore();

        x += line.widths[wi] + space;
      });
    });
    void blockHeight;
  }
  ctx.restore();
}

export interface HeaderOpts {
  width: number;
  label: string;
  episode: string;
  index: number;
  total: number;
  progress: number;
  theme: GfxTheme;
  /** entrance progress 0..1 */
  enter: number;
}

/** Chapter chip, scene counter and the thin progress rail. */
export function drawHeader(ctx: Ctx, o: HeaderOpts) {
  const s = o.width / 720;
  const margin = 56 * s;
  const chipY = 84 * s;
  const ease = easeOutCubic(clamp(o.enter, 0, 1));
  const rise = (1 - ease) * 14 * s;

  ctx.save();
  ctx.globalAlpha = ease;
  ctx.translate(0, rise);

  // chip
  const label = o.label.toUpperCase();
  ctx.font = `700 ${Math.round(16 * s)}px Poppins`;
  const chipTextW = ctx.measureText(label).width;
  const dotR = 4 * s;
  const chipH = 34 * s;
  const chipW = chipTextW + 52 * s;
  ctx.fillStyle = alpha(o.theme.ink, o.theme.mode === "dark" ? 0.07 : 0.06);
  roundRect(ctx, margin, chipY, chipW, chipH, chipH / 2);
  ctx.fill();
  ctx.strokeStyle = o.theme.line;
  ctx.lineWidth = Math.max(1, s);
  ctx.stroke();

  const pulse = 0.6 + 0.4 * Math.sin(o.progress * 26);
  ctx.fillStyle = alpha(o.theme.accent, 0.6 + 0.4 * pulse);
  ctx.beginPath();
  ctx.arc(margin + 18 * s, chipY + chipH / 2, dotR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = o.theme.ink;
  ctx.letterSpacing = `${1.6 * s}px`;
  ctx.fillText(label, margin + 30 * s, chipY + chipH / 2 + 5.5 * s);
  ctx.letterSpacing = "0px";

  // episode line under the chip
  ctx.font = `500 ${Math.round(13 * s)}px Poppins`;
  ctx.fillStyle = o.theme.mute;
  ctx.letterSpacing = `${1.3 * s}px`;
  ctx.fillText(o.episode.toUpperCase(), margin + 4 * s, chipY + chipH + 22 * s);
  ctx.letterSpacing = "0px";

  // scene counter, right aligned
  const cw = 150 * s;
  const cx = o.width - margin - cw;
  ctx.font = `400 ${Math.round(64 * s)}px Anton`;
  ctx.textAlign = "right";
  ctx.fillStyle = alpha(o.theme.ink, 0.22);
  ctx.fillText(String(o.index + 1).padStart(2, "0"), o.width - margin, chipY + 54 * s);
  ctx.font = `600 ${Math.round(14 * s)}px Poppins`;
  ctx.fillStyle = o.theme.mute;
  ctx.letterSpacing = `${1.2 * s}px`;
  ctx.fillText(`/ ${String(o.total).padStart(2, "0")}`, o.width - margin, chipY + 76 * s);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";

  // progress rail
  const railY = 178 * s;
  const railW = o.width - margin * 2;
  ctx.fillStyle = alpha(o.theme.ink, 0.12);
  roundRect(ctx, margin, railY, railW, 3 * s, 1.5 * s);
  ctx.fill();
  const filled = Math.max(3 * s, railW * clamp(o.progress, 0, 1));
  ctx.fillStyle = o.theme.accent;
  roundRect(ctx, margin, railY, filled, 3 * s, 1.5 * s);
  ctx.fill();
  const glow = ctx.createRadialGradient(margin + filled, railY + 1.5 * s, 0, margin + filled, railY + 1.5 * s, 16 * s);
  glow.addColorStop(0, alpha(o.theme.accent, 0.8));
  glow.addColorStop(1, alpha(o.theme.accent, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(margin + filled, railY + 1.5 * s, 16 * s, 0, Math.PI * 2);
  ctx.fill();
  void cx;

  ctx.restore();
}

export interface FooterOpts {
  width: number;
  height: number;
  tMs: number;
  durationMs: number;
  step: number;
  steps: number;
  theme: GfxTheme;
  enter: number;
}

/** Running timecode plus chapter dots: the small print that sells "motion graphics". */
export function drawFooter(ctx: Ctx, o: FooterOpts) {
  const s = o.width / 720;
  const margin = 56 * s;
  const y = o.height - 58 * s;
  const ease = easeOutCubic(clamp(o.enter, 0, 1));
  ctx.save();
  ctx.globalAlpha = 0.62 * ease;

  const fmt = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  ctx.font = `500 ${Math.round(14 * s)}px Poppins`;
  ctx.fillStyle = o.theme.mute;
  ctx.letterSpacing = `${1.1 * s}px`;
  ctx.fillText(`${fmt(o.tMs)} / ${fmt(o.durationMs)}`, margin, y);
  ctx.letterSpacing = "0px";

  // chapter dots
  const dotGap = 14 * s;
  const totalW = (o.steps - 1) * dotGap;
  const startX = o.width - margin - totalW;
  for (let i = 0; i < o.steps; i++) {
    const active = i === o.step;
    const done = i < o.step;
    const r = active ? 4.2 * s : 3 * s;
    ctx.fillStyle = active ? o.theme.accent : alpha(o.theme.ink, done ? 0.4 : 0.18);
    ctx.beginPath();
    ctx.arc(startX + i * dotGap, y - 4 * s, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface CtaOpts {
  width: number;
  height: number;
  tMs: number;
  question?: string;
  pills: string[];
  theme: GfxTheme;
  /** top of the block */
  top: number;
}

export function drawCta(ctx: Ctx, o: CtaOpts) {
  const s = o.width / 720;
  const margin = 56 * s;
  const enter = easeOutCubic(clamp((o.tMs - 120) / 420, 0, 1));
  if (enter <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = enter;
  ctx.textAlign = "center";

  const q = (o.question || "APA PILIHANMU?").toUpperCase();
  ctx.font = `400 ${Math.round(46 * s)}px Anton`;
  ctx.fillStyle = o.theme.ink;
  ctx.fillText(q, o.width / 2, o.top + 46 * s * enter);

  o.pills.slice(0, 2).forEach((label, i) => {
    const delay = i * 110;
    const p = easeOutCubic(clamp((o.tMs - 260 - delay) / 420, 0, 1));
    if (p <= 0.001) return;
    const y = o.top + 112 * s + i * 84 * s;
    const text = label.toUpperCase();
    ctx.font = `700 ${Math.round(24 * s)}px Poppins`;
    const tw = ctx.measureText(text).width;
    const pw = Math.min(o.width - margin * 2, tw + 108 * s);
    const ph = 62 * s;
    const x = o.width / 2 - pw / 2 + (1 - p) * (i === 0 ? -20 : 20) * s;

    ctx.globalAlpha = enter * p;
    ctx.fillStyle = o.theme.surface;
    roundRect(ctx, x, y - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.strokeStyle = alpha(o.theme.accent, 0.75);
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // index chip
    const chipR = 17 * s;
    ctx.fillStyle = alpha(o.theme.accent, 0.16);
    ctx.beginPath();
    ctx.arc(x + 30 * s, y, chipR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = o.theme.accent;
    ctx.font = `700 ${Math.round(16 * s)}px Poppins`;
    ctx.fillText(String.fromCharCode(65 + i), x + 30 * s, y + 5.5 * s);

    ctx.fillStyle = o.theme.ink;
    ctx.font = `700 ${Math.round(24 * s)}px Poppins`;
    ctx.textAlign = "left";
    ctx.fillText(text, x + 58 * s, y + 8 * s);
    ctx.textAlign = "center";
  });

  ctx.restore();
  void toRgb;
}
