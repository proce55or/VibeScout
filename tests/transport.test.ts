import { describe, it, expect } from "vitest";
import http from "node:http";
import { createHttpTransport } from "../src/net/http-transport.js";

/**
 * Regresja: transport pinuje połączenie do zweryfikowanego IP. Wcześniej używał
 * własnej funkcji lookup, co psuło się z mechanizmem autoSelectFamily (Happy
 * Eyeballs) w Node ≥20 (błąd „Invalid IP address: undefined"). Atrapy transportu
 * w innych testach tego nie wykrywały — ten test używa PRAWDZIWEGO transportu.
 */
describe("createHttpTransport: pinowanie do IP (regresja Happy Eyeballs)", () => {
  it("łączy się ze zweryfikowanym IP i wysyła Host = nazwa hosta", async () => {
    const seen: { host?: string } = {};
    const server = http.createServer((req, res) => {
      seen.host = req.headers.host;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;

    try {
      const transport = createHttpTransport();
      const resp = await transport({
        protocol: "http:",
        hostname: "fake.example",
        pinnedIp: "127.0.0.1",
        family: 4,
        port,
        method: "GET",
        path: "/v0/showstories.json",
        headers: { host: "fake.example" },
        timeoutMs: 5000,
        maxBodyBytes: 100000,
      });
      expect(resp.status).toBe(200);
      expect(resp.body).toContain("ok");
      expect(seen.host).toBe("fake.example");
    } finally {
      server.close();
    }
  });

  it("odrzuca pusty pinnedIp zamiast łączyć się z undefined", async () => {
    const transport = createHttpTransport();
    await expect(
      transport({
        protocol: "http:",
        hostname: "fake.example",
        pinnedIp: "",
        family: 4,
        port: 80,
        method: "GET",
        path: "/",
        headers: {},
        timeoutMs: 2000,
        maxBodyBytes: 1000,
      }),
    ).rejects.toThrow();
  });
});
