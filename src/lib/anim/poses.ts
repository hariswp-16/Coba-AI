import type { Pose, MouthShape } from "./character";
import { clamp, mulberry32 } from "./geometry";
import { LEG_TOTAL, RIG, hipHeight, ik2, legTo, type Vec } from "./rig";

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

export const LOCOMOTION: Action[] = ["walk", "run"];
export const isLocomotion = (action: Action) => action === "walk" || action === "run";

export function neutralPose(): Pose {
  const p = basePose();
  return p;
}

function basePose(): Pose {
  const p: Pose = {
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
    bob: 0,
  };
  // grounded default stance: feet land exactly on the floor
  const gh = hipHeight(0, 0);
  p.legNear = legTo({ x: 0.05, y: gh }, "near");
  p.legFar = legTo({ x: -0.05, y: gh }, "far");
  return p;
}

const HEAD_H = RIG.headHalfW * 2 * 2.1;

interface Anchors {
  shoulderNear: Vec;
  shoulderFar: Vec;
  head: Vec;
  /** hand target just in front of the cheek */
  cheek: Vec;
  chin: Vec;
  chest: Vec;
  belly: Vec;
}

/**
 * Where the shoulders and head actually end up for a given lean, using the
 * same chain `character.ts` draws with. Pose targets are authored against
 * these anchors so "hand on the chin" survives every lean and head tilt.
 */
function anchors(lean: number, headTilt: number): Anchors {
  const chest = { x: Math.sin(lean) * RIG.torso, y: -Math.cos(lean) * RIG.torso };
  const neck = {
    x: chest.x + Math.sin(lean * 1.15) * RIG.neck,
    y: chest.y - Math.cos(lean * 1.15) * RIG.neck,
  };
  const head = {
    x: neck.x + Math.sin(lean * 1.1 + headTilt * 0.35) * HEAD_H * 0.62,
    y: neck.y - Math.cos(lean * 1.1 + headTilt * 0.35) * HEAD_H * 0.62,
  };
  return {
    shoulderNear: { x: chest.x + RIG.shoulderX, y: chest.y + RIG.torso * 0.08 },
    shoulderFar: { x: chest.x - RIG.shoulderX, y: chest.y + RIG.torso * 0.08 },
    head,
    cheek: { x: head.x + RIG.headHalfW * 0.55, y: head.y + HEAD_H * 0.12 },
    chin: { x: head.x + RIG.headHalfW * 0.45, y: head.y + HEAD_H * 0.42 },
    chest: { x: head.x * 0.35 + RIG.shoulderX * 0.5, y: -0.165 },
    belly: { x: 0.085, y: -0.105 },
  };
}

/**
 * Hand target expressed as a swing angle from the shoulder (0 = straight down,
 * + = forward) plus a reach radius. Authoring the hanging/walking arm this way
 * keeps it *outside* the torso silhouette: an absolute inboard target made the
 * forearm paint a stripe across the shirt.
 */
function polar(a: Anchors, side: "near" | "far", angle: number, radius: number): Vec {
  const sh = side === "near" ? a.shoulderNear : a.shoulderFar;
  return { x: sh.x + Math.sin(angle) * radius, y: sh.y + Math.cos(angle) * radius };
}

/**
 * Arm angles for a hand target authored in body space (hips at the origin).
 * `character.ts` rotates arm angles by the body lean, so the lean is removed
 * here to keep the hand exactly on its target.
 */
function armAt(
  a: Anchors,
  target: Vec,
  side: "near" | "far",
  lean: number,
  bend: "forward" | "backward" = "backward"
): [number, number] {
  const origin = side === "near" ? a.shoulderNear : a.shoulderFar;
  // A human elbow trails behind the hand; letting it lead made every gesture
  // look like a chicken wing poking out of the chest.
  const sol = ik2(origin, target, RIG.upperArm, RIG.foreArm, bend);
  return [sol.a1 - lean, sol.a2];
}

export interface PoseOptions {
  seed?: number;
  intensity?: number;
  mouth?: MouthShape;
  speaking?: boolean;
  blinkPhase?: number;
  /** locomotion phase in cycles (0..1 per full stride pair) */
  phase?: number;
  /** travel speed in height units per second, used by the gait */
  speed?: number;
}

/** Deterministic pose for a given action, elapsed time and seed. */
export function makePose(action: Action, t: number, opts: PoseOptions = {}): Pose {
  if (isLocomotion(action)) {
    // A locomotion cycle is driven by distance travelled, not by a wall clock:
    // falling back to a time-based phase keeps previews alive without skating.
    const phase = opts.phase ?? (t * (action === "run" ? 1.35 : 0.95)) % 1;
    return gaitPose(action, phase, opts);
  }
  const p = basePose();
  const seed = opts.seed ?? 1;
  const rnd = mulberry32(seed);
  const phase = rnd() * Math.PI * 2;
  const breath = Math.sin(t * 1.5 + phase);
  const intensity = opts.intensity ?? 1;

  p.chestLift = breath * 0.012;
  p.headTilt = Math.sin(t * 0.8 + phase) * 0.05;
  p.look = clamp(Math.sin(t * 0.42 + phase) * 0.55, -0.9, 0.9);
  p.blink = blinkAmount(t, seed, opts.blinkPhase);
  p.mouth = opts.mouth ?? "neutral";

  let crouch = 0;
  let sit = 0;
  let lean = 0;
  let headTilt = p.headTilt;
  let headTurn = 0;
  let handNear: Vec = { x: 0.09, y: -0.02 };
  let handFar: Vec = { x: -0.02, y: -0.03 };
  let footNearX = 0.05;
  let footFarX = -0.05;
  let footNearLift = 0;
  let footFarLift = 0;
  let bendNear: "forward" | "backward" = "backward";
  let bendFar: "forward" | "backward" = "backward";
  let mouth: MouthShape | null = null;

  switch (action) {
    case "idle": {
      lean = Math.sin(t * 0.7 + phase) * 0.012;
      handNear = polar(anchors(lean, headTilt), "near", 0.3 + breath * 0.02, 0.245);
      handFar = polar(anchors(lean, headTilt), "far", 0.12 + Math.sin(t * 0.85 + phase + 1) * 0.03, 0.243);
      break;
    }
    case "talk": {
      const g = Math.sin(t * 2.1 + phase);
      lean = 0.03 + g * 0.012;
      // gestures stay in front of the chest so the hand never clips the face
      handNear = polar(anchors(lean, headTilt), "near", 0.72 + g * 0.1, 0.2);
      handFar = polar(anchors(lean, headTilt), "far", 0.36 + Math.cos(t * 2.2) * 0.09, 0.19);
      headTilt = Math.sin(t * 2.4 + phase) * 0.07;
      headTurn = clamp(Math.sin(t * 1.7) * 0.3, -0.5, 0.5);
      p.brow = -0.1;
      mouth = opts.speaking === false ? "neutral" : "open";
      break;
    }
    case "point": {
      lean = 0.06;
      handNear = { x: 0.36, y: -0.26 };
      handFar = { x: -0.012, y: -0.06 };
      headTurn = 0.35;
      p.look = 0.9;
      footNearX = 0.07;
      mouth = "open";
      break;
    }
    case "sit": {
      sit = 1;
      // perched: hips sunk, knees forward, feet planted under the knees
      footNearX = 0.135;
      footFarX = 0.105;
      handNear = polar(anchors(lean, headTilt), "near", 0.75, 0.225);
      handFar = polar(anchors(lean, headTilt), "far", 0.62, 0.215);
      lean = -0.04;
      break;
    }
    case "crouch": {
      crouch = 1;
      footNearX = 0.11;
      footFarX = -0.09;
      handNear = polar(anchors(lean, headTilt), "near", 0.82, 0.22);
      handFar = polar(anchors(lean, headTilt), "far", 0.7, 0.21);
      lean = 0.2;
      headTilt = 0.1;
      mouth = "worried";
      break;
    }
    case "lookUp": {
      headTilt = -0.42 + Math.sin(t * 1.2) * 0.05;
      lean = -0.06;
      handNear = polar(anchors(lean, headTilt), "near", 0.3, 0.243);
      handFar = polar(anchors(lean, headTilt), "far", 0.12, 0.24);
      mouth = "worried";
      p.brow = -0.4;
      break;
    }
    case "cry": {
      const sob = Math.sin(t * 4.6);
      lean = 0.14 + sob * 0.008;
      headTilt = 0.26 + sob * 0.02;
      // near hand folded up in front of the face, far hand clutched at the chest
      // hand rises to the eye: the elbow has to travel *above* the shoulder for
      // that reach, so this is the one pose that wants the forward solution
      handNear = { x: 0.17 + sob * 0.005, y: -0.46 };
      // the far hand comes up to the other cheek: both forearms shield the face
      handFar = { x: 0.115 - sob * 0.004, y: -0.4 };
      bendNear = "forward";
      bendFar = "forward";
      footNearX = 0.055;
      footFarX = -0.045;
      mouth = "sad";
      p.brow = -0.8;
      p.blink = 0.55 + sob * 0.15;
      p.chestLift = sob * 0.02;
      break;
    }
    case "scared": {
      const shake = Math.sin(t * 13) * 0.012 * intensity;
      lean = -0.12 + shake;
      headTilt = -0.06;
      // forearms thrown up between the face and the threat: the classic
      // "recoil" read, and the only arm pose that clears the big head
      handNear = { x: 0.205 + Math.sin(t * 3) * 0.006, y: -0.44 };
      handFar = { x: 0.125 + Math.cos(t * 3.4) * 0.006, y: -0.29 };
      bendNear = "forward";
      bendFar = "forward";
      footNearX = 0.075;
      footFarX = -0.07;
      mouth = "shock";
      p.brow = -0.9;
      p.look = Math.sin(t * 3) * 0.7;
      break;
    }
    case "hold": {
      lean = -0.02;
      handNear = polar(anchors(lean, headTilt), "near", 0.95, 0.215);
      handFar = polar(anchors(lean, headTilt), "far", 0.75, 0.2);
      headTilt = 0.16;
      p.look = -0.2;
      break;
    }
    case "reach": {
      lean = 0.1;
      // out of reach on purpose: the solver extends the arm toward it
      handNear = { x: 0.215, y: -0.47 };
      handFar = { x: 0.08, y: -0.1 };
      headTilt = -0.12;
      footNearX = 0.06;
      footFarX = -0.065;
      mouth = "open";
      p.brow = -0.2;
      p.look = 0.5;
      break;
    }
    case "kneel": {
      crouch = 0.86;
      lean = 0.24;
      // near foot planted forward, far leg folded back with the knee low
      footNearX = 0.115;
      footFarX = -0.16;
      footNearLift = 0;
      footFarLift = 0.012;
      handNear = polar(anchors(lean, headTilt), "near", 0.9, 0.21);
      handFar = polar(anchors(lean, headTilt), "far", 0.72, 0.2);
      headTilt = 0.18;
      mouth = "sad";
      break;
    }
    case "pray": {
      lean = 0.03;
      // both hands meet in front of the chest, head bowed, eyes closed
      // clasped at the chin: a tight fold is unavoidable here, so the target
      // sits high enough that the elbow drops toward the belly instead of
      // shooting forward
      handNear = { x: 0.145, y: -0.29 };
      handFar = { x: 0.1, y: -0.28 };
      headTilt = 0.14;
      p.blink = 0.85;
      p.chestLift = Math.sin(t * 1.1) * 0.014;
      mouth = "flat";
      footNearX = 0.045;
      footFarX = -0.045;
      break;
    }
  }

  if (mouth) p.mouth = mouth;
  p.lean = clamp(lean, -0.5, 0.6);
  p.headTilt = headTilt;
  p.headTurn = clamp(headTurn, -0.6, 0.6);
  p.crouch = crouch;
  p.sit = sit;

  const a = anchors(p.lean, p.headTilt);
  p.armNear = armAt(a, handNear, "near", p.lean, bendNear);
  p.armFar = armAt(a, handFar, "far", p.lean, bendFar);

  const gh = hipHeight(crouch, sit);
  p.legNear = legTo({ x: footNearX, y: gh - footNearLift }, "near", "forward");
  p.legFar = legTo({ x: footFarX, y: gh - footFarLift }, "far", "forward");

  if (opts.speaking) p.mouth = speakingMouth(p.mouth, t);
  return p;
}

/** Opens a rest mouth in sync with a chatter envelope while narration plays. */
export function speakingMouth(base: MouthShape, t: number): MouthShape {
  if (base !== "neutral" && base !== "flat" && base !== "open") return base;
  const chatter = Math.sin(t * 11.3) * 0.5 + Math.sin(t * 7.7 + 1.3) * 0.5;
  return chatter > -0.2 ? "open" : "neutral";
}

export interface GaitOptions {
  stride?: number;
  lift?: number;
  stance?: number;
  bob?: number;
  lean?: number;
  seed?: number;
  intensity?: number;
  mouth?: MouthShape;
  armSwing?: number;
}

const GAIT: Record<"walk" | "run", Required<Omit<GaitOptions, "seed" | "intensity" | "mouth">>> = {
  walk: { stride: 0.07, lift: 0.042, stance: 0.58, bob: 0.004, lean: 0.05, armSwing: 0.07 },
  run: { stride: 0.105, lift: 0.075, stance: 0.4, bob: 0.01, lean: 0.17, armSwing: 0.105 },
};

/**
 * How far the hips must sink for a stride to be reachable by a straight leg.
 * Without this the solver clamps and the planted foot hovers a few pixels off
 * the floor on every contact frame - the classic "moon walk" tell.
 */
function strideDrop(stride: number): number {
  const reach = stride + RIG.hipX;
  return LEG_TOTAL - Math.sqrt(Math.max(1e-6, LEG_TOTAL * LEG_TOTAL - reach * reach)) + 0.002;
}

/**
 * Foot position (body space) for a normalised gait phase. During the stance the
 * foot travels backwards at exactly the speed the body advances, which is what
 * removes the classic "ice skating" look of a sine-driven walk.
 */
function footCycle(s: number, stride: number, lift: number, stance: number): { x: number; y: number } {
  const p = ((s % 1) + 1) % 1;
  if (p < stance) {
    const k = p / stance;
    return { x: stride * (1 - 2 * k), y: 0 };
  }
  const k = (p - stance) / (1 - stance);
  const eased = -(Math.cos(Math.PI * k) - 1) / 2;
  return { x: -stride + 2 * stride * eased, y: -lift * Math.sin(Math.PI * k) };
}

/** Pose for one frame of a walk / run cycle. */
export function gaitPose(action: "walk" | "run", phase: number, opts: GaitOptions = {}): Pose {
  const cfg = { ...GAIT[action], ...opts } as typeof GAIT["walk"];
  const p = basePose();
  const seed = opts.seed ?? 1;
  const rnd = mulberry32(seed);
  const wobble = rnd() * Math.PI * 2;

  const near = footCycle(phase, cfg.stride, cfg.lift, cfg.stance);
  const far = footCycle(phase + 0.5, cfg.stride, cfg.lift, cfg.stance);
  // hips ride lowest at contact (when the legs are at full stretch) and lift
  // again through mid-stance, which is also what makes a walk read as weight
  const bobAmp = Math.max(cfg.bob, strideDrop(cfg.stride));
  const bob = -bobAmp * (0.5 + 0.5 * Math.cos(phase * Math.PI * 4));
  const gh = hipHeight(0, 0, bob);

  p.bob = bob;
  p.lean = cfg.lean + Math.sin(phase * Math.PI * 4 + wobble) * 0.008;
  p.chestLift = Math.cos(phase * Math.PI * 4) * 0.008;
  p.headTilt = action === "run" ? cfg.lean * 0.35 : Math.sin(phase * Math.PI * 2) * 0.04;
  p.headTurn = Math.sin(phase * Math.PI * 2 + wobble) * 0.06;
  p.look = Math.sin(phase * Math.PI * 2) * 0.2;
  p.blink = blinkAmount(phase * 1.4, seed);
  p.mouth = opts.mouth ?? (action === "run" ? "open" : "flat");

  const a = anchors(p.lean, p.headTilt);
  const swing = Math.sin(phase * Math.PI * 2);
  // swing the hand around the shoulder at (almost) full extension: the arm
  // stays outside the torso and the elbow never crosses the shirt
  const radius = action === "run" ? 0.205 : 0.243;
  p.armNear = armAt(a, polar(a, "near", 0.24 + cfg.armSwing * 3.4 * swing, radius), "near", p.lean);
  p.armFar = armAt(a, polar(a, "far", 0.16 - cfg.armSwing * 3.4 * swing, radius - 0.004), "far", p.lean);

  p.legNear = legTo({ x: RIG.hipX * 0.5 + near.x, y: gh + near.y }, "near", "forward");
  p.legFar = legTo({ x: -RIG.hipX * 0.5 + far.x, y: gh + far.y }, "far", "forward");
  return p;
}

/**
 * Cadence that makes the stance foot stay glued to the floor for a given travel
 * speed. During a stance the foot covers 2*stride of body-relative distance in
 * `stance` of a cycle, so v = 2*stride / (stance * T) => T = 2*stride /
 * (stance * v). Clamped to a human range so extremely slow or fast travel turns
 * into shorter/longer strides instead of a cartoon blur.
 */
export function gaitCadence(action: "walk" | "run", speed: number): number {
  const cfg = GAIT[action];
  const cycles = (speed * cfg.stance) / (2 * cfg.stride);
  // no lower clamp: during the accel/decel ramps the cadence must keep
  // tracking the instant speed, otherwise the planted foot starts to slip
  return clamp(cycles, 0.06, action === "run" ? 2.3 : 1.6);
}

/** Travel speed in height units per second that a natural gait implies. */
export function naturalGaitSpeed(action: "walk" | "run", cadence: number): number {
  const cfg = GAIT[action];
  return (2 * cfg.stride * cadence) / cfg.stance;
}

/** Half stride (height units) for a gait, so callers can size travel distance. */
export function gaitStride(action: "walk" | "run"): number {
  return GAIT[action].stride;
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
