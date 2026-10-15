/** Escapowanie treści do bezpiecznego osadzania. Cudza treść = dane niezaufane. */

export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapowanie do atrybutu (to samo co wyżej, osobna nazwa dla czytelności). */
export function escapeAttr(input: string): string {
  return escapeHtml(input);
}

/** Bezpieczny href: dopuszcza tylko http/https; inne schematy neutralizuje. */
export function safeHref(input: string): string {
  try {
    const u = new URL(input);
    if (u.protocol === "http:" || u.protocol === "https:") return escapeAttr(u.toString());
  } catch {
    /* ignore */
  }
  return "#";
}
