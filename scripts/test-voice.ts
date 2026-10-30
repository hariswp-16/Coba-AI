import fs from "node:fs";
import { paradeeTts, espeakTts } from "../src/lib/providers/tts";

async function main() {
  const text =
    "Kenapa langit berwarna biru? Jawabannya tidak ada di langit, melainkan di cahaya matahari dan molekul udara di atas kepala kita.";
  for (const [name, adapter] of [["paradee", paradeeTts], ["espeak", espeakTts]] as const) {
    const t0 = Date.now();
    const r = await adapter.synthesize({ text, voiceId: "narrator-documentary", rate: 0.96, pitch: 0 });
    const file = `/tmp/voice-${name}.wav`;
    fs.writeFileSync(file, r.audio);
    console.log(
      `${name.padEnd(8)} ${r.durationMs} ms audio in ${Date.now() - t0} ms | sr ${r.sampleRate} | words ${r.words.length} | ${(r.audio.length / 1024).toFixed(0)} KB -> ${file}`
    );
    console.log("   first words:", r.words.slice(0, 6).map((w) => `${w.text}@${w.startMs}`).join(" "));
  }
}
main();
