import { createHash } from "node:crypto";
import type { NextConfig } from "next";
import { THEME_INIT_SCRIPT } from "./lib/themeInitScript";

const isDev = process.env.NODE_ENV === "development";
// React needs eval in development only (error-stack reconstruction).
const devEval = isDev ? " 'unsafe-eval'" : "";
const themeScriptHash = `'sha256-${createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")}'`;

/**
 * Enforced baseline. Pages are statically prerendered, so per-request nonces
 * are not available; inline scripts/styles therefore still need
 * 'unsafe-inline'. The policy still blocks plugins, base-tag hijacking,
 * framing, cross-origin form posts, and network calls to any other origin
 * (connect-src 'self'), which limits data exfiltration from injected script.
 * Gemini is called server-side, so the browser needs no external origins.
 * upgrade-insecure-requests and HSTS stay off until a verified HTTPS origin exists.
 */
const enforcedCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Report-only strict candidate: no 'unsafe-inline'; only the known theme
 * bootstrap script is allowed by hash. Browsers log violations to the console
 * without blocking, which measures what a strict policy would break.
 */
const strictCandidateCsp = [
  "default-src 'self'",
  `script-src 'self' ${themeScriptHash}${devEval}`,
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Next 16 blocks cross-origin dev assets by default. Playwright's baseURL
  // uses 127.0.0.1 while the dev server initializes with `localhost`, so allow
  // that origin for dev-only chunks and HMR (no effect on production builds).
  allowedDevOrigins: ["127.0.0.1"],
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: enforcedCsp },
        { key: "Content-Security-Policy-Report-Only", value: strictCandidateCsp },
      ],
    },
  ],
};

export default nextConfig;
