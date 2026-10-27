import type { Scene, StoryDoc, SubtitleStyle, StyleProfileSpec } from "../types";

export interface TimedScene extends Scene {
  startMs: number;
  endMs: number;
  durationMs: number;
  /** narration audio length */
  audioMs: number;
}

export interface Timeline {
  scenes: TimedScene[];
  totalMs: number;
}

/**
 * Places scenes on the timeline. Scene length is derived from the real
 * narration audio (or an estimate) plus breathing room, then the leftover
 * time is distributed so the video hits the requested duration exactly.
 */
export function buildTimeline(
  story: StoryDoc,
  opts: { targetMs: number; audioByScene?: Record<string, number>; minSceneMs?: number; maxSceneMs?: number }
): Timeline {
  const minScene = opts.minSceneMs ?? 2200;
  const maxScene = opts.maxSceneMs ?? 12000;
  const basePad = 520;

  const drafts = story.scenes.map((s) => {
    const audioMs = opts.audioByScene?.[s.id] ?? estimateSpeechMs(s.narration);
    const withPad = Math.min(maxScene, Math.max(minScene, audioMs + basePad));
    return { scene: s, audioMs, baseMs: withPad };
  });

  let total = drafts.reduce((a, d) => a + d.baseMs, 0);
  const target = opts.targetMs;

  if (total < target) {
    let remaining = target - total;
    const weights = drafts.map((d) => Math.sqrt(d.audioMs + 1));
    const weightSum = weights.reduce((a, b) => a + b, 0);
    drafts.forEach((d, i) => {
      const extra = Math.round((remaining * weights[i]) / weightSum);
      d.baseMs = Math.min(maxScene, d.baseMs + extra);
    });
    total = drafts.reduce((a, d) => a + d.baseMs, 0);
    // any rounding remainder goes to the final scene
    if (total < target && drafts.length) {
      const last = drafts[drafts.length - 1];
      last.baseMs += target - total;
    }
  } else if (total > target) {
    // squeeze the pads first, never the audio
    let excess = total - target;
    for (let pass = 0; pass < 3 && excess > 0; pass++) {
      const flexible = drafts.filter((d) => d.baseMs > Math.max(minScene, d.audioMs + 180));
      if (!flexible.length) break;
      const per = Math.ceil(excess / flexible.length);
      for (const d of flexible) {
        const floor = Math.max(minScene, d.audioMs + 180);
        const delta = Math.min(per, d.baseMs - floor, excess);
        d.baseMs -= delta;
        excess -= delta;
        if (excess <= 0) break;
      }
    }
  }

  let cursor = 0;
  const scenes: TimedScene[] = drafts.map((d) => {
    const startMs = cursor;
    cursor += d.baseMs;
    return {
      ...d.scene,
      startMs,
      durationMs: d.baseMs,
      endMs: startMs + d.baseMs,
      audioMs: d.audioMs,
    };
  });
  return { scenes, totalMs: cursor };
}

export function estimateSpeechMs(text: string, wpm = 150): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / wpm) * 60_000);
}

export interface TransitionWindow {
  aIndex: number;
  bIndex: number;
  startMs: number;
  endMs: number;
  type: Scene["transition"];
}

export function transitionWindows(scenes: TimedScene[], durationMs = 360): TransitionWindow[] {
  const wins: TransitionWindow[] = [];
  for (let i = 1; i < scenes.length; i++) {
    const type = scenes[i].transition ?? "cut";
    if (type === "cut") continue;
    const dur = type === "fade" ? durationMs + 180 : type === "dissolve" ? durationMs + 120 : durationMs;
    const cut = scenes[i].startMs;
    wins.push({ aIndex: i - 1, bIndex: i, startMs: Math.max(scenes[i - 1].startMs, cut - dur / 2), endMs: cut + dur / 2, type });
  }
  return wins;
}

/** Words for a scene, offset to absolute timeline positions. */
export function absoluteWords(scenes: TimedScene[]) {
  return scenes.map((s) => ({
    startMs: s.startMs,
    words: s.words.map((w) => ({ ...w, startMs: w.startMs + s.startMs, endMs: w.endMs + s.startMs })),
    narration: s.narration,
  }));
}

export function subtitleStyleFor(style: StyleProfileSpec, override?: Partial<SubtitleStyle>): SubtitleStyle {
  return { ...style.subtitle, ...(override ?? {}) };
}
