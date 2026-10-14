import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";

const { PrismaClient, Prisma } = pkg;

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
export { Prisma };

/** Postgres/Prisma error helpers */
export const isUniqueViolation = (e) => e?.code === "P2002" || e?.meta?.driverAdapterError?.cause?.originalCode === "23505";
