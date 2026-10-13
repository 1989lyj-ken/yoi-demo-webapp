/**
 * FSD-PA: a stand-in for the parts of "firebase/firestore" this app uses, backed by the visitor's local world
 * (src/local/store.ts). The public build aliases "firebase/firestore" here. Every snapshot counts as server-confirmed.
 */
import { clone, commit, listen, nextServerTime, readCollection, readDoc, Timestamp, type DocData, type Write } from "./store.ts";

export { Timestamp };

export interface Firestore { readonly kind: "local" }
export type Unsubscribe = () => void;

export interface DocumentReference { readonly type: "document"; readonly path: string; readonly id: string }
export interface CollectionReference { readonly type: "collection"; readonly path: string; readonly id: string }
interface Filter { field: string; op: "==" | "in"; value: unknown }
export interface Query { readonly type: "query"; readonly path: string; readonly filters: Filter[] }

const db: Firestore = { kind: "local" };
export function getFirestore(..._args: unknown[]): Firestore { return db; }

const join = (segments: string[]) => segments.join("/");

export function doc(parent: Firestore | CollectionReference | DocumentReference, ...segments: string[]): DocumentReference {
  // A collection or a document as the parent: the path continues from it (doc(dayRef, "events", "3")).
  const p = parent as { type?: string; path?: string };
  const base = p.type === "collection" || p.type === "document" ? [p.path as string, ...segments] : segments;
  const path = join(base);
  return { type: "document", path, id: path.split("/").pop() ?? "" };
}

export function collection(_db: Firestore, ...segments: string[]): CollectionReference {
  const path = join(segments);
  return { type: "collection", path, id: path.split("/").pop() ?? "" };
}

export function where(field: string, op: "==" | "in", value: unknown): Filter { return { field, op, value }; }

export function query(ref: CollectionReference, ...filters: Filter[]): Query {
  return { type: "query", path: ref.path, filters };
}

const metadata = { fromCache: false, hasPendingWrites: false };

export class DocumentSnapshot {
  readonly id: string;
  readonly ref: DocumentReference;
  readonly metadata = metadata;
  private readonly value: DocData | undefined;
  constructor(ref: DocumentReference, value: DocData | undefined) { this.ref = ref; this.id = ref.id; this.value = value; }
  exists(): boolean { return this.value !== undefined; }
  data(): DocData | undefined { return this.value === undefined ? undefined : clone(this.value); }
  get(field: string): unknown { return this.value?.[field]; }
}

export class QuerySnapshot {
  readonly docs: DocumentSnapshot[];
  readonly metadata = metadata;
  constructor(docs: DocumentSnapshot[]) { this.docs = docs; }
  get size(): number { return this.docs.length; }
  get empty(): boolean { return this.docs.length === 0; }
  forEach(fn: (snap: DocumentSnapshot) => void): void { this.docs.forEach(fn); }
}

function readRef(ref: DocumentReference): DocumentSnapshot { return new DocumentSnapshot(ref, readDoc(ref.path)); }

function matches(data: DocData, filters: Filter[]): boolean {
  return filters.every((f) => (f.op === "==" ? data[f.field] === f.value : Array.isArray(f.value) && f.value.includes(data[f.field])));
}

function readQuery(q: CollectionReference | Query): QuerySnapshot {
  const filters = q.type === "query" ? q.filters : [];
  return new QuerySnapshot(readCollection(q.path).filter((d) => matches(d.data, filters))
    .map((d) => new DocumentSnapshot({ type: "document", path: d.path, id: d.id }, d.data)));
}

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> { return readRef(ref); }
export async function getDocFromServer(ref: DocumentReference): Promise<DocumentSnapshot> { return readRef(ref); }

type Next<T> = (snap: T) => void;

/** onSnapshot(ref, [options], next, [error]): the first snapshot after the current task, then one per change. */
export function onSnapshot(target: DocumentReference | CollectionReference | Query, ...rest: unknown[]): Unsubscribe {
  const next = (typeof rest[0] === "function" ? rest[0] : rest[1]) as Next<DocumentSnapshot & QuerySnapshot>;
  let last = "";
  let stopped = false;
  const emit = () => {
    if (stopped) return;
    const snap = target.type === "document" ? readRef(target) : readQuery(target);
    const key = JSON.stringify(target.type === "document" ? (snap as DocumentSnapshot).data() ?? null
      : (snap as QuerySnapshot).docs.map((d) => [d.id, d.data()]));
    if (key === last) return;
    last = key;
    next(snap as DocumentSnapshot & QuerySnapshot);
  };
  queueMicrotask(emit);
  const off = listen(emit);
  return () => { stopped = true; off(); };
}

const SERVER_TIME = Symbol("serverTimestamp");
export function serverTimestamp(): unknown { return SERVER_TIME; }

function resolveServerTimes(value: unknown, now: Timestamp): unknown {
  if (value === SERVER_TIME) return now;
  if (value instanceof Timestamp) return value;
  if (Array.isArray(value)) return value.map((v) => resolveServerTimes(v, now));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveServerTimes(v, now)]));
  return value;
}

export class Transaction {
  private readonly writes = new Map<string, DocData | null>();
  async get(ref: DocumentReference): Promise<DocumentSnapshot> {
    // Reads see this transaction's own earlier writes, as a real transaction would refuse reads after writes.
    if (this.writes.has(ref.path)) { const w = this.writes.get(ref.path); return new DocumentSnapshot(ref, w ?? undefined); }
    return readRef(ref);
  }
  set(ref: DocumentReference, data: DocData): Transaction { this.writes.set(ref.path, data); return this; }
  update(ref: DocumentReference, data: DocData): Transaction {
    const base = this.writes.has(ref.path) ? this.writes.get(ref.path) : readDoc(ref.path);
    if (!base) throw Object.assign(new Error("No document to update."), { code: "not-found" });
    this.writes.set(ref.path, { ...base, ...data });
    return this;
  }
  delete(ref: DocumentReference): Transaction { this.writes.set(ref.path, null); return this; }
  /** Applies everything at once with one server time. */
  commitAll(): void {
    const now = nextServerTime();
    const list: Write[] = [...this.writes].map(([path, data]) => ({ path, data: data === null ? null : resolveServerTimes(data, now) as DocData }));
    commit(list);
  }
}

export async function runTransaction<T>(_db: Firestore, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = new Transaction();
  const result = await fn(tx);
  tx.commitAll();
  return result;
}
