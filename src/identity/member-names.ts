/** Reads one `memberProfiles/{memberId}` document from the server; resolves `undefined` when it does not exist. */
export type ProfileReader = (memberId: string) => Promise<unknown>;

/**
 * FSD-AC1 R3: a profile has exactly one field, `displayName`: a string that is not blank after trimming
 * and at most 40 code points. Trimming is only for the check; the stored text is shown as it is.
 */
export function parseProfile(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const name = (data as Record<string, unknown>).displayName;
  if (Object.keys(data).length !== 1 || typeof name !== "string" || !name.trim() || [...name].length > 40) return null;
  return name;
}

/**
 * Teammates' display names (FSD-AC1 R3). Only confirmed names are cached; anything else shows the memberId.
 * A failed name is not reread while the roster stays the same (`rosterKey`), so snapshots never loop reads.
 * `clear()` (sign-out, leaving the shared screen) bumps the generation: a read still in flight is dropped.
 */
export class MemberNames {
  private readonly read: ProfileReader;
  private readonly names = new Map<string, string>();
  private readonly inflight = new Set<string>();
  private readonly failed = new Set<string>();
  private failedKey = "";
  private generation = 0;

  constructor(read: ProfileReader) { this.read = read; }

  name(memberId: string): string | null { return this.names.get(memberId) ?? null; }

  label(memberId: string): string { return this.names.get(memberId) ?? memberId; }

  /** Reads the names not known yet; `onChange` runs once per newly confirmed name. */
  request(memberIds: readonly string[], rosterKey: string, onChange: () => void): void {
    if (rosterKey !== this.failedKey) { this.failed.clear(); this.failedKey = rosterKey; }
    const generation = this.generation;
    for (const id of new Set(memberIds)) {
      if (this.names.has(id) || this.inflight.has(id) || this.failed.has(id)) continue;
      this.inflight.add(id);
      void this.read(id).then((data) => {
        if (generation !== this.generation) return;
        const name = parseProfile(data);
        if (name === null) { this.failed.add(id); return; }
        this.names.set(id, name);
        try { onChange(); } catch { /* a failed re-render must not break later reads */ }
      }, () => {
        if (generation === this.generation) this.failed.add(id);
      }).finally(() => {
        if (generation === this.generation) this.inflight.delete(id);
      });
    }
  }

  clear(): void {
    this.generation += 1;
    this.names.clear(); this.inflight.clear(); this.failed.clear(); this.failedKey = "";
  }
}
