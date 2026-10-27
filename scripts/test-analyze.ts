import { analyzeReferenceVideo } from "../src/lib/style/analyze";
async function main() {
  const r = await analyzeReferenceVideo({ filePath: "google_drive/VID_20261027_092453_115.mp4", fileName: "VID_20261027_092453_115.mp4", onStage: (s, f) => console.log(`  ${(f*100).toFixed(0)}% ${s}`) });
  console.log(JSON.stringify({ ...r.analysis, sampleFrames: r.analysis.sampleFrames.map(s=>s.timeSeconds) }, null, 2));
  console.log("SPEC:", JSON.stringify({ sub: r.spec.subtitle, hud: r.spec.hud, palette: r.spec.palette, pacing: r.spec.pacing, audio: r.spec.audio }, null, 2));
}
main();
