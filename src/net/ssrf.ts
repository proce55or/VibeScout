import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

/**
 * Ochrona przed SSRF i DNS rebinding.
 *
 * Zasady:
 *  - dopuszczamy wyłącznie http/https na portach 80/443 (lub domyślnym),
 *  - odrzucamy dane logowania w URL i niebezpieczne schematy,
 *  - rozwiązujemy nazwę samodzielnie i sprawdzamy KAŻDY adres (IPv4 i IPv6),
 *  - blokujemy adresy prywatne, loopback, link-local (w tym metadata 169.254.169.254),
 *    multicast, zarezerwowane, unikalne lokalne (ULA) oraz ich odpowiedniki IPv6,
 *  - przy niejednoznacznym wyniku (część adresów publiczna, część nie) PRZERYWAMY,
 *  - połączenie następuje do ZWERYFIKOWANEGO adresu IP (pinowanie), z zachowaniem
 *    prawidłowego Host/SNI — biblioteka nie rozwiązuje nazwy ponownie bez kontroli.
 */

export class SsrfError extends Error {
  constructor(
    message: string,
    readonly code:
      | "bad_scheme"
      | "bad_port"
      | "userinfo"
      | "no_host"
      | "blocked_ip"
      | "dns_failed"
      | "ambiguous_dns"
      | "invalid_ip",
  ) {
    super(message);
    this.name = "SsrfError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_PORTS = new Set(["", "80", "443"]);

export interface ValidatedTarget {
  url: URL;
  hostname: string;
  /** Zweryfikowane publiczne adresy IP, do których WOLNO się połączyć. */
  publicIps: string[];
  family: 4 | 6;
}

/**
 * Wstrzykiwalna funkcja DNS. W programie korzysta z node:dns, w testach z fixture.
 * UWAGA: wstrzyknięcie DNS NIE omija klasyfikacji IP — każdy zwrócony adres (oraz
 * każdy literał IP) przechodzi przez classifyIp, więc blokada adresów prywatnych
 * działa tak samo w testach, jak w programie.
 */
export type DnsLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const nodeLookup: DnsLookup = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

/** Sprawdza składnię i politykę URL (bez DNS). Rzuca SsrfError przy naruszeniu. */
export function parseAndValidateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError(`Nieprawidłowy URL: ${raw}`, "no_host");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfError(`Niedozwolony schemat: ${url.protocol}`, "bad_scheme");
  }
  if (url.username !== "" || url.password !== "") {
    throw new SsrfError("URL zawiera dane logowania (userinfo) — odrzucono.", "userinfo");
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new SsrfError(`Niedozwolony port: ${url.port}`, "bad_port");
  }
  if (!url.hostname) {
    throw new SsrfError("Brak hosta w URL.", "no_host");
  }
  return url;
}

/**
 * Klasyfikuje pojedynczy adres IP. Zwraca null, jeśli adres jest dozwolony
 * (publiczny unicast), albo powód blokady.
 */
export function classifyIp(ipText: string): string | null {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ipText);
  } catch {
    return "nie-adres-IP";
  }
  // Adres IPv6 opakowujący IPv4 (::ffff:a.b.c.d) — sprawdzamy jako IPv4.
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      return classifyIp(v6.toIPv4Address().toString());
    }
  }
  const range = addr.range();
  // Dozwolony jest WYŁĄCZNIE publiczny unicast. Wszystko inne (loopback,
  // private, linkLocal, uniqueLocal, multicast, reserved, 6to4, teredo,
  // carrierGradeNat, unspecified, broadcast...) jest blokowane.
  if (range !== "unicast") {
    return range;
  }
  return null;
}

/**
 * Rozwiązuje nazwę i zwraca listę zweryfikowanych publicznych adresów IP.
 * Dla literału IP pomija DNS. Blokuje przy jakimkolwiek niepublicznym adresie.
 */
export async function resolvePublicIps(
  hostname: string,
  lookup: DnsLookup = nodeLookup,
): Promise<{ ips: string[]; family: 4 | 6 }> {
  // Literał IP?
  if (ipaddr.isValid(hostname)) {
    const reason = classifyIp(hostname);
    if (reason) {
      throw new SsrfError(`Adres zablokowany (${reason}): ${hostname}`, "blocked_ip");
    }
    const fam = ipaddr.parse(hostname).kind() === "ipv6" ? 6 : 4;
    return { ips: [hostname], family: fam };
  }
  // Nietypowe reprezentacje w nawiasach [..] dla IPv6 literału w hostname.
  const stripped = hostname.replace(/^\[|\]$/g, "");
  if (stripped !== hostname && ipaddr.isValid(stripped)) {
    return resolvePublicIps(stripped, lookup);
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(hostname);
  } catch (err) {
    throw new SsrfError(`Nie udało się rozwiązać nazwy: ${hostname}`, "dns_failed");
  }
  if (records.length === 0) {
    throw new SsrfError(`Brak adresów DNS dla: ${hostname}`, "dns_failed");
  }
  const publicIps: string[] = [];
  const blocked: string[] = [];
  for (const rec of records) {
    const reason = classifyIp(rec.address);
    if (reason) blocked.push(`${rec.address} (${reason})`);
    else publicIps.push(rec.address);
  }
  // Niejednoznaczny wynik: część adresów niepubliczna → przerwij (anty-rebinding).
  if (blocked.length > 0) {
    throw new SsrfError(
      `Niejednoznaczny/zablokowany DNS dla ${hostname}: ${blocked.join(", ")}`,
      publicIps.length > 0 ? "ambiguous_dns" : "blocked_ip",
    );
  }
  const first = publicIps[0];
  if (first === undefined) {
    throw new SsrfError(`Brak publicznych adresów dla: ${hostname}`, "blocked_ip");
  }
  const family = ipaddr.parse(first).kind() === "ipv6" ? 6 : 4;
  return { ips: publicIps, family };
}

/** Pełna walidacja celu: składnia URL + polityka + DNS. */
export async function validateTarget(raw: string, lookup?: DnsLookup): Promise<ValidatedTarget> {
  const url = parseAndValidateUrl(raw);
  const { ips, family } = await resolvePublicIps(url.hostname, lookup);
  return { url, hostname: url.hostname, publicIps: ips, family };
}
