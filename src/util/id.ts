import { randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

/** Krótszy identyfikator do nazw plików eksportu. */
export function shortId(): string {
  return randomUUID().slice(0, 8);
}
