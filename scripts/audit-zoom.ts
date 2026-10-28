/**
 * Zoomed pose inspector: renders a handful of actions large enough to judge
 * elbow/knee silhouettes, which is where rig bugs hide.
 *
 *   npx tsx scripts/audit-zoom.ts idle talk cry scared pray walk
 */
import fs from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts } from "../src/lib/render/fonts";
import { drawCharacter } from "../src/lib/anim/character";
import { gaitPose, makePose, type Action } from "../src/lib/anim/poses";
import type { Ctx } from "../src/lib/anim/geometry";

const CELL_W = 360;
const CELL_H = 520;
const PHASES = [0, 0.25, 0.5, 0.75];

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

const HERO_WOMAN = {
  ...HERO,
  id: "ibu",
  name: "Sari",
  gender: "wanita" as const,
  hairStyle: "hijab" as const,
  hijabColor: "#6c4a36",
  shirt: "#3f5a3c",
};

async function main() {
  ensureFonts();
  const args = process.argv.slice(2);
  const woman = args.includes("--wanita");
  const actions = (args.filter((a) => !a.startsWith("--")).length
    ? args.filter((a) => !a.startsWith("--"))
    : ["idle", "talk", "cry", "scared"]) as Action[];
  const spec = woman ? HERO_WOMAN : HERO;
  const canvas = createCanvas(CELL_W * PHASES.length, CELL_H * actions.length);
  const ctx = canvas.getContext("2d") as unknown as Ctx;
  ctx.fillStyle = "#0e0e15";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  actions.forEach((action, row) => {
    PHASES.forEach((phase, col) => {
      ctx.save();
      ctx.translate(col * CELL_W, row * CELL_H);
      ctx.fillStyle = "#151520";
      ctx.fillRect(0, CELL_H - 90, CELL_W, 90);
      ctx.strokeStyle = "#34344c";
      ctx.beginPath();
      ctx.moveTo(0, CELL_H - 90);
      ctx.lineTo(CELL_W, CELL_H - 90);
      ctx.stroke();
      const pose =
        action === "walk" || action === "run"
          ? gaitPose(action, phase, { seed: 3 })
          : makePose(action, phase * 3, { seed: 3 });
      drawCharacter(ctx, spec, {
        x: CELL_W / 2,
        groundY: CELL_H - 90,
        heightPx: 400,
        facing: 1,
        pose,
        shadowAlpha: 0.3,
      });
      ctx.fillStyle = "#9a9ab5";
      ctx.font = "15px Poppins";
      ctx.fillText(`${action}  ${phase.toFixed(2)}`, 10, 22);
      ctx.restore();
    });
  });
  const out = "/home/user/audit-zoom.png";
  await fs.writeFile(out, await canvas.encode("png"));
  console.log("wrote", out, `${canvas.width}x${canvas.height}`);
}

main();
