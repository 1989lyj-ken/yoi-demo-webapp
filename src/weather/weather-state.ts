/**
 * FSD-08B: pure weather decisions (no DOM, no network). Open-Meteo answers are checked strictly; anything
 * unexpected is a failure (the icon is then simply not shown). Times are compared as fixed-format strings
 * ("YYYY-MM-DDTHH:MM", Asia/Taipei wall time), never through Date.
 */
export type WeatherKind = "sunny" | "cloudy" | "rainy" | "storm";

export interface Forecast {
  /** "YYYY-MM-DDTHH:MM" of the current reading (local wall time). */
  time: string;
  code: number;
  temperature: number;
  apparent: number;
  /** Percent; from the first hourly slot when the current block has none (Architect C1). */
  precipitation: number;
  wind: number;
  /** Up to six hours after `time`. */
  hours: { time: string; code: number; temperature: number; precipitation: number }[];
  /** Today and tomorrow. */
  days: { date: string; code: number; max: number; min: number; precipitation: number }[];
}

export const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** Two decimals (about 1 km); a non-finite value is never sent (Architect C3). */
export function roundCoord(value: number): string | null {
  return Number.isFinite(value) ? value.toFixed(2) : null;
}

/** The request URL: fixed parameters plus the rounded position (URLSearchParams encodes the time zone). */
export function forecastUrl(lat: number, lon: number): string | null {
  const latitude = roundCoord(lat);
  const longitude = roundCoord(lon);
  if (latitude === null || longitude === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const params = new URLSearchParams({
    latitude, longitude,
    current: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    forecast_hours: "7",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "2",
    timezone: "Asia/Taipei",
    wind_speed_unit: "kmh",
  });
  return `${WEATHER_ENDPOINT}?${params.toString()}`;
}

/** Great-circle distance in km (haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const REFRESH_MS = 15 * 60_000;
export const BACKOFF_MS = 5 * 60_000;
export const MOVE_KM = 5;

/**
 * Architect B3: within 15 minutes of the last success, the same rounded position or a move under 5 km never
 * refetches; after it, the same position refetches. After a failure nothing is fetched for 5 minutes.
 */
export function shouldFetch(input: { now: number; position: { lat: number; lon: number };
  last: { at: number; position: { lat: number; lon: number } } | null; failedAt: number | null; inFlight: boolean }): boolean {
  if (input.inFlight) return false;
  if (input.failedAt !== null && input.now - input.failedAt < BACKOFF_MS) return false;
  if (!input.last) return true;
  if (input.now - input.last.at >= REFRESH_MS) return true;
  const same = roundCoord(input.position.lat) === roundCoord(input.last.position.lat) && roundCoord(input.position.lon) === roundCoord(input.last.position.lon);
  return !same && distanceKm(input.position, input.last.position) >= MOVE_KM;
}

/** WMO code → one of the four icons (null: not shown). */
export function weatherKind(code: number): WeatherKind | null {
  if (code === 0 || code === 1) return "sunny";
  if (code === 2 || code === 3 || code === 45 || code === 48 || (code >= 71 && code <= 77) || code === 85 || code === 86) return "cloudy";
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rainy";
  if (code === 95 || code === 96 || code === 99) return "storm";
  return null;
}

/** Fixed Chinese text per code (never text from the API). */
export function weatherText(code: number): string | null {
  if (code === 0) return "晴";
  if (code === 1) return "大致晴朗";
  if (code === 2) return "多雲";
  if (code === 3) return "陰天";
  if (code === 45 || code === 48) return "有霧";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "下雪";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "下雨";
  if (code >= 80 && code <= 82) return "陣雨";
  if (code === 95) return "雷雨";
  if (code === 96 || code === 99) return "雷雨伴冰雹";
  return null;
}

export class ForecastFormatError extends Error {}

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict parse of the Open-Meteo answer (Architect C1); throws ForecastFormatError on anything unexpected. */
export function parseForecast(json: unknown): Forecast {
  const bad = (why: string) => new ForecastFormatError(`天氣資料格式不符（${why}）。`);
  const obj = (v: unknown, why: string) => { if (!v || typeof v !== "object" || Array.isArray(v)) throw bad(why); return v as Record<string, unknown>; };
  const num = (v: unknown, why: string) => { if (typeof v !== "number" || !Number.isFinite(v)) throw bad(why); return v; };
  const code = (v: unknown, why: string) => { const c = num(v, why); if (!Number.isInteger(c) || weatherKind(c) === null) throw bad(why); return c; };
  const pct = (v: unknown, why: string) => { const p = num(v, why); if (p < 0 || p > 100) throw bad(why); return p; };
  const list = (v: unknown, n: number, why: string) => { if (!Array.isArray(v) || v.length !== n) throw bad(why); return v; };
  const root = obj(json, "root");
  if (root.utc_offset_seconds !== 28800) throw bad("時區");
  const units = obj(root.current_units, "單位");
  if (units.temperature_2m !== "°C" || units.wind_speed_10m !== "km/h") throw bad("單位");
  const current = obj(root.current, "current");
  if (typeof current.time !== "string" || !TIME.test(current.time)) throw bad("current.time");
  const hourly = obj(root.hourly, "hourly");
  const hTimes = hourly.time;
  if (!Array.isArray(hTimes) || hTimes.length < 1 || hTimes.length > 8) throw bad("hourly");
  const n = hTimes.length;
  const hours = list(hTimes, n, "hourly.time").map((t, i) => {
    if (typeof t !== "string" || !TIME.test(t)) throw bad("hourly.time");
    return {
      time: t, code: code(list(hourly.weather_code, n, "hourly")[i], "hourly.code"),
      temperature: num(list(hourly.temperature_2m, n, "hourly")[i], "hourly.temp"),
      precipitation: pct(list(hourly.precipitation_probability, n, "hourly")[i], "hourly.pop"),
    };
  });
  const daily = obj(root.daily, "daily");
  const days = list(daily.time, 2, "daily.time").map((d, i) => {
    if (typeof d !== "string" || !DATE.test(d)) throw bad("daily.time");
    return {
      date: d, code: code(list(daily.weather_code, 2, "daily")[i], "daily.code"),
      max: num(list(daily.temperature_2m_max, 2, "daily")[i], "daily.max"), min: num(list(daily.temperature_2m_min, 2, "daily")[i], "daily.min"),
      precipitation: pct(list(daily.precipitation_probability_max, 2, "daily")[i], "daily.pop"),
    };
  });
  const precipitation = current.precipitation_probability === null || current.precipitation_probability === undefined
    ? hours[0].precipitation : pct(current.precipitation_probability, "current.pop");
  return {
    time: current.time, code: code(current.weather_code, "current.code"), temperature: num(current.temperature_2m, "current.temp"),
    apparent: num(current.apparent_temperature, "current.apparent"), precipitation, wind: num(current.wind_speed_10m, "current.wind"),
    hours: hours.filter((h) => h.time > (current.time as string)).slice(0, 6),
    days,
  };
}

/**
 * The one walking tip (FSD-08B; Architect C6): storm now or within 6 hours; rain = the highest of now and the
 * next hours ≥ 50%; heat = temperature or feels-like ≥ 32; cold = temperature now ≤ 12; otherwise a nudge.
 */
export function walkTip(f: Forecast): string {
  if (weatherKind(f.code) === "storm" || f.hours.some((h) => weatherKind(h.code) === "storm")) return "可能有雷雨，建議在室內走走";
  const rain = Math.max(f.precipitation, ...f.hours.map((h) => h.precipitation));
  if (rain >= 50) return `降雨機率 ${Math.round(rain)}%，出門記得帶傘`;
  if (f.temperature >= 32 || f.apparent >= 32) return "天氣炎熱，記得補水、避開正午";
  if (f.temperature <= 12) return "天氣偏冷，出門注意保暖";
  return "適合出門走走";
}

export const WEATHER_KIND_LABEL: Record<WeatherKind, string> = { sunny: "晴天", cloudy: "陰天", rainy: "雨天", storm: "雷雨" };
