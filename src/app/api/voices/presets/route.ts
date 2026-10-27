import { guard, jsonOk } from "@/lib/api";
import { env } from "@/lib/env";
import { presetsForProvider } from "@/lib/providers/voices";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return jsonOk({ provider: env.tts.provider, presets: presetsForProvider(env.tts.provider) });
}
