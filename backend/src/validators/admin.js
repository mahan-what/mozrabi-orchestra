import { z } from "zod";
import { isoDate, pagination } from "../lib/validate.js";

const url = z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "فقط نشانی http/https مجاز است.");
const nullableUrl = z.preprocess((v) => (v === "" ? null : v), url.nullable().optional());

const programSchema = z
  .array(
    z.object({
      part: z.string().trim().min(1).max(100),
      items: z.array(z.object({ title: z.string().trim().min(1).max(200), note: z.string().trim().max(200).default("") })).max(40),
    }),
  )
  .max(10);

const tierSchema = z.object({
  name: z.string().trim().min(1).max(100),
  amount: z.number().int().min(1000, "حداقل قیمت ۱٬۰۰۰ تومان است.").max(100_000_000),
  rows: z.array(z.string().trim().min(1).max(5)).min(1),
});

export const concertCreateBody = z.object({
  title: z.string().trim().min(2).max(200),
  summary: z.string().trim().min(2).max(500),
  description: z.string().trim().min(2).max(10_000),
  program: programSchema.default([]),
  venueId: z.number().int().positive(),
  startsAt: isoDate,
  durationMinutes: z.number().int().min(1).max(600),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  maxSeatsPerReservation: z.number().int().min(1).max(20).default(6),
  coverImageUrl: nullableUrl,
  tiers: z.array(tierSchema).min(1).max(10),
});

export const concertUpdateBody = z
  .object({
    title: z.string().trim().min(2).max(200),
    summary: z.string().trim().min(2).max(500),
    description: z.string().trim().min(2).max(10_000),
    program: programSchema,
    startsAt: isoDate,
    durationMinutes: z.number().int().min(1).max(600),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]),
    maxSeatsPerReservation: z.number().int().min(1).max(20),
    coverImageUrl: nullableUrl,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "هیچ فیلدی برای ویرایش ارسال نشده است.");

export const tierUpdateBody = z
  .object({ name: z.string().trim().min(1).max(100), amount: z.number().int().min(1000).max(100_000_000) })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "هیچ فیلدی برای ویرایش ارسال نشده است.");

export const tierParams = z.object({ id: z.coerce.number().int().positive(), tierId: z.coerce.number().int().positive() });

export const seatBlockBody = z.object({
  seatIds: z.array(z.number().int().positive()).min(1).max(200),
  action: z.enum(["block", "unblock"]),
});

export const adminConcertsQuery = pagination(20, 100).extend({
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
  includeArchived: z.preprocess((v) => v === "true" || v === "1", z.boolean()).default(false),
});

export const adminReservationsQuery = pagination(20, 100).extend({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"]).optional(),
  concertId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});

export const adminCancelBody = z.object({ reason: z.string().trim().min(2, "دلیل لغو را بنویسید.").max(300) });

export const memberBody = z.object({
  name: z.string().trim().min(2).max(100),
  title: z.string().trim().min(2).max(100),
  bio: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(3000).nullable().optional()),
  imageUrl: nullableUrl,
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});
export const instrumentBody = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9-]{1,40}$/, "کلید باید انگلیسی و کوچک باشد."),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});
export const galleryBody = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable().optional()),
  imageUrl: nullableUrl,
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isPublished: z.boolean().default(true),
});
// PATCH schema: every field optional AND without its create-time default (zod 4 would otherwise re-apply
// defaults such as isActive=true / sortOrder=0 and silently overwrite stored values on a partial update).
const stripDefault = (f) => (f?._zod?.def?.type === "default" ? f._zod.def.innerType : f);
export const partial = (schema) =>
  z.object(Object.fromEntries(Object.entries(schema.shape).map(([k, f]) => [k, stripDefault(f).optional()])))
    .refine((o) => Object.keys(o).length > 0, "هیچ فیلدی برای ویرایش ارسال نشده است.");

export const verifyTicketBody = z.object({ payload: z.string().trim().min(10).max(200), markUsed: z.boolean().default(false) });
export const messagesQuery = pagination(20, 100);
