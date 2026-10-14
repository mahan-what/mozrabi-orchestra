import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { fail } from "../lib/respond.js";

const make = ({ windowMs, limit, message, byUser = false }) =>
  rateLimit({
    windowMs, limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => (byUser && req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
    handler: (_req, res) => fail(res, 429, "RATE_LIMITED", message),
  });

const noop = (_req, _res, next) => next();

/** All limiters are in-memory (per process). Behind several instances use a shared store (e.g. Redis) — not implemented. */
export function buildLimiters(enabled) {
  if (!enabled) return { global: noop, auth: noop, register: noop, booking: noop, payment: noop, contact: noop, admin: noop };
  return {
    global: make({ windowMs: 60_000, limit: 300, message: "درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید." }),
    auth: make({ windowMs: 15 * 60_000, limit: 20, message: "تلاش‌های ورود بیش از حد است. بعداً دوباره امتحان کنید." }),
    register: make({ windowMs: 60 * 60_000, limit: 10, message: "تعداد ثبت‌نام از این نشانی بیش از حد است." }),
    booking: make({ windowMs: 60_000, limit: 20, byUser: true, message: "درخواست‌های رزرو بیش از حد است. کمی صبر کنید." }),
    payment: make({ windowMs: 60_000, limit: 10, byUser: true, message: "درخواست‌های پرداخت بیش از حد است. کمی صبر کنید." }),
    contact: make({ windowMs: 60 * 60_000, limit: 5, message: "تعداد پیام‌ها از این نشانی بیش از حد است." }),
    admin: make({ windowMs: 60_000, limit: 120, byUser: true, message: "درخواست‌های مدیریتی بیش از حد است." }),
  };
}
