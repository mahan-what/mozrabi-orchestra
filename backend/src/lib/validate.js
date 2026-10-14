import { z } from "zod";
import { unprocessable } from "./errors.js";

/** validate({ body, query, params }) → req.valid.{body,query,params} (parsed + coerced). Unknown keys are stripped. */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const part of ["params", "query", "body"]) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      return next(
        unprocessable(
          result.error.issues[0]?.message?.startsWith("Invalid") ? "ورودی نامعتبر است." : result.error.issues[0]?.message || "ورودی نامعتبر است.",
          "VALIDATION_ERROR",
          result.error.issues.map((i) => ({ path: [part, ...i.path].join("."), message: i.message })),
        ),
      );
    }
    req.valid[part] = result.data;
  }
  next();
};

export const idParam = z.object({ id: z.coerce.number().int().positive("شناسه نامعتبر است.") });
export const uuidParam = z.object({ id: z.string().uuid("شناسه نامعتبر است.") });

export const pagination = (defaultSize = 20, maxSize = 100) =>
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxSize).default(defaultSize),
  });

const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const latinDigits = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));

/** Returns 09XXXXXXXXX or null */
export function normalizeMobile(input) {
  let s = latinDigits(String(input ?? "")).replace(/[\s\-()]/g, "");
  s = s.replace(/^(\+98|0098)/, "0");
  if (/^9\d{9}$/.test(s)) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

export const mobileField = z
  .string({ message: "شماره موبایل را وارد کنید." })
  .transform((s, ctx) => {
    const n = normalizeMobile(s);
    if (!n) { ctx.addIssue({ code: "custom", message: "شماره موبایل معتبر نیست." }); return z.NEVER; }
    return n;
  });

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "ایمیل معتبر نیست.");

export const optionalEmail = z.preprocess((v) => (v === "" || v == null ? undefined : v), emailField.optional());

export const nameField = z.string({ message: "نام را وارد کنید." }).trim().min(2, "نام را وارد کنید.").max(100, "نام بیش از حد طولانی است.");

export const passwordField = z
  .string({ message: "گذرواژه را وارد کنید." })
  .min(8, "گذرواژه باید دست‌کم ۸ نویسه باشد.")
  .max(128, "گذرواژه بیش از حد طولانی است.")
  .refine((s) => new Set(s).size > 2, "گذرواژه بیش از حد ساده است.");

export const isoDate = z.string().datetime({ offset: true, message: "تاریخ باید به قالب ISO 8601 باشد." }).transform((s) => new Date(s));
