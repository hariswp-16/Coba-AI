import { z } from "zod";
import { guard, jsonOk, jsonError, parseBody, errorMessage } from "@/lib/api";
import { deleteStyle, getStyle, updateStyle, listStyles } from "@/lib/db/repo";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const style = getStyle(id);
  if (!style) return jsonError("Profil gaya tidak ditemukan", 404);
  return jsonOk(style);
}

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(600).optional(),
  spec: z.record(z.string(), z.unknown()).optional(),
  isTemplate: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!getStyle(id)) return jsonError("Profil gaya tidak ditemukan", 404);
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  try {
    updateStyle(id, parsed.data as never);
    return jsonOk(getStyle(id));
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  deleteStyle(id);
  return jsonOk({ deleted: id, remaining: listStyles().length });
}
