import { describe, it, expect } from "vitest";
import { classifyIp, parseAndValidateUrl, resolvePublicIps, SsrfError } from "../src/net/ssrf.js";
import { mapLookup } from "./helpers.js";

describe("klasyfikacja adresów IP (SSRF)", () => {
  it("blokuje loopback, prywatne, link-local (metadata) IPv4", () => {
    expect(classifyIp("127.0.0.1")).not.toBeNull();
    expect(classifyIp("10.0.0.5")).not.toBeNull();
    expect(classifyIp("192.168.1.1")).not.toBeNull();
    expect(classifyIp("169.254.169.254")).not.toBeNull(); // metadata
    expect(classifyIp("100.64.0.1")).not.toBeNull(); // CGNAT
    expect(classifyIp("0.0.0.0")).not.toBeNull();
  });

  it("dopuszcza publiczny unicast IPv4", () => {
    expect(classifyIp("93.184.216.34")).toBeNull();
    expect(classifyIp("1.1.1.1")).toBeNull();
  });

  it("blokuje IPv6 loopback, ULA, link-local oraz mapowane IPv4", () => {
    expect(classifyIp("::1")).not.toBeNull();
    expect(classifyIp("fe80::1")).not.toBeNull();
    expect(classifyIp("fc00::1")).not.toBeNull();
    expect(classifyIp("::ffff:127.0.0.1")).not.toBeNull(); // mapped loopback
    expect(classifyIp("::ffff:10.0.0.1")).not.toBeNull(); // mapped private
  });

  it("dopuszcza publiczny IPv6", () => {
    expect(classifyIp("2606:4700:4700::1111")).toBeNull();
  });

  it("walidacja URL odrzuca niedozwolone schematy, porty i userinfo", () => {
    expect(() => parseAndValidateUrl("ftp://x.example/")).toThrow(SsrfError);
    expect(() => parseAndValidateUrl("https://x.example:8080/")).toThrow(SsrfError);
    expect(() => parseAndValidateUrl("https://user:pass@x.example/")).toThrow(SsrfError);
    expect(() => parseAndValidateUrl("http://x.example/")).not.toThrow();
  });

  it("literał prywatnego IP jest blokowany przed połączeniem", async () => {
    await expect(resolvePublicIps("127.0.0.1")).rejects.toBeInstanceOf(SsrfError);
    await expect(resolvePublicIps("[::1]")).rejects.toBeInstanceOf(SsrfError);
  });

  it("DNS wskazujący adres prywatny jest blokowany (rebinding)", async () => {
    const lookup = mapLookup({ "evil.example": [{ address: "10.0.0.7", family: 4 }] });
    await expect(resolvePublicIps("evil.example", lookup)).rejects.toBeInstanceOf(SsrfError);
  });

  it("niejednoznaczny DNS (część prywatna) jest blokowany", async () => {
    const lookup = mapLookup({
      "mixed.example": [
        { address: "93.184.216.34", family: 4 },
        { address: "10.1.2.3", family: 4 },
      ],
    });
    await expect(resolvePublicIps("mixed.example", lookup)).rejects.toBeInstanceOf(SsrfError);
  });

  it("DNS zwracający prywatny IPv6 jest blokowany", async () => {
    const lookup = mapLookup({ "v6.example": [{ address: "fd00::1", family: 6 }] });
    await expect(resolvePublicIps("v6.example", lookup)).rejects.toBeInstanceOf(SsrfError);
  });
});
