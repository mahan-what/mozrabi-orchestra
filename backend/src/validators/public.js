import { z } from "zod";
import { pagination, emailField, nameField } from "../lib/validate.js";

export const listConcertsQuery = pagination(12, 50).extend({
  phase: z.enum(["upcoming", "past"]).default("upcoming"),
});

export const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });

export const contactBody = z.object({
  name: nameField,
  email: emailField,
  phone: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(30).optional()),
  message: z.string({ message: "پیام را بنویسید." }).trim().min(5, "پیام را بنویسید.").max(4000, "پیام بیش از حد طولانی است."),
});
