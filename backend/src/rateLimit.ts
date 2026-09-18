import rateLimit, { type RateLimitRequestHandler, type Options } from "express-rate-limit";
import type { Request } from "express";

// Vortec Management runs behind a reverse proxy in LAN deployments
// (DEC-039/040 — `next.config.ts` `allowedDevOrigins`, `CORS_ORIGIN`).
// `trust proxy: "loopback"` tells express-rate-limit to honor the
// X-Forwarded-For header only when it comes from 127.0.0.1 / ::1, so
// external callers can't spoof a different IP to dodge the limit.
// `false` would mean only trust the immediate peer (also fine for the
// no-proxy local-dev case), but `loopback` matches the LAN-deployed
// reality in DEC-030/039.
const defaultKeyGenerator: Options["keyGenerator"] = (req: Request) => {
  // express-rate-limit v7 requires an explicit keyGenerator when
  // `trust proxy` is anything other than `false`. We use the request
  // IP, which is the source IP after Express has applied the trust
  // proxy setting above.
  return req.ip ?? "unknown";
};

// Shared factory so every endpoint that wants rate limiting gets the
// same defaults (proxy trust, key generator, error shape). See
// DEC-052 for the policy.
//
// Usage:
//   router.post("/login", createRateLimiter({ windowMs: 15*60_000, max: 5 }), handler)
export function createRateLimiter(options: { windowMs: number; max: number; message?: string }): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: "draft-7", // RateLimit-* draft-7 headers (modern)
    legacyHeaders: false, // disable the older X-RateLimit-* headers
    keyGenerator: defaultKeyGenerator,
    handler: (req, res) => {
      res.status(429).json({
        error: options.message ?? "Too many requests, please try again later",
      });
    },
  });
}
