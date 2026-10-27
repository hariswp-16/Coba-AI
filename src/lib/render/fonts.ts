import path from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";

let loaded = false;

export function ensureFonts() {
  if (loaded) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  const files: [string, string][] = [
    ["Anton-Regular.ttf", "Anton"],
    ["BebasNeue-Regular.ttf", "Bebas Neue"],
    ["Poppins-Regular.ttf", "Poppins"],
    ["Poppins-SemiBold.ttf", "Poppins"],
    ["Poppins-Bold.ttf", "Poppins"],
    ["Poppins-Medium.ttf", "Poppins"],
  ];
  for (const [file, family] of files) {
    try {
      GlobalFonts.registerFromPath(path.join(dir, file), family);
    } catch {
      /* font is optional */
    }
  }
  loaded = true;
}
