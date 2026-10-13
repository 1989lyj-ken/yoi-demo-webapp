import { forecastUrl, parseForecast, shouldFetch, type Forecast } from "./weather-state.ts";

/** What the controller needs from the page; injected so tests use a fake fetch and clock (Architect S1). */
export interface WeatherDeps {
  fetch(url: string, init: RequestInit): Promise<{ ok: boolean; json(): Promise<unknown> }>;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  /** The confirmed forecast changed (null: remove the icon and close the dialog). */
  onChange(forecast: Forecast | null, updatedAt: number | null): void;
}

export interface WeatherController {
  /** A position from the location watch (memory only). */
  onFix(lat: number, lon: number): void;
  /** Location denied or unsupported: forget everything and remove the icon. */
  onLost(): void;
  /** The watch stopped (page hidden, steps page left): abort a request in flight, keep what is shown. */
  pause(): void;
  stop(): void;
}

const TIMEOUT_MS = 8000;
export const MIN_GAP_MS = 30_000;

/**
 * FSD-08B: one request at a time; a result arriving after a position change, pause, loss or stop is dropped
 * (generation). Failures are silent (no icon) and back off 5 minutes. Coordinates never leave this module
 * except in the request URL (rounded to 2 decimals) and are never logged.
 */
export function createWeatherController(deps: WeatherDeps): WeatherController {
  let generation = 0;
  let stopped = false;
  let inFlight: AbortController | null = null;
  let last: { at: number; position: { lat: number; lon: number } } | null = null;
  let failedAt: number | null = null;
  let forecast: Forecast | null = null;
  /** Security S1: an aborted request (page switching) still counts, so quick toggling cannot multiply requests. */
  let lastAttemptAt: number | null = null;

  function abort() {
    generation += 1;
    inFlight?.abort();
    inFlight = null;
  }

  async function request(position: { lat: number; lon: number }) {
    const url = forecastUrl(position.lat, position.lon);
    if (!url) return;
    const mine = ++generation;
    const controller = new AbortController();
    inFlight = controller;
    const timer = deps.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await deps.fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("http");
      const parsed = parseForecast(await response.json());
      if (mine !== generation || stopped) return;
      forecast = parsed;
      failedAt = null;
      last = { at: deps.now(), position };
      deps.onChange(forecast, last.at);
    } catch {
      // Never log the error: the URL carries the (rounded) position.
      if (mine !== generation || stopped) return;
      failedAt = deps.now();
    } finally {
      deps.clearTimeout(timer);
      if (mine === generation) inFlight = null;
    }
  }

  return {
    onFix(lat, lon) {
      if (stopped || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const position = { lat, lon };
      const now = deps.now();
      if (lastAttemptAt !== null && now - lastAttemptAt < MIN_GAP_MS) return;
      if (!shouldFetch({ now, position, last, failedAt, inFlight: inFlight !== null })) return;
      lastAttemptAt = now;
      void request(position);
    },
    onLost() {
      abort();
      last = null; failedAt = null;
      if (forecast !== null) { forecast = null; deps.onChange(null, null); }
    },
    pause() { abort(); },
    stop() {
      stopped = true;
      abort();
      forecast = null; last = null;
    },
  };
}
