/**
 * Central, server-only configuration.
 * Nothing in this file is ever imported by client components.
 */
import path from "node:path";

function str(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}
function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && process.env[key] !== "" ? v : fallback;
}

export type StorageDriver = "local" | "s3";
export type LlmProvider = "local" | "openai" | "anthropic" | "gemini" | "openai-compatible";
export type ImageProvider = "local" | "openai" | "stability" | "replicate" | "fal";
export type TtsProvider = "local" | "elevenlabs" | "openai" | "google" | "azure";
export type VoiceCloneProvider = "none" | "elevenlabs" | "fishaudio";
export type VideoProvider = "none" | "replicate" | "fal";

export const env = {
  appUrl: str("APP_URL", "http://localhost:3000"),
  appPassword: str("APP_PASSWORD"),
  sessionSecret: str("SESSION_SECRET", "dev-insecure-session-secret-change-me"),

  storage: {
    driver: str("STORAGE_DRIVER", "local") as StorageDriver,
    localDir: path.resolve(str("LOCAL_STORAGE_DIR", "./storage")),
    s3: {
      bucket: str("S3_BUCKET"),
      region: str("S3_REGION", "ap-southeast-1"),
      endpoint: str("S3_ENDPOINT"),
      accessKeyId: str("S3_ACCESS_KEY_ID"),
      secretAccessKey: str("S3_SECRET_ACCESS_KEY"),
      publicBaseUrl: str("S3_PUBLIC_BASE_URL"),
    },
  },

  ffmpeg: {
    ffmpegPath: str("FFMPEG_PATH"),
    ffprobePath: str("FFPROBE_PATH"),
  },

  llm: {
    provider: str("LLM_PROVIDER", "local") as LlmProvider,
    apiKey: str("LLM_API_KEY"),
    model: str("LLM_MODEL", "gpt-4o-mini"),
    baseUrl: str("LLM_BASE_URL"),
  },

  image: {
    provider: str("IMAGE_PROVIDER", "local") as ImageProvider,
    apiKey: str("IMAGE_API_KEY"),
    model: str("IMAGE_MODEL", "gpt-image-1"),
    baseUrl: str("IMAGE_BASE_URL"),
  },

  tts: {
    provider: str("TTS_PROVIDER", "local") as TtsProvider,
    apiKey: str("TTS_API_KEY"),
  },

  voiceClone: {
    provider: str("VOICE_CLONE_PROVIDER", "none") as VoiceCloneProvider,
    apiKey: str("VOICE_CLONE_API_KEY"),
  },

  video: {
    provider: str("VIDEO_PROVIDER", "none") as VideoProvider,
    apiKey: str("VIDEO_API_KEY"),
  },

  cost: {
    imagePerScene: num("COST_IMAGE_PER_SCENE", 0.04),
    ttsPer1kChars: num("COST_TTS_PER_1K_CHARS", 0.15),
    llmPerProject: num("COST_LLM_PER_PROJECT", 0.01),
  },

  limits: {
    maxProjectSeconds: 120,
    allowedSeconds: [15, 30, 45, 60, 90, 120] as const,
    maxUploadBytes: 300 * 1024 * 1024,
  },
};

export function integrationStatus() {
  return {
    llm: {
      provider: env.llm.provider,
      configured: env.llm.provider === "local" ? true : Boolean(env.llm.apiKey),
      model: env.llm.provider === "local" ? "story-engine-lokal" : env.llm.model,
      requiresKey: env.llm.provider !== "local",
    },
    image: {
      provider: env.image.provider,
      configured: env.image.provider === "local" ? true : Boolean(env.image.apiKey),
      model: env.image.provider === "local" ? "procedural-2d-renderer" : env.image.model,
      requiresKey: env.image.provider !== "local",
    },
    tts: {
      provider: env.tts.provider,
      configured: env.tts.provider === "local" ? true : Boolean(env.tts.apiKey),
      model: env.tts.provider === "local" ? "espeak-ng (id)" : env.tts.provider,
      requiresKey: env.tts.provider !== "local",
    },
    voiceClone: {
      provider: env.voiceClone.provider,
      configured: env.voiceClone.provider !== "none" && Boolean(env.voiceClone.apiKey),
      requiresKey: env.voiceClone.provider !== "none",
    },
    video: {
      provider: env.video.provider,
      configured: env.video.provider !== "none" && Boolean(env.video.apiKey),
      requiresKey: env.video.provider !== "none",
    },
    storage: {
      driver: env.storage.driver,
      configured:
        env.storage.driver === "local" ||
        Boolean(env.storage.s3.bucket && env.storage.s3.accessKeyId && env.storage.s3.secretAccessKey),
    },
  };
}
