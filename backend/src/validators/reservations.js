import { z } from "zod";
import { mobileField, optionalEmail, nameField, pagination } from "../lib/validate.js";

export const createReservationBody = z.object({
  concertId: z.number({ message: "اجرا مشخص نیست." }).int().positive(),
  seatIds: z
    .array(z.number().int().positive(), { message: "صندلی‌ها مشخص نیستند." })
    .min(1, "دست‌کم یک صندلی انتخاب کنید.")
    .max(20, "تعداد صندلی‌ها بیش از حد مجاز است."),
});

export const startPaymentBody = z.object({
  contactName: nameField,
  contactMobile: mobileField,
  contactEmail: optionalEmail,
  acceptTerms: z.literal(true, { message: "پذیرش قوانین و شرایط الزامی است." }),
});

export const listMineQuery = pagination(10, 50);
