import { Ctx, clamp, mulberry32, roundRect } from "../geometry";
import { GfxTheme, alpha, mix } from "./theme";

export type MotifId = "city" | "window" | "well" | "door" | "mosque" | "hills" | "lamp" | "sky" | "prism" | "sunset" | "molecules" | "rain" | "cloud" | "evaporation";

export interface MotifQuery {
  location: string;
  timeOfDay: string;
  weather?: string;
  purpose: string;
  seed: number;
}

const RULES: [RegExp, MotifId][] = [
  // science-explainer beats come first: "langit" must not be swallowed by "rumah"
  [/prisma|spektrum|pelangi|warna cahaya|warna-warna|gelombang|panjang/, "prism"],
  [/senja|terbenam|terbit|ufuk|horison|cakrawala/, "sunset"],
  [/hujan|gerimis|badai|deras|turun/, "rain"],
  [/awan|mengembun|embun|titik air|kabut/, "cloud"],
  [/menguap|uap|laut|samudra|danau|permukaan air/, "evaporation"],
  [/molekul|nitrogen|oksigen|partikel|debu|udara/, "molecules"],
  [/langit|atmosfer|atmosfir|matahari|sinar|hambur|foton|angkasa|cahaya/, "sky"],
  [/sumur|timba|perigi|ember/, "well"],
  [/pintu|koridor|lorong|gerbang|gudang/, "door"],
  [/masjid|musala|musholla|surau|kubah|pengajian/, "mosque"],
  [/jendela|teras|balkon/, "window"],
  [/kamar|dapur|ruang tamu|dalam rumah|kasur|lampu|meja|kursi|rumah|ruang/, "lamp"],
  [/kota|jalan|gang|pasar|terminal|stasiun|trotoar|bus|angkot/, "city"],
  [/sawah|ladang|hutan|bukit|gunung|pantai|taman|sekolah|lapangan|kebun|halaman|makam|kuburan/, "hills"],
];

/**
 * Illustrations that fit a scene, best match first.
 *
 * A story often puts several scenes in the same kind of place ("rumah tua",
 * "kamar", "dalam rumah"), so returning a single best match made every shot
 * look identical. The planner below walks this list instead of being stuck on
 * the first entry.
 */
/**
 * Shot that can follow another without breaking the sense of place. Coming out
 * of a room, the next beat can be the doorway or the street; it should not
 * suddenly be a hillside three villages away.
 */
const SCIENCE: MotifId[] = ["sky", "molecules", "prism", "sunset", "rain", "cloud", "evaporation"];

const VARIETY: Record<MotifId, MotifId[]> = {
  rain: ["cloud", "evaporation", "sky"],
  cloud: ["rain", "evaporation", "sky"],
  evaporation: ["cloud", "rain", "sky"],
  sky: ["molecules", "prism", "sunset"],
  molecules: ["sky", "prism", "sunset"],
  prism: ["sky", "molecules", "sunset"],
  sunset: ["sky", "molecules"],
  window: ["lamp", "door", "city"],
  lamp: ["door", "window"],
  door: ["lamp", "window", "city"],
  city: ["window", "hills"],
  hills: ["city", "well"],
  well: ["hills", "mosque"],
  mosque: ["city", "door"],
};

export function motifCandidates(q: MotifQuery): MotifId[] {
  const text = q.location.toLowerCase();
  const matches: MotifId[] = [];
  for (const [re, motif] of RULES) {
    if (re.test(text) && !matches.includes(motif)) matches.push(motif);
  }
  const fallback: MotifId[] = q.timeOfDay === "malam" ? ["city", "hills"] : ["hills", "city"];
  if (q.weather === "hujan" || q.weather === "badai" || q.weather === "gerimis") fallback.unshift("window");
  if (!matches.length) matches.push(fallback[0]);
  // A scene about the atmosphere must not cut to a random hillside just to
  // avoid a repeat: keep the explainer beats inside their own cluster.
  if (SCIENCE.includes(matches[0])) {
    const science = [matches[0], ...VARIETY[matches[0]].filter((m) => SCIENCE.includes(m)), ...SCIENCE];
    return science.filter((m, i) => science.indexOf(m) === i);
  }
  const ordered = [
    ...matches,
    // adjacent shots inside the same world, only used when a repeat must be avoided
    ...(VARIETY[matches[0]] ?? []),
    ...fallback,
    ...(["window", "lamp", "door", "well", "mosque", "hills", "city", "sky"] as MotifId[]),
  ];
  return ordered.filter((m, i) => ordered.indexOf(m) === i);
}

/** Picks the illustration that best matches where the scene happens. */
export function resolveMotif(q: MotifQuery): MotifId {
  return motifCandidates(q)[0];
}

/**
 * Assigns a motif to every scene of a story, preferring the best match but
 * never repeating the previous shot's illustration when a decent alternative
 * exists. Deterministic: the same story always produces the same plan.
 */
export function planMotifs(queries: MotifQuery[]): MotifId[] {
  const plan: MotifId[] = [];
  const used = new Map<MotifId, number>();
  let previous: MotifId | null = null;
  queries.forEach((q, i) => {
    const candidates = motifCandidates(q);
    // Score each candidate by how well it fits (list order), how often it has
    // already been used, and whether it repeats the shot we just left. A story
    // set entirely inside one house therefore still cuts between the window,
    // the doorway and the street instead of showing the same drawing 4 times.
    let best = candidates[0];
    let bestScore = -Infinity;
    candidates.forEach((m, rank) => {
      let recency = 0;
      for (let back = 1; back <= 4 && back <= plan.length; back++) {
        if (plan[plan.length - back] !== m) continue;
        recency += back === 1 ? 100 : 14 / back;
      }
      // Explainers have a small vocabulary of shots (sky, molecules, prism,
      // sunset). Rank has to dominate there, otherwise the planner keeps
      // cutting to the wrong illustration only to dodge a repeat.
      const science = SCIENCE.includes(candidates[0]);
      const score = science
        ? -rank * 3 - (used.get(m) ?? 0) * 0.8 - recency * 0.15
        : -rank * 1.6 - (used.get(m) ?? 0) * 1.2 - recency;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    });
    plan.push(best);
    used.set(best, (used.get(best) ?? 0) + 1);
    previous = best;
    void i;
  });
  return plan;
}

export interface MotifOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  /** seconds since the scene started */
  t: number;
  /** scene progress 0..1 */
  p: number;
  seed: number;
  theme: GfxTheme;
  weather?: string;
  timeOfDay: string;
}

const isWet = (w?: string) => w === "hujan" || w === "badai" || w === "gerimis";

/* ------------------------------------------------------------------ */
/* shared primitives                                                    */
/* ------------------------------------------------------------------ */

function sky(ctx: Ctx, o: MotifOpts, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(o.x, o.y, o.w, o.h);
}

function stars(ctx: Ctx, o: MotifOpts, count = 46) {
  const rnd = mulberry32(o.seed ^ 0x9e37);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = o.x + rnd() * o.w;
    const y = o.y + rnd() * o.h * 0.6;
    const base = 0.18 + rnd() * 0.5;
    const twinkle = 0.55 + 0.45 * Math.sin(o.t * (0.6 + rnd()) + rnd() * 6.28);
    const r = (0.6 + rnd() * 1.1) * (o.w / 608);
    ctx.fillStyle = alpha("#FFFFFF", base * twinkle);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function moon(ctx: Ctx, o: MotifOpts, cx: number, cy: number, r: number, color: string, glow = 0.5) {
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 5);
  g.addColorStop(0, alpha(color, 0.42 * glow));
  g.addColorStop(0.45, alpha(color, 0.12 * glow));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // soft crater so it is not a flat disc
  ctx.fillStyle = alpha(mix(color, "#000000", 0.25), 0.35);
  ctx.beginPath();
  ctx.arc(cx - r * 0.28, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.3, cy + r * 0.26, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function rainLines(ctx: Ctx, o: MotifOpts, count = 90, opacity = 0.3) {
  const rnd = mulberry32(o.seed + 7);
  ctx.save();
  ctx.strokeStyle = alpha("#CFE2FF", opacity);
  ctx.lineWidth = Math.max(1, o.w * 0.0022);
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const speed = 520 + rnd() * 420;
    const len = o.h * (0.05 + rnd() * 0.09);
    const x0 = o.x - o.w * 0.1 + rnd() * o.w * 1.2;
    const y = o.y + ((rnd() * o.h + o.t * speed) % (o.h + o.h * 0.3)) - o.h * 0.15;
    const drift = len * 0.16;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 - drift, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

function ground(ctx: Ctx, o: MotifOpts, y: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, y, 0, o.y + o.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(o.x, y, o.w, o.y + o.h - y);
}

/** Deterministic skyline of flat blocks. */
function skyline(
  ctx: Ctx,
  o: MotifOpts,
  baseline: number,
  opts: { count: number; minH: number; maxH: number; color: string; lit?: { color: string; density: number }; seed: number; fade?: number }
) {
  const rnd = mulberry32(opts.seed);
  const slot = o.w / opts.count;
  for (let i = 0; i < opts.count; i++) {
    const bw = slot * (0.62 + rnd() * 0.3);
    const bh = o.h * (opts.minH + rnd() * (opts.maxH - opts.minH));
    const x = o.x + i * slot + (slot - bw) / 2;
    const y = baseline - bh;
    ctx.fillStyle = opts.color;
    ctx.fillRect(x, y, bw, bh);
    if (rnd() > 0.78) {
      // roof tank / antenna, a small detail that sells the silhouette
      ctx.fillRect(x + bw * 0.2, y - bh * 0.1, bw * 0.28, bh * 0.1);
    }
    if (opts.lit) {
      const cols = Math.max(2, Math.floor(bw / (o.w * 0.026)));
      const rows = Math.max(2, Math.floor(bh / (o.h * 0.045)));
      const cw = bw / (cols * 1.9);
      const rh = bh / (rows * 2.1);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rnd() > opts.lit.density) continue;
          const phase = rnd() * 6.28;
          const flicker = 0.72 + 0.28 * Math.sin(o.t * 0.7 + phase);
          ctx.fillStyle = alpha(opts.lit.color, 0.55 * flicker);
          ctx.fillRect(x + cw * (0.7 + c * 1.9), y + rh * (0.9 + r * 2.1), cw, rh);
        }
      }
    }
  }
}

function fireflies(ctx: Ctx, o: MotifOpts, count = 9, color = "#FFE9A8") {
  const rnd = mulberry32(o.seed + 31);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const phase = rnd() * 6.28;
    const speed = 0.4 + rnd() * 0.7;
    const cx = o.x + o.w * (0.12 + rnd() * 0.76) + Math.sin(o.t * speed + phase) * o.w * 0.05;
    const cy = o.y + o.h * (0.4 + rnd() * 0.42) + Math.cos(o.t * speed * 0.8 + phase) * o.h * 0.035;
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(o.t * 1.9 + phase));
    const r = o.w * 0.006 * (0.7 + rnd() * 0.8);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 7);
    g.addColorStop(0, alpha(color, 0.55 * pulse));
    g.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = alpha(color, 0.9 * pulse);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* motifs                                                               */
/* ------------------------------------------------------------------ */

function drawCity(ctx: Ctx, o: MotifOpts) {
  const night = o.timeOfDay === "malam";
  const top = night ? mix(o.theme.plate, "#050A12", 0.55) : mix("#BFD7E8", o.theme.plate, 0.35);
  const bottom = night ? mix(o.theme.plate, o.theme.warm, 0.12) : mix("#F0D7B4", o.theme.plate, 0.3);
  sky(ctx, o, top, bottom);
  if (night) {
    stars(ctx, o, 60);
    moon(ctx, o, o.x + o.w * 0.79, o.y + o.h * 0.18, o.w * 0.055, alpha(o.theme.warm, 0.92), 0.8);
  } else {
    moon(ctx, o, o.x + o.w * 0.76, o.y + o.h * 0.2, o.w * 0.075, alpha("#FFE7B0", 0.95), 0.7);
  }

  const drift = Math.sin(o.t * 0.28) * o.w * 0.012;
  ctx.save();
  ctx.translate(drift * 0.4, 0);
  skyline(ctx, o, o.y + o.h * 0.74, {
    count: 13,
    minH: 0.16,
    maxH: 0.34,
    color: night ? alpha(mix(o.theme.plate, o.theme.base, 0.45), 0.9) : "#9DBBD1",
    seed: o.seed + 3,
  });
  ctx.restore();

  ctx.save();
  ctx.translate(drift, 0);
  skyline(ctx, o, o.y + o.h * 0.8, {
    count: 9,
    minH: 0.22,
    maxH: 0.44,
    color: night ? mix(o.theme.plate, o.theme.base, 0.22) : "#2E5A75",
    lit: { color: o.theme.warm, density: 0.42 },
    seed: o.seed + 11,
    fade: 0.2,
  });
  ctx.restore();

  // street
  const road = o.y + o.h * 0.8;
  ground(ctx, o, road, mix(o.theme.base, "#000000", 0.25), mix(o.theme.base, "#000000", 0.55));
  ctx.save();
  const laneW = o.w * 0.11;
  const shift = ((o.t * 26) % (laneW * 2)) - laneW;
  ctx.fillStyle = alpha(o.theme.warm, 0.35);
  for (let x = o.x - laneW; x < o.x + o.w + laneW; x += laneW * 2) {
    ctx.fillRect(x + shift, road + o.h * 0.11, laneW, Math.max(2, o.h * 0.007));
  }
  ctx.restore();

  // street lamp with a soft cone
  const lx = o.x + o.w * 0.16;
  const ly = o.y + o.h * 0.52;
  ctx.strokeStyle = alpha(o.theme.mute, 0.8);
  ctx.lineWidth = Math.max(2, o.w * 0.006);
  ctx.beginPath();
  ctx.moveTo(lx, road + o.h * 0.02);
  ctx.lineTo(lx, ly);
  ctx.lineTo(lx + o.w * 0.05, ly);
  ctx.stroke();
  const glowA = 0.5 + 0.06 * Math.sin(o.t * 2.4);
  const cone = ctx.createRadialGradient(lx + o.w * 0.05, ly, 1, lx + o.w * 0.05, ly, o.h * 0.34);
  cone.addColorStop(0, alpha(o.theme.warm, 0.5 * glowA));
  cone.addColorStop(0.35, alpha(o.theme.warm, 0.16 * glowA));
  cone.addColorStop(1, alpha(o.theme.warm, 0));
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(lx + o.w * 0.05, ly);
  ctx.lineTo(lx + o.w * 0.05 - o.h * 0.19, road + o.h * 0.06);
  ctx.lineTo(lx + o.w * 0.05 + o.h * 0.19, road + o.h * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = alpha(o.theme.warm, 0.95);
  ctx.beginPath();
  ctx.arc(lx + o.w * 0.05, ly, o.w * 0.012, 0, Math.PI * 2);
  ctx.fill();

  if (isWet(o.weather)) rainLines(ctx, o, 110, 0.26);
}

function drawWindow(ctx: Ctx, o: MotifOpts) {
  const night = o.timeOfDay === "malam";
  const wallTop = night ? mix(o.theme.plate, "#1B120C", 0.5) : mix("#E7DAC4", o.theme.plate, 0.3);
  const wallBottom = night ? mix(o.theme.plate, "#0B0806", 0.6) : mix("#D8C6A9", o.theme.plate, 0.35);
  sky(ctx, o, wallTop, wallBottom);

  // window opening
  const wx = o.x + o.w * 0.17;
  const wy = o.y + o.h * 0.16;
  const ww = o.w * 0.66;
  const wh = o.h * 0.47;

  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();
  const outsideTop = night ? mix("#0A1526", o.theme.plate, 0.2) : "#9CC7E4";
  const outsideBottom = night ? mix("#243546", o.theme.warm, 0.18) : "#E9D9BE";
  const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
  g.addColorStop(0, outsideTop);
  g.addColorStop(1, outsideBottom);
  ctx.fillStyle = g;
  ctx.fillRect(wx, wy, ww, wh);
  if (night) {
    stars(ctx, o, 24);
    moon(ctx, o, wx + ww * 0.74, wy + wh * 0.24, o.w * 0.035, alpha("#FFEBCB", 0.9), 0.55);
    skyline(ctx, o, wy + wh * 0.94, {
      count: 7,
      minH: 0.05,
      maxH: 0.14,
      color: alpha(mix(o.theme.base, "#000000", 0.2), 0.95),
      lit: { color: o.theme.warm, density: 0.3 },
      seed: o.seed + 5,
    });
  }
  if (isWet(o.weather) || night) rainLines(ctx, { ...o, y: wy, h: wh }, isWet(o.weather) ? 70 : 26, isWet(o.weather) ? 0.3 : 0.12);
  // glass sheen
  const sheen = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
  sheen.addColorStop(0, alpha("#FFFFFF", 0.1));
  sheen.addColorStop(0.45, alpha("#FFFFFF", 0));
  sheen.addColorStop(1, alpha("#FFFFFF", 0.06));
  ctx.fillStyle = sheen;
  ctx.fillRect(wx, wy, ww, wh);
  ctx.restore();

  // frame + mullions
  ctx.strokeStyle = mix(o.theme.base, "#000000", 0.15);
  ctx.lineWidth = Math.max(4, o.w * 0.018);
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.lineWidth = Math.max(2, o.w * 0.008);
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2);
  ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();
  // sill
  ctx.fillStyle = mix(o.theme.plate, "#FFFFFF", night ? 0.06 : 0.25);
  ctx.fillRect(wx - o.w * 0.02, wy + wh, ww + o.w * 0.04, o.h * 0.02);

  // curtains swaying very slightly
  const sway = Math.sin(o.t * 0.6) * o.w * 0.006;
  ctx.fillStyle = alpha(mix(o.theme.warm, o.theme.base, 0.62), 0.92);
  for (const side of [-1, 1] as const) {
    const edge = side < 0 ? wx : wx + ww;
    ctx.beginPath();
    ctx.moveTo(edge, wy - o.h * 0.03);
    ctx.quadraticCurveTo(edge + side * o.w * 0.1 + sway, wy + wh * 0.5, edge + side * o.w * 0.06 + sway, wy + wh + o.h * 0.06);
    ctx.lineTo(edge - side * o.w * 0.02, wy + wh + o.h * 0.06);
    ctx.quadraticCurveTo(edge + side * o.w * 0.03, wy + wh * 0.5, edge - side * o.w * 0.02, wy - o.h * 0.03);
    ctx.closePath();
    ctx.fill();
  }

  // lamp bottom-right
  const lx = o.x + o.w * 0.84;
  const ly = o.y + o.h * 0.72;
  const lamp = ctx.createRadialGradient(lx, ly, 1, lx, ly, o.w * 0.42);
  lamp.addColorStop(0, alpha(o.theme.warm, night ? 0.5 : 0.28));
  lamp.addColorStop(1, alpha(o.theme.warm, 0));
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(lx, ly, o.w * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = alpha(o.theme.warm, 0.95);
  ctx.beginPath();
  ctx.arc(lx, ly, o.w * 0.022, 0, Math.PI * 2);
  ctx.fill();

  // table edge with a cup, a quiet foreground anchor
  const tableY = o.y + o.h * 0.87;
  ctx.fillStyle = mix(o.theme.plate, "#000000", 0.12);
  ctx.fillRect(o.x, tableY, o.w, o.h - (tableY - o.y));
  ctx.fillStyle = alpha(o.theme.mute, 0.55);
  roundRect(ctx, o.x + o.w * 0.2, tableY - o.h * 0.05, o.w * 0.09, o.h * 0.05, o.w * 0.008);
  ctx.fill();
  if (night) fireflies(ctx, o, 5, alpha(o.theme.warm, 0.9));
}

function drawWell(ctx: Ctx, o: MotifOpts) {
  const night = o.timeOfDay === "malam";
  sky(ctx, o, night ? mix(o.theme.plate, "#07101C", 0.5) : mix("#A9CBE0", o.theme.plate, 0.3), night ? mix(o.theme.plate, o.theme.warm, 0.1) : mix("#EAD9BB", o.theme.plate, 0.3));
  if (night) {
    stars(ctx, o, 55);
    moon(ctx, o, o.x + o.w * 0.22, o.y + o.h * 0.16, o.w * 0.05, alpha("#FFEFD0", 0.9), 0.7);
  }
  // hills
  const hillY = o.y + o.h * 0.62;
  for (const [i, color] of [
    [0, alpha(mix(o.theme.plate, o.theme.base, 0.3), 0.9)],
    [1, mix(o.theme.plate, o.theme.base, 0.12)],
  ] as [number, string][]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y + o.h);
    ctx.lineTo(o.x, hillY + o.h * (0.03 + i * 0.05));
    ctx.quadraticCurveTo(o.x + o.w * 0.3, hillY - o.h * (0.08 - i * 0.04), o.x + o.w * 0.55, hillY + o.h * (0.02 + i * 0.02));
    ctx.quadraticCurveTo(o.x + o.w * 0.8, hillY + o.h * (0.06 + i * 0.02), o.x + o.w, hillY - o.h * 0.02);
    ctx.lineTo(o.x + o.w, o.y + o.h);
    ctx.closePath();
    ctx.fill();
  }

  const cx = o.x + o.w * 0.52;
  const topY = o.y + o.h * 0.66;
  const bodyW = o.w * 0.44;
  const bodyH = o.h * 0.26;

  // roof beams
  ctx.strokeStyle = alpha(mix(o.theme.plate, "#000000", 0.3), 0.95);
  ctx.lineWidth = Math.max(4, o.w * 0.016);
  ctx.beginPath();
  ctx.moveTo(cx - bodyW * 0.62, topY - o.h * 0.02);
  ctx.lineTo(cx, topY - o.h * 0.24);
  ctx.lineTo(cx + bodyW * 0.62, topY - o.h * 0.02);
  ctx.stroke();

  // well body
  const bodyTop = topY;
  const bodyBottom = topY + bodyH;
  const bg = ctx.createLinearGradient(cx - bodyW / 2, 0, cx + bodyW / 2, 0);
  bg.addColorStop(0, mix(o.theme.plate, "#000000", 0.28));
  bg.addColorStop(0.45, mix(o.theme.plate, "#FFFFFF", 0.1));
  bg.addColorStop(1, mix(o.theme.plate, "#000000", 0.36));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(cx - bodyW * 0.5, bodyTop);
  ctx.lineTo(cx - bodyW * 0.44, bodyBottom);
  ctx.lineTo(cx + bodyW * 0.44, bodyBottom);
  ctx.lineTo(cx + bodyW * 0.5, bodyTop);
  ctx.closePath();
  ctx.fill();
  // stone courses
  ctx.strokeStyle = alpha("#000000", 0.18);
  ctx.lineWidth = Math.max(1, o.w * 0.003);
  for (let i = 1; i < 5; i++) {
    const y = bodyTop + (bodyH * i) / 5;
    const inset = bodyW * 0.44 * ((i / 5) * 0.14);
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.5 + inset, y);
    ctx.lineTo(cx + bodyW * 0.5 - inset, y);
    ctx.stroke();
  }
  // rim
  ctx.fillStyle = mix(o.theme.plate, "#FFFFFF", 0.16);
  ctx.beginPath();
  ctx.ellipse(cx, bodyTop, bodyW * 0.5, o.h * 0.028, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = alpha("#000000", 0.55);
  ctx.beginPath();
  ctx.ellipse(cx, bodyTop + o.h * 0.004, bodyW * 0.4, o.h * 0.017, 0, 0, Math.PI * 2);
  ctx.fill();

  // rope + bucket, gently swinging
  const pivotX = cx;
  const pivotY = topY - o.h * 0.24;
  const swing = Math.sin(o.t * 0.9) * 0.07;
  const ropeLen = o.h * 0.2;
  const bx = pivotX + Math.sin(swing) * ropeLen;
  const by = pivotY + Math.cos(swing) * ropeLen;
  ctx.strokeStyle = alpha("#000000", 0.5);
  ctx.lineWidth = Math.max(1.5, o.w * 0.004);
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(swing);
  ctx.fillStyle = mix(o.theme.warm, o.theme.plate, 0.25);
  ctx.beginPath();
  ctx.moveTo(-o.w * 0.032, 0);
  ctx.lineTo(o.w * 0.032, 0);
  ctx.lineTo(o.w * 0.024, o.h * 0.045);
  ctx.lineTo(-o.w * 0.024, o.h * 0.045);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = alpha("#000000", 0.35);
  ctx.lineWidth = Math.max(1, o.w * 0.003);
  ctx.beginPath();
  ctx.moveTo(-o.w * 0.034, -o.h * 0.004);
  ctx.lineTo(o.w * 0.034, -o.h * 0.004);
  ctx.stroke();
  ctx.restore();

  // grass tufts
  ctx.strokeStyle = alpha(mix(o.theme.plate, "#000000", 0.1), 0.55);
  ctx.lineWidth = Math.max(1, o.w * 0.0032);
  const rnd = mulberry32(o.seed + 17);
  for (let i = 0; i < 26; i++) {
    const gx = o.x + rnd() * o.w;
    const gy = o.y + o.h * (0.9 + rnd() * 0.09);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + o.w * 0.006, gy - o.h * 0.03, gx + o.w * 0.014, gy - o.h * 0.045);
    ctx.stroke();
  }
  if (night) fireflies(ctx, o, 11);
}

function drawDoor(ctx: Ctx, o: MotifOpts) {
  const night = o.timeOfDay === "malam";
  sky(ctx, o, night ? mix(o.theme.plate, "#0A0C12", 0.55) : mix("#DED0B9", o.theme.plate, 0.4), night ? mix(o.theme.plate, "#05070A", 0.7) : mix("#BFB09B", o.theme.plate, 0.5));

  // corridor perspective
  const vanish = { x: o.x + o.w * 0.52, y: o.y + o.h * 0.42 };
  ctx.strokeStyle = alpha(o.theme.ink, 0.1);
  ctx.lineWidth = Math.max(1, o.w * 0.0025);
  for (const corner of [
    [o.x, o.y],
    [o.x + o.w, o.y],
    [o.x, o.y + o.h],
    [o.x + o.w, o.y + o.h],
  ]) {
    ctx.beginPath();
    ctx.moveTo(vanish.x, vanish.y);
    ctx.lineTo(corner[0], corner[1]);
    ctx.stroke();
  }
  // back wall
  ctx.fillStyle = mix(o.theme.plate, "#000000", 0.1);
  ctx.fillRect(o.x + o.w * 0.3, o.y + o.h * 0.24, o.w * 0.42, o.h * 0.5);

  // door with light spill
  const dx = o.x + o.w * 0.38;
  const dy = o.y + o.h * 0.3;
  const dw = o.w * o.h > 0 ? o.w * 0.26 : 1;
  const dh = o.h * 0.44;
  const open = 0.5 + 0.5 * Math.sin(o.t * 0.5); // slow, breathing light
  const spill = ctx.createLinearGradient(dx, dy, dx, o.y + o.h);
  spill.addColorStop(0, alpha(o.theme.warm, 0.5 + 0.12 * open));
  spill.addColorStop(0.5, alpha(o.theme.warm, 0.16));
  spill.addColorStop(1, alpha(o.theme.warm, 0));
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.moveTo(dx, dy + dh);
  ctx.lineTo(dx + dw, dy + dh);
  ctx.lineTo(dx + dw * 3.4, o.y + o.h);
  ctx.lineTo(dx - dw * 2.4, o.y + o.h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = mix(o.theme.warm, "#000000", 0.55);
  ctx.fillRect(dx, dy, dw, dh);
  ctx.fillStyle = alpha(o.theme.warm, 0.5);
  ctx.fillRect(dx + dw * 0.1, dy + dh * 0.08, dw * 0.8, dh * 0.12);
  ctx.strokeStyle = alpha("#000000", 0.4);
  ctx.lineWidth = Math.max(3, o.w * 0.01);
  ctx.strokeRect(dx, dy, dw, dh);
  ctx.fillStyle = alpha(o.theme.warm, 0.95);
  ctx.beginPath();
  ctx.arc(dx + dw * 0.85, dy + dh * 0.55, o.w * 0.011, 0, Math.PI * 2);
  ctx.fill();

  // sconces
  for (const side of [0.2, 0.82]) {
    const sx = o.x + o.w * side;
    const sy = o.y + o.h * 0.3;
    const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, o.w * 0.2);
    g.addColorStop(0, alpha(o.theme.warm, 0.42));
    g.addColorStop(1, alpha(o.theme.warm, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, o.w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = alpha(o.theme.warm, 0.9);
    ctx.beginPath();
    ctx.arc(sx, sy, o.w * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }

  // dust motes
  const rnd = mulberry32(o.seed + 23);
  for (let i = 0; i < 18; i++) {
    const bx = o.x + rnd() * o.w;
    const by = o.y + o.h * (0.4 + rnd() * 0.5);
    const rise = ((o.t * (8 + rnd() * 12) + rnd() * 200) % (o.h * 0.35));
    ctx.fillStyle = alpha("#FFFFFF", 0.08 + rnd() * 0.12);
    ctx.beginPath();
    ctx.arc(bx + Math.sin(o.t * 0.5 + i) * o.w * 0.01, by - rise, Math.max(1, o.w * 0.0035), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMosque(ctx: Ctx, o: MotifOpts) {
  const night = o.timeOfDay === "malam";
  sky(ctx, o, night ? mix("#0B1A2A", o.theme.plate, 0.35) : mix("#BFD9E6", o.theme.plate, 0.25), night ? mix("#233345", o.theme.warm, 0.14) : mix("#EFD9B4", o.theme.plate, 0.3));
  if (night) stars(ctx, o, 60);
  // crescent
  const cx = o.x + o.w * 0.78;
  const cy = o.y + o.h * 0.17;
  const r = o.w * 0.055;
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 4);
  glow.addColorStop(0, alpha(o.theme.warm, 0.32));
  glow.addColorStop(1, alpha(o.theme.warm, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = alpha("#FFEFD2", 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx + r * 0.42, cy - r * 0.2, r * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const baseY = o.y + o.h * 0.82;
  const body = mix(o.theme.plate, "#000000", 0.12);
  // main hall
  const hx = o.x + o.w * 0.24;
  const hw = o.w * 0.5;
  const hh = o.h * 0.2;
  ctx.fillStyle = body;
  ctx.fillRect(hx, baseY - hh, hw, hh);
  // dome
  ctx.beginPath();
  ctx.ellipse(hx + hw / 2, baseY - hh, hw * 0.34, o.h * 0.14, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(hx + hw / 2 - hw * 0.34, baseY - hh - o.h * 0.012, hw * 0.68, o.h * 0.014);
  // finial
  ctx.fillStyle = alpha(o.theme.warm, 0.9);
  ctx.beginPath();
  ctx.arc(hx + hw / 2, baseY - hh - o.h * 0.155, o.w * 0.011, 0, Math.PI * 2);
  ctx.fill();
  // arches
  ctx.fillStyle = alpha(o.theme.warm, night ? 0.5 : 0.3);
  for (let i = 0; i < 3; i++) {
    const ax = hx + hw * (0.18 + i * 0.26);
    const ah = hh * 0.5;
    ctx.beginPath();
    ctx.moveTo(ax - hw * 0.07, baseY);
    ctx.lineTo(ax - hw * 0.07, baseY - ah);
    ctx.quadraticCurveTo(ax, baseY - ah - hh * 0.25, ax + hw * 0.07, baseY - ah);
    ctx.lineTo(ax + hw * 0.07, baseY);
    ctx.closePath();
    ctx.fill();
  }
  // minaret
  const mx = o.x + o.w * 0.16;
  const mh = o.h * 0.42;
  ctx.fillStyle = body;
  ctx.fillRect(mx - o.w * 0.035, baseY - mh, o.w * 0.07, mh);
  ctx.beginPath();
  ctx.ellipse(mx, baseY - mh, o.w * 0.045, o.h * 0.035, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(mx - o.w * 0.012, baseY - mh - o.h * 0.05, o.w * 0.024, o.h * 0.03);
  ctx.fillStyle = alpha(o.theme.warm, 0.9);
  ctx.beginPath();
  ctx.arc(mx, baseY - mh - o.h * 0.055, o.w * 0.009, 0, Math.PI * 2);
  ctx.fill();

  ground(ctx, o, baseY, mix(o.theme.base, "#000000", 0.12), mix(o.theme.base, "#000000", 0.4));
  // palms
  for (const [px, scale] of [
    [0.86, 0.9],
    [0.93, 0.7],
  ] as [number, number][]) {
    const x = o.x + o.w * px;
    const top = baseY - o.h * 0.26 * scale;
    ctx.strokeStyle = alpha(mix(o.theme.base, "#000000", 0.25), 0.95);
    ctx.lineWidth = Math.max(2, o.w * 0.008);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + o.w * 0.01, baseY - o.h * 0.12 * scale, x, top);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, o.w * 0.006);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42 + Math.sin(o.t * 0.6 + i) * 0.03;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.quadraticCurveTo(
        x + Math.cos(a) * o.w * 0.06,
        top + Math.sin(a) * o.h * 0.05,
        x + Math.cos(a) * o.w * 0.11,
        top + Math.sin(a) * o.h * 0.02 + o.h * 0.05
      );
      ctx.stroke();
    }
  }
  if (night) fireflies(ctx, o, 6, "#CFE0FF");
}

function drawHills(ctx: Ctx, o: MotifOpts) {
  const night = o.timeOfDay === "malam";
  const sunset = o.timeOfDay === "sore";
  const day = !night && !sunset;
  const top = night ? mix("#111B2C", o.theme.plate, 0.4) : sunset ? mix("#F3B27A", o.theme.plate, 0.25) : "#9CCFE6";
  const bottom = night ? mix("#22303F", o.theme.warm, 0.12) : sunset ? "#F7D9A8" : "#F3E6C8";
  sky(ctx, o, top, bottom);
  if (night) stars(ctx, o, 46);
  const sunX = o.x + o.w * 0.72;
  const sunY = o.y + o.h * (sunset ? 0.46 : 0.22);
  moon(ctx, o, sunX, sunY, o.w * (sunset ? 0.085 : 0.06), night ? "#FFEFD0" : sunset ? "#FFF0C8" : "#FFF8DC", night ? 0.7 : 0.9);

  // birds drifting
  const birdRnd = mulberry32(o.seed + 41);
  ctx.strokeStyle = alpha(o.theme.ink, night ? 0.35 : 0.5);
  ctx.lineWidth = Math.max(1.2, o.w * 0.0028);
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const bx = o.x + ((o.t * (12 + birdRnd() * 10) + birdRnd() * o.w) % (o.w * 1.2)) - o.w * 0.1;
    const by = o.y + o.h * (0.14 + birdRnd() * 0.18) + Math.sin(o.t * 0.9 + i) * o.h * 0.006;
    const s = o.w * 0.012;
    ctx.beginPath();
    ctx.moveTo(bx - s, by);
    ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.6, bx, by);
    ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.6, bx + s, by);
    ctx.stroke();
  }

  // hills
  const layers: [number, string][] = night
    ? [
        [0.62, alpha(mix(o.theme.plate, o.theme.base, 0.45), 0.95)],
        [0.7, mix(o.theme.plate, o.theme.base, 0.24)],
        [0.79, mix(o.theme.plate, "#000000", 0.18)],
      ]
    : day
      ? [
          [0.6, "#8FCBE0"],
          [0.69, "#6FB5A8"],
          [0.78, "#3E8C79"],
        ]
      : [
          [0.6, "#F0C9A4"],
          [0.69, "#C99B78"],
          [0.78, "#8C6A55"],
        ];
  const rnd = mulberry32(o.seed + 13);
  layers.forEach(([yFrac, color], li) => {
    const y = o.y + o.h * yFrac;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y + o.h);
    ctx.lineTo(o.x, y + o.h * 0.04);
    const humps = 3 + li;
    for (let i = 0; i < humps; i++) {
      const x0 = o.x + (o.w * (i + 0.5)) / humps;
      const hh = o.h * (0.05 + rnd() * 0.09) * (1 + li * 0.25);
      ctx.quadraticCurveTo(x0 - o.w / (humps * 2), y - hh, x0, y);
      ctx.quadraticCurveTo(x0 + o.w / (humps * 2), y + o.h * 0.02, x0 + o.w / humps, y);
    }
    ctx.lineTo(o.x + o.w, o.y + o.h);
    ctx.closePath();
    ctx.fill();
  });

  // trees on the middle ridge
  const treeRnd = mulberry32(o.seed + 19);
  for (let i = 0; i < 7; i++) {
    const tx = o.x + o.w * (0.08 + treeRnd() * 0.84);
    const ty = o.y + o.h * (0.74 + treeRnd() * 0.06);
    const th = o.h * (0.07 + treeRnd() * 0.06);
    const sway = Math.sin(o.t * 0.7 + i) * o.w * 0.004;
    ctx.fillStyle = night ? alpha(mix(o.theme.plate, "#000000", 0.3), 0.92) : "#1F5C4A";
    ctx.fillRect(tx - o.w * 0.004, ty - th * 0.5, o.w * 0.008, th * 0.5);
    ctx.beginPath();
    ctx.ellipse(tx + sway, ty - th * 0.7, o.w * 0.03, th * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (isWet(o.weather)) rainLines(ctx, o, 60, 0.2);
}

function drawLamp(ctx: Ctx, o: MotifOpts) {
  const night = o.timeOfDay === "malam";
  const wallTop = night ? mix(o.theme.plate, "#160F0A", 0.55) : mix("#E8DCC6", o.theme.plate, 0.35);
  const wallBottom = night ? mix(o.theme.plate, "#0A0705", 0.62) : mix("#D5C4A6", o.theme.plate, 0.4);
  sky(ctx, o, wallTop, wallBottom);
  // wainscot line
  const wainY = o.y + o.h * 0.62;
  ctx.fillStyle = alpha(o.theme.ink, night ? 0.06 : 0.05);
  ctx.fillRect(o.x, wainY, o.w, o.y + o.h - wainY);

  // pendant lamp
  const lx = o.x + o.w * 0.5;
  const lampY = o.y + o.h * 0.3;
  const swing = Math.sin(o.t * 0.55) * 0.012;
  ctx.save();
  ctx.translate(lx, o.y);
  ctx.rotate(swing);
  ctx.strokeStyle = alpha(o.theme.ink, 0.55);
  ctx.lineWidth = Math.max(1.4, o.w * 0.0035);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, lampY - o.y);
  ctx.stroke();
  // shade
  ctx.fillStyle = mix(o.theme.warm, "#000000", night ? 0.35 : 0.15);
  ctx.beginPath();
  ctx.moveTo(-o.w * 0.075, lampY - o.y);
  ctx.lineTo(o.w * 0.075, lampY - o.y);
  ctx.lineTo(o.w * 0.045, lampY - o.y + o.h * 0.075);
  ctx.lineTo(-o.w * 0.045, lampY - o.y + o.h * 0.075);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // light pool
  const pulse = 0.88 + 0.12 * Math.sin(o.t * 1.4);
  const cone = ctx.createRadialGradient(lx, lampY + o.h * 0.08, 1, lx, lampY + o.h * 0.08, o.h * 0.62);
  cone.addColorStop(0, alpha(o.theme.warm, 0.5 * pulse));
  cone.addColorStop(0.4, alpha(o.theme.warm, 0.16 * pulse));
  cone.addColorStop(1, alpha(o.theme.warm, 0));
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(lx - o.w * 0.05, lampY + o.h * 0.06);
  ctx.lineTo(lx - o.w * 0.42, o.y + o.h);
  ctx.lineTo(lx + o.w * 0.42, o.y + o.h);
  ctx.lineTo(lx + o.w * 0.05, lampY + o.h * 0.06);
  ctx.closePath();
  ctx.fill();

  // framed picture on the wall
  const fx = o.x + o.w * 0.16;
  const fy = o.y + o.h * 0.2;
  ctx.fillStyle = alpha(o.theme.ink, 0.14);
  roundRect(ctx, fx, fy, o.w * 0.16, o.h * 0.13, o.w * 0.008);
  ctx.fill();
  ctx.strokeStyle = alpha(o.theme.warm, 0.5);
  ctx.lineWidth = Math.max(2, o.w * 0.005);
  ctx.stroke();

  // table + chair silhouettes in the light pool
  const tableY = o.y + o.h * 0.77;
  ctx.fillStyle = alpha(mix(o.theme.plate, "#000000", 0.35), 0.95);
  roundRect(ctx, lx - o.w * 0.2, tableY, o.w * 0.4, o.h * 0.016, o.w * 0.006);
  ctx.fill();
  ctx.fillRect(lx - o.w * 0.17, tableY, o.w * 0.014, o.h * 0.16);
  ctx.fillRect(lx + o.w * 0.156, tableY, o.w * 0.014, o.h * 0.16);

  const chairX = lx + o.w * 0.3;
  const chairY = o.y + o.h * 0.8;
  ctx.strokeStyle = alpha(mix(o.theme.plate, "#000000", 0.3), 0.95);
  ctx.lineWidth = Math.max(3, o.w * 0.008);
  ctx.beginPath();
  ctx.moveTo(chairX, chairY);
  ctx.lineTo(chairX, chairY - o.h * 0.1);
  ctx.lineTo(chairX + o.w * 0.07, chairY - o.h * 0.1);
  ctx.lineTo(chairX + o.w * 0.07, chairY);
  ctx.moveTo(chairX + o.w * 0.01, chairY - o.h * 0.02);
  ctx.lineTo(chairX + o.w * 0.01, chairY);
  ctx.moveTo(chairX + o.w * 0.06, chairY - o.h * 0.02);
  ctx.lineTo(chairX + o.w * 0.06, chairY);
  ctx.stroke();

  // cup on the table, with rising steam
  const cupX = lx - o.w * 0.11;
  ctx.fillStyle = alpha(o.theme.warm, 0.85);
  roundRect(ctx, cupX, tableY - o.h * 0.03, o.w * 0.045, o.h * 0.03, o.w * 0.006);
  ctx.fill();
  ctx.strokeStyle = alpha("#FFFFFF", night ? 0.22 : 0.35);
  ctx.lineWidth = Math.max(1.2, o.w * 0.003);
  for (let i = 0; i < 2; i++) {
    const sx = cupX + o.w * (0.012 + i * 0.02);
    ctx.beginPath();
    ctx.moveTo(sx, tableY - o.h * 0.035);
    for (let k = 1; k <= 4; k++) {
      const yy = tableY - o.h * 0.035 - k * o.h * 0.022;
      ctx.lineTo(sx + Math.sin(o.t * 1.6 + k * 0.8 + i) * o.w * 0.008, yy);
    }
    ctx.stroke();
  }

  // dust in the light
  const rnd = mulberry32(o.seed + 29);
  for (let i = 0; i < 14; i++) {
    const bx = lx - o.w * 0.18 + rnd() * o.w * 0.36;
    const by = lampY + o.h * 0.1 + rnd() * o.h * 0.4;
    ctx.fillStyle = alpha("#FFFFFF", 0.06 + rnd() * 0.1);
    ctx.beginPath();
    ctx.arc(bx + Math.sin(o.t * 0.6 + i) * o.w * 0.006, by - ((o.t * 9 + i * 20) % (o.h * 0.3)), Math.max(1, o.w * 0.003), 0, Math.PI * 2);
    ctx.fill();
  }
}


/* ------------------------------------------------------------------ */
/* science explainer motifs                                             */
/* ------------------------------------------------------------------ */

/** Spectrum colours, long to short wavelength. */
const SPECTRUM = ["#E8452F", "#F08A2A", "#F5C542", "#4FB86B", "#2E8FD6", "#3B57C4", "#7A46C7"];

/** Two bonded atoms — the nitrogen/oxygen molecules that do the scattering. */
function molecule(ctx: Ctx, x: number, y: number, r: number, color: string, opacity: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.5);
  ctx.beginPath();
  ctx.moveTo(-r * 1.35, 0);
  ctx.lineTo(r * 1.35, 0);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(-r * 1.35, 0, r, 0, Math.PI * 2);
  ctx.arc(r * 1.35, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSky(ctx: Ctx, o: MotifOpts) {
  // fixed daylight colours: the paper palette would wash the sky out
  sky(ctx, o, "#3D7FD0", "#BEE3F5");
  const groundY = o.y + o.h * 0.9;
  ground(ctx, o, groundY, "#5FA97F", "#2F6B4E");

  // sun, high and slightly left
  const sunX = o.x + o.w * 0.24;
  const sunY = o.y + o.h * 0.17;
  const sunR = o.w * 0.072;
  const g = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 6);
  g.addColorStop(0, alpha("#FFF3C4", 0.75));
  g.addColorStop(0.3, alpha("#FFE9A8", 0.22));
  g.addColorStop(1, alpha("#FFE9A8", 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFF4D2";
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // white sunbeam fanning toward the ground
  const beamTargetY = o.y + o.h * 0.86;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const spread = (i - 2) * o.w * 0.3;
    const flick = 0.55 + 0.45 * Math.sin(o.t * 1.2 + i * 0.8);
    ctx.strokeStyle = alpha("#FFF6D8", 0.16 + 0.16 * flick);
    ctx.lineWidth = o.w * 0.012;
    ctx.beginPath();
    ctx.moveTo(sunX + sunR * 0.4, sunY + sunR * 0.6);
    ctx.lineTo(o.x + o.w * 0.46 + spread, beamTargetY);
    ctx.stroke();
  }
  ctx.restore();

  // molecules floating in the air
  const rnd = mulberry32(o.seed + 77);
  for (let i = 0; i < 9; i++) {
    const mx = o.x + o.w * (0.12 + rnd() * 0.78) + Math.sin(o.t * 0.45 + i) * o.w * 0.012;
    const my = o.y + o.h * (0.3 + rnd() * 0.5) + Math.cos(o.t * 0.36 + i) * o.h * 0.012;
    molecule(ctx, mx, my, o.w * 0.009, o.theme.ink, 0.3, rnd() * Math.PI + o.t * 0.12);
  }

  // blue light scattering sideways: photons leave the beam at steep angles
  const phRnd = mulberry32(o.seed + 91);
  for (let i = 0; i < 22; i++) {
    const cycle = 2.6;
    const phase = ((o.t + phRnd() * cycle) % cycle) / cycle; // 0..1
    const originT = phRnd();
    const ox = sunX + (o.x + o.w * 0.46 - sunX) * originT + (phRnd() - 0.5) * o.w * 0.12;
    const oy = sunY + (beamTargetY - sunY) * originT;
    const dir = phRnd() > 0.5 ? 1 : -1;
    const travel = phase * o.w * 0.19;
    const px = ox + dir * travel * (0.55 + phRnd() * 0.45);
    const py = oy - travel * 0.35 * (0.4 + phRnd());
    const fade = Math.sin(Math.PI * phase);
    ctx.fillStyle = alpha("#39A7FF", 0.95 * fade);
    ctx.beginPath();
    ctx.arc(px, py, o.w * 0.011, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alpha("#5AB4FF", 0.22 * fade);
    ctx.lineWidth = Math.max(1, o.w * 0.0025);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
}

function drawPrism(ctx: Ctx, o: MotifOpts) {
  // deep optics stage: the rainbow needs a dark plate to glow against, and the
  // white caption on top stays legible
  sky(ctx, o, "#0B3350", "#1C6C90");
  const ink = "#F2F8FC";

  const px = o.x + o.w * 0.5;
  const py = o.y + o.h * 0.56;
  const size = o.h * 0.42;
  const tri: [number, number][] = [
    [px, py - size * 0.62],
    [px - size * 0.56, py + size * 0.44],
    [px + size * 0.56, py + size * 0.44],
  ];

  // incoming white beam
  const inStart: [number, number] = [o.x + o.w * 0.04, o.y + o.h * 0.30];
  const inEnd: [number, number] = [px - size * 0.16, py - size * 0.06];
  const beamGrad = ctx.createLinearGradient(inStart[0], inStart[1], inEnd[0], inEnd[1]);
  beamGrad.addColorStop(0, alpha("#FFFFFF", 0.15));
  beamGrad.addColorStop(1, alpha("#FFFFFF", 0.95));
  ctx.strokeStyle = beamGrad;
  ctx.lineWidth = o.w * 0.018;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(inStart[0], inStart[1]);
  ctx.lineTo(inEnd[0], inEnd[1]);
  ctx.stroke();

  // glow behind the glass
  const glow = ctx.createRadialGradient(px, py, 0, px, py, size * 1.5);
  glow.addColorStop(0, alpha("#BFE3FF", 0.26));
  glow.addColorStop(1, alpha("#BFE3FF", 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, size * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // prism body
  ctx.save();
  ctx.beginPath();
  tri.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = alpha("#DCEFFF", 0.16);
  ctx.fill();
  ctx.strokeStyle = alpha(ink, 0.8);
  ctx.lineWidth = Math.max(2, o.w * 0.005);
  ctx.stroke();
  ctx.restore();

  // spectrum fan leaving the prism
  const outOrigin: [number, number] = [px + size * 0.3, py + size * 0.2];
  SPECTRUM.forEach((color, i) => {
    const spread = (i - (SPECTRUM.length - 1) / 2) * (o.h * 0.075);
    const pulse = 0.72 + 0.28 * Math.sin(o.t * 1.1 + i * 0.6);
    ctx.strokeStyle = alpha(color, 0.85 * pulse);
    ctx.lineWidth = Math.max(2, o.w * 0.0085);
    ctx.beginPath();
    ctx.moveTo(outOrigin[0], outOrigin[1]);
    ctx.lineTo(o.x + o.w * 0.985, outOrigin[1] + spread * 1.5 + o.h * 0.02);
    ctx.stroke();
  });

  // particles riding the beam, then splitting
  const rnd = mulberry32(o.seed + 5);
  for (let i = 0; i < 14; i++) {
    const speed = 0.5 + rnd() * 0.5;
    const cycle = 2.4;
    const phase = ((o.t * speed + rnd() * cycle) % cycle) / cycle;
    if (phase < 0.45) {
      const k = phase / 0.45;
      const x = inStart[0] + (inEnd[0] - inStart[0]) * k;
      const y = inStart[1] + (inEnd[1] - inStart[1]) * k;
      ctx.fillStyle = alpha("#FFFFFF", 0.9);
      ctx.beginPath();
      ctx.arc(x, y, o.w * 0.005, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const k = (phase - 0.45) / 0.55;
      const color = SPECTRUM[Math.floor(rnd() * SPECTRUM.length)];
      const spread = (rnd() - 0.5) * o.h * 0.5;
      const x = outOrigin[0] + (o.x + o.w * 0.985 - outOrigin[0]) * k;
      const y = outOrigin[1] + (spread * 1.4 + o.h * 0.02) * k;
      ctx.fillStyle = alpha(color, 0.9);
      ctx.beginPath();
      ctx.arc(x, y, o.w * 0.006, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSunset(ctx: Ctx, o: MotifOpts) {
  // warm gradient, red sun sitting low on a long atmospheric path
  sky(ctx, o, "#2E4C7A", "#F2A25C");
  const horizon = o.y + o.h * 0.72;
  const hg = ctx.createLinearGradient(0, o.y + o.h * 0.45, 0, horizon);
  hg.addColorStop(0, alpha("#F7C98B", 0));
  hg.addColorStop(1, alpha("#F7C98B", 0.55));
  ctx.fillStyle = hg;
  ctx.fillRect(o.x, o.y + o.h * 0.45, o.w, horizon - (o.y + o.h * 0.45));

  const sunX = o.x + o.w * 0.58;
  const sunY = horizon - o.h * 0.02;
  const sunR = o.w * 0.11;
  const g = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 5);
  g.addColorStop(0, alpha("#FFC46B", 0.85));
  g.addColorStop(0.35, alpha("#F4713C", 0.3));
  g.addColorStop(1, alpha("#F4713C", 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFB25C";
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // thick haze band = the long path through the atmosphere
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const y = o.y + o.h * (0.52 + i * 0.036);
    const wob = Math.sin(o.t * 0.5 + i) * o.w * 0.01;
    ctx.strokeStyle = alpha("#FBD9A5", 0.13);
    ctx.lineWidth = o.h * 0.016;
    ctx.beginPath();
    ctx.moveTo(o.x - o.w * 0.05, y + wob);
    ctx.lineTo(o.x + o.w * 1.05, y + wob * 0.6);
    ctx.stroke();
  }
  ctx.restore();

  // ground silhouette with hills
  const hills = mulberry32(o.seed + 3);
  ctx.fillStyle = "#241A26";
  ctx.beginPath();
  ctx.moveTo(o.x, o.y + o.h);
  ctx.lineTo(o.x, horizon);
  let x = o.x;
  while (x < o.x + o.w) {
    const step = o.w * (0.08 + hills() * 0.15);
    const peak = horizon - o.h * (0.03 + hills() * 0.2);
    ctx.quadraticCurveTo(x + step * 0.5, peak, x + step, horizon + o.h * 0.005);
    x += step;
  }
  ctx.lineTo(o.x + o.w, o.y + o.h);
  ctx.closePath();
  ctx.fill();

  // blue light is scattered away before it reaches us — a few strays only
  const rnd = mulberry32(o.seed + 12);
  for (let i = 0; i < 8; i++) {
    const cycle = 3.2;
    const phase = ((o.t + rnd() * cycle) % cycle) / cycle;
    const dx = sunX + (rnd() - 0.5) * o.w * 0.5;
    const dy = sunY - phase * o.h * 0.3;
    ctx.fillStyle = alpha("#7FB7E8", 0.6 * Math.sin(Math.PI * phase));
    ctx.beginPath();
    ctx.arc(dx, dy, o.w * 0.006, 0, Math.PI * 2);
    ctx.fill();
  }

  // the warm beam that does make it through: a soft wedge, not a hard line
  const beamEnd: [number, number] = [o.x + o.w * 0.08, o.y + o.h * 0.98];
  const wedge = ctx.createLinearGradient(sunX, sunY, beamEnd[0], beamEnd[1]);
  wedge.addColorStop(0, alpha("#FFB765", 0.4));
  wedge.addColorStop(0.55, alpha("#FF8A4C", 0.16));
  wedge.addColorStop(1, alpha("#FF8A4C", 0));
  ctx.fillStyle = wedge;
  ctx.beginPath();
  ctx.moveTo(sunX - sunR * 0.85, sunY - sunR * 0.2);
  ctx.lineTo(sunX + sunR * 0.2, sunY);
  ctx.lineTo(beamEnd[0] + o.w * 0.1, beamEnd[1]);
  ctx.lineTo(beamEnd[0] - o.w * 0.02, beamEnd[1]);
  ctx.closePath();
  ctx.fill();
}


/**
 * Close-up of the atmosphere itself: molecules of nitrogen and oxygen lit by a
 * white sunbeam, spraying blue light in every direction. This is the actual
 * mechanism of Rayleigh scattering, drawn large.
 */
function drawMolecules(ctx: Ctx, o: MotifOpts) {
  const night = o.timeOfDay === "malam";
  sky(ctx, o, night ? "#0E1A2B" : "#D9EEF9", night ? "#132B3F" : "#AFD6EC");
  const ink = night ? "#E8F2FA" : "#1B2A38";

  // faint atmosphere banding so the plate does not read as flat paper
  for (let i = 0; i < 4; i++) {
    const y = o.y + o.h * (0.16 + i * 0.2);
    ctx.strokeStyle = alpha(night ? "#8FC7E8" : "#FFFFFF", 0.12);
    ctx.lineWidth = o.h * 0.02;
    ctx.beginPath();
    ctx.moveTo(o.x - o.w * 0.04, y + Math.sin(o.t * 0.4 + i) * o.h * 0.008);
    ctx.lineTo(o.x + o.w * 1.04, y - Math.sin(o.t * 0.35 + i) * o.h * 0.008);
    ctx.stroke();
  }

  const spots: [number, number][] = [
    [0.24, 0.28], [0.63, 0.2], [0.42, 0.56], [0.74, 0.62], [0.3, 0.76],
  ];
  const rnd = mulberry32(o.seed + 61);
  const mols = spots.map(([fx, fy], i) => ({
    x: o.x + o.w * fx + Math.sin(o.t * 0.33 + i * 1.7) * o.w * 0.014,
    y: o.y + o.h * fy + Math.cos(o.t * 0.27 + i * 1.3) * o.h * 0.016,
    r: o.w * (0.028 + rnd() * 0.008),
    a: rnd() * Math.PI + o.t * 0.1,
  }));

  // the beam enters from the upper left and strikes the first molecule
  const srcX = o.x - o.w * 0.06;
  const srcY = o.y + o.h * 0.06;
  const hit = mols[2];
  const beam = ctx.createLinearGradient(srcX, srcY, hit.x, hit.y);
  beam.addColorStop(0, alpha("#FFFDF0", 0.05));
  beam.addColorStop(0.6, alpha("#FFFDF0", 0.75));
  beam.addColorStop(1, alpha("#FFFDF0", 0.95));
  ctx.strokeStyle = beam;
  ctx.lineWidth = o.w * 0.028;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(srcX, srcY);
  ctx.lineTo(hit.x, hit.y);
  ctx.stroke();

  // molecules
  for (const m of mols) molecule(ctx, m.x, m.y, m.r, ink, 0.5, m.a);

  // spray of blue light out of the hit molecule, in all directions
  const rays = 9;
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2 + o.t * 0.12;
    const cycle = 1.9;
    const phase = ((o.t * 1.05 + (i % 3) * 0.35) % cycle) / cycle;
    const reach = o.w * (0.2 + (i % 4) * 0.07);
    const x1 = hit.x + Math.cos(ang) * hit.r * 2.2;
    const y1 = hit.y + Math.sin(ang) * hit.r * 2.2;
    const x2 = hit.x + Math.cos(ang) * (hit.r * 2.2 + reach * phase);
    const y2 = hit.y + Math.sin(ang) * (hit.r * 2.2 + reach * phase);
    const fade = Math.sin(Math.PI * phase);
    ctx.strokeStyle = alpha("#2E9BF0", 0.5 * fade);
    ctx.lineWidth = Math.max(1.5, o.w * 0.005);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillStyle = alpha("#48B0FF", 0.95 * fade);
    ctx.beginPath();
    ctx.arc(x2, y2, o.w * 0.009, 0, Math.PI * 2);
    ctx.fill();
  }

  // red light is scattered far less: it keeps going straight through
  ctx.strokeStyle = alpha("#F2714B", 0.5);
  ctx.lineWidth = o.w * 0.01;
  ctx.setLineDash([o.w * 0.02, o.w * 0.016]);
  ctx.lineDashOffset = -o.t * 26;
  ctx.beginPath();
  ctx.moveTo(hit.x, hit.y);
  ctx.lineTo(o.x + o.w * 1.02, o.y + o.h * 0.94);
  ctx.stroke();
  ctx.setLineDash([]);
}


/** Soft cumulus built from overlapping circles; returns the base line. */
function cumulus(ctx: Ctx, o: MotifOpts, cx: number, baseY: number, size: number, top: string, bottom: string, seed: number) {
  const rnd = mulberry32(seed);
  const lobes = 11;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < lobes; i++) {
    const f = i / (lobes - 1);
    const x = cx + (f - 0.5) * size * 1.9 + (rnd() - 0.5) * size * 0.2;
    const hump = Math.sin(Math.PI * f);
    const y = baseY - size * (0.32 + hump * 0.72) - rnd() * size * 0.1;
    pts.push([x, y, size * (0.28 + hump * 0.4 + rnd() * 0.12)]);
  }
  const g = ctx.createLinearGradient(0, baseY - size * 1.2, 0, baseY);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  pts.forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  // a lens-shaped base: a flat rectangle reads as a table under the cloud
  ctx.beginPath();
  ctx.ellipse(cx, baseY - size * 0.14, size * 0.95, size * 0.19, 0, 0, Math.PI * 2);
  ctx.fill();
  return baseY;
}

/**
 * The water cycle's first step: sun on the sea, vapour rising off the surface.
 */
function drawEvaporation(ctx: Ctx, o: MotifOpts) {
  sky(ctx, o, "#5FAFD8", "#D3EDF9");
  const seaY = o.y + o.h * 0.63;

  // sun
  const sx = o.x + o.w * 0.72;
  const sy = o.y + o.h * 0.2;
  const sr = o.w * 0.085;
  const g = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 5.5);
  g.addColorStop(0, alpha("#FFF6CE", 0.9));
  g.addColorStop(0.35, alpha("#FFE9A0", 0.28));
  g.addColorStop(1, alpha("#FFE9A0", 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, sr * 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFF4CF";
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  // sea
  const sea = ctx.createLinearGradient(0, seaY, 0, o.y + o.h);
  sea.addColorStop(0, "#2E86A8");
  sea.addColorStop(1, "#0C3A52");
  ctx.fillStyle = sea;
  ctx.fillRect(o.x, seaY, o.w, o.y + o.h - seaY);

  // horizon glow
  const hz = ctx.createLinearGradient(0, seaY - o.h * 0.05, 0, seaY + o.h * 0.04);
  hz.addColorStop(0, alpha("#D8F1FF", 0));
  hz.addColorStop(0.5, alpha("#D8F1FF", 0.5));
  hz.addColorStop(1, alpha("#D8F1FF", 0));
  ctx.fillStyle = hz;
  ctx.fillRect(o.x, seaY - o.h * 0.05, o.w, o.h * 0.09);

  // sun glitter + waves
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const y = seaY + o.h * (0.03 + i * 0.05);
    ctx.strokeStyle = alpha("#BFE9FF", 0.3 + i * 0.03);
    ctx.lineWidth = Math.max(1, o.w * 0.0025);
    ctx.beginPath();
    for (let x = o.x; x <= o.x + o.w; x += o.w * 0.05) {
      const wy = y + Math.sin((x / o.w) * 9 + o.t * 1.1 + i) * o.h * 0.006;
      if (x === o.x) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // vapour rising off the water
  const rnd = mulberry32(o.seed + 29);
  for (let i = 0; i < 26; i++) {
    const phase = ((o.t * (0.16 + rnd() * 0.12) + rnd()) % 1);
    const x0 = o.x + o.w * (0.06 + rnd() * 0.88);
    const rise = (seaY - o.y) * 0.92;
    const y = seaY - phase * rise;
    const x = x0 + Math.sin(phase * 5 + i) * o.w * 0.03;
    const fade = Math.sin(Math.PI * Math.min(1, phase * 1.1));
    const r = o.w * (0.006 + phase * 0.016);
    ctx.fillStyle = alpha("#FFFFFF", 0.5 * fade);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // heat shimmer just above the water
  ctx.strokeStyle = alpha("#FFFFFF", 0.22);
  ctx.lineWidth = Math.max(1, o.w * 0.0022);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    for (let x = o.x + o.w * 0.1; x <= o.x + o.w * 0.9; x += o.w * 0.02) {
      const y = seaY - o.h * (0.02 + i * 0.03) + Math.sin(x * 0.05 + o.t * 3 + i) * o.h * 0.005;
      if (x === o.x + o.w * 0.1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/**
 * Condensation: vapour gathering into a cloud, droplets coalescing inside it
 * until they get heavy enough to fall out of the base.
 */
function drawCloud(ctx: Ctx, o: MotifOpts) {
  const storm = o.timeOfDay === "malam" || isWet(o.weather);
  sky(ctx, o, storm ? "#39485A" : "#6FB6DA", storm ? "#5A6B7C" : "#D7EDFA");
  const cx = o.x + o.w * 0.5;
  const baseY = o.y + o.h * 0.74;
  const size = Math.min(o.w, o.h) * 0.21;
  const drift = Math.sin(o.t * 0.25) * o.w * 0.012;
  cumulus(
    ctx,
    o,
    cx + drift,
    baseY,
    size,
    storm ? "#E8EEF4" : "#FFFFFF",
    storm ? "#6C7A89" : "#A9C3D6",
    o.seed + 5
  );
  // shade pooled under the base so the cloud sits in the sky (a vertical
  // gradient, so the rectangle never shows its own edge)
  const under = ctx.createLinearGradient(0, baseY - size * 0.2, 0, baseY + size * 0.9);
  under.addColorStop(0, alpha("#2B4256", 0));
  under.addColorStop(0.28, alpha("#2B4256", 0.2));
  under.addColorStop(1, alpha("#2B4256", 0));
  ctx.fillStyle = under;
  ctx.fillRect(o.x, baseY - size * 0.2, o.w, size * 1.1);

  // droplets forming inside the cloud
  const rnd = mulberry32(o.seed + 71);
  for (let i = 0; i < 22; i++) {
    const fx = (rnd() - 0.5) * 1.5;
    const fy = 0.35 + rnd() * 0.85;
    const pulse = 0.45 + 0.55 * Math.sin(o.t * 1.6 + rnd() * 6.28);
    const x = cx + drift + size * fx;
    const y = baseY - size * fy;
    ctx.fillStyle = alpha(storm ? "#7FD3FF" : "#3FA9E0", 0.5 * pulse);
    ctx.beginPath();
    ctx.arc(x, y, o.w * 0.007, 0, Math.PI * 2);
    ctx.fill();
  }

  // a shower leaking out of the base once the cloud is heavy
  if (o.p > 0.35) {
    const rnd2 = mulberry32(o.seed + 97);
    const n = 26;
    ctx.strokeStyle = alpha("#BFE3FF", 0.5);
    ctx.lineWidth = Math.max(1.2, o.w * 0.003);
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = cx + drift + (rnd2() - 0.5) * size * 1.7;
      const phase = (o.t * (1.1 + rnd2() * 0.6) + rnd2()) % 1;
      const y0 = baseY + o.h * 0.02 + phase * o.h * 0.3;
      ctx.globalAlpha = Math.min(1, (o.p - 0.35) * 2) * (1 - phase);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x - o.w * 0.006, y0 + o.h * 0.05);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ground far below, tiny, for scale
  ground(ctx, o, o.y + o.h * 0.93, storm ? "#2C3B45" : "#79B08A", storm ? "#1B262D" : "#3E7C5C");
}

/**
 * Rain falling on a wet landscape: heavy cloud deck, streaks, puddles.
 */
function drawRain(ctx: Ctx, o: MotifOpts) {
  // A slate-blue sky, not a black one: the shot still has to read at 360 px
  // inside a feed, and the caption sits on the ground band below.
  sky(ctx, o, "#5B7488", "#A8C1CE");
  const horizon = o.y + o.h * (0.66 + mulberry32(o.seed + 9)() * 0.06);

  // cloud deck
  const rnd = mulberry32(o.seed + 3);
  ctx.fillStyle = "#54687B";
  for (let i = 0; i < 9; i++) {
    const x = o.x + o.w * (0.02 + i * 0.12) + Math.sin(o.t * 0.2 + i) * o.w * 0.01;
    const y = o.y + o.h * (0.06 + (i % 3) * 0.045);
    ctx.beginPath();
    ctx.ellipse(x, y, o.w * (0.14 + rnd() * 0.1), o.h * (0.075 + rnd() * 0.045), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // lit underside: the deck would otherwise read as one flat silhouette
  const rim = ctx.createLinearGradient(0, o.y + o.h * 0.1, 0, o.y + o.h * 0.22);
  rim.addColorStop(0, alpha("#DCEBF5", 0.34));
  rim.addColorStop(1, alpha("#DCEBF5", 0));
  ctx.fillStyle = rim;
  ctx.fillRect(o.x, o.y + o.h * 0.1, o.w, o.h * 0.12);
  ctx.fillStyle = alpha("#2C3A46", 0.4);
  ctx.fillRect(o.x, o.y, o.w, o.h * 0.08);

  // distant hills
  ctx.fillStyle = "#4E6B63";
  ctx.beginPath();
  ctx.moveTo(o.x, horizon);
  for (let i = 0; i <= 6; i++) {
    const x = o.x + (o.w * i) / 6;
    const y = horizon - o.h * (0.05 + ((i * 7 + o.seed) % 5) * 0.02);
    ctx.quadraticCurveTo(x - o.w / 12, y - o.h * 0.03, x, y);
  }
  ctx.lineTo(o.x + o.w, horizon + o.h * 0.02);
  ctx.lineTo(o.x, horizon + o.h * 0.02);
  ctx.closePath();
  ctx.fill();

  // wet ground with puddles
  ground(ctx, o, horizon + o.h * 0.02, "#3D5854", "#22343A");
  const prnd = mulberry32(o.seed + 17);
  for (let i = 0; i < 4; i++) {
    const px = o.x + o.w * (0.12 + i * 0.24 + prnd() * 0.05);
    const py = o.y + o.h * (0.8 + prnd() * 0.12);
    const pw = o.w * (0.14 + prnd() * 0.08);
    const ph = pw * 0.24;
    ctx.fillStyle = alpha("#B7DBEC", 0.34);
    ctx.beginPath();
    ctx.ellipse(px, py, pw, ph, 0, 0, Math.PI * 2);
    ctx.fill();
    // ripple rings
    for (let k = 0; k < 2; k++) {
      const rp = ((o.t * 0.8 + k * 0.5 + i * 0.3) % 1);
      ctx.strokeStyle = alpha("#DDF1FF", 0.35 * (1 - rp));
      ctx.lineWidth = Math.max(1, o.w * 0.0025);
      ctx.beginPath();
      ctx.ellipse(px, py, pw * (0.3 + rp * 0.7), ph * (0.3 + rp * 0.7), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // rain
  const rrnd = mulberry32(o.seed + 41);
  ctx.strokeStyle = alpha("#D9ECFF", 0.55);
  ctx.lineWidth = Math.max(1.2, o.w * 0.0028);
  ctx.lineCap = "round";
  for (let i = 0; i < 140; i++) {
    const speed = 0.75 + rrnd() * 0.6;
    const x0 = o.x + rrnd() * o.w * 1.1 - o.w * 0.05;
    const len = o.h * (0.05 + rrnd() * 0.05);
    const y = o.y + ((rrnd() * (o.h + len) + o.t * o.h * speed) % (o.h + len)) - len;
    const lean = o.w * 0.012;
    ctx.strokeStyle = alpha("#D9ECFF", 0.2 + rrnd() * 0.35);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 - lean, y + len);
    ctx.stroke();
  }
  // splash flecks on the ground
  for (let i = 0; i < 18; i++) {
    const phase = (o.t * 1.6 + i * 0.37) % 1;
    const x = o.x + o.w * (0.05 + ((i * 53) % 90) / 100);
    const y = horizon + o.h * (0.03 + ((i * 17) % 12) / 100);
    ctx.strokeStyle = alpha("#E8F6FF", 0.35 * (1 - phase));
    ctx.lineWidth = Math.max(1, o.w * 0.002);
    ctx.beginPath();
    ctx.moveTo(x, y - o.h * 0.02 * (1 - phase));
    ctx.lineTo(x + o.w * 0.012, y - o.h * 0.045 * (1 - phase));
    ctx.moveTo(x, y - o.h * 0.02 * (1 - phase));
    ctx.lineTo(x - o.w * 0.012, y - o.h * 0.045 * (1 - phase));
    ctx.stroke();
  }
}

const DRAWERS: Record<MotifId, (ctx: Ctx, o: MotifOpts) => void> = {
  lamp: drawLamp,
  city: drawCity,
  window: drawWindow,
  well: drawWell,
  door: drawDoor,
  mosque: drawMosque,
  hills: drawHills,
  sky: drawSky,
  prism: drawPrism,
  sunset: drawSunset,
  molecules: drawMolecules,
  rain: drawRain,
  cloud: drawCloud,
  evaporation: drawEvaporation,
};

/** Draws one illustration clipped to the given rect. */
export function drawMotif(ctx: Ctx, motif: MotifId, o: MotifOpts) {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, o.x, o.y, o.w, o.h, Math.min(o.w, o.h) * 0.045);
  ctx.clip();
  DRAWERS[motif](ctx, o);
  // inner vignette keeps the flat art from looking pasted on
  const v = ctx.createRadialGradient(o.x + o.w / 2, o.y + o.h / 2, o.w * 0.25, o.x + o.w / 2, o.y + o.h / 2, o.w * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, alpha("#000000", o.theme.mode === "dark" ? 0.42 : 0.18));
  ctx.fillStyle = v;
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.restore();
}

export { isWet };
export const motifProgress = (p: number) => clamp(p, 0, 1);
