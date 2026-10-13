import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKOFF_MS, distanceKm, forecastUrl, parseForecast, REFRESH_MS, roundCoord, shouldFetch, walkTip, weatherKind, weatherText } from '../src/weather/weather-state.ts';
import { createWeatherController, MIN_GAP_MS } from '../src/weather/weather-controller.ts';
import { mapHeroView, weatherButtonView, weatherDialogView } from '../src/ui/views.ts';

// The shape of a real Open-Meteo answer (probed 2026-10-06 with fixed Taipei coordinates).
const sample = (o = {}) => ({
  latitude: 25.06, longitude: 121.52, utc_offset_seconds: 28800, timezone: 'Asia/Taipei',
  current_units: { time: 'iso8601', temperature_2m: '°C', apparent_temperature: '°C', precipitation_probability: '%', weather_code: 'wmo code', wind_speed_10m: 'km/h' },
  current: { time: '2026-10-06T00:30', interval: 900, temperature_2m: 22.3, apparent_temperature: 25.0, precipitation_probability: 77, weather_code: 3, wind_speed_10m: 9.8 },
  hourly: { time: ['00', '01', '02', '03', '04', '05', '06'].map((h) => `2026-10-06T${h}:00`), temperature_2m: [22.3, 22.3, 22.4, 22.5, 22.5, 22.7, 22.7],
    precipitation_probability: [81, 72, 61, 44, 25, 10, 3], weather_code: [51, 51, 51, 2, 3, 3, 3] },
  daily: { time: ['2026-10-06', '2026-10-07'], weather_code: [51, 3], temperature_2m_max: [25.6, 26.0], temperature_2m_min: [22.3, 21.7], precipitation_probability_max: [81, 0] },
  ...o,
});

test('08B codes: four icons and fixed texts; unknown codes show nothing', () => {
  assert.deepEqual([0, 1, 2, 3, 45, 48, 71, 77, 85, 86, 51, 57, 61, 67, 80, 82, 95, 96, 99].map(weatherKind),
    ['sunny', 'sunny', 'cloudy', 'cloudy', 'cloudy', 'cloudy', 'cloudy', 'cloudy', 'cloudy', 'cloudy', 'rainy', 'rainy', 'rainy', 'rainy', 'rainy', 'rainy', 'storm', 'storm', 'storm']);
  for (const c of [4, 50, 58, 68, 78, 83, 90, 100, -1]) { assert.equal(weatherKind(c), null, String(c)); assert.equal(weatherText(c), null); }
  assert.equal(weatherText(3), '陰天');
  assert.equal(weatherText(99), '雷雨伴冰雹');
});

test('08B request: coordinates rounded to 2 decimals, fixed parameters, Asia/Taipei encoded once; bad numbers never sent', () => {
  const url = new URL(forecastUrl(25.033964, 121.564468));
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '25.03');
  assert.equal(url.searchParams.get('longitude'), '121.56');
  assert.equal(url.searchParams.get('timezone'), 'Asia/Taipei');
  assert.ok(url.search.includes('timezone=Asia%2FTaipei'));
  assert.deepEqual([url.searchParams.get('forecast_hours'), url.searchParams.get('forecast_days'), url.searchParams.get('wind_speed_unit')], ['7', '2', 'kmh']);
  assert.equal([...url.searchParams.keys()].length, 9);
  for (const [lat, lon] of [[NaN, 1], [1, Infinity], [91, 0], [0, 181]]) assert.equal(forecastUrl(lat, lon), null);
  assert.equal(roundCoord(0.1 + 0.2), '0.30');
});

test('08B parse: the real shape works; next six hours after now; current rain null falls back to the first hour', () => {
  const f = parseForecast(sample());
  assert.deepEqual([f.time, f.code, f.temperature, f.apparent, f.precipitation, f.wind], ['2026-10-06T00:30', 3, 22.3, 25, 77, 9.8]);
  assert.deepEqual(f.hours.map((h) => h.time.slice(11)), ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00']);
  assert.deepEqual(f.days.map((d) => [d.date, d.max, d.min]), [['2026-10-06', 25.6, 22.3], ['2026-10-07', 26, 21.7]]);
  const s = sample(); s.current.precipitation_probability = null;
  assert.equal(parseForecast(s).precipitation, 81);
});

test('08B parse: anything unexpected fails (offset, units, times, lengths, NaN, unknown codes)', () => {
  const broken = [
    (s) => { s.utc_offset_seconds = 0; }, (s) => { s.current_units.temperature_2m = '°F'; }, (s) => { s.current.time = '2026-10-06 00:30'; },
    (s) => { s.current.temperature_2m = 'hot'; }, (s) => { s.current.weather_code = 4; }, (s) => { s.hourly.temperature_2m.pop(); },
    (s) => { s.hourly.precipitation_probability[2] = 120; }, (s) => { s.daily.time = ['2026-10-06']; }, (s) => { s.daily.temperature_2m_max[0] = NaN; },
    (s) => { delete s.hourly; }, (s) => { s.hourly.time[0] = 'x'; },
  ];
  for (const [i, mutate] of broken.entries()) { const s = sample(); mutate(s); assert.throws(() => parseForecast(s), /天氣資料格式不符/, `case ${i}`); }
  assert.throws(() => parseForecast(null));
});

test('08B tip: storm, then rain (max of now and next hours), then heat (temp or feels-like), then cold (temp), else a nudge', () => {
  const base = parseForecast(sample());
  const f = (o) => ({ ...base, precipitation: 0, temperature: 22, apparent: 22, code: 0, hours: base.hours.map((h) => ({ ...h, code: 0, precipitation: 0 })), ...o });
  assert.equal(walkTip(f({ code: 95, precipitation: 90 })), '可能有雷雨，建議在室內走走');
  assert.equal(walkTip(f({ hours: [{ time: '2026-10-06T03:00', code: 96, temperature: 20, precipitation: 0 }] })), '可能有雷雨，建議在室內走走');
  assert.equal(walkTip(f({ hours: [{ time: '2026-10-06T03:00', code: 61, temperature: 20, precipitation: 64.4 }] })), '降雨機率 64%，出門記得帶傘');
  assert.equal(walkTip(f({ precipitation: 49, apparent: 33 })), '天氣炎熱，記得補水、避開正午');
  assert.equal(walkTip(f({ temperature: 12, apparent: 9 })), '天氣偏冷，出門注意保暖');
  assert.equal(walkTip(f({ temperature: 13, apparent: 10 })), '適合出門走走');
});

test('08B frequency: 15 minutes, same rounded spot or under 5 km; refetch after 15 min; 5-minute backoff; single flight', () => {
  const p = { lat: 25.03, lon: 121.56 };
  const last = { at: 0, position: p };
  assert.equal(shouldFetch({ now: 0, position: p, last: null, failedAt: null, inFlight: false }), true);
  assert.equal(shouldFetch({ now: 0, position: p, last: null, failedAt: null, inFlight: true }), false);
  assert.equal(shouldFetch({ now: REFRESH_MS - 1, position: { lat: 25.0349, lon: 121.5649 }, last, failedAt: null, inFlight: false }), false);
  assert.equal(shouldFetch({ now: 60_000, position: { lat: 25.06, lon: 121.56 }, last, failedAt: null, inFlight: false }), false); // ~3.3 km
  assert.ok(distanceKm(p, { lat: 25.08, lon: 121.56 }) > 5);
  assert.equal(shouldFetch({ now: 60_000, position: { lat: 25.08, lon: 121.56 }, last, failedAt: null, inFlight: false }), true);
  assert.equal(shouldFetch({ now: REFRESH_MS, position: p, last, failedAt: null, inFlight: false }), true);
  assert.equal(shouldFetch({ now: BACKOFF_MS - 1, position: p, last: null, failedAt: 0, inFlight: false }), false);
  assert.equal(shouldFetch({ now: BACKOFF_MS, position: p, last: null, failedAt: 0, inFlight: false }), true);
});

const harness = (respond) => {
  let now = 0;
  const calls = [];
  const changes = [];
  const pending = [];
  const ctl = createWeatherController({
    fetch: (url, init) => { calls.push({ url, init }); return new Promise((resolve, reject) => pending.push({ resolve, reject, init })); },
    now: () => now, setTimeout: () => 1, clearTimeout: () => {},
    onChange: (f, at) => changes.push([f && f.code, at]),
  });
  return { ctl, calls, changes, pending, tick: (ms) => { now += ms; }, ok: (i = 0, body = sample()) => pending[i].resolve({ ok: true, json: async () => body }) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

test('08B controller: private fetch options; one request at a time; result shown; same spot not refetched', async () => {
  const h = harness();
  h.ctl.onFix(25.0339, 121.5644);
  h.ctl.onFix(25.0339, 121.5644);
  assert.equal(h.calls.length, 1);
  assert.deepEqual([h.calls[0].init.credentials, h.calls[0].init.referrerPolicy, h.calls[0].init.cache], ['omit', 'no-referrer', 'no-store']);
  assert.ok(h.calls[0].url.includes('latitude=25.03&longitude=121.56'));
  h.ok(); await flush();
  assert.deepEqual(h.changes, [[3, 0]]);
  h.tick(60_000); h.ctl.onFix(25.0339, 121.5644);
  assert.equal(h.calls.length, 1);
});

test('08B controller: failure is silent with a 5-minute backoff; lost clears the icon; pause and stop drop late results', async () => {
  const h = harness();
  h.ctl.onFix(25.03, 121.56);
  h.pending[0].resolve({ ok: false, json: async () => ({}) }); await flush();
  assert.deepEqual(h.changes, []);
  h.tick(BACKOFF_MS - 1); h.ctl.onFix(25.03, 121.56); assert.equal(h.calls.length, 1);
  h.tick(1); h.ctl.onFix(25.03, 121.56); assert.equal(h.calls.length, 2);
  h.ok(1); await flush();
  assert.equal(h.changes.length, 1);
  h.ctl.onLost();
  assert.deepEqual(h.changes.at(-1), [null, null]);
  // Security S1: at least 30 s between attempts, even after a loss
  h.ctl.onFix(25.03, 121.56); assert.equal(h.calls.length, 2);
  h.tick(MIN_GAP_MS);
  // pause while in flight: the late answer is dropped, and the aborted attempt still counts for the gap
  h.ctl.onFix(25.03, 121.56); assert.equal(h.calls.length, 3);
  h.ctl.pause(); assert.equal(h.calls[2].init.signal.aborted, true);
  h.ok(2); await flush();
  assert.equal(h.changes.length, 2);
  h.ctl.onFix(25.03, 121.56); assert.equal(h.calls.length, 3);
  h.tick(MIN_GAP_MS);
  // stop: nothing more
  h.ctl.onFix(25.03, 121.56); assert.equal(h.calls.length, 4); h.ctl.stop(); h.ok(3); await flush();
  assert.equal(h.changes.length, 2);
  h.tick(MIN_GAP_MS); h.ctl.onFix(25.03, 121.56); assert.equal(h.calls.length, 4);
  const src = readFileSync(new URL('../src/weather/weather-controller.ts', import.meta.url), 'utf8');
  assert.ok(!src.includes('console.'));
});

test('08B views: map container beside the actions; button label; dialog sections, tip, source; no attributes from data', () => {
  assert.match(mapHeroView({ label: 'x', offerLocate: true, ownPosition: false, steps: null, effective: null, fallback: false }), /<\/div><div id="map-weather"><\/div><\/div>/);
  const f = parseForecast(sample());
  assert.equal(weatherButtonView(null), '');
  assert.match(weatherButtonView(f), /<button id="weather-open" class="yo-map-move app-weather-button" type="button" aria-haspopup="dialog" aria-label="目前天氣：陰天 22°C，開啟天氣詳情">/);
  const d = weatherDialogView(f, '00:31');
  assert.match(d, /role="dialog" aria-modal="true" aria-labelledby="weather-title"/);
  assert.match(d, /<b>22°C<\/b><span>陰天<\/span>/);
  assert.match(d, /體感 25°C・降雨機率 77%・風速 10 km\/h/);
  assert.match(d, /<p class="weather-tip" role="note">降雨機率 77%，出門記得帶傘<\/p>/);
  assert.equal((d.match(/<li><span>0\d:00<\/span>/g) ?? []).length, 6);
  assert.match(d, /<ol class="weather-hours" tabindex="0" aria-label="接下來 6 小時的天氣">/);
  assert.match(d, /<li><span>今天<\/span>[^]*?<b>22°C–26°C<\/b><small>降雨 81%<\/small><\/li><li><span>明天<\/span>/);
  assert.match(d, /href="https:\/\/open-meteo.com\/" target="_blank" rel="noopener noreferrer">Open-Meteo.com<\/a>[^]*CC BY 4.0[^]*更新 00:31/);
  assert.match(d, /天氣為實際時間的資料，與展示用的情境時間無關。/);
  assert.doesNotMatch(d, /地圖與天氣會用到/);   // 2026-10-06 (5): the note lives on the today tab only
});
