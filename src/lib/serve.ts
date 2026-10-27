import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";

export interface ByteRange {
  start: number;
  end: number;
}

/** Parses a single-range `Range: bytes=...` header. Returns null for absent/invalid/unsupported ranges. */
export function parseRange(header: string | null, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return "invalid";
  let start: number;
  let end: number;
  if (!rawStart) {
    // suffix range: last N bytes
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start >= size || start > end) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

function toWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

/**
 * Builds a Content-Disposition header that survives non-ASCII file names.
 * HTTP header values are ByteStrings, so an em dash (or any character above
 * U+00FF) inside `fileName` throws and would break the entire response. The
 * ASCII fallback keeps legacy clients happy; `filename*` carries the real name.
 */
export function contentDisposition(disposition: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export interface StreamFileOptions {
  /** Filesystem path when the storage driver is local. */
  filePath?: string | null;
  /** In-memory fallback for object storage (S3/R2). */
  buffer?: Buffer | null;
  contentType: string;
  fileName?: string;
  download?: boolean;
  rangeHeader?: string | null;
  cacheControl?: string;
}

/**
 * Serves a media file with HTTP Range support.
 *
 * Video players (Safari especially) refuse to play or seek an MP4 served as a
 * plain 200 response, so range requests must be answered with 206 + Content-Range.
 */
export async function serveFile(opts: StreamFileOptions): Promise<Response> {
  const size = opts.filePath ? (await fs.stat(opts.filePath)).size : (opts.buffer?.length ?? 0);
  if (!size) return new Response("File kosong", { status: 404 });

  const baseHeaders: Record<string, string> = {
    "Content-Type": opts.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cacheControl ?? "private, max-age=3600",
  };
  if (opts.fileName) {
    baseHeaders["Content-Disposition"] = contentDisposition(opts.download ? "attachment" : "inline", opts.fileName);
  }

  const requested = parseRange(opts.rangeHeader ?? null, size);
  if (requested === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  const range = requested ?? { start: 0, end: size - 1 };
  const length = range.end - range.start + 1;
  const headers: Record<string, string> = {
    ...baseHeaders,
    "Content-Length": String(length),
  };
  if (requested) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;

  let body: ReadableStream<Uint8Array> | Uint8Array;
  if (opts.filePath) {
    body = toWebStream(createReadStream(opts.filePath, { start: range.start, end: range.end }));
  } else {
    body = new Uint8Array(opts.buffer!.subarray(range.start, range.end + 1));
  }
  return new Response(body as BodyInit, { status: requested ? 206 : 200, headers });
}
