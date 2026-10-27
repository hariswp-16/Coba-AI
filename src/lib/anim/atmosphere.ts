import { Ctx, rgba, mulberry32, clamp } from "./geometry";

export interface AtmosphereOptions {
  weather?: string;
  timeOfDay?: string;
  t: number;
  seed: number;
  width: number;
  height: number;
  intensity?: number;
}

export function drawRain(ctx: Ctx, o: AtmosphereOptions) {
  const heavy = o.weather === "badai" ? 1.5 : o.weather === "hujan" ? 1 : 0.65;
  const count = Math.round(150 * heavy);
  const rnd = mulberry32(o.seed + 13);
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const baseX = rnd() * (o.width + 300) - 150;
    const speed = (900 + rnd() * 700) * heavy;
    const len = 26 + rnd() * 46;
    const phase = rnd() * 4000;
    const y = ((phase + o.t * speed) % (o.height + 300)) - 150;
    const x = baseX - y * 0.09;
    const alpha = 0.18 + rnd() * 0.3;
    ctx.strokeStyle = `rgba(196,220,248,${alpha})`;
    ctx.lineWidth = 1 + rnd() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.09, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSplashes(ctx: Ctx, o: AtmosphereOptions) {
  if (o.weather !== "hujan" && o.weather !== "badai" && o.weather !== "gerimis") return;
  const rnd = mulberry32(o.seed + 29);
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const x = rnd() * o.width;
    const y = o.height * (0.82 + rnd() * 0.16);
    const cycle = 0.5 + rnd() * 0.5;
    const p = ((o.t + rnd() * 3) % cycle) / cycle;
    const r = 4 + p * 16;
    ctx.strokeStyle = `rgba(200,225,255,${(1 - p) * 0.35})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.24, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFog(ctx: Ctx, o: AtmosphereOptions, color = "#b9cbe0") {
  const rnd = mulberry32(o.seed + 41);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 5; i++) {
    const x = ((rnd() * 1200 + o.t * (6 + i * 3)) % (o.width + 600)) - 300;
    const y = o.height * (0.5 + rnd() * 0.35);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 320);
    g.addColorStop(0, rgba(color, 0.06));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 340, 90, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawDust(ctx: Ctx, o: AtmosphereOptions) {
  const rnd = mulberry32(o.seed + 61);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 40; i++) {
    const bx = rnd() * o.width;
    const by = rnd() * o.height;
    const sp = 4 + rnd() * 16;
    const y = (by - o.t * sp + o.height * 3) % o.height;
    const x = bx + Math.sin(o.t * 0.5 + i) * 12;
    const a = 0.08 + 0.12 * Math.abs(Math.sin(o.t * 1.4 + i));
    ctx.fillStyle = `rgba(255,238,200,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + rnd() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawLightning(ctx: Ctx, o: AtmosphereOptions) {
  if (o.weather !== "badai") return;
  const period = 7.3;
  const t = o.t % period;
  if (t > 0.24) return;
  const intensity = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.16;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = `rgba(210,228,255,${clamp(intensity, 0, 1) * 0.42})`;
  ctx.fillRect(0, 0, o.width, o.height);
  ctx.restore();
}

export function drawAtmosphere(ctx: Ctx, o: AtmosphereOptions) {
  const w = o.weather;
  if (w === "hujan" || w === "badai") {
    drawRain(ctx, o);
    drawSplashes(ctx, o);
    drawFog(ctx, o, "#8ea9c6");
    drawLightning(ctx, o);
  } else if (w === "gerimis") {
    drawRain(ctx, { ...o, intensity: 0.5 });
    drawFog(ctx, o, "#a8bdd4");
  } else if (w === "berkabut") {
    drawFog(ctx, o, "#cfd8e0");
  }
  if (o.timeOfDay === "malam" && w !== "hujan") drawDust(ctx, o);
}
