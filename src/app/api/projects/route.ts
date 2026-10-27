import { z } from "zod";
import { guard, jsonOk, jsonError, parseBody, errorMessage } from "@/lib/api";
import { createProject, listProjects, getStyle, insertStyle, updateProject } from "@/lib/db/repo";
import { RESOLUTIONS } from "@/lib/types";
import { STICKMAN_CINEMATIC, getPreset } from "@/lib/style/presets";

const bodySchema = z.object({
  title: z.string().min(1).max(140),
  durationTarget: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]),
  styleProfileId: z.string().min(1),
  aspect: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
  fps: z.union([z.literal(24), z.literal(30)]).default(30),
  quality: z.enum(["draft", "standard", "high"]).default("standard"),
  storyInput: z.object({
    mode: z.enum(["idea", "topic", "script", "continue"]),
    idea: z.string().max(4000).default(""),
    topic: z.string().max(400).default(""),
    script: z.string().max(20000).default(""),
    previousProjectId: z.string().optional(),
    episodeNumber: z.number().optional(),
    audience: z.string().max(120).default("umum"),
    language: z.string().default("id"),
  }),
  voiceSettings: z
    .object({
      mode: z.enum(["preset", "cloned"]).default("preset"),
      voiceId: z.string().default("narrator-dramatic"),
      provider: z.string().default("local"),
      rate: z.number().min(0.6).max(1.4).default(1),
      pitch: z.number().min(-0.4).max(0.4).default(0),
      persona: z.string().default("dramatis"),
    })
    .optional(),
  audioSettings: z
    .object({
      musicMood: z.string().default("sedih"),
      musicEnabled: z.boolean().default(true),
      musicVolume: z.number().min(0).max(1).default(0.22),
      voiceVolume: z.number().min(0).max(2).default(1),
      ducking: z.number().min(0).max(1).default(0.65),
      sfxEnabled: z.boolean().default(true),
      loudnessTarget: z.number().default(-14),
    })
    .optional(),
  subtitleSettings: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return jsonOk(listProjects());
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  try {
    let style = getStyle(body.styleProfileId);
    if (!style) {
      const preset = getPreset("stickman-dramatis");
      const id = insertStyle({
        name: "Stickman Sinematik — Dramatis Malam",
        description: "Dibuat otomatis dari preset bawaan.",
        source: "preset",
        isTemplate: true,
        referenceAssetId: null,
        analysis: null,
        spec: preset ?? STICKMAN_CINEMATIC,
      });
      style = getStyle(id);
    }
    if (!style) return jsonError("Profil gaya tidak ditemukan", 404);
    const res = RESOLUTIONS[body.resolution] ?? RESOLUTIONS["720p"];
    const projectId = createProject({
      title: body.title,
      durationTarget: body.durationTarget,
      aspect: body.aspect,
      width: body.aspect === "9:16" ? res.width : body.aspect === "16:9" ? res.height : res.width,
      height: body.aspect === "9:16" ? res.height : body.aspect === "16:9" ? res.width : res.height,
      fps: body.fps,
      quality: body.quality,
      styleProfileId: style.id,
      storyInput: body.storyInput,
      subtitleSettings: (body.subtitleSettings ?? {}) as never,
      audioSettings:
        body.audioSettings ?? {
          musicMood: "sedih",
          musicEnabled: true,
          musicVolume: 0.22,
          voiceVolume: 1,
          ducking: 0.65,
          sfxEnabled: true,
          loudnessTarget: -14,
        },
      voiceSettings:
        body.voiceSettings ?? {
          mode: "preset",
          voiceId: "narrator-dramatic",
          provider: "local",
          rate: 1,
          pitch: 0,
          persona: "dramatis",
        },
    });
    updateProject(projectId, { episodeNumber: body.storyInput.episodeNumber ?? 1 });
    return jsonOk({ id: projectId });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
