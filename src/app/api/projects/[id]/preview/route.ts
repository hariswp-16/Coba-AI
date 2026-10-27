import { guard, jsonError } from "@/lib/api";
import { getProject, getStyle, getProjectRow } from "@/lib/db/repo";
import { renderSceneFrame, type SceneRenderSpec } from "@/lib/anim/sceneRenderer";
import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts } from "@/lib/render/fonts";
import { sceneStaging } from "@/lib/render/video";
import { buildTimeline } from "@/lib/render/timeline";
import { buildShortLabel } from "@/lib/story/labels";
import { hudClockFor } from "@/lib/anim/hud";
import type { SceneWord, SubtitleStyle } from "@/lib/types";

/**
 * Renders a single storyboard frame as PNG so the editor can show exactly what
 * the final video will look like before spending render time/quota.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = getProjectRow(id);
  if (!row) return jsonError("Proyek tidak ditemukan", 404);
  const project = getProject(id)!;
  if (!project.story) return jsonError("Belum ada storyboard", 400);
  const styleRow = project.styleProfileId ? getStyle(project.styleProfileId) : null;
  if (!styleRow) return jsonError("Profil gaya tidak ditemukan", 400);

  const url = new URL(req.url);
  const sceneIndex = Math.max(0, Math.min(project.story.scenes.length - 1, Number(url.searchParams.get("scene") ?? 0)));
  const tMs = Number(url.searchParams.get("t") ?? 1400);
  const requestedWidth = Math.max(180, Math.min(1080, Number(url.searchParams.get("w") ?? 540)));
  // Always render at design resolution (720-wide space) and downscale afterwards,
  // so previews are pixel-identical to the final video framing.
  const width = 720;
  const height = 1280;

  const scene = project.story.scenes[sceneIndex];
  const style = styleRow.spec;
  const subtitleStyle: SubtitleStyle = { ...style.subtitle, ...(project.subtitleSettings as Partial<SubtitleStyle>) };
  const timeline = buildTimeline(project.story, { targetMs: project.durationTarget * 1000 });
  const timed = timeline.scenes[sceneIndex];

  // Deterministic preview words when the scene has not been voiced yet.
  // Preview frames are static: spread the narration across the frame time so the
  // thumbnail always shows a live subtitle chunk ending after `t`.
  const totalMs = timed?.durationMs ?? scene.durationMs;
  const spreadMs = Math.max(900, Math.min(totalMs, tMs + 700));
  const words: SceneWord[] = scene.words?.length
    ? scene.words
    : distributePreviewWords(scene.narration, scene.emphasisWords ?? [], spreadMs);

  ensureFonts();
  const canvas = createCanvas(width, height);
  const cctx = canvas.getContext("2d") as never;
  const spec: SceneRenderSpec = {
    index: sceneIndex,
    width,
    height,
    durationMs: timed?.durationMs ?? scene.durationMs,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    weather: scene.weather,
    camera: scene.camera,
    mood: scene.mood,
    characters: project.story.characters,
    staging: sceneStaging(style, timeline.scenes)[scene.id] ?? [],
    palette: style.palette,
    style,
    subtitleStyle,
    hudStyle: style.hud,
    hudData: {
      label: buildShortLabel(project.story, style),
      episode: `EPISODE ${project.story.episodeNumber ?? 1}`,
      clock: hudClockFor(scene.timeOfDay, 17),
    },
    words,
    seedKey: `${scene.id}-${scene.location}-${scene.mood}`,
    showHud: (project.subtitleSettings.showHud ?? true) && style.hud.enabled,
    subtitleNoFade: true,
    purpose: scene.purpose,
    ctaPills: scene.purpose === "cta" ? ["MENYUSUL TEMANMU", "BAWA ADIK PULANG"] : undefined,
    ctaQuestion: scene.purpose === "cta" ? "APA PILIHANMU?" : undefined,
  };
  renderSceneFrame(cctx, spec, tMs);

  let out = canvas;
  if (requestedWidth !== width) {
    const outHeight = Math.round(requestedWidth * (height / width));
    const scaled = createCanvas(requestedWidth, outHeight);
    const sctx = scaled.getContext("2d") as never;
    (sctx as unknown as CanvasRenderingContext2D).drawImage(canvas as never, 0, 0, requestedWidth, outHeight);
    out = scaled;
  }
  const buffer = await out.encode("png");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}

function distributePreviewWords(text: string, emphasis: string[], untilMs: number): SceneWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const perWord = untilMs / Math.max(1, tokens.length);
  const set = new Set(emphasis.map((e) => e.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")).filter((w) => w.length > 2));
  return tokens.map((t, i) => ({
    text: t,
    startMs: Math.round(i * perWord),
    endMs: Math.round((i + 1) * perWord),
    emphasis: set.size > 0 && set.has(t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")),
  }));
}
