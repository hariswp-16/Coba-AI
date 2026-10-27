import type { HudStyle } from "../types";
import { Ctx, rgba, drawTextSpaced, clamp, roundRect } from "./geometry";

export interface HudData {
  label: string;
  clock: string;
  episode: string;
}

export function drawHud(
  ctx: Ctx,
  style: HudStyle,
  data: HudData,
  opts: { width: number; height: number; opacity: number; scale?: number }
) {
  if (!style.enabled || opts.opacity <= 0.01) return;
  const w = opts.width;
  const s = (opts.scale ?? 1) * (w / 720);
  const x = style.align === "left" ? style.marginX * s : w / 2;
  const y = style.positionY * opts.height;

  ctx.save();
  ctx.globalAlpha = clamp(opts.opacity, 0, 1);
  ctx.textAlign = style.align;
  ctx.textBaseline = "alphabetic";

  // label
  ctx.font = `700 ${Math.round(19 * s)}px Poppins`;
  const labelWidth = ctx.measureText(data.label.toUpperCase()).width + (style.dotEnabled ? 26 * s : 0);
  if (style.dotEnabled) {
    ctx.fillStyle = style.labelColor;
    ctx.beginPath();
    ctx.arc(style.align === "left" ? x + 5 * s : x - labelWidth / 2 + 5 * s, y - 6 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = style.labelColor;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 8 * s;
  drawTextSpaced(
    ctx,
    data.label.toUpperCase(),
    style.align === "left" ? x + (style.dotEnabled ? 18 * s : 0) : x - labelWidth / 2 + (style.dotEnabled ? 18 * s : 0),
    y,
    1.4 * s,
    "left"
  );

  // clock
  if (style.clockEnabled) {
    ctx.font = `400 ${Math.round(72 * s)}px Anton`;
    ctx.fillStyle = style.clockColor;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 14 * s;
    ctx.textAlign = style.align;
    ctx.fillText(data.clock, x, y + 74 * s);
  }

  // episode line
  ctx.font = `500 ${Math.round(20 * s)}px Poppins`;
  ctx.fillStyle = style.episodeColor;
  ctx.shadowBlur = 8 * s;
  drawTextSpaced(
    ctx,
    data.episode.toUpperCase(),
    style.align === "left" ? x : x - ctx.measureText(data.episode.toUpperCase()).width / 2,
    y + 108 * s,
    3.2 * s,
    "left"
  );

  ctx.restore();
}

export function drawChoicePills(
  ctx: Ctx,
  pills: string[],
  opts: { width: number; height: number; y: number; opacity: number; question?: string }
) {
  const w = opts.width;
  const s = w / 720;
  const cx = w / 2;
  ctx.save();
  ctx.globalAlpha = clamp(opts.opacity, 0, 1);
  if (opts.question) {
    ctx.textAlign = "center";
    ctx.font = `400 ${Math.round(52 * s)}px Anton`;
    const q = opts.question.toUpperCase();
    const qw = ctx.measureText(q).width;
    // pill-shaped plate behind the question so it stays readable on bright plates
    const padX = 22 * s;
    const plateH = 62 * s;
    const plateY = opts.y - 40 * s - plateH * 0.78;
    roundRect(ctx, cx - qw / 2 - padX, plateY, qw + padX * 2, plateH, plateH / 2);
    ctx.fillStyle = "rgba(10,10,14,0.72)";
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.fillStyle = "#f4f1e8";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 12 * s;
    ctx.fillText(q, cx, opts.y - 40 * s);
    ctx.shadowBlur = 0;
  }
  const colors = ["#ff6b6b", "#69d2e7"];
  pills.slice(0, 2).forEach((label, i) => {
    const py = opts.y + i * 78 * s;
    ctx.font = `700 ${Math.round(30 * s)}px Poppins`;
    const tw = ctx.measureText(label.toUpperCase()).width;
    const pw = Math.min(w - 80 * s, tw + 76 * s);
    const ph = 58 * s;
    ctx.beginPath();
    const r = ph / 2;
    const x0 = cx - pw / 2;
    ctx.moveTo(x0 + r, py - ph / 2);
    ctx.lineTo(x0 + pw - r, py - ph / 2);
    ctx.arc(x0 + pw - r, py, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x0 + r, py + ph / 2);
    ctx.arc(x0 + r, py, r, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.closePath();
    ctx.fillStyle = "rgba(10,10,14,0.55)";
    ctx.fill();
    ctx.lineWidth = 3.5 * s;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.shadowColor = colors[i % colors.length];
    ctx.shadowBlur = 14 * s;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f6f3ea";
    ctx.textAlign = "center";
    ctx.fillText(label.toUpperCase(), cx, py + 10 * s);
  });
  ctx.restore();
}

export function drawWatermark(ctx: Ctx, width: number, height: number, text: string) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#ffffff";
  ctx.font = `500 ${Math.round(15 * (width / 720))}px Poppins`;
  ctx.textAlign = "right";
  ctx.fillText(text, width - 26 * (width / 720), height - 30 * (height / 1280) * (width / 720));
  ctx.restore();
}

export function hudClockFor(timeOfDay: string, seed: number): string {
  const rnd = (n: number) => Math.floor(((seed * 9301 + 49297 * n) % 233280) / 233280 * 59);
  let hour = 21;
  if (timeOfDay === "pagi") hour = 5 + (rnd(1) % 3);
  else if (timeOfDay === "siang") hour = 11 + (rnd(2) % 4);
  else if (timeOfDay === "sore") hour = 16 + (rnd(3) % 3);
  else hour = 19 + (rnd(4) % 5);
  return `${String(hour).padStart(2, "0")}:${String(rnd(5)).padStart(2, "0")}`;
}

export { rgba };
