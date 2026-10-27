import { VoicesClient } from "@/components/voices/VoicesClient";
import { listVoiceProfiles } from "@/lib/db/repo";
import { env } from "@/lib/env";
import { presetsForProvider } from "@/lib/providers/voices";
import { voiceCloneStatus } from "@/lib/providers/voiceClone";

export const dynamic = "force-dynamic";

export default function VoicesPage() {
  return (
    <VoicesClient
      initialProfiles={listVoiceProfiles()}
      presets={presetsForProvider(env.tts.provider)}
      ttsProvider={env.tts.provider}
      cloneStatus={voiceCloneStatus()}
    />
  );
}
