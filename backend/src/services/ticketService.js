import crypto from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { notFound, conflict, badRequest } from "../lib/errors.js";
import { displayFor, jalaliYear } from "../lib/persian.js";

const sig = (ticketId) => crypto.createHmac("sha256", env.SESSION_SECRET).update("ticket:" + ticketId).digest("base64url").slice(0, 22);
export const ticketPayload = (ticketId) => `MZ1.${ticketId}.${sig(ticketId)}`;
export const ticketNumber = (serial, startsAt) => `MZ-${jalaliYear(startsAt)}-${String(serial).padStart(6, "0")}`;

const include = {
  reservation: { select: { userId: true, contactName: true, concert: { include: { venue: true } } } },
};

async function seatOf(concertSeatId) {
  const cs = await prisma.concertSeat.findUnique({ where: { id: concertSeatId }, include: { seat: true, tier: true } });
  return { row: cs.seat.rowLabel, number: cs.seat.number, tier: cs.tier.name };
}

async function serialize(t) {
  const c = t.reservation.concert;
  return {
    id: t.id,
    number: ticketNumber(t.serial, c.startsAt),
    status: t.status,
    holderName: t.holderName,
    seat: await seatOf(t.concertSeatId),
    concert: { id: c.id, title: c.title, venue: c.venue.name, startsAt: c.startsAt, display: displayFor(c.startsAt, c.durationMinutes) },
    reservationId: t.reservationId,
  };
}

export async function listMine(userId) {
  const rows = await prisma.ticket.findMany({ where: { reservation: { userId } }, include, orderBy: { serial: "desc" }, take: 200 });
  return Promise.all(rows.map(serialize));
}

async function getOwned(userId, id) {
  const t = await prisma.ticket.findUnique({ where: { id }, include });
  if (!t || t.reservation.userId !== userId) throw notFound("بلیت پیدا نشد.", "TICKET_NOT_FOUND");
  return t;
}

export async function getMineById(userId, id) { return serialize(await getOwned(userId, id)); }

/** The QR only carries an opaque, signed ticket id — no personal data. */
export async function qrSvg(userId, id) {
  const t = await getOwned(userId, id);
  return QRCode.toString(ticketPayload(t.id), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0a08", light: "#ffffff" } });
}

/** Door scan. markUsed flips VALID→USED atomically, so a ticket can be admitted only once even with two scanners. */
export async function verifyPayload(payload, { markUsed }) {
  const m = /^MZ1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{22})$/.exec(payload);
  if (!m) throw badRequest("کد بلیت نامعتبر است.", "INVALID_TICKET_CODE");
  const [, id, given] = m;
  const a = Buffer.from(given), b = Buffer.from(sig(id));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw badRequest("کد بلیت نامعتبر است.", "INVALID_TICKET_CODE");
  const t = await prisma.ticket.findUnique({ where: { id }, include });
  if (!t) throw notFound("بلیت پیدا نشد.", "TICKET_NOT_FOUND");
  if (markUsed) {
    const r = await prisma.ticket.updateMany({ where: { id, status: "VALID" }, data: { status: "USED", usedAt: new Date() } });
    if (r.count === 0) {
      const cur = await prisma.ticket.findUnique({ where: { id } });
      throw conflict(cur.status === "USED" ? "این بلیت قبلاً استفاده شده است." : "این بلیت معتبر نیست.", cur.status === "USED" ? "TICKET_ALREADY_USED" : "TICKET_NOT_VALID");
    }
  }
  const fresh = await prisma.ticket.findUnique({ where: { id }, include });
  return serialize(fresh);
}
