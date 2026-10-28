import type { Pose, MouthShape } from "./character";
import { clamp } from "./geometry";
import { gaitCadence, gaitPose, isLocomotion, makePose, type Action } from "./poses";

export interface MotionInput {
  action: Action;
  /** seconds since the character entered the scene */
  t: number;
  /** milliseconds since the previous update */
  dtMs: number;
  /** horizontal travel speed in px/s; 0 means standing still */
  speedPx: number;
  heightPx: number;
  speaking: boolean;
  mouth: MouthShape;
  intensity?: number;
}

/** Critically damped spring: smooth acceleration, no overshoot, no jitter. */
class Spring {
  value: number;
  private velocity = 0;
  constructor(initial: number, private readonly omega: number) {
    this.value = initial;
  }
  step(target: number, dtS: number): number {
    // sub-stepping keeps the integration stable at low frame rates and makes
    // the motion frame-rate independent
    let remaining = dtS;
    while (remaining > 1e-6) {
      const h = Math.min(remaining, 0.012);
      const accel = this.omega * this.omega * (target - this.value) - 2 * this.omega * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      this.value = target;
      this.velocity = 0;
    }
    return this.value;
  }
  snap(value: number) {
    this.value = value;
    this.velocity = 0;
  }
}

const CHANNELS = [
  "lean",
  "chestLift",
  "headTilt",
  "headTurn",
  "armNear0",
  "armNear1",
  "armFar0",
  "armFar1",
  "brow",
  "look",
  "crouch",
  "sit",
  "bob",
] as const;

type Channel = (typeof CHANNELS)[number];

/**
 * Spring stiffness per channel, in rad/s. Tuned so a big gesture (hip -> face)
 * lands in roughly half a second: fast enough to read as acting, slow enough
 * that no joint jumps more than ~0.2 rad between two 30 fps frames.
 */
const OMEGA: Record<Channel, number> = {
  // arms carry the acting, so they respond first; the torso and hips move mass
  // and settle noticeably slower
  lean: 7,
  chestLift: 6,
  headTilt: 8,
  headTurn: 8,
  armNear0: 9,
  armNear1: 9,
  armFar0: 9,
  armFar1: 9,
  brow: 8,
  look: 9,
  crouch: 6.5,
  sit: 6.5,
  bob: 10,
};

// slow enough that easing a gesture into a stride never whips a joint
const CYCLE_OMEGA = 3.5;

function readChannel(p: Pose, key: Channel): number {
  switch (key) {
    case "armNear0":
      return p.armNear[0];
    case "armNear1":
      return p.armNear[1];
    case "armFar0":
      return p.armFar[0];
    case "armFar1":
      return p.armFar[1];
    default:
      return p[key];
  }
}

function writeChannel(p: Pose, key: Channel, v: number) {
  switch (key) {
    case "armNear0":
      p.armNear[0] = v;
      break;
    case "armNear1":
      p.armNear[1] = v;
      break;
    case "armFar0":
      p.armFar[0] = v;
      break;
    case "armFar1":
      p.armFar[1] = v;
      break;
    default:
      p[key] = v;
  }
}

/**
 * Per-character animation state.
 *
 * Two layers are combined:
 *  - a spring-smoothed *pose* layer, so switching action never pops the rig
 *    (the previous build rebuilt the pose from scratch every frame and snapped
 *    from `idle` to `point` between two frames);
 *  - a *gait* layer driven by distance travelled, cross-faded in and out, so a
 *    walk starts and stops smoothly and the feet never skate.
 */
export class CharacterMotion {
  private springs = new Map<Channel, Spring>();
  private cycle = 0;
  private cycleVelocity = 0;
  private phase = 0.25;
  /** timestamp of the last update, readable so callers can detect a seek */
  lastT = -1;
  private pose: Pose;

  constructor(private readonly seed: number) {
    const base = makePose("idle", 0, { seed });
    this.pose = base;
    for (const key of CHANNELS) {
      this.springs.set(key, new Spring(readChannel(base, key), OMEGA[key]));
    }
  }

  /** Advances the animation and returns the pose for this frame. */
  update(input: MotionInput): Pose {
    const dtMs = input.t <= this.lastT ? 0 : Math.max(0, Math.min(120, input.dtMs || 0));
    const dtS = dtMs / 1000;
    this.lastT = input.t;

    const locomotion = isLocomotion(input.action);
    const speedH = input.heightPx > 0 ? Math.abs(input.speedPx) / input.heightPx : 0;
    const moving = locomotion && speedH > 0.02;

    // target for the standing layer: a walking character still wants a calm
    // base pose underneath the cycle
    const baseAction: Action = locomotion ? "idle" : input.action;
    const target = makePose(baseAction, input.t, {
      seed: this.seed,
      mouth: input.mouth,
      speaking: input.speaking,
      intensity: input.intensity,
    });

    for (const key of CHANNELS) {
      const spring = this.springs.get(key)!;
      writeChannel(this.pose, key, spring.step(readChannel(target, key), dtS));
    }
    this.pose.mouth = target.mouth;
    this.pose.blink = target.blink;

    // ---- gait layer -------------------------------------------------------
    const cycleTarget = moving ? 1 : 0;
    const accel = CYCLE_OMEGA * CYCLE_OMEGA * (cycleTarget - this.cycle) - 2 * CYCLE_OMEGA * this.cycleVelocity;
    this.cycleVelocity += accel * dtS;
    this.cycle += this.cycleVelocity * dtS;
    if (!Number.isFinite(this.cycle)) {
      this.cycle = cycleTarget;
      this.cycleVelocity = 0;
    }
    this.cycle = clamp(this.cycle, 0, 1);

    if (moving) {
      // A standing character always steps off from the passing pose, never from
      // a full stride: that removes the leg snap when a walk starts.
      if (this.cycle < 0.02) this.phase = 0.25;
      // cadence follows the real travel speed, so the planted foot moves
      // backwards exactly as fast as the body moves forwards
      const cadence = gaitCadence(input.action as "walk" | "run", speedH);
      this.phase = (this.phase + cadence * dtS) % 1;
    }

    if (this.cycle > 0.001 && locomotion) {
      const cyclePose = gaitPose(input.action as "walk" | "run", this.phase, {
        seed: this.seed,
        mouth: input.mouth,
      });
      const w = this.cycle;
      for (const leg of ["legNear", "legFar"] as const) {
        this.pose[leg][0] = cyclePose[leg][0] * w + this.pose[leg][0] * (1 - w);
        this.pose[leg][1] = cyclePose[leg][1] * w + this.pose[leg][1] * (1 - w);
      }
      for (const key of CHANNELS) {
        const cycleValue = readChannel(cyclePose, key);
        const current = readChannel(this.pose, key);
        writeChannel(this.pose, key, current * (1 - w) + cycleValue * w);
      }
      this.pose.mouth = cyclePose.mouth;
      this.pose.blink = cyclePose.blink;
    } else if (!moving) {
      // keep the legs ticking toward their stopped pose even when the cycle is
      // fully faded out
      for (const leg of ["legNear", "legFar"] as const) {
        const targetLeg = target[leg];
        const k = 1 - Math.exp(-dtS / 0.12);
        this.pose[leg][0] += (targetLeg[0] - this.pose[leg][0]) * k;
        this.pose[leg][1] += (targetLeg[1] - this.pose[leg][1]) * k;
      }
    }

    return this.pose;
  }

  /** Jumps straight to a pose, used when a preview seeks to a new scene. */
  reset() {
    const base = makePose("idle", 0, { seed: this.seed });
    this.pose = base;
    for (const key of CHANNELS) this.springs.get(key)?.snap(readChannel(base, key));
    this.cycle = 0;
    this.cycleVelocity = 0;
    this.phase = 0.25;
    this.lastT = -1;
  }
}
