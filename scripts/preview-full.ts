/** Renders the full-bleed infographic layout for the sky-blue beats. */
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts } from "../src/lib/render/fonts";
import { renderSceneFrame, type SceneRenderSpec } from "../src/lib/anim/sceneRenderer";
import { getPreset } from "../src/lib/style/presets";
import { gfxTheme } from "../src/lib/anim/gfx/theme";
import type { SceneWord } from "../src/lib/types";

const base = getPreset("motion-graphics-terang");
const style = {
  ...base,
  palette: { ...base.palette, highlight: "#FF6B3D" },
  graphics: { ...base.graphics, layout: "full" as const },
  subtitle: { ...base.subtitle, emphasisStyle: "color" as const, fontSize: 58, positionY: 0.74, wordsPerChunk: 3, shadow: 0.12 },
};

const demo = (text: string, startMs: number, perWord = 420, emphasis: string[] = []): SceneWord[] =>
  text.split(" ").map((t, i) => ({
    text: t,
    startMs: startMs + i * perWord,
    endMs: startMs + (i + 1) * perWord - 30,
    emphasis: emphasis.includes(t.replace(/[.,!?]/g, "").toLowerCase()),
  }));

const scenes = [
  { name: "rain", motif: "rain", stat: { value: "30 KM/JAM", label: "KECEPATAN TETES HUJAN" }, narration: "Hujan bukan air yang baru jatuh dari langit", emph: ["langit"], tod: "sore" as const },
  { name: "evap", motif: "evaporation", stat: { value: "71%", label: "PERMUKAAN BUMI ADALAH AIR" }, narration: "Semua mulai dari laut dan matahari memanaskannya", emph: ["laut"], tod: "siang" as const },
  { name: "cloud", motif: "cloud", stat: { value: "1 JUTA", label: "TETES KECIL UNTUK SATU TETES HUJAN" }, narration: "Uap menempel pada debu lalu miliaran tetes lahir", emph: ["debu"], tod: "siang" as const },
  { name: "hills", motif: "hills", stat: undefined as { value: string; label: string } | undefined, narration: "Udara terpaksa naik mendingin dan awan menebal", emph: ["menebal"], tod: "sore" as const },
];

async function main() {
  ensureFonts();
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : "/tmp/gfx-full";
  fs.mkdirSync(outDir, { recursive: true });
  scenes.forEach((v, i) => {
    const spec: SceneRenderSpec = {
      index: i,
      sceneCount: scenes.length,
      width: 720,
      height: 1280,
      durationMs: 9000,
      location: v.motif,
      timeOfDay: v.tod,
      camera: "slow-push",
      mood: "informatif",
      characters: [],
      staging: [],
      palette: style.palette,
      style,
      subtitleStyle: style.subtitle,
      hudStyle: style.hud,
      hudData: { label: "SAINS HARIAN", clock: "10:24", episode: "EPISODE 1" },
      words: demo(v.narration, 700, 420, v.emph),
      seedKey: v.name,
      showHud: true,
      purpose: "setup",
      showSubtitles: true,
      subtitleNoFade: false,
      gfxMotif: v.motif,
      stat: v.stat,
    };
    const canvas = createCanvas(720, 1280);
    const ctx = canvas.getContext("2d") as never;
    renderSceneFrame(ctx, spec, Number(process.argv[3] ?? 2600));
    fs.writeFileSync(path.join(outDir, `${v.name}-${process.argv[3] ?? 2600}.png`), canvas.toBuffer("image/png"));
    void gfxTheme;
  });
  console.log("wrote", outDir);
}
main();
