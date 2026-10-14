import { displayFor } from "../lib/persian.js";
import { prisma, Prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { badRequest, conflict, notFound, forbidden } from "../lib/errors.js";

const MAX_ACTIVE_HOLDS_PER_USER = 3;

/**
 * Run fn in a transaction, retrying when Postgres aborts it for deadlock / serialization (40P01 / 40001).
 * Seat rows are always locked in ascending id order, so deadlocks should not happen; this is the safety net.
 */
export async function withTx(fn, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
    } catch (e) {
      const code = e?.code === "P2034" || /40P01|40001/.test(String(e?.meta?.driverAdapterError?.cause?.originalCode ?? e?.message ?? ""));
      if (code && attempt < retries) {
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
        continue;
      }
      throw e;
    }
  }
}

/** DB clock + seconds, so expiry never depends on the app server's clock. */
async function dbNowPlus(tx, seconds) {
  const [r] = await tx.$queryRaw`SELECT now() + make_interval(secs => ${seconds}::double precision) AS t, now() AS now`;
  return { at: r.t, now: r.now };
}

/**
 * Create a temporary hold (PENDING reservation) on seats.
 * Guarantee: a seat can be held by at most one live reservation. It is enforced by
 *   1. SELECT … FOR UPDATE (ordered by id) → concurrent requests for the same seat queue up on the row lock,
 *   2. one conditional UPDATE (status AVAILABLE, or HELD but expired) evaluated AFTER the lock is obtained,
 *   3. the CHECK constraint on ConcertSeat that forbids inconsistent states,
 * and the whole thing is all-or-nothing: if any seat is unavailable the transaction rolls back.
 */
export async function createHold({ userId, concertId, seatIds, idempotencyKey }) {
  const ids = [...new Set(seatIds)].sort((a, b) => a - b);
  if (ids.length !== seatIds.length) throw badRequest("صندلی تکراری ارسال شده است.", "DUPLICATE_SEATS");

  if (idempotencyKey) {
    const prev = await prisma.reservation.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: reservationInclude,
    });
    if (prev) return serializeReservation(prev);
  }

  return withTx(async (tx) => {
    const concert = await tx.concert.findUnique({ where: { id: concertId } });
    if (!concert || concert.status !== "PUBLISHED" || concert.archivedAt) throw notFound("این اجرا پیدا نشد.", "CONCERT_NOT_FOUND");
    if (concert.startsAt <= new Date()) throw conflict("فروش بلیت این اجرا بسته شده است.", "SALES_CLOSED");
    if (ids.length > concert.maxSeatsPerReservation)
      throw badRequest(`حداکثر ${concert.maxSeatsPerReservation} صندلی در هر رزرو مجاز است.`, "TOO_MANY_SEATS");

    // limit how many live holds one account can keep (anti-hoarding)
    const live = await tx.reservation.count({ where: { userId, status: "PENDING", expiresAt: { gt: new Date() } } });
    if (live >= MAX_ACTIVE_HOLDS_PER_USER)
      throw conflict("چند رزرو باز دارید. ابتدا آن‌ها را تکمیل یا لغو کنید.", "TOO_MANY_HOLDS");

    // 1) lock the seat rows in a fixed order
    const locked = await tx.$queryRaw`
      SELECT id FROM "ConcertSeat"
      WHERE "concertId" = ${concertId} AND id = ANY(${ids}::int[])
      ORDER BY id FOR UPDATE`;
    if (locked.length !== ids.length) throw badRequest("برخی از صندلی‌ها متعلق به این اجرا نیستند.", "INVALID_SEATS");

    const { at: holdUntil } = await dbNowPlus(tx, env.HOLD_MINUTES * 60);

    let reservation;
    try {
      reservation = await tx.reservation.create({
        data: { userId, concertId, totalAmount: 0, expiresAt: holdUntil, idempotencyKey: idempotencyKey ?? null },
      });
    } catch (e) {
      if (e?.code === "P2002" && idempotencyKey) {
        // two identical requests raced; the other one won → return its result
        const prev = await prisma.reservation.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, include: reservationInclude });
        if (prev) return serializeReservation(prev);
      }
      throw e;
    }

    // 2) take them in ONE statement; re-evaluated after the lock, so a loser sees the winner's HELD state
    const taken = await tx.$queryRaw`
      UPDATE "ConcertSeat" cs
         SET status = 'HELD', "reservationId" = ${reservation.id}::uuid, "heldUntil" = ${holdUntil}::timestamptz, "updatedAt" = now()
        FROM "PriceTier" t
       WHERE cs."tierId" = t.id
         AND cs."concertId" = ${concertId}
         AND cs.id = ANY(${ids}::int[])
         AND (cs.status = 'AVAILABLE' OR (cs.status = 'HELD' AND cs."heldUntil" < now()))
      RETURNING cs.id, t.amount`;

    if (taken.length !== ids.length) {
      throw conflict("برخی از صندلی‌های انتخابی دیگر موجود نیستند. لطفاً صندلی‌های دیگری انتخاب کنید.", "SEATS_UNAVAILABLE");
      // throwing rolls the whole transaction back: no partial hold, no orphan reservation
    }

    // 3) price snapshot — computed here on the server from the tier, never from the client
    await tx.reservationItem.createMany({ data: taken.map((r) => ({ reservationId: reservation.id, concertSeatId: r.id, price: r.amount })) });
    const total = taken.reduce((s, r) => s + r.amount, 0);
    await tx.reservation.update({ where: { id: reservation.id }, data: { totalAmount: total } });

    const full = await tx.reservation.findUnique({ where: { id: reservation.id }, include: reservationInclude });
    return serializeReservation(full);
  });
}

export const reservationInclude = {
  concert: { select: { id: true, title: true, startsAt: true, venue: { select: { name: true } } } },
  items: { include: { concertSeat: { include: { seat: true, tier: { select: { name: true } } } } }, orderBy: { id: "asc" } },
  payments: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, amount: true, trackingCode: true, provider: true } },
  tickets: { select: { id: true, serial: true, status: true, concertSeatId: true } },
};

export function serializeReservation(r) {
  return {
    id: r.id,
    status: r.status,
    totalAmount: r.totalAmount,
    currency: r.currency,
    expiresAt: r.expiresAt,
    confirmedAt: r.confirmedAt,
    contact: r.contactName ? { name: r.contactName, mobile: r.contactMobile, email: r.contactEmail } : null,
    concert: r.concert && { id: r.concert.id, title: r.concert.title, startsAt: r.concert.startsAt, venue: r.concert.venue?.name, display: displayFor(r.concert.startsAt) },
    seats: r.items.map((i) => ({
      seatId: i.concertSeat.id,
      row: i.concertSeat.seat.rowLabel,
      number: i.concertSeat.seat.number,
      tier: i.concertSeat.tier.name,
      price: i.price,
    })),
    payments: r.payments,
    tickets: r.tickets,
  };
}

/** Release the seats a reservation still holds. Guarded by reservationId, so a seat that was
 *  re-taken by someone else after this hold expired is never touched. */
export async function releaseSeats(tx, reservationId) {
  await tx.$executeRaw`
    UPDATE "ConcertSeat" SET status = 'AVAILABLE', "reservationId" = NULL, "heldUntil" = NULL, "updatedAt" = now()
     WHERE "reservationId" = ${reservationId}::uuid AND status = 'HELD'`;
}

export async function lockReservation(tx, id) {
  const rows = await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw notFound("رزرو پیدا نشد.", "RESERVATION_NOT_FOUND");
  return tx.reservation.findUnique({ where: { id } });
}

export async function getMine(userId, id) {
  const r = await prisma.reservation.findFirst({ where: { id, userId }, include: reservationInclude });
  if (!r) throw notFound("رزرو پیدا نشد.", "RESERVATION_NOT_FOUND");
  return serializeReservation(r);
}

export async function listMine(userId, { page, pageSize }) {
  const where = { userId };
  const [total, rows] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({ where, include: reservationInclude, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, items: rows.map(serializeReservation) };
}

/** Cancel a PENDING reservation (owner, or admin with actor override). A CONFIRMED (paid) one cannot be cancelled here:
 *  refunds are NOT implemented, so that path is refused instead of silently losing money. */
export async function cancelReservation({ id, userId, reason = "لغو توسط کاربر", asAdmin = false }) {
  return withTx(async (tx) => {
    const r = await lockReservation(tx, id);
    if (!asAdmin && r.userId !== userId) throw notFound("رزرو پیدا نشد.", "RESERVATION_NOT_FOUND");
    if (r.status === "CANCELLED" || r.status === "EXPIRED") return { id, status: r.status };
    if (r.status === "CONFIRMED") throw forbidden("رزرو پرداخت‌شده از اینجا قابل لغو نیست (استرداد وجه هنوز پیاده‌سازی نشده است).", "REFUND_NOT_SUPPORTED");
    await releaseSeats(tx, id);
    await tx.reservation.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    return { id, status: "CANCELLED" };
  });
}

/** Release every hold whose time is up. Safe to call concurrently and repeatedly. */
export async function expireStaleReservations(limit = 200) {
  const stale = await prisma.$queryRaw`
    SELECT id FROM "Reservation" WHERE status = 'PENDING' AND "expiresAt" < now() ORDER BY "expiresAt" LIMIT ${limit}`;
  let n = 0;
  for (const { id } of stale) {
    await withTx(async (tx) => {
      const r = await lockReservation(tx, id);
      if (r.status !== "PENDING" || r.expiresAt >= new Date()) return; // paid / extended meanwhile
      await releaseSeats(tx, id);
      await tx.reservation.update({ where: { id }, data: { status: "EXPIRED" } });
      n++;
    });
  }
  return n;
}

export function startSweeper() {
  const t = setInterval(() => expireStaleReservations().catch((e) => console.error("sweeper:", e.message)), env.SWEEP_INTERVAL_SECONDS * 1000);
  t.unref();
  return () => clearInterval(t);
}

export { Prisma };
