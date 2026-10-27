import fs from "node:fs/promises";
import path from "node:path";
import { guard, jsonOk, jsonError, errorMessage } from "@/lib/api";
import { insertVoiceProfile, listVoiceProfiles } from "@/lib/db/repo";
import { assetKey, saveFile } from "@/lib/storage";
import { probe, runFfmpeg, tempDir, cleanupDir } from "@/lib/ffmpeg";
import { getCloneAdapter, voiceCloneStatus } from "@/lib/providers/voiceClone";
import { insertAsset } from "@/lib/db/repo";

export const maxDuration = 300;

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const profiles = listVoiceProfiles().map((p) => ({
    ...p,
    sampleUrl: p.sampleUrl ?? null,
  }));
  return jsonOk({ profiles, status: voiceCloneStatus() });
}

/** Validates an uploaded voice sample. */
async function inspectSample(buffer: Buffer, fileName: string, work: string) {
  const ext = (fileName.split(".").pop() ?? "wav").toLowerCase();
  if (!["wav", "mp3", "m4a", "ogg", "webm", "opus", "flac", "aac"].includes(ext)) {
    throw new Error("Format audio tidak didukung. Gunakan WAV, MP3, M4A, OGG, atau FLAC.");
  }
  const rawPath = path.join(work, `sample.${ext}`);
  await fs.writeFile(rawPath, buffer);
  const wavPath = path.join(work, "sample.wav");
  await runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", rawPath, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", "-y", wavPath]);
  const info = await probe(wavPath);
  if (!info.hasAudio) throw new Error("File tidak memiliki track audio");
  if (info.duration < 4) throw new Error(`Sampel suara terlalu pendek (${info.duration.toFixed(1)} detik). Minimal 10 detik untuk hasil terbaik.`);
  if (info.duration > 300) throw new Error("Sampel suara terlalu panjang. Maksimal 5 menit.");
  // loudness check
  let lufs = -70;
  try {
    const { stderr } = await runFfmpeg(["-hide_banner", "-nostats", "-i", wavPath, "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
    const m = stderr.match(/"input_i"\s*:\s*"(-?[0-9.]+)"/);
    if (m) lufs = Number(m[1]);
  } catch {
    /* ignore */
  }
  if (lufs < -45) throw new Error("Sampel suara terlalu pelan atau hampir hening. Rekam ulang di tempat yang tenang.");
  // normalise to 24kHz mono wav for cloning providers
  const normPath = path.join(work, "sample-24k.wav");
  await runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", wavPath, "-af", "loudnorm=I=-16:TP=-2:LRA=11", "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", "-y", normPath]);
  return { wavPath: normPath, durationSeconds: info.duration, lufs };
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const work = tempDir("voice");
  try {
    const form = await req.formData();
    const file = form.get("sample");
    const name = String(form.get("name") ?? "").trim();
    const consent = String(form.get("consent") ?? "") === "true";
    if (!(file instanceof File)) return jsonError("Sampel suara wajib diunggah", 422);
    if (file.size > 40 * 1024 * 1024) return jsonError("Sampel suara maksimal 40 MB", 413);
    if (!name) return jsonError("Nama profil suara wajib diisi", 422);
    if (!consent) return jsonError("Konfirmasi hak dan izin atas suara wajib dicentang", 422);

    const buffer = Buffer.from(await file.arrayBuffer());
    const inspected = await inspectSample(buffer, file.name, work);
    const key = assetKey("sample", `${name.replace(/[^\w-]+/g, "_")}.wav`);
    const saved = await saveFile(key, inspected.wavPath, "audio/wav");
    const sampleAssetId = insertAsset({
      kind: "sample",
      storageKey: saved.key,
      fileName: `${name}.wav`,
      mime: "audio/wav",
      bytes: saved.bytes,
      durationSeconds: inspected.durationSeconds,
      provider: "upload",
      sha256: saved.sha256,
    });

    const adapter = getCloneAdapter();
    if (!adapter) {
      // No provider: keep the validated sample but be explicit that cloning is unavailable.
      const id = insertVoiceProfile({
        name,
        provider: "none",
        providerVoiceId: null,
        sampleAssetId,
        sampleSeconds: inspected.durationSeconds,
        status: "unavailable",
        consentAt: new Date().toISOString(),
        notes: voiceCloneStatus().reason,
      });
      return jsonOk({
        id,
        status: "unavailable",
        reason: voiceCloneStatus().reason,
        sampleValid: true,
        durationSeconds: inspected.durationSeconds,
      });
    }

    const clone = await adapter.createVoice({
      name,
      samplePath: inspected.wavPath,
      sampleSeconds: inspected.durationSeconds,
      consent: true,
    });
    const id = insertVoiceProfile({
      name,
      provider: clone.provider,
      providerVoiceId: clone.providerVoiceId,
      sampleAssetId,
      sampleSeconds: inspected.durationSeconds,
      status: clone.status === "ready" ? "ready" : clone.status === "unavailable" ? "unavailable" : "error",
      consentAt: new Date().toISOString(),
      notes: clone.note,
    });
    return jsonOk({ id, status: clone.status, reason: clone.note, sampleValid: true, durationSeconds: inspected.durationSeconds });
  } catch (err) {
    return jsonError(errorMessage(err), 400);
  } finally {
    await cleanupDir(work);
  }
}

