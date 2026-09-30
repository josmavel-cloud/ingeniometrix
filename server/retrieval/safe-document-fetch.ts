import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const forbiddenV4 = new BlockList();
const forbiddenV6 = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as Array<[string, number]>) forbiddenV4.addSubnet(subnet, prefix, "ipv4");
for (const [subnet, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["2002::", 16],
] as Array<[string, number]>) forbiddenV6.addSubnet(subnet, prefix, "ipv6");

export function safeDocumentUrl(raw: string): URL {
  if (raw.length > 2048 || /[\u0000-\u001f\u007f]/.test(raw)) throw new Error("DOCUMENT_URL_UNSAFE");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("DOCUMENT_URL_UNSAFE"); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      !host.includes(".") || isIP(host) !== 0 || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
      url.port && !["80", "443"].includes(url.port)) throw new Error("DOCUMENT_URL_UNSAFE");
  return url;
}

export function publicAddress(address: string, family: number) {
  return family === 4 ? !forbiddenV4.check(address, "ipv4") :
    family === 6 ? !forbiddenV6.check(address, "ipv6") : false;
}

type FetchedDocument = { status: number; ok: boolean; contentType: string; finalUrl: string; body: Buffer };

// The resolved public address is pinned to the socket. Redirects are validated
// afresh; a DNS check followed by ordinary fetch would permit DNS rebinding.
export async function fetchPublicDocument(raw: string, headers: Record<string, string>, maxBytes: number,
  timeoutMs: number, redirects = 4): Promise<FetchedDocument> {
  let current = raw;
  for (let hop = 0; hop <= redirects; hop++) {
    const url = safeDocumentUrl(current);
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    const address = addresses.find(item => publicAddress(item.address, item.family));
    if (!address) throw new Error("DOCUMENT_HOST_NOT_PUBLIC");
    const result = await new Promise<{ status: number; contentType: string; location: string | null; body: Buffer }>((resolve, reject) => {
      const driver = url.protocol === "https:" ? httpsRequest : httpRequest;
      const req = driver(url, {
        method: "GET", headers, timeout: timeoutMs,
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
      }, response => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) { response.destroy(new Error("DOCUMENT_TOO_LARGE")); return; }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve({ status: response.statusCode ?? 0,
          contentType: String(response.headers["content-type"] ?? ""),
          location: typeof response.headers.location === "string" ? response.headers.location : null,
          body: Buffer.concat(chunks) }));
      });
      req.on("timeout", () => req.destroy(new Error("DOCUMENT_FETCH_TIMEOUT")));
      req.on("error", reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
      current = new URL(result.location, url).toString();
      continue;
    }
    return { status: result.status, ok: result.status >= 200 && result.status < 300,
      contentType: result.contentType.toLowerCase(), finalUrl: url.toString(), body: result.body };
  }
  throw new Error("DOCUMENT_REDIRECT_LIMIT");
}
