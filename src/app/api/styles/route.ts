import { z } from "zod";
import { guard, jsonOk, jsonError, parseBody, errorMessage } from "@/lib/api";
import { insertStyle, listStyles, getStyle } from "@/lib/db/repo";
import { DEFAULT_STYLE_PRESET, PRESETS } from "@/lib/style/presets";

/** The house style always leads the list, so "first" means "default". */
const DEFAULT_STYLE_NAME = PRESETS.find((p) => p.id === DEFAULT_STYLE_PRESET)?.name ?? "";

function defaultFirst(styles: { name: string }[]) {
  return [...styles].sort((a, b) => Number(b.name === DEFAULT_STYLE_NAME) - Number(a.name === DEFAULT_STYLE_NAME));
}
import type { StyleProfileSpec } from "@/lib/types";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const styles = listStyles();
  if (!styles.length) {
    // seed the built-in presets on first run
    for (const preset of PRESETS) {
      insertStyle({
        name: preset.name,
        description: preset.description,
        source: "preset",
        isTemplate: true,
        referenceAssetId: null,
        analysis: null,
        spec: preset.spec,
      });
    }
    return jsonOk(defaultFirst(listStyles()));
  }
  return jsonOk(defaultFirst(styles));
}

const schema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(600).default(""),
  spec: z.record(z.string(), z.unknown()),
  analysis: z.record(z.string(), z.unknown()).nullable().optional(),
  referenceAssetId: z.string().nullable().optional(),
  source: z.enum(["reference-video", "manual", "preset", "template"]).default("reference-video"),
  isTemplate: z.boolean().default(true),
});

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;
  try {
    const spec = body.spec as unknown as StyleProfileSpec;
    if (!spec?.version || !spec.subtitle || !spec.palette) {
      return jsonError("Spesifikasi gaya tidak lengkap", 422);
    }
    const id = insertStyle({
      name: body.name,
      description: body.description,
      source: body.source,
      isTemplate: body.isTemplate,
      referenceAssetId: body.referenceAssetId ?? null,
      analysis: body.analysis ?? null,
      spec,
    });
    return jsonOk(getStyle(id));
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

