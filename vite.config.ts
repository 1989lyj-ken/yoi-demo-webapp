import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// FSD-PA: `vite build --mode public` builds the public test version: Firebase is replaced by the visitor's
// local world (src/local), output goes to dist-public, and nothing ever talks to a Firebase project.
export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), {
    // The public test build names itself in the browser tab (and in link previews) as 公開測試版.
    name: "public-title",
    transformIndexHtml: (html: string) => (mode === "public" ? html.replace("<title>yoi 遊移遊戲｜展示版</title>", "<title>yoi 遊移遊戲｜公開測試版</title>") : html),
  }],
  resolve: mode === "public" ? {
    alias: [
      { find: /^firebase\/app$/, replacement: fileURLToPath(new URL("./src/local/app.ts", import.meta.url)) },
      { find: /^firebase\/auth$/, replacement: fileURLToPath(new URL("./src/local/auth.ts", import.meta.url)) },
      { find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL("./src/local/firestore.ts", import.meta.url)) },
    ],
  } : {},
  build: mode === "public" ? { outDir: "dist-public" } : {},
}));
