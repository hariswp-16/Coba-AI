import { notFound } from "next/navigation";
import { getProject, getStyle, getLatestJob, listStyles } from "@/lib/db/repo";
import { ProjectEditor } from "@/components/editor/ProjectEditor";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  const style = project.styleProfileId ? getStyle(project.styleProfileId) : null;
  const job = getLatestJob(id);
  return (
    <ProjectEditor
      project={project}
      style={style ? { id: style.id, name: style.name, spec: style.spec } : null}
      styles={listStyles().map((s) => ({ id: s.id, name: s.name }))}
      initialJob={job}
      limits={env.limits}
    />
  );
}
