import * as reservations from "../services/reservationService.js";
import * as payments from "../services/paymentService.js";
import * as tickets from "../services/ticketService.js";
import { ok, created, pageMeta } from "../lib/respond.js";
import { badRequest } from "../lib/errors.js";

export async function create(req, res) {
  const key = req.get("idempotency-key");
  if (key !== undefined && !/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw badRequest("Idempotency-Key نامعتبر است.", "BAD_IDEMPOTENCY_KEY");
  const { concertId, seatIds } = req.valid.body;
  const r = await reservations.createHold({ userId: req.user.id, concertId, seatIds, idempotencyKey: key });
  return created(res, r);
}

export async function list(req, res) {
  const { page, pageSize } = req.valid.query;
  const { total, items } = await reservations.listMine(req.user.id, { page, pageSize });
  return ok(res, items, pageMeta(page, pageSize, total));
}

export const get = async (req, res) => {
  res.set("Cache-Control", "no-store");
  return ok(res, await reservations.getMine(req.user.id, req.valid.params.id));
};

export const cancel = async (req, res) => ok(res, await reservations.cancelReservation({ id: req.valid.params.id, userId: req.user.id }));

export async function startPayment(req, res) {
  const out = await payments.startPayment({ userId: req.user.id, reservationId: req.valid.params.id, contact: req.valid.body });
  return created(res, out);
}

// ---- tickets
export const myTickets = async (req, res) => ok(res, await tickets.listMine(req.user.id));
export const ticket = async (req, res) => ok(res, await tickets.getMineById(req.user.id, req.valid.params.id));
export async function ticketQr(req, res) {
  const svg = await tickets.qrSvg(req.user.id, req.valid.params.id);
  res.set({ "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, no-store" }).send(svg);
}
