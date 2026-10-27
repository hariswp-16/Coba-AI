import { NewProjectWizard } from "@/components/new/NewProjectWizard";
import { listStyles } from "@/lib/db/repo";
import { env } from "@/lib/env";
import { presetsForProvider } from "@/lib/providers/voices";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  const styles = listStyles();
  return (
    <NewProjectWizard
      styles={styles.map((s) => ({ id: s.id, name: s.name, description: s.description, source: s.source }))}
      voices={presetsForProvider(env.tts.provider)}
      ttsProvider={env.tts.provider}
    />
  );
}
