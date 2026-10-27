import { guard, jsonOk, jsonError } from "@/lib/api";
import { getProjectRow, mapProjectRow, projectCost } from "@/lib/db/repo";
import { estimateProjectCost } from "@/lib/render/pipeline";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const row = getProjectRow(id);
  if (!row) return jsonError("Proyek tidak ditemukan", 404);
  return jsonOk({ estimate: estimateProjectCost(mapProjectRow(row)), spent: projectCost(id) });
}
