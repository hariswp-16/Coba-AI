import { integrationStatus, env } from "@/lib/env";
import { guard, jsonOk } from "@/lib/api";
import { voiceCloneStatus } from "@/lib/providers/voiceClone";
import { presetsForProvider } from "@/lib/providers/voices";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { authEnabled } from "@/lib/auth";
import { queueStats } from "@/lib/queue";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const ffmpeg = await ffmpegAvailable();
  return jsonOk({
    integrations: integrationStatus(),
    voiceClone: voiceCloneStatus(),
    ffmpeg,
    voices: presetsForProvider(env.tts.provider === "local" ? "local" : env.tts.provider),
    cost: env.cost,
    limits: env.limits,
    authEnabled: authEnabled(),
    queue: queueStats(),
  });
}
