import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { startSweeper, expireStaleReservations } from "./services/reservationService.js";

const app = createApp();

await prisma.$queryRaw`SELECT 1`; // fail fast if the database is unreachable
const stopSweeper = startSweeper();
expireStaleReservations().catch((e) => console.error("initial sweep failed:", e.message));

const server = app.listen(env.PORT, () => {
  console.log(`Mozrabi API listening on :${env.PORT} (${env.NODE_ENV}, payment provider: ${env.PAYMENT_PROVIDER})`);
  if (env.PAYMENT_PROVIDER === "mock") console.warn("⚠ PAYMENT_PROVIDER=mock — fake gateway, development only.");
});

const shutdown = async (signal) => {
  console.log(`${signal}: shutting down`);
  stopSweeper();
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
