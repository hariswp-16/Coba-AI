import fs from "node:fs";
import { renderMusicWav, renderSfx, SFX_NAMES } from "../src/lib/audio/music";
import { toWav } from "../src/lib/audio/synth";

const t0 = Date.now();
for (const mood of ["sedih", "tegang", "misterius"] as const) {
  const { wav } = renderMusicWav(mood, 46, 3);
  fs.writeFileSync(`/tmp/music-${mood}.wav`, wav);
  console.log(mood, Math.round(wav.length / 1024), "KB");
}
for (const name of SFX_NAMES) {
  fs.writeFileSync(`/tmp/sfx-${name}.wav`, toWav(renderSfx(name, 3, 5)));
}
console.log("elapsed", Date.now() - t0, "ms");
