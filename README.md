# AI Video Studio — Generator Video Cerita Animasi

Platform full-stack untuk membuat **video cerita animasi vertikal (9:16) hingga 120 detik** secara otomatis:
storyboard dari satu ide cerita, visual prosedural 2D, voice-over Bahasa Indonesia, subtitle sinkron, musik,
HUD bergaya Reels — lalu dirender menjadi MP4 di server.

Gaya visual bisa **diambil dari video referensi**: unggah MP4/TikTok/Reels, sistem mengukur palet warna,
kontras, tempo potongan, posisi & ukuran subtitle, warna penekanan, dan HUD, kemudian menyusun
`StyleProfileSpec` yang dipakai renderer.

> Semua fitur berjalan **tanpa API key**. Provider berbayar (LLM, image gen, TTS, voice cloning, AI video)
> bersifat opsional dan hanya menaikkan kualitas — bukan syarat.

---

## Arsitektur singkat

```
Browser (Next.js App Router UI)
   │  REST /api/*
   ▼
Next.js server (route handlers) ──► SQLite (data/studio.db) ──► storage/ (file lokal)
   │                                        ▲
   │  POST /api/projects/[id]/render        │  antrean jobs (status = queued)
   ▼                                        │
Worker Node (npm run worker) ───────────────┘
   └─ runRenderPipeline(): TTS → musik → subtitle → frame canvas @napi-rs/canvas → ffmpeg h264/aac
```

Render berat **tidak** dijalankan di dalam request HTTP. UI memasukkan job ke antrean dan memantau
`GET /api/jobs/[id]`. Worker mengambil job `queued`, menandainya `running`, menjalankan pipeline, lalu
`done` / `error`.

## Prasyarat

- Node.js 20+ (diuji pada Node 22)
- FFmpeg & ffprobe — sudah tersedia lewat `@ffmpeg-installer/ffmpeg` dan `ffprobe-static`
  (tidak perlu install sistem; override dengan `FFMPEG_PATH` / `FFPROBE_PATH` bila perlu)
- Build tools untuk `better-sqlite3` dan `@napi-rs/canvas` (prebuilt binary tersedia untuk Linux/macOS/Windows)

## Menjalankan

```bash
npm install
cp .env.example .env          # opsional: isi API key bila ingin provider berbayar
npm run db:migrate            # membuat skema SQLite

npm run build && npm run start   # web app  → http://localhost:3000
npm run worker                   # worker render (terminal terpisah)
```

Mode pengembangan:

```bash
npm run dev      # Next.js dev server, port 3000
npm run worker   # tetap perlu dijalankan untuk memproses render
```

Tanpa worker, job akan tetap berstatus **antre** dan video tidak diproduksi.

### Deploy

- **Web** (Vercel/host Node): `npm run build`, `npm run start`. Butuh volume persisten untuk
  `data/studio.db` + `storage/`, atau set `STORAGE_DRIVER=s3`.
- **Worker** (Railway/Fly/Render/VM/Docker): `npm run worker` dengan `.env` yang sama dan volume
  storage yang sama. Worker butuh CPU cukup untuk canvas + ffmpeg.
- Karena SQLite dipakai bersama, jalankan web dan worker di mesin/volume yang sama, atau ganti ke
  Postgres (lihat `src/lib/db/`) bila ingin skala horizontal.

## Konfigurasi (`.env`)

| Variabel | Fungsi |
| --- | --- |
| `APP_PASSWORD` | Mengaktifkan gerbang sandi (cookie `studio_session` bertanda tangan HMAC, 30 hari). Kosong = terbuka. |
| `SESSION_SECRET` | Kunci HMAC untuk cookie sesi. **Wajib diganti di produksi.** |
| `STORAGE_DRIVER` | `local` (folder `storage/`) atau `s3` (+ `S3_*`). |
| `LLM_PROVIDER` | `local` (story engine deterministik) / `openai` / `anthropic` / `gemini` / `openai-compatible`. |
| `IMAGE_PROVIDER` | `local` (renderer prosedural 2D) / `openai` / `stability` / `replicate` / `fal`. |
| `TTS_PROVIDER` | `local` (espeak-ng Bahasa Indonesia, biaya 0) / `elevenlabs` / `openai` / `google` / `azure`. |
| `VOICE_CLONE_PROVIDER` | `none` / `elevenlabs` / `fishaudio` — mengaktifkan halaman **Suara Saya**. |
| `VIDEO_PROVIDER` | `none` / `replicate` / `fal` — klip AI opsional per scene. |
| `COST_*` | Estimasi biaya per operasi untuk ringkasan biaya di Pengaturan. |

Lihat `.env.example` untuk daftar lengkap.

## Alur pemakaian

1. **Gaya Referensi** (`/styles`) — unggah video referensi → analisis → simpan profil gaya.
2. **Buat Video** (`/new`) — pilih mode cerita (ide / topik / naskah / lanjut episode), durasi, gaya,
   suara, dan musik → storyboard dibuat otomatis.
3. **Editor** (`/projects/[id]`) — edit narasi, emosi, kamera, cuaca, kata penekanan per adegan;
   atur tipografi subtitle, mixing audio, dan profil gaya. Pratinjau frame memakai renderer yang sama
   dengan video final (`/api/projects/[id]/preview`).
4. **Render** — tombol *Render video* memasukkan job ke antrean; worker memproses dan progres tampil
   real-time (tahap, persentase, log).
5. **Dashboard** (`/`) — semua proyek, status, durasi, unduh MP4/SRT.

## Analisis video referensi

`src/lib/style/analyze.ts`

- **Cut detection**: perbedaan histogram + luma antar frame sampel → daftar scene, rata-rata durasi,
  potongan per menit.
- **Visual**: kecerahan, kontras, saturasi, kepadatan tepi, palet dominan, gaya garis.
- **Subtitle band**: memindai baris terang (luma > 210) dari 28% tinggi frame, menilai coverage
  per baris → `centerYRatio`, `coverageRatio`, lebar & tinggi teks → `fontSize`, `positionY`.
- **HUD**: deteksi baris/kolom terang di area atas (luma > 190) → `hud.enabled`, `positionY`.
- **Warna penekanan**: piksel kuning/lime (`g > 120 && g >= r*0.82 && b < g-70`) → hex dominan.
- **Audio**: loudnorm (LUFS/true peak/LRA), rasio hening, estimasi kata per menit.

Hasilnya dipetakan oleh `deriveSpec()` menjadi `StyleProfileSpec` lengkap (palet, tipografi, HUD, pacing,
loudness). Angka pada video referensi uji: 21 adegan, 3,43 s/adegan, subtitle di 57,8% tinggi,
coverage 0,247, warna aksen `#c8f838`, HUD terdeteksi.

## Struktur proyek

```
src/app/                 halaman (dashboard, new, projects/[id], styles, voices, settings, login) + API routes
src/components/          UI (shell, primitives, dashboard, wizard, editor, style studio, voices, settings, auth)
src/lib/anim/            renderer frame: karakter, pose, lingkungan, atmosfer, kamera, HUD, subtitle
src/lib/audio/           sintesis musik/SFX lokal, mixing & loudnorm
src/lib/render/          timeline, font, video (staging), pipeline
src/lib/story/           genre, story engine lokal, LLM adapter, label pendek
src/lib/providers/       adapter LLM, image, TTS, voice cloning
src/lib/style/           preset gaya + analyzer video referensi
src/lib/db/              SQLite + repo (project, job, asset, style, voice, cost)
worker.ts                worker antrean render
scripts/                 skrip uji: test-pipeline, test-analyze, test-story, test-tts, test-music, preview-scene
```

## API ringkas

| Endpoint | Keterangan |
| --- | --- |
| `GET/POST /api/projects` | daftar & buat proyek |
| `GET/PATCH/DELETE /api/projects/[id]` | detail, ubah judul/storyboard/pengaturan, hapus |
| `POST /api/projects/[id]/story` | buat / buat ulang storyboard |
| `POST /api/projects/[id]/render` | antrekan render (butuh `confirmed: true`; 428 = perlu konfirmasi, 409 = ada job aktif) |
| `GET /api/projects/[id]/preview` | PNG frame adegan (`?scene=0&t=1500&w=540`) |
| `GET /api/projects/[id]/cost` | estimasi & realisasi biaya |
| `GET /api/jobs/[id]` | status, tahap, progres, log, URL hasil |
| `POST /api/jobs/[id]/cancel` | batalkan job yang masih antre |
| `POST /api/upload/reference` | unggah + normalisasi + analisis video referensi |
| `GET/POST /api/styles`, `GET/PATCH/DELETE /api/styles/[id]` | profil gaya |
| `GET/POST /api/voices`, `PATCH/DELETE /api/voices/[id]` | profil suara kloning (dengan validasi sampel) |
| `GET /api/settings/integrations` | status provider, ffmpeg, antrean, biaya |
| `POST /api/auth/login` · `/logout` | sesi cookie (aktif bila `APP_PASSWORD` diset) |

## Pengujian cepat

```bash
npx tsx scripts/test-analyze.ts              # analisis video referensi (butuh file di google_drive/)
npx tsx scripts/test-pipeline.ts 30          # render 30 detik end-to-end tanpa UI
npx tsx scripts/test-tts.ts "teks"           # uji TTS lokal
npx tsx scripts/preview-scene.ts             # 6 variasi gaya → public/preview/
```

## Batasan yang diketahui

- Voice-over memakai eSpeak-NG lokal: jelas dan gratis, tetapi terdengar sintetis. Untuk kualitas
  narator natural, set `TTS_PROVIDER=elevenlabs` (atau `openai`).
- Karakter adalah stickman/vektor prosedural, bukan model 3D. Gaya mengikuti referensi (palet,
  tipografi, tempo), bukan gerakan persis dari video referensi.
- SQLite single-writer: satu worker per database. Untuk multi-worker gunakan Postgres.
- Subtitle memakai font Anton/Poppins yang dibundel di `public/fonts` (lisensi OFL).
