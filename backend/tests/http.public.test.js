import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma, svc, reset, makeConcert, startServer, Client, registered, goodUser } from "./http.js";

let srv;
before(async () => { await reset(); srv = await startServer({ rateLimit: false }); });
beforeEach(reset);
after(async () => { await srv.close(); await prisma.$disconnect(); });

const API = "/api/v1";

// ------------------------------------------------------------------ envelope / errors
test("health + standard envelope + unknown API route → 404 JSON", async () => {
  const c = new Client(srv.base);
  const h = await c.get(`${API}/health`);
  assert.equal(h.status, 200);
  assert.equal(h.json.success, true);
  const n = await c.get(`${API}/nope`);
  assert.equal(n.status, 404);
  assert.equal(n.json.success, false);
  assert.equal(n.error.code, "ROUTE_NOT_FOUND");
});

test("security headers present, x-powered-by hidden, request id returned", async () => {
  const r = await new Client(srv.base).get(`${API}/health`);
  assert.ok(r.headers.get("content-security-policy"));
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.ok(r.headers.get("x-request-id"));
});

test("malformed JSON → 400, oversized body → 413, never a stack trace", async () => {
  const c = new Client(srv.base); await c.fetchCsrf();
  const bad = await c.post(`${API}/auth/login`, "{not json", {});
  assert.equal(bad.status, 400);
  assert.equal(bad.error.code, "INVALID_JSON");
  const big = await c.post(`${API}/contact`, { name: "x".repeat(80_000) });
  assert.equal(big.status, 413);
  assert.ok(!/at .*\.js/.test(big.text));
});

// ------------------------------------------------------------------ CSRF
test("CSRF: state-changing request without token → 403; with token → ok; bad origin → 403", async () => {
  const c = new Client(srv.base);
  const no = await c.post(`${API}/auth/login`, { identifier: "09130000000", password: "x" }, { csrf: false });
  assert.equal(no.status, 403);
  assert.equal(no.error.code, "CSRF_INVALID");
  const yes = await c.post(`${API}/auth/login`, { identifier: "09130000000", password: "x" });
  assert.equal(yes.status, 401); // got past CSRF, failed on credentials
  const evil = new Client(srv.base, { origin: "https://evil.example" }); await evil.fetchCsrf();
  const r = await evil.post(`${API}/auth/login`, { identifier: "09130000000", password: "x" });
  assert.equal(r.status, 403);
  assert.equal(r.error.code, "BAD_ORIGIN");
});

test("CSRF: forged token (valid-looking, wrong signature) is rejected", async () => {
  const c = new Client(srv.base);
  c.jar.set("mz_csrf", "AAAA.BBBB");
  const r = await c.post(`${API}/auth/login`, { identifier: "09130000000", password: "x" }, { headers: { "x-csrf-token": "AAAA.BBBB" }, csrf: false });
  assert.equal(r.status, 403);
});

// ------------------------------------------------------------------ auth
test("register → cookie is HttpOnly, session works, /me returns safe fields only", async () => {
  const c = new Client(srv.base);
  const r = await c.post(`${API}/auth/register`, goodUser);
  assert.equal(r.status, 201);
  assert.equal(r.data.user.passwordHash, undefined);
  const setCookie = (await c.raw("POST", `${API}/auth/login`, { body: { identifier: goodUser.mobile, password: goodUser.password } })).headers.getSetCookie().join("\n");
  assert.match(setCookie, /mz_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const me = await c.get(`${API}/auth/me`);
  assert.equal(me.data.user.mobile, goodUser.mobile);
  assert.deepEqual(Object.keys(me.data.user).sort(), ["email", "id", "mobile", "name", "role"]);
});

test("/me anonymous → 200 user:null; validation errors are 422 with Persian message", async () => {
  const c = new Client(srv.base);
  assert.equal((await c.get(`${API}/auth/me`)).data.user, null);
  const r = await c.post(`${API}/auth/register`, { ...goodUser, mobile: "123" });
  assert.equal(r.status, 422);
  assert.equal(r.error.code, "VALIDATION_ERROR");
  assert.ok(r.error.message.includes("موبایل"));
  const w = await c.post(`${API}/auth/register`, { ...goodUser, password: "aaaaaaaa" });
  assert.equal(w.status, 422);
});

test("duplicate registration → 409; wrong login → 401 same message; logout kills the session", async () => {
  const c = await registered(srv.base);
  const dup = await new Client(srv.base).post(`${API}/auth/register`, goodUser);
  assert.equal(dup.status, 409);
  const a = await new Client(srv.base).post(`${API}/auth/login`, { identifier: goodUser.mobile, password: "wrong-pass-1" });
  const b = await new Client(srv.base).post(`${API}/auth/login`, { identifier: "09139998877", password: "wrong-pass-1" });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.equal(a.error.message, b.error.message);
  await c.post(`${API}/auth/logout`, {});
  assert.equal((await c.get(`${API}/auth/me`)).data.user, null);
  assert.equal((await c.get(`${API}/reservations`)).status, 401);
});

test("mass assignment: a client cannot make itself ADMIN", async () => {
  const c = new Client(srv.base);
  const r = await c.post(`${API}/auth/register`, { ...goodUser, role: "ADMIN", isActive: true });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.role, "USER");
  assert.equal((await c.get(`${API}/admin/concerts`)).status, 403);
});

// ------------------------------------------------------------------ catalogue
test("concerts list / detail / seat map; DRAFT concerts never leak", async () => {
  const k = await makeConcert({ seats: 6, price: 400_000 });
  const draft = await makeConcert({ seats: 2 });
  await prisma.concert.update({ where: { id: draft.concert.id }, data: { status: "DRAFT" } });
  const c = new Client(srv.base);
  const list = await c.get(`${API}/concerts?phase=upcoming`);
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 1);
  assert.equal(list.json.meta.total, 1);
  assert.equal(list.data[0].fromPrice, 400_000);
  assert.ok(list.data[0].display.date.includes("۱۴"));
  assert.equal((await c.get(`${API}/concerts?phase=past`)).data.length, 0);
  const d = await c.get(`${API}/concerts/${k.concert.id}`);
  assert.equal(d.data.bookable, true);
  assert.equal((await c.get(`${API}/concerts/${draft.concert.id}`)).status, 404);
  assert.equal((await c.get(`${API}/concerts/abc`)).status, 422);
  const m = await c.get(`${API}/concerts/${k.concert.id}/seats`);
  assert.equal(m.data.rows[0].seats.length, 6);
  assert.equal(m.data.summary.available, 6);
  assert.equal(m.headers.get("cache-control"), "no-store");
});

test("members / instruments / gallery only return active & published rows", async () => {
  await prisma.member.createMany({ data: [{ name: "الف", title: "تار", sortOrder: 2 }, { name: "ب", title: "سنتور", sortOrder: 1 }, { name: "پنهان", title: "x", isActive: false }] });
  await prisma.instrument.create({ data: { key: "tar", name: "تار", description: "d" } });
  await prisma.galleryItem.createMany({ data: [{ title: "یک" }, { title: "پنهان", isPublished: false }] });
  const c = new Client(srv.base);
  const m = await c.get(`${API}/members`);
  assert.deepEqual(m.data.map((x) => x.name), ["ب", "الف"]);
  assert.equal((await c.get(`${API}/instruments`)).data.length, 1);
  assert.equal((await c.get(`${API}/gallery`)).data.length, 1);
});

test("contact form stores a message and validates input", async () => {
  const c = new Client(srv.base);
  assert.equal((await c.post(`${API}/contact`, { name: "علی", email: "bad", message: "سلام دوستان" })).status, 422);
  const r = await c.post(`${API}/contact`, { name: "علی", email: "ali@example.com", message: "سلام، یک پرسش دارم." });
  assert.equal(r.status, 201);
  assert.equal(await prisma.contactMessage.count(), 1);
});

// ------------------------------------------------------------------ reservations → payment → ticket (end to end over HTTP)
test("full flow over HTTP: hold → pay (mock gateway) → callback redirect → ticket + QR", async () => {
  const k = await makeConcert({ seats: 6, price: 500_000 });
  const u = await registered(srv.base);
  const seatIds = k.seats.slice(0, 2).map((s) => s.id);

  const hold = await u.post(`${API}/reservations`, { concertId: k.concert.id, seatIds, totalAmount: 1 /* ignored */ });
  assert.equal(hold.status, 201);
  assert.equal(hold.data.totalAmount, 1_000_000, "price comes from the server, not the client");
  assert.equal(hold.data.status, "PENDING");

  const map = await u.get(`${API}/concerts/${k.concert.id}/seats`);
  assert.equal(map.data.summary.available, 4);

  const pay = await u.post(`${API}/reservations/${hold.data.id}/payment`, { contactName: "سارا احمدی", contactMobile: "۰۹۱۳۱۱۱۲۲۳۳", acceptTerms: true });
  assert.equal(pay.status, 201);
  assert.equal(pay.data.amount, 1_000_000);
  const authority = pay.data.payUrl.split("/").pop();

  // gateway page then "customer pays"
  const page = await u.get(`/api/v1/payments/mock/gateway/${authority}`);
  assert.equal(page.status, 200);
  const submit = await u.raw("POST", `/api/v1/payments/mock/gateway/${authority}`, { form: { outcome: "paid" }, csrf: false });
  assert.equal(submit.status, 303);
  const cb = await u.raw("GET", submit.headers.get("location"));
  assert.equal(cb.status, 303);
  const dest = new URL(cb.headers.get("location"));
  assert.equal(dest.pathname, "/ticket.html");
  assert.equal(dest.searchParams.get("payment"), "ok");

  const after = await u.get(`${API}/reservations/${hold.data.id}`);
  assert.equal(after.data.status, "CONFIRMED");
  const tix = await u.get(`${API}/tickets`);
  assert.equal(tix.data.length, 2);
  assert.match(tix.data[0].number, /^MZ-\d{4}-\d{6}$/);
  const qr = await u.raw("GET", `${API}/tickets/${tix.data[0].id}/qr.svg`);
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get("content-type"), /image\/svg\+xml/);
  assert.match(await qr.text(), /<svg/);
});

test("payment callback replay & forged 'OK' without real payment do not sell seats", async () => {
  const k = await makeConcert({ seats: 3 });
  const u = await registered(srv.base);
  const hold = await u.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] });
  const pay = await u.post(`${API}/reservations/${hold.data.id}/payment`, { contactName: "سارا احمدی", contactMobile: "09131112233", acceptTerms: true });
  const authority = pay.data.payUrl.split("/").pop();
  const forged = await new Client(srv.base).raw("GET", `${API}/payments/callback?authority=${authority}&status=OK`);
  assert.equal(forged.status, 303);
  assert.equal(new URL(forged.headers.get("location")).searchParams.get("payment"), "failed");
  assert.equal((await u.get(`${API}/tickets`)).data.length, 0);
  assert.equal((await u.get(`${API}/reservations/${hold.data.id}`)).data.status, "PENDING");
  assert.equal((await new Client(srv.base).raw("GET", `${API}/payments/callback?authority=NOPE12345&status=OK`)).status, 404);
});

test("reservations: auth required, ownership enforced, 409 when seat taken, idempotency header", async () => {
  const k = await makeConcert({ seats: 4 });
  const anon = new Client(srv.base);
  assert.equal((await anon.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] })).status, 401);

  const a = await registered(srv.base);
  const b = await registered(srv.base, { ...goodUser, mobile: "09135556677", email: "b@example.com" });
  const r1 = await a.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] }, { headers: { "idempotency-key": "key-aaaaaaaa-1" } });
  const r1b = await a.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] }, { headers: { "idempotency-key": "key-aaaaaaaa-1" } });
  assert.equal(r1.data.id, r1b.data.id);
  const clash = await b.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] });
  assert.equal(clash.status, 409);
  assert.equal(clash.error.code, "SEATS_UNAVAILABLE");
  assert.equal((await b.get(`${API}/reservations/${r1.data.id}`)).status, 404, "b cannot read a's reservation");
  assert.equal((await b.del(`${API}/reservations/${r1.data.id}`)).status, 404);
  assert.equal((await a.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [] })).status, 422);
  assert.equal((await a.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[1].id] }, { headers: { "idempotency-key": "short" } })).status, 400);
  const del = await a.del(`${API}/reservations/${r1.data.id}`);
  assert.equal(del.data.status, "CANCELLED");
  assert.equal((await b.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] })).status, 201);
  const mine = await a.get(`${API}/reservations`);
  assert.equal(mine.json.meta.total, 1);
});

test("HTTP-level race: 15 users POST the same seat at once → exactly one 201, the rest 409", async () => {
  const k = await makeConcert({ seats: 3 });
  const users = [];
  for (let i = 0; i < 15; i++) users.push(await registered(srv.base, { ...goodUser, mobile: `0913${String(2000000 + i)}`, email: `u${i}@example.com` }));
  const res = await Promise.all(users.map((u) => u.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] })));
  const codes = res.map((r) => r.status).sort();
  assert.equal(codes.filter((c) => c === 201).length, 1, codes.join(","));
  assert.equal(codes.filter((c) => c === 409).length, 14, codes.join(","));
});

test("users cannot read each other's tickets or QR codes", async () => {
  const k = await makeConcert({ seats: 2 });
  const a = await registered(srv.base);
  const b = await registered(srv.base, { ...goodUser, mobile: "09135556677", email: "b@example.com" });
  const h = await a.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] });
  const p = await a.post(`${API}/reservations/${h.data.id}/payment`, { contactName: "سارا احمدی", contactMobile: "09131112233", acceptTerms: true });
  const authority = p.data.payUrl.split("/").pop();
  svc.gw.mockProvider.simulate(authority, "paid");
  await a.raw("GET", `${API}/payments/callback?authority=${authority}&status=OK`);
  const t = (await a.get(`${API}/tickets`)).data[0];
  assert.equal((await b.get(`${API}/tickets/${t.id}`)).status, 404);
  assert.equal((await b.raw("GET", `${API}/tickets/${t.id}/qr.svg`)).status, 404);
  assert.equal((await b.get(`${API}/tickets`)).data.length, 0);
});

test("payment contact validation: terms must be accepted, mobile must be valid", async () => {
  const k = await makeConcert({ seats: 2 });
  const u = await registered(srv.base);
  const h = await u.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] });
  assert.equal((await u.post(`${API}/reservations/${h.data.id}/payment`, { contactName: "سارا احمدی", contactMobile: "09131112233", acceptTerms: false })).status, 422);
  assert.equal((await u.post(`${API}/reservations/${h.data.id}/payment`, { contactName: "سارا احمدی", contactMobile: "12", acceptTerms: true })).status, 422);
});

// ------------------------------------------------------------------ rate limiting
test("rate limiting: login is throttled with 429 + Persian message when enabled", async () => {
  const limited = await startServer({ rateLimit: true });
  try {
    const c = new Client(limited.base);
    let last;
    for (let i = 0; i < 25; i++) last = await c.post(`${API}/auth/login`, { identifier: "09130000000", password: "x" });
    assert.equal(last.status, 429);
    assert.equal(last.error.code, "RATE_LIMITED");
  } finally { await limited.close(); }
});
