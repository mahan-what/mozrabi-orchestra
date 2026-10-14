import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma, svc, reset, settle } from "./helpers.js";

before(reset);
beforeEach(reset);
after(async () => { await prisma.$disconnect(); });

const reg = { name: "سارا احمدی", mobile: "09131112233", email: "sara@example.com", password: "S3cure-pass!" };

test("register stores only a hash and never returns it", async () => {
  const u = await svc.auth.register(reg);
  assert.equal(u.passwordHash, undefined);
  const row = await prisma.user.findUnique({ where: { id: u.id } });
  assert.ok(row.passwordHash.startsWith("scrypt$"));
  assert.ok(!row.passwordHash.includes(reg.password));
  assert.equal(row.role, "USER");
});

test("same account registered twice in parallel → one 409", async () => {
  const r = await settle([svc.auth.register(reg), svc.auth.register(reg), svc.auth.register({ ...reg, email: undefined })]);
  assert.equal(r.ok.length, 1);
  assert.ok(r.err.every((e) => e.status === 409));
});

test("login by mobile or email, session token resolves to the user, token is stored hashed", async () => {
  await svc.auth.register(reg);
  const l1 = await svc.auth.login({ identifier: "۰۹۱۳۱۱۱۲۲۳۳", password: reg.password }); // Persian digits
  const l2 = await svc.auth.login({ identifier: "SARA@example.com", password: reg.password });
  assert.equal(l1.user.mobile, "09131112233");
  assert.equal(l2.user.email, "sara@example.com");
  assert.equal((await svc.auth.userFromToken(l1.token)).mobile, "09131112233");
  const s = await prisma.session.findMany();
  assert.ok(s.every((x) => x.tokenHash !== l1.token && x.tokenHash.length === 64));
});

test("wrong password and unknown user give the same error", async () => {
  await svc.auth.register(reg);
  const e1 = await svc.auth.login({ identifier: reg.mobile, password: "nope-nope" }).catch((e) => e);
  const e2 = await svc.auth.login({ identifier: "09139999999", password: "nope-nope" }).catch((e) => e);
  assert.equal(e1.code, "INVALID_CREDENTIALS");
  assert.equal(e2.code, "INVALID_CREDENTIALS");
  assert.equal(e1.message, e2.message);
});

test("5 wrong passwords lock the account; even the right password is then refused", async () => {
  await svc.auth.register(reg);
  for (let i = 0; i < 5; i++) await svc.auth.login({ identifier: reg.mobile, password: "bad-bad-bad" }).catch(() => {});
  const e = await svc.auth.login({ identifier: reg.mobile, password: reg.password }).catch((x) => x);
  assert.equal(e.code, "ACCOUNT_LOCKED");
  assert.equal(e.status, 429);
});

test("logout revokes the session; expired/revoked/disabled sessions don't resolve", async () => {
  await svc.auth.register(reg);
  const l = await svc.auth.login({ identifier: reg.mobile, password: reg.password });
  await svc.auth.logout(l.token);
  assert.equal(await svc.auth.userFromToken(l.token), null);
  const l2 = await svc.auth.login({ identifier: reg.mobile, password: reg.password });
  await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await svc.auth.userFromToken(l2.token), null);
  const l3 = await svc.auth.login({ identifier: reg.mobile, password: reg.password });
  await prisma.user.updateMany({ data: { isActive: false } });
  assert.equal(await svc.auth.userFromToken(l3.token), null);
  assert.equal(await svc.auth.userFromToken("garbage"), null);
});
