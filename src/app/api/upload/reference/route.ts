import fs from "node:fs/promises";
import path from "node:path";
import { guard, jsonOk, jsonError, errorMessage } from "@/lib/api";
import { env } from "@/lib/env";
import { probe, runFfmpeg, tempDir, cleanupDir } from "@/lib/ffmpeg";
import { analyzeReferenceVideo } from "@/lib/style/analyze";
import { assetKey, saveFile } from "@/lib/storage";
import { insertAsset } from "@/lib/db/repo";

export const maxDuration = 300;

const ALLOWED = ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm", "video/x-msvideo", "video/mpeg", "application/octet-stream"];

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const work = tempDir("upload");
  try {
    const form = await req.formData();
    const file = form.get("video");
    if (!(file instanceof File)) return jsonError("File video wajib diunggah", 422);
    if (file.size > env.limits.maxUploadBytes) {
      return jsonError(`Ukuran file melebihi batas ${Math.round(env.limits.maxUploadBytes / 1024 / 1024)} MB`, 413);
    }
    const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
    if (!["mp4", "mov", "mkv", "webm", "avi", "m4v", "mpeg", "mpg"].includes(ext)) {
      return jsonError("Format video tidak didukung. Gunakan MP4, MOV, MKV, WEBM, atau AVI.", 415);
    }
    if (file.type && !ALLOWED.includes(file.type)) {
      return jsonError(`Tipe file ${file.type} tidak didukung`, 415);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const sourcePath = path.join(work, `source.${ext}`);
    await fs.writeFile(sourcePath, buffer);

    const info = await probe(sourcePath);
    if (!info.width || !info.height) return jsonError("File tidak memiliki stream video yang valid", 422);
    if (info.duration < 2) return jsonError("Video referensi terlalu pendek (minimal 2 detik)", 422);
    if (info.duration > 900) return jsonError("Video referensi terlalu panjang (maksimal 15 menit)", 422);

    // normalise to a browser/ffmpeg friendly mp4 for storage
    const normalized = path.join(work, "reference.mp4");
    let finalProbe = info;
    try {
      await runFfmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        sourcePath,
        "-vf",
        "scale='min(720,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        "-y",
        normalized,
      ]);
      finalProbe = await probe(normalized);
    } catch {
      await fs.copyFile(sourcePath, normalized);
    }

    const key = assetKey("video", "reference.mp4");
    const saved = await saveFile(key, normalized, "video/mp4");
    const assetId = insertAsset({
      kind: "video",
      storageKey: saved.key,
      fileName: file.name,
      mime: "video/mp4",
      bytes: saved.bytes,
      durationSeconds: finalProbe.duration,
      width: finalProbe.width,
      height: finalProbe.height,
      provider: "upload",
      sha256: saved.sha256,
    });

    const { analysis, spec } = await analyzeReferenceVideo({
      filePath: normalized,
      fileName: file.name,
    });

    return jsonOk({ assetId, analysis, spec });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  } finally {
    await cleanupDir(work);
  }
}
