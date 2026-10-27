import type { CharacterSpec, StyleProfileSpec } from "../types";

export const DEFAULT_CHARACTERS: CharacterSpec[] = [
  {
    id: "utama",
    name: "Raka",
    role: "utama",
    gender: "pria",
    age: "dewasa",
    skin: "#e8d3bb",
    hair: "#15110f",
    hairStyle: "pendek",
    shirt: "#5f6d3e",
    pants: "#2f3238",
    heightScale: 1,
    face: "khawatir",
    description:
      "Pemuda kurus dengan rambut hitam pendek, kaus hijau army lengan pendek, celana abu gelap. Wajah bulat sederhana, ekspresi selalu gelisah.",
  },
  {
    id: "ibu",
    name: "Ibu",
    role: "pendukung",
    gender: "wanita",
    age: "dewasa",
    skin: "#e6cfb6",
    hair: "#191410",
    hairStyle: "hijab",
    hijabColor: "#6a5744",
    shirt: "#4a5c4c",
    pants: "#3a3d42",
    heightScale: 0.94,
    face: "khawatir",
    description: "Perempuan mengenakan hijab cokelat tua dan gamis hijau gelap, ekspresi lembut namun cemas.",
  },
  {
    id: "adik",
    name: "Adik",
    role: "pendukung",
    gender: "anak",
    age: "anak",
    skin: "#e9d6c0",
    hair: "#191410",
    hairStyle: "pendek",
    shirt: "#b4553a",
    pants: "#4a5a80",
    heightScale: 1,
    face: "takut",
    description: "Anak laki-laki kecil dengan kaus merah bata dan celana biru, rambut hitam pendek.",
  },
];

export const STICKMAN_CINEMATIC: StyleProfileSpec = {
  version: 1,
  aspect: "9:16",
  width: 720,
  height: 1280,
  fps: 30,
  palette: {
    background: "#141013",
    wall: "#6b5a45",
    floor: "#4a4038",
    accent: "#c8752f",
    lampWarm: "#ffb46a",
    shadow: "#120d0a",
    text: "#f4f1e8",
    highlight: "#d4f24a",
  },
  characterStyle: {
    lineWeight: 2,
    jointStyle: "ball",
    headShape: "oval",
    outline: "#241a12",
    description:
      "Karakter kartun 2D sederhana bergaya stickman: wajah beige, rambut hitam, badan diisi warna pakaian, tangan dan kaki putih bersambung dengan sendi bulat.",
  },
  characters: DEFAULT_CHARACTERS,
  lighting: {
    key: "lampu kuning hangat dari kanan atas, bayangan dalam",
    mood: "dramatis, gelap, sinematik",
    vignette: 0.75,
    grain: 0.5,
    colorTemp: "hangat",
    contrast: 0.7,
  },
  background: { style: "latar rumah/kota Indonesia sederhana, detail sedang", detailLevel: 0.7, depthLayers: 3 },
  subtitle: {
    enabled: true,
    fontFamily: "Anton",
    fontWeight: 400,
    fontSize: 52,
    uppercase: true,
    fill: "#f7f4ea",
    emphasisColor: "#d4f24a",
    strokeColor: "#000000",
    strokeWidth: 0.6,
    shadow: 16,
    positionY: 0.7,
    maxCharsPerLine: 16,
    wordsPerChunk: 4,
    letterSpacing: 0.4,
    lineHeight: 1.12,
    background: false,
    backgroundColor: "#000000",
    marginX: 44,
    mode: "phrase",
  },
  hud: {
    enabled: true,
    labelText: "MALAM PERTAMA",
    labelColor: "#ff8f6b",
    clockEnabled: true,
    clockColor: "#f6f1e4",
    episodeText: "DAJJAL  EPISODE 2",
    episodeColor: "#e8e2d4",
    fontFamily: "Poppins",
    positionY: 0.1,
    align: "left",
    marginX: 64,
    dotEnabled: true,
  },
  pacing: {
    avgSceneSeconds: 5.5,
    wordsPerMinute: 135,
    pauseBetweenScenesMs: 220,
    hookSeconds: 3.5,
    outroSeconds: 4,
  },
  narration: {
    tone: "dramatis, gelisah, penuh tanda tanya",
    pov: "orang pertama",
    language: "id",
    styleNotes:
      "Kalimat pendek. Banyak jeda. Cliffhanger di akhir. Nada bicara pelan namun menegangkan.",
  },
  audio: {
    musicMood: "sedih",
    musicVolume: 0.22,
    voiceVolume: 1,
    ducking: 0.65,
    sfx: ["hujan", "petir", "langkah"],
    loudnessTarget: -14,
  },
  transitions: {
    type: "fade",
    durationMs: 380,
    pattern: "cut cepat antar adegan, fade halus saat pergantian suasana",
  },
  opening: {
    style: "langsung masuk ke suasana, tanpa logo",
    showTitleCard: false,
    hookFirst: true,
    description: "Buka dengan suara hujan dan jam dinding, langsung ke dialog/adegan ketegangan.",
  },
  ending: {
    style: "pertanyaan pilihan untuk penonton",
    ctaText: "KOMENTAR DI BAWAH",
    choicePills: true,
    description: "Akhir dengan dua pilihan sulit dan ajakan berkomentar.",
  },
  graphics: {
    episodeLabel: true,
    clock: true,
    choicePills: true,
    notes: "Label pojok kiri atas berisi suasana, jam digital besar, dan nomor episode.",
  },
};

export const PRESETS: { id: string; name: string; description: string; spec: StyleProfileSpec }[] = [
  {
    id: "stickman-dramatis",
    name: "Stickman Sinematik — Dramatis Malam",
    description:
      "Gaya video referensi: karakter stickman 2D, rumah malam berlampu kuning, subtitle Anton besar dengan kata kunci hijau limau, HUD jam digital.",
    spec: STICKMAN_CINEMATIC,
  },
  {
    id: "stickman-siang",
    name: "Stickman Sinematik — Siang",
    description: "Varian lebih terang untuk cerita siang hari, tetap dengan subtitle besar dan HUD episode.",
    spec: {
      ...STICKMAN_CINEMATIC,
      palette: {
        ...STICKMAN_CINEMATIC.palette,
        wall: "#9d8a6f",
        floor: "#7d6d5c",
        lampWarm: "#fff0c4",
      },
      lighting: { ...STICKMAN_CINEMATIC.lighting, mood: "hangat, tenang, cerah", vignette: 0.45, colorTemp: "hangat" },
      hud: { ...STICKMAN_CINEMATIC.hud, labelText: "SIANG HARI", clockColor: "#fdfaf0" },
    },
  },
  {
    id: "stickman-hujan",
    name: "Stickman Sinematik — Hujan & Ketegangan",
    description: "Varian gelap dan basah: hujan deras, kabut, subtitle kuning, tempo lebih lambat.",
    spec: {
      ...STICKMAN_CINEMATIC,
      palette: { ...STICKMAN_CINEMATIC.palette, highlight: "#ffd84a", lampWarm: "#ffa94d" },
      lighting: { ...STICKMAN_CINEMATIC.lighting, vignette: 0.85, grain: 0.65 },
      subtitle: { ...STICKMAN_CINEMATIC.subtitle, emphasisColor: "#ffd84a" },
      pacing: { ...STICKMAN_CINEMATIC.pacing, avgSceneSeconds: 6.2, wordsPerMinute: 125 },
      audio: { ...STICKMAN_CINEMATIC.audio, sfx: ["hujan", "petir", "angin"] },
    },
  },
];

export function cloneSpec(spec: StyleProfileSpec): StyleProfileSpec {
  return JSON.parse(JSON.stringify(spec)) as StyleProfileSpec;
}

export function getPreset(id: string): StyleProfileSpec {
  return cloneSpec(PRESETS.find((p) => p.id === id)?.spec ?? STICKMAN_CINEMATIC);
}
