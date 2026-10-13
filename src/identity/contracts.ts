/** Identity and shared-context boundaries for FSD-02. */
export type MemberRole = "member" | "admin";

export interface VerifiedAccount {
  /** Stable identity returned by the configured identity provider. */
  readonly authUid: string;
  readonly email: string;
}

export interface MemberIdentity {
  readonly memberId: string;
  readonly role: MemberRole;
  readonly displayName: string;
}

export interface DemoContext {
  readonly sessionId: string;
  readonly scenarioNow: string;
  readonly clockVersion: number;
  /** Optional until the manager updates demo/current for FSD-03B. */
  readonly activityWeekId?: string;
}

export interface IdentityProvider {
  signIn(email: string, password: string): Promise<VerifiedAccount>;
  signOut(): Promise<void>;
  currentAccount(): Promise<VerifiedAccount | null>;
}

export interface SharedContextStore {
  /**
   * Resolve the authenticated provider identity, approved member mapping, and
   * current demo context as one version-consistent authorization snapshot.
   * Implementations must resolve authUid from provider state, not caller data.
   * Every later write must re-check the current session and clock version.
   */
  resolveAuthorizedContext(): Promise<{
    readonly authUid: string;
    readonly member: MemberIdentity;
    readonly context: DemoContext;
  }>;
}

export interface AuthenticatedSession {
  readonly account: VerifiedAccount;
  readonly member: MemberIdentity;
  readonly context: DemoContext;
}

export type IdentityErrorCode =
  | "SERVICE_NOT_CONFIGURED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_NOT_ALLOWED"
  | "SESSION_CHANGED"
  | "NETWORK_UNAVAILABLE"
  | "UNKNOWN";

export class IdentityError extends Error {
  constructor(
    readonly code: IdentityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}
