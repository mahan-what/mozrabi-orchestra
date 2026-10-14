import crypto from "node:crypto";
import { prisma, isUniqueViolation } from "../db/prisma.js";
import { env } from "../config/env.js";
import { hashPassword, verifyPassword, DUMMY_HASH } from "../lib/password.js";
import { normalizeMobile } from "../lib/validate.js";
import { conflict, unauthorized, forbidden, AppError } from "../lib/errors.js";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");

/** Fields that may leave the server. Never passwordHash / lockout counters. */
export const publicUser = (u) => ({ id: u.id, name: u.name, mobile: u.mobile, email: u.email, role: u.role });

export async function register({ name, mobile, email, password }) {
  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({ data: { name, mobile, email: email ?? null, passwordHash } });
    return publicUser(user);
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("با این مشخصات قبلاً ثبت‌نام شده است.", "ACCOUNT_EXISTS");
    throw e;
  }
}

async function createSession(userId, { ip, userAgent } = {}) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86400_000);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, ip: ip ?? null, userAgent: userAgent?.slice(0, 300) ?? null },
  });
  return { token, expiresAt };
}

/** identifier = mobile or e-mail. Same error + same work for "no such user" and "wrong password". */
export async function login({ identifier, password }, ctx = {}) {
  const id = identifier.trim();
  const mobile = normalizeMobile(id);
  const user = await prisma.user.findFirst({
    where: mobile ? { mobile } : { email: id.toLowerCase() },
  });

  const bad = () => unauthorized("موبایل/ایمیل یا گذرواژه درست نیست.", "INVALID_CREDENTIALS");

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    throw bad();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(429, "ACCOUNT_LOCKED", "به‌دلیل تلاش‌های ناموفق متعدد، حساب موقتاً قفل شده است. بعداً دوباره تلاش کنید.");
  }

  const okPw = await verifyPassword(password, user.passwordHash);
  if (!okPw) {
    // atomic increment; lock when the threshold is reached
    const upd = await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } } });
    if (upd.failedLoginCount >= MAX_FAILED) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginCount: 0 },
      });
    }
    throw bad();
  }
  if (!user.isActive) throw forbidden("حساب شما غیرفعال شده است.", "ACCOUNT_DISABLED");

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const session = await createSession(user.id, ctx);
  return { user: publicUser(user), ...session };
}

/** Resolve a cookie token to a user, or null. */
export async function userFromToken(token) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!s || s.revokedAt || s.expiresAt <= new Date() || !s.user.isActive) return null;
  // touch at most once a minute to avoid a write per request
  if (!s.lastUsedAt || Date.now() - s.lastUsedAt.getTime() > 60_000) {
    prisma.session.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { ...publicUser(s.user), sessionId: s.id };
}

export async function logout(token) {
  if (!token) return;
  await prisma.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function logoutEverywhere(userId) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
