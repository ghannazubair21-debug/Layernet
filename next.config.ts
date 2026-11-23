import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 blocks cross-origin dev assets by default. Playwright's baseURL
  // uses 127.0.0.1 while the dev server initializes with `localhost`, so allow
  // that origin for dev-only chunks and HMR (no effect on production builds).
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
