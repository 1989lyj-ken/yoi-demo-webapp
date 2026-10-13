/** Escapes text for insertion into HTML element content or quoted attribute values. */
export function escapeHtml(value: string): string {
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => escapes[character] ?? character);
}
