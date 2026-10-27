import { getDb, nowIso, newId, DEFAULT_USER_ID } from "./index";
import type {
  Asset,
  Project,
  RenderJob,
  StyleProfile,
  VoiceProfile,
  StoryDoc,
  StoryInput,
  SubtitleSettings,
  AudioSettings,
  VoiceSettings,
  Quality,
  AspectRatio,
  RenderStatus,
  RenderStepKey,
} from "../types";
import { RENDER_STEPS } from "../types";

type Row = Record<string, unknown>;

const parse = <T,>(v: unknown, fallback: T): T => {
  if (typeof v !== "string" || !v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

/* ------------------------------- assets ------------------------------- */

export function insertAsset(a: {
  id?: string;
  kind: Asset["kind"];
  storageKey: string;
  fileName: string;
  mime: string;
  bytes: number;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  sha256?: string | null;
  provider?: string | null;
  meta?: Record<string, unknown> | null;
  userId?: string;
}): string {
  const db = getDb();
  const id = a.id ?? newId("as");
  db.prepare(
    `INSERT INTO assets (id, user_id, kind, storage_key, file_name, mime, bytes, duration_seconds, width, height, sha256, provider, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    a.userId ?? DEFAULT_USER_ID,
    a.kind,
    a.storageKey,
    a.fileName,
    a.mime,
    a.bytes,
    a.durationSeconds ?? null,
    a.width ?? null,
    a.height ?? null,
    a.sha256 ?? null,
    a.provider ?? null,
    a.meta ? JSON.stringify(a.meta) : null,
    nowIso()
  );
  return id;
}

export function getAssetRow(id: string): (Asset & { storageKey: string }) | null {
  const row = getDb().prepare("SELECT * FROM assets WHERE id = ?").get(id) as Row | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    kind: row.kind as Asset["kind"],
    storageKey: String(row.storage_key),
    url: "",
    fileName: String(row.file_name),
    mime: String(row.mime),
    bytes: Number(row.bytes),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    provider: (row.provider as string) ?? null,
    createdAt: String(row.created_at),
  };
}

export function findAssetBySha(sha256: string, kind: Asset["kind"]): string | null {
  const row = getDb()
    .prepare("SELECT id FROM assets WHERE sha256 = ? AND kind = ? ORDER BY created_at DESC LIMIT 1")
    .get(sha256, kind) as { id: string } | undefined;
  return row?.id ?? null;
}

/* ------------------------------- cache -------------------------------- */

export function getCache(cacheKey: string): { assetId: string; meta: Record<string, unknown> } | null {
  const row = getDb().prepare("SELECT * FROM generation_cache WHERE cache_key = ?").get(cacheKey) as Row | undefined;
  if (!row) return null;
  return { assetId: String(row.asset_id), meta: parse<Record<string, unknown>>(row.meta_json, {}) };
}

export function setCache(cacheKey: string, kind: string, assetId: string, meta?: Record<string, unknown>) {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO generation_cache (cache_key, kind, asset_id, meta_json, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(cacheKey, kind, assetId, meta ? JSON.stringify(meta) : null, nowIso());
}

/* ------------------------------ projects ------------------------------ */

type ProjectRow = Row & Record<string, any>;

export function mapProjectRow(r: ProjectRow, extras?: { videoUrl?: string | null; srtUrl?: string | null; thumbnailUrl?: string | null; lastRender?: RenderJob | null; sceneCount?: number }): Project {
  const story = parse<StoryDoc | null>(r.story_json, null);
  return {
    id: String(r.id),
    title: String(r.title),
    status: r.status,
    durationTarget: Number(r.duration_target),
    aspect: r.aspect as AspectRatio,
    width: Number(r.width),
    height: Number(r.height),
    fps: Number(r.fps),
    quality: r.quality as Quality,
    styleProfileId: (r.style_profile_id as string) ?? null,
    story,
    storyInput: parse<StoryInput>(r.story_input_json, {
      mode: "idea",
      idea: "",
      topic: "",
      script: "",
      audience: "umum",
      language: "id",
    }),
    subtitleSettings: parse<SubtitleSettings>(r.subtitle_settings_json, {}),
    audioSettings: parse<AudioSettings>(r.audio_settings_json, {
      musicMood: "sedih",
      musicEnabled: true,
      musicVolume: 0.22,
      voiceVolume: 1,
      ducking: 0.6,
      sfxEnabled: true,
      loudnessTarget: -14,
    }),
    voiceSettings: parse<VoiceSettings>(r.voice_settings_json, {
      mode: "preset",
      voiceId: "narrator-dramatic",
      provider: "local",
      rate: 1,
      pitch: 0,
      persona: "Narator dramatis",
    }),
    thumbnailUrl: extras?.thumbnailUrl ?? null,
    videoUrl: extras?.videoUrl ?? null,
    srtUrl: extras?.srtUrl ?? null,
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    lastRenderId: extras?.lastRender?.id ?? null,
    lastRenderStatus: extras?.lastRender?.status ?? null,
    lastRenderProgress: extras?.lastRender?.progress ?? null,
    sceneCount: extras?.sceneCount ?? story?.scenes.length ?? 0,
  };
}

export function listProjects(limit = 100): Project[] {
  const rows = getDb()
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as ProjectRow[];
  return rows.map((r) => {
    const p = mapProjectRow(r);
    const job = getLatestJob(p.id);
    return {
      ...p,
      lastRenderId: job?.id ?? null,
      lastRenderStatus: job?.status ?? null,
      lastRenderProgress: job?.progress ?? null,
      videoUrl: r.video_asset_id ? `/api/assets/${r.video_asset_id}/file` : null,
      srtUrl: r.srt_asset_id ? `/api/assets/${r.srt_asset_id}/file` : null,
      thumbnailUrl: r.thumbnail_asset_id ? `/api/assets/${r.thumbnail_asset_id}/file` : null,
    };
  });
}

export function getProject(id: string): Project | null {
  const row = getProjectRow(id);
  if (!row) return null;
  const p = mapProjectRow(row);
  const job = getLatestJob(p.id);
  const style = p.styleProfileId ? getStyle(p.styleProfileId) : null;
  return {
    ...p,
    styleProfileName: style?.name,
    lastRenderId: job?.id ?? null,
    lastRenderStatus: job?.status ?? null,
    lastRenderProgress: job?.progress ?? null,
    videoUrl: row.video_asset_id ? `/api/assets/${row.video_asset_id}/file` : null,
    srtUrl: row.srt_asset_id ? `/api/assets/${row.srt_asset_id}/file` : null,
    thumbnailUrl: row.thumbnail_asset_id ? `/api/assets/${row.thumbnail_asset_id}/file` : null,
  };
}

export function createProject(input: {
  title: string;
  durationTarget: number;
  aspect: AspectRatio;
  width: number;
  height: number;
  fps: number;
  quality: Quality;
  styleProfileId: string | null;
  storyInput: StoryInput;
  subtitleSettings: SubtitleSettings;
  audioSettings: AudioSettings;
  voiceSettings: VoiceSettings;
}): string {
  const db = getDb();
  const id = newId("pr");
  const now = nowIso();
  db.prepare(
    `INSERT INTO projects (id, user_id, title, status, duration_target, aspect, width, height, fps, quality,
      style_profile_id, story_input_json, subtitle_settings_json, audio_settings_json, voice_settings_json, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_USER_ID,
    input.title,
    input.durationTarget,
    input.aspect,
    input.width,
    input.height,
    input.fps,
    input.quality,
    input.styleProfileId,
    JSON.stringify(input.storyInput),
    JSON.stringify(input.subtitleSettings),
    JSON.stringify(input.audioSettings),
    JSON.stringify(input.voiceSettings),
    now,
    now
  );
  return id;
}

export function getProjectRow(id: string) {
  return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
}

export function updateProject(id: string, patch: Record<string, unknown>) {
  const allowed: Record<string, string> = {
    title: "title",
    status: "status",
    durationTarget: "duration_target",
    styleProfileId: "style_profile_id",
    story: "story_json",
    storyInput: "story_input_json",
    subtitleSettings: "subtitle_settings_json",
    audioSettings: "audio_settings_json",
    voiceSettings: "voice_settings_json",
    videoAssetId: "video_asset_id",
    srtAssetId: "srt_asset_id",
    thumbnailAssetId: "thumbnail_asset_id",
    durationSeconds: "duration_seconds",
    error: "error",
    episodeNumber: "episode_number",
    width: "width",
    height: "height",
    fps: "fps",
    quality: "quality",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = allowed[k];
    if (!col) continue;
    // `undefined` means "field not supplied by the caller". Writing it anyway
    // would bind NULL and violate the NOT NULL schema on partial PATCHes.
    if (v === undefined) continue;
    sets.push(`${col} = ?`);
    if (["story", "storyInput", "subtitleSettings", "audioSettings", "voiceSettings"].includes(k)) {
      values.push(v == null ? null : JSON.stringify(v));
    } else values.push(v);
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  getDb().prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

/* -------------------------------- jobs -------------------------------- */

export function createJob(input: {
  projectId: string;
  type: RenderJob["type"];
  estimatedCostUsd: number | null;
  params?: Record<string, unknown>;
}): string {
  const id = newId("job");
  const steps = RENDER_STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    status: i === 0 ? "active" : "pending",
  }));
  getDb()
    .prepare(
      `INSERT INTO jobs (id, project_id, user_id, type, status, step, progress, steps_json, logs_json, params_json, estimated_cost_usd, created_at)
       VALUES (?, ?, ?, ?, 'queued', 'analyze', 0, ?, '[]', ?, ?, ?)`
    )
    .run(
      id,
      input.projectId,
      DEFAULT_USER_ID,
      input.type,
      JSON.stringify(steps),
      input.params ? JSON.stringify(input.params) : null,
      input.estimatedCostUsd,
      nowIso()
    );
  return id;
}

function mapJob(r: ProjectRow & Record<string, any>): RenderJob {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    type: r.type,
    status: r.status as RenderStatus,
    step: r.step as RenderStepKey,
    progress: Number(r.progress),
    steps: parse(r.steps_json, []),
    error: (r.error as string) ?? null,
    logs: parse(r.logs_json, []),
    outputAssetId: (r.output_asset_id as string) ?? null,
    outputUrl: null,
    srtAssetId: (r.srt_asset_id as string) ?? null,
    srtUrl: null,
    estimatedCostUsd: r.estimated_cost_usd == null ? null : Number(r.estimated_cost_usd),
    actualCostUsd: r.actual_cost_usd == null ? null : Number(r.actual_cost_usd),
    createdAt: String(r.created_at),
    startedAt: (r.started_at as string) ?? null,
    finishedAt: (r.finished_at as string) ?? null,
    paramsJson: (r.params_json as string) ?? null,
  } as RenderJob;
}

export function getJob(id: string): RenderJob | null {
  const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as ProjectRow | undefined;
  return row ? mapJob(row) : null;
}

export function getJobsForProject(projectId: string): RenderJob[] {
  const rows = getDb()
    .prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as ProjectRow[];
  return rows.map(mapJob);
}

export function getLatestJob(projectId: string): RenderJob | null {
  const row = getDb()
    .prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as ProjectRow | undefined;
  return row ? mapJob(row) : null;
}

export function claimNextJob(): RenderJob | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
    .get() as ProjectRow | undefined;
  if (!row) return null;
  const res = db
    .prepare(
      "UPDATE jobs SET status = 'running', started_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'queued'"
    )
    .run(nowIso(), row.id);
  if (res.changes === 0) return null;
  return getJob(String(row.id));
}

export function updateJob(
  id: string,
  patch: {
    status?: RenderStatus;
    step?: RenderStepKey;
    progress?: number;
    steps?: RenderJob["steps"];
    error?: string | null;
    outputAssetId?: string | null;
    srtAssetId?: string | null;
    actualCostUsd?: number | null;
    finishedAt?: string | null;
    logs?: string[];
  }
) {
  const cols: string[] = [];
  const values: unknown[] = [];
  const map: Record<string, string> = {
    status: "status",
    step: "step",
    progress: "progress",
    error: "error",
    outputAssetId: "output_asset_id",
    srtAssetId: "srt_asset_id",
    actualCostUsd: "actual_cost_usd",
    finishedAt: "finished_at",
  };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "steps") {
      cols.push("steps_json = ?");
      values.push(JSON.stringify(v));
    } else if (k === "logs") {
      cols.push("logs_json = ?");
      values.push(JSON.stringify(v));
    } else if (map[k]) {
      cols.push(`${map[k]} = ?`);
      values.push(v);
    }
  }
  if (!cols.length) return;
  values.push(id);
  getDb().prepare(`UPDATE jobs SET ${cols.join(", ")} WHERE id = ?`).run(...values);
}

export function appendJobLog(id: string, line: string) {
  const db = getDb();
  const row = db.prepare("SELECT logs_json FROM jobs WHERE id = ?").get(id) as { logs_json: string } | undefined;
  const logs = parse<string[]>(row?.logs_json, []);
  logs.push(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  db.prepare("UPDATE jobs SET logs_json = ? WHERE id = ?").run(JSON.stringify(logs), id);
}

export function failStuckJobs() {
  getDb()
    .prepare(
      "UPDATE jobs SET status = 'queued', progress = 0 WHERE status = 'running' AND started_at < datetime('now', '-30 minutes')"
    )
    .run();
}

/* ------------------------------- styles -------------------------------- */

export function insertStyle(p: {
  name: string;
  description: string;
  source: StyleProfile["source"];
  isTemplate: boolean;
  referenceAssetId: string | null;
  analysis: unknown;
  spec: unknown;
}): string {
  const id = newId("st");
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO style_profiles (id, user_id, name, description, source, is_template, reference_asset_id, analysis_json, spec_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      DEFAULT_USER_ID,
      p.name,
      p.description,
      p.source,
      p.isTemplate ? 1 : 0,
      p.referenceAssetId,
      p.analysis ? JSON.stringify(p.analysis) : null,
      JSON.stringify(p.spec),
      now,
      now
    );
  return id;
}

export function listStyles(): StyleProfile[] {
  const rows = getDb()
    .prepare("SELECT * FROM style_profiles ORDER BY is_template DESC, updated_at DESC")
    .all() as ProjectRow[];
  return rows.map(mapStyle);
}

export function getStyle(id: string): StyleProfile | null {
  const row = getDb().prepare("SELECT * FROM style_profiles WHERE id = ?").get(id) as ProjectRow | undefined;
  return row ? mapStyle(row) : null;
}

function mapStyle(r: ProjectRow): StyleProfile {
  return {
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string) ?? "",
    source: r.source as StyleProfile["source"],
    isTemplate: Boolean(r.is_template),
    referenceAssetId: (r.reference_asset_id as string) ?? null,
    analysis: parse(r.analysis_json, null),
    spec: parse(r.spec_json, {} as never),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function updateStyle(id: string, patch: { name?: string; description?: string; spec?: unknown; isTemplate?: boolean }) {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    values.push(patch.description);
  }
  if (patch.spec !== undefined) {
    sets.push("spec_json = ?");
    values.push(JSON.stringify(patch.spec));
  }
  if (patch.isTemplate !== undefined) {
    sets.push("is_template = ?");
    values.push(patch.isTemplate ? 1 : 0);
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  getDb().prepare(`UPDATE style_profiles SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteStyle(id: string) {
  getDb().prepare("DELETE FROM style_profiles WHERE id = ?").run(id);
}

export function deleteProject(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM jobs WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}

/* ------------------------------- voices -------------------------------- */

export function insertVoiceProfile(p: {
  name: string;
  provider: string;
  providerVoiceId: string | null;
  sampleAssetId: string | null;
  sampleSeconds: number | null;
  status: VoiceProfile["status"];
  consentAt: string | null;
  notes: string | null;
}): string {
  const id = newId("vp");
  getDb()
    .prepare(
      `INSERT INTO voice_profiles (id, user_id, name, provider, provider_voice_id, sample_asset_id, sample_seconds, status, consent_at, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      DEFAULT_USER_ID,
      p.name,
      p.provider,
      p.providerVoiceId,
      p.sampleAssetId,
      p.sampleSeconds,
      p.status,
      p.consentAt,
      p.notes,
      nowIso()
    );
  return id;
}

function mapVoice(r: ProjectRow): VoiceProfile {
  return {
    id: String(r.id),
    name: String(r.name),
    provider: String(r.provider),
    providerVoiceId: (r.provider_voice_id as string) ?? null,
    status: r.status as VoiceProfile["status"],
    sampleUrl: null,
    sampleSeconds: r.sample_seconds == null ? null : Number(r.sample_seconds),
    consentAt: (r.consent_at as string) ?? null,
    notes: (r.notes as string) ?? null,
    createdAt: String(r.created_at),
  };
}

export function listVoiceProfiles(): VoiceProfile[] {
  const rows = getDb().prepare("SELECT * FROM voice_profiles ORDER BY created_at DESC").all() as ProjectRow[];
  return rows.map(mapVoice);
}

export function getVoiceProfile(id: string): VoiceProfile | null {
  const row = getDb().prepare("SELECT * FROM voice_profiles WHERE id = ?").get(id) as ProjectRow | undefined;
  return row ? mapVoice(row) : null;
}

export function updateVoiceProfile(id: string, patch: Partial<{ name: string; status: string; notes: string; providerVoiceId: string }>) {
  const map: Record<string, string> = {
    name: "name",
    status: "status",
    notes: "notes",
    providerVoiceId: "provider_voice_id",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (map[k] && v !== undefined) {
      sets.push(`${map[k]} = ?`);
      values.push(v);
    }
  }
  if (!sets.length) return;
  values.push(id);
  getDb().prepare(`UPDATE voice_profiles SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteVoiceProfile(id: string) {
  getDb().prepare("DELETE FROM voice_profiles WHERE id = ?").run(id);
}

/* -------------------------------- costs -------------------------------- */

export function recordCost(projectId: string | null, provider: string, operation: string, units: number, unitLabel: string, costUsd: number) {
  getDb()
    .prepare(
      "INSERT INTO cost_events (id, project_id, provider, operation, units, unit_label, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(newId("cost"), projectId, provider, operation, units, unitLabel, costUsd, nowIso());
}

export function projectCost(projectId: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM cost_events WHERE project_id = ?")
    .get(projectId) as { total: number };
  return Number(row?.total ?? 0);
}

export interface CostSummary {
  totalUsd: number;
  byProvider: { provider: string; usd: number; events: number }[];
  byDay: { day: string; usd: number }[];
  byOperation: { operation: string; usd: number }[];
  events: number;
}

export function getCostSummary(): CostSummary {
  const db = getDb();
  const total = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total, COUNT(*) AS n FROM cost_events").get() as {
    total: number;
    n: number;
  };
  const byProvider = db
    .prepare("SELECT provider, COALESCE(SUM(cost_usd),0) AS usd, COUNT(*) AS events FROM cost_events GROUP BY provider ORDER BY usd DESC")
    .all() as { provider: string; usd: number; events: number }[];
  const byDay = db
    .prepare(
      "SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(cost_usd),0) AS usd FROM cost_events GROUP BY day ORDER BY day DESC LIMIT 14"
    )
    .all() as { day: string; usd: number }[];
  const byOperation = db
    .prepare("SELECT operation, COALESCE(SUM(cost_usd),0) AS usd FROM cost_events GROUP BY operation ORDER BY usd DESC LIMIT 10")
    .all() as { operation: string; usd: number }[];
  return {
    totalUsd: Number(total?.total ?? 0),
    events: Number(total?.n ?? 0),
    byProvider: byProvider.map((r) => ({ provider: r.provider, usd: Number(r.usd), events: Number(r.events) })),
    byDay: byDay.map((r) => ({ day: String(r.day), usd: Number(r.usd) })).reverse(),
    byOperation: byOperation.map((r) => ({ operation: r.operation, usd: Number(r.usd) })),
  };
}
