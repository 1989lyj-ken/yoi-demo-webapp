import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// 2026-10-14 SEO (product owner): the public site gets a search description (wording from the semi-final deck);
// the internal demo (six members only) asks search engines not to index it.
const PUBLIC_DESCRIPTION = "不搭車，也打開 yoxi。yoi 遊移遊戲讓每天走路變成遊戲：每 2,000 步領 1 點和泰 Points，1 點折 1 元 yoxi 車資；找家人朋友 2–5 人組隊挑戰，還有 AI 小幫手 Yoika 陪您出行。公開體驗版免登入，資料只存在您的瀏覽器。";

// FSD-PA: `vite build --mode public` builds the public test version: Firebase is replaced by the visitor's
// local world (src/local), output goes to dist-public, and nothing ever talks to a Firebase project.
export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), {
    // The public test build names itself in the browser tab (and in link previews) as 公開測試版.
    name: "public-title",
    transformIndexHtml: (html: string) => (mode === "public" ? html.replace("<title>yoi 遊移遊戲｜展示版</title>", "<title>yoi 遊移遊戲｜公開測試版</title>") : html),
  }, {
    name: "page-meta",
    transformIndexHtml: () => [mode === "public"
      ? { tag: "meta", attrs: { name: "description", content: PUBLIC_DESCRIPTION }, injectTo: "head" as const }
      : { tag: "meta", attrs: { name: "robots", content: "noindex" }, injectTo: "head" as const }],
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
