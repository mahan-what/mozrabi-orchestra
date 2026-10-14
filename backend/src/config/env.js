import "dotenv/config";
import { z } from "zod";

const bool = (def) =>
  z.preprocess((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(String(v).toLowerCase())), z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_ORIGINS: z.string().default(""),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  HOLD_MINUTES: z.coerce.number().min(1).max(60).default(10),
  PAYMENT_WINDOW_MINUTES: z.coerce.number().min(1).max(120).default(15),
  SWEEP_INTERVAL_SECONDS: z.coerce.number().min(1).max(3600).default(30),
  PAYMENT_PROVIDER: z.enum(["mock"]).default("mock"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SERVE_FRONTEND: bool(true),
  FRONTEND_DIR: z.string().default("../frontend"),
  RATE_LIMIT_DISABLED: bool(false),
  LOG_REQUESTS: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${lines}\n(see .env.example)`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

// Fail closed: the fake payment gateway must never run in production.
if (isProd && env.PAYMENT_PROVIDER === "mock") {
  throw new Error("PAYMENT_PROVIDER=mock is not allowed when NODE_ENV=production. Implement a real gateway adapter first.");
}
if (isProd && /CHANGE_ME/i.test(env.SESSION_SECRET)) {
  throw new Error("SESSION_SECRET still has the placeholder value.");
}
if (isProd && env.RATE_LIMIT_DISABLED) {
  throw new Error("RATE_LIMIT_DISABLED is not allowed in production.");
}
if (env.COOKIE_SAMESITE === "none" && !isProd) {
  // browsers require Secure with SameSite=None; allowed on localhost only by some browsers
}

export const allowedOrigins = new Set(
  [env.APP_BASE_URL, ...env.ALLOWED_ORIGINS.split(",")]
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new URL(s).origin),
);
