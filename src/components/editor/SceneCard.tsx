"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Clock, Eye, MapPin, Sparkles, Wand2 } from "lucide-react";
import type { Scene } from "@/lib/types";
import { Badge } from "@/components/ui/Primitives";

const MOODS = ["takut", "sedih", "marah", "semangat", "gelisah", "khidmat", "tenang", "senang"];
const CAMERAS: Scene["camera"][] = ["slow-push", "pan-left", "pan-right", "handheld", "static", "pull-out", "shake"];
const TRANSITIONS: Scene["transition"][] = ["cut", "fade", "whip", "zoom", "dissolve"];
const TIMES: Scene["timeOfDay"][] = ["pagi", "siang", "sore", "malam"];
const WEATHERS = ["cerah", "hujan", "berkabut", "badai", "gerimis"] as const;

export function SceneCard({
  projectId,
  scene,
  index,
  total,
  defaultOpen,
  onChange,
  onPreview,
}: {
  projectId: string;
  scene: Scene;
  index: number;
  total: number;
  defaultOpen: boolean;
  onChange: (patch: Partial<Scene>) => void;
  onPreview: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [thumbKey, setThumbKey] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [showThumb, setShowThumb] = useState(true);

  // only load previews for cards near the viewport to keep the editor snappy
  useEffect(() => {
    if (index > 5) setShowThumb(false);
  }, [index]);

  const previewSrc = `/api/projects/${projectId}/preview?scene=${index}&t=1800&w=360&v=${thumbKey}`;

  return (
    <div className={clsx("card overflow-hidden p-0 transition", open && "ring-1 ring-lime/25")}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03]">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/8 text-[11px] font-bold text-mist-200">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">{scene.narration.slice(0, 60) || "Adegan tanpa narasi"}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-mist-400">
            <span>{scene.purpose}</span>
            <span>·</span>
            <span>{(scene.durationMs / 1000).toFixed(1)}s</span>
            <span>·</span>
            <span>{scene.mood}</span>
          </span>
        </span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 text-mist-400 transition", open && "rotate-180")} />
      </button>

      <div className="relative aspect-[16/10] w-full overflow-hidden border-y border-white/8 bg-ink-950">
        {showThumb && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={thumbKey}
            src={previewSrc}
            alt={`Pratinjau adegan ${index + 1}`}
            className="h-full w-full object-cover object-center"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-mist-600">
            <Sparkles className="h-5 w-5" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 to-transparent px-2.5 pb-1.5 pt-6">
          <span className="flex items-center gap-1 text-[10px] text-white/80">
            <MapPin className="h-2.5 w-2.5" /> {scene.location} · {scene.timeOfDay}
          </span>
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setImgError(false);
                setThumbKey((k) => k + 1);
              }}
              className="rounded-md bg-black/60 p-1 text-white/70 hover:text-lime"
              title="Muat ulang frame"
            >
              <Wand2 className="h-3 w-3" />
            </button>
            <button onClick={() => setOpen(true)} className="rounded-md p-1 text-white/70 hover:text-lime" title="Lihat besar">
              <Eye className="h-3 w-3" />
            </button>
          </div>
        </div>
        <Badge tone="neutral" className="absolute left-2 top-2 !bg-black/60 !text-[10px]">
          <Clock className="h-2.5 w-2.5" /> {(scene.durationMs / 1000).toFixed(1)}s
        </Badge>
      </div>

      {open && (
        <div className="space-y-3 p-3">
          <div>
            <label className="label">Narasi</label>
            <textarea
              className="input min-h-[76px] resize-y text-[13px]"
              value={scene.narration}
              onChange={(e) => onChange({ narration: e.target.value })}
            />
            <div className="mt-1 flex justify-between text-[10px] text-mist-400">
              <span>{scene.narration.split(/\s+/).filter(Boolean).length} kata</span>
              <span>
                #{index + 1}/{total}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Emosi</label>
              <select className="input !py-1.5 text-xs" value={scene.mood} onChange={(e) => onChange({ mood: e.target.value })}>
                {[...new Set([scene.mood, ...MOODS])].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Kamera</label>
              <select className="input !py-1.5 text-xs" value={scene.camera} onChange={(e) => onChange({ camera: e.target.value as Scene["camera"] })}>
                {CAMERAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Waktu</label>
              <select className="input !py-1.5 text-xs" value={scene.timeOfDay} onChange={(e) => onChange({ timeOfDay: e.target.value as Scene["timeOfDay"] })}>
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Transisi</label>
              <select className="input !py-1.5 text-xs" value={scene.transition} onChange={(e) => onChange({ transition: e.target.value as Scene["transition"] })}>
                {TRANSITIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Durasi (ms)</label>
              <input
                className="input !py-1.5 text-xs"
                type="number"
                min={600}
                max={20000}
                step={100}
                value={scene.durationMs}
                onChange={(e) => onChange({ durationMs: Math.max(600, Number(e.target.value) || 600) })}
              />
            </div>
            <div>
              <label className="label">Cuaca</label>
              <select
                className="input !py-1.5 text-xs"
                value={scene.weather ?? "cerah"}
                onChange={(e) => onChange({ weather: e.target.value as Scene["weather"] })}
              >
                {WEATHERS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Lokasi</label>
            <input className="input !py-1.5 text-xs" value={scene.location} onChange={(e) => onChange({ location: e.target.value })} />
          </div>

          <div>
            <label className="label">Kata penekanan</label>
            <input
              className="input !py-1.5 text-xs"
              value={scene.emphasisWords.join(", ")}
              placeholder="pisahkan dengan koma"
              onChange={(e) =>
                onChange({
                  emphasisWords: e.target.value
                    .split(",")
                    .map((w) => w.trim())
                    .filter(Boolean),
                })
              }
            />
            <p className="mt-1 text-[10px] text-mist-400">Kata ini diberi warna penekanan pada subtitle dan aksen visual.</p>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-mist-400">Visual</span>
            <span className="truncate text-[10px] text-mist-300" title={scene.visualPrompt}>
              {scene.visualPrompt || "prosedural"}
            </span>
          </div>

          <div className="flex gap-2">
            <button className="btn-secondary flex-1 !py-1.5 text-xs" onClick={onPreview}>
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              className="btn-ghost !py-1.5 text-xs"
              onClick={() => {
                setImgError(false);
                setThumbKey((k) => k + 1);
              }}
            >
              <Wand2 className="h-3.5 w-3.5" /> Render frame
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
