/**
 * Recognises a Firebase SDK error without `instanceof`. The SDK can hand back a `FirebaseError` from a
 * different copy of `@firebase/util` than the `FirestoreError` class this app imports (a verified case
 * under the Node build), which makes `instanceof FirestoreError` silently false and turns every
 * error-classification branch into dead code. The name and a string `code` are what is stable.
 */
export interface FirebaseLikeError extends Error {
  code: string;
}

export function isFirebaseError(error: unknown): error is FirebaseLikeError {
  return error instanceof Error && error.name === "FirebaseError" && typeof (error as { code?: unknown }).code === "string";
}
