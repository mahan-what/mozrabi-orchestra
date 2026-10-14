import crypto from "node:crypto";
import { env, isProd, allowedOrigins } from "../config/env.js";
import { forbidden } from "../lib/errors.js";

/**
 * CSRF defence, three layers:
 *  1. Origin check: a state-changing request from a browser must come from an allowed origin.
 *  2. Double-submit token: header X-CSRF-Token must equal the mz_csrf cookie AND carry a valid HMAC signature.
 *  3. The session cookie is SameSite (lax by default).
 * The token is also returned in the JSON body of GET /api/v1/csrf so a cross-origin SPA can read it.
 */
export const CSRF_COOKIE = isProd ? "__Host-mz_csrf" : "mz_csrf";
const mac = (nonce) => crypto.createHmac("sha256", env.SESSION_SECRET).update("csrf:" + nonce).digest("base64url");

export const issueToken = () => {
  const nonce = crypto.randomBytes(24).toString("base64url");
  return `${nonce}.${mac(nonce)}`;
};
const validSignature = (token) => {
  if (typeof token !== "string") return false;
  const [nonce, sig] = token.split(".");
  if (!nonce || !sig) return false;
  const a = Buffer.from(sig), b = Buffer.from(mac(nonce));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const csrfCookieOptions = () => ({ httpOnly: true, secure: isProd || env.COOKIE_SAMESITE === "none", sameSite: env.COOKIE_SAMESITE, path: "/", maxAge: 12 * 3600_000 });

/** GET /csrf handler */
export function csrfTokenHandler(req, res) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!validSignature(token)) {
    token = issueToken();
    res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  }
  res.json({ success: true, data: { csrfToken: token } });
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req, _res, next) {
  if (SAFE.has(req.method)) return next();

  const origin = req.get("origin");
  if (origin && origin !== "null" && !allowedOrigins.has(origin)) return next(forbidden("درخواست از مبدأ غیرمجاز.", "BAD_ORIGIN"));
  if (origin === "null") return next(forbidden("درخواست از مبدأ غیرمجاز.", "BAD_ORIGIN"));

  const header = req.get("x-csrf-token");
  const cookie = req.cookies?.[CSRF_COOKIE];
  const same = typeof header === "string" && typeof cookie === "string" && header.length === cookie.length &&
    crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
  if (!same || !validSignature(header)) return next(forbidden("توکن امنیتی نامعتبر یا منقضی است. صفحه را تازه کنید.", "CSRF_INVALID"));
  next();
}
