import { z } from "zod";
import { mobileField, optionalEmail, nameField, passwordField } from "../lib/validate.js";

export const registerBody = z.object({
  name: nameField,
  mobile: mobileField,
  email: optionalEmail,
  password: passwordField,
});

export const loginBody = z.object({
  identifier: z.string({ message: "موبایل یا ایمیل را وارد کنید." }).trim().min(3, "موبایل یا ایمیل را وارد کنید.").max(254),
  password: z.string({ message: "گذرواژه را وارد کنید." }).min(1, "گذرواژه را وارد کنید.").max(128),
});
