import { z } from "zod";
import * as payments from "../services/paymentService.js";
import { mockProvider } from "../payments/mockProvider.js";
import { env } from "../config/env.js";
import { notFound } from "../lib/errors.js";

export const callbackQuery = z.object({
  provider: z.enum(["mock"]).default("mock"),
  authority: z.string().min(8).max(100),
  status: z.string().max(20).default("NOK"),
});

/**
 * The gateway sends the customer's browser here. NOTHING in the query string is trusted except the
 * authority (a lookup key): paymentService verifies server-to-server and compares the amount.
 */
export async function callback(req, res) {
  const { provider, authority, status } = req.valid.query;
  const gatewayStatus = status.toUpperCase() === "OK" ? "OK" : "NOK";
  const out = await payments.handleCallback({ provider, authority, gatewayStatus });
  const base = new URL(env.APP_BASE_URL);
  const target = out.status === "SUCCEEDED"
    ? new URL("ticket.html", base)
    : new URL("checkout.html", base);
  target.searchParams.set("reservation", out.reservationId);
  target.searchParams.set("payment", out.status === "SUCCEEDED" ? "ok" : out.status === "REFUND_REQUIRED" ? "refund" : "failed");
  res.redirect(303, target.toString());
}

// ---------- Development-only fake gateway page (route is only mounted when PAYMENT_PROVIDER=mock) ----------
const AUTH_RE = /^MOCK[0-9A-F]{24}$/;
export function mockGatewayPage(req, res) {
  const { authority } = req.params;
  if (!AUTH_RE.test(authority)) throw notFound();
  res.set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" }).send(`<!doctype html>
<html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>درگاه پرداخت آزمایشی</title>
<style>body{font-family:Tahoma,sans-serif;background:#11100d;color:#f4f0e8;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:26rem;padding:2rem;border:1px solid #b49a62;text-align:center}button{font:inherit;padding:.7rem 1.4rem;margin:.4rem;cursor:pointer;border:1px solid #b49a62;background:#0b0a08;color:#f4f0e8}
.p{background:#b49a62;color:#0b0a08}small{color:#b49a62}</style>
<main><h1>درگاه پرداخت آزمایشی</h1><p><small>این یک درگاه جعلی برای توسعه است؛ هیچ پولی جابه‌جا نمی‌شود.</small></p>
<form method="post" action="/api/v1/payments/mock/gateway/${authority}">
<button class="p" name="outcome" value="paid">پرداخت موفق</button>
<button name="outcome" value="failed">انصراف / ناموفق</button></form></main></html>`);
}

export function mockGatewayPay(req, res) {
  const { authority } = req.params;
  if (!AUTH_RE.test(authority)) throw notFound();
  const paid = req.body?.outcome === "paid";
  if (!mockProvider.simulate(authority, paid ? "paid" : "failed")) throw notFound("تراکنش پیدا نشد.", "PAYMENT_NOT_FOUND");
  res.redirect(303, `/api/v1/payments/callback?provider=mock&authority=${authority}&status=${paid ? "OK" : "NOK"}`);
}
