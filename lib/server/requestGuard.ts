/**
 * Deployment-independent request-origin guard for API route handlers.
 *
 * Threats covered while LayerNet runs as a local/private application:
 * - DNS rebinding: a hostile site rebinds its own hostname to 127.0.0.1 and
 *   becomes "same-origin" with the local server. Its requests still carry the
 *   hostile hostname in the Host header, so the Host allowlist rejects them.
 * - Cross-site browser requests: rejected via the Origin and Fetch Metadata
 *   (Sec-Fetch-Site) headers that browsers attach and pages cannot forge.
 *
 * Forwarded-host headers (X-Forwarded-Host, Forwarded) are deliberately never
 * trusted. A public deployment must set LAYERNET_ALLOWED_HOSTS to its exact
 * canonical host(s); that is not a substitute for authentication.
 *
 * Requests from non-browser clients (no Origin / Sec-Fetch-Site) are allowed
 * when the Host is allowed, because they cannot be driven by a hostile page.
 */

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type RequestGuardResult = { ok: true } | { ok: false; status: 403; error: string };

const REJECTED: RequestGuardResult = {
  ok: false,
  status: 403,
  error: "Request origin is not allowed.",
};

/** Split "host:port" into a lower-case hostname and optional port. */
function parseHost(value: string): { hostname: string; port: string } | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || /[\s/@?#]/.test(trimmed)) return null;
  const match = /^(\[[0-9a-f:.]+\]|[^:[\]]+)(?::(\d{1,5}))?$/.exec(trimmed);
  if (!match) return null;
  return { hostname: match[1], port: match[2] ?? "" };
}

function configuredHosts(): Set<string> {
  const raw = process.env.LAYERNET_ALLOWED_HOSTS ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/** Loopback hostnames on any port, plus exact entries from LAYERNET_ALLOWED_HOSTS. */
function isAllowedHost(host: { hostname: string; port: string }, extra: Set<string>): boolean {
  if (LOOPBACK_HOSTNAMES.has(host.hostname)) return true;
  const withPort = host.port ? `${host.hostname}:${host.port}` : host.hostname;
  return extra.has(withPort) || (!host.port && extra.has(host.hostname));
}

function requestHost(request: Request): string | null {
  const header = request.headers.get("host");
  if (header !== null) return header;
  // Some runtimes (and unit tests) construct requests without a Host header;
  // fall back to the request URL, which the server derives from the connection.
  try {
    return new URL(request.url).host;
  } catch {
    return null;
  }
}

export function checkRequestOrigin(request: Request): RequestGuardResult {
  const extraHosts = configuredHosts();
  const rawHost = requestHost(request);
  const host = rawHost === null ? null : parseHost(rawHost);
  if (!host || !isAllowedHost(host, extraHosts)) return REJECTED;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") {
    return REJECTED;
  }

  const origin = request.headers.get("origin");
  if (origin !== null) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      return REJECTED; // includes the opaque "null" origin
    }
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return REJECTED;
    const originHost = parseHost(originUrl.host);
    if (!originHost || !isAllowedHost(originHost, extraHosts)) return REJECTED;
    // Same-origin requirement: the page's host must be the host it is calling.
    if (originUrl.host.toLowerCase() !== rawHost!.trim().toLowerCase()) return REJECTED;
  }

  return { ok: true };
}
