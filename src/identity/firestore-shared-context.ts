import { doc, getDoc, getDocFromServer, type Firestore } from "firebase/firestore";
import type { Auth } from "firebase/auth";
import { IdentityError } from "./contracts";
import type { MemberIdentity, SharedContextStore, DemoContext } from "./contracts";

interface MemberRecord {
  memberId: string;
  role: "member" | "admin";
  displayName: string;
  active: boolean;
}

interface DemoRecord {
  sessionId: string;
  scenarioNow: string;
  clockVersion: number;
  activityWeekId?: string;
}

function accountNotAllowed(): IdentityError {
  return new IdentityError("ACCOUNT_NOT_ALLOWED", "此帳號尚未開通展示權限，請聯絡產品管理者。");
}

function serviceNotConfigured(): IdentityError {
  return new IdentityError("SERVICE_NOT_CONFIGURED", "展示身分與場次尚未設定，請聯絡產品管理者。");
}

function networkUnavailable(): IdentityError {
  return new IdentityError("NETWORK_UNAVAILABLE", "目前連線不穩，請確認網路後再試。");
}

function readMember(value: unknown): MemberRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.memberId !== "string" || !data.memberId.trim() ||
    (data.role !== "member" && data.role !== "admin") ||
    typeof data.displayName !== "string" || !data.displayName.trim() ||
    typeof data.active !== "boolean"
  ) return null;
  return {
    memberId: data.memberId,
    role: data.role,
    displayName: data.displayName,
    active: data.active,
  };
}

function readDemo(value: unknown): DemoRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.sessionId !== "string" || !data.sessionId.trim() ||
    typeof data.scenarioNow !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.scenarioNow) ||
    !Number.isFinite(Date.parse(data.scenarioNow)) ||
    !Number.isSafeInteger(data.clockVersion) || Number(data.clockVersion) < 0
  ) return null;
  if (data.activityWeekId !== undefined && (typeof data.activityWeekId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.activityWeekId))) return null;
  return {
    sessionId: data.sessionId,
    scenarioNow: data.scenarioNow,
    clockVersion: Number(data.clockVersion),
    ...(data.activityWeekId === undefined ? {} : { activityWeekId: data.activityWeekId }),
  };
}

function mapFirestoreError(error: unknown): IdentityError {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (["unavailable", "deadline-exceeded", "network-request-failed"].includes(code)) return networkUnavailable();
  if (code === "permission-denied") return accountNotAllowed();
  return serviceNotConfigured();
}

/** Reads only the caller's provisioned mapping and the shared current demo context. */
export class FirestoreSharedContextStore implements SharedContextStore {
  constructor(
    private readonly auth: Auth,
    private readonly firestore: Firestore,
    private readonly serverOnly = false,
  ) {}

  async resolveAuthorizedContext(): Promise<{
    readonly authUid: string;
    readonly member: MemberIdentity;
    readonly context: DemoContext;
  }> {
    const authUid = this.auth.currentUser?.uid;
    if (!authUid) throw accountNotAllowed();

    try {
      const memberRef = doc(this.firestore, "membersByUid", authUid);
      const demoRef = doc(this.firestore, "demo", "current");
      const read = this.serverOnly ? getDocFromServer : getDoc;
      let context: DemoRecord | null = null;
      let member: MemberRecord | null = null;

      // Guard the two-document read against a concurrent scenario reset/clock update.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const before = readDemo((await read(demoRef)).data());
        const memberSnapshot = await read(memberRef);
        if (!memberSnapshot.exists()) throw accountNotAllowed();
        member = readMember(memberSnapshot.data());
        if (!member || !member.active) throw accountNotAllowed();

        const after = readDemo((await read(demoRef)).data());
        if (!before || !after) throw serviceNotConfigured();
        if (
          before.sessionId === after.sessionId &&
          before.clockVersion === after.clockVersion &&
          before.scenarioNow === after.scenarioNow
          && before.activityWeekId === after.activityWeekId
        ) {
          context = after;
          break;
        }
      }

      if (!member) throw accountNotAllowed();
      if (!context) throw new IdentityError("SESSION_CHANGED", "展示情境剛更新，請重新載入頁面。");

      // Reject a snapshot if the user changed accounts while the reads were in flight.
      if (this.auth.currentUser?.uid !== authUid) {
        throw new IdentityError("SESSION_CHANGED", "登入狀態已變更，請重新登入。");
      }

      return {
        authUid,
        member: { memberId: member.memberId, role: member.role, displayName: member.displayName },
        context,
      };
    } catch (error) {
      if (error instanceof IdentityError) throw error;
      throw mapFirestoreError(error);
    }
  }
}
