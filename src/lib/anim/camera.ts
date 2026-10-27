import { clamp, mulberry32, smoothstep } from "./geometry";

export type CameraMove = "slow-push" | "pan-left" | "pan-right" | "handheld" | "static" | "pull-out" | "shake";

export interface CameraState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export function cameraAt(
  move: CameraMove,
  progress: number,
  opts: { seed?: number; intensity?: number; width: number; height: number } = { width: 720, height: 1280 }
): CameraState {
  const p = clamp(progress, 0, 1);
  const seeded = mulberry32(opts.seed ?? 1);
  const phase = seeded() * Math.PI * 2;
  const intensity = opts.intensity ?? 1;
  const base: CameraState = { x: 0, y: 0, scale: 1.03, rotation: 0 };

  switch (move) {
    case "slow-push":
      return { ...base, scale: 1.02 + smoothstep(p) * 0.075 * intensity, y: -6 * smoothstep(p) };
    case "pull-out":
      return { ...base, scale: 1.1 - smoothstep(p) * 0.07 * intensity, y: -4 };
    case "pan-left":
      return { ...base, scale: 1.09, x: (18 - p * 36) * intensity };
    case "pan-right":
      return { ...base, scale: 1.09, x: (-18 + p * 36) * intensity };
    case "handheld":
      return {
        ...base,
        scale: 1.06,
        x: Math.sin(p * 9.3 + phase) * 5 * intensity,
        y: Math.cos(p * 7.1 + phase) * 4 * intensity,
        rotation: Math.sin(p * 5.2 + phase) * 0.0022 * intensity,
      };
    case "shake": {
      const decay = Math.max(0, 1 - p * 1.6);
      return {
        ...base,
        scale: 1.07 + decay * 0.02,
        x: Math.sin(p * 62 + phase) * 12 * decay * intensity,
        y: Math.cos(p * 57 + phase) * 9 * decay * intensity,
        rotation: Math.sin(p * 48 + phase) * 0.006 * decay * intensity,
      };
    }
    default:
      return { ...base, scale: 1.03 };
  }
}

export function applyCamera(
  ctx: { translate: (x: number, y: number) => void; scale: (x: number, y: number) => void; rotate: (a: number) => void; save: () => void; restore: () => void },
  cam: CameraState,
  width: number,
  height: number,
  parallax = 1
) {
  ctx.save();
  ctx.translate(width / 2 + cam.x * parallax, height / 2 + cam.y * parallax);
  ctx.rotate(cam.rotation * parallax);
  const s = 1 + (cam.scale - 1) * parallax;
  ctx.scale(s, s);
  ctx.translate(-width / 2, -height / 2);
}
