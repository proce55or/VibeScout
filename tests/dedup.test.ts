import { describe, it, expect } from "vitest";
import { normalizeAppUrl, sameApp } from "../src/classify/dedup.js";

describe("deduplikacja i normalizacja", () => {
  it("różne ścieżki na wspólnym hostingu to RÓŻNE aplikacje", () => {
    expect(sameApp("https://host.example/app-a", "https://host.example/app-b")).toBe(false);
  });

  it("różne subdomeny to różne aplikacje", () => {
    expect(sameApp("https://a.pages.dev/", "https://b.pages.dev/")).toBe(false);
  });

  it("ten sam adres z parametrami śledzącymi i fragmentem → ta sama aplikacja", () => {
    expect(sameApp("https://app.example/x?utm_source=hn#top", "https://app.example/x")).toBe(true);
  });

  it("końcowy ukośnik nie różnicuje poza korzeniem", () => {
    expect(normalizeAppUrl("https://app.example/x/").dedupKey).toBe(normalizeAppUrl("https://app.example/x").dedupKey);
  });

  it("zachowuje istotne parametry aplikacji w kluczu", () => {
    expect(sameApp("https://app.example/?id=1", "https://app.example/?id=2")).toBe(false);
  });

  it("adres z tokenem dostępu oznaczany jako wrażliwy", () => {
    const n = normalizeAppUrl("https://app.example/?access_token=secret123");
    expect(n.sensitive).toBe(true);
    expect(n.normalized).not.toContain("secret123");
  });

  it("dane logowania w URL usuwane i oznaczane", () => {
    const n = normalizeAppUrl("https://user:pass@app.example/");
    expect(n.sensitive).toBe(true);
    expect(n.normalized).not.toContain("pass");
  });
});
