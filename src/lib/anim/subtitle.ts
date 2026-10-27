import type { SceneWord, SubtitleStyle } from "../types";
import { Ctx, clamp, easeOutCubic, rgba, roundRect, smoothstep } from "./geometry";

export interface SubtitleChunk {
  words: SceneWord[];
  startMs: number;
  endMs: number;
  text: string;
}

export function buildChunks(words: SceneWord[], style: Pick<SubtitleStyle, "wordsPerChunk">): SubtitleChunk[] {
  const chunks: SubtitleChunk[] = [];
  const per = Math.max(1, style.wordsPerChunk || 3);
  let current: SceneWord[] = [];
  const flush = () => {
    if (!current.length) return;
    chunks.push({
      words: current,
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
      text: current.map((w) => w.text).join(" "),
    });
    current = [];
  };
  for (const w of words) {
    current.push(w);
    const dur = current[current.length - 1].endMs - current[0].startMs;
    const endsSentence = /[.!?]$/.test(w.text);
    if (current.length >= per || dur >= 2100 || endsSentence) flush();
  }
  flush();
  return chunks;
}

interface LayoutLine {
  words: SceneWord[];
  widths: number[];
  totalWidth: number;
}

function layoutChunk(
  ctx: Ctx,
  chunk: SubtitleChunk,
  style: SubtitleStyle,
  maxWidth: number,
  fontSize: number,
  letterSpacing: number
): LayoutLine[] {
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  const space = ctx.measureText(" ").width + letterSpacing;
  const measure = (w: string) => {
    const txt = style.uppercase ? w.toUpperCase() : w;
    return ctx.measureText(txt).width + letterSpacing * Math.max(0, txt.length - 1);
  };
  const lines: LayoutLine[] = [];
  let line: LayoutLine = { words: [], widths: [], totalWidth: 0 };
  for (const w of chunk.words) {
    const width = measure(w.text);
    const added = line.words.length ? space + width : width;
    if (line.words.length && line.totalWidth + added > maxWidth) {
      lines.push(line);
      line = { words: [w], widths: [width], totalWidth: width };
    } else {
      line.words.push(w);
      line.widths.push(width);
      line.totalWidth += added;
    }
  }
  if (line.words.length) lines.push(line);
  return lines;
}

export interface SubtitleRenderOptions {
  width: number;
  height: number;
  tMs: number;
  avoidRects?: { x0: number; y0: number; x1: number; y1: number }[];
  opacity?: number;
  /** Static previews disable the 110 ms crossfade so the frame never lands mid-fade. */
  noFade?: boolean;
}

export function drawSubtitle(
  ctx: Ctx,
  words: SceneWord[],
  style: SubtitleStyle,
  opts: SubtitleRenderOptions
): { active: boolean; bounds?: { x0: number; y0: number; x1: number; y1: number } } {
  if (!style.enabled || !words.length) return { active: false };
  const scale = opts.width / 720;
  const fontSize = Math.round(style.fontSize * scale);
  const letterSpacing = style.letterSpacing * scale;
  const chunks = buildChunks(words, { ...style, wordsPerChunk: style.mode === "word" ? 1 : style.wordsPerChunk });
  if (!chunks.length) return { active: false };
  const t = opts.tMs;

  // Pick the chunk that actually contains t. The +160ms grace window must only
  // be used when no chunk strictly covers t, otherwise an earlier chunk wins
  // and fades to zero opacity while the current chunk is still on screen.
  let idx = chunks.findIndex((c) => t >= c.startMs && t < c.endMs);
  if (idx === -1) {
    idx = chunks.findIndex((c) => t >= c.startMs && t < c.endMs + 160);
  }
  if (idx === -1) {
    if (t < chunks[0].startMs) return { active: false };
    idx = chunks.length - 1;
    if (t > chunks[idx].endMs + 160) return { active: false };
  }
  const chunk = chunks[idx];
  const isLast = idx === chunks.length - 1;
  let alpha = 1;
  const fadeIn = 110;
  const fadeOut = isLast ? 220 : 90;
  if (!opts.noFade) {
    if (t < chunk.startMs + fadeIn) alpha = smoothstep((t - chunk.startMs) / fadeIn);
    else if (t > chunk.endMs - fadeOut) alpha = 1 - smoothstep((t - (chunk.endMs - fadeOut)) / fadeOut);
  }
  alpha *= opts.opacity ?? 1;
  if (alpha <= 0.01) return { active: false };

  const maxWidth = opts.width - style.marginX * 2 * scale;
  let lines = layoutChunk(ctx, chunk, style, maxWidth, fontSize, letterSpacing);
  let usedFontSize = fontSize;
  // shrink the type until the widest line fits comfortably (never clip)
  let guard = 0;
  while (guard++ < 10 && lines.some((l) => l.totalWidth > maxWidth)) {
    usedFontSize = Math.round(usedFontSize * 0.92);
    lines = layoutChunk(ctx, chunk, style, maxWidth, usedFontSize, letterSpacing);
  }
  const fSize = usedFontSize;
  const lineHeight = fSize * style.lineHeight;
  const totalHeight = lines.length * lineHeight;

  let baseY = style.positionY * opts.height - totalHeight + lineHeight * 0.82;
  // keep away from faces
  const padding = 18 * scale;
  const rectFor = (y: number) => ({
    x0: opts.width / 2 - maxWidth / 2,
    y0: y - fSize * 0.82,
    x1: opts.width / 2 + maxWidth / 2,
    y1: y - fSize * 0.82 + totalHeight,
  });
  if (opts.avoidRects?.length) {
    // Placement is computed from a block that reserves room for the tallest
    // chunk in the scene, so one- and two-line chunks share the same anchor and
    // the subtitles never hop vertically between phrases.
    const reserveLines = Math.min(
      3,
      Math.max(
        1,
        ...chunks.map((c) => layoutChunk(ctx, c, style, maxWidth, fSize, letterSpacing).length)
      )
    );
    const reservedHeight = reserveLines * lineHeight;
    // bottom edge stays fixed for every chunk (bottom-anchored subtitles)
    const bottomEdge = baseY + (totalHeight - lineHeight * 0.82);
    const reservedTop = bottomEdge - reservedHeight;
    // The text box spans most of the frame width, so only vertical clearance
    // matters: heads are always inside the text column.
    const overlapsAt = (top: number) => {
      const y0 = top;
      const y1 = top + reservedHeight;
      return opts.avoidRects!.some((r) => y1 > r.y0 - padding && y0 < r.y1 + padding);
    };
    const topLimit = opts.height * 0.12;
    const bottomLimit = opts.height * 0.95;
    const step = lineHeight * 0.72;
    const candidates: number[] = [reservedTop];
    for (let i = 1; i <= 8; i++) candidates.push(reservedTop + step * i);
    for (let i = 1; i <= 6; i++) candidates.push(reservedTop - step * i);
    if (overlapsAt(reservedTop)) {
      const fit = candidates.find((top) => top >= topLimit && top + reservedHeight <= bottomLimit && !overlapsAt(top));
      if (fit !== undefined) baseY += fit - reservedTop;
    }
  }

  const pop = 1 + (1 - easeOutCubic(clamp((t - chunk.startMs) / 140, 0, 1))) * 0.06;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.translate(opts.width / 2, baseY);
  ctx.scale(pop, pop);
  ctx.translate(-opts.width / 2, -baseY);

  const activeWord = chunk.words.find((w) => t >= w.startMs && t < w.endMs);

  lines.forEach((line, li) => {
    const y = baseY + li * lineHeight;
    let x = opts.width / 2 - line.totalWidth / 2;
    ctx.font = `${style.fontWeight} ${fSize}px ${style.fontFamily}`;
    line.words.forEach((word, wi) => {
      const text = style.uppercase ? word.text.toUpperCase() : word.text;
      const isEmphasis = word.emphasis;
      const isActive = activeWord === word;
      if (style.background) {
        ctx.fillStyle = rgba(style.backgroundColor, 0.55);
        const wWidth = line.widths[wi];
        roundRect(ctx, x - 6 * scale, y - fSize * 0.86, wWidth + 12 * scale, fSize * 1.08, 8 * scale);
        ctx.fill();
      }
      // shadow / outline
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(0,0,0,0.65)";
      ctx.shadowBlur = style.shadow * scale;
      ctx.shadowOffsetY = 4 * scale;
      if (style.strokeWidth > 0) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth * 2 * scale;
        ctx.strokeText(text, x, y);
      }
      ctx.fillStyle = isEmphasis ? style.emphasisColor : style.fill;
      if (isActive && !isEmphasis) {
        ctx.fillStyle = style.fill;
        ctx.shadowColor = "rgba(255,255,255,0.5)";
        ctx.shadowBlur = 18 * scale;
      }
      ctx.fillText(text, x, y);
      const ratio = fSize / fontSize;
      x += line.widths[wi] * ratio + ctx.measureText(" ").width + letterSpacing;
    });
  });
  ctx.restore();
  const bounds = rectFor(baseY);
  return { active: true, bounds };
}

/** Convert word timings to SRT with phrase grouping. */
export function wordsToSrt(
  scenes: { startMs: number; words: SceneWord[]; narration: string }[],
  opts: { wordsPerCue?: number } = {}
): string {
  const cues: { start: number; end: number; text: string }[] = [];
  for (const scene of scenes) {
    const chunks = buildChunks(scene.words, { wordsPerChunk: opts.wordsPerCue ?? 4 });
    for (const c of chunks) {
      cues.push({
        start: scene.startMs + c.startMs,
        end: scene.startMs + c.endMs,
        text: c.words.map((w) => w.text).join(" "),
      });
    }
  }
  const fmt = (ms: number) => {
    const total = Math.max(0, Math.round(ms));
    const h = Math.floor(total / 3600000);
    const m = Math.floor((total % 3600000) / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const r = total % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
  };
  return cues
    .map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`)
    .join("\n");
}
