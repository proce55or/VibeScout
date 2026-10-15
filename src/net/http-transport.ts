import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import type { LookupFunction } from "node:net";
import type { TLSSocket } from "node:tls";
import {
  normalizeHeaders,
  type Transport,
  type TransportRequest,
  type TransportResponse,
  type TlsInfo,
} from "./transport.js";

/**
 * Prawdziwy transport na node:http/https.
 *
 * Bezpieczeństwo:
 *  - połączenie następuje do ZWERYFIKOWANEGO adresu IP (pinowanie przez `lookup`),
 *    więc biblioteka nie rozwiązuje nazwy ponownie (anty-rebinding),
 *  - Host i SNI pozostają prawidłową nazwą hosta,
 *  - weryfikacja TLS jest WŁĄCZONA (rejectUnauthorized: true); przy błędzie
 *    certyfikatu nie pobieramy treści — zapisujemy tylko powód błędu,
 *  - treść dekompresujemy i tniemy do limitu (ochrona przed „zip bomb”).
 */
function cnToString(cn: string | string[] | undefined): string | null {
  if (cn === undefined) return null;
  return Array.isArray(cn) ? cn.join(", ") : cn;
}

export function createHttpTransport(): Transport {
  return async function httpTransport(req: TransportRequest): Promise<TransportResponse> {
    const isHttps = req.protocol === "https:";
    const agentLib = isHttps ? https : http;

    // Pinowanie: lookup zawsze zwraca zweryfikowany adres IP.
    const lookup: LookupFunction = (_hostname, _opts, cb) => {
      cb(null, req.pinnedIp, req.family);
    };

    return new Promise<TransportResponse>((resolve, reject) => {
      const options: https.RequestOptions = {
        protocol: req.protocol,
        host: req.hostname,
        hostname: req.hostname,
        port: req.port,
        method: req.method,
        path: req.path,
        headers: req.headers,
        lookup,
        timeout: req.timeoutMs,
        // Weryfikacja TLS WŁĄCZONA — nigdy nie wyłączamy, by pobrać treść mimo błędu.
        rejectUnauthorized: true,
        servername: isHttps ? req.hostname : undefined,
      };

      let tls: TlsInfo | null = isHttps
        ? {
            authorized: false,
            authorizationError: null,
            protocol: null,
            validFrom: null,
            validTo: null,
            subjectCN: null,
            issuerCN: null,
            altNames: [],
          }
        : null;

      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const request = agentLib.request(options, (res) => {
        // Zbierz informacje TLS z gniazda (tylko przy udanej, zweryfikowanej sesji).
        const socket = res.socket as TLSSocket;
        if (isHttps && tls && typeof socket.getPeerCertificate === "function") {
          try {
            const cert = socket.getPeerCertificate(false);
            const altNames =
              cert && (cert as { subjectaltname?: string }).subjectaltname
                ? (cert as { subjectaltname?: string })
                    .subjectaltname!.split(",")
                    .map((s) => s.trim())
                : [];
            tls = {
              authorized: socket.authorized === true,
              authorizationError: socket.authorizationError
                ? String(socket.authorizationError)
                : null,
              protocol: socket.getProtocol ? socket.getProtocol() : null,
              validFrom: cert && cert.valid_from ? cert.valid_from : null,
              validTo: cert && cert.valid_to ? cert.valid_to : null,
              subjectCN: cnToString(cert && cert.subject ? cert.subject.CN : undefined),
              issuerCN: cnToString(cert && cert.issuer ? cert.issuer.CN : undefined),
              altNames,
            };
          } catch {
            /* ignorujemy — informacje TLS pozostają częściowe */
          }
        }

        const status = res.statusCode ?? 0;
        const { headers, setCookie } = normalizeHeaders(res.headers);
        const encoding = (res.headers["content-encoding"] || "").toLowerCase();

        // Strumień dekompresji odpowiedni do Content-Encoding.
        let stream: NodeJS.ReadableStream = res;
        if (encoding.includes("br")) stream = res.pipe(zlib.createBrotliDecompress());
        else if (encoding.includes("gzip")) stream = res.pipe(zlib.createGunzip());
        else if (encoding.includes("deflate")) stream = res.pipe(zlib.createInflate());

        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;

        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          const remaining = req.maxBodyBytes - total;
          if (chunk.length >= remaining) {
            chunks.push(chunk.subarray(0, Math.max(0, remaining)));
            total += Math.max(0, remaining);
            truncated = true;
            // Przerywamy pobieranie — mamy już maksymalny dozwolony rozmiar.
            res.destroy();
            return;
          }
          chunks.push(chunk);
          total += chunk.length;
        });

        const finish = () => {
          if (settled) return;
          settled = true;
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve({
            status,
            headers,
            setCookie,
            body,
            bodyBytes: total,
            truncated,
            tls,
          });
        };

        stream.on("end", finish);
        stream.on("close", finish);
        stream.on("error", (err: NodeJS.ErrnoException) => {
          // Jeśli przerwaliśmy z powodu limitu, to nie jest błąd.
          if (truncated) finish();
          else fail(err);
        });
      });

      request.on("timeout", () => {
        request.destroy(new Error("Przekroczono limit czasu żądania (timeout)."));
      });
      request.on("error", (err: NodeJS.ErrnoException) => {
        // Błąd weryfikacji certyfikatu — zapisz powód, zwróć pseudo-odpowiedź TLS.
        const tlsErrorCodes = new Set([
          "CERT_HAS_EXPIRED",
          "DEPTH_ZERO_SELF_SIGNED_CERT",
          "SELF_SIGNED_CERT_IN_CHAIN",
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
          "ERR_TLS_CERT_ALTNAME_INVALID",
          "CERT_NOT_YET_VALID",
          "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
          "ERR_SSL_WRONG_VERSION_NUMBER",
        ]);
        const code = err.code ?? "";
        if (isHttps && (tlsErrorCodes.has(code) || /certificate|tls|ssl/i.test(err.message))) {
          if (settled) return;
          settled = true;
          resolve({
            status: 0,
            headers: {},
            setCookie: [],
            body: "",
            bodyBytes: 0,
            truncated: false,
            tls: {
              authorized: false,
              authorizationError: code || err.message,
              protocol: null,
              validFrom: null,
              validTo: null,
              subjectCN: null,
              issuerCN: null,
              altNames: [],
            },
          });
          return;
        }
        fail(err);
      });

      request.end();
    });
  };
}
