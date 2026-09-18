import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables the minimal, self-contained .next/standalone output used by
  // frontend/Dockerfile's production image (docker-compose's `frontend`
  // service) — see DEC-030. Does not affect `next dev`/local `next start`.
  output: "standalone",
  // `next dev` blocks cross-origin requests to its own dev resources
  // (HMR, etc.) by default — without this, a teammate on the LAN gets a
  // page that loads but never renders anything (the initial HTML arrives,
  // but HMR/dev-resource requests get silently blocked and hydration
  // never completes). Only affects `next dev`; irrelevant in production.
  // See docs/DECISIONS.md DEC-039/DEC-040 — update this IP if it changes.
  allowedDevOrigins: ["192.168.45.178"],
};

export default nextConfig;
