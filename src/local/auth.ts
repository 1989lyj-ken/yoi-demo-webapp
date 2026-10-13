/**
 * FSD-PA: a stand-in for "firebase/auth". The visitor is always signed in (no account, no password); the simulated
 * teammates and the simulated new member act through the same services by briefly becoming the current user.
 */
export interface User { readonly uid: string; readonly email: string }
export interface Auth { currentUser: User | null }

export const VISITOR_UID = "visitor";
const user = (uid: string): User => ({ uid, email: `${uid}@local.yoi` });
const auth: Auth = { currentUser: user(VISITOR_UID) };

export function getAuth(..._args: unknown[]): Auth { return auth; }

export function onAuthStateChanged(a: Auth, next: (user: User | null) => void): () => void {
  queueMicrotask(() => next(a.currentUser));
  return () => undefined;
}

export async function signInWithEmailAndPassword(): Promise<never> {
  throw Object.assign(new Error("公開測試版不需要登入。"), { code: "auth/operation-not-allowed" });
}

export async function signOut(): Promise<void> { /* the visitor stays; 重新開始體驗 wipes the world instead */ }

/** An Auth signed in as one simulated member (a teammate or the new member), for that member's own services. */
export function authFor(uid: string): Auth { return { currentUser: user(uid) }; }
