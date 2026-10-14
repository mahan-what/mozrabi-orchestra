import { prisma } from "../db/prisma.js";
import { badRequest, conflict, notFound, unprocessable } from "../lib/errors.js";
import { reservationInclude, serializeReservation, cancelReservation } from "./reservationService.js";
import { serializeConcert } from "./catalogService.js";

// ------------------------------------------------------------------ venues
export const listVenues = async () =>
  (await prisma.venue.findMany({ where: { isActive: true }, orderBy: { id: "asc" }, include: { _count: { select: { seats: true } } } }))
    .map((v) => ({ id: v.id, name: v.name, city: v.city, address: v.address, seatCount: v._count.seats }));

export async function createVenue({ name, city, address, rows }) {
  return prisma.$transaction(async (tx) => {
    const venue = await tx.venue.create({ data: { name, city, address: address ?? null } });
    const seats = [];
    rows.forEach((r, i) => { for (let n = 1; n <= r.count; n++) seats.push({ venueId: venue.id, rowLabel: r.label, rowOrder: i + 1, number: n }); });
    await tx.seat.createMany({ data: seats });
    return { id: venue.id, name, city, seatCount: seats.length };
  });
}

// ------------------------------------------------------------------ concerts
const full = { venue: true, tiers: { orderBy: { sortOrder: "asc" } } };

async function adminShape(c) {
  const counts = await prisma.concertSeat.groupBy({ by: ["status"], where: { concertId: c.id }, _count: true });
  const resCounts = await prisma.reservation.groupBy({ by: ["status"], where: { concertId: c.id }, _count: true });
  return {
    ...serializeConcert(c),
    archivedAt: c.archivedAt,
    seatCounts: Object.fromEntries(counts.map((x) => [x.status, x._count])),
    reservationCounts: Object.fromEntries(resCounts.map((x) => [x.status, x._count])),
  };
}

export async function listConcerts({ page, pageSize, status, includeArchived }) {
  const where = { ...(status ? { status } : {}), ...(includeArchived ? {} : { archivedAt: null }) };
  const [total, rows] = await Promise.all([
    prisma.concert.count({ where }),
    prisma.concert.findMany({ where, include: full, orderBy: { startsAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, items: await Promise.all(rows.map(adminShape)) };
}

async function load(id) {
  const c = await prisma.concert.findUnique({ where: { id }, include: full });
  if (!c) throw notFound("اجرا پیدا نشد.", "CONCERT_NOT_FOUND");
  return c;
}
export const getConcert = async (id) => adminShape(await load(id));

/** Creates the concert, its price tiers and one ConcertSeat per venue seat; every venue row must be priced exactly once. */
export async function createConcert(body) {
  const venueSeats = await prisma.seat.findMany({ where: { venueId: body.venueId }, orderBy: [{ rowOrder: "asc" }, { number: "asc" }] });
  if (!venueSeats.length) throw badRequest("سالن انتخاب‌شده وجود ندارد یا صندلی ندارد.", "VENUE_NOT_FOUND");
  const venueRows = [...new Set(venueSeats.map((s) => s.rowLabel))];
  const seen = new Map();
  body.tiers.forEach((t, i) => t.rows.forEach((r) => { if (seen.has(r)) throw unprocessable(`ردیف ${r} در بیش از یک رده‌ی قیمت آمده است.`, "TIER_ROW_DUPLICATE"); seen.set(r, i); }));
  const unknown = [...seen.keys()].filter((r) => !venueRows.includes(r));
  if (unknown.length) throw unprocessable(`ردیف‌های ${unknown.join("، ")} در این سالن نیستند.`, "TIER_ROW_UNKNOWN");
  const missing = venueRows.filter((r) => !seen.has(r));
  if (missing.length) throw unprocessable(`ردیف‌های ${missing.join("، ")} قیمت ندارند.`, "TIER_ROW_MISSING");

  const id = await prisma.$transaction(async (tx) => {
    const { tiers, ...data } = body;
    const concert = await tx.concert.create({ data: { ...data, coverImageUrl: data.coverImageUrl ?? null } });
    const created = [];
    for (const [i, t] of tiers.entries()) created.push(await tx.priceTier.create({ data: { concertId: concert.id, name: t.name, amount: t.amount, rows: t.rows, sortOrder: i } }));
    const tierOfRow = new Map();
    created.forEach((t) => t.rows.forEach((r) => tierOfRow.set(r, t.id)));
    await tx.concertSeat.createMany({ data: venueSeats.map((s) => ({ concertId: concert.id, seatId: s.id, tierId: tierOfRow.get(s.rowLabel) })) });
    return concert.id;
  }, { timeout: 30_000 });
  return getConcert(id);
}

export async function updateConcert(id, patch) {
  const c = await load(id);
  if (c.status === "CANCELLED" && patch.status && patch.status !== "CANCELLED") throw conflict("اجرای لغوشده را نمی‌توان دوباره فعال کرد.", "CONCERT_CANCELLED");
  if (patch.status === "DRAFT" && c.status === "PUBLISHED") {
    const n = await prisma.reservation.count({ where: { concertId: id, status: { in: ["PENDING", "CONFIRMED"] } } });
    if (n) throw conflict("اجرایی که رزرو فعال دارد را نمی‌توان به پیش‌نویس برگرداند.", "HAS_RESERVATIONS");
  }
  await prisma.concert.update({ where: { id }, data: patch });

  let cancelledHolds = 0, paidNeedingRefund = 0;
  if (patch.status === "CANCELLED" && c.status !== "CANCELLED") {
    const pending = await prisma.reservation.findMany({ where: { concertId: id, status: "PENDING" }, select: { id: true } });
    for (const r of pending) { await cancelReservation({ id: r.id, asAdmin: true, reason: "لغو اجرا" }); cancelledHolds++; }
    paidNeedingRefund = await prisma.reservation.count({ where: { concertId: id, status: "CONFIRMED" } });
  }
  return { concert: await getConcert(id), cancelledHolds, paidReservationsNeedingManualRefund: paidNeedingRefund };
}

export async function archiveConcert(id) {
  await load(id);
  const live = await prisma.reservation.count({ where: { concertId: id, status: "PENDING" } });
  if (live) throw conflict("ابتدا رزروهای باز این اجرا باید لغو یا تکمیل شوند.", "HAS_PENDING_RESERVATIONS");
  await prisma.concert.update({ where: { id }, data: { archivedAt: new Date() } });
  return getConcert(id);
}

/** Hard delete is only for a concert that never had any reservation (typo, abandoned draft). History is never destroyed. */
export async function deleteConcert(id) {
  await load(id);
  const n = await prisma.reservation.count({ where: { concertId: id } });
  if (n) throw conflict("این اجرا سابقه‌ی رزرو دارد و حذف نمی‌شود؛ آن را بایگانی کنید.", "HAS_HISTORY");
  await prisma.concert.delete({ where: { id } }); // seats + tiers cascade
  return { id, deleted: true };
}

export async function updateTier(concertId, tierId, patch) {
  const t = await prisma.priceTier.findFirst({ where: { id: tierId, concertId } });
  if (!t) throw notFound("رده‌ی قیمت پیدا نشد.", "TIER_NOT_FOUND");
  await prisma.priceTier.update({ where: { id: tierId }, data: patch });
  // existing reservations keep their snapshot price; only future holds use the new amount
  return getConcert(concertId);
}

export async function adminSeatMap(concertId) {
  await load(concertId);
  const rows = await prisma.$queryRaw`
    SELECT cs.id, s."rowLabel" AS row, s.number, cs."tierId", t.amount AS price, cs.status, cs."reservationId", cs."heldUntil"
      FROM "ConcertSeat" cs JOIN "Seat" s ON s.id = cs."seatId" JOIN "PriceTier" t ON t.id = cs."tierId"
     WHERE cs."concertId" = ${concertId} ORDER BY s."rowOrder", s.number`;
  return rows;
}

export async function blockSeats(concertId, seatIds, action) {
  await load(concertId);
  const ids = [...new Set(seatIds)];
  const changed = action === "block"
    ? await prisma.$queryRaw`UPDATE "ConcertSeat" SET status='BLOCKED', "updatedAt"=now() WHERE "concertId"=${concertId} AND id=ANY(${ids}::int[]) AND status='AVAILABLE' RETURNING id`
    : await prisma.$queryRaw`UPDATE "ConcertSeat" SET status='AVAILABLE', "updatedAt"=now() WHERE "concertId"=${concertId} AND id=ANY(${ids}::int[]) AND status='BLOCKED' RETURNING id`;
  return { requested: ids.length, changed: changed.length, skipped: ids.length - changed.length, note: action === "block" ? "فقط صندلی‌های آزاد مسدود می‌شوند." : "فقط صندلی‌های مسدود آزاد می‌شوند." };
}

// ------------------------------------------------------------------ reservations / payments
const adminInclude = { ...reservationInclude, user: { select: { id: true, name: true, mobile: true, email: true } } };
const adminRes = (r) => ({ ...serializeReservation(r), user: r.user, createdAt: r.createdAt, cancelReason: r.cancelReason });

export async function listReservations({ page, pageSize, status, concertId, q }) {
  const where = {
    ...(status ? { status } : {}),
    ...(concertId ? { concertId } : {}),
    ...(q ? { OR: [
      { contactName: { contains: q, mode: "insensitive" } }, { contactMobile: { contains: q } },
      { user: { mobile: { contains: q } } }, { user: { name: { contains: q, mode: "insensitive" } } },
    ] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({ where, include: adminInclude, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, items: rows.map(adminRes) };
}

export async function getReservation(id) {
  const r = await prisma.reservation.findUnique({ where: { id }, include: { ...adminInclude, payments: { orderBy: { createdAt: "desc" }, include: { events: { orderBy: { id: "asc" } } } } } });
  if (!r) throw notFound("رزرو پیدا نشد.", "RESERVATION_NOT_FOUND");
  return { ...adminRes(r), payments: r.payments.map((p) => ({ id: p.id, status: p.status, amount: p.amount, provider: p.provider, trackingCode: p.trackingCode, failureReason: p.failureReason, events: p.events.map((e) => ({ type: e.type, at: e.createdAt })) })) };
}

export const adminCancel = (id, reason) => cancelReservation({ id, asAdmin: true, reason });

export async function listPayments({ page, pageSize, status }) {
  const where = status ? { status } : {};
  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      include: { reservation: { select: { id: true, contactName: true, contactMobile: true, concertId: true } } } }),
  ]);
  return { total, items: rows.map((p) => ({ id: p.id, status: p.status, amount: p.amount, provider: p.provider, trackingCode: p.trackingCode, failureReason: p.failureReason, createdAt: p.createdAt, reservation: p.reservation })) };
}

// ------------------------------------------------------------------ messages
export async function listMessages({ page, pageSize }) {
  const [total, items] = await Promise.all([
    prisma.contactMessage.count(),
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, items };
}
export async function markMessageHandled(id) {
  const m = await prisma.contactMessage.updateMany({ where: { id, handledAt: null }, data: { handledAt: new Date() } });
  if (!m.count && !(await prisma.contactMessage.findUnique({ where: { id } }))) throw notFound("پیام پیدا نشد.");
  return { id, handled: true };
}
