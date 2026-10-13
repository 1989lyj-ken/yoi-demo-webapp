/**
 * FSD-PA-10: Yoika's line to Gemini (Firebase AI Logic, Gemini Developer API) with App Check. The public build
 * aliases "firebase/app" to the local stand-in, so Yoika starts its own app from the real "@firebase/app".
 * Loaded on demand, only when a visitor opens the chat.
 */
import { initializeApp } from "@firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, Schema, type FunctionDeclaration, type GenerateContentResult } from "firebase/ai";
import { YOIKA_LIMITS } from "./yoika-core.ts";
import type { YoikaConfig } from "./yoika-config.ts";

export type YoikaTools = Record<string, (args: Record<string, unknown>) => Record<string, unknown>>;

// 2026-10-14: the visitor's numbers travel with each question (withSnapshot), so most answers take one model call;
// only the walk-or-ride estimate is still a tool, because it needs a distance from the question.
const DECLARATIONS: FunctionDeclaration[] = [
  { name: "compare_walk_or_ride", description: "給距離（公里），估算走路與搭 yoxi 各要幾分鐘、走路約幾步。不含車資。",
    parameters: Schema.object({ properties: { distanceKm: Schema.number({ description: "距離，公里" }) } }) },
];

export interface YoikaChat { send(text: string): Promise<string> }

export function startYoika(config: YoikaConfig, system: string, tools: YoikaTools): YoikaChat {
  const app = initializeApp({ apiKey: config.apiKey, projectId: config.projectId, appId: config.appId, authDomain: config.authDomain, messagingSenderId: config.messagingSenderId }, "yoika");
  if (config.recaptchaSiteKey) {
    // Local development prints a debug token in the console; the product owner registers it in App Check.
    if (import.meta.env.DEV) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
  }
  // The project protects AI Logic against replay: every request carries a one-time (limited-use) App Check token.
  const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: Boolean(config.recaptchaSiteKey) });
  const model = getGenerativeModel(ai, {
    model: config.model,
    systemInstruction: system,
    tools: [{ functionDeclarations: DECLARATIONS }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
  });
  const chat = model.startChat();

  const run = (name: string, args: unknown): Record<string, unknown> => {
    const tool = tools[name];
    if (!tool) return { error: "沒有這個工具。" };
    try { return tool((args && typeof args === "object" ? args : {}) as Record<string, unknown>); } catch { return { error: "資料暫時讀不到。" }; }
  };

  async function exchange(text: string): Promise<string> {
    let result: GenerateContentResult = await chat.sendMessage(text);
    for (let round = 0; round < YOIKA_LIMITS.toolRounds; round++) {
      const calls = result.response.functionCalls();
      if (!calls?.length) return result.response.text();
      result = await chat.sendMessage(calls.map((c) => ({ functionResponse: { name: c.name, response: run(c.name, c.args) } })));
    }
    throw new Error("too many tool rounds");
  }

  return {
    send(text) {
      return new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("timeout")), YOIKA_LIMITS.timeoutMs);
        exchange(text).then(resolve, reject).finally(() => window.clearTimeout(timer));
      });
    },
  };
}
