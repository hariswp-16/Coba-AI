import { SAMPLE_RATE, Stereo, normalize, softLimit, stereoBuffer, toWav, wavToStereo, resample } from "./synth";

export interface VoiceSegment {
  /** absolute start on the timeline */
  startMs: number;
  wav: Buffer;
  gain?: number;
}

export interface SfxEvent {
  name: string;
  atMs: number;
  gain: number;
  wav?: Buffer;
}

export interface MixOptions {
  durationMs: number;
  voiceVol: number;
  musicVol: number;
  ducking: number;
  sfxVol: number;
  sfxEnabled: boolean;
  targetLufs?: number;
}

export interface MixResult {
  wav: Buffer;
  peakDb: number;
  voiceActiveRatio: number;
}

function place(target: Stereo, source: Stereo, startMs: number, gain: number) {
  const start = Math.max(0, Math.floor((startMs / 1000) * SAMPLE_RATE));
  const len = Math.min(source.left.length, target.left.length - start);
  for (let i = 0; i < len; i++) {
    target.left[start + i] += source.left[i] * gain;
    target.right[start + i] += source.right[i] * gain;
  }
}

/** RMS envelope of the voice track, used for music ducking. */
export function voiceEnvelope(voice: Stereo, hopMs = 30): Float32Array {
  const hop = Math.floor((hopMs / 1000) * SAMPLE_RATE);
  const frames = Math.ceil(voice.left.length / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hop;
    const end = Math.min(voice.left.length, start + hop);
    for (let i = start; i < end; i++) {
      const v = (voice.left[i] + voice.right[i]) * 0.5;
      sum += v * v;
    }
    env[f] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return env;
}

/** Smooths the envelope with fast attack (duck quickly) and slow release. */
function smoothEnvelope(env: Float32Array, hopMs: number): Float32Array {
  const out = new Float32Array(env.length);
  const attack = 1 - Math.exp(-hopMs / 40);
  const release = 1 - Math.exp(-hopMs / 420);
  let current = 0;
  for (let i = 0; i < env.length; i++) {
    const target = env[i];
    const coeff = target > current ? attack : release;
    current += (target - current) * coeff;
    out[i] = current;
  }
  return out;
}

export function mixAudio(
  voiceSegments: VoiceSegment[],
  music: Stereo | null,
  sfx: SfxEvent[],
  opts: MixOptions
): MixResult {
  const frames = Math.ceil((opts.durationMs / 1000) * SAMPLE_RATE);
  const voice = stereoBuffer(frames / SAMPLE_RATE);
  // 1. lay out the narration
  for (const seg of voiceSegments) {
    const parsed = wavToStereo(seg.wav);
    const res = parsed.sampleRate === SAMPLE_RATE ? parsed.buf : resample(parsed.buf, parsed.sampleRate, SAMPLE_RATE);
    place(voice, res, seg.startMs, (seg.gain ?? 1) * opts.voiceVol);
  }

  // 2. duck the music under narration
  const env = smoothEnvelope(voiceEnvelope(voice), 30);
  const hop = Math.floor(0.03 * SAMPLE_RATE);
  const musicTrack = stereoBuffer(frames / SAMPLE_RATE);
  if (music) {
    for (let i = 0; i < frames; i++) {
      const frame = Math.min(env.length - 1, Math.floor(i / hop));
      const v = env[frame];
      const normalized = Math.min(1, v * 7.5);
      const duckGain = 1 - opts.ducking * normalized;
      musicTrack.left[i] = music.left[i % music.left.length] * opts.musicVol * duckGain;
      musicTrack.right[i] = music.right[i % music.right.length] * opts.musicVol * duckGain;
    }
  }

  // 3. sound effects
  const sfxTrack = stereoBuffer(frames / SAMPLE_RATE);
  if (opts.sfxEnabled) {
    for (const ev of sfx) {
      if (!ev.wav) continue;
      const parsed = wavToStereo(ev.wav);
      const res = parsed.sampleRate === SAMPLE_RATE ? parsed.buf : resample(parsed.buf, parsed.sampleRate, SAMPLE_RATE);
      place(sfxTrack, res, ev.atMs, ev.gain * opts.sfxVol);
    }
  }

  // 4. sum, limit, normalise
  const out = stereoBuffer(frames / SAMPLE_RATE);
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    out.left[i] = voice.left[i] + musicTrack.left[i] + sfxTrack.left[i];
    out.right[i] = voice.right[i] + musicTrack.right[i] + sfxTrack.right[i];
    peak = Math.max(peak, Math.abs(out.left[i]), Math.abs(out.right[i]));
  }
  const headroom = peak > 0.95 ? 0.95 / peak : 1;
  for (let i = 0; i < frames; i++) {
    out.left[i] *= headroom;
    out.right[i] *= headroom;
  }
  softLimit(out, 0.97);
  normalize(out, 0.89); // ≈ -1 dBFS peak; ffmpeg loudnorm does the final LUFS pass

  let active = 0;
  for (const e of env) if (e > 0.01) active++;
  return {
    wav: toWav(out),
    peakDb: 20 * Math.log10(0.89),
    voiceActiveRatio: active / Math.max(1, env.length),
  };
}

/** Concatenate WAV buffers with silence gaps into a single narration WAV. */
export function buildNarrationTrack(segments: VoiceSegment[], durationMs: number): Buffer {
  const frames = Math.ceil((durationMs / 1000) * SAMPLE_RATE);
  const track = stereoBuffer(frames / SAMPLE_RATE);
  for (const seg of segments) {
    const parsed = wavToStereo(seg.wav);
    const res = parsed.sampleRate === SAMPLE_RATE ? parsed.buf : resample(parsed.buf, parsed.sampleRate, SAMPLE_RATE);
    place(track, res, seg.startMs, seg.gain ?? 1);
  }
  return toWav(track);
}
