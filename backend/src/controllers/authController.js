import * as auth from "../services/authService.js";
import { ok, created } from "../lib/respond.js";
import { setSessionCookie, clearSessionCookie } from "../middleware/session.js";

const ctx = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") });

export async function register(req, res) {
  const { name, mobile, email, password } = req.valid.body;
  await auth.register({ name, mobile, email, password });
  const { user, token } = await auth.login({ identifier: mobile, password }, ctx(req));
  setSessionCookie(res, token);
  return created(res, { user });
}

export async function login(req, res) {
  const { user, token } = await auth.login(req.valid.body, ctx(req));
  setSessionCookie(res, token);
  return ok(res, { user });
}

export async function logout(req, res) {
  await auth.logout(req.sessionToken);
  clearSessionCookie(res);
  return ok(res, { loggedOut: true });
}

/** 200 with user:null when anonymous, so the frontend can call it on every page without console errors. */
export const me = (req, res) => ok(res, { user: req.user ? { id: req.user.id, name: req.user.name, mobile: req.user.mobile, email: req.user.email, role: req.user.role } : null });
