import type { PaletteSpec } from "../../types";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function toRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function hex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => channel(v).toString(16).padStart(2, "0")).join("")}`;
}

export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return hex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k });
}

export function alpha(color: string, a: number): string {
  const { r, g, b } = toRgb(color);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

export function luminance(color: string): number {
  const { r, g, b } = toRgb(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Text colour that stays legible on top of `background`. */
export function readable(background: string, dark = "#0B0F14", light = "#FFFFFF"): string {
  return luminance(background) > 0.55 ? dark : light;
}

export interface GfxTheme {
  mode: "dark" | "light";
  /** canvas base */
  base: string;
  /** secondary surface (cards, pills) */
  surface: string;
  /** illustration back plate */
  plate: string;
  /** primary text */
  ink: string;
  /** secondary text */
  mute: string;
  /** vivid accent used for marks, progress, emphasis */
  accent: string;
  /** second accent for supporting shapes */
  accent2: string;
  /** warm light colour from the palette */
  warm: string;
  /** hairline colour */
  line: string;
  /** text colour on top of a solid accent block */
  onAccent: string;
}

/**
 * Motion-graphics palette. The story palettes were built for dark illustrative
 * scenes, so the base surfaces are derived from them rather than copied: the
 * video keeps the project's colour identity without turning into mud.
 */
export function gfxTheme(palette: PaletteSpec, timeOfDay: string): GfxTheme {
  const night = timeOfDay === "malam";
  const accent = palette.highlight || "#D4F24A";
  const accent2 = palette.accent || "#FF7A45";
  const warm = palette.lampWarm || "#FFB46A";

  if (night) {
    return {
      mode: "dark",
      base: mix(palette.background || "#0B0E14", "#04060A", 0.62),
      surface: mix(palette.background || "#0B0E14", "#121A26", 0.55),
      plate: mix(palette.background || "#0B0E14", "#1A2432", 0.7),
      ink: mix(palette.text || "#F4F1E8", "#FFFFFF", 0.35),
      mute: mix(palette.text || "#F4F1E8", palette.background || "#0B0E14", 0.45),
      accent,
      accent2,
      warm,
      line: alpha(mix(palette.text || "#FFFFFF", palette.background || "#000000", 0.4), 0.16),
      onAccent: readable(accent),
    };
  }

  // daylight: cream paper, ink type, saturated marks
  const paper = mix("#F6F2E7", palette.wall || "#CFC3AE", 0.18);
  return {
    mode: "light",
    base: paper,
    surface: mix(paper, "#FFFFFF", 0.55),
    plate: mix(paper, "#FFFFFF", 0.72),
    ink: "#12171D",
    mute: alpha("#12171D", 0.58),
    accent: luminance(accent) > 0.72 ? mix(accent, "#1E3A00", 0.35) : accent,
    accent2,
    warm,
    line: alpha("#12171D", 0.16),
    onAccent: readable(mix(accent, "#000000", 0.05)),
  };
}
