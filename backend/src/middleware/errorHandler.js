import { AppError } from "../lib/errors.js";
import { fail } from "../lib/respond.js";
import { isProd } from "../config/env.js";

export const notFoundHandler = (req, _res, next) => next(new AppError(404, "ROUTE_NOT_FOUND", "آدرس درخواستی وجود ندارد."));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;

  if (err instanceof AppError) return fail(res, err.status, err.code, err.message, err.details);

  // body-parser
  if (err?.type === "entity.parse.failed") return fail(res, 400, "INVALID_JSON", "بدنه‌ی درخواست JSON معتبر نیست.");
  if (err?.type === "entity.too.large") return fail(res, 413, "PAYLOAD_TOO_LARGE", "حجم درخواست بیش از حد مجاز است.");
  if (err?.type === "charset.unsupported" || err?.type === "encoding.unsupported") return fail(res, 415, "UNSUPPORTED_ENCODING", "کدگذاری درخواست پشتیبانی نمی‌شود.");

  // Prisma / Postgres
  const code = err?.code;
  if (code === "P2002") return fail(res, 409, "ALREADY_EXISTS", "این مورد از قبل وجود دارد.");
  if (code === "P2025") return fail(res, 404, "NOT_FOUND", "مورد درخواستی پیدا نشد.");
  if (code === "P2003" || code === "P2014") return fail(res, 409, "IN_USE", "به‌دلیل وابستگی به داده‌های دیگر، این عملیات ممکن نیست.");

  // unexpected: log server-side, never leak internals
  console.error(`[${req.id}]`, isProd ? err?.message : err);
  return fail(res, 500, "INTERNAL_ERROR", "خطای داخلی سرور. لطفاً دوباره تلاش کنید.", { requestId: req.id });
}
