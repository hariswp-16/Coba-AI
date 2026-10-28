/**
 * Rig audit harness: renders every action as a contact sheet and checks the
 * numbers that used to fail silently (IK reach error, feet floating above or
 * sinking below the floor, stance foot sliding while the body advances).
 *
 *   npx tsx scripts/audit-motion.ts
 */
import fs from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts } from "../src/lib/render/fonts";
import { drawCharacter, type Pose } from "../src/lib/anim/character";
import { ACTIONS, gaitCadence, gaitPose, makePose, type Action } from "../src/lib/anim/poses";
import { RIG, ik2 } from "../src/lib/anim/rig";
import type { Ctx } from "../src/lib/anim/geometry";

const CELL_W = 300;
const CELL_H = 400;
const COLS = 6;

const HERO = {
  id: "utama",
  name: "Raka",
  gender: "pria" as const,
  age: "dewasa" as const,
  shirt: "#5c6b3f",
  pants: "#2f3238",
  skin: "#e8d3bb",
  hair: "#15110f",
  hairStyle: "pendek" as const,
  heightScale: 1,
};

function poseFor(action: Action, phase: number, t: number): Pose {
  return action === "walk" || action === "run" ? gaitPose(action, phase, { seed: 3 }) : makePose(action, t, { seed: 3 });
}

function draw(
  ctx: Ctx,
  action: Action,
  phase: number,
  t: number,
  px: number,
  groundY: number,
  h: number,
  facing: 1 | -1 = 1
) {
  return drawCharacter(ctx, HERO, { x: px, groundY, heightPx: h, facing, pose: poseFor(action, phase, t), shadowAlpha: 0.3 });
}

async function contactSheet() {
  const rows = ACTIONS.length;
  const canvas = createCanvas(CELL_W * COLS, CELL_H * rows);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  ctx.fillStyle = "#101018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ACTIONS.forEach((action, row) => {
    for (let col = 0; col < COLS; col++) {
      const phase = col / COLS;
      const t = (col / (COLS - 1)) * 2.4;
      ctx.save();
      ctx.translate(col * CELL_W, row * CELL_H);
      ctx.fillStyle = "#16161f";
      ctx.fillRect(0, CELL_H - 70, CELL_W, 70);
      ctx.strokeStyle = "#33334a";
      ctx.beginPath();
      ctx.moveTo(0, CELL_H - 70);
      ctx.lineTo(CELL_W, CELL_H - 70);
      ctx.stroke();
      draw(ctx, action, phase, t, CELL_W / 2, CELL_H - 70, 280);
      ctx.fillStyle = "#8b8ba3";
      ctx.font = "13px Poppins";
      ctx.fillText(`${action} ph=${phase.toFixed(2)} t=${t.toFixed(1)}`, 8, 18);
      ctx.restore();
    }
  });
  const out = "/home/user/audit-motion.png";
  await fs.writeFile(out, await canvas.encode("png"));
  console.log("contact sheet:", out, `${canvas.width}x${canvas.height}`);
}

/** IK must land the hand/knee exactly on its target when it is reachable. */
function checkIk() {
  let worst = 0;
  for (const [l1, l2] of [
    [RIG.upperArm, RIG.foreArm],
    [RIG.thigh, RIG.shin],
  ]) {
    for (let d = Math.abs(l1 - l2) + 0.002; d < (l1 + l2) * 0.95; d += 0.01) {
      for (let a = -Math.PI; a < Math.PI; a += 0.2) {
        const origin = { x: 0.01, y: -0.02 };
        const target = { x: origin.x + Math.sin(a) * d, y: origin.y + Math.cos(a) * d };
        const sol = ik2(origin, target, l1, l2);
        worst = Math.max(worst, Math.hypot(sol.end.x - target.x, sol.end.y - target.y));
      }
    }
  }
  console.log(`IK reach error (max): ${worst.toExponential(2)} ${worst < 1e-6 ? "PASS" : "FAIL"}`);
}

/** Every pose must keep both feet on (or above) the floor, never inside it. */
function checkGrounding() {
  const canvas = createCanvas(40, 40);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  const groundY = 380;
  const h = 300;
  let worstFloat = 0;
  let worstSink = 0;
  let floatAt = "";
  let sinkAt = "";
  for (const action of ACTIONS.filter((a) => a !== "walk" && a !== "run")) {
    for (let i = 0; i < 12; i++) {
      const phase = i / 12;
      const a = draw(ctx, action, phase, phase * 3, 20, groundY, h);
      for (const foot of [a.footNear, a.footFar]) {
        const gap = groundY - foot.y; // + = floating, - = through the floor
        if (gap > worstFloat) {
          worstFloat = gap;
          floatAt = `${action} ph=${phase.toFixed(2)}`;
        }
        if (-gap > worstSink) {
          worstSink = -gap;
          sinkAt = `${action} ph=${phase.toFixed(2)}`;
        }
      }
    }
  }
  console.log(`foot gap: float ${worstFloat.toFixed(1)}px (${floatAt}) / sink ${worstSink.toFixed(1)}px (${sinkAt})`);
  console.log(worstSink <= 1.5 ? "GROUNDING PASS" : "GROUNDING FAIL");
}

/**
 * Anti-skate: with the body advancing at the speed the gait was tuned for, a
 * planted foot must stay put in world space. Reported as a fraction of the
 * per-sample travel distance.
 */
function checkSkate() {
  const canvas = createCanvas(40, 40);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  const h = 560;
  const groundY = 900;
  const gaitSpeed = { walk: 0.27, run: 0.85 } as const;
  for (const action of ["walk", "run"] as const) {
    const speed = gaitSpeed[action] * h; // px/s
    const cadence = gaitCadence(action, gaitSpeed[action]);
    const N = 96;
    const dtS = 1 / (cadence * N); // seconds per sample
    const stance = action === "walk" ? 0.58 : 0.4;
    let slip = 0;
    let samples = 0;
    let prevNear: number | null = null;
    let prevFar: number | null = null;
    let prevPhase = -1;
    for (let i = 0; i <= N; i++) {
      const phase = (i / N) % 1;
      const bodyX = i * dtS * speed;
      const a = draw(ctx, action, phase, 0, bodyX, groundY, h);
      // only compare samples that are both inside the same stance: the
      // stance<->swing boundary is a lift-off, not a slide
      const nearStance = phase < stance && prevPhase < stance && prevPhase >= 0;
      const farStance = ((phase + 0.5) % 1) < stance && ((prevPhase + 0.5) % 1) < stance && prevPhase >= 0;
      if (i > 0) {
        if (nearStance && prevNear !== null) {
          slip = Math.max(slip, Math.abs(a.footNear.x - prevNear));
          samples++;
        }
        if (farStance && prevFar !== null) {
          slip = Math.max(slip, Math.abs(a.footFar.x - prevFar));
          samples++;
        }
      }
      prevNear = a.footNear.x;
      prevFar = a.footFar.x;
      prevPhase = phase;
    }
    const travel = speed * dtS;
    console.log(
      `${action}: body ${travel.toFixed(2)}px/sample, worst planted-foot slip ${slip.toFixed(3)}px ` +
        `(${((slip / travel) * 100).toFixed(1)}% of travel, ${samples} samples) ${slip < travel * 0.05 ? "PASS" : "FAIL"}`
    );
  }
}

async function main() {
  ensureFonts();
  checkIk();
  checkGrounding();
  checkSkate();
  await contactSheet();
}

main();
