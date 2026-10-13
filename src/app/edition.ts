/** FSD-PA: true in the public test build (`vite --mode public`); the internal demo keeps every Firebase path. */
export const IS_PUBLIC = import.meta.env.MODE === "public";
