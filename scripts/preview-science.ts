/** Renders the three science motifs (langit / prisma / senja) for inspection. */
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts } from "../src/lib/render/fonts";
import { renderSceneFrame, type SceneRenderSpec } from "../src/lib/anim/sceneRenderer";
import { getPreset } from "../src/lib/style/presets";
import { drawMotif, planMotifs, type MotifId } from "../src/lib/anim/gfx/motifs";
import { gfxTheme } from "../src/lib/anim/gfx/theme";
import { hashString } from "../src/lib/anim/geometry";
import type { SceneWord } from "../src/lib/types";

const style = getPreset("motion-graphics-terang");

const demo = (text: string, startMs: number, perWord = 280, emphasis: string[] = []): SceneWord[] =>
  text.split(" ").map((t, i) => ({
    text: t,
    startMs: startMs + i * perWord,
    endMs: startMs + (i + 1) * perWord - 30,
    emphasis: emphasis.includes(t.replace(/[.,!?]/g, "").toLowerCase()),
  }));

const scenes = [
  { name: "langit", location: "langit siang hari di atas atmosfer", timeOfDay: "siang" as const, narration: "Cahaya matahari berwarna putih", emphasis: ["putih"], atMs: 1500 },
  { name: "prisma", location: "berkas cahaya melewati prisma", timeOfDay: "siang" as const, narration: "Putih itu campuran semua warna", emphasis: ["semua"], atMs: 1500 },
  { name: "molekul", location: "molekul udara menghamburkan cahaya", timeOfDay: "siang" as const, narration: "Molekul memantulkan cahaya biru", emphasis: ["biru"], atMs: 1500 },
  { name: "senja", location: "senja di ufuk barat", timeOfDay: "sore" as const, narration: "Saat senja, biru tersebar habis", emphasis: ["biru"], atMs: 1500 },
];

async function main() {
  ensureFonts();
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : "/tmp/gfx-science";
  fs.mkdirSync(outDir, { recursive: true });
  console.log("plan:", planMotifs(scenes.map((s) => ({ location: s.location, timeOfDay: s.timeOfDay, purpose: "setup", seed: hashString(s.name) }))).join(" -> "));
  scenes.forEach((v, i) => {
    const canvas = createCanvas(720, 1280);
    const spec: SceneRenderSpec = {
      index: i,
      sceneCount: scenes.length,
      width: 720,
      height: 1280,
      durationMs: 6200,
      location: v.location,
      timeOfDay: v.timeOfDay,
      camera: "slow-push",
      mood: "hangat",
      characters: [],
      staging: [],
      palette: style.palette,
      style,
      subtitleStyle: style.subtitle,
      hudStyle: style.hud,
      hudData: { label: "SAINS HARIAN", clock: "10:24", episode: "EPISODE 1" },
      words: demo(v.narration, 260, 420, v.emphasis),
      seedKey: v.name,
      showHud: true,
      purpose: "setup",
      showSubtitles: true,
      subtitleNoFade: false,
      gfxMotif: ["sky", "prism", "molecules", "sunset"][i] as MotifId,
    };
    (renderSceneFrame as unknown as (ctx: unknown, s: SceneRenderSpec, t: number) => void)(canvas.getContext("2d"), spec, v.atMs);
    // also render just the illustration at full card size
    const card = createCanvas(720, 760);
    const ctx2 = card.getContext("2d");
    drawMotif(ctx2 as never, spec.gfxMotif as MotifId, {
      x: 0, y: 0, w: 720, h: 760, t: 3.1, p: 0.6, seed: hashString(v.name), theme: gfxTheme(style.palette, v.timeOfDay), timeOfDay: v.timeOfDay,
    });
    fs.writeFileSync(path.join(outDir, `${v.name}.png`), canvas.toBuffer("image/png"));
    fs.writeFileSync(path.join(outDir, `${v.name}-card.png`), card.toBuffer("image/png"));
  });
  console.log("wrote", outDir);
}
main();
