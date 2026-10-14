// Real HTTP client for API tests: starts the Express app on an ephemeral port, keeps cookies, handles CSRF.
import { prisma, svc, reset, makeUsers, makeConcert } from "./helpers.js";
const { createApp } = await import("../src/app.js");
export { prisma, svc, reset, makeUsers, makeConcert };

export async function startServer(opts = { rateLimit: false }) {
  const app = createApp(opts);
  const server = await new Promise((res) => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

export class Client {
  constructor(base, { origin } = {}) { this.base = base; this.jar = new Map(); this.csrf = null; this.origin = origin; }

  #store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /^\s*expires=/i.test(a) && new Date(a.split("=")[1]) < new Date()) || attrs.some((a) => /^\s*max-age=0/i.test(a));
      if (expired || value === "") this.jar.delete(name); else this.jar.set(name, value);
    }
  }
  get cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }

  async raw(method, path, { body, headers = {}, csrf = true, form } = {}) {
    if (csrf && !["GET", "HEAD"].includes(method) && !this.csrf && !headers["x-csrf-token"]) await this.fetchCsrf();
    const h = { ...headers };
    if (this.cookieHeader) h.cookie = this.cookieHeader;
    if (csrf && this.csrf && !("x-csrf-token" in h)) h["x-csrf-token"] = this.csrf;
    if (this.origin && !("origin" in h)) h.origin = this.origin;
    let payload;
    if (form) { h["content-type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { h["content-type"] ??= "application/json"; payload = typeof body === "string" ? body : JSON.stringify(body); }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: "manual" });
    this.#store(res);
    return res;
  }
  async fetchCsrf() {
    const res = await this.raw("GET", "/api/v1/csrf", { csrf: false });
    this.csrf = (await res.json()).data.csrfToken;
  }
  async call(method, path, opts) {
    const res = await this.raw(method, path, opts);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, headers: res.headers, json, text, data: json?.data, error: json?.error };
  }
  get = (p, o) => this.call("GET", p, o);
  post = (p, body, o) => this.call("POST", p, { ...o, body });
  patch = (p, body, o) => this.call("PATCH", p, { ...o, body });
  put = (p, body, o) => this.call("PUT", p, { ...o, body });
  del = (p, o) => this.call("DELETE", p, o);
}

export const goodUser = { name: "سارا احمدی", mobile: "09131112233", email: "sara@example.com", password: "S3cure-pass!" };

export async function registered(base, user = goodUser) {
  const c = new Client(base);
  const r = await c.post("/api/v1/auth/register", user);
  if (r.status !== 201) throw new Error("register failed " + JSON.stringify(r.json));
  return c;
}

export async function adminClient(base) {
  const { hashPassword } = await import("../src/lib/password.js");
  await prisma.user.create({ data: { name: "مدیر", mobile: "09120000000", email: "admin@example.com", role: "ADMIN", passwordHash: await hashPassword("Adm1n-pass-123") } });
  const c = new Client(base);
  const r = await c.post("/api/v1/auth/login", { identifier: "09120000000", password: "Adm1n-pass-123" });
  if (r.status !== 200) throw new Error("admin login failed");
  return c;
}
