import type { SKRSContext2D, Image } from "@napi-rs/canvas";

export type Ctx = SKRSContext2D;
export type { Image };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;

export function shade(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    const k = 1 + amount;
    r = Math.round(r * k);
    g = Math.round(g * k);
    b = Math.round(b * k);
  }
  return `#${[r, g, b].map((v) => clamp(v, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

export function rgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function radialGlow(
  ctx: Ctx,
  x: number,
  y: number,
  radius: number,
  color: string,
  intensity = 1
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(color, 0.85 * intensity));
  g.addColorStop(0.45, rgba(color, 0.32 * intensity));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function softShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.35) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.45})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Subtle wall/plaster texture drawn as low-opacity speckles. */
export function speckle(
  ctx: Ctx,
  rect: Rect,
  seed: number,
  count = 400,
  alpha = 0.05,
  color = "#000000"
) {
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = rect.x + rnd() * rect.w;
    const y = rect.y + rnd() * rect.h;
    const r = 0.5 + rnd() * 1.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function verticalGradient(ctx: Ctx, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [p, c] of stops) g.addColorStop(clamp(p, 0, 1), c);
  return g;
}

export function horizonGradient(ctx: Ctx, x0: number, x1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [p, c] of stops) g.addColorStop(clamp(p, 0, 1), c);
  return g;
}

/** Persistent vignette / film grade used on every frame. */
export function applyGrade(
  ctx: Ctx,
  width: number,
  height: number,
  opts: { vignette: number; grain: number; warm: number; seed?: number }
) {
  const { vignette, grain, warm } = opts;
  if (warm !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = warm > 0 ? rgba("#ff9d3d", Math.min(0.16, warm)) : rgba("#3d7dff", Math.min(0.16, -warm));
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  if (vignette > 0) {
    const g = ctx.createRadialGradient(
      width / 2,
      height * 0.46,
      Math.min(width, height) * 0.22,
      width / 2,
      height * 0.5,
      Math.max(width, height) * 0.78
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.65, `rgba(0,0,0,${0.22 * vignette})`);
    g.addColorStop(1, `rgba(0,0,0,${0.72 * vignette})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  if (grain > 0) {
    const rnd = mulberry32((opts.seed ?? 1) * 7919);
    ctx.save();
    ctx.globalAlpha = Math.min(0.11, grain * 0.09);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * width;
      const y = rnd() * height;
      ctx.fillStyle = rnd() > 0.5 ? "#ffffff" : "#000000";
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.restore();
  }
}

export function drawTextSpaced(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: "left" | "center" | "right" = "left"
) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let cursor = align === "left" ? x : align === "center" ? x - total / 2 : x - total;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let i = 0;
  for (const ch of chars) {
    ctx.fillText(ch, cursor, y);
    cursor += widths[i++] + spacing;
  }
  ctx.textAlign = prevAlign;
  return total;
}
