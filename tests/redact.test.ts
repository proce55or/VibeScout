import { describe, it, expect } from "vitest";
import { redactUrl, redactSetCookie, redactText, isSensitiveParam } from "../src/util/redact.js";

describe("redakcja sekretów", () => {
  it("maskuje wrażliwe parametry URL", () => {
    expect(isSensitiveParam("access_token")).toBe(true);
    expect(isSensitiveParam("id")).toBe(false);
    const u = redactUrl("https://x.example/?access_token=abc123&id=5");
    expect(u).toContain("id=5");
    expect(u).not.toContain("abc123");
  });

  it("redaguje Set-Cookie do samych atrybutów (bez wartości)", () => {
    const r = redactSetCookie("session=supersecret; Path=/; Secure; HttpOnly; Domain=x.example");
    expect(r).not.toContain("supersecret");
    expect(r).toContain("Secure");
    expect(r).toContain("HttpOnly");
    expect(r).not.toContain("x.example"); // Domain odrzucone
  });

  it("maskuje tokeny, JWT i e-maile w tekście", () => {
    const t = redactText("key sk-ABCDEFGHIJKLMNOP token eyJhbGciOi.AAAAAAAAAA.BBBBB mail a@b.com");
    expect(t).not.toContain("sk-ABCDEFGHIJKLMNOP");
    expect(t).toContain("[zredagowano");
    expect(t).not.toContain("a@b.com");
  });
});
