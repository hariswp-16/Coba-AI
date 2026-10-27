declare module "@echogarden/espeak-ng-emscripten" {
  const factory: () => Promise<{
    eSpeakNGWorker: new () => {
      set_voice(v: string): void;
      set_rate(r: number): void;
      set_pitch(p: number): void;
      set_range(r: number): void;
      get_samplerate(): number;
      list_voices(): { name: string; identifier: string; languages: { name: string }[] }[];
      synthesize(text: string, cb: (audio: Int16Array, events: unknown[]) => boolean): void;
    };
  }>;
  export default factory;
}
