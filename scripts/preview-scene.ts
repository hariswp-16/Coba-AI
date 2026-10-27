import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts } from "../src/lib/render/fonts";
import { renderSceneFrame, type SceneRenderSpec } from "../src/lib/anim/sceneRenderer";
import { STICKMAN_CINEMATIC } from "../src/lib/style/presets";
import type { SceneWord } from "../src/lib/types";
import { sceneStaging } from "../src/lib/render/video";
import { buildTimeline } from "../src/lib/render/timeline";

ensureFonts();
const style = STICKMAN_CINEMATIC;

const words: SceneWord[] = [
  { text: "MALAM", startMs: 0, endMs: 400, emphasis: false },
  { text: "ITU", startMs: 400, endMs: 620, emphasis: false },
  { text: "SEMUA", startMs: 620, endMs: 1100, emphasis: false },
  { text: "BERUBAH", startMs: 1100, endMs: 1800, emphasis: true },
];

const variants = [
  { name: "solo-rumah", location: "rumah tua di ujung gang", timeOfDay: "malam" as const, purpose: "hook", mood: "tegang", framing: "solo" },
  { name: "duo-jalan", location: "jalan kota yang basah oleh hujan", timeOfDay: "malam" as const, purpose: "konflik", mood: "takut", framing: "duo" },
  { name: "kamar", location: "kamar kecil dengan lampu kuning", timeOfDay: "malam" as const, purpose: "klimaks", mood: "takut", framing: "solo" },
  { name: "teras", location: "teras rumah saat hujan", timeOfDay: "malam" as const, purpose: "konflik", mood: "gelisah", framing: "duo" },
  { name: "masjid", location: "masjid kampung", timeOfDay: "malam" as const, purpose: "hook", mood: "khidmat", framing: "solo" },
  { name: "siang", location: "halaman sekolah", timeOfDay: "siang" as const, purpose: "setup", mood: "hangat", framing: "duo" },
];

const outDir = path.resolve("public/preview");
fs.mkdirSync(outDir, { recursive: true });
for (const v of variants) {
  const scene = {
    id: "s1", index: 0, purpose: v.purpose as never, narration: "Malam itu semua berubah.", visualPrompt: "", imagePrompt: "",
    durationMs: 6000, location: v.location, timeOfDay: v.timeOfDay, mood: v.mood, weather: "hujan" as const,
    camera: "slow-push" as const, characters: [], transition: "cut" as const, emphasisWords: ["berubah"], sfx: [], words, status: "draft" as const,
  };
  const tl = buildTimeline({ title: "", logline: "", tone: "", setting: "", characters: style.characters, hook: "", ending: "", cta: "", totalDurationMs: 6000, scenes: [scene], generatedBy: "test", generatedAt: "" }, { targetMs: 6000 });
  const staging = sceneStaging(style, tl.scenes);
  const canvas = createCanvas(720, 1280);
  const ctx = canvas.getContext("2d") as never;
  const spec: SceneRenderSpec = {
    index: 0, width: 720, height: 1280, durationMs: 6000, location: v.location, timeOfDay: v.timeOfDay, weather: "hujan",
    camera: "slow-push", mood: v.mood, characters: style.characters, staging: staging["s1"], palette: style.palette, style,
    subtitleStyle: style.subtitle, hudStyle: style.hud, hudData: { label: "MALAM PERTAMA", clock: "21:49", episode: "EPISODE 2" },
    words, seedKey: `preview-${v.name}`, showHud: true, purpose: v.purpose,
  };
  renderSceneFrame(ctx, spec, 2200);
  fs.writeFileSync(path.join(outDir, `s-${v.name}.png`), canvas.toBuffer("image/png"));
}
console.log("ok");
