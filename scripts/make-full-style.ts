/** Registers the full-bleed infographic style in the studio database. */
import { MOTION_GRAPHICS_FULL } from "../src/lib/style/presets";

const api = process.env.API ?? "http://127.0.0.1:3000";

async function main() {
  const res = await fetch(`${api}/api/styles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Motion Graphics — Infografis Penuh",
      description: "Ilustrasi penuh layar, angka besar, caption putih dengan kata kunci berwarna aksen.",
      source: "preset",
      isTemplate: true,
      spec: MOTION_GRAPHICS_FULL,
    }),
  });
  const json = (await res.json()) as { ok: boolean; data?: { id: string }; error?: string };
  if (!json.ok) throw new Error(json.error ?? "gagal membuat gaya");
  console.log("style id:", json.data?.id);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
