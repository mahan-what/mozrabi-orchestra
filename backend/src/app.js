import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env, isProd, allowedOrigins } from "./config/env.js";
import { attachUser, requireAdmin } from "./middleware/session.js";
import { csrfProtection } from "./middleware/csrf.js";
import { buildLimiters } from "./middleware/rateLimits.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { publicRoutes } from "./routes/public.js";
import { adminRoutes } from "./routes/admin.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** opts.rateLimit overrides RATE_LIMIT_DISABLED (used by tests). */
export function createApp(opts = {}) {
  const app = express();
  const limiters = buildLimiters(opts.rateLimit ?? !env.RATE_LIMIT_DISABLED);

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY); // only trust the proxy hops you actually have, or req.ip can be spoofed

  app.use((req, res, next) => { req.id = crypto.randomUUID(); res.set("X-Request-Id", req.id); next(); });

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ...allowedOrigins],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    strictTransportSecurity: isProd ? undefined : false,
  }));

  if (env.LOG_REQUESTS && env.NODE_ENV !== "test") {
    app.use((req, res, next) => {
      const t = Date.now();
      res.on("finish", () => console.log(`${req.id.slice(0, 8)} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`)); // path only: never log query strings / bodies
      next();
    });
  }

  // Cross-origin browsers are allowed only from ALLOWED_ORIGINS / APP_BASE_URL, with credentials.
  app.use("/api", cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key"],
    maxAge: 600,
  }));

  app.use("/api", limiters.global);
  app.use("/api", express.json({ limit: "50kb", strict: true })); // small bodies only; uploads are not supported
  app.use("/api", cookieParser());
  app.use("/api", (req, res, next) => { if (req.method !== "GET") res.set("Cache-Control", "no-store"); next(); });
  app.use("/api", attachUser);
  // The payment gateway callback and the fake gateway are exempt (they are not browser form posts of ours).
  app.use("/api", (req, res, next) => (req.path.startsWith("/v1/payments/") ? next() : csrfProtection(req, res, next)));

  app.use("/api/v1/admin", limiters.admin, requireAdmin, adminRoutes(limiters));
  app.use("/api/v1", publicRoutes(limiters));
  app.use("/api", notFoundHandler);

  if (env.SERVE_FRONTEND) {
    const dir = path.resolve(here, "..", env.FRONTEND_DIR);
    app.use(express.static(dir, { extensions: ["html"], index: "index.html", maxAge: isProd ? "1h" : 0, dotfiles: "ignore" }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
