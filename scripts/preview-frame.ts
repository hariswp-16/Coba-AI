import fs from "node:fs";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import { renderSceneFrame, type SceneRenderSpec } from "../src/lib/anim/sceneRenderer";
import { STICKMAN_CINEMATIC } from "../src/lib/style/presets";
import type { SceneWord } from "../src/lib/types";

const FONT_DIR = path.resolve("public/fonts");
GlobalFonts.registerFromPath(path.join(FONT_DIR, "Anton-Regular.ttf"), "Anton");
GlobalFonts.registerFromPath(path.join(FONT_DIR, "Poppins-Bold.ttf"), "Poppins");
GlobalFonts.registerFromPath(path.join(FONT_DIR, "Poppins-SemiBold.ttf"), "Poppins");
GlobalFonts.registerFromPath(path.join(FONT_DIR, "Poppins-Regular.ttf"), "Poppins");

const style = STICKMAN_CINEMATIC;
const words: SceneWord[] = [
  { text: "HUJAN", startMs: 0, endMs: 600, emphasis: false },
  { text: "LAMA", startMs: 600, endMs: 1000, emphasis: false },
  { text: "TIDAK", startMs: 1000, endMs: 1500, emphasis: true },
];

async function main() {
  const outDir = path.resolve("public/preview");
  fs.mkdirSync(outDir, { recursive: true });
  const variants = [
    { name: "rumah", location: "rumah malam", timeOfDay: "malam" as const, camera: "slow-push" as const, mood: "tegang", words },
    { name: "jalan", location: "jalan kota malam", timeOfDay: "malam" as const, camera: "pan-right" as const, mood: "takut", words: [
      { text: "KABAR", startMs: 0, endMs: 500, emphasis: false },
      { text: "DAJJAL", startMs: 500, endMs: 1100, emphasis: true },
    ] },
    { name: "kamar", location: "kamar tidur", timeOfDay: "malam" as const, camera: "handheld" as const, mood: "sedih", words: [
      { text: "AKU", startMs: 0, endMs: 300, emphasis: false },
      { text: "TAKUT", startMs: 300, endMs: 900, emphasis: true },
      { text: "SENDIRI", startMs: 900, endMs: 1600, emphasis: false },
    ] },
    { name: "cta", location: "jalan kota malam", timeOfDay: "malam" as const, camera: "static" as const, mood: "tegang", words: [
      { text: "APA", startMs: 0, endMs: 300, emphasis: false },
      { text: "PILIHANMU?", startMs: 300, endMs: 1200, emphasis: false },
    ], purpose: "cta" },
  ];
  for (const v of variants) {
    for (const t of [400, 2400]) {
      const canvas = createCanvas(720, 1280);
      const ctx = canvas.getContext("2d") as never;
      const spec: SceneRenderSpec = {
        index: 0,
        width: 720,
        height: 1280,
        durationMs: 5200,
        location: v.location,
        timeOfDay: v.timeOfDay,
        weather: "hujan",
        camera: v.camera,
        mood: v.mood,
        characters: style.characters,
        staging: [],
        palette: style.palette,
        style,
        subtitleStyle: style.subtitle,
        hudStyle: style.hud,
        hudData: { label: "MALAM PERTAMA", clock: "21:49", episode: "DAJJAL  EPISODE 2" },
        words: v.words,
        seedKey: `preview-${v.name}-${t}`,
        showHud: true,
        purpose: v.purpose ?? "hook",
        ctaPills: ["MENYUSUL TEMANMU", "BAWA ADIK PULANG"],
        ctaQuestion: "APA PILIHANMU?",
      };
      renderSceneFrame(ctx, spec, t);
      fs.writeFileSync(path.join(outDir, `${v.name}-${t}.png`), canvas.toBuffer("image/png"));
    }
  }
  console.log("frames written to", outDir);
}

main();
