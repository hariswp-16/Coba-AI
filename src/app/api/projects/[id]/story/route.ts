import { z } from "zod";
import { guard, jsonOk, jsonError, parseBody, errorMessage } from "@/lib/api";
import { getProject, getProjectRow, getStyle, updateProject, recordCost } from "@/lib/db/repo";
import { generateStoryWithLlm } from "@/lib/story/llm";
import type { DurationOption, StoryInput } from "@/lib/types";

const schema = z.object({
  storyInput: z
    .object({
      mode: z.enum(["idea", "topic", "script", "continue"]),
      idea: z.string().max(4000).default(""),
      topic: z.string().max(400).default(""),
      script: z.string().max(20000).default(""),
      previousProjectId: z.string().optional(),
      episodeNumber: z.number().optional(),
      audience: z.string().default("umum"),
      language: z.string().default("id"),
    })
    .optional(),
  durationTarget: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]).optional(),
  seed: z.number().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = getProjectRow(id);
  if (!row) return jsonError("Proyek tidak ditemukan", 404);
  const project = getProject(id)!;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  const input: StoryInput = { ...project.storyInput, ...(body.storyInput ?? {}) };
  const duration = (body.durationTarget ?? project.durationTarget) as DurationOption;
  const style = project.styleProfileId ? getStyle(project.styleProfileId) : null;
  if (!style) return jsonError("Profil gaya tidak ditemukan", 400);

  let previousStory = null;
  if (input.mode === "continue") {
    const prevId = input.previousProjectId;
    const prev = prevId ? getProject(prevId) : null;
    previousStory = prev?.story ?? project.story ?? null;
    if (!previousStory) return jsonError("Episode sebelumnya belum memiliki storyboard", 400);
  }

  try {
    const result = await generateStoryWithLlm({
      input,
      duration,
      style: style.spec,
      episodeNumber: input.episodeNumber ?? project.story?.episodeNumber ?? 1,
      previousStory,
      seed: body.seed,
    });
    updateProject(id, {
      story: result.story,
      storyInput: input,
      durationTarget: duration,
      status: "story-ready",
      error: null,
    });
    if (result.costUsd > 0) recordCost(id, result.provider, "story", 1, "naskah", result.costUsd);
    return jsonOk({
      story: result.story,
      generatedBy: `${result.provider}:${result.model}`,
      fallbackReason: result.fallbackReason ?? null,
    });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
