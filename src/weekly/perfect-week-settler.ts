import { finalKey, weekVerdict, type DayDoc } from "./perfect-week-state.ts";

/**
 * issued / exists: the coupon is in; unconfirmed: network; refused: the Rules said no; stale: the clock or
 * session moved (the reload overlay takes over); identity: the account was deactivated or remapped.
 */
export type IssueResult = "issued" | "exists" | "unconfirmed" | "refused" | "stale" | "identity";

/** The Firestore side the settler needs (PerfectWeekService; a fake in tests). */
export interface CouponPort {
  issue(weekId: string): Promise<IssueResult>;
  couponExists(weekId: string): Promise<boolean>;
  readDays(weekId: string): Promise<(DayDoc | null)[]>;
}

export interface CouponInputs {
  weekId: string;
  /** Day i of the week: confirmed document, null (confirmed absent) or undefined (not confirmed). */
  docs: (DayDoc | null | undefined)[];
  hasCoupon: boolean;
  /** The coupon list snapshot is server-confirmed. */
  confirmed: boolean;
  today: string;
}

/**
 * Single-flight issuing of one week's coupon (FSD-04A): a confirmed snapshot sets `needRerun` and the
 * loop runs on the latest inputs until nothing new arrived. A network failure never schedules a rerun
 * by itself; a refusal first checks whether the coupon already exists (two devices at once), then rereads
 * the seven days and retries once; still refused, the week is final for this page until a later legal
 * sync changes an eventSeq. "stale" (the clock or session moved) is left to the page's reload overlay.
 */
export class CouponSettler {
  private latest: CouponInputs | null = null;
  private running = false;
  private needRerun = false;
  private cancelled = false;
  private readonly finalized = new Set<string>();
  private readonly port: CouponPort;
  private readonly onChange: () => void;
  /** The coupon could not be confirmed yet (shown as "待發券"). */
  pending = false;
  /** A write is in flight (shown as "發券中…"). */
  issuing = false;
  /** Refused for the current data on this page (shown like pending: a reload or a new sync retries). */
  blocked = false;
  /** The account was deactivated or remapped: no more attempts on this page; the page asks to sign in again. */
  identityChanged = false;

  constructor(port: CouponPort, onChange: () => void) {
    this.port = port;
    this.onChange = onChange;
  }

  offer(inputs: CouponInputs): void {
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

  private async run(inputs: CouponInputs): Promise<void> {
    if (inputs.hasCoupon || !weekVerdict(inputs.weekId, inputs.docs, inputs.today).eligible) {
      if (inputs.hasCoupon) { this.pending = false; this.blocked = false; }
      return;
    }
    const key = finalKey(inputs.weekId, inputs.docs);
    if (this.finalized.has(key) || this.identityChanged) return;
    let pending = this.pending;
    let notify = true;
    this.issuing = true;
    this.onChange();
    try {
      let result = await this.port.issue(inputs.weekId);
      if (this.cancelled) return;
      if (result === "refused") {
        if (await this.port.couponExists(inputs.weekId)) result = "exists";
        else {
          if (this.cancelled) return;
          const fresh = await this.port.readDays(inputs.weekId);
          if (this.cancelled) return;
          if (weekVerdict(inputs.weekId, fresh, inputs.today).eligible) {
            result = await this.port.issue(inputs.weekId);
            if (this.cancelled) return;
            if (result === "refused" && await this.port.couponExists(inputs.weekId)) result = "exists";
          }
          if (result === "refused") { this.finalized.add(finalKey(inputs.weekId, fresh)); this.blocked = true; }
        }
      }
      if (this.cancelled) return;
      if (result === "issued" || result === "exists" || result === "refused") pending = false;
      if (result === "issued" || result === "exists") this.blocked = false;
      if (result === "unconfirmed") pending = true;
      if (result === "stale") notify = false; // the reload overlay takes over; nothing to show here
      if (result === "identity") { this.identityChanged = true; this.blocked = true; pending = false; }
    } catch {
      pending = true; // a read failed (network): the next confirmed snapshot runs again
    } finally {
      this.issuing = false;
      if (!this.cancelled) { this.pending = pending; if (notify) this.onChange(); }
    }
  }
}
