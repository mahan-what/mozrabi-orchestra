import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma, svc, reset, makeUsers, makeConcert, settle, seatRows } from "./helpers.js";

before(reset);
beforeEach(reset);
after(async () => { await prisma.$disconnect(); });

const contact = { contactName: "علی رضایی", contactMobile: "09121234567", contactEmail: undefined };
const hold = (u, c, ids) => svc.res.createHold({ userId: u.id, concertId: c.concert.id, seatIds: ids.map((i) => c.seats[i].id) });
async function paid(userId, reservationId) {
  const p = await svc.pay.startPayment({ userId, reservationId, contact });
  const authority = new URL(p.payUrl).pathname.split("/").pop();
  svc.gw.mockProvider.simulate(authority, "paid");
  return { p, authority };
}

test("happy path: hold → pay → callback verified → seats SOLD, reservation CONFIRMED, tickets issued", async () => {
  const [u] = await makeUsers(1);
  const c = await makeConcert({ price: 500_000 });
  const r = await hold(u, c, [0, 1]);
  const { p, authority } = await paid(u.id, r.id);
  assert.equal(p.amount, 1_000_000);
  const out = await svc.pay.handleCallback({ authority, gatewayStatus: "OK" });
  assert.equal(out.status, "SUCCEEDED");
  assert.equal(out.reservationStatus, "CONFIRMED");
  assert.ok(out.trackingCode);
  assert.equal((await seatRows(c.concert.id)).filter((s) => s.status === "SOLD").length, 2);
  assert.equal(await prisma.ticket.count(), 2);
  assert.ok((await prisma.paymentEvent.count()) >= 2);
});

test("browser claims OK but the gateway never received money → FAILED, nothing sold", async () => {
  const [u] = await makeUsers(1);
  const c = await makeConcert();
  const r = await hold(u, c, [0]);
  const p = await svc.pay.startPayment({ userId: u.id, reservationId: r.id, contact });
  const authority = new URL(p.payUrl).pathname.split("/").pop();
  const out = await svc.pay.handleCallback({ authority, gatewayStatus: "OK" }); // no simulate("paid")
  assert.equal(out.status, "FAILED");
  assert.equal(out.reservationStatus, "PENDING");
  assert.equal(await prisma.ticket.count(), 0);
  assert.equal((await seatRows(c.concert.id)).filter((s) => s.status === "SOLD").length, 0);
});

test("amount mismatch at the gateway is rejected", async () => {
  const [u] = await makeUsers(1);
  const c = await makeConcert();
  const r = await hold(u, c, [0]);
  const { authority } = await paid(u.id, r.id);
  svc.gw.mockProvider._tamperAmount(authority, 1000);
  const out = await svc.pay.handleCallback({ authority, gatewayStatus: "OK" });
  assert.equal(out.status, "FAILED");
  assert.equal(out.reservationStatus, "PENDING");
});

test("customer cancels at the gateway → FAILED, customer can retry with a new payment", async () => {
  const [u] = await makeUsers(1);
  const c = await makeConcert();
  const r = await hold(u, c, [0]);
  const p1 = await svc.pay.startPayment({ userId: u.id, reservationId: r.id, contact });
  const a1 = new URL(p1.payUrl).pathname.split("/").pop();
  assert.equal((await svc.pay.handleCallback({ authority: a1, gatewayStatus: "NOK" })).status, "FAILED");
  const { authority: a2 } = await paid(u.id, r.id);
  assert.equal((await svc.pay.handleCallback({ authority: a2, gatewayStatus: "OK" })).status, "SUCCEEDED");
});

test("same callback delivered 10 times in parallel → one success, one set of tickets", async () => {
  const [u] = await makeUsers(1);
  const c = await makeConcert();
  const r = await hold(u, c, [0, 1, 2]);
  const { authority } = await paid(u.id, r.id);
  const out = await settle([...Array(10)].map(() => svc.pay.handleCallback({ authority, gatewayStatus: "OK" })));
  assert.equal(out.err.length, 0, out.err.map((e) => e.message).join("\n"));
  assert.ok(out.ok.every((o) => o.status === "SUCCEEDED"));
  assert.equal(await prisma.ticket.count(), 3);
  assert.equal(await prisma.payment.count({ where: { status: "SUCCEEDED" } }), 1);
  assert.equal(await prisma.paymentEvent.count({ where: { type: "succeeded" } }), 1);
});

test("payment arrives after the hold expired AND the seat was re-sold to someone else → REFUND_REQUIRED, seat not double-sold", async () => {
  const [a, b] = await makeUsers(2);
  const c = await makeConcert();
  const r1 = await hold(a, c, [0]);
  const { authority } = await paid(a.id, r1.id);
  // time passes: a's hold lapses, b takes the seat
  await prisma.$executeRaw`UPDATE "ConcertSeat" SET "heldUntil" = now() - interval '1 minute' WHERE status = 'HELD'`;
  await prisma.$executeRaw`UPDATE "Reservation" SET "expiresAt" = now() - interval '1 minute'`;
  const r2 = await hold(b, c, [0]);
  const out = await svc.pay.handleCallback({ authority, gatewayStatus: "OK" });
  assert.equal(out.status, "REFUND_REQUIRED");
  const seat = (await seatRows(c.concert.id))[0];
  assert.equal(seat.reservationId, r2.id, "b still owns the seat");
  assert.equal(seat.status, "HELD");
  assert.equal(await prisma.ticket.count(), 0);
});

test("late payment while nobody else took the seat is still honoured", async () => {
  const [a] = await makeUsers(1);
  const c = await makeConcert();
  const r = await hold(a, c, [0]);
  const { authority } = await paid(a.id, r.id);
  await prisma.$executeRaw`UPDATE "ConcertSeat" SET "heldUntil" = now() - interval '1 minute' WHERE status = 'HELD'`;
  await prisma.$executeRaw`UPDATE "Reservation" SET "expiresAt" = now() - interval '1 minute'`;
  const out = await svc.pay.handleCallback({ authority, gatewayStatus: "OK" });
  assert.equal(out.status, "SUCCEEDED");
});

test("late payment after the sweeper already expired the reservation → REFUND_REQUIRED", async () => {
  const [a] = await makeUsers(1);
  const c = await makeConcert();
  const r = await hold(a, c, [0]);
  const { authority } = await paid(a.id, r.id);
  await prisma.$executeRaw`UPDATE "ConcertSeat" SET "heldUntil" = now() - interval '1 minute' WHERE status = 'HELD'`;
  await prisma.$executeRaw`UPDATE "Reservation" SET "expiresAt" = now() - interval '1 minute'`;
  await svc.res.expireStaleReservations();
  const out = await svc.pay.handleCallback({ authority, gatewayStatus: "OK" });
  assert.equal(out.status, "REFUND_REQUIRED");
  assert.equal(await prisma.ticket.count(), 0);
});

test("cannot start payment for an expired hold, someone else's reservation, or twice after success", async () => {
  const [a, b] = await makeUsers(2);
  const c = await makeConcert();
  const r = await hold(a, c, [0]);
  await assert.rejects(svc.pay.startPayment({ userId: b.id, reservationId: r.id, contact }), { code: "RESERVATION_NOT_FOUND" });
  const { authority } = await paid(a.id, r.id);
  await svc.pay.handleCallback({ authority, gatewayStatus: "OK" });
  await assert.rejects(svc.pay.startPayment({ userId: a.id, reservationId: r.id, contact }), { code: "ALREADY_PAID" });
  const r2 = await hold(a, c, [1]);
  await prisma.$executeRaw`UPDATE "ConcertSeat" SET "heldUntil" = now() - interval '1 minute' WHERE status='HELD'`;
  await prisma.$executeRaw`UPDATE "Reservation" SET "expiresAt" = now() - interval '1 minute' WHERE id=${r2.id}::uuid`;
  await assert.rejects(svc.pay.startPayment({ userId: a.id, reservationId: r2.id, contact }), { code: "HOLD_EXPIRED" });
});

test("starting payment extends the hold to the payment window", async () => {
  const [a] = await makeUsers(1);
  const c = await makeConcert();
  const r = await hold(a, c, [0]);
  const before = (await seatRows(c.concert.id))[0].heldUntil;
  await svc.pay.startPayment({ userId: a.id, reservationId: r.id, contact });
  const after = (await seatRows(c.concert.id))[0].heldUntil;
  assert.ok(after > before);
});

test("cancelling a paid reservation is refused (refunds are not implemented)", async () => {
  const [a] = await makeUsers(1);
  const c = await makeConcert();
  const r = await hold(a, c, [0]);
  const { authority } = await paid(a.id, r.id);
  await svc.pay.handleCallback({ authority, gatewayStatus: "OK" });
  await assert.rejects(svc.res.cancelReservation({ id: r.id, userId: a.id }), { code: "REFUND_NOT_SUPPORTED" });
});
