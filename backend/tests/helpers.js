// Test environment. MUST be imported before any src/ module (env.js reads process.env at import time).
const base = process.env.TEST_DATABASE_URL;
if (!base) throw new Error("Set TEST_DATABASE_URL to a PostgreSQL database named mozrabi_test (tests TRUNCATE all tables).");
if (!/\/mozrabi_test\b/.test(base)) throw new Error("Refusing to run tests against a database that is not named mozrabi_test");
process.env.DATABASE_URL = base;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.PAYMENT_PROVIDER = "mock";
process.env.HOLD_MINUTES = "10";
process.env.PAYMENT_WINDOW_MINUTES = "15";

const { prisma } = await import("../src/db/prisma.js");
export { prisma };
export const svc = {
  res: await import("../src/services/reservationService.js"),
  pay: await import("../src/services/paymentService.js"),
  auth: await import("../src/services/authService.js"),
  gw: await import("../src/payments/mockProvider.js"),
};

/** Wipe everything (test database only — guarded above). */
export async function reset() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "PaymentEvent","Payment","Ticket","ReservationItem","Reservation","ConcertSeat","PriceTier","Concert","Seat","Venue","Session","User","ContactMessage","Member","Instrument","GalleryItem" RESTART IDENTITY CASCADE`,
  );
}

let u = 0;
export async function makeUsers(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    u++;
    out.push(await prisma.user.create({ data: { name: `کاربر ${u}`, mobile: `0912${String(1000000 + u)}`, passwordHash: "x" } }));
  }
  return out;
}

/** One venue, one concert (PUBLISHED, in the future), `seats` seats in row A at `price` Toman. */
export async function makeConcert({ seats = 10, price = 500_000, maxSeats = 6 } = {}) {
  const venue = await prisma.venue.create({ data: { name: "تالار آزمایشی", city: "اصفهان" } });
  const seatRows = [];
  for (let n = 1; n <= seats; n++) seatRows.push(await prisma.seat.create({ data: { venueId: venue.id, rowLabel: "A", rowOrder: 1, number: n } }));
  const concert = await prisma.concert.create({
    data: {
      title: "شب آزمایشی", summary: "s", description: "d", venueId: venue.id, durationMinutes: 90, status: "PUBLISHED",
      startsAt: new Date(Date.now() + 7 * 86400_000), maxSeatsPerReservation: maxSeats,
    },
  });
  const tier = await prisma.priceTier.create({ data: { concertId: concert.id, name: "عادی", amount: price, rows: ["A"] } });
  const cs = [];
  for (const s of seatRows) cs.push(await prisma.concertSeat.create({ data: { concertId: concert.id, seatId: s.id, tierId: tier.id } }));
  return { venue, concert, tier, seats: cs };
}

/** Run promises and return { ok: [...values], err: [...errors] } */
export async function settle(promises) {
  const r = await Promise.allSettled(promises);
  return { ok: r.filter((x) => x.status === "fulfilled").map((x) => x.value), err: r.filter((x) => x.status === "rejected").map((x) => x.reason) };
}

export async function seatRows(concertId) {
  return prisma.concertSeat.findMany({ where: { concertId }, orderBy: { id: "asc" } });
}
