import { sameMoment, settlementPlan, WeekResultFormatError, type PendingAward, type Reaching, type Stint, type WeekResult } from "./week-result-state.ts";

/** done: written; skip: nothing to do or the plan went stale; exists: already there (maybe for another team). */
export type WriteResult = "done" | "skip" | "exists" | "unconfirmed" | "refused";

/** The Firestore side the settler needs (WeekResultService; a fake in tests). */
export interface SettlerPort {
  readStints(teamId: string): Promise<{ revision: number; stints: Stint[] | null } | null>;
  writeWeek(teamId: string, weekId: string, reaching: Reaching): Promise<WriteResult>;
  writeAward(teamId: string, weekId: string, award: PendingAward): Promise<WriteResult>;
}

/** What one week's settlement needs from the panel's subscriptions (all server-confirmed). */
export interface WeekInputs {
  teamId: string;
  /** The team revision of the confirmed membership snapshot: cached stints are reused while it holds. */
  teamRevision: number;
  weekId: string;
  reaching: Reaching | null;
  record: WeekResult | null;
  awarded: Set<string>;
  confirmed: boolean;
}

const momentKey = (m: { at: string; server: { seconds: number; nanoseconds: number } }) => `${m.at}|${m.server.seconds}.${m.server.nanoseconds}`;

/**
 * Single-flight settlement of one week (FSD-03C-2): a confirmed snapshot sets `needRerun` and the loop
 * runs on the latest inputs until nothing new arrived. A network failure never schedules a rerun by
 * itself (only a new snapshot does). A refusal is final per (memberId, M) on this page after one reread;
 * a refused week write is final per M but the awards of the existing record are still settled.
 */
export class WeekSettler {
  private latest: WeekInputs | null = null;
  private running = false;
  private needRerun = false;
  private cancelled = false;
  private readonly finalized = new Set<string>();
  private readonly retried = new Set<string>();
  private cache: { teamId: string; revision: number; stints: Stint[] | null } | null = null;
  /** Everyone eligible for the record of `eligibleFor` (its revision), from the last run. */
  eligible: string[] | null = null;
  eligibleFor: number | null = null;
  /** Members whose award already exists although this team's list does not show it (another team). */
  readonly existing = new Set<string>();
  /** True while a write of this week could not be confirmed (shown as "結算中"). */
  pending = false;
  /** A malformed document met while settling (shown as an error, not as "結算中"). */
  formatError: string | null = null;

  private readonly port: SettlerPort;
  private readonly onChange: () => void;

  constructor(port: SettlerPort, onChange: () => void) {
    this.port = port;
    this.onChange = onChange;
  }

  offer(inputs: WeekInputs): void {
    if (this.cancelled || !inputs.confirmed) return;
    this.latest = inputs;
    this.needRerun = true;
    if (!this.running) void this.loop();
  }

  cancel(): void {
    this.cancelled = true;
    this.needRerun = false;
    this.latest = null;
    this.finalized.clear();
    this.retried.clear();
  }

  /** Resolves when the current loop (if any) has finished; for tests. */
  async idle(): Promise<void> {
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  private async loop(): Promise<void> {
    this.running = true;
    try {
      while (this.needRerun && !this.cancelled) {
        this.needRerun = false;
        const inputs = this.latest;
        if (inputs) await this.run(inputs);
      }
    } finally { this.running = false; }
  }

  private async stints(inputs: WeekInputs, fresh = false): Promise<Stint[] | null> {
    const c = this.cache;
    if (!fresh && c && c.teamId === inputs.teamId && c.revision === inputs.teamRevision) return c.stints;
    const read = await this.port.readStints(inputs.teamId);
    if (!read) return null;
    this.cache = { teamId: inputs.teamId, revision: read.revision, stints: read.stints };
    return read.stints;
  }

  private async run(inputs: WeekInputs): Promise<void> {
    let pending = false;
    this.formatError = null;
    try {
      const stints = inputs.record || inputs.reaching ? await this.stints(inputs) : null;
      if (this.cancelled) return;
      const plan = settlementPlan(inputs.record, inputs.reaching, inputs.awarded, stints);
      this.eligible = plan.eligible;
      this.eligibleFor = inputs.record && plan.eligible ? inputs.record.revision : null;
      if (plan.week && !this.finalized.has(`week|${momentKey({ at: plan.week.reaching.occurredAt, server: plan.week.reaching.syncedAt })}`)) {
        const key = `week|${momentKey({ at: plan.week.reaching.occurredAt, server: plan.week.reaching.syncedAt })}`;
        const result = await this.port.writeWeek(inputs.teamId, inputs.weekId, plan.week.reaching);
        if (this.cancelled) return;
        if (result === "unconfirmed") pending = true;
        if (result === "refused") this.finalized.add(key); // e.g. the window closed or this member just left
        // Written: the record's snapshot offers new inputs and the awards are planned again then.
        if (result !== "refused") return;
      }
      for (const award of plan.awards) {
        if (this.cancelled) return;
        const key = `${award.memberId}|${momentKey(award.at)}`;
        if (this.finalized.has(key)) continue;
        let result = await this.port.writeAward(inputs.teamId, inputs.weekId, award);
        if (this.cancelled) return;
        if (result === "refused" && !this.retried.has(key)) {
          // The awardee may have just left: reread the events once and retry with the new leave revision.
          this.retried.add(key);
          const fresh = await this.stints(inputs, true);
          if (this.cancelled) return;
          const again = fresh ? settlementPlan(inputs.record, null, inputs.awarded, fresh).awards.find((a) => a.memberId === award.memberId && sameMoment(a.at, award.at)) : undefined;
          result = again ? await this.port.writeAward(inputs.teamId, inputs.weekId, again) : "refused";
          if (this.cancelled) return;
        }
        if (result === "refused") this.finalized.add(key);
        if (result === "exists") { this.existing.add(award.memberId); this.finalized.add(key); } // awards never change: no need to look again
        if (result === "unconfirmed") pending = true;
      }
    } catch (error) {
      if (error instanceof WeekResultFormatError) this.formatError = error.message;
      else pending = true; // a read failed (network, or the team changed under us): the next snapshot runs again
    } finally {
      if (!this.cancelled) { this.pending = pending; this.onChange(); }
    }
  }
}
