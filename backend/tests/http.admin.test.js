import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma, svc, reset, makeConcert, startServer, Client, registered, adminClient, goodUser } from "./http.js";

let srv;
before(async () => { await reset(); srv = await startServer({ rateLimit: false }); });
beforeEach(reset);
after(async () => { await srv.close(); await prisma.$disconnect(); });

const API = "/api/v1";
const A = `${API}/admin`;

test("authorization: anonymous → 401, ordinary user → 403 on every admin route", async () => {
  const anon = new Client(srv.base);
  const user = await registered(srv.base);
  for (const [m, p] of [["GET", "/concerts"], ["POST", "/concerts"], ["GET", "/members"], ["POST", "/members"], ["GET", "/reservations"], ["POST", "/tickets/verify"], ["DELETE", "/gallery/1"], ["GET", "/payments"]]) {
    const a = await anon.call(m, A + p, { body: m === "GET" ? undefined : {} });
    const u = await user.call(m, A + p, { body: m === "GET" ? undefined : {} });
    assert.equal(a.status, 401, `${m} ${p} anon`);
    assert.equal(u.status, 403, `${m} ${p} user`);
    assert.equal(u.error.code, "ADMIN_ONLY");
  }
});

test("admin mutations are CSRF-protected", async () => {
  const ad = await adminClient(srv.base);
  const r = await ad.post(`${A}/members`, { name: "علی رضایی", title: "تار" }, { csrf: false, headers: {} });
  // the helper already holds a token but csrf:false omits the header
  assert.equal(r.status, 403);
  assert.equal(r.error.code, "CSRF_INVALID");
});

test("members CRUD: validation, partial update does NOT reset other fields, delete", async () => {
  const ad = await adminClient(srv.base);
  assert.equal((await ad.post(`${A}/members`, { name: "ع", title: "تار" })).status, 422);
  const c = await ad.post(`${A}/members`, { name: "علی رضایی", title: "نوازنده تار", sortOrder: 7, isActive: false, role: "ADMIN", id: 99 });
  assert.equal(c.status, 201);
  assert.equal(c.data.sortOrder, 7);
  assert.notEqual(c.data.id, 99, "client cannot choose the id");
  const p = await ad.patch(`${A}/members/${c.data.id}`, { name: "علی رضایی‌نژاد" });
  assert.equal(p.status, 200);
  assert.equal(p.data.sortOrder, 7, "sortOrder preserved");
  assert.equal(p.data.isActive, false, "isActive preserved");
  assert.equal((await ad.patch(`${A}/members/${c.data.id}`, {})).status, 422);
  assert.equal((await ad.patch(`${A}/members/999`, { name: "نامعتبر" })).status, 404);
  // inactive members are invisible to the public
  assert.equal((await new Client(srv.base).get(`${API}/members`)).data.length, 0);
  assert.equal((await ad.del(`${A}/members/${c.data.id}`)).status, 200);
  assert.equal((await ad.get(`${A}/members`)).data.length, 0);
});

test("instruments: unique key → 409; gallery CRUD; javascript: URLs rejected", async () => {
  const ad = await adminClient(srv.base);
  const body = { key: "tar", name: "تار", description: "ساز مضرابی" };
  assert.equal((await ad.post(`${A}/instruments`, body)).status, 201);
  assert.equal((await ad.post(`${A}/instruments`, body)).status, 409);
  assert.equal((await ad.post(`${A}/instruments`, { ...body, key: "Bad Key" })).status, 422);
  assert.equal((await ad.post(`${A}/gallery`, { title: "اجرا", imageUrl: "javascript:alert(1)" })).status, 422);
  const g = await ad.post(`${A}/gallery`, { title: "اجرای زنده", imageUrl: "https://example.com/a.jpg" });
  assert.equal(g.status, 201);
  assert.equal((await new Client(srv.base).get(`${API}/gallery`)).data.length, 1);
});

async function newConcertBody(adminC, extra = {}) {
  const venue = await adminC.post(`${A}/venues`, { name: "تالار نمایشی", city: "اصفهان", rows: [{ label: "A", count: 4 }, { label: "B", count: 4 }, { label: "C", count: 2 }] });
  assert.equal(venue.status, 201);
  assert.equal(venue.data.seatCount, 10);
  return {
    title: "شب آزمایشی", summary: "خلاصه", description: "پاراگراف اول\n\nپاراگراف دوم", venueId: venue.data.id,
    startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), durationMinutes: 100, status: "PUBLISHED",
    tiers: [{ name: "ویژه", amount: 600_000, rows: ["A"] }, { name: "عادی", amount: 400_000, rows: ["B", "C"] }], ...extra,
  };
}

test("concert create: seats generated per tier; every row must be priced once; public sees it", async () => {
  const ad = await adminClient(srv.base);
  const body = await newConcertBody(ad);
  assert.equal((await ad.post(`${A}/concerts`, { ...body, tiers: [{ name: "ویژه", amount: 600_000, rows: ["A"] }] })).status, 422); // B, C unpriced
  assert.equal((await ad.post(`${A}/concerts`, { ...body, tiers: [{ name: "x", amount: 600_000, rows: ["A", "B"] }, { name: "y", amount: 400_000, rows: ["B", "C"] }] })).status, 422);
  assert.equal((await ad.post(`${A}/concerts`, { ...body, tiers: [{ name: "x", amount: 1, rows: ["A", "B", "C"] }] })).status, 422); // price floor
  const c = await ad.post(`${A}/concerts`, body);
  assert.equal(c.status, 201);
  assert.equal(c.data.seatCounts.AVAILABLE, 10);
  assert.equal(c.data.fromPrice, 400_000);
  const pub = new Client(srv.base);
  assert.equal((await pub.get(`${API}/concerts/${c.data.id}`)).data.about.length, 2);
  const seats = await pub.get(`${API}/concerts/${c.data.id}/seats`);
  assert.equal(seats.data.rows.find((r) => r.label === "A").seats[0].price, 600_000);
});

test("concert update/publish/cancel: cancelling releases open holds and flags paid reservations for refund", async () => {
  const ad = await adminClient(srv.base);
  const c = await ad.post(`${A}/concerts`, await newConcertBody(ad, { status: "DRAFT" }));
  assert.equal((await new Client(srv.base).get(`${API}/concerts/${c.data.id}`)).status, 404, "draft is private");
  assert.equal((await ad.patch(`${A}/concerts/${c.data.id}`, { status: "PUBLISHED", title: "عنوان تازه" })).data.concert.title, "عنوان تازه");

  const seats = await prisma.concertSeat.findMany({ where: { concertId: c.data.id }, orderBy: { id: "asc" } });
  const u1 = await registered(srv.base);
  const u2 = await registered(srv.base, { ...goodUser, mobile: "09135556677", email: "b@example.com" });
  const paid = await u1.post(`${API}/reservations`, { concertId: c.data.id, seatIds: [seats[0].id] });
  const pay = await u1.post(`${API}/reservations/${paid.data.id}/payment`, { contactName: "سارا احمدی", contactMobile: "09131112233", acceptTerms: true });
  const authority = pay.data.payUrl.split("/").pop();
  svc.gw.mockProvider.simulate(authority, "paid");
  await u1.raw("GET", `${API}/payments/callback?authority=${authority}&status=OK`);
  const held = await u2.post(`${API}/reservations`, { concertId: c.data.id, seatIds: [seats[1].id] });

  assert.equal((await ad.patch(`${A}/concerts/${c.data.id}`, { status: "DRAFT" })).status, 409, "cannot un-publish with reservations");
  const x = await ad.patch(`${A}/concerts/${c.data.id}`, { status: "CANCELLED" });
  assert.equal(x.data.cancelledHolds, 1);
  assert.equal(x.data.paidReservationsNeedingManualRefund, 1);
  assert.equal((await u2.get(`${API}/reservations/${held.data.id}`)).data.status, "CANCELLED");
  assert.equal((await new Client(srv.base).get(`${API}/concerts/${c.data.id}`)).data.bookable, false);
  assert.equal((await u2.post(`${API}/reservations`, { concertId: c.data.id, seatIds: [seats[2].id] })).status, 404);
  assert.equal((await ad.patch(`${A}/concerts/${c.data.id}`, { status: "PUBLISHED" })).status, 409);
});

test("delete concert: only without history; otherwise 409 and archive instead", async () => {
  const ad = await adminClient(srv.base);
  const fresh = await ad.post(`${A}/concerts`, await newConcertBody(ad));
  const venueId = (await prisma.concert.findUnique({ where: { id: fresh.data.id } })).venueId;
  const used = await ad.post(`${A}/concerts`, { ...(await newConcertBody(ad)), venueId });
  const u = await registered(srv.base);
  const seat = await prisma.concertSeat.findFirst({ where: { concertId: used.data.id } });
  assert.equal((await u.post(`${API}/reservations`, { concertId: used.data.id, seatIds: [seat.id] })).status, 201);
  assert.equal((await ad.del(`${A}/concerts/${used.data.id}`)).status, 409);
  assert.equal((await ad.post(`${A}/concerts/${used.data.id}/archive`, {})).status, 409, "open hold blocks archive");
  assert.equal((await ad.del(`${A}/concerts/${fresh.data.id}`)).status, 200);
  assert.equal(await prisma.concertSeat.count({ where: { concertId: fresh.data.id } }), 0);
  assert.equal((await ad.get(`${A}/concerts/${fresh.data.id}`)).status, 404);
});

test("tier price change affects only future holds; seat block/unblock respects state", async () => {
  const ad = await adminClient(srv.base);
  const c = await ad.post(`${A}/concerts`, await newConcertBody(ad));
  const tier = c.data.tiers.find((t) => t.name === "عادی");
  const seats = await prisma.concertSeat.findMany({ where: { concertId: c.data.id, tierId: tier.id }, orderBy: { id: "asc" } });
  const u = await registered(srv.base);
  const r1 = await u.post(`${API}/reservations`, { concertId: c.data.id, seatIds: [seats[0].id] });
  assert.equal(r1.data.totalAmount, 400_000);
  assert.equal((await ad.patch(`${A}/concerts/${c.data.id}/tiers/${tier.id}`, { amount: 450_000 })).status, 200);
  assert.equal((await u.get(`${API}/reservations/${r1.data.id}`)).data.totalAmount, 400_000);
  assert.equal((await u.post(`${API}/reservations`, { concertId: c.data.id, seatIds: [seats[1].id] })).data.totalAmount, 450_000);
  assert.equal((await ad.patch(`${A}/concerts/${c.data.id}/tiers/9999`, { amount: 450_000 })).status, 404);

  const b = await ad.post(`${A}/concerts/${c.data.id}/seats/block`, { seatIds: [seats[0].id, seats[1].id, seats[2].id], action: "block" });
  assert.equal(b.data.changed, 1, "held seats cannot be blocked");
  assert.equal((await u.post(`${API}/reservations`, { concertId: c.data.id, seatIds: [seats[2].id] })).status, 409);
  assert.equal((await ad.post(`${A}/concerts/${c.data.id}/seats/block`, { seatIds: [seats[2].id], action: "unblock" })).data.changed, 1);
  assert.equal((await u.post(`${API}/reservations`, { concertId: c.data.id, seatIds: [seats[2].id] })).status, 201);
});

test("admin reservations: search, detail with payment events, cancel pending, refuse paid cancel; payments needing refund", async () => {
  const ad = await adminClient(srv.base);
  const k = await makeConcert({ seats: 4 });
  const u = await registered(srv.base);
  const h = await u.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] });
  const pay = await u.post(`${API}/reservations/${h.data.id}/payment`, { contactName: "سارا احمدی", contactMobile: "09131112233", acceptTerms: true });
  const authority = pay.data.payUrl.split("/").pop();
  svc.gw.mockProvider.simulate(authority, "paid");
  await u.raw("GET", `${API}/payments/callback?authority=${authority}&status=OK`);

  const list = await ad.get(`${A}/reservations?q=09131112233&status=CONFIRMED`);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].user.mobile, "09131112233");
  const d = await ad.get(`${A}/reservations/${h.data.id}`);
  assert.deepEqual(d.data.payments[0].events.map((e) => e.type), ["initiated", "succeeded"]);
  assert.equal((await ad.post(`${A}/reservations/${h.data.id}/cancel`, { reason: "درخواست مشتری" })).status, 403);
  assert.equal((await ad.post(`${A}/reservations/${h.data.id}/cancel`, { reason: "" })).status, 422);

  const h2 = await u.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[1].id] });
  assert.equal((await ad.post(`${A}/reservations/${h2.data.id}/cancel`, { reason: "درخواست مشتری" })).data.status, "CANCELLED");
  assert.equal((await ad.get(`${A}/payments?status=REFUND_REQUIRED`)).data.length, 0);
  assert.equal((await ad.get(`${A}/payments`)).data.length, 1);
});

test("ticket verification at the door: valid → ok, replay → 409, forged → 400", async () => {
  const ad = await adminClient(srv.base);
  const k = await makeConcert({ seats: 3 });
  const u = await registered(srv.base);
  const h = await u.post(`${API}/reservations`, { concertId: k.concert.id, seatIds: [k.seats[0].id] });
  const pay = await u.post(`${API}/reservations/${h.data.id}/payment`, { contactName: "سارا احمدی", contactMobile: "09131112233", acceptTerms: true });
  const authority = pay.data.payUrl.split("/").pop();
  svc.gw.mockProvider.simulate(authority, "paid");
  await u.raw("GET", `${API}/payments/callback?authority=${authority}&status=OK`);
  const t = (await u.get(`${API}/tickets`)).data[0];
  const payload = (await import("../src/services/ticketService.js")).ticketPayload(t.id);

  const peek = await ad.post(`${A}/tickets/verify`, { payload });
  assert.equal(peek.data.status, "VALID");
  const [r1, r2] = await Promise.all([ad.post(`${A}/tickets/verify`, { payload, markUsed: true }), ad.post(`${A}/tickets/verify`, { payload, markUsed: true })]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409], "two scanners at once: only one admits");
  assert.equal((await ad.post(`${A}/tickets/verify`, { payload: payload.slice(0, -3) + "AAA", markUsed: true })).status, 400);
  assert.equal((await ad.post(`${A}/tickets/verify`, { payload: "garbage-garbage", markUsed: true })).status, 400);
});

test("contact messages: admin lists and marks handled", async () => {
  const ad = await adminClient(srv.base);
  await new Client(srv.base).post(`${API}/contact`, { name: "علی", email: "ali@example.com", message: "سلام، یک پرسش دارم." });
  const l = await ad.get(`${A}/messages`);
  assert.equal(l.data.length, 1);
  assert.equal((await ad.post(`${A}/messages/${l.data[0].id}/handled`, {})).status, 200);
  assert.ok((await prisma.contactMessage.findFirst()).handledAt);
});
