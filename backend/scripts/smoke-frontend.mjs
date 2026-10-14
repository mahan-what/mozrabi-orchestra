// Optional browser smoke test of the real flow (needs: a running server with SERVE_FRONTEND=true, a seeded DB,
// PAYMENT_PROVIDER=mock, and `playwright` + a Chromium available). Usage:
//   BASE=http://localhost:3000 PLAYWRIGHT_MODULE=playwright node scripts/smoke-frontend.mjs
// It registers a throw-away user, so run it only against a development database.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const BASE = process.env.BASE || "http://localhost:3000";
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ locale: "fa-IR", viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push("console: " + m.text()); });
page.on("requestfailed", (r) => { if (!/fonts\.g|about-image/.test(r.url())) errors.push("requestfailed: " + r.url()); });

const text = (sel) => page.locator(sel).first().innerText();
try {
  // ---- public pages render API data
  await page.goto(BASE + "/index.html"); await page.waitForSelector(".feature");
  check("home: next concert feature from API", (await text(".feature__title")).includes("شب موسیقی ایرانی"));
  await page.waitForSelector(".member"); check("home: members from API", (await page.locator(".member").count()) === 4);
  await page.waitForSelector(".instrument"); check("home: instruments from API", (await page.locator(".instrument").count()) === 6);
  await page.waitForSelector(".masonry__item"); check("home: gallery from API", (await page.locator(".masonry__item").count()) === 6);
  check("home: no leftover loading state", (await page.locator(".state--loading").count()) === 0);
  await page.goto(BASE + "/concerts.html"); await page.waitForSelector(".concert-row");
  check("concerts: 3 upcoming + 4 past", (await page.locator(".concert-row").count()) === 3 && (await page.locator("a.past").count()) === 4);
  await page.goto(BASE + "/concert.html?id=1"); await page.waitForSelector("[data-tiers] li");
  check("concert detail: tiers + program", (await page.locator("[data-tiers] li").count()) === 3 && (await page.locator(".program__part").count()) === 2);
  await page.goto(BASE + "/concert.html?id=99999"); await page.waitForSelector(".state--empty");
  check("concert detail: unknown id shows empty state", (await text(".state--empty")).includes("پیدا نشد"));
  await page.goto(BASE + "/about.html"); await page.waitForSelector(".member");
  check("about: all 8 members", (await page.locator(".member").count()) === 8);

  // ---- contact form
  await page.goto(BASE + "/contact.html");
  await page.fill("#c-name", "تست دودی"); await page.fill("#c-email", "smoke@example.com"); await page.fill("#c-msg", "پیام آزمایشی تست دودی");
  await page.click("#contact-form button[type=submit]"); await page.waitForSelector(".form-success.is-on");
  check("contact: message stored via API", true);

  // ---- booking requires login
  await page.goto(BASE + "/booking.html?id=1"); await page.waitForSelector(".seat:not([disabled])");
  const seatCount = await page.locator(".seat").count();
  check("booking: 120 seats from API", seatCount === 120, String(seatCount));
  await page.locator(".seat:not([disabled])").nth(0).click(); await page.locator(".seat:not([disabled])").nth(1).click();
  check("booking: selection shows server-priced total", (await text("#total")).includes("تومان") && !(await text("#total")).startsWith("۰"));
  await page.click("#continue");
  await page.waitForURL(/account\.html\?next=/, { timeout: 8000 });
  check("booking: anonymous user is sent to login with next=", true);

  // ---- register → back to booking → hold → checkout
  await page.click("#tab-register");
  const mobile = "0912" + String(Math.floor(1000000 + Math.random() * 8999999));
  await page.fill("#r-name", "کاربر دودی"); await page.fill("#r-mobile", mobile); await page.fill("#r-pw", "Smoke-Test-9172");
  await page.click("#p-register button[type=submit]");
  await page.waitForURL(/booking\.html/, { timeout: 8000 });
  await page.waitForSelector(".seat");
  check("register: returned to booking, selection restored", (await text("#chosen-count")).startsWith("۲"));
  await page.click("#continue");
  await page.waitForURL(/checkout\.html\?reservation=/, { timeout: 8000 });
  await page.waitForSelector("#order-total:not(:text('—'))");
  check("checkout: reservation + countdown from server", (await text("#countdown")).includes(":") && (await page.locator("#order-seats li").count()) === 2);
  check("checkout: demo note visible only because provider=mock", await page.locator(".demo-note").isVisible());

  // ---- pay on the fake gateway
  await page.check("#terms");
  await page.click("#checkout-form button[type=submit]");
  await page.waitForURL(/payments\/mock\/gateway\//, { timeout: 8000 });
  check("payment: redirected to gateway URL given by server", true);
  await page.click("button[value=paid]");
  await page.waitForURL(/ticket\.html\?reservation=.*payment=ok/, { timeout: 8000 });
  await page.waitForSelector(".ticket");
  check("ticket: 2 tickets issued after verified payment", (await page.locator(".ticket").count()) === 2);
  check("ticket: real server QR image", (await page.locator(".qr img").first().getAttribute("src")).startsWith("data:image/svg+xml"));
  check("ticket: number format MZ-<year>-<serial>", /MZ-\d{4}-\d{6}/.test((await text(".ticket__no")).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))));

  // ---- account lists the reservation; failed payment path
  await page.goto(BASE + "/account.html"); await page.waitForSelector(".res-item");
  check("account: confirmed reservation listed", (await text(".res-item")).includes("تأیید شده"));
  await page.goto(BASE + "/booking.html?id=2"); await page.waitForSelector(".seat:not([disabled])");
  await page.locator(".seat:not([disabled])").nth(5).click(); await page.click("#continue");
  await page.waitForURL(/checkout\.html\?reservation=/); await page.fill("#mobile", mobile); await page.check("#terms");
  await page.click("#checkout-form button[type=submit]"); await page.waitForURL(/gateway/);
  await page.click("button[value=failed]"); await page.waitForURL(/checkout\.html.*payment=failed/);
  check("payment failure: back on checkout with notice, hold kept", await page.locator("#checkout-notice").isVisible());

  // ---- API-down state
  const bad = await ctx.newPage();
  await bad.route("**/api/v1/concerts**", (r) => r.abort());
  await bad.goto(BASE + "/concerts.html"); await bad.waitForSelector(".state--error");
  check("concerts: API failure shows error state with retry", (await bad.locator("[data-retry]").count()) > 0);
  check("no JS/page errors during the run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  check("smoke run aborted: " + e.message.split("\n")[0], false);
} finally { await browser.close(); }
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
