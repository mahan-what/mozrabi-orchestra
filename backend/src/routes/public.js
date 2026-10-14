import { Router } from "express";
import express from "express";
import { h } from "../lib/asyncHandler.js";
import { validate, idParam, uuidParam } from "../lib/validate.js";
import { registerBody, loginBody } from "../validators/auth.js";
import { listConcertsQuery, limitQuery, contactBody } from "../validators/public.js";
import { createReservationBody, startPaymentBody, listMineQuery } from "../validators/reservations.js";
import { requireAuth } from "../middleware/session.js";
import { csrfTokenHandler } from "../middleware/csrf.js";
import * as authC from "../controllers/authController.js";
import * as catalogC from "../controllers/catalogController.js";
import * as resC from "../controllers/reservationController.js";
import * as payC from "../controllers/paymentController.js";
import { env } from "../config/env.js";

export function publicRoutes(L) {
  const r = Router();

  r.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok", time: new Date().toISOString(), paymentProvider: env.PAYMENT_PROVIDER } }));
  r.get("/csrf", csrfTokenHandler);

  // ---- auth
  r.post("/auth/register", L.register, validate({ body: registerBody }), h(authC.register));
  r.post("/auth/login", L.auth, validate({ body: loginBody }), h(authC.login));
  r.post("/auth/logout", h(authC.logout));
  r.get("/auth/me", authC.me);

  // ---- catalogue (public)
  r.get("/concerts", validate({ query: listConcertsQuery }), h(catalogC.concerts));
  r.get("/concerts/:id", validate({ params: idParam }), h(catalogC.concert));
  r.get("/concerts/:id/seats", validate({ params: idParam }), h(catalogC.seats));
  r.get("/members", h(catalogC.members));
  r.get("/instruments", h(catalogC.instruments));
  r.get("/gallery", validate({ query: limitQuery }), h(catalogC.gallery));
  r.post("/contact", L.contact, validate({ body: contactBody }), h(catalogC.contact));

  // ---- reservations (login required)
  r.post("/reservations", requireAuth, L.booking, validate({ body: createReservationBody }), h(resC.create));
  r.get("/reservations", requireAuth, validate({ query: listMineQuery }), h(resC.list));
  r.get("/reservations/:id", requireAuth, validate({ params: uuidParam }), h(resC.get));
  r.delete("/reservations/:id", requireAuth, L.booking, validate({ params: uuidParam }), h(resC.cancel));
  r.post("/reservations/:id/payment", requireAuth, L.payment, validate({ params: uuidParam, body: startPaymentBody }), h(resC.startPayment));

  // ---- tickets
  r.get("/tickets", requireAuth, h(resC.myTickets));
  r.get("/tickets/:id", requireAuth, validate({ params: uuidParam }), h(resC.ticket));
  r.get("/tickets/:id/qr.svg", requireAuth, validate({ params: uuidParam }), h(resC.ticketQr));

  // ---- payment gateway return (GET from the gateway/browser; verified server-to-server, idempotent)
  r.get("/payments/callback", validate({ query: payC.callbackQuery }), h(payC.callback));

  // fake gateway: ONLY with PAYMENT_PROVIDER=mock (env.js already refuses to boot that in production)
  if (env.PAYMENT_PROVIDER === "mock") {
    r.get("/payments/mock/gateway/:authority", payC.mockGatewayPage);
    r.post("/payments/mock/gateway/:authority", express.urlencoded({ extended: false, limit: "2kb" }), payC.mockGatewayPay);
  }
  return r;
}
