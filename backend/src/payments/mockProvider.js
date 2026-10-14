import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * FAKE payment gateway for development and tests ONLY (env.js refuses to boot with it in production).
 * It mimics the usual redirect-gateway contract:
 *   initiate(amount)            → { authority, payUrl }
 *   (customer pays at the gateway; gateway redirects/calls back with authority + status)
 *   verify(authority, amount)   → { ok, trackingCode }   (server-to-server; the only source of truth)
 *
 * Its state is in memory, so pending mock payments are lost on restart. A real adapter (Zarinpal, etc.)
 * must implement the same two methods; it is NOT written yet.
 */
const gateway = new Map(); // authority → { amount, outcome: "pending" | "paid" | "failed", verifiedAmount }

export const mockProvider = {
  name: "mock",

  async initiate({ amount }) {
    const authority = "MOCK" + crypto.randomBytes(12).toString("hex").toUpperCase();
    gateway.set(authority, { amount, outcome: "pending" });
    return { authority, payUrl: `${env.API_PUBLIC_URL}/api/v1/payments/mock/gateway/${authority}` };
  },

  async verify({ authority, amount }) {
    const g = gateway.get(authority);
    if (!g || g.outcome !== "paid") return { ok: false, reason: "UNPAID" };
    if (g.amount !== amount) return { ok: false, reason: "AMOUNT_MISMATCH" };
    return { ok: true, trackingCode: "TRK" + authority.slice(4, 16) };
  },

  /** What the customer does on the gateway page. */
  simulate(authority, outcome) {
    const g = gateway.get(authority);
    if (!g) return false;
    g.outcome = outcome === "paid" ? "paid" : "failed";
    return true;
  },
  /** Test hook: pretend the gateway charged a different amount than requested. */
  _tamperAmount(authority, amount) { const g = gateway.get(authority); if (g) g.amount = amount; },
};

export const getProvider = () => {
  if (env.PAYMENT_PROVIDER === "mock") return mockProvider;
  throw new Error(`Unknown payment provider ${env.PAYMENT_PROVIDER}`);
};
