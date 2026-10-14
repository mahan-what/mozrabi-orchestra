import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { conflict, notFound } from "../lib/errors.js";
import { getProvider } from "../payments/mockProvider.js";
import { withTx, lockReservation, releaseSeats } from "./reservationService.js";

const ev = (tx, paymentId, type, payload) => tx.paymentEvent.create({ data: { paymentId, type, payload: payload ?? undefined } });

/**
 * Step 1 – customer confirms contact info and goes to pay.
 * Re-checks (under a row lock) that the reservation is still PENDING and still owns its seats,
 * extends the hold to the payment window, and creates an INITIATED payment for the server-computed total.
 */
export async function startPayment({ userId, reservationId, contact }) {
  const provider = getProvider();

  // gateway call first (no DB locks held while talking to the network); an unused authority is harmless
  const pre = await prisma.reservation.findFirst({ where: { id: reservationId, userId } });
  if (!pre) throw notFound("رزرو پیدا نشد.", "RESERVATION_NOT_FOUND");
  if (pre.totalAmount <= 0) throw conflict("مبلغ رزرو نامعتبر است.", "INVALID_AMOUNT");
  const init = await provider.initiate({ amount: pre.totalAmount, reservationId });

  return withTx(async (tx) => {
    const r = await lockReservation(tx, reservationId);
    if (r.userId !== userId) throw notFound("رزرو پیدا نشد.", "RESERVATION_NOT_FOUND");
    if (r.status === "CONFIRMED") throw conflict("این رزرو قبلاً پرداخت شده است.", "ALREADY_PAID");
    if (r.status !== "PENDING") throw conflict("مهلت این رزرو تمام شده یا لغو شده است.", "RESERVATION_NOT_ACTIVE");
    if (r.totalAmount !== pre.totalAmount) throw conflict("مبلغ رزرو تغییر کرده است. دوباره تلاش کنید.", "AMOUNT_CHANGED");

    const [{ n: stillHeld }] = await tx.$queryRaw`
      SELECT count(*)::int AS n FROM "ConcertSeat" WHERE "reservationId" = ${reservationId}::uuid AND status = 'HELD'`;
    const items = await tx.reservationItem.count({ where: { reservationId } });
    if (stillHeld !== items || r.expiresAt < new Date())
      throw conflict("مهلت نگه‌داشتن صندلی‌ها تمام شده است. دوباره صندلی انتخاب کنید.", "HOLD_EXPIRED");

    const [{ t: until }] = await tx.$queryRaw`SELECT now() + make_interval(secs => ${env.PAYMENT_WINDOW_MINUTES * 60}::double precision) AS t`;
    await tx.$executeRaw`
      UPDATE "ConcertSeat" SET "heldUntil" = ${until}::timestamptz, "updatedAt" = now()
       WHERE "reservationId" = ${reservationId}::uuid AND status = 'HELD'`;
    await tx.reservation.update({
      where: { id: reservationId },
      data: { expiresAt: until, contactName: contact.contactName, contactMobile: contact.contactMobile, contactEmail: contact.contactEmail ?? null },
    });

    // an older unfinished attempt is superseded (its authority can no longer finalize anything)
    const old = await tx.payment.findMany({ where: { reservationId, status: "INITIATED" }, select: { id: true } });
    for (const p of old) {
      await tx.payment.update({ where: { id: p.id }, data: { status: "CANCELLED", failureReason: "SUPERSEDED" } });
      await ev(tx, p.id, "superseded");
    }

    const payment = await tx.payment.create({
      data: { reservationId, provider: provider.name, amount: r.totalAmount, authority: init.authority },
    });
    await ev(tx, payment.id, "initiated", { amount: r.totalAmount });
    return { paymentId: payment.id, amount: r.totalAmount, payUrl: init.payUrl, expiresAt: until };
  });
}

/**
 * Step 2 – the gateway calls back (or the browser returns). The browser's claim is NEVER trusted:
 * success is decided only by provider.verify() and an amount check against what WE stored.
 * Idempotent: replaying the same callback returns the final state without side effects.
 *
 * Outcomes: SUCCEEDED (seats SOLD, reservation CONFIRMED, tickets issued) | FAILED (customer can retry while
 * the hold lasts) | REFUND_REQUIRED (money was taken but seats are no longer ours → needs manual refund;
 * automatic refunds are NOT implemented).
 */
export async function handleCallback({ provider: providerName = "mock", authority, gatewayStatus }) {
  const payment = await prisma.payment.findUnique({ where: { provider_authority: { provider: providerName, authority } } });
  if (!payment) throw notFound("تراکنش پیدا نشد.", "PAYMENT_NOT_FOUND");
  if (payment.status !== "INITIATED") return finalView(payment.id);

  let verification = { ok: false, reason: "GATEWAY_REPORTED_FAILURE" };
  if (gatewayStatus === "OK") {
    try { verification = await getProvider().verify({ authority, amount: payment.amount }); }
    catch (e) { verification = { ok: false, reason: "VERIFY_ERROR", error: String(e.message).slice(0, 200) }; }
  }

  return withTx(async (tx) => {
    // lock order is always Reservation → Payment, everywhere
    const res = await lockReservation(tx, payment.reservationId);
    const [lockedPayment] = await tx.$queryRaw`SELECT id, status FROM "Payment" WHERE id = ${payment.id}::uuid FOR UPDATE`;
    if (lockedPayment.status !== "INITIATED") return finalView(payment.id, tx); // lost the race to a replay

    if (!verification.ok) {
      const gatewayOk = gatewayStatus === "OK";
      // verify said "not paid" although the gateway claimed OK → record, keep reservation, customer may retry
      await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: verification.reason, verifiedAt: new Date() } });
      await ev(tx, payment.id, "failed", { gatewayStatus, reason: verification.reason, gatewayOk });
      return finalView(payment.id, tx);
    }

    const items = await tx.reservationItem.findMany({ where: { reservationId: res.id }, include: { concertSeat: { include: { concert: true } } } });
    const [{ n: ours }] = await tx.$queryRaw`
      SELECT count(*)::int AS n FROM "ConcertSeat" WHERE "reservationId" = ${res.id}::uuid AND status = 'HELD'`;
    const seatsStillOurs = res.status === "PENDING" && items.length > 0 && ours === items.length;

    if (!seatsStillOurs) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUND_REQUIRED", trackingCode: verification.trackingCode, failureReason: "SEATS_NOT_HELD", verifiedAt: new Date() } });
      await ev(tx, payment.id, "refund_required", { reservationStatus: res.status, held: ours, expected: items.length });
      if (res.status === "PENDING") {
        await releaseSeats(tx, res.id);
        await tx.reservation.update({ where: { id: res.id }, data: { status: "EXPIRED" } });
      }
      return finalView(payment.id, tx);
    }

    // seats are ours → sell them. (Paid-just-after-expiry is accepted while nobody else took the seats.)
    await tx.$executeRaw`
      UPDATE "ConcertSeat" SET status = 'SOLD', "heldUntil" = NULL, "updatedAt" = now()
       WHERE "reservationId" = ${res.id}::uuid AND status = 'HELD'`;
    await tx.reservation.update({ where: { id: res.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", trackingCode: verification.trackingCode, verifiedAt: new Date() } });
    await tx.ticket.createMany({
      data: items.map((i) => ({ reservationId: res.id, concertSeatId: i.concertSeatId, holderName: res.contactName ?? "—" })),
    });
    await ev(tx, payment.id, "succeeded", { trackingCode: verification.trackingCode });
    return finalView(payment.id, tx);
  });
}

async function finalView(paymentId, db = prisma) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { reservation: { select: { id: true, status: true } } } });
  return { paymentId: p.id, status: p.status, trackingCode: p.trackingCode, reservationId: p.reservation.id, reservationStatus: p.reservation.status };
}
