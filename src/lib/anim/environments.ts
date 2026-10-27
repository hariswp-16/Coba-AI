import type { PaletteSpec, StyleProfileSpec } from "../types";
import {
  Ctx,
  Rect,
  rgba,
  shade,
  roundRect,
  radialGlow,
  speckle,
  verticalGradient,
  mulberry32,
  lerp,
} from "./geometry";

export type LocationKey =
  | "rumah_malam"
  | "rumah_siang"
  | "kamar_malam"
  | "teras_hujan"
  | "jalan_malam"
  | "jalan_siang"
  | "kota_senja"
  | "masjid_malam"
  | "sekolah_siang"
  | "abstract";

export const LOCATIONS: { key: LocationKey; label: string; timeOfDay: string }[] = [
  { key: "rumah_malam", label: "Rumah — malam", timeOfDay: "malam" },
  { key: "rumah_siang", label: "Rumah — siang", timeOfDay: "siang" },
  { key: "kamar_malam", label: "Kamar — malam", timeOfDay: "malam" },
  { key: "teras_hujan", label: "Teras rumah saat hujan", timeOfDay: "malam" },
  { key: "jalan_malam", label: "Jalan kota — malam", timeOfDay: "malam" },
  { key: "jalan_siang", label: "Jalan kota — siang", timeOfDay: "siang" },
  { key: "kota_senja", label: "Kota — senja", timeOfDay: "sore" },
  { key: "masjid_malam", label: "Masjid — malam", timeOfDay: "malam" },
  { key: "sekolah_siang", label: "Sekolah — siang", timeOfDay: "siang" },
  { key: "abstract", label: "Latar dramatis", timeOfDay: "malam" },
];

export interface EnvContext {
  ctx: Ctx;
  w: number;
  h: number;
  t: number;
  palette: PaletteSpec;
  style: StyleProfileSpec;
  seed: number;
  weather?: string;
  timeOfDay?: string;
  panOffset?: number;
}

export interface LightSource {
  x: number;
  y: number;
  r: number;
  color: string;
  intensity: number;
}

export interface EnvironmentDef {
  key: LocationKey;
  groundY: number;
  horizonY: number;
  lights: (ctx: EnvContext) => LightSource[];
  drawStatic: (ctx: EnvContext) => void;
  drawDynamic?: (ctx: EnvContext) => void;
  drawForeground?: (ctx: EnvContext) => void;
  ambientTint: string;
  ambientAlpha: number;
}

/* --------------------------------------------------------------------- */
/* Small drawing helpers                                                  */
/* --------------------------------------------------------------------- */

function wallPanel(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, seed: number) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  speckle(ctx, { x, y, w, h }, seed, 260, 0.05, "#000000");
  speckle(ctx, { x, y, w, h }, seed + 7, 120, 0.035, "#ffffff");
}

function tileFloor(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  const g = verticalGradient(ctx, y, y + h, [
    [0, shade(color, -0.18)],
    [0.5, color],
    [1, shade(color, -0.3)],
  ]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.strokeStyle = rgba(shade(color, -0.45), 0.35);
  ctx.lineWidth = 1.2;
  const cols = 9;
  const rows = 6;
  for (let i = 1; i < cols; i++) {
    const px = x + (w / cols) * i;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + (i - cols / 2) * 8, y + h);
    ctx.stroke();
  }
  for (let j = 1; j < rows; j++) {
    const py = y + Math.pow(j / rows, 1.55) * h;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  ctx.restore();
}

function woodSurface(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, seed: number) {
  const g = verticalGradient(ctx, y, y + h, [
    [0, shade(color, 0.1)],
    [1, shade(color, -0.25)],
  ]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = rnd() > 0.5 ? "#000" : "#fff";
    ctx.lineWidth = 0.8 + rnd();
    const yy = y + rnd() * h;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + w * 0.3, yy + rnd() * 4, x + w * 0.6, yy - rnd() * 4, x + w, yy + rnd() * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function door(ctx: Ctx, x: number, y: number, w: number, h: number, frame: string, dark: string) {
  ctx.fillStyle = frame;
  ctx.fillRect(x - w * 0.09, y - w * 0.06, w * 1.18, h + w * 0.06);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#0a0c10");
  g.addColorStop(0.55, dark);
  g.addColorStop(1, shade(dark, -0.25));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // door leaves opening inward
  ctx.fillStyle = shade(frame, -0.3);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - w * 0.34, y + h * 0.06);
  ctx.lineTo(x - w * 0.34, y + h * 0.92);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(frame, -0.15);
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w * 1.3, y + h * 0.05);
  ctx.lineTo(x + w * 1.3, y + h * 0.93);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  // moonlight spill
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const spill = ctx.createLinearGradient(x, y, x + w * 0.9, y + h);
  spill.addColorStop(0, "rgba(120,160,220,0.10)");
  spill.addColorStop(1, "rgba(120,160,220,0)");
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.1);
  ctx.lineTo(x + w, y + h * 0.2);
  ctx.lineTo(x + w * 1.6, y + h);
  ctx.lineTo(x - w * 0.2, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function windowFrame(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: string,
  night: boolean,
  curtains?: string
) {
  ctx.fillStyle = frame;
  ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
  const g = night
    ? verticalGradient(ctx, y, y + h, [
        [0, "#101b2c"],
        [1, "#1c2b3f"],
      ])
    : verticalGradient(ctx, y, y + h, [
        [0, "#9ec8e8"],
        [1, "#dcecf7"],
      ]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = shade(frame, -0.2);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h * 0.45);
  ctx.lineTo(x + w, y + h * 0.45);
  ctx.stroke();
  if (curtains) {
    ctx.fillStyle = curtains;
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 10);
    ctx.quadraticCurveTo(x + 22, y + h * 0.4, x - 6, y + h + 12);
    ctx.lineTo(x - 40, y + h + 12);
    ctx.lineTo(x - 40, y - 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w + 14, y - 10);
    ctx.quadraticCurveTo(x + w - 22, y + h * 0.4, x + w + 6, y + h + 12);
    ctx.lineTo(x + w + 40, y + h + 12);
    ctx.lineTo(x + w + 40, y - 10);
    ctx.closePath();
    ctx.fill();
  }
}

function calendar(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = "#f3ead6";
  roundRect(ctx, x, y, w, h, 2);
  ctx.fill();
  ctx.fillStyle = "#d9cdb4";
  ctx.fillRect(x, y, w, h * 0.06);
  // photo area
  const g = verticalGradient(ctx, y + h * 0.08, y + h * 0.42, [
    [0, "#f2a35c"],
    [0.45, "#e8834a"],
    [1, "#cfd8a2"],
  ]);
  ctx.fillStyle = g;
  ctx.fillRect(x + w * 0.06, y + h * 0.08, w * 0.88, h * 0.34);
  ctx.fillStyle = "#2f5b3a";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.06, y + h * 0.34);
  ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.24, x + w * 0.55, y + h * 0.36);
  ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.44, x + w * 0.94, y + h * 0.33);
  ctx.lineTo(x + w * 0.94, y + h * 0.42);
  ctx.lineTo(x + w * 0.06, y + h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c8462f";
  ctx.font = `700 ${Math.round(h * 0.075)}px Poppins`;
  ctx.textAlign = "center";
  ctx.fillText("SYAWAL", x + w / 2, y + h * 0.5);
  ctx.fillStyle = "#6b6256";
  const cols = 7;
  const rows = 4;
  const cell = (w * 0.86) / cols;
  ctx.font = `500 ${Math.round(h * 0.045)}px Poppins`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r === 0 && c < 2) || (r === 3 && c > 4)) continue;
      ctx.fillText(String(r * cols + c - 1), x + w * 0.07 + cell * (c + 0.5), y + h * 0.58 + r * cell * 1.15);
    }
  }
  ctx.fillStyle = "#3c3730";
  ctx.font = `600 ${Math.round(h * 0.05)}px Poppins`;
  ctx.textAlign = "left";
  ctx.fillText("Insight", x + w * 0.07, y + h * 0.95);
  ctx.restore();
}

function wallClock(ctx: Ctx, x: number, y: number, r: number, handAngle: number) {
  ctx.save();
  ctx.fillStyle = "#e7e2d6";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a2622";
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(42,38,34,0.5)";
  ctx.lineWidth = Math.max(1, r * 0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * r * 0.72, y - Math.cos(a) * r * 0.72);
    ctx.lineTo(x + Math.sin(a) * r * 0.84, y - Math.cos(a) * r * 0.84);
    ctx.stroke();
  }
  ctx.strokeStyle = "#23201c";
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.sin(handAngle) * r * 0.45, y - Math.cos(handAngle) * r * 0.45);
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.sin(handAngle * 4.4 + 1) * r * 0.62, y - Math.cos(handAngle * 4.4 + 1) * r * 0.62);
  ctx.stroke();
  ctx.restore();
}

function shelf(ctx: Ctx, x: number, y: number, w: number, color: string, seed: number) {
  ctx.fillStyle = shade(color, -0.15);
  ctx.fillRect(x, y, w, 9);
  ctx.fillStyle = rgba("#000", 0.25);
  ctx.fillRect(x, y + 9, w, 6);
  const rnd = mulberry32(seed);
  let cx = x + 12;
  while (cx < x + w - 24) {
    const jarH = 26 + rnd() * 30;
    const jarW = 18 + rnd() * 14;
    ctx.fillStyle = rnd() > 0.5 ? "rgba(220,225,230,0.85)" : "rgba(200,180,150,0.9)";
    roundRect(ctx, cx, y - jarH, jarW, jarH, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(cx + 3, y - jarH + 4, 3, jarH - 8);
    ctx.fillStyle = "#b8482f";
    ctx.fillRect(cx + 3, y - jarH * 0.55, jarW - 6, 6);
    cx += jarW + 12 + rnd() * 8;
  }
}

function table(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, seed: number) {
  const topH = h * 0.08;
  woodSurface(ctx, x, y, w, topH, color, seed);
  ctx.fillStyle = shade(color, -0.4);
  const legW = w * 0.035;
  ctx.fillRect(x + w * 0.06, y + topH, legW, h);
  ctx.fillRect(x + w * 0.9, y + topH, legW, h);
  // lower shelf
  ctx.fillRect(x + w * 0.06, y + h * 0.75, w * 0.88, topH * 0.5);
}

function bottle(ctx: Ctx, x: number, y: number, h: number, color = "rgba(190,225,235,0.75)") {
  ctx.fillStyle = color;
  roundRect(ctx, x - h * 0.13, y - h * 0.72, h * 0.26, h * 0.72, h * 0.08);
  ctx.fill();
  roundRect(ctx, x - h * 0.06, y - h, h * 0.12, h * 0.32, h * 0.03);
  ctx.fill();
  ctx.fillStyle = "#c9b458";
  roundRect(ctx, x - h * 0.07, y - h * 1.02, h * 0.14, h * 0.1, h * 0.02);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(x - h * 0.08, y - h * 0.66, h * 0.045, h * 0.5);
}

function glass(ctx: Ctx, x: number, y: number, h: number) {
  ctx.fillStyle = "rgba(225,235,240,0.55)";
  ctx.beginPath();
  ctx.moveTo(x - h * 0.16, y - h * 0.6);
  ctx.lineTo(x + h * 0.16, y - h * 0.6);
  ctx.lineTo(x + h * 0.12, y);
  ctx.lineTo(x - h * 0.12, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function stool(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = shade(color, -0.25);
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, w * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, -0.1);
  ctx.beginPath();
  ctx.ellipse(x, y - h, w * 0.5, w * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  const legW = w * 0.09;
  for (const dx of [-w * 0.34, 0, w * 0.34]) {
    ctx.fillStyle = shade(color, -0.3);
    ctx.fillRect(x + dx - legW / 2, y - h, legW, h);
  }
}

function hangingLamp(ctx: Ctx, x: number, y: number, scale: number, color: string) {
  ctx.strokeStyle = "#1b1712";
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = shade(color, -0.35);
  ctx.beginPath();
  ctx.moveTo(x - 26 * scale, y + 20 * scale);
  ctx.quadraticCurveTo(x, y - 8 * scale, x + 26 * scale, y + 20 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff4cf";
  ctx.beginPath();
  ctx.ellipse(x, y + 20 * scale, 13 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function buildingRow(
  ctx: Ctx,
  x: number,
  baseY: number,
  w: number,
  h: number,
  color: string,
  seed: number,
  litColor: string,
  night: boolean
) {
  const rnd = mulberry32(seed);
  let cx = x;
  while (cx < x + w) {
    const bw = 90 + rnd() * 150;
    const bh = h * (0.5 + rnd() * 0.5);
    ctx.fillStyle = shade(color, -0.06 + rnd() * 0.12);
    ctx.fillRect(cx, baseY - bh, bw, bh);
    // roofline detail
    ctx.fillStyle = shade(color, -0.18);
    ctx.fillRect(cx, baseY - bh, bw, 6);
    // awnings / shop shutters on the lower floor
    if (bh > 120) {
      ctx.fillStyle = shade(color, night ? -0.3 : -0.14);
      ctx.fillRect(cx + bw * 0.1, baseY - bh * 0.26, bw * 0.8, bh * 0.22);
      ctx.fillStyle = night ? "rgba(255,205,140,0.22)" : "rgba(90,110,130,0.45)";
      ctx.fillRect(cx + bw * 0.14, baseY - bh * 0.24, bw * 0.72, bh * 0.18);
      // shutter slats
      ctx.strokeStyle = rgba("#000", 0.16);
      ctx.lineWidth = 1.4;
      for (let s = 0; s < 8; s++) {
        const sy = baseY - bh * 0.24 + s * (bh * 0.18) / 8;
        ctx.beginPath();
        ctx.moveTo(cx + bw * 0.14, sy);
        ctx.lineTo(cx + bw * 0.86, sy);
        ctx.stroke();
      }
    }
    // upper windows
    const cols = Math.max(2, Math.floor(bw / 46));
    const rows = Math.max(1, Math.floor(bh / 70));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = night ? rnd() > 0.78 : rnd() > 0.95;
        const ww = Math.max(10, bw / cols - 20);
        const wh = Math.max(14, bh / rows - 26);
        const wx = cx + 10 + c * (bw / cols);
        const wy = baseY - bh + 14 + r * (bh / rows);
        if (wy > baseY - bh * 0.32) continue;
        ctx.fillStyle = lit
          ? rgba(litColor, night ? 0.24 + rnd() * 0.22 : 0.32)
          : rgba(night ? "#05070c" : "#5f6a76", night ? 0.55 : 0.3);
        ctx.fillRect(wx, wy, ww, wh);
        if (lit) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, ww * 1.6);
          g.addColorStop(0, rgba(litColor, 0.22));
          g.addColorStop(1, rgba(litColor, 0));
          ctx.fillStyle = g;
          ctx.fillRect(wx - ww, wy - wh, ww * 3, wh * 3);
          ctx.restore();
        }
      }
    }
    cx += bw + 8 + rnd() * 16;
  }
}

function streetLamp(ctx: Ctx, x: number, groundY: number, height: number, color: string) {
  ctx.fillStyle = "#20242b";
  ctx.fillRect(x - 4, groundY - height, 8, height);
  ctx.beginPath();
  ctx.moveTo(x, groundY - height);
  ctx.quadraticCurveTo(x + 30, groundY - height - 6, x + 46, groundY - height + 8);
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#20242b";
  ctx.stroke();
  ctx.fillStyle = "#3a4048";
  roundRect(ctx, x + 40, groundY - height + 6, 22, 12, 5);
  ctx.fill();
  ctx.fillStyle = "#ffd9a0";
  roundRect(ctx, x + 43, groundY - height + 15, 16, 5, 2);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x + 50, groundY - height + 20, 4, x + 50, groundY - height + 20, height * 0.62);
  g.addColorStop(0, rgba(color, 0.42));
  g.addColorStop(0.5, rgba(color, 0.12));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x + 50, groundY - height + 20, height * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* --------------------------------------------------------------------- */
/* Environments                                                           */
/* --------------------------------------------------------------------- */

function interiorRoom(night: boolean): EnvironmentDef {
  const groundY = 1085;
  return {
    key: night ? "rumah_malam" : "rumah_siang",
    groundY,
    horizonY: 760,
    ambientTint: night ? "#f0a35a" : "#ffe0b0",
    ambientAlpha: night ? 0.1 : 0.05,
    lights: (e) => {
      if (!night) return [{ x: 520, y: 180, r: 900, color: "#fff0c0", intensity: 0.45 }];
      return [
        { x: 560, y: 150, r: 620, color: e.palette.lampWarm, intensity: 0.85 },
        { x: 120, y: 620, r: 380, color: "#4c6f9e", intensity: 0.3 },
      ];
    },
    drawStatic: (e) => {
      const { ctx, w, h, palette, seed } = e;
      const wallBottom = 985;
      wallPanel(ctx, -140, -80, w + 280, wallBottom + 80, night ? palette.wall : shade(palette.wall, 0.16), seed);
      // wainscot band
      ctx.fillStyle = night ? shade(palette.wall, -0.28) : shade(palette.wall, -0.12);
      ctx.fillRect(-140, wallBottom - 210, w + 280, 210);
      ctx.fillStyle = rgba("#000", 0.18);
      ctx.fillRect(-140, wallBottom - 212, w + 280, 5);
      // ceiling shadow gradient
      const g = ctx.createLinearGradient(0, 0, 0, 320);
      g.addColorStop(0, night ? "rgba(6,6,8,0.85)" : "rgba(60,45,30,0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-140, 0, w + 280, 320);

      tileFloor(ctx, -140, wallBottom, w + 280, h - wallBottom + 80, night ? shade(palette.floor, -0.1) : palette.floor);

      // door
      door(ctx, 40, 400, 150, wallBottom - 400, night ? shade(palette.wall, -0.45) : "#7a5b41", night ? "#20262f" : "#8fa6b5");

      // calendar
      calendar(ctx, 300, 360, 118, 158);

      // shelf
      shelf(ctx, 520, 540, 210, night ? shade(palette.wall, -0.35) : "#8a6a4c", seed + 3);

      // table with props
      table(ctx, 420, 800, 330, 245, "#c2703a", seed + 11);
      bottle(ctx, 560, 800, 96);
      bottle(ctx, 640, 800, 78, "rgba(210,225,205,0.7)");
      glass(ctx, 600, 800, 48);
      glass(ctx, 690, 800, 40);
      bottle(ctx, 690, 800, 120, "rgba(175,215,225,0.65)");
      ctx.fillStyle = "#8c3b2b";
      roundRect(ctx, 470, 776, 60, 24, 3);
      ctx.fill();

      // stool
      stool(ctx, 340, groundY + 10, 96, 78, "#c87a3f");

      // hanging lamp
      hangingLamp(ctx, 470, night ? 70 : 60, 1.15, night ? palette.lampWarm : "#ffe9b8");

      // wall clock
      wallClock(ctx, 645, 120, 46, 0.5);

      // floor shadow under table
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(590, groundY + 40, 190, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // plant silhouette
      ctx.save();
      ctx.translate(70, groundY - 10);
      ctx.fillStyle = night ? "#2b2419" : "#4a6b3a";
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(0, -40 - i * 22, 26 - i * 2, 16, (i % 2 ? 0.5 : -0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = night ? "#33291c" : "#8a6a4c";
      ctx.fillRect(-24, -34, 48, 44);
      ctx.restore();
    },
    drawDynamic: (e) => {
      const { ctx, t, palette, seed } = e;
      // lamp glow flicker
      const flicker = 0.9 + Math.sin(t * 7.3) * 0.04 + Math.sin(t * 2.1 + 1) * 0.05;
      radialGlow(ctx, 470, 150, 420 * flicker, night ? palette.lampWarm : "#ffe9b8", night ? 0.42 : 0.22);
      // drifting dust motes
      const rnd = mulberry32(seed + 5);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 26; i++) {
        const bx = rnd() * 720;
        const by = rnd() * 900;
        const sp = 6 + rnd() * 14;
        const x = (bx + Math.sin(t * 0.4 + i) * 18) % 720;
        const y = (by - t * sp) % 1000;
        const a = 0.12 + 0.12 * Math.sin(t * 2 + i);
        ctx.fillStyle = `rgba(255,230,180,${Math.max(0, a)})`;
        ctx.beginPath();
        ctx.arc(x, y < 0 ? y + 1000 : y, 1.5 + rnd(), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

function bedroom(): EnvironmentDef {
  const groundY = 1090;
  return {
    key: "kamar_malam",
    groundY,
    horizonY: 800,
    ambientTint: "#5a7dc0",
    ambientAlpha: 0.08,
    lights: () => [
      { x: 470, y: 240, r: 520, color: "#ffca7a", intensity: 0.55 },
      { x: 170, y: 380, r: 300, color: "#6d95d8", intensity: 0.35 },
    ],
    drawStatic: (e) => {
      const { ctx, w, h, palette, seed } = e;
      wallPanel(ctx, -140, -80, w + 280, 1000, shade(palette.wall, -0.34), seed + 21);
      tileFloor(ctx, -140, 990, w + 280, h - 990 + 60, shade(palette.floor, -0.2));
      windowFrame(ctx, 70, 300, 230, 260, "#4a3a2c", true, "rgba(60,72,96,0.9)");
      // rain streaks on window
      ctx.save();
      ctx.globalAlpha = 0.5;
      const rnd = mulberry32(seed);
      for (let i = 0; i < 40; i++) {
        const x = 74 + rnd() * 222;
        const y = 304 + rnd() * 250;
        ctx.strokeStyle = "rgba(200,225,255,0.6)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y + 10 + rnd() * 22);
        ctx.stroke();
      }
      ctx.restore();
      // bed
      ctx.fillStyle = "#3a3f4a";
      roundRect(ctx, 380, 760, 300, 120, 10);
      ctx.fill();
      ctx.fillStyle = "#cfc3ad";
      roundRect(ctx, 370, 720, 310, 70, 14);
      ctx.fill();
      ctx.fillStyle = "#8a9bb5";
      roundRect(ctx, 400, 790, 260, 110, 8);
      ctx.fill();
      ctx.fillStyle = "#f0e9da";
      roundRect(ctx, 390, 690, 120, 60, 14);
      ctx.fill();
      // wardrobe
      ctx.fillStyle = "#493726";
      ctx.fillRect(10, 590, 120, 400);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 600, 42, 380);
      ctx.strokeRect(70, 600, 50, 380);
      // lamp
      ctx.fillStyle = "#d8b06a";
      ctx.beginPath();
      ctx.arc(560, 640, 40, 0, Math.PI * 2);
      ctx.fill();
    },
    drawDynamic: (e) => {
      const { ctx, t, seed } = e;
      const flicker = 0.88 + Math.sin(t * 3.1) * 0.05;
      radialGlow(ctx, 560, 640, 380 * flicker, "#ffca7a", 0.4);
      const rnd = mulberry32(seed + 2);
      ctx.save();
      for (let i = 0; i < 30; i++) {
        const x = 74 + rnd() * 222;
        const speed = 40 + rnd() * 80;
        const y = 304 + ((rnd() * 260 + t * speed) % 260);
        ctx.strokeStyle = "rgba(190,220,255,0.55)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y + 14);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

function porchRain(): EnvironmentDef {
  const groundY = 1100;
  return {
    key: "teras_hujan",
    groundY,
    horizonY: 820,
    ambientTint: "#5f88c4",
    ambientAlpha: 0.14,
    lights: () => [{ x: 360, y: 200, r: 700, color: "#ffd08a", intensity: 0.4 }],
    drawStatic: (e) => {
      const { ctx, w, h, seed, palette } = e;
      // outside rainy night
      const g = verticalGradient(ctx, -80, 900, [
        [0, "#0d1520"],
        [0.6, "#182536"],
        [1, "#22303f"],
      ]);
      ctx.fillStyle = g;
      ctx.fillRect(-140, -80, w + 280, h + 160);
      // distant houses
      buildingRow(ctx, -120, 900, 960, 300, "#1a2431", seed + 4, "#ffcf8a", true);
      // rain haze
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#9fc0e0";
      ctx.fillRect(-140, 0, w + 280, 900);
      ctx.restore();
      // floor of the porch
      tileFloor(ctx, -140, 900, w + 280, h - 900 + 100, shade(palette.floor, -0.28));
      // roof + pillars
      ctx.fillStyle = "#14161b";
      ctx.fillRect(-140, -80, w + 280, 190);
      ctx.fillStyle = "#1b1f26";
      ctx.fillRect(40, 100, 44, 800);
      ctx.fillRect(600, 100, 44, 800);
      // door frame behind
      ctx.fillStyle = "#2a2119";
      ctx.fillRect(250, 380, 220, 520);
      ctx.fillStyle = "#0c0f14";
      ctx.fillRect(272, 400, 176, 500);
      // hanging bulb
      hangingLamp(ctx, 360, 150, 1, "#ffd8a0");
    },
    drawDynamic: (e) => {
      const { ctx, t, seed } = e;
      radialGlow(ctx, 360, 210, 520, "#ffd08a", 0.34 + Math.sin(t * 2.4) * 0.03);
      const rnd = mulberry32(seed + 9);
      ctx.save();
      ctx.strokeStyle = "rgba(180,210,240,0.45)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 120; i++) {
        const bx = rnd() * 900 - 90;
        const speed = 900 + rnd() * 700;
        const len = 26 + rnd() * 34;
        const y = ((rnd() * 1300 + t * speed) % 1400) - 100;
        const x = bx - y * 0.12;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.12, y + len);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

function street(night: boolean): EnvironmentDef {
  const key = night ? "jalan_malam" : "jalan_siang";
  const groundY = 1105;
  return {
    key,
    groundY,
    horizonY: 720,
    ambientTint: night ? "#3f5d94" : "#ffe3b8",
    ambientAlpha: night ? 0.12 : 0.05,
    lights: () =>
      night
        ? [
            { x: 200, y: 560, r: 460, color: "#ffc978", intensity: 0.6 },
            { x: 620, y: 520, r: 380, color: "#ffc978", intensity: 0.45 },
          ]
        : [{ x: 360, y: 120, r: 900, color: "#fff2cc", intensity: 0.3 }],
    drawStatic: (e) => {
      const { ctx, w, h, seed } = e;
      const sky = night
        ? verticalGradient(ctx, -80, 760, [
            [0, "#0a1220"],
            [0.55, "#152238"],
            [1, "#243247"],
          ])
        : verticalGradient(ctx, -80, 760, [
            [0, "#8fb9d8"],
            [0.55, "#c9dced"],
            [1, "#e8ecdf"],
          ]);
      ctx.fillStyle = sky;
      ctx.fillRect(-160, -80, w + 320, 860);
      if (!night) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        radialGlow(ctx, 520, 130, 420, "#fff4d0", 0.5);
        ctx.restore();
      } else {
        // moon
        ctx.fillStyle = "rgba(240,246,255,0.9)";
        ctx.beginPath();
        ctx.arc(590, 120, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        radialGlow(ctx, 590, 120, 160, "#cfe0ff", 0.35);
        ctx.restore();
      }
      buildingRow(ctx, -160, 780, 1040, 400, night ? "#161f2c" : "#c9c3b4", seed + 12, "#ffd08a", night);
      // sidewalk
      ctx.fillStyle = night ? "#2a2c31" : "#b7b2a6";
      ctx.fillRect(-160, 880, w + 320, 120);
      ctx.strokeStyle = rgba("#000", 0.25);
      ctx.lineWidth = 2;
      for (let x = -160; x < w + 160; x += 90) {
        ctx.beginPath();
        ctx.moveTo(x, 880);
        ctx.lineTo(x - 18, 1000);
        ctx.stroke();
      }
      // road
      const road = verticalGradient(ctx, 1000, h + 80, [
        [0, night ? "#1b1d22" : "#7c7a76"],
        [1, night ? "#101216" : "#63625f"],
      ]);
      ctx.fillStyle = road;
      ctx.fillRect(-160, 1000, w + 320, h - 1000 + 120);
      ctx.fillStyle = night ? "rgba(220,210,170,0.5)" : "rgba(255,255,255,0.65)";
      for (let x = -160; x < w + 160; x += 170) {
        ctx.fillRect(x, 1180, 90, 8);
      }
      // puddle reflections
      if (night) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#7ea6d8";
        ctx.beginPath();
        ctx.ellipse(240, 1160, 130, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // power pole + wires
      ctx.strokeStyle = night ? "#0e1218" : "#4b4741";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(96, 1040);
      ctx.lineTo(96, 200);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(96, 260);
      ctx.lineTo(60, 250);
      ctx.moveTo(96, 260);
      ctx.lineTo(140, 252);
      ctx.stroke();
      ctx.strokeStyle = night ? "rgba(10,12,16,0.9)" : "rgba(60,58,54,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-160, 296);
      ctx.bezierCurveTo(200, 420, 460, 250, 880, 320);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-160, 330);
      ctx.bezierCurveTo(220, 460, 500, 286, 880, 356);
      ctx.stroke();
      // street lamps
      streetLamp(ctx, 200, 1010, 470, "#ffc978");
      streetLamp(ctx, 620, 1010, 430, "#ffc978");
      if (night) {
        // warung glow
        ctx.fillStyle = "#2a1e14";
        ctx.fillRect(660, 780, 220, 230);
        ctx.fillStyle = "rgba(255,190,110,0.35)";
        ctx.fillRect(680, 820, 180, 90);
        ctx.fillStyle = "#e8b04a";
        ctx.fillRect(700, 750, 140, 34);
        ctx.fillStyle = "#3b2a1a";
        ctx.font = "700 20px Poppins";
        ctx.textAlign = "center";
        ctx.fillText("WARUNG", 770, 774);
      }
    },
    drawDynamic: (e) => {
      const { ctx, t, seed, weather } = e;
      if (night) {
        radialGlow(ctx, 246, 520, 340, "#ffc978", 0.3 + Math.sin(t * 4.2) * 0.02);
        radialGlow(ctx, 666, 540, 300, "#ffc978", 0.24);
      }
      if (weather === "hujan" || weather === "gerimis" || weather === "badai") {
        const rnd = mulberry32(seed + 31);
        ctx.save();
        ctx.strokeStyle = "rgba(190,215,245,0.4)";
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 140; i++) {
          const bx = rnd() * 1150 - 200;
          const speed = 1000 + rnd() * 700;
          const len = 30 + rnd() * 40;
          const y = ((rnd() * 1400 + t * speed) % 1450) - 100;
          const x = bx - y * 0.1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - len * 0.1, y + len);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
  };
}

function duskCity(): EnvironmentDef {
  const groundY = 1120;
  return {
    key: "kota_senja",
    groundY,
    horizonY: 760,
    ambientTint: "#ff8a4a",
    ambientAlpha: 0.14,
    lights: () => [{ x: 360, y: 620, r: 900, color: "#ff9e5a", intensity: 0.55 }],
    drawStatic: (e) => {
      const { ctx, w, h, seed } = e;
      const sky = verticalGradient(ctx, -80, 900, [
        [0, "#2b1b3a"],
        [0.35, "#7a3350"],
        [0.62, "#d9663f"],
        [1, "#f0a463"],
      ]);
      ctx.fillStyle = sky;
      ctx.fillRect(-160, -80, w + 320, h + 160);
      // sun
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      radialGlow(ctx, 360, 800, 320, "#ffd08a", 0.55);
      ctx.restore();
      ctx.fillStyle = "#ffdca0";
      ctx.beginPath();
      ctx.arc(360, 812, 84, 0, Math.PI * 2);
      ctx.fill();
      // skyline layers
      buildingRow(ctx, -160, 900, 1040, 300, "#3a2338", seed + 31, "#ffb877", true);
      buildingRow(ctx, -160, 980, 1040, 240, "#25182a", seed + 43, "#ffb877", true);
      const road = verticalGradient(ctx, 1000, h + 80, [
        [0, "#241a24"],
        [1, "#150f18"],
      ]);
      ctx.fillStyle = road;
      ctx.fillRect(-160, 1000, w + 320, h - 1000 + 120);
      ctx.strokeStyle = "rgba(255,180,120,0.25)";
      ctx.lineWidth = 3;
      for (let x = -160; x < w + 160; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, 1130);
        ctx.lineTo(x + 40, h + 60);
        ctx.stroke();
      }
    },
    drawDynamic: (e) => {
      const { ctx, t, seed } = e;
      radialGlow(ctx, 360, 812, 420 + Math.sin(t * 0.7) * 20, "#ffb877", 0.22);
      // drifting smog
      const rnd = mulberry32(seed + 8);
      ctx.save();
      ctx.globalAlpha = 0.06;
      for (let i = 0; i < 6; i++) {
        const x = ((rnd() * 900 + t * (8 + i * 4)) % 1100) - 200;
        ctx.fillStyle = "#ffcf9a";
        ctx.beginPath();
        ctx.ellipse(x, 600 + i * 60, 220, 40, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

function mosque(): EnvironmentDef {
  const groundY = 1110;
  return {
    key: "masjid_malam",
    groundY,
    horizonY: 800,
    ambientTint: "#4b6cae",
    ambientAlpha: 0.1,
    lights: () => [
      { x: 380, y: 560, r: 560, color: "#8fd4a8", intensity: 0.45 },
      { x: 360, y: 200, r: 420, color: "#cfe4ff", intensity: 0.3 },
    ],
    drawStatic: (e) => {
      const { ctx, w, h, seed } = e;
      const sky = verticalGradient(ctx, -80, 1000, [
        [0, "#060b18"],
        [0.6, "#0f1c33"],
        [1, "#1b2a44"],
      ]);
      ctx.fillStyle = sky;
      ctx.fillRect(-160, -80, w + 320, h + 160);
      const rnd = mulberry32(seed + 17);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 90; i++) {
        const x = -160 + rnd() * 1040;
        const y = rnd() * 700;
        ctx.globalAlpha = 0.3 + rnd() * 0.6;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      // mosque silhouette
      ctx.fillStyle = "#141c28";
      ctx.fillRect(-160, 780, 1040, 260);
      ctx.beginPath();
      ctx.arc(360, 700, 130, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(230, 700, 260, 90);
      // minarets
      for (const mx of [140, 580]) {
        ctx.fillRect(mx - 22, 380, 44, 420);
        ctx.beginPath();
        ctx.moveTo(mx - 30, 380);
        ctx.quadraticCurveTo(mx, 300, mx + 30, 380);
        ctx.fill();
      }
      // lit arches
      ctx.fillStyle = "rgba(140,220,170,0.5)";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(360 + i * 90, 830, 26, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(360 + i * 90 - 26, 830, 52, 70);
      }
      // ground
      ctx.fillStyle = "#1b222c";
      ctx.fillRect(-160, 980, w + 320, h - 980 + 100);
      ctx.strokeStyle = "rgba(160,190,230,0.12)";
      ctx.lineWidth = 2;
      for (let x = -160; x < w + 160; x += 70) {
        ctx.beginPath();
        ctx.moveTo(x, 980);
        ctx.lineTo(x + 30, h + 40);
        ctx.stroke();
      }
    },
    drawDynamic: (e) => {
      const { ctx, t } = e;
      radialGlow(ctx, 360, 780, 520 + Math.sin(t * 1.1) * 20, "#8fd4a8", 0.2);
      radialGlow(ctx, 360, 170, 300, "#cfe4ff", 0.16);
    },
  };
}

function classroom(): EnvironmentDef {
  const groundY = 1080;
  return {
    key: "sekolah_siang",
    groundY,
    horizonY: 700,
    ambientTint: "#dfeaf6",
    ambientAlpha: 0.05,
    lights: () => [{ x: 380, y: 140, r: 900, color: "#ffffff", intensity: 0.4 }],
    drawStatic: (e) => {
      const { ctx, w, h, seed, palette } = e;
      wallPanel(ctx, -140, -80, w + 280, 1000, shade(palette.wall, 0.34), seed + 51);
      ctx.fillStyle = shade(palette.wall, 0.44);
      ctx.fillRect(-140, 760, w + 280, 240);
      tileFloor(ctx, -140, 990, w + 280, h - 990 + 80, "#b9b09c");
      // blackboard
      ctx.fillStyle = "#3a2c22";
      ctx.fillRect(150, 220, 420, 260);
      ctx.fillStyle = "#25382e";
      ctx.fillRect(164, 234, 392, 232);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(200, 300);
      ctx.lineTo(480, 300);
      ctx.moveTo(200, 340);
      ctx.lineTo(400, 340);
      ctx.stroke();
      // windows
      windowFrame(ctx, 600, 240, 150, 250, "#8a7a66", false);
      // desks
      for (let i = 0; i < 3; i++) {
        const x = 90 + i * 200;
        ctx.fillStyle = "#b98a52";
        ctx.fillRect(x, 900, 150, 18);
        ctx.fillStyle = "#8a6337";
        ctx.fillRect(x + 12, 918, 12, 160);
        ctx.fillRect(x + 126, 918, 12, 160);
      }
    },
    drawDynamic: (e) => {
      const { ctx, t } = e;
      ctx.save();
      ctx.globalAlpha = 0.1 + Math.sin(t * 0.9) * 0.02;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath();
      ctx.moveTo(600, 240);
      ctx.lineTo(750, 240);
      ctx.lineTo(720, 1000);
      ctx.lineTo(420, 1000);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}

function abstractSpace(): EnvironmentDef {
  const groundY = 1120;
  return {
    key: "abstract",
    groundY,
    horizonY: 750,
    ambientTint: "#8899cc",
    ambientAlpha: 0.08,
    lights: () => [{ x: 360, y: 500, r: 800, color: "#8fb4ff", intensity: 0.4 }],
    drawStatic: (e) => {
      const { ctx, w, h, palette } = e;
      const g = verticalGradient(ctx, -80, h + 80, [
        [0, shade(palette.background, -0.35)],
        [0.55, shade(palette.background, -0.1)],
        [1, shade(palette.background, -0.5)],
      ]);
      ctx.fillStyle = g;
      ctx.fillRect(-160, -80, w + 320, h + 160);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        ctx.moveTo(-160, 200 + i * 70);
        ctx.bezierCurveTo(200, 150 + i * 60, 480, 260 + i * 50, w + 160, 180 + i * 70);
        ctx.stroke();
      }
      ctx.restore();
    },
    drawDynamic: (e) => {
      const { ctx, t } = e;
      radialGlow(ctx, 360 + Math.sin(t * 0.3) * 60, 560, 500, "#9ec4ff", 0.25);
    },
  };
}

const REGISTRY: Record<LocationKey, () => EnvironmentDef> = {
  rumah_malam: () => interiorRoom(true),
  rumah_siang: () => interiorRoom(false),
  kamar_malam: bedroom,
  teras_hujan: porchRain,
  jalan_malam: () => street(true),
  jalan_siang: () => street(false),
  kota_senja: duskCity,
  masjid_malam: mosque,
  sekolah_siang: classroom,
  abstract: abstractSpace,
};

const cache = new Map<string, EnvironmentDef>();

export function getEnvironment(key: string): EnvironmentDef {
  const k = (key in REGISTRY ? key : "rumah_malam") as LocationKey;
  if (!cache.has(k)) cache.set(k, REGISTRY[k]());
  return cache.get(k)!;
}

export function resolveLocation(text: string, timeOfDay?: string, fallback?: string): LocationKey {
  const t = (text || "").toLowerCase();
  const night = timeOfDay ? timeOfDay === "malam" : /malam|gelap/.test(t);
  if (/masjid|musala|musholla|surau/.test(t)) return "masjid_malam";
  if (/sekolah|kelas|kantor|ruang kelas/.test(t)) return "sekolah_siang";
  if (/kamar|tidur/.test(t)) return "kamar_malam";
  if (/teras|beranda|porch/.test(t)) return "teras_hujan";
  if (/jalan|kota|pasar|terminal|gang|halte|perjalanan/.test(t)) return night ? "jalan_malam" : "jalan_siang";
  if (/senja|dusk|matahari terbenam/.test(t)) return "kota_senja";
  if (/langit|mimpi|kenangan|abstrak/.test(t)) return "abstract";
  if (/rumah|dapur|ruang tamu|dalam rumah/.test(t)) return night ? "rumah_malam" : "rumah_siang";
  if (fallback && fallback in REGISTRY) return fallback as LocationKey;
  return night ? "rumah_malam" : "rumah_siang";
}

/** Simple staging helper: where characters stand on screen. */
export function stagePositions(count: number, w: number): { x: number; groundY: number }[] {
  const env = 0; // placeholder to keep signature stable
  void env;
  const spread = Math.min(230, w * 0.32);
  const center = w / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: center + (i - (count - 1) / 2) * spread,
    groundY: 0,
  }));
}

export { lerp };
