/**
 * Small DSP toolkit used to synthesise the music beds and sound effects.
 * Everything is generated at runtime, so all audio in the app is licence-free.
 */
export const SAMPLE_RATE = 44100;

export type Stereo = { left: Float32Array; right: Float32Array };

export function stereoBuffer(seconds: number, sampleRate = SAMPLE_RATE): Stereo {
  const n = Math.max(1, Math.ceil(seconds * sampleRate));
  return { left: new Float32Array(n), right: new Float32Array(n) };
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noiseSource(seed = 12345): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

export function adsr(
  i: number,
  total: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  sampleRate = SAMPLE_RATE
): number {
  const t = i / sampleRate;
  const a = attack;
  const d = attack + decay;
  const r = total / sampleRate - release;
  if (t < a) return a <= 0 ? 1 : t / a;
  if (t < d) {
    const p = (t - a) / Math.max(1e-6, decay);
    return 1 + (sustain - 1) * p;
  }
  if (t < r) return sustain;
  const p = (t - r) / Math.max(1e-6, release);
  return Math.max(0, sustain * (1 - p));
}

export function pickIndex(length: number, r: number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(Math.abs(r) * length)));
}

export function addTone(
  buf: Stereo,
  startSec: number,
  durSec: number,
  freq: number,
  gain: number,
  opts: {
    harmonics?: number[];
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
    detune?: number;
    pan?: number;
    vibrato?: number;
    vibratoRate?: number;
  } = {}
) {
  if (!Number.isFinite(freq) || !Number.isFinite(gain) || freq <= 0 || gain === 0) return;
  const sr = SAMPLE_RATE;
  const start = Math.floor(startSec * sr);
  const total = Math.floor(durSec * sr);
  const harmonics = opts.harmonics ?? [1, 0.5, 0.25, 0.12];
  const attack = opts.attack ?? 0.01;
  const decay = opts.decay ?? 0.15;
  const sustain = opts.sustain ?? 0.7;
  const release = opts.release ?? Math.min(0.8, durSec * 0.4);
  const detune = opts.detune ?? 0;
  const pan = opts.pan ?? 0;
  const lg = gain * (1 - Math.max(0, pan) * 0.5);
  const rg = gain * (1 + Math.min(0, pan) * 0.5);
  const vibrato = opts.vibrato ?? 0;
  const vibratoRate = opts.vibratoRate ?? 5;

  for (let i = 0; i < total; i++) {
    const idx = start + i;
    if (idx >= buf.left.length) break;
    const t = i / sr;
    const env = adsr(i, total, attack, decay, sustain, release);
    if (env <= 0) continue;
    let sample = 0;
    const vib = vibrato ? Math.sin(2 * Math.PI * vibratoRate * t) * vibrato : 0;
    for (let h = 0; h < harmonics.length; h++) {
      const f = freq * (h + 1) * (1 + detune * h);
      sample += Math.sin(2 * Math.PI * (f + f * vib) * t) * harmonics[h];
    }
    sample = Math.tanh(sample * 0.8);
    buf.left[idx] += sample * env * lg;
    buf.right[idx] += sample * env * rg;
  }
}

export function addNoise(
  buf: Stereo,
  startSec: number,
  durSec: number,
  gain: number,
  opts: {
    seed?: number;
    lowpass?: number;
    highpass?: number;
    attack?: number;
    release?: number;
    pan?: number;
    modulate?: number;
    modRate?: number;
  } = {}
) {
  const sr = SAMPLE_RATE;
  const start = Math.floor(startSec * sr);
  const total = Math.floor(durSec * sr);
  const rnd = noiseSource(opts.seed ?? 7);
  const lp = opts.lowpass ?? 8000;
  const hp = opts.highpass ?? 60;
  const a1 = Math.exp((-2 * Math.PI * lp) / sr);
  const a2 = Math.exp((-2 * Math.PI * hp) / sr);
  let lpState = 0;
  let hpState = 0;
  const attack = opts.attack ?? 0.02;
  const release = opts.release ?? Math.min(1.5, durSec * 0.5);
  const pan = opts.pan ?? 0;
  const mod = opts.modulate ?? 0;
  const modRate = opts.modRate ?? 3;
  for (let i = 0; i < total; i++) {
    const idx = start + i;
    if (idx >= buf.left.length) break;
    const white = rnd();
    lpState = white * (1 - a1) + lpState * a1;
    hpState = lpState * (1 - a2) + hpState * a2;
    const filtered = lpState - hpState;
    const t = i / sr;
    let env = adsr(i, total, attack, 0.05, 1, release);
    if (mod > 0) env *= 1 - mod * 0.5 * (1 + Math.sin(2 * Math.PI * modRate * t));
    const g = gain * env;
    buf.left[idx] += filtered * g * (1 - Math.max(0, pan) * 0.5);
    buf.right[idx] += filtered * g * (1 + Math.min(0, pan) * 0.5);
  }
}

export function addReverb(buf: Stereo, mix = 0.18, delaySec = 0.11, decay = 0.42) {
  const sr = SAMPLE_RATE;
  const delay = Math.floor(delaySec * sr);
  const out: Stereo = { left: new Float32Array(buf.left.length), right: new Float32Array(buf.right.length) };
  for (const ch of ["left", "right"] as const) {
    const src = buf[ch];
    const dst = out[ch];
    let lp = 0;
    for (let i = 0; i < src.length; i++) {
      const delayed = i >= delay ? dst[i - delay] : 0;
      lp = delayed * 0.6 + lp * 0.4;
      dst[i] = src[i] + lp * decay;
    }
  }
  for (const ch of ["left", "right"] as const) {
    const a = buf[ch];
    const b = out[ch];
    for (let i = 0; i < a.length; i++) a[i] = a[i] * (1 - mix) + b[i] * mix;
  }
}

export function normalize(buf: Stereo, peakTarget = 0.85) {
  let peak = 0;
  for (const ch of ["left", "right"] as const) {
    const arr = buf[ch];
    for (let i = 0; i < arr.length; i++) peak = Math.max(peak, Math.abs(arr[i]));
  }
  if (!Number.isFinite(peak) || peak === 0) return;
  const g = peakTarget / peak;
  for (const ch of ["left", "right"] as const) {
    const arr = buf[ch];
    for (let i = 0; i < arr.length; i++) arr[i] *= g;
  }
}

export function softLimit(buf: Stereo, ceiling = 0.95) {
  for (const ch of ["left", "right"] as const) {
    const arr = buf[ch];
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      arr[i] = x > ceiling || x < -ceiling ? Math.tanh(x) * ceiling : x;
    }
  }
}

export function toWav(buf: Stereo, sampleRate = SAMPLE_RATE): Buffer {
  const n = buf.left.length;
  const dataSize = n * 2 * 2;
  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, buf.left[i]));
    const r = Math.max(-1, Math.min(1, buf.right[i]));
    out.writeInt16LE(Math.round(l * 32767), o);
    out.writeInt16LE(Math.round(r * 32767), o + 2);
    o += 4;
  }
  return out;
}

export function wavToStereo(buffer: Buffer): { buf: Stereo; sampleRate: number } {
  const riff = buffer.toString("ascii", 0, 4);
  if (riff !== "RIFF") throw new Error("bukan WAV");
  const fmtIndex = buffer.indexOf("fmt ");
  const channels = buffer.readUInt16LE(fmtIndex + 10);
  const sampleRate = buffer.readUInt32LE(fmtIndex + 12);
  const bits = buffer.readUInt16LE(fmtIndex + 22);
  const dataIndex = buffer.indexOf("data", fmtIndex);
  const dataLen = buffer.readUInt32LE(dataIndex + 4);
  const start = dataIndex + 8;
  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataLen / (bytesPerSample * channels));
  const buf = stereoBuffer(frames / sampleRate);
  for (let i = 0; i < frames; i++) {
    const base = start + i * bytesPerSample * channels;
    const l = buffer.readInt16LE(base) / 32768;
    const r = channels > 1 ? buffer.readInt16LE(base + bytesPerSample) / 32768 : l;
    buf.left[i] = l;
    buf.right[i] = r;
  }
  return { buf, sampleRate };
}

export function resample(buf: Stereo, fromRate: number, toRate = SAMPLE_RATE): Stereo {
  if (fromRate === toRate) return buf;
  const ratio = toRate / fromRate;
  const n = Math.floor(buf.left.length * ratio);
  const out = stereoBuffer(n / toRate);
  for (let i = 0; i < n; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(buf.left.length - 1, i0 + 1);
    const frac = src - i0;
    out.left[i] = buf.left[i0] * (1 - frac) + buf.left[i1] * frac;
    out.right[i] = buf.right[i0] * (1 - frac) + buf.right[i1] * frac;
  }
  return out;
}
