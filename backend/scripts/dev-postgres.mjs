// Dev/test helper: starts a real, disposable PostgreSQL via the "embedded-postgres" npm package.
// Use only when you don't have PostgreSQL installed. Data lives in ./.pgdata (git-ignored) or $DEV_PG_DIR.
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
const PASSWORD = process.env.DEV_PG_PASSWORD;
if (!PASSWORD) { console.error("Set DEV_PG_PASSWORD (any local-only password) before running the embedded dev PostgreSQL."); process.exit(1); }

const port = Number(process.env.DEV_PG_PORT || 54329);
const dir = process.env.DEV_PG_DIR || new URL("../.pgdata", import.meta.url).pathname;
const fresh = !fs.existsSync(dir);
const pg = new EmbeddedPostgres({
  databaseDir: dir, user: "mozrabi", password: PASSWORD, port, persistent: true,
  postgresFlags: ["-c", "timezone=UTC", "-c", "max_connections=100"],
});
if (fresh) await pg.initialise();
await pg.start();
if (fresh) { await pg.createDatabase("mozrabi"); await pg.createDatabase("mozrabi_test"); }
console.log(`PostgreSQL ready on postgresql://mozrabi:<DEV_PG_PASSWORD>@localhost:${port}/mozrabi`);
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
