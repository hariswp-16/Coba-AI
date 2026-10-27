import { env } from "../env";
import type { CharacterSpec, Scene, StoryDoc, StoryInput, StyleProfileSpec } from "../types";
import { generateStory, sceneBudget, wordBudget, type StoryRequest } from "./engine";
import { detectGenre } from "./genres";

export interface LlmResult {
  story: StoryDoc;
  provider: string;
  model: string;
  costUsd: number;
  fallbackReason?: string;
}

const SYSTEM_PROMPT = `Kamu adalah penulis naskah video pendek vertikal (9:16) berbahasa Indonesia untuk kanal animasi cerita.
Aturan wajib:
- Bahasa Indonesia natural, kalimat pendek, ritme bercerita seperti narator video pendek.
- Struktur: hook kuat di 3 detik pertama, alur jelas, klimaks, penutup, lalu ajakan komentar.
- Setiap adegan harus nyambung dengan adegan sebelumnya (bukan kumpulan adegan acak).
- Durasi total TIDAK BOLEH lebih dari target. Jumlah kata narasi harus pas: sekitar 150 kata per 60 detik.
- Setiap adegan: narasi voice-over, deskripsi visual, lokasi, waktu, suasana, kamera, dan 1-3 kata kunci yang ditekankan.
- Jangan pakai emoji, jangan pakai tanda bintang, jangan menulis instruksi di dalam narasi.
Balas HANYA dengan JSON valid tanpa penjelasan.`;

interface RawScene {
  narration: string;
  visual: string;
  location: string;
  time_of_day: "pagi" | "siang" | "sore" | "malam";
  mood: string;
  camera?: string;
  emphasis?: string[];
  characters?: string[];
  purpose?: string;
}

interface RawStory {
  title: string;
  logline: string;
  tone: string;
  setting: string;
  hook: string;
  ending: string;
  cta: string;
  scenes: RawScene[];
}

function buildUserPrompt(req: StoryRequest, sceneCount: number, words: number): string {
  const style = req.style;
  return `Buat naskah video cerita animasi 2D bergaya stickman.
TARGET DURASI: ${req.duration} detik.
JUMLAH ADEGAN: tepat ${sceneCount}.
TOTAL KATA NARASI: sekitar ${words} kata (jangan lebih dari ${Math.round(words * 1.1)}).
MODE: ${req.input.mode}
IDE/TOPIK/NASKAH DARI PENGGUNA:
"""
${req.input.mode === "script" ? req.input.script : req.input.mode === "topic" ? req.input.topic : req.input.idea}
"""
AUDIENS: ${req.input.audience || "umum"}
GAYA NARASI: ${style.narration.tone} (${style.narration.pov})
GAYA VISUAL: ${style.characterStyle.description}
KARAKTER YANG SUDAH ADA (pertahankan nama & deskripsi):
${style.characters.map((c) => `- ${c.name} (${c.role}): ${c.description}`).join("\n")}
EPISODE: ${req.episodeNumber ?? 1}

Format JSON:
{"title":string,"logline":string,"tone":string,"setting":string,"hook":string,"ending":string,"cta":string,
 "scenes":[{"narration":string,"visual":string,"location":string,"time_of_day":"malam","mood":string,
 "camera":"slow-push|pan-left|pan-right|handheld|static|pull-out|shake","emphasis":[string],
 "characters":[string],"purpose":"hook|setup|konflik|klimaks|resolusi|cta"}]}`;
}

async function callOpenAiCompatible(prompt: string, system: string): Promise<string> {
  const base = env.llm.baseUrl || "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.llm.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.llm.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`LLM gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(prompt: string, system: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.llm.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.llm.model,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { content: { type: string; text: string }[] };
  return json.content?.map((c) => c.text).join("\n") ?? "";
}

async function callGemini(prompt: string, system: string): Promise<string> {
  const model = env.llm.model || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.llm.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates: { content: { parts: { text: string }[] } }[] };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
}

function parseStoryJson(raw: string): RawStory {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("LLM tidak mengembalikan JSON");
  return JSON.parse(cleaned.slice(start, end + 1)) as RawStory;
}

function toStoryDoc(raw: RawStory, req: StoryRequest, provider: string, model: string): StoryDoc {
  const style = req.style;
  const chars: CharacterSpec[] = style.characters ?? [];
  const byName = new Map(chars.map((c) => [c.name.toLowerCase(), c]));
  const scenes: Scene[] = raw.scenes.slice(0, sceneBudget(req.duration)).map((rs, i) => {
    const present = (rs.characters ?? [])
      .map((n) => byName.get(n.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));
    const words = rs.narration.split(/\s+/).filter(Boolean).length;
    return {
      id: `sc_${i + 1}`,
      index: i,
      purpose: (rs.purpose as Scene["purpose"]) ?? (i === 0 ? "hook" : i === raw.scenes.length - 1 ? "cta" : "konflik"),
      narration: rs.narration.trim(),
      visualPrompt: rs.visual,
      imagePrompt: `Vertical 9:16 cinematic 2D cartoon, ${rs.visual}. ${style.characterStyle.description}. Warm cinematic lighting, deep shadows, Indonesian setting, no text.`,
      durationMs: Math.max(2400, Math.min(10000, Math.round((words / 150) * 60_000) + 800)),
      location: rs.location || "rumah malam",
      timeOfDay: rs.time_of_day || "malam",
      mood: rs.mood || "tegang",
      camera: (rs.camera as Scene["camera"]) ?? "slow-push",
      characters: present.length ? present : chars.slice(0, 2).map((c) => c.id),
      transition: i === 0 ? "fade" : "cut",
      emphasisWords: (rs.emphasis ?? []).map((e) => e.toLowerCase()).slice(0, 3),
      sfx: [],
      words: [],
      status: "draft",
    };
  });
  return {
    title: raw.title,
    logline: raw.logline,
    tone: raw.tone,
    setting: raw.setting,
    characters: chars,
    hook: raw.hook || scenes[0]?.narration || "",
    ending: raw.ending || scenes[scenes.length - 1]?.narration || "",
    cta: raw.cta,
    totalDurationMs: scenes.reduce((a, s) => a + s.durationMs, 0),
    scenes,
    generatedBy: `${provider}:${model}`,
    generatedAt: new Date().toISOString(),
    episodeNumber: req.episodeNumber ?? 1,
  };
}

/**
 * Generates a story using the configured LLM, and falls back to the built-in
 * story engine when no key is configured or the provider fails.
 */
export async function generateStoryWithLlm(req: StoryRequest): Promise<LlmResult> {
  const provider = env.llm.provider;
  const sceneCount = sceneBudget(req.duration);
  const words = wordBudget(req.duration);
  if (provider === "local" || !env.llm.apiKey) {
    const story = generateStory(req);
    return {
      story,
      provider: "local",
      model: "story-engine-lokal",
      costUsd: 0,
      fallbackReason: provider === "local" ? undefined : "LLM_API_KEY belum diatur, memakai mesin cerita lokal.",
    };
  }
  const prompt = buildUserPrompt(req, sceneCount, words);
  try {
    let raw = "";
    if (provider === "anthropic") raw = await callAnthropic(prompt, SYSTEM_PROMPT);
    else if (provider === "gemini") raw = await callGemini(prompt, SYSTEM_PROMPT);
    else raw = await callOpenAiCompatible(prompt, SYSTEM_PROMPT);
    const parsed = parseStoryJson(raw);
    if (!parsed.scenes?.length) throw new Error("LLM tidak menghasilkan adegan");
    const story = toStoryDoc(parsed, req, provider, env.llm.model);
    return {
      story,
      provider,
      model: env.llm.model,
      costUsd: env.cost.llmPerProject,
    };
  } catch (err) {
    const story = generateStory(req);
    return {
      story,
      provider: "local",
      model: "story-engine-lokal",
      costUsd: 0,
      fallbackReason: `LLM ${provider} gagal: ${err instanceof Error ? err.message : String(err)}. Memakai mesin cerita lokal.`,
    };
  }
}

export function llmConfigured(): boolean {
  return env.llm.provider === "local" || Boolean(env.llm.apiKey);
}

export function genreFor(input: StoryInput): string {
  return detectGenre(`${input.idea} ${input.topic} ${input.script}`);
}
