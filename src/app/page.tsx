import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { listProjects } from "@/lib/db/repo";
import { queueStats } from "@/lib/queue";
import { integrationStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const projects = listProjects();
  const queue = queueStats();
  const integrations = integrationStatus();
  return <DashboardClient initialProjects={projects} queue={queue} integrations={integrations} />;
}
