import path from "node:path";
import fs from "node:fs";
import { createProject, insertStyle, updateProject, getProject, createJob, getJob } from "../src/lib/db/repo";
import { generateStory } from "../src/lib/story/engine";
import { STICKMAN_CINEMATIC } from "../src/lib/style/presets";
import { runRenderPipeline } from "../src/lib/render/pipeline";

async function main() {
  const t0 = Date.now();
  const styleId = insertStyle({
    name: "Test Stickman",
    description: "preset uji",
    source: "preset",
    isTemplate: true,
    referenceAssetId: null,
    analysis: null,
    spec: STICKMAN_CINEMATIC,
  });
  const duration = Number(process.argv[2] ?? 30);
  const projectId = createProject({
    title: "Uji Hujan Malam",
    durationTarget: duration,
    aspect: "9:16",
    width: 720,
    height: 1280,
    fps: 30,
    quality: "draft",
    styleProfileId: styleId,
    storyInput: { mode: "idea", idea: "Anak mendengar kabar dajjal sampai di kotanya saat hujan malam", topic: "", script: "", audience: "umum", language: "id" },
    subtitleSettings: {},
    audioSettings: { musicMood: "tegang", musicEnabled: true, musicVolume: 0.25, voiceVolume: 1, ducking: 0.65, sfxEnabled: true, loudnessTarget: -14 },
    voiceSettings: { mode: "preset", voiceId: "narrator-dramatic", provider: "local", rate: 1, pitch: -0.05, persona: "dramatis" },
  });
  const story = generateStory({
    input: { mode: "idea", idea: "Anak mendengar kabar dajjal sampai di kotanya saat hujan malam", topic: "", script: "", audience: "umum", language: "id" },
    duration: duration as never,
    style: STICKMAN_CINEMATIC,
  });
  updateProject(projectId, { story, status: "story-ready" });
  const jobId = createJob({ projectId, type: "full", estimatedCostUsd: 0 });
  console.log("project", projectId, "job", jobId, "scenes", story.scenes.length);
  const result = await runRenderPipeline({ jobId, projectId, onProgress: (p, step, note) => console.log(`  [${(p*100).toFixed(0)}%] ${step} ${note ?? ""}`) });
  console.log("RESULT", result, "total", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  const job = getJob(jobId);
  console.log("job status", job?.status, job?.error ?? "");
  const proj = getProject(projectId);
  console.log("video", proj?.videoUrl, "srt", proj?.srtUrl);
  const row = fs.readdirSync(path.resolve("storage/render")).slice(-1);
  console.log("stored under storage/render:", row);
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });
