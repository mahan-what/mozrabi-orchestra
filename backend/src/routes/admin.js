import { Router } from "express";
import { h } from "../lib/asyncHandler.js";
import { validate, idParam, uuidParam, pagination } from "../lib/validate.js";
import * as A from "../validators/admin.js";
import { venueBody, adminPaymentsQuery } from "../validators/venues.js";
import * as C from "../controllers/adminController.js";

/** Mounted at /api/v1/admin behind requireAdmin + the admin rate limiter + CSRF (see app.js). */
export function adminRoutes(_L) {
  const r = Router();

  r.get("/venues", h(C.venues));
  r.post("/venues", validate({ body: venueBody }), h(C.createVenue));

  r.get("/concerts", validate({ query: A.adminConcertsQuery }), h(C.concerts));
  r.post("/concerts", validate({ body: A.concertCreateBody }), h(C.createConcert));
  r.get("/concerts/:id", validate({ params: idParam }), h(C.concert));
  r.patch("/concerts/:id", validate({ params: idParam, body: A.concertUpdateBody }), h(C.updateConcert));
  r.post("/concerts/:id/archive", validate({ params: idParam }), h(C.archiveConcert));
  r.delete("/concerts/:id", validate({ params: idParam }), h(C.deleteConcert));
  r.patch("/concerts/:id/tiers/:tierId", validate({ params: A.tierParams, body: A.tierUpdateBody }), h(C.updateTier));
  r.get("/concerts/:id/seats", validate({ params: idParam }), h(C.seatMap));
  r.post("/concerts/:id/seats/block", validate({ params: idParam, body: A.seatBlockBody }), h(C.blockSeats));

  r.get("/reservations", validate({ query: A.adminReservationsQuery }), h(C.reservations));
  r.get("/reservations/:id", validate({ params: uuidParam }), h(C.reservation));
  r.post("/reservations/:id/cancel", validate({ params: uuidParam, body: A.adminCancelBody }), h(C.cancelReservation));
  r.get("/payments", validate({ query: adminPaymentsQuery }), h(C.payments));

  r.post("/tickets/verify", validate({ body: A.verifyTicketBody }), h(C.verifyTicket));

  r.get("/messages", validate({ query: A.messagesQuery }), h(C.messages));
  r.post("/messages/:id/handled", validate({ params: idParam }), h(C.handleMessage));

  const content = [
    ["members", "member", A.memberBody, [{ sortOrder: "asc" }, { id: "asc" }], "عضو"],
    ["instruments", "instrument", A.instrumentBody, [{ sortOrder: "asc" }, { id: "asc" }], "ساز"],
    ["gallery", "galleryItem", A.galleryBody, [{ sortOrder: "asc" }, { id: "asc" }], "تصویر"],
  ];
  for (const [path, model, body, orderBy, label] of content) {
    const k = C.crud(model, { orderBy, label });
    r.get(`/${path}`, h(k.list));
    r.post(`/${path}`, validate({ body }), h(k.create));
    r.get(`/${path}/:id`, validate({ params: idParam }), h(k.get));
    r.patch(`/${path}/:id`, validate({ params: idParam, body: A.partial(body) }), h(k.update));
    r.delete(`/${path}/:id`, validate({ params: idParam }), h(k.remove));
  }
  return r;
}
