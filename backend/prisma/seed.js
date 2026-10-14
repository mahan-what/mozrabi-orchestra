// Development seed: the same content the static prototype had as mock data (concerts, members, instruments, gallery).
//   npm run db:seed
// - Demo content is NEVER inserted when NODE_ENV=production.
// - Each group is only inserted when its table is empty, so running twice does not duplicate anything.
// - A first admin is created only when ADMIN_MOBILE and ADMIN_PASSWORD (>= 12 chars) are set in the environment.
import { prisma } from "../src/db/prisma.js";
import { isProd } from "../src/config/env.js";
import { fromJalali } from "../src/lib/persian.js";
import { hashPassword } from "../src/lib/password.js";
import { normalizeMobile } from "../src/lib/validate.js";

const ROWS = [["A", 8], ["B", 10], ["C", 10], ["D", 12], ["E", 12], ["F", 12], ["G", 14], ["H", 14], ["I", 14], ["J", 14]]; // 120 seats
const TIERS = [
  { name: "ردیف‌های A تا C", amount: 500_000, rows: ["A", "B", "C"] },
  { name: "ردیف‌های D تا F", amount: 420_000, rows: ["D", "E", "F"] },
  { name: "ردیف‌های G تا J", amount: 350_000, rows: ["G", "H", "I", "J"] },
];
const P = (part, ...items) => ({ part, items: items.map(([title, note]) => ({ title, note })) });

const UPCOMING = [
  {
    title: "شب موسیقی ایرانی", at: [1405, 7, 25, 20, 30], minutes: 120,
    summary: "شبی با آثار ماندگار موسیقی ایرانی، از ردیف‌های کهن تا آهنگسازی معاصر، با صدای سازهای مضرابی.",
    description: [
      "«شب موسیقی ایرانی» اجرایی است برای کسانی که موسیقی را فقط نمی‌شنوند، بلکه در آن زندگی می‌کنند. در این شب، ارکستر مضرابی اصفهان مجموعه‌ای از قطعات برگزیده را در دو بخش به صحنه می‌آورد؛ از نواهای آشنای دستگاه‌های سنتی تا ساخته‌های تازه‌ای که با نگاهی معاصر برای ارکستر مضرابی نوشته شده‌اند.",
      "تار، سنتور، عود و سه‌تار در کنار تنبک و کمانچه، فضایی صمیمی و در عین حال باشکوه می‌سازند. این اجرا برای شنوندگان کهنه‌کار موسیقی ایرانی و برای کسانی که اولین بار پا به تالار می‌گذارند به یک اندازه دلنشین است.",
    ],
    program: [
      P("بخش اول", ["پیش‌درآمد در دستگاه شور", "ساخته‌ی گروه"], ["چهارمضراب اصفهان", "تنظیم ویژه‌ی ارکستر"], ["آواز و ساز در ماهور", "تک‌نوازی تار و سنتور"]),
      P("بخش دوم", ["رِنگ شهرآشوب", "اجرای گروهی"], ["تصنیف «نوای نی‌ریز»", "همراه با کمانچه و عود"]),
    ],
  },
  {
    title: "گفت‌وگوی تار و سنتور", at: [1405, 8, 20, 20, 0], minutes: 90,
    summary: "دوئتی صمیمی میان دو ساز اصیل مضرابی؛ بداهه‌نوازی و قطعاتی از استادان گذشته.",
    description: ["«گفت‌وگوی تار و سنتور» اجرایی کم‌جمعیت و صمیمی است که در آن دو ساز مضرابی با هم سخن می‌گویند. بداهه‌نوازی، پرسش و پاسخ ملودیک و قطعاتی از آهنگسازان بزرگ موسیقی ایرانی، هسته‌ی این شب را می‌سازند."],
    program: [
      P("بخش اول", ["درآمد در همایون", "تار و سنتور"], ["گفت‌وگو در چهارگاه", "بداهه"]),
      P("بخش دوم", ["قطعه‌ای از ردیف میرزا عبدالله", "سنتور"], ["پایان‌بندی در اصفهان", "اجرای دو نفره"]),
    ],
  },
  {
    title: "شب یلدا با مضراب", at: [1405, 9, 30, 21, 0], minutes: 110,
    summary: "بلندترین شب سال، با نواهای شاد و دل‌نشین و قطعاتی برای هم‌خوانی.",
    description: ["بلندترین شب سال را با ارکستر مضرابی اصفهان بگذرانید؛ شبی از ترانه‌های آشنا، قطعات رقصی و نواهایی که یادآور دورهمی‌های خانوادگی است."],
    program: [
      P("بخش اول", ["پیش‌درآمد یلدایی", "ارکستر"], ["ترانه‌های محلی اصفهان", "اجرای گروهی"]),
      P("بخش دوم", ["رِنگ‌های شاد", "ارکستر"], ["هم‌خوانی با حضار", "ویژه‌ی پایان شب"]),
    ],
  },
];

const PAST = [
  { title: "نوای بهاری", at: [1405, 1, 18, 20, 0], venue: "تالار هنر اصفهان", summary: "اجرای ویژه‌ی نوروز با قطعات شاد و بهاری." },
  { title: "شب‌های سه‌تار", at: [1404, 11, 12, 20, 0], venue: "خانه‌ی هنرمندان اصفهان", summary: "شبی آرام و نزدیک با صدای سه‌تار و عود." },
  { title: "چهارمضراب در چهل‌ستون", at: [1404, 7, 24, 19, 0], venue: "کاخ چهل‌ستون", summary: "اجرای روباز در باغ‌های تاریخی اصفهان." },
  { title: "جشن تابستانی", at: [1404, 6, 10, 20, 0], venue: "تالار هنر اصفهان", summary: "شبی تابستانی با قطعات شاد و هم‌خوانی." },
];

const MEMBERS = [
  ["محمد ابراهیمیان", "سرپرست و نوازنده"], ["علی رضایی", "نوازنده تار"], ["سارا احمدی", "نوازنده سنتور"], ["نیما کریمی", "نوازنده عود"],
  ["مهسا صادقی", "نوازنده سه‌تار"], ["پوریا حسینی", "نوازنده تنبک"], ["آرزو موسوی", "نوازنده کمانچه"], ["کیان نوری", "نوازنده نی"],
];
const INSTRUMENTS = [
  ["tar", "تار", "ساز مضرابی با دو کاسه و ششوانک"], ["santur", "سنتور", "ساز مضرابی با سیم‌های ضربه‌ای"], ["oud", "عود", "ساز گرم و عمیق با دسته‌ی کوتاه"],
  ["setar", "سه‌تار", "ساز لطیف و صمیمی"], ["tonbak", "تنبک", "ساز ضربی و قلب ریتم"], ["kamancheh", "کمانچه", "ساز آرشه‌ای و خوش‌آوا"],
];
const GALLERY = ["اجرای زنده", "پشت صحنه", "تمرین", "نوازندگان", "سازها", "سالن"];

async function seedDemo() {
  const log = [];
  if ((await prisma.concert.count()) === 0) {
    const mainVenue = await prisma.venue.create({ data: { name: "تالار هنر اصفهان", city: "اصفهان", address: "اصفهان، تالار هنر" } });
    const seats = [];
    ROWS.forEach(([label, n], i) => { for (let k = 1; k <= n; k++) seats.push({ venueId: mainVenue.id, rowLabel: label, rowOrder: i + 1, number: k }); });
    await prisma.seat.createMany({ data: seats });
    const venueSeats = await prisma.seat.findMany({ where: { venueId: mainVenue.id } });

    for (const c of UPCOMING) {
      const concert = await prisma.concert.create({
        data: { title: c.title, summary: c.summary, description: c.description.join("\n\n"), program: c.program, venueId: mainVenue.id,
          startsAt: fromJalali(...c.at), durationMinutes: c.minutes, status: "PUBLISHED", maxSeatsPerReservation: 6 },
      });
      const tierOfRow = new Map();
      for (const [i, t] of TIERS.entries()) {
        const tier = await prisma.priceTier.create({ data: { concertId: concert.id, name: t.name, amount: t.amount, rows: t.rows, sortOrder: i } });
        t.rows.forEach((r) => tierOfRow.set(r, tier.id));
      }
      await prisma.concertSeat.createMany({ data: venueSeats.map((s) => ({ concertId: concert.id, seatId: s.id, tierId: tierOfRow.get(s.rowLabel) })) });
    }
    const otherVenues = new Map([["تالار هنر اصفهان", mainVenue]]);
    for (const c of PAST) {
      if (!otherVenues.has(c.venue)) otherVenues.set(c.venue, await prisma.venue.create({ data: { name: c.venue, city: "اصفهان" } }));
      await prisma.concert.create({
        data: { title: c.title, summary: c.summary, description: c.summary + "\n\nاین اجرا در آرشیو ارکستر مضرابی اصفهان نگهداری می‌شود و بخشی از مسیر هنری گروه در سال‌های اخیر است.",
          program: [], venueId: otherVenues.get(c.venue).id, startsAt: fromJalali(...c.at), durationMinutes: 100, status: "PUBLISHED" },
      });
    }
    log.push(`concerts: ${UPCOMING.length} upcoming + ${PAST.length} past`);
  }
  if ((await prisma.member.count()) === 0) {
    await prisma.member.createMany({ data: MEMBERS.map(([name, title], i) => ({ name, title, sortOrder: i })) });
    log.push(`members: ${MEMBERS.length}`);
  }
  if ((await prisma.instrument.count()) === 0) {
    await prisma.instrument.createMany({ data: INSTRUMENTS.map(([key, name, description], i) => ({ key, name, description, sortOrder: i })) });
    log.push(`instruments: ${INSTRUMENTS.length}`);
  }
  if ((await prisma.galleryItem.count()) === 0) {
    await prisma.galleryItem.createMany({ data: GALLERY.map((title, i) => ({ title, sortOrder: i })) });
    log.push(`gallery: ${GALLERY.length}`);
  }
  return log;
}

async function seedAdmin() {
  const mobile = normalizeMobile(process.env.ADMIN_MOBILE);
  const password = process.env.ADMIN_PASSWORD;
  if (!mobile || !password) return "admin: skipped (set ADMIN_MOBILE and ADMIN_PASSWORD to create one)";
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  const email = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim().toLowerCase() : null;
  const existing = await prisma.user.findUnique({ where: { mobile } });
  if (existing) return `admin: ${mobile} already exists (role ${existing.role}) — left unchanged`;
  await prisma.user.create({ data: { name: process.env.ADMIN_NAME || "مدیر سایت", mobile, email, role: "ADMIN", passwordHash: await hashPassword(password) } });
  return `admin: created ${mobile}`;
}

try {
  const out = [];
  if (isProd) out.push("demo content: skipped (NODE_ENV=production)");
  else out.push(...(await seedDemo()), (await prisma.concert.count()) ? "(existing tables left untouched)" : "");
  out.push(await seedAdmin());
  console.log(out.filter(Boolean).map((l) => "• " + l).join("\n"));
} finally {
  await prisma.$disconnect();
}
