import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { IdentityError } from "./contracts";
import type { IdentityProvider, VerifiedAccount } from "./contracts";

function toVerifiedAccount(user: User): VerifiedAccount {
  if (!user.email) {
    throw new IdentityError("ACCOUNT_NOT_ALLOWED", "此帳號尚未開通展示權限，請聯絡產品管理者。");
  }
  return { authUid: user.uid, email: user.email };
}

function mapFirebaseError(error: unknown): IdentityError {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"].includes(code)) {
    return new IdentityError("INVALID_CREDENTIALS", "電子郵件或密碼不正確，請再試一次。");
  }
  if (code === "auth/user-disabled") {
    return new IdentityError("ACCOUNT_NOT_ALLOWED", "此帳號尚未開通展示權限，請聯絡產品管理者。");
  }
  if (["auth/network-request-failed", "unavailable", "deadline-exceeded"].includes(code)) {
    return new IdentityError("NETWORK_UNAVAILABLE", "目前連線不穩，請確認網路後再試。");
  }
  return new IdentityError("UNKNOWN", "目前無法完成登入，請稍後再試。");
}

export class FirebaseIdentityProvider implements IdentityProvider {
  constructor(private readonly auth: Auth) {}

  async signIn(email: string, password: string): Promise<VerifiedAccount> {
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, password);
      return toVerifiedAccount(credential.user);
    } catch (error) {
      if (error instanceof IdentityError) throw error;
      throw mapFirebaseError(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      throw mapFirebaseError(error);
    }
  }

  currentAccount(): Promise<VerifiedAccount | null> {
    return new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        this.auth,
        (user) => {
          unsubscribe();
          try {
            resolve(user ? toVerifiedAccount(user) : null);
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          unsubscribe();
          reject(mapFirebaseError(error));
        },
      );
    });
  }
}
