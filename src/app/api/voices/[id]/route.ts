import { guard, jsonOk, jsonError, errorMessage } from "@/lib/api";
import { deleteVoiceProfile, getVoiceProfile, updateVoiceProfile } from "@/lib/db/repo";
import { getCloneAdapter } from "@/lib/providers/voiceClone";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!getVoiceProfile(id)) return jsonError("Profil suara tidak ditemukan", 404);
  try {
    const body = (await req.json()) as { name?: string; notes?: string };
    updateVoiceProfile(id, { name: body.name, notes: body.notes });
    return jsonOk(getVoiceProfile(id));
  } catch (err) {
    return jsonError(errorMessage(err), 400);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const profile = getVoiceProfile(id);
  if (!profile) return jsonError("Profil suara tidak ditemukan", 404);
  if (profile.providerVoiceId) {
    const adapter = getCloneAdapter();
    if (adapter?.deleteVoice) {
      try {
        await adapter.deleteVoice(profile.providerVoiceId);
      } catch {
        /* remote deletion best effort */
      }
    }
  }
  deleteVoiceProfile(id);
  return jsonOk({ deleted: id });
}
