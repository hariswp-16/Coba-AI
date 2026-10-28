/**
 * Shared skeleton metrics, expressed as fractions of the character height.
 *
 * `character.ts` draws from these numbers and `poses.ts` solves the same rig
 * with inverse kinematics, so a pose authored as "hand at the chin" lands on
 * the chin at every render size. Keeping one source of truth also means a
 * change to the proportions can never silently desynchronise the animation
 * from the drawing.
 *
 * Coordinate system (identical to `character.ts`): origin at the hips, +y is
 * *down*, +x is the direction the character faces. A limb angle of 0 points
 * straight down, +PI/2 points forward, +PI points straight up.
 */

export const RIG = {
  torso: 0.25,
  neck: 0.025,
  /** horizontal shoulder offset from the body centre line */
  shoulderX: 0.0615,
  /** shoulder height relative to the hips */
  shoulderY: -0.235,
  upperArm: 0.135,
  foreArm: 0.115,
  thigh: 0.125,
  shin: 0.125,
  /** hip joint offset from the hips centre line */
  hipX: 0.023,
  /** how far the hips sink when crouch/sit is 1 */
  hipDrop: 0.42,
  /** head centre relative to the hips (upright character, no lean) */
  headCentreY: -0.442,
  headHalfW: 0.107,
} as const;

export const LEG_TOTAL = RIG.thigh + RIG.shin;
export const ARM_TOTAL = RIG.upperArm + RIG.foreArm;

export interface Vec {
  x: number;
  y: number;
}

/**
 * Height of the hips above the ground for a given crouch / sit / bob.
 * Feet authored at this height land exactly on the floor, which is what keeps
 * the cast from floating or sinking when the pose changes.
 */
export function hipHeight(crouch: number, sit: number, bob = 0): number {
  return LEG_TOTAL * (1 - RIG.hipDrop * crouch - RIG.hipDrop * sit) + bob;
}

export interface IkSolution {
  /** upper segment angle */
  a1: number;
  /** bend applied to the lower segment (a2 is relative to a1) */
  a2: number;
  joint: Vec;
  end: Vec;
  /** false when the target was out of reach and the limb is fully extended */
  reachable: boolean;
}

function forwardEnd(origin: Vec, a1: number, a2: number, l1: number, l2: number): Vec {
  return {
    x: origin.x + Math.sin(a1) * l1 + Math.sin(a1 + a2) * l2,
    y: origin.y + Math.cos(a1) * l1 + Math.cos(a1 + a2) * l2,
  };
}

/**
 * Two-bone IK for the rig above. Targets out of reach extend the limb toward
 * the target instead of exploding into NaN, and the elbow/knee is picked with
 * the joint bending toward +x (`bend: "forward"`) which is the natural
 * direction for a character seen from the side.
 */
export function ik2(
  origin: Vec,
  target: Vec,
  l1: number,
  l2: number,
  bend: "forward" | "backward" = "forward"
): IkSolution {
  const dx = (Number.isFinite(target.x) ? target.x : origin.x) - origin.x;
  const dy = (Number.isFinite(target.y) ? target.y : origin.y) - origin.y;
  const raw = Math.hypot(dx, dy);
  const maxD = (l1 + l2) * 0.998;
  const minD = Math.abs(l1 - l2) + 1e-4;
  const reachable = raw <= maxD && raw >= minD;
  const d = Math.min(maxD, Math.max(minD, raw || minD));
  const base = Math.atan2(dx, dy);
  const cosA = Math.max(-1, Math.min(1, (d * d + l1 * l1 - l2 * l2) / (2 * d * l1)));
  const cosB = Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)));
  const A = Math.acos(cosA);
  const B = Math.acos(cosB);

  const candidates = [1, -1].map((sign) => {
    const a1 = base - sign * A;
    const a2 = sign * (Math.PI - B);
    const joint = { x: origin.x + Math.sin(a1) * l1, y: origin.y + Math.cos(a1) * l1 };
    return { a1, a2, joint, end: forwardEnd(origin, a1, a2, l1, l2) };
  });
  // The elbow/knee should bulge in the facing direction; that keeps silhouettes
  // readable and stops forearms from folding back through the torso.
  const pick =
    bend === "forward"
      ? candidates[0].joint.x >= candidates[1].joint.x
        ? candidates[0]
        : candidates[1]
      : candidates[0].joint.x <= candidates[1].joint.x
        ? candidates[0]
        : candidates[1];
  return { ...pick, reachable };
}

/** Solves an arm from its shoulder to a hand target (positions in height units). */
export function armTo(target: Vec, side: "near" | "far" = "near", bend: "forward" | "backward" = "forward"): [number, number] {
  const origin = { x: side === "near" ? RIG.shoulderX : -RIG.shoulderX, y: RIG.shoulderY };
  const sol = ik2(origin, target, RIG.upperArm, RIG.foreArm, bend);
  return [sol.a1, sol.a2];
}

/**
 * Solves a leg from its hip to a foot target. `groundOffset` is the height of
 * the hips above the floor, so a foot placed at `y = groundOffset` is planted.
 */
export function legTo(target: Vec, side: "near" | "far", bend: "forward" | "backward" = "forward"): [number, number] {
  const origin = { x: side === "near" ? RIG.hipX : -RIG.hipX, y: 0 };
  const sol = ik2(origin, target, RIG.thigh, RIG.shin, bend);
  return [sol.a1, sol.a2];
}
