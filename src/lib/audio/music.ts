import {
  SAMPLE_RATE,
  Stereo,
  addNoise,
  addReverb,
  addTone,
  midiToFreq,
  noiseSource,
  normalize,
  pickIndex,
  softLimit,
  stereoBuffer,
  toWav,
} from "./synth";

export type MusicMood =
  | "sedih"
  | "tegang"
  | "misterius"
  | "hangat"
  | "semangat"
  | "haru"
  | "khidmat"
  | "takut"
  | "dramatis"
  | "cinta"
  | "netral";

interface MoodRecipe {
  bpm: number;
  /** scale degrees in semitones relative to the root, one entry per chord */
  progression: number[][];
  rootMidi: number;
  padGain: number;
  bassGain: number;
  pluckGain: number;
  noiseGain: number;
  noiseLowpass: number;
  reverb: number;
  scale: number[];
  pluckOctave: number;
}

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const PENTA_MINOR = [0, 3, 5, 7, 10];

const RECIPES: Record<MusicMood, MoodRecipe> = {
  sedih: {
    bpm: 58,
    rootMidi: 45, // A2
    progression: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -1, 2]],
    padGain: 0.11,
    bassGain: 0.14,
    pluckGain: 0.075,
    noiseGain: 0.02,
    noiseLowpass: 1600,
    reverb: 0.3,
    scale: PENTA_MINOR,
    pluckOctave: 24,
  },
  tegang: {
    bpm: 72,
    rootMidi: 40,
    progression: [[0, 1, 7], [-1, 6, 11], [0, 1, 7], [-2, 5, 10]],
    padGain: 0.1,
    bassGain: 0.17,
    pluckGain: 0.05,
    noiseGain: 0.035,
    noiseLowpass: 2400,
    reverb: 0.26,
    scale: [0, 1, 5, 6, 7],
    pluckOctave: 36,
  },
  misterius: {
    bpm: 64,
    rootMidi: 38,
    progression: [[0, 3, 7], [1, 5, 8], [-2, 2, 6], [0, 3, 7]],
    padGain: 0.12,
    bassGain: 0.12,
    pluckGain: 0.06,
    noiseGain: 0.025,
    noiseLowpass: 1200,
    reverb: 0.38,
    scale: [0, 2, 3, 7, 8],
    pluckOctave: 36,
  },
  hangat: {
    bpm: 76,
    rootMidi: 48,
    progression: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [2, 5, 9]],
    padGain: 0.1,
    bassGain: 0.11,
    pluckGain: 0.08,
    noiseGain: 0.012,
    noiseLowpass: 3000,
    reverb: 0.22,
    scale: MAJOR_SCALE,
    pluckOctave: 24,
  },
  semangat: {
    bpm: 96,
    rootMidi: 48,
    progression: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [0, 4, 7]],
    padGain: 0.09,
    bassGain: 0.14,
    pluckGain: 0.085,
    noiseGain: 0.01,
    noiseLowpass: 5000,
    reverb: 0.16,
    scale: MAJOR_SCALE,
    pluckOctave: 24,
  },
  haru: {
    bpm: 62,
    rootMidi: 46,
    progression: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]],
    padGain: 0.115,
    bassGain: 0.1,
    pluckGain: 0.085,
    noiseGain: 0.015,
    noiseLowpass: 2200,
    reverb: 0.34,
    scale: MINOR_SCALE,
    pluckOctave: 24,
  },
  khidmat: {
    bpm: 54,
    rootMidi: 43,
    progression: [[0, 3, 7], [0, 4, 7], [-2, 2, 5], [0, 3, 7]],
    padGain: 0.12,
    bassGain: 0.1,
    pluckGain: 0.05,
    noiseGain: 0.01,
    noiseLowpass: 2000,
    reverb: 0.4,
    scale: [0, 2, 3, 7, 8],
    pluckOctave: 24,
  },
  takut: {
    bpm: 66,
    rootMidi: 36,
    progression: [[0, 1, 6], [0, 2, 7], [-1, 1, 6], [0, 1, 6]],
    padGain: 0.12,
    bassGain: 0.15,
    pluckGain: 0.04,
    noiseGain: 0.045,
    noiseLowpass: 1800,
    reverb: 0.34,
    scale: [0, 1, 3, 6],
    pluckOctave: 36,
  },
  dramatis: {
    bpm: 70,
    rootMidi: 41,
    progression: [[0, 3, 7], [-4, 0, 3], [-2, 1, 5], [0, 3, 7]],
    padGain: 0.12,
    bassGain: 0.15,
    pluckGain: 0.07,
    noiseGain: 0.02,
    noiseLowpass: 2600,
    reverb: 0.3,
    scale: MINOR_SCALE,
    pluckOctave: 24,
  },
  cinta: {
    bpm: 68,
    rootMidi: 47,
    progression: [[0, 4, 7], [2, 5, 9], [-3, 0, 4], [-5, -1, 2]],
    padGain: 0.11,
    bassGain: 0.1,
    pluckGain: 0.09,
    noiseGain: 0.01,
    noiseLowpass: 2600,
    reverb: 0.3,
    scale: MAJOR_SCALE,
    pluckOctave: 24,
  },
  netral: {
    bpm: 70,
    rootMidi: 45,
    progression: [[0, 3, 7], [-3, 0, 4], [-5, -1, 2], [0, 3, 7]],
    padGain: 0.1,
    bassGain: 0.11,
    pluckGain: 0.06,
    noiseGain: 0.015,
    noiseLowpass: 2200,
    reverb: 0.24,
    scale: MINOR_SCALE,
    pluckOctave: 24,
  },
};

export function moodFromText(text: string): MusicMood {
  const t = (text || "").toLowerCase();
  if (/sedih|duka|kehilangan|menangis/.test(t)) return "sedih";
  if (/takut|seram|hantu|horor/.test(t)) return "takut";
  if (/misteri|gelap|rahasia|aneh|dajjal/.test(t)) return "misterius";
  if (/tegang|kejar|bahaya|konflik/.test(t)) return "tegang";
  if (/haru|rindu|keluarga|ibu|ayah/.test(t)) return "haru";
  if (/khidmat|doa|masjid|religi|iman/.test(t)) return "khidmat";
  if (/semangat|bangkit|berjuang|motivasi/.test(t)) return "semangat";
  if (/cinta|sayang|jodoh/.test(t)) return "cinta";
  if (/hangat|tenang|cerah|bahagia/.test(t)) return "hangat";
  if (/dramatis|klimaks/.test(t)) return "dramatis";
  return "netral";
}

/**
 * Synthesises a loopable cinematic bed for the given mood.
 * Deterministic for a given seed, so results can be cached.
 */
export function renderMusicBed(mood: MusicMood, durationSeconds: number, seed = 1): Stereo {
  const recipe = RECIPES[mood] ?? RECIPES.netral;
  const dur = Math.max(4, durationSeconds);
  const buf = stereoBuffer(dur + 2);
  const beat = 60 / recipe.bpm;
  const bar = beat * 4;
  const rnd = noiseSource(seed * 7919 + 13);
  const totalBars = Math.ceil(dur / bar) + 1;

  // ---- pads + bass per bar
  for (let b = 0; b < totalBars; b++) {
    const chord = recipe.progression[b % recipe.progression.length];
    const start = b * bar;
    if (start > dur) break;
    chord.forEach((semi, i) => {
      const midi = recipe.rootMidi + 12 + semi;
      addTone(buf, start, bar * 1.05, midiToFreq(midi), recipe.padGain / (i + 1.2), {
        harmonics: [1, 0.32, 0.12, 0.05],
        attack: 0.9,
        decay: 0.6,
        sustain: 0.78,
        release: 1.1,
        detune: 0.0025,
        pan: (i - 1) * 0.28,
        vibrato: 0.0018,
        vibratoRate: 4.2,
      });
    });
    // bass
    addTone(buf, start, bar * 0.92, midiToFreq(recipe.rootMidi - 12 + chord[0]), recipe.bassGain, {
      harmonics: [1, 0.28, 0.08],
      attack: 0.05,
      decay: 0.5,
      sustain: 0.6,
      release: 0.7,
    });
  }

  // ---- sparse melodic plucks
  const step = beat / 2;
  const steps = Math.floor(dur / step);
  for (let s = 0; s < steps; s++) {
    const density = mood === "semangat" ? 0.5 : mood === "tegang" || mood === "takut" ? 0.22 : 0.34;
    if (rnd() > density) continue;
    const deg = recipe.scale[pickIndex(recipe.scale.length, rnd())];
    const octave = rnd() > 0.72 ? 12 : 0;
    const midi = recipe.rootMidi + recipe.pluckOctave + deg + octave;
    addTone(buf, s * step, step * (1.4 + rnd()), midiToFreq(midi), recipe.pluckGain * (0.6 + rnd() * 0.6), {
      harmonics: [1, 0.22, 0.09],
      attack: 0.004,
      decay: 0.35,
      sustain: 0.12,
      release: 0.5,
      pan: rnd() * 0.7 - 0.35,
    });
  }

  // ---- air / room tone
  addNoise(buf, 0, dur, recipe.noiseGain, {
    seed: seed + 5,
    lowpass: recipe.noiseLowpass,
    highpass: 120,
    attack: 1.2,
    release: 2,
    modulate: 0.4,
    modRate: 0.13,
  });

  addReverb(buf, recipe.reverb, 0.13, 0.38);
  // gentle fades so the loop sits under narration
  fade(buf, 1.6, 2.2);
  normalize(buf, 0.6);
  softLimit(buf, 0.9);
  return buf;
}

function fade(buf: Stereo, inSec: number, outSec: number) {
  const sr = SAMPLE_RATE;
  const n = buf.left.length;
  const fi = Math.floor(inSec * sr);
  const fo = Math.floor(outSec * sr);
  for (let i = 0; i < fi && i < n; i++) {
    const g = i / fi;
    buf.left[i] *= g;
    buf.right[i] *= g;
  }
  for (let i = 0; i < fo && i < n; i++) {
    const g = i / fo;
    buf.left[n - 1 - i] *= g;
    buf.right[n - 1 - i] *= g;
  }
}

/* ------------------------------------------------------------------ */
/* Sound effects                                                       */
/* ------------------------------------------------------------------ */

export type SfxName = "hujan" | "petir" | "angin" | "jantung" | "langkah" | "pintu" | "whoosh" | "dentang" | "napas";

export const SFX_NAMES: SfxName[] = ["hujan", "petir", "angin", "jantung", "langkah", "pintu", "whoosh", "dentang", "napas"];

export function renderSfx(name: SfxName, seconds = 3, seed = 1): Stereo {
  const dur = Math.max(0.5, seconds);
  const buf = stereoBuffer(dur);
  const rnd = noiseSource(seed * 3571 + 7);
  switch (name) {
    case "hujan": {
      addNoise(buf, 0, dur, 0.5, { seed: seed + 1, lowpass: 6500, highpass: 500, attack: 0.3, release: 0.6, modulate: 0.25, modRate: 1.7 });
      // individual drops
      const drops = Math.floor(dur * 26);
      for (let i = 0; i < drops; i++) {
        const t = rnd() * dur;
        addNoise(buf, t, 0.03 + rnd() * 0.05, 0.12 + rnd() * 0.1, {
          seed: Math.floor(rnd() * 1e6),
          lowpass: 9000,
          highpass: 2200,
          attack: 0.001,
          release: 0.03,
          pan: rnd() * 1.4 - 0.7,
        });
      }
      break;
    }
    case "petir": {
      addNoise(buf, 0, Math.min(dur, 2.6), 0.75, { seed: seed + 3, lowpass: 800, highpass: 30, attack: 0.01, release: 2.2 });
      addNoise(buf, 0.02, 0.35, 0.5, { seed: seed + 9, lowpass: 9000, highpass: 900, attack: 0.002, release: 0.3 });
      addTone(buf, 0.1, 1.6, 42, 0.35, { harmonics: [1, 0.5], attack: 0.05, decay: 0.6, sustain: 0.3, release: 1 });
      break;
    }
    case "angin": {
      addNoise(buf, 0, dur, 0.42, { seed: seed + 11, lowpass: 900, highpass: 90, attack: 1.2, release: 1.4, modulate: 0.6, modRate: 0.22 });
      break;
    }
    case "jantung": {
      const beats = Math.max(2, Math.floor(dur / 0.85));
      for (let i = 0; i < beats; i++) {
        const t = i * 0.85;
        addTone(buf, t, 0.22, 52, 0.5, { harmonics: [1, 0.4], attack: 0.005, decay: 0.08, sustain: 0.15, release: 0.16 });
        addTone(buf, t + 0.26, 0.18, 46, 0.32, { harmonics: [1, 0.3], attack: 0.005, decay: 0.06, sustain: 0.1, release: 0.12 });
      }
      break;
    }
    case "langkah": {
      const steps = Math.max(2, Math.floor(dur / 0.62));
      for (let i = 0; i < steps; i++) {
        const t = i * 0.62 + (rnd() - 0.5) * 0.05;
        addNoise(buf, t, 0.12, 0.35, { seed: seed + i, lowpass: 1400, highpass: 120, attack: 0.002, release: 0.1, pan: rnd() * 0.6 - 0.3 });
        addTone(buf, t, 0.09, 90 + rnd() * 30, 0.18, { harmonics: [1, 0.2], attack: 0.002, decay: 0.04, sustain: 0.05, release: 0.05 });
      }
      break;
    }
    case "pintu": {
      addTone(buf, 0, Math.min(dur, 1.6), 190, 0.16, { harmonics: [1, 0.5, 0.3], attack: 0.2, decay: 0.4, sustain: 0.5, release: 0.8, vibrato: 0.02, vibratoRate: 7 });
      addNoise(buf, 0.9, Math.min(0.5, dur), 0.3, { seed: seed + 4, lowpass: 1200, highpass: 80, attack: 0.005, release: 0.4 });
      break;
    }
    case "whoosh": {
      for (let i = 0; i < 6; i++) {
        addNoise(buf, i * 0.06, 0.35, 0.16, { seed: seed + i, lowpass: 900 + i * 1400, highpass: 200 + i * 200, attack: 0.05, release: 0.3, pan: -0.6 + i * 0.24 });
      }
      break;
    }
    case "dentang": {
      addTone(buf, 0, Math.min(dur, 3.2), 392, 0.28, { harmonics: [1, 0.5, 0.28, 0.15, 0.08], attack: 0.002, decay: 1.4, sustain: 0.1, release: 1.6 });
      addTone(buf, 0.005, Math.min(dur, 3.2), 393.5, 0.16, { harmonics: [1, 0.4, 0.2], attack: 0.002, decay: 1.2, sustain: 0.08, release: 1.4 });
      break;
    }
    case "napas": {
      addNoise(buf, 0, dur, 0.3, { seed: seed + 21, lowpass: 2600, highpass: 320, attack: 0.25, release: 0.5, modulate: 0.8, modRate: 0.7 });
      break;
    }
  }
  normalize(buf, 0.7);
  return buf;
}

export function renderMusicWav(mood: string, seconds: number, seed = 1): { wav: Buffer; mood: MusicMood } {
  const m = (mood in RECIPES ? mood : moodFromText(mood)) as MusicMood;
  return { wav: toWav(renderMusicBed(m, seconds, seed)), mood: m };
}
