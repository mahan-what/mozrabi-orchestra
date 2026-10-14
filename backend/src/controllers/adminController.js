import { prisma } from "../db/prisma.js";
import * as admin from "../services/adminService.js";
import * as tickets from "../services/ticketService.js";
import { ok, created, pageMeta } from "../lib/respond.js";
import { notFound } from "../lib/errors.js";

const paged = (res, { total, items }, { page, pageSize }) => ok(res, items, pageMeta(page, pageSize, total));

export const venues = async (_req, res) => ok(res, await admin.listVenues());
export const createVenue = async (req, res) => created(res, await admin.createVenue(req.valid.body));

export const concerts = async (req, res) => paged(res, await admin.listConcerts(req.valid.query), req.valid.query);
export const concert = async (req, res) => ok(res, await admin.getConcert(req.valid.params.id));
export const createConcert = async (req, res) => created(res, await admin.createConcert(req.valid.body));
export const updateConcert = async (req, res) => ok(res, await admin.updateConcert(req.valid.params.id, req.valid.body));
export const archiveConcert = async (req, res) => ok(res, await admin.archiveConcert(req.valid.params.id));
export const deleteConcert = async (req, res) => ok(res, await admin.deleteConcert(req.valid.params.id));
export const updateTier = async (req, res) => ok(res, await admin.updateTier(req.valid.params.id, req.valid.params.tierId, req.valid.body));
export const seatMap = async (req, res) => ok(res, await admin.adminSeatMap(req.valid.params.id));
export const blockSeats = async (req, res) => ok(res, await admin.blockSeats(req.valid.params.id, req.valid.body.seatIds, req.valid.body.action));

export const reservations = async (req, res) => paged(res, await admin.listReservations(req.valid.query), req.valid.query);
export const reservation = async (req, res) => ok(res, await admin.getReservation(req.valid.params.id));
export const cancelReservation = async (req, res) => ok(res, await admin.adminCancel(req.valid.params.id, req.valid.body.reason));
export const payments = async (req, res) => paged(res, await admin.listPayments(req.valid.query), req.valid.query);

export const messages = async (req, res) => paged(res, await admin.listMessages(req.valid.query), req.valid.query);
export const handleMessage = async (req, res) => ok(res, await admin.markMessageHandled(req.valid.params.id));

export const verifyTicket = async (req, res) => ok(res, await tickets.verifyPayload(req.valid.body.payload, { markUsed: req.valid.body.markUsed }));

/** CRUD for the simple content tables. Only whitelisted (validated) fields ever reach Prisma. */
export function crud(model, { orderBy, label }) {
  const m = () => prisma[model];
  const must = async (id) => { const row = await m().findUnique({ where: { id } }); if (!row) throw notFound(`${label} پیدا نشد.`); return row; };
  return {
    list: async (_req, res) => ok(res, await m().findMany({ orderBy })),
    get: async (req, res) => ok(res, await must(req.valid.params.id)),
    create: async (req, res) => created(res, await m().create({ data: req.valid.body })),
    update: async (req, res) => { await must(req.valid.params.id); return ok(res, await m().update({ where: { id: req.valid.params.id }, data: req.valid.body })); },
    remove: async (req, res) => { await must(req.valid.params.id); await m().delete({ where: { id: req.valid.params.id } }); return ok(res, { id: req.valid.params.id, deleted: true }); },
  };
}
