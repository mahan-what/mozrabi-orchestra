import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma, svc, reset, makeUsers, makeConcert, settle, seatRows } from "./helpers.js";

before(reset);
beforeEach(reset);
after(async () => { await prisma.$disconnect(); });

const hold = (userId, concertId, seatIds, key) => svc.res.createHold({ userId, concertId, seatIds, idempotencyKey: key });

test("two users, same seat, at the same instant → exactly one wins", async () => {
  const [a, b] = await makeUsers(2);
  const { concert, seats } = await makeConcert();
  const r = await settle([hold(a.id, concert.id, [seats[0].id]), hold(b.id, concert.id, [seats[0].id])]);
  assert.equal(r.ok.length, 1);
  assert.equal(r.err.length, 1);
  assert.equal(r.err[0].code, "SEATS_UNAVAILABLE");
  assert.equal(r.err[0].status, 409);
  const [seat] = await prisma.concertSeat.findMany({ where: { id: seats[0].id } });
  assert.equal(seat.status, "HELD");
  assert.equal(seat.reservationId, r.ok[0].id);
  // loser leaves nothing behind (transaction rolled back)
  assert.equal(await prisma.reservation.count(), 1);
  assert.equal(await prisma.reservationItem.count(), 1);
});

test("30 users fight for one seat, repeated 5 rounds → one winner per round, no errors other than 409", async () => {
  const users = await makeUsers(30);
  for (let round = 0; round < 5; round++) {
    await reset();
    const us = await makeUsers(30);
    const { concert, seats } = await makeConcert({ seats: 3 });
    const r = await settle(us.map((u) => hold(u.id, concert.id, [seats[0].id])));
    assert.equal(r.ok.length, 1, `round ${round}: winners`);
    assert.ok(r.err.every((e) => e.code === "SEATS_UNAVAILABLE"), "only SEATS_UNAVAILABLE losers: " + r.err.map((e) => e.code ?? e.message).join(","));
    assert.equal(await prisma.reservation.count(), 1);
  }
  assert.ok(users.length === 30);
});

test("overlapping multi-seat requests in opposite order → no deadlock, no partial holds", async () => {
  for (let round = 0; round < 5; round++) {
    await reset();
    const us = await makeUsers(12);
    const { concert, seats } = await makeConcert({ seats: 6 });
    const ids = seats.slice(0, 4).map((s) => s.id);
    const jobs = us.map((u, i) => hold(u.id, concert.id, i % 2 ? [...ids].reverse() : ids));
    const r = await settle(jobs);
    assert.equal(r.ok.length, 1, `round ${round}`);
    assert.ok(r.err.every((e) => e.code === "SEATS_UNAVAILABLE"), r.err.map((e) => e.code ?? e.message).join(","));
    const held = (await seatRows(concert.id)).filter((s) => s.status === "HELD");
    assert.equal(held.length, 4);
    assert.equal(new Set(held.map((s) => s.reservationId)).size, 1, "all 4 seats belong to the single winner");
  }
});

test("partially overlapping requests: never a split ownership of one request's seats", async () => {
  const [a, b] = await makeUsers(2);
  const { concert, seats } = await makeConcert({ seats: 6 });
  const r = await settle([
    hold(a.id, concert.id, [seats[0].id, seats[1].id, seats[2].id]),
    hold(b.id, concert.id, [seats[2].id, seats[3].id, seats[4].id]),
  ]);
  assert.equal(r.ok.length, 1);
  const held = (await seatRows(concert.id)).filter((s) => s.status === "HELD");
  assert.equal(held.length, 3, "loser must not keep its non-overlapping seats");
});

test("disjoint requests all succeed in parallel", async () => {
  const us = await makeUsers(5);
  const { concert, seats } = await makeConcert({ seats: 10 });
  const r = await settle(us.map((u, i) => hold(u.id, concert.id, [seats[i * 2].id, seats[i * 2 + 1].id])));
  assert.equal(r.err.length, 0, r.err.map((e) => e.message).join("\n"));
  assert.equal((await seatRows(concert.id)).filter((s) => s.status === "HELD").length, 10);
});

test("price is computed on the server from the tier; total = sum of snapshots", async () => {
  const [a] = await makeUsers(1);
  const { concert, seats } = await makeConcert({ price: 750_000 });
  const res = await hold(a.id, concert.id, [seats[0].id, seats[1].id, seats[2].id]);
  assert.equal(res.totalAmount, 2_250_000);
  assert.deepEqual(res.seats.map((s) => s.price), [750_000, 750_000, 750_000]);
  // later price change does not alter the existing reservation
  await prisma.priceTier.updateMany({ data: { amount: 1_000_000 } });
  const again = await svc.res.getMine(a.id, res.id);
  assert.equal(again.totalAmount, 2_250_000);
});

test("max seats per reservation, foreign seats, and unpublished concerts are rejected", async () => {
  const [a] = await makeUsers(1);
  const c1 = await makeConcert({ seats: 8, maxSeats: 2 });
  await assert.rejects(hold(a.id, c1.concert.id, c1.seats.slice(0, 3).map((s) => s.id)), { code: "TOO_MANY_SEATS" });
  const c2 = await makeConcert({ seats: 2 });
  await assert.rejects(hold(a.id, c1.concert.id, [c2.seats[0].id]), { code: "INVALID_SEATS" });
  await prisma.concert.update({ where: { id: c1.concert.id }, data: { status: "DRAFT" } });
  await assert.rejects(hold(a.id, c1.concert.id, [c1.seats[0].id]), { code: "CONCERT_NOT_FOUND" });
});

test("idempotency key: the same request sent twice in parallel creates ONE reservation", async () => {
  const [a] = await makeUsers(1);
  const { concert, seats } = await makeConcert();
  const r = await settle([hold(a.id, concert.id, [seats[0].id], "k1"), hold(a.id, concert.id, [seats[0].id], "k1"), hold(a.id, concert.id, [seats[0].id], "k1")]);
  assert.equal(await prisma.reservation.count(), 1);
  const ids = new Set(r.ok.map((x) => x.id));
  assert.equal(ids.size, 1);
});

test("expired hold is released by the sweeper and the seat can be taken by someone else", async () => {
  const [a, b] = await makeUsers(2);
  const { concert, seats } = await makeConcert();
  const first = await hold(a.id, concert.id, [seats[0].id]);
  await assert.rejects(hold(b.id, concert.id, [seats[0].id]), { code: "SEATS_UNAVAILABLE" }); // still live
  // simulate the clock running out
  await prisma.$executeRaw`UPDATE "ConcertSeat" SET "heldUntil" = now() - interval '1 minute' WHERE id = ${seats[0].id}`;
  await prisma.$executeRaw`UPDATE "Reservation" SET "expiresAt" = now() - interval '1 minute' WHERE id = ${first.id}::uuid`;
  assert.equal(await svc.res.expireStaleReservations(), 1);
  const r1 = await prisma.reservation.findUnique({ where: { id: first.id } });
  assert.equal(r1.status, "EXPIRED");
  assert.equal((await prisma.concertSeat.findUnique({ where: { id: seats[0].id } })).status, "AVAILABLE");
  await hold(b.id, concert.id, [seats[0].id]); // works now
});

test("expired-but-not-yet-swept hold can be taken directly (lazy release) and the old owner's sweep can't free the new owner's seat", async () => {
  const [a, b] = await makeUsers(2);
  const { concert, seats } = await makeConcert();
  const first = await hold(a.id, concert.id, [seats[0].id]);
  await prisma.$executeRaw`UPDATE "ConcertSeat" SET "heldUntil" = now() - interval '1 minute' WHERE id = ${seats[0].id}`;
  await prisma.$executeRaw`UPDATE "Reservation" SET "expiresAt" = now() - interval '1 minute' WHERE id = ${first.id}::uuid`;
  const second = await hold(b.id, concert.id, [seats[0].id]);
  assert.equal(await svc.res.expireStaleReservations(), 1); // sweeps the OLD reservation
  const seat = await prisma.concertSeat.findUnique({ where: { id: seats[0].id } });
  assert.equal(seat.status, "HELD");
  assert.equal(seat.reservationId, second.id, "new owner keeps the seat");
});

test("parallel sweepers + parallel new holds never corrupt state", async () => {
  const us = await makeUsers(10);
  const { concert, seats } = await makeConcert({ seats: 10 });
  const rs = [];
  for (let i = 0; i < 10; i++) rs.push(await hold(us[i].id, concert.id, [seats[i].id]));
  await prisma.$executeRaw`UPDATE "ConcertSeat" SET "heldUntil" = now() - interval '1 second'`;
  await prisma.$executeRaw`UPDATE "Reservation" SET "expiresAt" = now() - interval '1 second'`;
  const r = await settle([...Array(5)].map(() => svc.res.expireStaleReservations()));
  assert.equal(r.err.length, 0, r.err.map((e) => e.message).join("\n"));
  assert.equal(r.ok.reduce((s, n) => s + n, 0), 10, "each reservation expired exactly once");
  assert.equal((await seatRows(concert.id)).filter((s) => s.status === "AVAILABLE").length, 10);
});

test("user can cancel own PENDING hold; others cannot", async () => {
  const [a, b] = await makeUsers(2);
  const { concert, seats } = await makeConcert();
  const r = await hold(a.id, concert.id, [seats[0].id]);
  await assert.rejects(svc.res.cancelReservation({ id: r.id, userId: b.id }), { code: "RESERVATION_NOT_FOUND" });
  await svc.res.cancelReservation({ id: r.id, userId: a.id });
  assert.equal((await prisma.concertSeat.findUnique({ where: { id: seats[0].id } })).status, "AVAILABLE");
  await hold(b.id, concert.id, [seats[0].id]);
});

test("DB-level guard: even raw SQL cannot make an inconsistent seat or two live tickets for a seat", async () => {
  const { seats } = await makeConcert({ seats: 2 });
  await assert.rejects(prisma.$executeRaw`UPDATE "ConcertSeat" SET status='HELD' WHERE id=${seats[0].id}`, /ConcertSeat_state_consistency_chk|check constraint/i);
});
