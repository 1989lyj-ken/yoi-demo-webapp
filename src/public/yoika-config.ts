/** FSD-PA-10: Yoika's settings from .env.public (kept apart so the chat can tell "not set up" without loading Firebase). */
export interface YoikaConfig { apiKey: string; projectId: string; appId: string; authDomain?: string; messagingSenderId?: string; recaptchaSiteKey?: string; model: string }

/** The public web-app settings (not secrets: access is guarded by App Check and the free tier). Null when not set. */
export function yoikaConfig(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): YoikaConfig | null {
  const apiKey = env.VITE_YOIKA_API_KEY?.trim();
  const projectId = env.VITE_YOIKA_PROJECT_ID?.trim();
  const appId = env.VITE_YOIKA_APP_ID?.trim();
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey, projectId, appId,
    authDomain: env.VITE_YOIKA_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`,
    messagingSenderId: env.VITE_YOIKA_MESSAGING_SENDER_ID?.trim() || undefined,
    recaptchaSiteKey: env.VITE_YOIKA_RECAPTCHA_SITE_KEY?.trim() || undefined,
    // Firebase AI Logic 2026-10: gemini-3.5-flash-lite is stable on the no-billing tier until at least 2027-07.
    model: env.VITE_YOIKA_MODEL?.trim() || "gemini-3.5-flash-lite",
  };
}

