/** FSD-PA: a stand-in for "firebase/app"; the public build has no Firebase project behind it. */
export function initializeApp(..._args: unknown[]): { readonly name: "local" } {
  return { name: "local" };
}
