import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";

export interface StorageDriverImpl {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  localPath(key: string): Promise<string | null>;
  publicUrl(key: string): Promise<string>;
}

class LocalStorage implements StorageDriverImpl {
  constructor(private root: string) {}
  private abs(key: string) {
    const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
    return path.join(this.root, safe);
  }
  async put(key: string, data: Buffer) {
    const p = this.abs(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }
  async putFile(key: string, filePath: string) {
    const p = this.abs(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.copyFile(filePath, p);
  }
  async get(key: string) {
    return fs.readFile(this.abs(key));
  }
  async getStream(key: string) {
    return createReadStream(this.abs(key));
  }
  async delete(key: string) {
    await fs.rm(this.abs(key), { force: true });
  }
  async exists(key: string) {
    try {
      await fs.access(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }
  async localPath(key: string) {
    return this.abs(key);
  }
  async publicUrl(key: string) {
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}

class S3Storage implements StorageDriverImpl {
  private client: import("@aws-sdk/client-s3").S3Client | null = null;
  private bucket = env.storage.s3.bucket;
  private cacheDir = path.join(env.storage.localDir, "_cache");

  private async sdk() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    if (!this.client) {
      this.client = new S3Client({
        region: env.storage.s3.region,
        endpoint: env.storage.s3.endpoint || undefined,
        forcePathStyle: Boolean(env.storage.s3.endpoint),
        credentials: {
          accessKeyId: env.storage.s3.accessKeyId,
          secretAccessKey: env.storage.s3.secretAccessKey,
        },
      });
    }
    return this.client;
  }

  async put(key: string, data: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.sdk();
    await client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType })
    );
  }
  async putFile(key: string, filePath: string, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.sdk();
    const body = await fs.readFile(filePath);
    await client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.sdk();
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    // @ts-expect-error - Node stream in SDK v3
    for await (const c of res.Body) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }
  async getStream(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.sdk();
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as unknown as NodeJS.ReadableStream;
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.sdk();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async exists(key: string) {
    try {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await this.sdk();
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
  async localPath(key: string) {
    // Rendering needs a real local file; download and cache it.
    const local = path.join(this.cacheDir, key.replace(/[^a-zA-Z0-9._/-]/g, "_"));
    try {
      await fs.access(local);
      return local;
    } catch {
      /* not cached */
    }
    const buf = await this.get(key);
    await fs.mkdir(path.dirname(local), { recursive: true });
    await fs.writeFile(local, buf);
    return local;
  }
  async publicUrl(key: string) {
    if (env.storage.s3.publicBaseUrl) return `${env.storage.s3.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.sdk();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 3600 * 6 });
  }
}

let impl: StorageDriverImpl | null = null;

export function storage(): StorageDriverImpl {
  if (impl) return impl;
  impl =
    env.storage.driver === "s3" && env.storage.s3.bucket
      ? new S3Storage()
      : new LocalStorage(env.storage.localDir);
  return impl;
}

export function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function saveBuffer(
  key: string,
  data: Buffer,
  contentType: string
): Promise<{ key: string; bytes: number; sha256: string }> {
  await storage().put(key, data, contentType);
  return { key, bytes: data.length, sha256: sha256(data) };
}

export async function saveFile(
  key: string,
  filePath: string,
  contentType: string
): Promise<{ key: string; bytes: number; sha256: string }> {
  const st = await fs.stat(filePath);
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve())
      .on("error", reject);
  });
  await storage().putFile(key, filePath, contentType);
  return { key, bytes: st.size, sha256: hash.digest("hex") };
}

export function assetKey(kind: string, fileName: string): string {
  const d = new Date();
  const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${kind}/${ym}/${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
