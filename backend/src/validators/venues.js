import { z } from "zod";
import { pagination } from "../lib/validate.js";

export const venueBody = z.object({
  name: z.string().trim().min(2).max(150),
  city: z.string().trim().min(2).max(80),
  address: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(300).nullable().optional()),
  // row layout, front to back: [{ label: "A", count: 8 }, …]
  rows: z.array(z.object({ label: z.string().trim().min(1).max(5), count: z.number().int().min(1).max(60) })).min(1).max(60)
    .refine((r) => new Set(r.map((x) => x.label)).size === r.length, "برچسب ردیف‌ها تکراری است."),
});

export const adminPaymentsQuery = pagination(20, 100).extend({
  status: z.enum(["INITIATED", "SUCCEEDED", "FAILED", "CANCELLED", "REFUND_REQUIRED", "REFUNDED"]).optional(),
});
