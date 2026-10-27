/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@napi-rs/canvas",
    "@echogarden/espeak-ng-emscripten",
    "@ffmpeg-installer/ffmpeg",
    "ffprobe-static",
  ],
  experimental: {
    serverActions: { bodySizeLimit: "512mb" },
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
