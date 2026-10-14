# مستندات API — ارکستر مضرابی اصفهان

پایه‌ی همه‌ی آدرس‌ها: `/api/v1` (در محیط توسعه: `http://localhost:3000/api/v1`)

## قراردادهای عمومی

**قالب پاسخ**

```json
{ "success": true,  "data": { }, "meta": { "page": 1, "pageSize": 12, "total": 3, "totalPages": 1 } }
{ "success": false, "error": { "code": "SEATS_UNAVAILABLE", "message": "پیام فارسی برای کاربر", "details": [ { "path": "body.name", "message": "…" } ] } }
```

`meta` فقط در لیست‌های صفحه‌بندی‌شده می‌آید. `details` فقط در خطای اعتبارسنجی (422) است. پیام خطاها فارسی است؛ برنامه باید به `error.code` تکیه کند.

**احراز هویت.** کوکی `mz_session` (در production: `__Host-mz_session`) — `HttpOnly`، `SameSite=Lax` (قابل‌تنظیم)، `Secure` در production. توکن نشست تصادفی ۳۲ بایتی است و در پایگاه‌داده فقط **هش SHA-256** آن ذخیره می‌شود. کلاینت باید با `credentials: "include"` درخواست بزند.

**CSRF** (برای همه‌ی روش‌های غیر GET/HEAD/OPTIONS، به‌جز بازگشت درگاه):
1. `GET /csrf` → `{ data: { csrfToken } }` و کوکی `mz_csrf` ست می‌شود.
2. توکن را در هدر `X-CSRF-Token` بفرستید (باید با کوکی برابر و امضای HMAC آن معتبر باشد).
3. هدر `Origin` (اگر ارسال شود) باید در `APP_BASE_URL` / `ALLOWED_ORIGINS` باشد.
در صورت خطا: `403 CSRF_INVALID` یا `403 BAD_ORIGIN`. کلاینت پروژه (`api.js`) این‌ها را خودکار انجام می‌دهد.

**Rate limit** (حافظه‌ی همین فرایند): global ۳۰۰/دقیقه، login ۲۰/۱۵ دقیقه، ثبت‌نام ۱۰/ساعت، رزرو ۲۰/دقیقه به‌ازای کاربر، پرداخت ۱۰/دقیقه، تماس ۵/ساعت، ادمین ۱۲۰/دقیقه. پاسخ: `429 RATE_LIMITED`.

**محدودیت بدنه:** JSON حداکثر ۵۰ کیلوبایت. ورودی‌ها با zod اعتبارسنجی و فیلدهای ناشناس حذف می‌شوند.

**مبالغ** به تومان و عدد صحیح‌اند. قیمت **همیشه** در سرور محاسبه می‌شود؛ کلاینت قیمت نمی‌فرستد.

**تاریخ** به‌صورت ISO (`startsAt`) و نیز نمایش جلالی آماده در `display` (`date`, `day`, `month`, `year`, `time`, `duration`) برمی‌گردد.

**کدهای وضعیت پرکاربرد:** 400 درخواست نامعتبر · 401 `UNAUTHENTICATED` · 403 `FORBIDDEN` · 404 · 409 تداخل (`SEATS_UNAVAILABLE`, `TOO_MANY_HOLDS`, …) · 422 `VALIDATION_ERROR` · 429.

---

## عمومی

### `GET /health`
```json
{ "success": true, "data": { "status": "ok", "time": "2026-10-14T07:36:21.249Z", "paymentProvider": "mock" } }
```
`paymentProvider` را فرانت‌اند فقط برای نمایش یادداشت «درگاه آزمایشی» استفاده می‌کند.

### `GET /csrf`
بالا را ببینید.

## احراز هویت

| روش و مسیر | بدنه | توضیح |
|---|---|---|
| `POST /auth/register` | `{ name, mobile, email?, password }` | ۲۰۱ و ورود خودکار (کوکی ست می‌شود). گذرواژه ≥ ۸ نویسه. هش با scrypt. |
| `POST /auth/login` | `{ identifier, password }` | `identifier` موبایل یا ایمیل. ۵ تلاش ناموفق ⇒ قفل ۱۵ دقیقه‌ای. پیام خطا بین «کاربر نیست» و «گذرواژه غلط» فرقی ندارد. |
| `POST /auth/logout` | — | نشست در سرور باطل و کوکی پاک می‌شود. |
| `GET /auth/me` | — | `{ user: {id,name,mobile,email,role} }` یا `{ user: null }` (همیشه ۲۰۰). |

شماره ملی در هیچ‌جای سیستم دریافت یا ذخیره نمی‌شود (حداقل‌سازی داده).

## کاتالوگ (بدون ورود)

| مسیر | توضیح |
|---|---|
| `GET /concerts?phase=upcoming\|past&page&pageSize` | اجراهای منتشرشده. پیش‌فرض `upcoming`، `pageSize` پیش‌فرض ۱۲ و حداکثر ۵۰. |
| `GET /concerts/:id` | جزئیات؛ پیش‌نویس‌ها دیده نمی‌شوند (۴۰۴). |
| `GET /concerts/:id/seats` | نقشه‌ی صندلی با وضعیت لحظه‌ای از پایگاه‌داده. |
| `GET /members`, `GET /instruments`, `GET /gallery?limit` | فقط موارد فعال/منتشرشده. |
| `POST /contact` | `{ name, email, phone?, message }` → `{ id }` |

نمونه‌ی یک اجرا (`data[0]`):
```json
{
  "id": 1, "title": "شب موسیقی ایرانی", "summary": "…", "about": ["پاراگراف ۱", "پاراگراف ۲"],
  "program": [ { "part": "بخش اول", "items": [ { "title": "…", "note": "…" } ] } ],
  "venue": { "id": 1, "name": "تالار هنر اصفهان", "city": "اصفهان" },
  "startsAt": "2026-10-17T17:00:00.000Z",
  "display": { "day": "۲۵", "month": "مهر", "year": "۱۴۰۵", "date": "۲۵ مهر ۱۴۰۵", "time": "۲۰:۳۰", "duration": "۱۲۰ دقیقه" },
  "durationMinutes": 120, "status": "PUBLISHED", "phase": "upcoming", "bookable": true,
  "maxSeatsPerReservation": 6, "coverImageUrl": null, "fromPrice": 350000,
  "tiers": [ { "id": 1, "name": "ردیف‌های A تا C", "amount": 500000, "rows": ["A","B","C"] } ]
}
```

نمونه‌ی نقشه‌ی صندلی:
```json
{ "concertId": 1, "bookable": true, "maxSeatsPerReservation": 6, "tiers": [ … ],
  "rows": [ { "label": "A", "seats": [ { "id": 101, "number": 1, "tierId": 1, "price": 500000, "available": true } ] } ],
  "summary": { "total": 120, "available": 118 }, "serverTime": "…" }
```
`available` یعنی «آزاد، یا نگه‌داشته‌شده با مهلت گذشته». اینکه چه کسی صندلی را نگه داشته یا خریده است هرگز نمایش داده نمی‌شود.

## رزرو (نیازمند ورود)

### `POST /reservations`
هدر اختیاری ولی توصیه‌شده: `Idempotency-Key: <۸ تا ۱۰۰ نویسه [A-Za-z0-9_-]>` — ارسال دوباره با همان کلید همان رزرو را برمی‌گرداند.

بدنه: `{ "concertId": 1, "seatIds": [101, 102] }` ← `201`
```json
{ "id": "uuid", "status": "PENDING", "totalAmount": 1000000, "currency": "IRT", "expiresAt": "…",
  "confirmedAt": null, "contact": null,
  "concert": { "id": 1, "title": "…", "startsAt": "…", "venue": "…", "display": { "date": "…", "time": "…" } },
  "seats": [ { "seatId": 101, "row": "A", "number": 1, "tier": "…", "price": 500000 } ],
  "payments": [], "tickets": [] }
```
تضمین‌ها: همه یا هیچ (اگر حتی یک صندلی آزاد نباشد ۴۰۹ `SEATS_UNAVAILABLE` و هیچ چیز نگه داشته نمی‌شود)؛ قفل ردیفی `SELECT … FOR UPDATE` به ترتیب ثابت؛ مهلت `HOLD_MINUTES` با ساعت پایگاه‌داده؛ قیمت از سرور و به‌صورت snapshot در `ReservationItem.price` ذخیره می‌شود؛ حداکثر ۳ رزرو باز برای هر کاربر (`TOO_MANY_HOLDS`).

### سایر مسیرها

| مسیر | توضیح |
|---|---|
| `GET /reservations?page&pageSize` | رزروهای خود کاربر (پیش‌فرض ۱۰، حداکثر ۵۰). |
| `GET /reservations/:id` | فقط مالک؛ در غیر این‌صورت ۴۰۴. |
| `DELETE /reservations/:id` | لغو رزرو **پرداخت‌نشده** و آزادسازی صندلی‌ها. رزرو پرداخت‌شده لغو نمی‌شود (بازپرداخت پیاده نشده). |
| `POST /reservations/:id/payment` | شروع پرداخت (پایین). |

وضعیت‌های رزرو: `PENDING → CONFIRMED | CANCELLED | EXPIRED`. انقضا هم با جاروب پس‌زمینه (`SWEEP_INTERVAL_SECONDS`) و هم به‌صورت lazy در هر رزرو انجام می‌شود.

## پرداخت

### `POST /reservations/:id/payment` ← `201`
بدنه: `{ "contactName": "…", "contactMobile": "09…", "contactEmail"?: "…", "acceptTerms": true }`
```json
{ "paymentId": "uuid", "amount": 1000000, "payUrl": "http://localhost:3000/api/v1/payments/mock/gateway/MOCK…", "expiresAt": "…" }
```
مبلغ از سرور خوانده می‌شود. مهلت نگه‌داری به `PAYMENT_WINDOW_MINUTES` تمدید می‌شود و پرداخت‌های `INITIATED` قبلی همان رزرو باطل می‌شوند. فرانت‌اند کاربر را به `payUrl` می‌فرستد. اطلاعات کارت هرگز به این سیستم نمی‌رسد.

### `GET /payments/callback?provider=mock&authority=…&status=OK|NOK`
مسیری که مرورگر کاربر پس از درگاه به آن بازمی‌گردد. **هیچ چیز از query اعتماد نمی‌شود** جز `authority` (کلید جست‌وجو): سرور خودش verify می‌کند (server-to-server) و مبلغ را با مبلغ ثبت‌شده مقایسه می‌کند؛ پردازش idempotent است. نتیجه: ریدایرکت ۳۰۳ به
`ticket.html?reservation=ID&payment=ok` (موفق) یا `checkout.html?reservation=ID&payment=failed|refund`.
حالت `refund` یعنی پول دریافت شد ولی صندلی‌ها دیگر برای این رزرو نبودند؛ وضعیت `REFUND_REQUIRED` ثبت می‌شود و **بازپرداخت خودکار پیاده‌سازی نشده است** (باید دستی انجام شود).

### درگاه آزمایشی (فقط `PAYMENT_PROVIDER=mock`)
`GET|POST /payments/mock/gateway/:authority` — صفحه‌ی جعلی با دو دکمه. در production اصلاً mount نمی‌شود و `env.js` اجازه‌ی بالا آمدن با `mock` را نمی‌دهد. **درگاه واقعی (زرین‌پال، بانک و …) پیاده‌سازی نشده است**؛ برای آن باید یک adapter هم‌شکل `src/payments/mockProvider.js` (`initiate`, `verify`) نوشته شود.

## بلیت (نیازمند ورود)

| مسیر | توضیح |
|---|---|
| `GET /tickets` | همه‌ی بلیت‌های کاربر. |
| `GET /tickets/:id` | فقط مالک. |
| `GET /tickets/:id/qr.svg` | تصویر QR (`image/svg+xml`). محتوا: `MZ1.<ticketId>.<HMAC>` — بدون هیچ داده‌ی شخصی. |

```json
{ "id": "uuid", "number": "MZ-۱۴۰۵-000001", "status": "VALID", "holderName": "…",
  "seat": { "row": "A", "number": 1, "tier": "…" },
  "concert": { "id": 1, "title": "…", "venue": "…", "startsAt": "…", "display": { } }, "reservationId": "uuid" }
```
بلیت فقط پس از تأیید پرداخت صادر می‌شود. برای هر صندلی هر اجرا حداکثر یک بلیت زنده وجود دارد (ایندکس یکتای جزئی در پایگاه‌داده).

---

## مدیریت (`/admin/*`)

نیازمند نشست با `role = ADMIN` (`401` بدون ورود، `403` برای کاربر عادی)، CSRF و rate limit مخصوص. اولین ادمین فقط با `npm run db:seed` و متغیرهای `ADMIN_MOBILE`/`ADMIN_PASSWORD` ساخته می‌شود؛ هیچ مسیر عمومی برای ادمین‌شدن وجود ندارد.

| مسیر | توضیح |
|---|---|
| `GET /admin/venues`, `POST /admin/venues` | سالن و چیدمان ردیف‌ها: `{ name, city, address?, rows: [{label, count}] }` |
| `GET /admin/concerts?status&includeArchived&page&pageSize` | همه‌ی اجراها از جمله پیش‌نویس |
| `POST /admin/concerts` | `{ title, summary, description, program?, venueId, startsAt (ISO با offset), durationMinutes, status?, maxSeatsPerReservation?, coverImageUrl?, tiers:[{name,amount,rows}] }` — صندلی‌های اجرا و قیمت‌گذاری ردیف‌ها ساخته می‌شود |
| `GET /admin/concerts/:id`, `PATCH /admin/concerts/:id` | ویرایش جزئی (فیلدهای ارسال‌نشده تغییر نمی‌کنند) |
| `POST /admin/concerts/:id/archive`, `DELETE /admin/concerts/:id` | آرشیو (فقط بدون رزرو باز)؛ حذف فقط اگر اجرا هیچ سابقه‌ی رزروی نداشته باشد (`HAS_HISTORY`) |
| `PATCH /admin/concerts/:id/tiers/:tierId` | تغییر نام/قیمت رده. رزروهای قبلی قیمت snapshot خود را حفظ می‌کنند |
| `GET /admin/concerts/:id/seats` | نقشه‌ی کامل با `status` (AVAILABLE/HELD/SOLD/BLOCKED)، `reservationId` و `heldUntil` |
| `POST /admin/concerts/:id/seats/block` | `{ seatIds, action: "block"\|"unblock" }` — فقط صندلی آزاد را می‌توان مسدود کرد |
| `GET /admin/reservations?status&concertId&q`, `GET /admin/reservations/:id` | |
| `POST /admin/reservations/:id/cancel` | `{ reason }` — فقط `PENDING` |
| `GET /admin/payments?status` | |
| `POST /admin/tickets/verify` | `{ payload, markUsed? }` — اسکن درِ سالن؛ `markUsed` به‌صورت اتمیک `VALID→USED` می‌کند و ورود دوباره `409 TICKET_ALREADY_USED` می‌دهد |
| `GET /admin/messages`, `POST /admin/messages/:id/handled` | پیام‌های فرم تماس |
| `GET\|POST /admin/{members,instruments,gallery}`, `GET\|PATCH\|DELETE /admin/{…}/:id` | CRUD محتوا. تصویر فقط با URL (آپلود فایل پیاده نشده) |

## نمونه‌ی curl
```bash
J=/tmp/cj; B=http://localhost:3000/api/v1
T=$(curl -s -c $J -b $J $B/csrf | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.csrfToken')
curl -s -c $J -b $J -H "X-CSRF-Token: $T" -H 'Content-Type: application/json' \
  -d '{"identifier":"09120000000","password":"…"}' $B/auth/login
curl -s -c $J -b $J -H "X-CSRF-Token: $T" -H 'Idempotency-Key: demo-key-0001' -H 'Content-Type: application/json' \
  -d '{"concertId":1,"seatIds":[101,102]}' $B/reservations
```
