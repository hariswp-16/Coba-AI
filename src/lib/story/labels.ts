import type { StoryDoc, StyleProfileSpec } from "../types";
import type { MusicMood } from "../audio/music";
import { moodFromText } from "../audio/music";

/** Short HUD label shown in the top-left, e.g. "MALAM PERTAMA". */
export function buildShortLabel(story: StoryDoc, style: StyleProfileSpec): string {
  const first = story.scenes[0];
  const mood = (first?.mood || "").toLowerCase();
  const tod = first?.timeOfDay ?? "malam";
  const weather = first?.weather ?? "";
  if (/takut|horor/.test(mood) || weather === "badai") return tod === "malam" ? "MALAM MENCEKAM" : "HARI MENCEKAM";
  if (/misteri/.test(mood)) return tod === "malam" ? "MALAM PERTAMA" : "HARI PERTAMA";
  if (/haru|sedih/.test(mood)) return "KENANGAN";
  if (/khidmat/.test(mood)) return "MALAM PENUH DOA";
  if (/semangat/.test(mood)) return "TITIK TERENDAH";
  if (/hangat/.test(mood)) return "RUMAH";
  if (style.hud.labelText) return style.hud.labelText.toUpperCase();
  return tod === "malam" ? "MALAM INI" : "HARI INI";
}

export function musicMoodForStory(story: StoryDoc, style: StyleProfileSpec): MusicMood {
  const moods = story.scenes.map((s) => s.mood).join(" ");
  return moodFromText(`${moods} ${style.audio.musicMood}`);
}

export function episodeLabel(story: StoryDoc): string {
  return `EPISODE ${story.episodeNumber ?? 1}`;
}
