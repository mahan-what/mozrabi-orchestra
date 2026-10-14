import { env, isProd } from "../config/env.js";
import { userFromToken } from "../services/authService.js";
import { unauthorized, forbidden } from "../lib/errors.js";
import { h } from "../lib/asyncHandler.js";

// "__Host-" prefix (Secure, Path=/, no Domain) is only usable over HTTPS, so production only.
export const SESSION_COOKIE = isProd ? "__Host-mz_session" : "mz_session";

export const cookieOptions = (maxAgeMs) => ({
  httpOnly: true, // JavaScript can never read the session token
  secure: isProd || env.COOKIE_SAMESITE === "none",
  sameSite: env.COOKIE_SAMESITE,
  path: "/",
  ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

export const setSessionCookie = (res, token) => res.cookie(SESSION_COOKIE, token, cookieOptions(env.SESSION_TTL_DAYS * 86400_000));
export const clearSessionCookie = (res) => res.clearCookie(SESSION_COOKIE, cookieOptions());

/** Resolves req.user from the cookie (one indexed DB lookup, only when a cookie is present). */
export const attachUser = h(async (req, _res, next) => {
  req.sessionToken = req.cookies?.[SESSION_COOKIE];
  req.user = req.sessionToken ? await userFromToken(req.sessionToken) : null;
  next();
});

export const requireAuth = (req, _res, next) => (req.user ? next() : next(unauthorized()));
// customers and admins are separate: an ordinary user hitting /admin gets 403, anonymous gets 401
export const requireAdmin = (req, _res, next) => (!req.user ? next(unauthorized()) : req.user.role === "ADMIN" ? next() : next(forbidden("دسترسی مدیر لازم است.", "ADMIN_ONLY")));
