import { SettingsClient } from "@/components/settings/SettingsClient";
import { integrationStatus, env } from "@/lib/env";
import { voiceCloneStatus } from "@/lib/providers/voiceClone";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { authEnabled } from "@/lib/auth";
import { queueStats } from "@/lib/queue";
import { getCostSummary } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ffmpeg = await ffmpegAvailable();
  return (
    <SettingsClient
      integrations={integrationStatus()}
      voiceClone={voiceCloneStatus()}
      ffmpeg={ffmpeg}
      authOn={authEnabled()}
      queue={queueStats()}
      cost={getCostSummary()}
      limits={env.limits}
    />
  );
}
