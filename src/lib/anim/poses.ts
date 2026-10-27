import type { Pose, MouthShape } from "./character";
import { clamp, mulberry32 } from "./geometry";

export type Action =
  | "idle"
  | "walk"
  | "run"
  | "talk"
  | "point"
  | "sit"
  | "crouch"
  | "lookUp"
  | "cry"
  | "scared"
  | "hold"
  | "reach"
  | "kneel"
  | "pray";

export const ACTIONS: Action[] = [
  "idle",
  "walk",
  "run",
  "talk",
  "point",
  "sit",
  "crouch",
  "lookUp",
  "cry",
  "scared",
  "hold",
  "reach",
  "kneel",
  "pray",
];

export const ACTION_LABELS: Record<Action, string> = {
  idle: "Berdiri diam",
  walk: "Berjalan",
  run: "Berlari",
  talk: "Berbicara",
  point: "Menunjuk",
  sit: "Duduk",
  crouch: "Jongkok",
  lookUp: "Melihat ke atas",
  cry: "Menangis",
  scared: "Ketakutan",
  hold: "Memegang benda",
  reach: "Meraih",
  kneel: "Berlutut",
  pray: "Berdoa",
};

export function neutralPose(): Pose {
  return {
    lean: 0,
    chestLift: 0,
    headTilt: 0,
    headTurn: 0,
    armNear: [0.06, 0.08],
    armFar: [-0.06, 0.08],
    legNear: [0.02, 0.02],
    legFar: [-0.02, 0.02],
    mouth: "neutral",
    brow: 0,
    look: 0,
    blink: 0,
    crouch: 0,
    sit: 0,
  };
}

export interface PoseOptions {
  seed?: number;
  intensity?: number;
  mouth?: MouthShape;
  speaking?: boolean;
  blinkPhase?: number;
}

/** Deterministic pose for a given action, elapsed time and seed. */
export function makePose(action: Action, t: number, opts: PoseOptions = {}): Pose {
  const p = neutralPose();
  const seed = opts.seed ?? 1;
  const rnd = mulberry32(seed);
  const phase = rnd() * Math.PI * 2;
  const breath = Math.sin(t * 1.5 + phase);
  const intensity = opts.intensity ?? 1;

  p.chestLift = breath * 0.012;
  p.headTilt = Math.sin(t * 0.8 + phase) * 0.05;
  p.look = Math.sin(t * 0.42 + phase) * 0.55;
  p.blink = blinkAmount(t, seed, opts.blinkPhase);

  switch (action) {
    case "idle": {
      p.lean = Math.sin(t * 0.7 + phase) * 0.012;
      p.armNear = [0.08 + breath * 0.03, 0.12 + Math.sin(t * 0.9 + phase) * 0.05];
      p.armFar = [-0.08 - breath * 0.03, 0.12 + Math.sin(t * 0.85 + phase + 1) * 0.05];
      p.legNear = [0.05, 0.03];
      p.legFar = [-0.05, 0.03];
      p.mouth = opts.mouth ?? "neutral";
      break;
    }
    case "walk": {
      const cadence = t * 5.2 + phase;
      const swing = Math.sin(cadence);
      p.lean = 0.04 + Math.abs(swing) * 0.012;
      p.legNear = [swing * 0.42, Math.max(0, -Math.sin(cadence + 0.9)) * 0.55];
      p.legFar = [-swing * 0.42, Math.max(0, -Math.sin(cadence + 0.9 + Math.PI)) * 0.55];
      p.armNear = [-swing * 0.32, 0.18 + Math.abs(swing) * 0.1];
      p.armFar = [swing * 0.32, 0.18 + Math.abs(swing) * 0.1];
      p.headTilt = Math.sin(cadence * 0.5) * 0.06;
      p.mouth = opts.mouth ?? "flat";
      break;
    }
    case "run": {
      const cadence = t * 8.4 + phase;
      const swing = Math.sin(cadence);
      p.lean = 0.2;
      p.legNear = [swing * 0.72, Math.max(0.15, -Math.sin(cadence + 1.1)) * 1.05];
      p.legFar = [-swing * 0.72, Math.max(0.15, -Math.sin(cadence + 1.1 + Math.PI)) * 1.05];
      p.armNear = [-swing * 0.85, 1.15];
      p.armFar = [swing * 0.85, 1.15];
      p.headTilt = 0.06;
      p.mouth = "open";
      break;
    }
    case "talk": {
      const g = Math.sin(t * 2.1 + phase);
      p.armNear = [0.35 + g * 0.18, 0.9 + Math.sin(t * 2.6) * 0.28];
      p.armFar = [-0.22 - g * 0.14, 0.75 + Math.cos(t * 2.2) * 0.22];
      p.lean = 0.03 + g * 0.012;
      p.headTilt = Math.sin(t * 2.4 + phase) * 0.08;
      p.headTurn = Math.sin(t * 1.7) * 0.3;
      p.brow = -0.1;
      p.mouth = opts.speaking === false ? "neutral" : "open";
      break;
    }
    case "point": {
      p.armNear = [1.35, 0.12 + Math.sin(t * 1.6) * 0.06];
      p.armFar = [-0.12, 0.3];
      p.lean = 0.06;
      p.headTurn = 0.35;
      p.look = 0.9;
      p.mouth = "open";
      break;
    }
    case "sit": {
      p.sit = 1;
      p.legNear = [1.35, -1.35];
      p.legFar = [1.3, -1.4];
      p.armNear = [0.5, 0.85];
      p.armFar = [-0.5, 0.85];
      p.lean = -0.05;
      p.mouth = opts.mouth ?? "neutral";
      break;
    }
    case "crouch": {
      p.crouch = 1;
      p.legNear = [0.85, -1.5];
      p.legFar = [-0.85, 1.5];
      p.lean = 0.22;
      p.armNear = [0.6, 0.5];
      p.armFar = [-0.5, 0.6];
      p.mouth = "worried";
      break;
    }
    case "lookUp": {
      p.headTilt = -0.42 + Math.sin(t * 1.2) * 0.05;
      p.lean = -0.06;
      p.armNear = [0.18, 0.25];
      p.armFar = [-0.16, 0.3];
      p.mouth = "worried";
      p.brow = -0.4;
      break;
    }
    case "cry": {
      const sob = Math.sin(t * 6.2);
      p.lean = 0.16;
      p.headTilt = 0.22 + sob * 0.03;
      // hands up covering the face
      p.armNear = [1.05, -2.35];
      p.armFar = [-1.05, 2.35];
      p.legNear = [0.12, 0.05];
      p.legFar = [-0.12, 0.05];
      p.mouth = "sad";
      p.brow = -0.8;
      p.blink = 0.35 + sob * 0.2;
      break;
    }
    case "scared": {
      const shake = Math.sin(t * 13) * 0.017 * intensity;
      p.lean = -0.14 + shake;
      p.headTilt = -0.08;
      // hands pulled up near the chest, elbows out
      p.armNear = [0.62 + Math.sin(t * 3) * 0.05, -2.05];
      p.armFar = [-0.62 - Math.sin(t * 3 + 1) * 0.05, -2.05];
      p.legNear = [0.16, 0.06];
      p.legFar = [-0.14, 0.06];
      p.mouth = "shock";
      p.brow = -0.9;
      p.look = Math.sin(t * 3) * 0.8;
      break;
    }
    case "hold": {
      p.armNear = [0.95, 1.55];
      p.armFar = [-0.95, -1.55];
      p.headTilt = 0.16;
      p.look = -0.2;
      p.mouth = "neutral";
      break;
    }
    case "reach": {
      p.armNear = [2.5, 0.1];
      p.armFar = [-0.2, 0.35];
      p.lean = 0.1;
      p.headTilt = -0.1;
      p.mouth = "open";
      p.brow = -0.2;
      break;
    }
    case "kneel": {
      p.sit = 1;
      p.legNear = [1.6, -2.1];
      p.legFar = [-0.4, 1.9];
      p.lean = 0.3;
      p.armNear = [0.7, 0.9];
      p.armFar = [-0.7, 0.9];
      p.mouth = "sad";
      break;
    }
    case "pray": {
      p.armNear = [1.05, -2.0];
      p.armFar = [-1.05, 2.0];
      p.lean = 0.04;
      p.headTilt = 0.12;
      p.mouth = "flat";
      p.blink = 0.85;
      break;
    }
  }

  if (opts.speaking) {
    const chatter = Math.sin(t * 11.3) * 0.5 + Math.sin(t * 7.7 + 1.3) * 0.5;
    if (p.mouth === "neutral" || p.mouth === "flat" || p.mouth === "open") {
      p.mouth = chatter > -0.15 ? "open" : "neutral";
    }
  }
  p.lean = clamp(p.lean, -0.5, 0.6);
  return p;
}

function blinkAmount(t: number, seed: number, override?: number): number {
  if (override !== undefined) return override;
  const period = 3.4 + (seed % 5) * 0.37;
  const x = (t + (seed % 7) * 0.4) % period;
  if (x < 0.09) return x / 0.09;
  if (x < 0.18) return 1 - (x - 0.09) / 0.09;
  return 0;
}

const MOOD_MOUTH: Record<string, MouthShape> = {
  tenang: "neutral",
  sedih: "sad",
  takut: "worried",
  tegang: "worried",
  marah: "angry",
  hangat: "smile",
  haru: "sad",
  kaget: "shock",
  misterius: "flat",
  dramatis: "worried",
};

export function mouthForMood(mood: string): MouthShape {
  return MOOD_MOUTH[mood] ?? "neutral";
}
