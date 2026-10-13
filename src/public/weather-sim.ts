/**
 * FSD-PA-09 (product owner 2026-10-12, option A): simulated weather on the visitor's own clock — sunny, cloudy,
 * rainy and stormy days in turn — answered in Open-Meteo's shape, so the map's weather button and dialog are unchanged.
 * No request ever leaves the browser.
 */
const DAY_CODES = [0, 2, 3, 61, 1, 80, 95];

function hash(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** The forecast for a scenario moment ("YYYY-MM-DDTHH:MM:SS+08:00"). */
export function simulatedForecast(scenarioNow: string): unknown {
  const date = scenarioNow.slice(0, 10);
  const hour = Number(scenarioNow.slice(11, 13));
  const day = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const code = DAY_CODES[(day % DAY_CODES.length + DAY_CODES.length) % DAY_CODES.length];
  const month = Number(date.slice(5, 7));
  const base = [17, 17, 19, 23, 26, 29, 31, 31, 29, 26, 22, 18][month - 1] + (hash(date) % 5) - 2;
  const wet = code >= 61;
  const pop = code === 95 ? 80 : wet ? 65 : code === 3 ? 30 : code === 2 ? 15 : 5;
  const two = (n: number) => String(n).padStart(2, "0");
  const time = (h: number) => `${date}T${two(Math.min(23, h))}:00`;
  const hours = Array.from({ length: 7 }, (_, i) => hour + i);
  const tomorrow = new Date(`${date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const next = tomorrow.toISOString().slice(0, 10);
  const nextCode = DAY_CODES[((day + 1) % DAY_CODES.length + DAY_CODES.length) % DAY_CODES.length];
  return {
    utc_offset_seconds: 28800,
    current_units: { temperature_2m: "°C", wind_speed_10m: "km/h" },
    current: { time: time(hour), temperature_2m: base, apparent_temperature: base + (wet ? -1 : 1), precipitation_probability: pop, weather_code: code, wind_speed_10m: wet ? 18 : 9 },
    hourly: {
      time: hours.map((h) => time(h)).filter((t, i, all) => all.indexOf(t) === i),
      temperature_2m: hours.map((h) => base + (h < 14 ? (h - hour) * 0.4 : -0.3)).slice(0, new Set(hours.map((h) => time(h))).size),
      precipitation_probability: hours.map(() => pop).slice(0, new Set(hours.map((h) => time(h))).size),
      weather_code: hours.map(() => code).slice(0, new Set(hours.map((h) => time(h))).size),
    },
    daily: {
      time: [date, next], weather_code: [code, nextCode],
      temperature_2m_max: [base + 3, base + 2], temperature_2m_min: [base - 4, base - 4],
      precipitation_probability_max: [pop, nextCode >= 61 ? 65 : 15],
    },
  };
}

/** A fetch stand-in for the weather controller (the URL's position is ignored: the weather follows the clock). */
export function simulatedWeatherFetch(scenarioNow: () => string) {
  return async (_url: string, _init?: RequestInit): Promise<Response> =>
    new Response(JSON.stringify(simulatedForecast(scenarioNow())), { status: 200, headers: { "Content-Type": "application/json" } });
}
