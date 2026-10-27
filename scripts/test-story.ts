import { generateStory } from "../src/lib/story/engine";
import { STICKMAN_CINEMATIC } from "../src/lib/style/presets";
for (const dur of [30, 60] as const) {
  const story = generateStory({
    input: { mode: "idea", idea: "Seorang anak mendengar kabar dajjal sudah sampai di kotanya saat hujan malam", topic: "", script: "", audience: "umum", language: "id" },
    duration: dur,
    style: STICKMAN_CINEMATIC,
  });
  console.log("=== duration", dur, "| title:", story.title, "| scenes:", story.scenes.length);
  const totalWords = story.scenes.reduce((a, s) => a + s.narration.split(/\s+/).length, 0);
  console.log("words:", totalWords, "| runtime estimate:", (totalWords / 150 * 60).toFixed(1) + "s");
  for (const s of story.scenes) {
    console.log(`  [${s.purpose}] ${s.location} / ${s.timeOfDay} / ${s.mood} / ${s.camera} :: ${s.narration}`);
  }
}
