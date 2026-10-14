# ارکستر مضرابی اصفهان — وب‌سایت با پایگاه‌داده و API

نسخه‌ی پروتوتایپ استاتیک سایت به یک سایت واقعی مبتنی بر پایگاه‌داده تبدیل شده است، **بدون تغییر ظاهر**:
HTML/CSS/JS خالص (RTL، فونت Vazirmatn، پالت مشکی/سفید گرم/طلایی) + یک بک‌اند Node.js.

| لایه | فناوری |
|---|---|
| بک‌اند | Node ≥ 22.12، Express 4، zod، helmet، cors، express-rate-limit |
| پایگاه‌داده | PostgreSQL + Prisma 7 (schema + migration SQL) |
| فرانت‌اند | همان HTML/CSS/JS استاتیک + لایه‌ی `api.js` |
| تست | `node:test` (۶۰ تست، شامل رقابت همزمان واقعی روی HTTP) + یک smoke test مرورگری اختیاری |

> ⚠️ **این پروژه آمادهٔ production نیست.** درگاه پرداخت واقعی وصل نشده است (فقط درگاه آزمایشی)، بازپرداخت خودکار نیست، و پیکربندی استقرار (HTTPS، reverse proxy، Docker، پشتیبان‌گیری، مانیتورینگ) وجود ندارد. فهرست کامل در بخش «محدودیت‌ها».

## ساختار

```
backend/
  prisma/ schema.prisma · migrations/ · seed.js
  src/ server.js · app.js · config/ · db/ · middleware/ · routes/ · controllers/ · services/ · payments/ · validators/ · lib/
  tests/ *.test.js (auth, payment, concurrency, HTTP public, HTTP admin)
  scripts/ dev-postgres.mjs · smoke-frontend.mjs
  .env.example
frontend/
  *.html · assets/css/ · assets/js/ (config.js, api.js, main.js, booking.js, account.js, mock-api.js)
docs/API.md
```

## راه‌اندازی (توسعه)

۱. پیش‌نیاز: Node ≥ 22.12 و یک PostgreSQL در دسترس.
   (بدون PostgreSQL نصب‌شده: `DEV_PG_PASSWORD=<یک رمز محلی دلخواه> npm run dev:postgres` یک نمونه‌ی محلی با `embedded-postgres` بالا می‌آورد؛ فقط برای توسعه. با کاربر root ممکن است به `DEV_PG_DIR` قابل‌نوشتن نیاز داشته باشد.)

۲. نصب و پیکربندی:
```bash
cd backend
npm install                # prisma generate هم خودکار اجرا می‌شود
cp .env.example .env
# DATABASE_URL را تنظیم کنید و SESSION_SECRET را بسازید:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

۳. ساخت جدول‌ها:
```bash
npm run migrate:deploy     # یا migrate:dev در توسعه
```
اگر Prisma CLI نتواند موتور خود را دانلود کند، فایل‌های `prisma/migrations/*/migration.sql` را می‌توان مستقیم با `psql -f` به ترتیب نام اجرا کرد (در محیط ساخت این پروژه همین‌طور اجرا شد؛ `migrate deploy` در آن محیط **اجرا نشد**).

۴. داده‌ی نمونه و ادمین اول (اختیاری، فقط توسعه):
```bash
npm run db:seed
# ساخت ادمین: ADMIN_MOBILE و ADMIN_PASSWORD (≥ ۱۲ نویسه) را در .env بگذارید و دوباره seed بزنید
```
seed با `NODE_ENV=production` داده‌ی نمونه نمی‌سازد؛ فقط (در صورت تنظیم) ادمین را می‌سازد. گذرواژه‌ی پیش‌فرضی وجود ندارد.

۵. اجرا:
```bash
npm run dev     # یا npm start
# با SERVE_FRONTEND=true (پیش‌فرض) سایت از http://localhost:3000 در دسترس است
```

## تست

```bash
createdb mozrabi_test   # یک پایگاه‌داده‌ی جدا با همین نام؛ جداول را با migration بسازید
TEST_DATABASE_URL=postgresql://USER:PASS@localhost:5432/mozrabi_test npm test   # متغیر اجباری است
```
تست‌ها از اجرا روی پایگاه‌داده‌ای که نامش `mozrabi_test` نباشد خودداری می‌کنند (چون جداول را TRUNCATE می‌کنند).

smoke test مرورگری (اختیاری؛ به `playwright` و Chromium نیاز دارد، روی پایگاه‌داده‌ی **توسعه** کاربر آزمایشی می‌سازد):
```bash
BASE=http://localhost:3000 node scripts/smoke-frontend.mjs
```

## اتصال فرانت‌اند به API

* آدرس API به ترتیب از: `window.MZ_CONFIG.API_BASE` ← `<meta name="mz-api-base" content="https://api.example.com/api/v1">` ← پیش‌فرض `/api/v1` (همان origin).
* اگر فرانت‌اند جدا از API میزبانی شود: `APP_BASE_URL` و `ALLOWED_ORIGINS` را در سرور تنظیم کنید، `COOKIE_SAMESITE=none` (فقط با HTTPS) و در HTML متای بالا را بگذارید. (این حالت cross-site در این پروژه تست نشده است.)
* تمام `fetch`ها فقط در `assets/js/api.js` هستند؛ CSRF، کوکی، خطاها (`ApiError`) و اصلاح ساعت سرور آنجا مدیریت می‌شود.
* هر صفحه حالت **loading / error (با «تلاش دوباره») / empty** دارد (`assets/css/states.css`).
* **داده‌ی نمونه‌ی mock جداست:** `mock-api.js` فقط وقتی بارگذاری می‌شود که روی `localhost`/`127.0.0.1` باشید و `?mock=1` را باز کنید (`?mock=0` خاموش می‌کند). روی هر دامنه‌ی دیگر هرگز درخواست نمی‌شود و بنر قرمز «حالت توسعه» نشان داده می‌شود.
* جریان رزرو: انتخاب صندلی → (ورود در صورت نیاز) → `POST /reservations` (نگه‌داری صندلی با مهلت) → `checkout.html` با شمارنده‌ی سرور → `POST …/payment` → درگاه → بازگشت و تأیید سمت سرور → `ticket.html` با QR واقعی.
* «دانلود بلیت» در حال حاضر **چاپ / ذخیره به‌صورت PDF مرورگر** است؛ تولید PDF سمت سرور نداریم.
* تنها تغییرات ظاهری نسبت به پروتوتایپ: یک آیتم «ورود / ثبت‌نام» در منو، صفحه‌ی جدید `account.html`، شمارنده‌ی زمان در خلاصه‌ی سفارش، و متن‌های «نسخه‌ی نمایشی» که اکنون فقط وقتی سرور روی درگاه آزمایشی است نشان داده می‌شوند.

## معماری و تضمین‌ها

* **رزرو صندلی ضد رقابت:** `SELECT … FOR UPDATE` به ترتیب ثابت id، سپس یک `UPDATE` شرطی (`AVAILABLE` یا `HELD` منقضی) که پس از قفل دوباره ارزیابی می‌شود؛ همه‌یا‌هیچ در یک تراکنش؛ ساعت انقضا از `now()` پایگاه‌داده؛ تلاش مجدد روی deadlock؛ قیدهای CHECK و ایندکس یکتای جزئی در خود DB (حتی SQL خام نمی‌تواند وضعیت ناسازگار یا دو بلیت زنده برای یک صندلی بسازد).
* **قیمت** فقط از سرور؛ snapshot در آیتم رزرو.
* **پرداخت:** مبلغ از رزرو خوانده می‌شود؛ نتیجه فقط با verify سمت سرور و مقایسه‌ی مبلغ پذیرفته می‌شود؛ callback تکراری اثر جانبی ندارد؛ بلیت فقط پس از تأیید صادر می‌شود؛ پرداختِ دیرهنگام فقط اگر صندلی‌ها هنوز مال همان رزرو باشند پذیرفته می‌شود وگرنه `REFUND_REQUIRED`.
* **امنیت:** نشست با کوکی HttpOnly و هش توکن در DB؛ scrypt؛ قفل موقت پس از تلاش ناموفق؛ CSRF دوگانه + بررسی Origin؛ helmet + CSP؛ CORS با فهرست سفید؛ rate limit؛ حد بدنه‌ی JSON؛ اعتبارسنجی zod؛ خروجی HTML فرانت‌اند escape می‌شود؛ هیچ داده‌ی کارت ذخیره نمی‌شود؛ **شماره ملی اصلاً دریافت/ذخیره نمی‌شود**؛ QR فقط شناسه‌ی امضاشده دارد.
* `.env` هرگز commit/zip نمی‌شود (`.gitignore`)؛ `.env.example` فقط مقدار نمونه دارد.

## محدودیت‌ها و کارهای ناتمام (صریح)

* ❌ **درگاه پرداخت واقعی پیاده‌سازی نشده.** فقط `mockProvider` (حافظه‌ای، فقط توسعه) هست و در production اجازه‌ی اجرا ندارد. اتصال به درگاه واقعی نیازمند adapter، merchant ID و آزمایش sandbox است.
* ❌ **بازپرداخت خودکار نیست.** `REFUND_REQUIRED` فقط ثبت می‌شود؛ لغو رزرو پرداخت‌شده مجاز نیست.
* ❌ ارسال ایمیل/پیامک (تأیید رزرو، بلیت) نیست؛ تأیید موبایل/ایمیل و بازیابی گذرواژه نیست.
* ❌ آپلود تصویر نیست (فقط URL)؛ فایل `assets/images/about-image.jpg` که HTML به آن ارجاع می‌دهد در پروژه‌ی اصلی وجود نداشت و اضافه نشده است.
* ❌ پنل ادمین گرافیکی نیست؛ فقط REST API ادمین (و تست‌های آن) هست.
* ❌ تولید PDF بلیت سمت سرور نیست.
* ⚠️ rate limit در حافظه‌ی هر فرایند است (چند instance ⇒ Redis لازم است).
* ⚠️ audit log نیست.
* ⚠️ `prisma migrate deploy` در محیط ساخت (دانلود موتور مسدود بود) اجرا **نشد**؛ SQL مایگریشن با `psql` اعمال و تست شد.
* ⚠️ حالت میزبانی جداگانه‌ی فرانت‌اند/API (cross-site cookie) آزمایش نشده است.
* ⚠️ هیچ پیکربندی استقرار (Docker، nginx، HTTPS، CI، پشتیبان‌گیری، لاگ/مانیتورینگ) نوشته نشده؛ پیش از استقرار باید `NODE_ENV=production`، `SESSION_SECRET` قوی، HTTPS و `TRUST_PROXY` درست تنظیم و بررسی امنیتی مستقل انجام شود.
* ⚠️ تست بار/کارایی انجام نشده؛ تست همزمانی تا ۱۵ کاربر هم‌زمان روی یک صندلی را پوشش می‌دهد.

مستندات کامل endpointها: [`docs/API.md`](docs/API.md)
