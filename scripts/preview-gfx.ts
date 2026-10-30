/**
 * Renders motion-graphics frames for a handful of scenes so the look can be
 * inspected without running a full encode.
 *
 *   npx tsx scripts/preview-gfx.ts [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts } from "../src/lib/render/fonts";
import { renderSceneFrame, type SceneRenderSpec } from "../src/lib/anim/sceneRenderer";
import { MOTION_GRAPHICS } from "../src/lib/style/presets";
import { planMotifs } from "../src/lib/anim/gfx/motifs";
import { hashString } from "../src/lib/anim/geometry";
import type { SceneWord } from "../src/lib/types";
import type { Ctx } from "../src/lib/anim/geometry";

const style = MOTION_GRAPHICS;

const demo = (text: string, startMs: number, perWord = 300, emphasis: string[] = []): SceneWord[] =>
  text.split(" ").map((t, i) => ({
    text: t,
    startMs: startMs + i * perWord,
    endMs: startMs + (i + 1) * perWord - 30,
    emphasis: emphasis.includes(t.replace(/[.,!?]/g, "").toLowerCase()),
  }));

const variants: { name: string; location: string; timeOfDay: SceneRenderSpec["timeOfDay"]; weather?: string; purpose: string; mood: string; narration: string; emphasis: string[]; atMs: number; camera?: SceneRenderSpec["camera"] }[] = [
  { name: "kota", location: "jalan kota yang basah oleh hujan", timeOfDay: "malam", weather: "hujan", purpose: "hook", mood: "tegang", narration: "Malam itu semua berubah", emphasis: ["berubah"], atMs: 2600 },
  { name: "jendela", location: "kamar kecil dengan lampu kuning", timeOfDay: "malam", purpose: "konflik", mood: "sedih", narration: "Ibu memperingatkan Raka untuk tidak keluar", emphasis: ["tidak"], atMs: 3000 },
  { name: "sumur", location: "sumur tua di belakang rumah", timeOfDay: "malam", weather: "gerimis", purpose: "klimaks", mood: "takut", narration: "Ada surat lama di dasar sumur", emphasis: ["surat"], atMs: 2500 },
  { name: "masjid", location: "masjid kampung", timeOfDay: "malam", purpose: "resolusi", mood: "khidmat", narration: "Ia berdoa sampai fajar", emphasis: ["fajar"], atMs: 2200 },
  { name: "bukit-siang", location: "halaman sekolah di pagi hari", timeOfDay: "pagi", purpose: "setup", mood: "hangat", narration: "Kampung ini selalu punya cerita", emphasis: ["cerita"], atMs: 2400 },
  { name: "cta", location: "pintu rumah tua", timeOfDay: "malam", purpose: "cta", mood: "dramatis", narration: "Pilih hadapi atau lari", emphasis: [], atMs: 2600 },
  { name: "terang-kota", location: "jalan kota di siang hari", timeOfDay: "siang", purpose: "setup", mood: "hangat", narration: "Kota ini menyimpan seribu rahasia", emphasis: ["seribu"] as string[], atMs: 2400 },
  { name: "rumah-2", location: "rumah tua di ujung gang", timeOfDay: "malam", purpose: "konflik", mood: "tegang", narration: "Pintu itu tidak pernah dibuka", emphasis: ["tidak"], atMs: 2200 },
  { name: "lampu", location: "kamar kecil dengan lampu kuning", timeOfDay: "malam", purpose: "setup", mood: "sedih", narration: "Lampu minyak itu masih menyala", emphasis: ["menyala"], atMs: 2200 },
  { name: "rumah-3", location: "dalam rumah yang sama", timeOfDay: "malam", purpose: "klimaks", mood: "takut", narration: "Suara itu kembali memanggil", emphasis: ["kembali"], atMs: 2000 },
];

async function main() {
  ensureFonts();
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : "/tmp/gfx";
  fs.mkdirSync(outDir, { recursive: true });
  const W = 720;
  const H = 1280;
  const plan = planMotifs(
    variants.map((v) => ({
      location: v.location,
      timeOfDay: v.timeOfDay,
      weather: v.weather,
      purpose: v.purpose,
      seed: hashString(`gfx-${v.name}`),
    }))
  );
  console.log("motif plan:", plan.join(" -> "));
  for (const v of variants) {
    const words = demo(v.narration, 420, Math.max(240, Math.round(4600 / Math.max(1, v.narration.split(' ').length - 1))), v.emphasis);
    const spec: SceneRenderSpec = {
      index: variants.indexOf(v),
      width: W,
      height: H,
      durationMs: 6200,
      location: v.location,
      timeOfDay: v.timeOfDay,
      weather: v.weather,
      camera: "slow-push",
      mood: v.mood,
      characters: [],
      staging: [],
      palette: style.palette,
      style,
      subtitleStyle: style.subtitle,
      hudStyle: style.hud,
      hudData: { label: "MALAM MENCEKAM", clock: "21:49", episode: "EPISODE 2" },
      words,
      seedKey: `gfx-${v.name}`,
      showHud: true,
      purpose: v.purpose,
      ctaPills: v.purpose === "cta" ? ["MENYUSUL TEMANMU", "BAWA ADIK PULANG"] : undefined,
      ctaQuestion: v.purpose === "cta" ? "APA PILIHANMU?" : undefined,
      showSubtitles: true,
      subtitleNoFade: true,
      sceneCount: variants.length,
      gfxMotif: plan[variants.indexOf(v)],
    };
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d") as unknown as Ctx;
    renderSceneFrame(ctx, spec, v.atMs);
    fs.writeFileSync(path.join(outDir, `${v.name}.png`), await canvas.encode("png"));
    console.log("wrote", v.name, "->", plan[variants.indexOf(v)]);
  }
}

main();
