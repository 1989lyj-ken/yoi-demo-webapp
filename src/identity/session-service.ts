import { IdentityError } from "./contracts";
import type {
  AuthenticatedSession,
  IdentityProvider,
  SharedContextStore,
} from "./contracts";

/** Coordinates the trusted provider and member/context lookup for FSD-02. */
export class SessionService {
  constructor(
    private readonly identityProvider: IdentityProvider,
    private readonly sharedContext: SharedContextStore,
  ) {}

  async signIn(email: string, password: string): Promise<AuthenticatedSession> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password.trim()) {
      throw new IdentityError("INVALID_CREDENTIALS", "請輸入電子郵件與密碼。");
    }

    const account = await this.identityProvider.signIn(normalizedEmail, password);
    try {
      const { authUid, member, context } = await this.sharedContext.resolveAuthorizedContext();
      if (authUid !== account.authUid) {
        throw new IdentityError("SESSION_CHANGED", "登入狀態已變更，請重新登入。");
      }
      return { account, member, context };
    } catch (error) {
      // Do not leave an authenticated provider session for an unlisted account
      // or when the shared demo context cannot be loaded.
      try {
        await this.identityProvider.signOut();
      } catch {
        // Keep the authorization/context error as the primary failure.
      }
      throw error;
    }
  }

  async restoreSession(): Promise<AuthenticatedSession | null> {
    const account = await this.identityProvider.currentAccount();
    if (!account) return null;

    try {
      const { authUid, member, context } = await this.sharedContext.resolveAuthorizedContext();
      if (authUid !== account.authUid) {
        throw new IdentityError("SESSION_CHANGED", "登入狀態已變更，請重新登入。");
      }
      return { account, member, context };
    } catch (error) {
      try {
        await this.identityProvider.signOut();
      } catch {
        // Keep the authorization/context error as the primary failure.
      }
      throw error;
    }
  }

  signOut(): Promise<void> {
    return this.identityProvider.signOut();
  }
}
