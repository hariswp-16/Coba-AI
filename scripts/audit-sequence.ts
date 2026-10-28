/**
 * Motion continuity audit.
 *
 * 1. Drives CharacterMotion through an action timeline and reports the largest
 *    per-frame joint jump. A snap reads as a huge single-frame delta, so this
 *    catches the "poses teleport" class of bug without eyeballing frames.
 * 2. Renders a short clip of a real scene through renderSceneFrame so the
 *    result can be inspected (and turned into a GIF).
 *
 *   npx tsx scripts/audit-sequence.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts } from "../src/lib/render/fonts";
import { CharacterMotion, type MotionInput } from "../src/lib/anim/motion";
import { renderSceneFrame, type SceneRenderSpec } from "../src/lib/anim/sceneRenderer";
import { STICKMAN_CINEMATIC } from "../src/lib/style/presets";
import type { Action } from "../src/lib/anim/poses";
import type { Ctx } from "../src/lib/anim/geometry";

const FPS = 30;
const DT = 1000 / FPS;

interface Step {
  action: Action;
  seconds: number;
  speedH: number;
}

const TIMELINE: Step[] = [
  { action: "idle", seconds: 1.0, speedH: 0 },
  { action: "point", seconds: 0.9, speedH: 0 },
  { action: "scared", seconds: 0.7, speedH: 0 },
  { action: "walk", seconds: 2.2, speedH: 0.27 },
  { action: "talk", seconds: 0.8, speedH: 0 },
  { action: "cry", seconds: 0.7, speedH: 0 },
];

function auditSmoothness() {
  const motion = new CharacterMotion(11);
  const heightPx = 560;
  let t = 0;
  let worst = 0;
  let worstAt = "";
  let prev: { arms: [number, number]; legs: [number, number]; lean: number } | null = null;
  const rows: string[] = [];

  for (const step of TIMELINE) {
    const frames = Math.round(step.seconds * FPS);
    let stepWorst = 0;
    for (let f = 0; f < frames; f++) {
      // ease the travel speed in and out so the walk starts and stops naturally
      const p = frames > 1 ? f / (frames - 1) : 1;
      const ramp = Math.min(1, Math.min(p, 1 - p) * 4);
      const input: MotionInput = {
        action: step.action,
        t,
        dtMs: DT,
        speedPx: step.speedH * heightPx * ramp,
        heightPx,
        speaking: true,
        mouth: "neutral",
      };
      const pose = motion.update(input);
      if (prev) {
        const delta = Math.max(
          Math.abs(pose.armNear[0] - prev.arms[0]),
          Math.abs(pose.armFar[0] - prev.arms[1]),
          Math.abs(pose.legNear[0] - prev.legs[0]),
          Math.abs(pose.legFar[0] - prev.legs[1]),
          Math.abs(pose.lean - prev.lean) * 2
        );
        if (delta > stepWorst) stepWorst = delta;
        if (delta > worst) {
          worst = delta;
          worstAt = `${step.action} @${(t).toFixed(2)}s`;
        }
      }
      prev = { arms: [pose.armNear[0], pose.armFar[0]], legs: [pose.legNear[0], pose.legFar[0]], lean: pose.lean };
      t += DT / 1000;
    }
    rows.push(`  ${step.action.padEnd(7)} max Δ ${stepWorst.toFixed(3)} rad/frame`);
  }

  const limit = 0.5; // rad per frame at 30 fps
  console.log("smoothness (max joint change per frame):");
  console.log(rows.join("\n"));
  console.log(`  worst overall ${worst.toFixed(3)} rad/frame at ${worstAt} ${worst < limit ? "PASS" : "FAIL"}`);
}

async function renderClip() {
  const { buildTimeline } = await import("../src/lib/render/timeline");
  const { sceneStaging } = await import("../src/lib/render/video");
  const style = STICKMAN_CINEMATIC;
  const width = 540;
  const height = 960;
  const durationMs = 4000;
  const outDir = "/tmp/motion-frames";
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const words = [
    { text: "IA", startMs: 300, endMs: 620, emphasis: false },
    { text: "BERJALAN", startMs: 640, endMs: 1150, emphasis: true },
    { text: "TANPA", startMs: 1200, endMs: 1500, emphasis: false },
    { text: "SUARA", startMs: 1520, endMs: 2000, emphasis: false },
    { text: "LALU", startMs: 2300, endMs: 2600, emphasis: false },
    { text: "BERHENTI", startMs: 2620, endMs: 3200, emphasis: true },
  ];

  // use the production staging so the audit exercises the same choreography
  const scene = {
    id: "s1",
    index: 0,
    purpose: "konflik" as const,
    narration: "Ia berjalan tanpa suara, lalu berhenti.",
    visualPrompt: "",
    imagePrompt: "",
    durationMs,
    location: "jalan kota yang basah oleh hujan",
    timeOfDay: "malam" as const,
    mood: "gelisah",
    weather: "hujan" as const,
    camera: "slow-push" as const,
    characters: [],
    transition: "cut" as const,
    emphasisWords: ["berhenti"],
    sfx: [],
    words,
    status: "draft" as const,
  };
  const timeline = buildTimeline(
    {
      title: "",
      logline: "",
      tone: "",
      setting: "",
      characters: style.characters,
      hook: "",
      ending: "",
      cta: "",
      totalDurationMs: durationMs,
      scenes: [scene],
      generatedBy: "audit",
      generatedAt: "",
    },
    { targetMs: durationMs }
  );
  const staging = sceneStaging(style, timeline.scenes);

  const spec: SceneRenderSpec = {
    index: 1,
    width,
    height,
    durationMs,
    location: scene.location,
    timeOfDay: "malam",
    weather: "hujan",
    camera: "slow-push",
    mood: "gelisah",
    characters: style.characters,
    staging: staging["s1"] ?? [],
    palette: style.palette,
    style,
    subtitleStyle: style.subtitle,
    hudStyle: style.hud,
    hudData: { label: "MALAM PERTAMA", clock: "21:49", episode: "EPISODE 2" },
    words,
    seedKey: "motion-audit",
    showHud: true,
    purpose: "konflik",
    showSubtitles: true,
  };
  console.log("staging:", JSON.stringify(staging["s1"]?.map((s) => ({ a: s.action, x: Math.round(s.x), to: s.xTo && Math.round(s.xTo), f: s.facing }))));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  const total = Math.round((durationMs / 1000) * FPS);
  for (let f = 0; f < total; f++) {
    renderSceneFrame(ctx, spec, (f / FPS) * 1000);
    const jpeg = await canvas.encode("jpeg", 92);
    fs.writeFileSync(path.join(outDir, `f${String(f).padStart(4, "0")}.jpg`), jpeg);
  }
  console.log(`rendered ${total} frames to ${outDir}`);
}

async function main() {
  ensureFonts();
  auditSmoothness();
  await renderClip();
}

main();
