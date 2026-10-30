/**
 * Shared domain types (safe to import from client components).
 */

export type DurationOption = 15 | 30 | 45 | 60 | 90 | 120;
export const DURATION_OPTIONS: DurationOption[] = [15, 30, 45, 60, 90, 120];

export type AspectRatio = "9:16" | "16:9" | "1:1";
export type ResolutionPreset = { width: number; height: number; label: string };
export const RESOLUTIONS: Record<string, ResolutionPreset> = {
  "720p": { width: 720, height: 1280, label: "720 × 1280 (HD)" },
  "1080p": { width: 1080, height: 1920, label: "1080 × 1920 (Full HD)" },
};

export type Quality = "draft" | "standard" | "high";

/* ------------------------------------------------------------------ */
/* Style profile                                                       */
/* ------------------------------------------------------------------ */

export interface SubtitleStyle {
  enabled: boolean;
  fontFamily: string;
  fontWeight: number;
  fontSize: number; // in 720x1280 space
  uppercase: boolean;
  fill: string;
  emphasisColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: number;
  positionY: number; // 0..1 of frame height (baseline anchor)
  maxCharsPerLine: number;
  wordsPerChunk: number;
  letterSpacing: number;
  lineHeight: number;
  background: boolean;
  backgroundColor: string;
  marginX: number;
  mode: "word" | "phrase";
}

export interface HudStyle {
  enabled: boolean;
  labelText: string; // e.g. "MALAM PERTAMA"
  labelColor: string;
  clockEnabled: boolean;
  clockColor: string;
  episodeText: string; // e.g. "DAJJAL  EPISODE 2"
  episodeColor: string;
  fontFamily: string;
  positionY: number;
  align: "left" | "center";
  marginX: number;
  dotEnabled: boolean;
}

export interface PaletteSpec {
  background: string;
  wall: string;
  floor: string;
  accent: string;
  lampWarm: string;
  shadow: string;
  text: string;
  highlight: string;
}

export interface CharacterSpec {
  id: string;
  name: string;
  role: "utama" | "pendukung" | "figuran";
  gender: "pria" | "wanita" | "anak";
  age: "dewasa" | "remaja" | "anak";
  skin: string;
  hair: string;
  hairStyle: "pendek" | "hijab" | "panjang" | "botak" | "topi";
  hijabColor?: string;
  shirt: string;
  pants: string;
  heightScale: number;
  face: "netral" | "khawatir" | "sedih" | "marah" | "takut";
  accessories?: string[];
  description: string;
}

export interface StyleProfileSpec {
  version: 1;
  /**
   * Which frame renderer this style uses.
   * - "stickman"   illustrated character stage (default)
   * - "motiongfx"  flat vector motion graphics with kinetic typography
   */
  renderer?: "stickman" | "motiongfx";
  aspect: AspectRatio;
  width: number;
  height: number;
  fps: number;
  palette: PaletteSpec;
  characterStyle: {
    lineWeight: number;
    jointStyle: "ball" | "round" | "tapered";
    headShape: "oval" | "round";
    outline: string;
    description: string;
  };
  characters: CharacterSpec[];
  lighting: {
    key: string;
    mood: string;
    vignette: number;
    grain: number;
    colorTemp: "hangat" | "dingin" | "netral";
    contrast: number;
  };
  background: { style: string; detailLevel: number; depthLayers: number };
  subtitle: SubtitleStyle;
  hud: HudStyle;
  pacing: {
    avgSceneSeconds: number;
    wordsPerMinute: number;
    pauseBetweenScenesMs: number;
    hookSeconds: number;
    outroSeconds: number;
  };
  narration: {
    tone: string;
    pov: "orang pertama" | "orang ketiga" | "narator";
    language: string;
    styleNotes: string;
  };
  audio: {
    musicMood: string;
    musicVolume: number;
    voiceVolume: number;
    ducking: number;
    sfx: string[];
    loudnessTarget: number;
  };
  transitions: {
    type: "cut" | "fade" | "whip" | "zoom" | "dissolve";
    durationMs: number;
    pattern: string;
  };
  opening: {
    style: string;
    showTitleCard: boolean;
    hookFirst: boolean;
    description: string;
  };
  ending: {
    style: string;
    ctaText: string;
    choicePills: boolean;
    description: string;
  };
  graphics: {
    episodeLabel: boolean;
    clock: boolean;
    choicePills: boolean;
    notes: string;
  };
}

export type StyleSource = "reference-video" | "manual" | "preset" | "template";

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  source: StyleSource;
  isTemplate: boolean;
  referenceAssetId: string | null;
  analysis: ReferenceAnalysis | null;
  spec: StyleProfileSpec;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Reference analysis                                                  */
/* ------------------------------------------------------------------ */

export interface ReferenceAnalysis {
  source: {
    fileName: string;
    durationSeconds: number;
    width: number;
    height: number;
    aspect: string;
    fps: number;
    videoCodec: string;
    audioCodec: string;
    bitrateKbps: number;
    sizeBytes: number;
  };
  scenes: { index: number; startSeconds: number; endSeconds: number; durationSeconds: number }[];
  cutPattern: { avgSceneSeconds: number; cutsPerMinute: number; shortest: number; longest: number };
  audio: {
    integratedLufs: number;
    truePeakDb: number;
    loudnessRange: number;
    silenceRatio: number;
    hasVoice: boolean;
    musicPresence: string;
    estimatedWpm: number;
  };
  visual: {
    dominantColors: string[];
    brightness: number;
    contrast: number;
    saturation: number;
    edgeDensity: number;
    subtitleBand: { detected: boolean; centerYRatio: number; coverageRatio: number };
    hudBand: { detected: boolean; centerYRatio: number };
    lineWork: string;
    estimatedStyle: string;
    emphasisColors: string[];
  };
  sampleFrames: { timeSeconds: number; dataUrl: string }[];
  notes: string[];
  analyzedAt: string;
}

/* ------------------------------------------------------------------ */
/* Story / scenes                                                      */
/* ------------------------------------------------------------------ */

export type ScenePurpose = "hook" | "setup" | "konflik" | "klimaks" | "resolusi" | "cta";

export interface SceneWord {
  text: string;
  startMs: number;
  endMs: number;
  emphasis: boolean;
}

export interface Scene {
  id: string;
  index: number;
  purpose: ScenePurpose;
  narration: string;
  dialogue?: { character: string; line: string }[];
  visualPrompt: string;
  imagePrompt: string;
  durationMs: number;
  location: string;
  timeOfDay: "pagi" | "siang" | "sore" | "malam";
  mood: string;
  weather?: "cerah" | "hujan" | "berkabut" | "badai" | "gerimis";
  camera: "slow-push" | "pan-left" | "pan-right" | "handheld" | "static" | "pull-out" | "shake";
  characters: string[];
  transition: "cut" | "fade" | "whip" | "zoom" | "dissolve";
  emphasisWords: string[];
  sfx: string[];
  words: SceneWord[];
  audioAssetId?: string | null;
  imageAssetId?: string | null;
  visualSource?: "procedural" | "ai-image" | "ai-video";
  status: "draft" | "ready" | "rendered" | "error";
  error?: string | null;
}

export interface StoryDoc {
  title: string;
  logline: string;
  tone: string;
  setting: string;
  characters: CharacterSpec[];
  hook: string;
  ending: string;
  cta: string;
  totalDurationMs: number;
  scenes: Scene[];
  generatedBy: string;
  generatedAt: string;
  episodeNumber?: number;
}

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

export type ProjectStatus =
  | "draft"
  | "story-ready"
  | "generating"
  | "rendering"
  | "ready"
  | "error";

export interface SubtitleSettings extends Partial<SubtitleStyle> {
  styleProfileId?: string;
  showHud?: boolean;
}

export interface AudioSettings {
  musicMood: string;
  musicEnabled: boolean;
  musicVolume: number; // 0..1
  voiceVolume: number; // 0..1
  ducking: number; // 0..1 how much music drops under voice
  sfxEnabled: boolean;
  loudnessTarget: number;
}

export interface VoiceSettings {
  mode: "preset" | "cloned";
  voiceId: string; // preset id or voice profile id
  provider: string;
  rate: number; // 0.7..1.3
  pitch: number; // -0.3..0.3
  persona: string;
}

export interface StoryInput {
  mode: "idea" | "topic" | "script" | "continue";
  idea: string;
  topic: string;
  script: string;
  previousProjectId?: string;
  episodeNumber?: number;
  audience: string;
  language: string;
}

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  durationTarget: number;
  aspect: AspectRatio;
  width: number;
  height: number;
  fps: number;
  quality: Quality;
  styleProfileId: string | null;
  styleProfileName?: string;
  story: StoryDoc | null;
  storyInput: StoryInput;
  subtitleSettings: SubtitleSettings;
  audioSettings: AudioSettings;
  voiceSettings: VoiceSettings;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  srtUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  lastRenderId: string | null;
  lastRenderStatus: RenderStatus | null;
  lastRenderProgress: number | null;
  sceneCount: number;
}

/* ------------------------------------------------------------------ */
/* Render jobs                                                         */
/* ------------------------------------------------------------------ */

export type RenderStatus = "queued" | "running" | "done" | "error" | "canceled";

export const RENDER_STEPS = [
  { key: "analyze", label: "Analisis cerita" },
  { key: "storyboard", label: "Pembuatan storyboard" },
  { key: "visual", label: "Generasi visual" },
  { key: "voice", label: "Pembuatan voice-over" },
  { key: "subtitle", label: "Pembuatan subtitle" },
  { key: "mix", label: "Penggabungan audio & visual" },
  { key: "render", label: "Rendering" },
  { key: "done", label: "Video siap diunduh" },
] as const;

export type RenderStepKey = (typeof RENDER_STEPS)[number]["key"];

export interface RenderJob {
  id: string;
  projectId: string;
  type: "full" | "scene" | "audio" | "visual";
  status: RenderStatus;
  step: RenderStepKey;
  progress: number;
  steps: { key: RenderStepKey; label: string; status: "pending" | "active" | "done" | "error"; note?: string }[];
  error: string | null;
  logs: string[];
  outputAssetId: string | null;
  outputUrl: string | null;
  srtAssetId: string | null;
  srtUrl: string | null;
  queuePosition?: number;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  paramsJson?: string | null;
}

/* ------------------------------------------------------------------ */
/* Voice profiles                                                      */
/* ------------------------------------------------------------------ */

export interface VoiceProfile {
  id: string;
  name: string;
  provider: string;
  providerVoiceId: string | null;
  status: "pending" | "ready" | "error" | "unavailable";
  sampleUrl: string | null;
  sampleSeconds: number | null;
  consentAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface VoicePreset {
  id: string;
  name: string;
  persona: string;
  description: string;
  provider: string;
  providerVoiceId: string;
  rate: number;
  pitch: number;
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

export type AssetKind = "video" | "image" | "audio" | "render" | "subtitle" | "sample";

export interface Asset {
  id: string;
  kind: AssetKind;
  url: string;
  fileName: string;
  mime: string;
  bytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  provider: string | null;
  createdAt: string;
}
