import { prisma } from "../db/prisma.js";
import { displayFor } from "../lib/persian.js";
import { notFound } from "../lib/errors.js";

const concertInclude = { venue: true, tiers: { orderBy: { sortOrder: "asc" } } };

/** Public shape of a concert. Dates are formatted (Jalali) on the server. */
export function serializeConcert(c, { now = new Date() } = {}) {
  const upcoming = c.startsAt > now;
  const amounts = c.tiers.map((t) => t.amount);
  return {
    id: c.id,
    title: c.title,
    summary: c.summary,
    about: c.description.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    program: c.program ?? [],
    venue: { id: c.venue.id, name: c.venue.name, city: c.venue.city },
    startsAt: c.startsAt,
    display: displayFor(c.startsAt, c.durationMinutes),
    durationMinutes: c.durationMinutes,
    status: c.status,
    phase: upcoming ? "upcoming" : "past",
    bookable: c.status === "PUBLISHED" && !c.archivedAt && upcoming,
    maxSeatsPerReservation: c.maxSeatsPerReservation,
    coverImageUrl: c.coverImageUrl,
    fromPrice: amounts.length ? Math.min(...amounts) : null,
    tiers: c.tiers.map((t) => ({ id: t.id, name: t.name, amount: t.amount, rows: t.rows })),
  };
}

export async function listConcerts({ phase, page, pageSize }) {
  const now = new Date();
  const where = {
    status: "PUBLISHED",
    archivedAt: null,
    startsAt: phase === "upcoming" ? { gt: now } : { lte: now },
  };
  const [total, rows] = await Promise.all([
    prisma.concert.count({ where }),
    prisma.concert.findMany({
      where, include: concertInclude, skip: (page - 1) * pageSize, take: pageSize,
      orderBy: { startsAt: phase === "upcoming" ? "asc" : "desc" },
    }),
  ]);
  return { total, items: rows.map((c) => serializeConcert(c, { now })) };
}

/** Published concerts only (a DRAFT must not leak). CANCELLED stays visible but not bookable. */
export async function getConcert(id) {
  const c = await prisma.concert.findFirst({
    where: { id, status: { in: ["PUBLISHED", "CANCELLED"] }, archivedAt: null },
    include: concertInclude,
  });
  if (!c) throw notFound("این اجرا پیدا نشد.", "CONCERT_NOT_FOUND");
  return serializeConcert(c);
}

/**
 * Seat map. A seat is "available" only if the DATABASE says so right now
 * (AVAILABLE, or HELD with an expired hold). Public output does not reveal who holds/bought a seat.
 */
export async function getSeatMap(concertId) {
  const concert = await getConcert(concertId);
  const rows = await prisma.$queryRaw`
    SELECT cs.id, s."rowLabel" AS row, s."rowOrder" AS "rowOrder", s.number, cs."tierId", t.amount AS price,
           (cs.status = 'AVAILABLE' OR (cs.status = 'HELD' AND cs."heldUntil" < now())) AS available
      FROM "ConcertSeat" cs
      JOIN "Seat" s ON s.id = cs."seatId"
      JOIN "PriceTier" t ON t.id = cs."tierId"
     WHERE cs."concertId" = ${concertId}
     ORDER BY s."rowOrder", s.number`;
  const byRow = new Map();
  for (const r of rows) {
    if (!byRow.has(r.row)) byRow.set(r.row, { label: r.row, seats: [] });
    byRow.get(r.row).seats.push({ id: r.id, number: r.number, tierId: r.tierId, price: r.price, available: r.available });
  }
  const rowsOut = [...byRow.values()];
  return {
    concertId,
    bookable: concert.bookable,
    maxSeatsPerReservation: concert.maxSeatsPerReservation,
    tiers: concert.tiers,
    rows: rowsOut,
    summary: { total: rows.length, available: rows.filter((r) => r.available).length },
    serverTime: new Date().toISOString(),
  };
}

export const listMembers = async () =>
  (await prisma.member.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }))
    .map((m) => ({ id: m.id, name: m.name, title: m.title, bio: m.bio, imageUrl: m.imageUrl }));

export const listInstruments = async () =>
  (await prisma.instrument.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }))
    .map((i) => ({ id: i.id, key: i.key, name: i.name, description: i.description }));

export const listGallery = async ({ limit } = {}) =>
  (await prisma.galleryItem.findMany({ where: { isPublished: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: limit }))
    .map((g) => ({ id: g.id, title: g.title, description: g.description, imageUrl: g.imageUrl }));

export const createContactMessage = (data) => prisma.contactMessage.create({ data: { name: data.name, email: data.email, phone: data.phone ?? null, message: data.message } }).then((m) => ({ id: m.id }));
