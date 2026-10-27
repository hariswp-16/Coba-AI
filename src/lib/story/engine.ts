import type { CharacterSpec, Scene, StoryDoc, StoryInput, StyleProfileSpec, DurationOption } from "../types";
import { BEAT_BANK, GENRE_LABEL, LOCATION_POOL, MOOD_POOL, WEATHER_POOL, detectGenre, type Genre } from "./genres";
import { mulberry32, hashString } from "../anim/geometry";

export interface StoryRequest {
  input: StoryInput;
  duration: DurationOption;
  style: StyleProfileSpec;
  episodeNumber?: number;
  previousStory?: StoryDoc | null;
  seed?: number;
}

const WORDS_PER_MINUTE = 150;

const ATMOSPHERE_LINES = [
  "Hujan turun lebih deras dari sebelumnya.",
  "Jam dinding terus berdetak, tapi waktu terasa berhenti.",
  "Lampu kuning itu berkedip sekali, lalu diam.",
  "Tidak ada suara lain selain napas {A} sendiri.",
  "Angin malam membawa bau tanah basah.",
  "Di luar, jalanan kosong dan basah.",
  "Telepon di meja bergetar, lalu berhenti.",
  "Bayangan di dinding bergerak pelan.",
  "Langit gelap tanpa satu bintang pun.",
  "{B} menatap {A} tanpa berkata apa-apa.",
  "Suara langkah itu berhenti tepat di depan pintu.",
  "Ada getar halus di tangan {A}.",
];

export function sceneBudget(duration: number): number {
  // scenes never shorter than ~2.6s, never longer than ~9s
  if (duration <= 15) return 3;
  if (duration <= 30) return 4;
  if (duration <= 45) return 5;
  if (duration <= 60) return 7;
  if (duration <= 90) return 9;
  return 11;
}

export function wordBudget(durationSeconds: number, rate = 1): number {
  return Math.round((durationSeconds * WORDS_PER_MINUTE * rate) / 60);
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

function fill(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => slots[k] ?? "");
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function truncateWords(text: string, max: number): string {
  const words = text.split(/\s+/);
  if (words.length <= max) return text;
  let out = words.slice(0, max).join(" ");
  out = out.replace(/[,;:]$/, "");
  if (!/[.!?]$/.test(out)) out += ".";
  return out;
}

interface IdeaAnalysis {
  subject: string;
  keywords: string[];
  names: string[];
  setting: string | null;
  genre: Genre;
  title: string;
  settingTime: "pagi" | "siang" | "sore" | "malam";
  placeShort: string | null;
}

const STOP_NAMES = new Set([
  "aku","saya","kamu","dia","mereka","kami","kita","ibu","ayah","bapak","adik","kakak","nenek","kakek","teman","sahabat",
  "tapi","lalu","dan","saat","ketika","setelah","sebelum","malam","pagi","siang","sore","hujan","dajjal","kabar","suatu",
  "film","video","episode","cerita","seorang","sebuah","yang","dengan","untuk","dari","dalam","pada","akan","sudah",
  "jangan","hanya","semua","orang","anak","rumah","kota","jalan","kamar","masjid","sekolah","teras","misteri","horor",
  "indonesia","allah","tuhan","akhir","zaman","ceritanya","lanjutan",
]);

const SETTING_HINTS: { test: RegExp; setting: string; short: string; time: "pagi" | "siang" | "sore" | "malam" }[] = [
  { test: /masjid|musala|musholla|surau|salat|sholat/, setting: "masjid kampung", short: "masjid ini", time: "malam" },
  { test: /kamar|tidur/, setting: "kamar kecil dengan lampu kuning", short: "kamar ini", time: "malam" },
  { test: /teras|beranda/, setting: "teras rumah saat hujan", short: "teras ini", time: "malam" },
  { test: /sekolah|kelas|kantor/, setting: "halaman sekolah", short: "sekolah ini", time: "siang" },
  { test: /jalan|kota|gang|pasar|terminal|halte/, setting: "jalan kota yang basah oleh hujan", short: "kota ini", time: "malam" },
  { test: /rumah|dapur|ruang tamu/, setting: "rumah tua di ujung gang", short: "rumah ini", time: "malam" },
  { test: /hutan|makam|kuburan|kampung/, setting: "jalan berlumpur menuju makam", short: "kampung ini", time: "malam" },
];

export function analyzeIdea(input: StoryInput, fallbackGenre: Genre = "misteri"): IdeaAnalysis {
  const raw = (input.mode === "script" ? input.script : input.mode === "topic" ? input.topic : input.idea) || "";
  const text = raw.trim();
  const lowered = text.toLowerCase();
  const genre = detectGenre(lowered, fallbackGenre);

  const names = Array.from(text.matchAll(/\b([A-Z][a-z]{2,14})\b/g))
    .map((m) => m[1])
    .filter((n) => !STOP_NAMES.has(n.toLowerCase()) && !/^(Episode|Bagian)$/.test(n));

  const hint = SETTING_HINTS.find((h) => h.test.test(lowered));
  const setting = hint ? hint.setting : null;
  const placeShort = hint ? hint.short : null;
  const keywords = Array.from(new Set(lowered.split(/[^a-z0-9]+/).filter((w) => w.length > 4))).slice(0, 14);
  const subject = text.split(/[.!?\n]/)[0]?.trim().slice(0, 110) || GENRE_LABEL[genre];
  const titleSeed = input.mode === "topic" ? input.topic : subject;
  const title = generateTitle(titleSeed, genre);
  return {
    subject,
    keywords,
    names: Array.from(new Set(names)).slice(0, 3),
    setting,
    placeShort,
    settingTime: hint?.time ?? "malam",
    genre,
    title,
  };
}

const TITLE_PATTERNS: Record<Genre, string[]> = {
  misteri: ["Malam Ketiga", "Kabar di Balik Pintu", "Jangan Buka Pintu Itu", "Suara di Teras", "Yang Tidak Pernah Pulang", "Malam Pertama"],
  horor: ["Jangan Masuk", "Rumah yang Tidak Kosong", "Suara dari Kuburan Lama", "Pantangan Kampung", "Yang Mengetuk Malam Itu"],
  keluarga: ["Pulang", "Surat yang Tidak Pernah Dikirim", "Tiga Kata Itu", "Meja Makan Kosong", "Anak yang Pergi"],
  persahabatan: ["Jalan Pulang", "Satu Kelas, Satu Janji", "Yang Membelamu", "Teman Terakhir", "Kita Hadapi Bersama"],
  religi: ["Tanda Itu", "Ketika Semua Suara Berhenti", "Pintu Masjid Terbuka", "Malam Terakhir", "Yang Datang di Balik Kabut"],
  motivasi: ["Sekali Lagi", "Pagi yang Sulit", "Tidak Ada yang Percaya", "Modal Satu Tekad", "Setahun Kemudian"],
  cinta: ["Nama yang Tak Terhapus", "Tujuh Tahun", "Sebelum Bulan Depan", "Pulang Bersama Rindu", "Yang Hampir Terucap"],
};

function generateTitle(subject: string, genre: Genre): string {
  const clean = subject.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (clean && clean.length <= 42 && clean.split(" ").length <= 6) return titleCase(clean);
  const list = TITLE_PATTERNS[genre];
  return list[Math.floor(Math.random() * list.length)];
}

/* ------------------------------------------------------------------ */
/* Local narrative generator                                           */
/* ------------------------------------------------------------------ */

export function generateLocalStory(req: StoryRequest): StoryDoc {
  const seed = req.seed ?? hashString(JSON.stringify(req.input) + req.duration);
  const rnd = mulberry32(seed);
  const analysis = analyzeIdea(req.input, "misteri");
  const genre = analysis.genre;
  const sceneCount = sceneBudget(req.duration);
  const totalWords = wordBudget(req.duration);

  // Cast: prefer the style profile characters so the visual stays consistent.
  const styleChars = req.style.characters ?? [];
  const protagonist = styleChars[0] ?? fallbackCharacter("utama");
  const second = styleChars[1] ?? fallbackCharacter("pendukung");
  const third = styleChars[2] ?? fallbackCharacter("anak");

  const protagonistName = analysis.names[0] ?? protagonist.name;
  const secondName = analysis.names[1] ?? second.name;

  const locations = LOCATION_POOL[genre];
  const moods = MOOD_POOL[genre];
  const weathers = WEATHER_POOL[genre];

  type Beat = "hook" | "setup" | "konflik" | "klimaks" | "resolusi" | "cta";
  const beats: Beat[] = [];
  if (sceneCount <= 3) {
    beats.push("hook", "konflik", "cta");
  } else {
    const middleCount = sceneCount - 4; // hook + klimaks + resolusi + cta
    beats.push("hook", "setup");
    for (let i = 0; i < middleCount - 1; i++) beats.push(i % 2 === 0 ? "konflik" : "setup");
    beats.push("klimaks", "resolusi", "cta");
  }
  while (beats.length > sceneCount) beats.splice(3, 1);
  while (beats.length < sceneCount) beats.splice(beats.length - 1, 0, "konflik");

  const usedLines = new Set<string>();
  const bank = BEAT_BANK[genre];
  const location = analysis.setting ? analysis.setting : pick(locations, rnd).text;
  const timeOfDay = pick(locations, rnd).time;

  const episodes = req.episodeNumber ?? 1;
  const placeShort = analysis.placeShort ?? "tempat itu";
  const slotBase: Record<string, string> = {
    A: protagonistName,
    B: secondName,
    T: placeShort,
    O: pick(["sebuah kotak kayu", "surat lama", "lampu minyak", "sebuah kunci", "kalender dinding"], rnd),
    W: pick(["malam", "tengah malam", "hujan pertama", "senja"], rnd),
    N: String(episodes),
  };

  const rawSceneNarrations: string[] = [];
  const targetPerScene = Math.max(9, Math.round(totalWords / sceneCount));
  for (let i = 0; i < sceneCount; i++) {
    const beat = beats[i];
    const bankItems = bank.filter((b) => b.key === beat);
    const lines: string[] = [];
    let guard = 0;
    const countWords = () => lines.join(" ").split(/\s+/).filter(Boolean).length;
    while (countWords() < targetPerScene && guard < 18) {
      const item = bankItems[guard % Math.max(1, bankItems.length)] ?? bank[0];
      const options = item.lines.filter((l) => !usedLines.has(l));
      const chosen = options.length ? pick(options, rnd) : pick(item.lines, rnd);
      usedLines.add(chosen);
      const sentence = fill(chosen, slotBase);
      if (!lines.includes(sentence)) lines.push(sentence);
      guard++;
      if (lines.length >= 5) break;
    }
    // pad with atmosphere lines when the beat bank is exhausted
    while (countWords() < targetPerScene && lines.length < 6) {
      lines.push(fill(pick(ATMOSPHERE_LINES, rnd), slotBase));
      guard++;
      if (guard > 30) break;
    }
    rawSceneNarrations.push(capitalizeSentences(lines.join(" ")));
  }

  // make the hook echo the user's own idea when one was supplied
  const ideaWords = (req.input.mode === "idea" ? req.input.idea : req.input.mode === "topic" ? req.input.topic : "").trim();
  if (ideaWords && ideaWords.split(/\s+/).length <= 16) {
    const first = ideaWords.replace(/^["“]|["”]$/g, "").replace(/[.]$/, "");
    const sentence = first.charAt(0).toUpperCase() + first.slice(1);
    rawSceneNarrations[0] = `${sentence}. ${rawSceneNarrations[0]}`;
  }

  // Balance word counts against the target duration
  const wordsPerScene = rawSceneNarrations.map((n) => n.split(/\s+/).length);
  const totalGenerated = wordsPerScene.reduce((a, b) => a + b, 0);
  const scale = totalWords / Math.max(1, totalGenerated);
  const scenes: Scene[] = [];

  for (let i = 0; i < sceneCount; i++) {
    const beat = beats[i];
    const narration = trimToBudget(rawSceneNarrations[i], Math.max(6, Math.round(wordsPerScene[i] * scale)));
    const sceneLocation = i === 0 ? location : pick(locations, rnd).text;
    const scenePlace = i === 0 ? placeShort : pick(locations, rnd).text;
    const mood = beat === "hook" ? moods[0] : beat === "klimaks" ? moods[1] ?? moods[0] : pick(moods, rnd);
    const weather = pick(weathers, rnd);
    const present = beat === "cta" ? [protagonist] : [protagonist, ...[second, third].slice(0, rnd() > 0.45 ? 2 : 1)];
    void scenePlace;
    const sceneSeed = hashString(`${seed}-${i}`);
    const durationMs = Math.round((narration.split(/\s+/).length / WORDS_PER_MINUTE) * 60_000);
    scenes.push({
      id: `sc_${i + 1}`,
      index: i,
      purpose: beat,
      narration,
      visualPrompt: buildVisualPrompt({ beat, mood, weather, location: sceneLocation, characters: present, style: req.style, narration, episode: episodes }),
      imagePrompt: buildImagePrompt({ style: req.style, location: sceneLocation, mood, weather, characters: present, beat }),
      durationMs: Math.max(2600, Math.min(9000, durationMs + 900)),
      location: sceneLocation,
      timeOfDay: timeOfDay === "malam" || /malam|gelap/.test(sceneLocation) ? "malam" : (pick(["siang", "sore", "pagi"], rnd) as "siang" | "sore" | "pagi"),
      mood,
      weather: weather as Scene["weather"],
      camera: pickCamera(beat, sceneSeed),
      characters: present.map((c) => c.id),
      transition: pickTransition(beat, i, sceneCount, req.style),
      emphasisWords: pickEmphasis(narration, req.style),
      sfx: pickSfx(weather, beat),
      words: [],
      status: "draft",
    });
  }

  const story: StoryDoc = {
    title: analysis.title,
    logline: `${protagonistName} harus menghadapi ${analysis.subject.toLowerCase().replace(/[.]$/, "")} — dan tidak semuanya bisa diselamatkan.`,
    tone: GENRE_LABEL[genre],
    setting: `${location}, ${timeOfDay}`,
    characters: styleChars.length ? styleChars : [protagonist, second, third],
    hook: scenes[0]?.narration ?? "",
    ending: scenes[scenes.length - 1]?.narration ?? "",
    cta: (bank.find((b) => b.key === "cta")?.lines[0] ?? "Komentar di bawah.").replace(/\{A\}/g, protagonistName),
    totalDurationMs: scenes.reduce((a, s) => a + s.durationMs, 0),
    scenes,
    generatedBy: "story-engine-lokal",
    generatedAt: new Date().toISOString(),
    episodeNumber: episodes,
  };
  return story;
}

function fallbackCharacter(kind: "utama" | "pendukung" | "anak"): CharacterSpec {
  const role: CharacterSpec["role"] = kind === "anak" ? "pendukung" : kind;
  return {
    id: kind,
    name: kind === "utama" ? "Raka" : kind === "pendukung" ? "Ibu" : "Adik",
    role,
    gender: kind === "utama" ? "pria" : "wanita",
    age: kind === "anak" ? "anak" : "dewasa",
    skin: "#e8d3bb",
    hair: "#15110f",
    hairStyle: role === "pendukung" ? "hijab" : "pendek",
    hijabColor: "#6a5744",
    shirt: "#5f6d3e",
    pants: "#2f3238",
    heightScale: 1,
    face: "khawatir",
    description: "Karakter utama cerita.",
  };
}

function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p1: string, p2: string) => p1 + p2.toUpperCase());
}

function trimToBudget(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  const cut = words.slice(0, maxWords).join(" ");
  const lastPunct = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  const result = lastPunct > cut.length * 0.45 ? cut.slice(0, lastPunct + 1) : `${cut.replace(/[,;:]$/, "")}.`;
  return result.replace(/\s+/g, " ").trim();
}

function pickCamera(beat: string, seed: number): Scene["camera"] {
  const options: Scene["camera"][] =
    beat === "klimaks" ? ["shake", "handheld", "slow-push"] : beat === "hook" ? ["slow-push", "pan-right", "handheld"] : ["slow-push", "pan-left", "pan-right", "static"];
  return options[seed % options.length];
}

function pickTransition(beat: string, index: number, total: number, style: StyleProfileSpec): Scene["transition"] {
  if (index === 0) return "fade";
  if (index === total - 1) return "fade";
  if (beat === "klimaks") return "zoom";
  return (style.transitions.type === "dissolve" ? "dissolve" : style.transitions.type === "whip" ? "whip" : "cut") as Scene["transition"];
}

function pickSfx(weather: string, beat: string): string[] {
  const sfx: string[] = [];
  if (["hujan", "badai", "gerimis"].includes(weather)) sfx.push("hujan");
  if (weather === "badai") sfx.push("petir");
  if (beat === "klimaks") sfx.push("jantung");
  if (beat === "hook") sfx.push("angin");
  return Array.from(new Set(sfx));
}

const EMPHASIS_CANDIDATES = [
  "dajjal", "hilang", "takut", "gagal", "bangkit", "ibu", "ayah", "sahabat", "malam", "hujan", "jangan", "berhenti", "selamat", "mati", "rahasia", "menangis", "pulang", "kebenaran", "terakhir", "sendiri", "doa", "harus", "tidak", "tapi", "hanya",
];

function pickEmphasis(narration: string, style: StyleProfileSpec): string[] {
  const words = narration.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""));
  const lower = words.map((w) => w.toLowerCase());
  const hits = lower.filter((w) => EMPHASIS_CANDIDATES.includes(w));
  const picked = Array.from(new Set(hits)).slice(0, 2);
  if (picked.length) return picked;
  const longest = [...lower].filter((w) => w.length > 5).sort((a, b) => b.length - a.length)[0];
  return longest ? [longest] : [];
}

export function buildVisualPrompt(o: {
  beat: string;
  mood: string;
  weather: string;
  location: string;
  characters: CharacterSpec[];
  style: StyleProfileSpec;
  narration: string;
  episode: number;
}): string {
  const cast = o.characters.map((c) => `${c.name} (${c.description})`).join("; ");
  return [
    `Adegan ${o.beat}: ${o.narration}`,
    `Lokasi: ${o.location}. Cuaca: ${o.weather}. Suasana: ${o.mood}.`,
    `Karakter: ${cast}.`,
    `Gaya: ${o.style.characterStyle.description}`,
    `Latar: ${o.style.background.style}. Pencahayaan: ${o.style.lighting.key}.`,
    `Rasio 9:16 vertikal, sinematik, warna hangat, bayangan dalam, detail sederhana.`,
  ].join(" ");
}

export function buildImagePrompt(o: {
  style: StyleProfileSpec;
  location: string;
  mood: string;
  weather: string;
  characters: CharacterSpec[];
  beat: string;
}): string {
  const cast = o.characters.map((c) => `${c.name}: ${c.description}`).join("; ");
  return [
    "Vertical 9:16 cinematic 2D cartoon illustration, simple stickman-style characters with beige skin, ball joints and colored clothing.",
    `Scene: ${o.location}, ${o.weather}, ${o.mood} mood.`,
    cast ? `Characters in consistent design: ${cast}.` : "",
    `Warm cinematic lighting, deep shadows, heavy vignette, subtle film grain, ${o.beat} beat.`,
    "No text, no watermark, clean shapes, Indonesian setting.",
  ]
    .filter(Boolean)
    .join(" ");
}

/* ------------------------------------------------------------------ */
/* Script mode                                                         */
/* ------------------------------------------------------------------ */

export function storyFromScript(req: StoryRequest): StoryDoc {
  const script = (req.input.script || "").trim();
  const sentences = script
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sceneCount = Math.min(sceneBudget(req.duration), Math.max(2, Math.ceil(sentences.length / 2)));
  const perScene = Math.ceil(sentences.length / sceneCount);
  const style = req.style;
  const characters = style.characters ?? [];
  const analysis = analyzeIdea(req.input);
  const chunks: string[] = [];
  for (let i = 0; i < sceneCount; i++) {
    chunks.push(sentences.slice(i * perScene, (i + 1) * perScene).join(" "));
  }
  const purposes: Scene["purpose"][] = ["hook", "setup", "konflik", "klimaks", "resolusi", "cta"];
  const scenes: Scene[] = chunks
    .filter((c) => c.trim().length)
    .map((narration, i) => {
      const purpose = purposes[Math.min(purposes.length - 1, Math.floor((i / Math.max(1, chunks.length)) * purposes.length))];
      const mood = purpose === "klimaks" ? "tegang" : purpose === "hook" ? "misterius" : "dramatis";
      return {
        id: `sc_${i + 1}`,
        index: i,
        purpose,
        narration,
        visualPrompt: buildVisualPrompt({
          beat: purpose,
          mood,
          weather: "hujan",
          location: analysis.setting ?? "rumah malam",
          characters,
          style,
          narration,
          episode: req.episodeNumber ?? 1,
        }),
        imagePrompt: buildImagePrompt({
          style,
          location: analysis.setting ?? "rumah malam",
          mood,
          weather: "hujan",
          characters,
          beat: purpose,
        }),
        durationMs: Math.max(2600, Math.min(12000, Math.round((narration.split(/\s+/).length / WORDS_PER_MINUTE) * 60_000) + 600)),
        location: analysis.setting ?? "rumah malam",
        timeOfDay: "malam" as const,
        mood,
        weather: "hujan" as const,
        camera: pickCamera(purpose, i * 7),
        characters: characters.map((c) => c.id),
        transition: pickTransition(purpose, i, chunks.length, style),
        emphasisWords: pickEmphasis(narration, style),
        sfx: pickSfx("hujan", purpose),
        words: [],
        status: "draft" as const,
      };
    });
  return {
    title: analysis.title,
    logline: script.slice(0, 160),
    tone: GENRE_LABEL[analysis.genre],
    setting: analysis.setting ?? "Indonesia, malam hari",
    characters,
    hook: scenes[0]?.narration ?? "",
    ending: scenes[scenes.length - 1]?.narration ?? "",
    cta: "Tulis pendapatmu di komentar.",
    totalDurationMs: scenes.reduce((a, s) => a + s.durationMs, 0),
    scenes,
    generatedBy: "naskah-pengguna",
    generatedAt: new Date().toISOString(),
    episodeNumber: req.episodeNumber ?? 1,
  };
}

/** Continue an existing story: reuse cast/setting and open a new arc. */
export function continueStory(req: StoryRequest): StoryDoc {
  const prev = req.previousStory;
  if (!prev) return generateLocalStory(req);
  const next: StoryRequest = {
    ...req,
    input: {
      ...req.input,
      mode: "idea",
      idea: `${prev.setting}. Lanjutan episode ${prev.episodeNumber ?? 1}: ${req.input.idea || prev.hook}`,
    },
    episodeNumber: (prev.episodeNumber ?? 1) + 1,
  };
  const story = generateLocalStory(next);
  story.characters = prev.characters;
  story.title = `${prev.title} — Episode ${(prev.episodeNumber ?? 1) + 1}`;
  story.scenes = story.scenes.map((s, i) =>
    i === 0
      ? {
          ...s,
          narration: `Sebelumnya, ${prev.hook.split(".")[0]}. ${s.narration}`.trim(),
          mood: "tegang",
        }
      : s
  );
  story.hook = story.scenes[0]?.narration ?? story.hook;
  story.episodeNumber = (prev.episodeNumber ?? 1) + 1;
  return story;
}

export function generateStory(req: StoryRequest): StoryDoc {
  if (req.input.mode === "script") return storyFromScript(req);
  if (req.input.mode === "continue") return continueStory(req);
  return generateLocalStory(req);
}
