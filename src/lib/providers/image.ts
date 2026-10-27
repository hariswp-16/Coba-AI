import { env } from "../env";

export interface ImageRequest {
  prompt: string;
  width: number;
  height: number;
  seed?: number;
}

export interface ImageResult {
  buffer: Buffer;
  mime: string;
  provider: string;
  costUsd: number;
  note?: string;
}

export interface ImageAdapter {
  id: string;
  label: string;
  available(): boolean;
  supportsResolution(w: number, h: number): boolean;
  generate(req: ImageRequest): Promise<ImageResult>;
}

function openAiSize(w: number, h: number): string {
  if (h > w) return "1024x1536";
  if (w > h) return "1536x1024";
  return "1024x1024";
}

export const openAiImages: ImageAdapter = {
  id: "openai",
  label: "OpenAI gpt-image-1",
  available: () => Boolean(env.image.apiKey),
  supportsResolution: () => true,
  async generate(req) {
    if (!env.image.apiKey) throw new Error("IMAGE_API_KEY belum diatur");
    const res = await fetch(`${env.image.baseUrl || "https://api.openai.com/v1"}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.image.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.image.model || "gpt-image-1",
        prompt: req.prompt,
        size: openAiSize(req.width, req.height),
        quality: "medium",
        n: 1,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI image gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
    const item = json.data?.[0];
    if (item?.b64_json) {
      return { buffer: Buffer.from(item.b64_json, "base64"), mime: "image/png", provider: "openai", costUsd: env.cost.imagePerScene };
    }
    if (item?.url) {
      const img = await fetch(item.url);
      return { buffer: Buffer.from(await img.arrayBuffer()), mime: "image/png", provider: "openai", costUsd: env.cost.imagePerScene };
    }
    throw new Error("OpenAI image tidak mengembalikan data");
  },
};

export const stabilityImages: ImageAdapter = {
  id: "stability",
  label: "Stability AI (SD 3.5)",
  available: () => Boolean(env.image.apiKey),
  supportsResolution: () => true,
  async generate(req) {
    if (!env.image.apiKey) throw new Error("IMAGE_API_KEY belum diatur");
    const form = new FormData();
    form.append("prompt", req.prompt);
    form.append("aspect_ratio", "9:16");
    form.append("output_format", "png");
    if (req.seed) form.append("seed", String(req.seed));
    const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/sd3", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.image.apiKey}`, Accept: "image/*" },
      body: form,
    });
    if (!res.ok) throw new Error(`Stability gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: "image/png", provider: "stability", costUsd: env.cost.imagePerScene };
  },
};

export const replicateImages: ImageAdapter = {
  id: "replicate",
  label: "Replicate (FLUX schnell)",
  available: () => Boolean(env.image.apiKey),
  supportsResolution: () => true,
  async generate(req) {
    if (!env.image.apiKey) throw new Error("IMAGE_API_KEY belum diatur");
    const start = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.image.apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt: req.prompt,
          aspect_ratio: "9:16",
          output_format: "png",
          num_outputs: 1,
        },
      }),
    });
    if (!start.ok) throw new Error(`Replicate gagal (${start.status}): ${(await start.text()).slice(0, 300)}`);
    let pred = (await start.json()) as { status: string; output?: string[]; urls?: { get: string } };
    let guard = 0;
    while (pred.status !== "succeeded" && pred.status !== "failed" && guard++ < 60) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(pred.urls!.get, { headers: { Authorization: `Bearer ${env.image.apiKey}` } });
      pred = (await poll.json()) as typeof pred;
    }
    if (pred.status !== "succeeded" || !pred.output?.length) throw new Error("Replicate tidak menghasilkan gambar");
    const img = await fetch(pred.output[0]);
    return {
      buffer: Buffer.from(await img.arrayBuffer()),
      mime: "image/png",
      provider: "replicate",
      costUsd: env.cost.imagePerScene,
    };
  },
};

export const falImages: ImageAdapter = {
  id: "fal",
  label: "fal.ai (FLUX.1 schnell)",
  available: () => Boolean(env.image.apiKey),
  supportsResolution: () => true,
  async generate(req) {
    if (!env.image.apiKey) throw new Error("IMAGE_API_KEY belum diatur");
    const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: { Authorization: `Key ${env.image.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: req.prompt, image_size: "portrait_16_9", num_images: 1 }),
    });
    if (!res.ok) throw new Error(`fal.ai gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { images: { url: string }[] };
    const url = json.images?.[0]?.url;
    if (!url) throw new Error("fal.ai tidak menghasilkan gambar");
    const img = await fetch(url);
    return { buffer: Buffer.from(await img.arrayBuffer()), mime: "image/jpeg", provider: "fal", costUsd: env.cost.imagePerScene };
  },
};

const ADAPTERS: ImageAdapter[] = [openAiImages, stabilityImages, replicateImages, falImages];

export function getImageAdapter(): ImageAdapter | null {
  if (env.image.provider === "local") return null;
  const adapter = ADAPTERS.find((a) => a.id === env.image.provider);
  if (!adapter) return null;
  if (!adapter.available()) {
    throw new Error(
      `Provider gambar "${env.image.provider}" dipilih tetapi IMAGE_API_KEY belum diatur. Animasi prosedural akan dipakai sebagai gantinya.`
    );
  }
  return adapter;
}

export function hasAiImages(): boolean {
  return env.image.provider !== "local" && Boolean(env.image.apiKey);
}
