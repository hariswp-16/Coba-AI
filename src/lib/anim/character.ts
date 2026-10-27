import type { CharacterSpec } from "../types";
import { Ctx, rgba, shade, roundRect, clamp } from "./geometry";

export type MouthShape = "neutral" | "sad" | "worried" | "open" | "smile" | "angry" | "shock" | "flat";

export interface Pose {
  lean: number;
  chestLift: number;
  headTilt: number;
  headTurn: number;
  armNear: [number, number];
  armFar: [number, number];
  legNear: [number, number];
  legFar: [number, number];
  mouth: MouthShape;
  brow: number;
  look: number;
  blink: number;
  crouch: number;
  sit: number;
}

export interface CharacterDrawOptions {
  x: number;
  groundY: number;
  heightPx: number;
  facing: 1 | -1;
  pose: Pose;
  heldItem?: "botol" | "ponsel" | "tas" | "senter" | "payung" | "none";
  rimLight?: { color: string; strength: number };
  shadowAlpha?: number;
  gender?: CharacterSpec["gender"];
  hairStyle?: CharacterSpec["hairStyle"];
  hijabColor?: string;
  expression?: CharacterSpec["face"];
  detail?: number;
}

export interface CharacterAnchors {
  head: { x: number; y: number; r: number };
  headTop: { x: number; y: number };
  handNear: { x: number; y: number };
  handFar: { x: number; y: number };
  feetY: number;
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

const DEFAULT_COLORS = {
  skin: "#e8d3bb",
  skinShade: "#d8bfa3",
  hair: "#15110f",
  outline: "#241a12",
};

/**
 * Draws a jointed 2D cartoon character in the "stickman with clothes" style of
 * the reference videos: beige skin, ball joints, simple torso, expressive face.
 */
export function drawCharacter(
  ctx: Ctx,
  spec: Pick<CharacterSpec, "id" | "name"> & Partial<CharacterSpec>,
  opt: CharacterDrawOptions
): CharacterAnchors {
  const h = opt.heightPx;
  const skin = spec.skin || DEFAULT_COLORS.skin;
  const hair = spec.hair || DEFAULT_COLORS.hair;
  const shirt = spec.shirt || "#5c6b3f";
  const pants = spec.pants || "#2f3238";
  const outline = DEFAULT_COLORS.outline;
  const detail = opt.detail ?? 1;
  const isChild = spec.age === "anak" || spec.gender === "anak";
  const isWoman = spec.gender === "wanita";

  // Proportions (relative to total height)
  const headR = h * (isChild ? 0.15 : 0.128);
  const headH = headR * (isChild ? 2.2 : 2.1);
  const headW = headR * (isChild ? 1.82 : 1.68);
  const torsoLen = h * 0.25;
  const neckLen = h * 0.025;
  const hipW = h * 0.058;
  const shoulderW = h * 0.075;
  const limbW = Math.max(7, h * 0.042);
  const armLen = h * 0.135;
  const foreArmLen = h * 0.115;
  const thighLen = h * 0.125;
  const shinLen = h * 0.125;
  const jointR = limbW * 0.68;

  const pose = opt.pose;
  const facing = opt.facing;

  // Root (hips) position: legs extend down from hips to ground.
  const legTotal = thighLen + shinLen;
  const hipY = opt.groundY - legTotal * (1 - pose.crouch * 0.42) - pose.sit * legTotal * 0.42;

  ctx.save();
  ctx.translate(opt.x, hipY);
  // soft key light so the character always separates from a dark background
  {
    const lift = h * 0.42;
    const g = ctx.createRadialGradient(0, -lift, h * 0.02, 0, -lift, h * 0.5);
    g.addColorStop(0, "rgba(255,226,186,0.16)");
    g.addColorStop(0.55, "rgba(255,214,170,0.07)");
    g.addColorStop(1, "rgba(255,214,170,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -lift, h * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.scale(facing, 1);

  const lean = pose.lean;
  const chest = { x: Math.sin(lean) * torsoLen, y: -Math.cos(lean) * torsoLen };
  const neck = {
    x: chest.x + Math.sin(lean * 1.15) * neckLen,
    y: chest.y - Math.cos(lean * 1.15) * neckLen,
  };
  const headCenter = {
    x: neck.x + Math.sin(lean * 1.1 + pose.headTilt * 0.35) * headH * 0.62,
    y: neck.y - Math.cos(lean * 1.1 + pose.headTilt * 0.35) * headH * 0.62,
  };

  // --- shadow on the floor
  const shadowA = opt.shadowAlpha ?? 0.32;
  if (shadowA > 0) {
    const g = ctx.createRadialGradient(0, opt.groundY - hipY, 0, 0, opt.groundY - hipY, h * 0.28);
    g.addColorStop(0, `rgba(0,0,0,${shadowA})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(0, opt.groundY - hipY);
    ctx.scale(1, 0.24);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const shoulder = { x: chest.x, y: chest.y + torsoLen * 0.06 };
  const handNear = solveLimb(shoulder, pose.armNear[0] + lean, armLen, pose.armNear[1], foreArmLen);
  const handFar = solveLimb(shoulder, pose.armFar[0] + lean, armLen, pose.armFar[1], foreArmLen);
  const footNear = solveLimb({ x: hipW * 0.4, y: 0 }, pose.legNear[0], thighLen, pose.legNear[1], shinLen);
  const footFar = solveLimb({ x: -hipW * 0.4, y: 0 }, pose.legFar[0], thighLen, pose.legFar[1], shinLen);

  // ---------- FAR limbs ----------
  drawLimb(ctx, { x: -hipW * 0.4, y: 0 }, pose.legFar[0], thighLen, pose.legFar[1], shinLen, limbW * 0.92, shade(pants, -0.18), shade(pants, -0.25), jointR * 0.85);
  drawFoot(ctx, footFar, limbW, shade("#20242a", -0.15), facing);
  drawArm(ctx, { x: shoulder.x - shoulderW * 0.82, y: shoulder.y + torsoLen * 0.02 }, pose.armFar[0] + lean, armLen, pose.armFar[1], foreArmLen, limbW * 0.8, shade(skin, -0.14), shade(skin, -0.18), jointR * 0.72, shade(shirt, -0.18), h);

  // ---------- SKIRT (female) ----------
  if (isWoman && detail > 0.5) {
    const skirtBottom = pose.sit > 0.5 ? legTotal * 0.42 : legTotal * 0.62;
    ctx.beginPath();
    ctx.moveTo(-hipW * 1.3, 0);
    ctx.quadraticCurveTo(-hipW * 2.15, skirtBottom * 0.62, -hipW * 1.85, skirtBottom);
    ctx.quadraticCurveTo(0, skirtBottom + hipW * 0.4, hipW * 1.85, skirtBottom);
    ctx.quadraticCurveTo(hipW * 2.15, skirtBottom * 0.62, hipW * 1.3, 0);
    ctx.closePath();
    const dressGrad = ctx.createLinearGradient(0, 0, 0, skirtBottom);
    dressGrad.addColorStop(0, shade(shirt, -0.02));
    dressGrad.addColorStop(1, shade(shirt, -0.3));
    ctx.fillStyle = dressGrad;
    ctx.fill();
    ctx.strokeStyle = rgba(outline, 0.28);
    ctx.lineWidth = Math.max(1.2, h * 0.004);
    ctx.stroke();
    ctx.strokeStyle = rgba(shade(shirt, -0.5), 0.22);
    ctx.lineWidth = Math.max(1, h * 0.003);
    for (const dx of [-0.7, 0.1, 0.8]) {
      ctx.beginPath();
      ctx.moveTo(hipW * dx, skirtBottom * 0.12);
      ctx.quadraticCurveTo(hipW * dx * 1.4, skirtBottom * 0.6, hipW * dx * 1.6, skirtBottom * 0.97);
      ctx.stroke();
    }
  }

  // ---------- TORSO ----------
  ctx.save();
  ctx.translate(chest.x, chest.y);
  ctx.rotate(lean);
  const bodyTop = -torsoLen * 0.02;
  const bodyBottom = torsoLen * 0.98;
  const bodyW = shoulderW * 2;
  // shirt body
  ctx.beginPath();
  ctx.moveTo(-shoulderW * 0.95, bodyTop + 2);
  ctx.quadraticCurveTo(-bodyW * 0.62, bodyTop - shoulderW * 0.28, -shoulderW * 0.5, bodyTop + shoulderW * 0.2);
  ctx.lineTo(-hipW * 0.92, bodyBottom);
  ctx.quadraticCurveTo(0, bodyBottom + hipW * 0.75, hipW * 0.92, bodyBottom);
  ctx.lineTo(shoulderW * 0.5, bodyTop + shoulderW * 0.2);
  ctx.quadraticCurveTo(bodyW * 0.62, bodyTop - shoulderW * 0.28, shoulderW * 0.95, bodyTop + 2);
  ctx.lineTo(shoulderW * 0.34, bodyTop - shoulderW * 0.14);
  ctx.quadraticCurveTo(0, bodyTop + shoulderW * 0.35, -shoulderW * 0.34, bodyTop - shoulderW * 0.14);
  ctx.closePath();
  const shirtGrad = ctx.createLinearGradient(-bodyW * 0.5, 0, bodyW * 0.55, 0);
  shirtGrad.addColorStop(0, shade(shirt, -0.22));
  shirtGrad.addColorStop(0.42, shirt);
  shirtGrad.addColorStop(1, shade(shirt, -0.1));
  ctx.fillStyle = shirtGrad;
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, h * 0.0045);
  ctx.strokeStyle = rgba(outline, 0.55);
  ctx.stroke();
  // collar
  ctx.beginPath();
  ctx.moveTo(-shoulderW * 0.3, bodyTop - shoulderW * 0.05);
  ctx.quadraticCurveTo(0, bodyTop + shoulderW * 0.42, shoulderW * 0.3, bodyTop - shoulderW * 0.05);
  ctx.lineWidth = Math.max(1.2, h * 0.004);
  ctx.strokeStyle = rgba(shade(shirt, -0.45), 0.75);
  ctx.stroke();
  ctx.restore();

  // neck
  ctx.beginPath();
  ctx.moveTo(neck.x - limbW * 0.42, neck.y + neckLen * 0.2);
  ctx.lineTo(neck.x + limbW * 0.42, neck.y + neckLen * 0.2);
  ctx.lineTo(neck.x + limbW * 0.42, neck.y - neckLen * 1.1);
  ctx.lineTo(neck.x - limbW * 0.42, neck.y - neckLen * 1.1);
  ctx.closePath();
  ctx.fillStyle = shade(skin, -0.12);
  ctx.fill();

  // ---------- NEAR limbs ----------
  drawLimb(ctx, { x: hipW * 0.4, y: 0 }, pose.legNear[0], thighLen, pose.legNear[1], shinLen, limbW, pants, pants, jointR);
  drawFoot(ctx, footNear, limbW, "#2a2d33", facing);

  // ---------- HEAD ----------
  drawHead(ctx, {
    cx: headCenter.x,
    cy: headCenter.y,
    headW,
    headH,
    headR,
    skin,
    hair,
    outline,
    pose,
    detail,
    isChild,
    hairStyle: opt.hairStyle ?? spec.hairStyle ?? "pendek",
    hijabColor: opt.hijabColor ?? spec.hijabColor,
    expression: opt.expression ?? spec.face,
    gender: opt.gender ?? spec.gender,
  });

  drawArm(ctx, { x: shoulder.x + shoulderW * 0.82, y: shoulder.y + torsoLen * 0.02 }, pose.armNear[0] + lean, armLen, pose.armNear[1], foreArmLen, limbW * 0.86, skin, skin, jointR * 0.8, shirt, h);

  // held item in near hand
  if (opt.heldItem && opt.heldItem !== "none") {
    drawHeldItem(ctx, opt.heldItem, handNear, limbW, h);
  }

  // rim light
  if (opt.rimLight && opt.rimLight.strength > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp(opt.rimLight.strength, 0, 1) * 0.5;
    ctx.lineWidth = Math.max(2, h * 0.006);
    ctx.strokeStyle = opt.rimLight.color;
    ctx.beginPath();
    ctx.ellipse(headCenter.x, headCenter.y, headW * 0.5 + 2, headH * 0.5 + 2, 0, -Math.PI * 0.9, Math.PI * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  return {
    head: { x: opt.x + headCenter.x * facing, y: hipY + headCenter.y, r: headH * 0.5 },
    headTop: { x: opt.x + headCenter.x * facing, y: hipY + headCenter.y - headH * 0.5 },
    handNear: { x: opt.x + handNear.x * facing, y: hipY + handNear.y },
    handFar: { x: opt.x + handFar.x * facing, y: hipY + handFar.y },
    feetY: opt.groundY,
    bounds: {
      x0: opt.x - Math.abs(bodyW) / 2 - 10,
      y0: hipY + chest.y - headH - 6,
      x1: opt.x + Math.abs(bodyW) / 2 + 10,
      y1: opt.groundY,
    },
  };
}

function solveLimb(
  origin: { x: number; y: number },
  a1: number,
  len1: number,
  a2: number,
  len2: number
): { x: number; y: number; joint: { x: number; y: number } } {
  const joint = { x: origin.x + Math.sin(a1) * len1, y: origin.y + Math.cos(a1) * len1 };
  const a = a1 + a2;
  const end = { x: joint.x + Math.sin(a) * len2, y: joint.y + Math.cos(a) * len2 };
  return { ...end, joint };
}

function drawLimb(
  ctx: Ctx,
  origin: { x: number; y: number },
  a1: number,
  len1: number,
  a2: number,
  len2: number,
  width: number,
  color: string,
  jointColor: string,
  jointR: number
) {
  const { joint, ...end } = solveLimb(origin, a1, len1, a2, len2);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(joint.x, joint.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.fillStyle = jointColor;
  ctx.beginPath();
  ctx.arc(joint.x, joint.y, jointR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArm(
  ctx: Ctx,
  shoulder: { x: number; y: number },
  a1: number,
  len1: number,
  a2: number,
  len2: number,
  width: number,
  color: string,
  handColor: string,
  jointR: number,
  sleeveColor: string,
  h: number
) {
  const { joint, ...end } = solveLimb(shoulder, a1, len1, a2, len2);
  ctx.save();
  ctx.lineCap = "round";
  // sleeve
  ctx.strokeStyle = sleeveColor;
  ctx.lineWidth = width * 1.5;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(shoulder.x + Math.sin(a1) * len1 * 0.42, shoulder.y + Math.cos(a1) * len1 * 0.42);
  ctx.stroke();
  // arm
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(shoulder.x + Math.sin(a1) * len1 * 0.3, shoulder.y + Math.cos(a1) * len1 * 0.3);
  ctx.lineTo(joint.x, joint.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.fillStyle = handColor;
  ctx.beginPath();
  ctx.arc(joint.x, joint.y, jointR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(end.x, end.y, width * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFoot(ctx: Ctx, foot: { x: number; y: number }, w: number, color: string, facing: 1 | -1) {
  ctx.save();
  ctx.fillStyle = color;
  roundRect(ctx, foot.x - w * 0.55, foot.y - w * 0.42, w * 1.85 * facing, w * 0.82, w * 0.36);
  ctx.fill();
  ctx.restore();
}

function drawHead(
  ctx: Ctx,
  o: {
    cx: number;
    cy: number;
    headW: number;
    headH: number;
    headR: number;
    skin: string;
    hair: string;
    outline: string;
    pose: Pose;
    detail: number;
    isChild: boolean;
    hairStyle: CharacterSpec["hairStyle"];
    hijabColor?: string;
    expression?: CharacterSpec["face"];
    gender?: CharacterSpec["gender"];
  }
) {
  const { cx, cy, headW, headH, skin, hair, outline, pose, detail } = o;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(pose.headTilt * 0.22);

  // ears
  ctx.fillStyle = shade(skin, -0.08);
  ctx.beginPath();
  ctx.ellipse(-headW * 0.5, headH * 0.04, headW * 0.09, headH * 0.12, 0, 0, Math.PI * 2);
  ctx.ellipse(headW * 0.5, headH * 0.04, headW * 0.09, headH * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // face shape
  ctx.beginPath();
  ctx.ellipse(0, 0, headW * 0.5, headH * 0.5, 0, 0, Math.PI * 2);
  const faceGrad = ctx.createRadialGradient(-headW * 0.12, -headH * 0.12, headW * 0.1, 0, 0, headW * 0.62);
  faceGrad.addColorStop(0, shade(skin, 0.1));
  faceGrad.addColorStop(1, shade(skin, -0.06));
  ctx.fillStyle = faceGrad;
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, headH * 0.014);
  ctx.strokeStyle = rgba(outline, 0.5);
  ctx.stroke();

  // hair styles
  ctx.fillStyle = hair;
  if (o.hairStyle === "hijab") {
    const hij = o.hijabColor || "#5a4b3c";
    const hoodGrad = ctx.createLinearGradient(-headW * 0.6, -headH * 0.6, headW * 0.55, headH * 0.7);
    hoodGrad.addColorStop(0, shade(hij, 0.16));
    hoodGrad.addColorStop(0.55, hij);
    hoodGrad.addColorStop(1, shade(hij, -0.28));
    // hood + drape to the shoulders
    ctx.beginPath();
    ctx.moveTo(-headW * 0.52, headH * 0.22);
    ctx.quadraticCurveTo(-headW * 0.78, -headH * 0.62, 0, -headH * 0.72);
    ctx.quadraticCurveTo(headW * 0.78, -headH * 0.62, headW * 0.52, headH * 0.22);
    ctx.quadraticCurveTo(headW * 0.86, headH * 0.75, headW * 0.98, headH * 1.28);
    ctx.quadraticCurveTo(0, headH * 1.5, -headW * 0.98, headH * 1.28);
    ctx.quadraticCurveTo(-headW * 0.86, headH * 0.75, -headW * 0.52, headH * 0.22);
    ctx.closePath();
    ctx.fillStyle = hoodGrad;
    ctx.fill();
    ctx.strokeStyle = rgba(shade(hij, -0.5), 0.45);
    ctx.lineWidth = Math.max(1.2, headH * 0.012);
    ctx.stroke();
    // face opening
    ctx.save();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(0, headH * 0.05, headW * 0.4, headH * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // inner rim shadow of the scarf around the face
    ctx.strokeStyle = rgba(shade(hij, -0.55), 0.5);
    ctx.lineWidth = Math.max(2, headH * 0.035);
    ctx.stroke();
    ctx.restore();
    // fabric folds
    ctx.strokeStyle = rgba(shade(hij, -0.45), 0.35);
    ctx.lineWidth = Math.max(1, headH * 0.012);
    ctx.beginPath();
    ctx.moveTo(-headW * 0.66, headH * 0.5);
    ctx.quadraticCurveTo(-headW * 0.8, headH * 0.9, -headW * 0.72, headH * 1.2);
    ctx.moveTo(headW * 0.66, headH * 0.5);
    ctx.quadraticCurveTo(headW * 0.8, headH * 0.9, headW * 0.72, headH * 1.2);
    ctx.stroke();
  } else if (o.hairStyle === "botak") {
    // nothing
  } else if (o.hairStyle === "topi") {
    ctx.beginPath();
    ctx.ellipse(0, -headH * 0.24, headW * 0.56, headH * 0.32, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(hair, 0.4);
    roundRect(ctx, -headW * 0.62, -headH * 0.26, headW * 1.24, headH * 0.12, headH * 0.06);
    ctx.fill();
  } else {
    // short / long hair cap with fringe
    ctx.beginPath();
    ctx.ellipse(0, -headH * 0.06, headW * 0.53, headH * 0.5, 0, Math.PI * 1.02, Math.PI * 1.98);
    ctx.quadraticCurveTo(headW * 0.56, headH * 0.06, headW * 0.44, headH * 0.02);
    ctx.quadraticCurveTo(headW * 0.3, -headH * 0.1, headW * 0.18, -headH * 0.06);
    ctx.quadraticCurveTo(0, -headH * 0.22, -headW * 0.16, -headH * 0.04);
    ctx.quadraticCurveTo(-headW * 0.34, -headH * 0.14, -headW * 0.46, -headH * 0.02);
    ctx.quadraticCurveTo(-headW * 0.58, headH * 0.06, -headW * 0.53, -headH * 0.02);
    ctx.closePath();
    ctx.fill();
    if (o.hairStyle === "panjang") {
      ctx.beginPath();
      ctx.moveTo(-headW * 0.5, -headH * 0.1);
      ctx.quadraticCurveTo(-headW * 0.72, headH * 0.5, -headW * 0.34, headH * 0.95);
      ctx.lineTo(-headW * 0.16, headH * 0.9);
      ctx.quadraticCurveTo(-headW * 0.4, headH * 0.45, -headW * 0.28, -headH * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headW * 0.5, -headH * 0.1);
      ctx.quadraticCurveTo(headW * 0.72, headH * 0.5, headW * 0.34, headH * 0.95);
      ctx.lineTo(headW * 0.16, headH * 0.9);
      ctx.quadraticCurveTo(headW * 0.4, headH * 0.45, headW * 0.28, -headH * 0.05);
      ctx.closePath();
      ctx.fill();
    }
  }

  // eyebrows
  const browY = -headH * 0.1 - pose.brow * headH * 0.035;
  ctx.strokeStyle = shade(hair, 0.1);
  ctx.lineWidth = Math.max(1.6, headH * 0.024);
  ctx.lineCap = "round";
  const browTilt = pose.brow * 0.55 + (o.expression === "khawatir" || o.expression === "takut" ? -0.5 : 0) + (o.expression === "marah" ? 0.7 : 0);
  ctx.beginPath();
  ctx.moveTo(-headW * 0.3, browY + browTilt * headH * 0.03);
  ctx.quadraticCurveTo(-headW * 0.19, browY - headH * 0.03 - browTilt * headH * 0.02, -headW * 0.08, browY + browTilt * headH * 0.012);
  ctx.moveTo(headW * 0.3, browY + browTilt * headH * 0.03);
  ctx.quadraticCurveTo(headW * 0.19, browY - headH * 0.03 - browTilt * headH * 0.02, headW * 0.08, browY + browTilt * headH * 0.012);
  ctx.stroke();

  // eyes
  const eyeY = headH * 0.03;
  const eyeDx = headW * 0.185 + pose.headTurn * headW * 0.045;
  const eyeOpen = clamp(1 - pose.blink, 0.06, 1);
  for (const sgn of [-1, 1]) {
    const ex = sgn * eyeDx + pose.headTurn * headW * 0.02;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, headW * 0.085, headH * 0.075 * eyeOpen, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = "#1a1512";
    ctx.beginPath();
    ctx.ellipse(ex + pose.look * headW * 0.03, eyeY + headH * 0.004, headW * 0.048, headH * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();
    if (detail > 0.6) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(ex + pose.look * headW * 0.03 + headW * 0.016, eyeY - headH * 0.016, headW * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = rgba(outline, 0.75);
    ctx.lineWidth = Math.max(1, headH * 0.012);
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, headW * 0.085, headH * 0.075 * eyeOpen, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // nose
  ctx.strokeStyle = rgba(shade(skin, -0.5), 0.55);
  ctx.lineWidth = Math.max(1.2, headH * 0.016);
  ctx.beginPath();
  ctx.moveTo(pose.headTurn * headW * 0.05, headH * 0.08);
  ctx.quadraticCurveTo(pose.headTurn * headW * 0.05 + headW * 0.035, headH * 0.145, pose.headTurn * headW * 0.05 - headW * 0.01, headH * 0.16);
  ctx.stroke();

  // mouth
  const my = headH * 0.25;
  ctx.strokeStyle = "#8b5e4a";
  ctx.fillStyle = "#7d4b3b";
  ctx.lineWidth = Math.max(1.6, headH * 0.022);
  ctx.beginPath();
  switch (pose.mouth) {
    case "smile":
      ctx.moveTo(-headW * 0.13, my);
      ctx.quadraticCurveTo(0, my + headH * 0.09, headW * 0.13, my);
      ctx.stroke();
      break;
    case "sad":
      ctx.moveTo(-headW * 0.12, my + headH * 0.03);
      ctx.quadraticCurveTo(0, my - headH * 0.03, headW * 0.12, my + headH * 0.03);
      ctx.stroke();
      break;
    case "worried":
      ctx.moveTo(-headW * 0.11, my + headH * 0.02);
      ctx.quadraticCurveTo(0, my - headH * 0.015, headW * 0.11, my + headH * 0.02);
      ctx.stroke();
      break;
    case "open":
      ctx.ellipse(0, my + headH * 0.02, headW * 0.085, headH * 0.055, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "shock":
      ctx.ellipse(0, my + headH * 0.03, headW * 0.07, headH * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "angry":
      ctx.moveTo(-headW * 0.13, my + headH * 0.03);
      ctx.lineTo(headW * 0.13, my + headH * 0.01);
      ctx.stroke();
      break;
    default:
      ctx.moveTo(-headW * 0.1, my);
      ctx.quadraticCurveTo(0, my + headH * 0.02, headW * 0.1, my);
      ctx.stroke();
  }
  ctx.restore();
}

function drawHeldItem(ctx: Ctx, item: string, hand: { x: number; y: number }, limbW: number, h: number) {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  if (item === "botol") {
    ctx.fillStyle = "#cfe6f2";
    roundRect(ctx, -limbW * 0.5, -limbW * 1.9, limbW, limbW * 3.1, limbW * 0.35);
    ctx.fill();
    ctx.fillStyle = "#7fa7bd";
    roundRect(ctx, -limbW * 0.28, -limbW * 2.5, limbW * 0.56, limbW * 0.7, limbW * 0.15);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    roundRect(ctx, -limbW * 0.36, -limbW * 1.6, limbW * 0.18, limbW * 2.2, limbW * 0.1);
    ctx.fill();
  } else if (item === "ponsel") {
    ctx.fillStyle = "#1c1f24";
    roundRect(ctx, -limbW * 0.42, -limbW * 1.5, limbW * 0.84, limbW * 1.7, limbW * 0.16);
    ctx.fill();
    ctx.fillStyle = "#8fd0ff";
    roundRect(ctx, -limbW * 0.34, -limbW * 1.4, limbW * 0.68, limbW * 1.4, limbW * 0.1);
    ctx.fill();
  } else if (item === "tas") {
    ctx.strokeStyle = "#b9c2cc";
    ctx.lineWidth = limbW * 0.18;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, limbW * 0.9);
    ctx.stroke();
    ctx.fillStyle = "rgba(230,240,250,0.85)";
    roundRect(ctx, -limbW * 0.75, limbW * 0.8, limbW * 1.5, limbW * 1.7, limbW * 0.2);
    ctx.fill();
  } else if (item === "senter") {
    ctx.fillStyle = "#3a3f46";
    roundRect(ctx, -limbW * 0.25, -limbW * 0.2, limbW * 0.5, limbW * 1.3, limbW * 0.12);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(0, limbW * 1.2, 0, 0, limbW * 1.2, limbW * 5);
    g.addColorStop(0, "rgba(255,240,190,0.55)");
    g.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, limbW);
    ctx.lineTo(-limbW * 3, limbW * 6);
    ctx.lineTo(limbW * 3, limbW * 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
