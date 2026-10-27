import fs from "node:fs";
import { espeakTts } from "../src/lib/providers/tts";
async function main() {
  const t0 = Date.now();
  const r = await espeakTts.synthesize({
    text: "Hujan belum berhenti sejak sore. Ibu memanggilku dari balik pintu, tapi aku tak berani menjawab.",
    voiceId: "narrator-dramatic",
    rate: 0.92,
    pitch: -0.06,
  });
  fs.writeFileSync("/tmp/tts-test.wav", r.audio);
  console.log("duration", r.durationMs, "ms, words", r.words.length, "took", Date.now() - t0, "ms");
  console.log(r.words.slice(0, 8));
  console.log("sampleRate", r.sampleRate);
}
main();
