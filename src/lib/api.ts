import { z } from "zod";
import { requireApiAuth } from "./auth";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, init);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

export async function guard(): Promise<Response | null> {
  return requireApiAuth();
}

export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: jsonError("Body JSON tidak valid", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: jsonError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 422) };
  }
  return { data: parsed.data };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
