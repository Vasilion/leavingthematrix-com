import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vitest/config";

function binaryFonts(): Plugin {
  return {
    name: "binary-fonts",
    enforce: "pre",
    load(id: string): string | null {
      if (!id.endsWith(".ttf")) {
        return null;
      }
      const base64: string = readFileSync(id).toString("base64");
      return `export default new Uint8Array(Buffer.from("${base64}", "base64"));`;
    },
  };
}

export default defineConfig({
  plugins: [binaryFonts()],
  test: { include: ["src/**/*.test.ts"] },
});
