/**
 * FSD-PA (public test build): the visitor's whole world lives here, in memory, saved to localStorage after every
 * write. Nothing leaves the browser. A world unused for 3 days is wiped at the next load (counted from the last use).
 */
export class Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  toMillis(): number { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate(): Date { return new Date(this.toMillis()); }
  isEqual(other: Timestamp): boolean { return other.seconds === this.seconds && other.nanoseconds === this.nanoseconds; }
  static now(): Timestamp { return nextServerTime(); }
  static fromMillis(ms: number): Timestamp { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
}

export type DocData = Record<string, unknown>;

const KEY = "yoi-public:world:v1";
const USED_KEY = "yoi-public:last-used";
export const KEEP_MS = 3 * 24 * 3600_000;

const docs = new Map<string, DocData>();
const listeners = new Set<() => void>();
let lastServer = 0;

/** Strictly increasing server times (seconds + nanoseconds), so writes keep their order as on a real server. */
export function nextServerTime(): Timestamp {
  const ms = Math.max(Date.now(), lastServer + 1);
  lastServer = ms;
  return Timestamp.fromMillis(ms);
}

/** Deep copy that keeps Timestamps (structuredClone would drop their methods). */
export function clone<T>(value: T): T {
  if (value instanceof Timestamp) return new Timestamp(value.seconds, value.nanoseconds) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = clone(v);
    return out as T;
  }
  return value;
}

function encode(value: unknown): unknown {
  if (value instanceof Timestamp) return { __ts: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const ts = (value as { __ts?: [number, number] }).__ts;
    if (Array.isArray(ts) && ts.length === 2) return new Timestamp(ts[0], ts[1]);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  }
  return value;
}

function storage(): Storage | null { try { return window.localStorage; } catch { return null; } }

/** Loads the saved world (or nothing when it is older than 3 days); returns whether a world was found. */
export function loadWorld(now = Date.now()): boolean {
  docs.clear();
  const s = storage();
  try {
    const used = Number(s?.getItem(USED_KEY) ?? 0);
    const raw = s?.getItem(KEY);
    if (!raw || !used || now - used > KEEP_MS) { s?.removeItem(KEY); return false; }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [path, data] of Object.entries(parsed)) docs.set(path, decode(data) as DocData);
    return docs.size > 0;
  } catch { docs.clear(); return false; }
}

/** Every visit counts as a use (the 3-day window restarts). */
export function touch(now = Date.now()): void {
  try { storage()?.setItem(USED_KEY, String(now)); } catch { /* memory only */ }
}

function save(): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(Object.fromEntries([...docs].map(([p, d]) => [p, encode(d)]))));
    touch();
  } catch { /* full or blocked storage: the world still works for this visit */ }
}

/** Wipes the visitor's world (重新開始體驗). */
export function wipeWorld(): void {
  docs.clear();
  try { storage()?.removeItem(KEY); } catch { /* nothing to remove */ }
}

export function readDoc(path: string): DocData | undefined {
  const d = docs.get(path);
  return d === undefined ? undefined : clone(d);
}

/** Documents directly inside a collection path. */
export function readCollection(path: string): { id: string; path: string; data: DocData }[] {
  const prefix = `${path}/`;
  const out: { id: string; path: string; data: DocData }[] = [];
  for (const [p, d] of docs) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (rest.includes("/")) continue;
    out.push({ id: rest, path: p, data: clone(d) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type Write = { path: string; data: DocData | null };

/** Applies writes atomically, then tells every listener (after the current task, like a real snapshot). */
export function commit(writes: Write[]): void {
  for (const w of writes) {
    if (w.data === null) docs.delete(w.path);
    else docs.set(w.path, clone(w.data));
  }
  save();
  queueMicrotask(() => { for (const l of [...listeners]) l(); });
}

export function listen(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
