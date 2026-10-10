/* ==========================================================================
   ارکستر مضرابی اصفهان — main.js
   Shared: mock data · helpers · header/footer · reveal · list renderers
   (No backend. Everything here is mock data.)
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const toFa = (v) => String(v).replace(/\d/g, (d) => FA[d]);
  const fmt = (n) => toFa(Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const ICON = {
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 7 9 6 9-6"/></svg>',
    insta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".6" fill="currentColor"/></svg>',
    tg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m21 4-3 15-6-4.5-3 3v-5L19 6 7 12.5 3 11Z"/></svg>',
    yt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="3.5"/><path d="m10 9 5 3-5 3Z"/></svg>',
    note: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" aria-hidden="true"><path d="M18 34V10l20-4v24"/><circle cx="12" cy="34" r="6"/><circle cx="32" cy="30" r="6"/></svg>',
    mic: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 36 24 8l18 28Z"/><path d="M14 36v4M24 36v4M34 36v4"/></svg>',
  };

  /* Line-art instrument illustrations (decorative) */
  const INSTR = {
    tar: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 6v78"/><rect x="26" y="4" width="8" height="18" rx="1"/><path d="M30 84c-14 0-20 8-18 18 1 5 5 7 8 8-5 3-8 8-6 14 2 8 10 12 16 12s14-4 16-12c2-6-1-11-6-14 3-1 7-3 8-8 2-10-4-18-18-18Z"/><path d="M30 92v50M25 96v44M35 96v44"/></svg>',
    santur: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M10 96 34 24h52l24 72Z"/><path d="M20 84 40 34M30 84 46 34M40 84 52 34M50 84 58 34M60 84V34M70 84 62 34M80 84 68 34M90 84 74 34M100 84 80 34"/><circle cx="26" cy="92" r="1.6"/><circle cx="94" cy="92" r="1.6"/></svg>',
    oud: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 8v62"/><path d="M26 4c0 8 4 12 4 12s4-4 4-12"/><path d="M30 70c-18 0-26 14-24 30 2 18 14 30 24 30s22-12 24-30c2-16-6-30-24-30Z"/><circle cx="30" cy="104" r="7"/><path d="M30 70v52M25 72v50M35 72v50"/></svg>',
    setar: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 6v100"/><rect x="26" y="4" width="8" height="14" rx="1"/><path d="M30 106c-11 0-16 7-15 15s7 14 15 14 14-6 15-14-4-15-15-15Z"/><path d="M30 110v20"/></svg>',
    tonbak: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><ellipse cx="30" cy="38" rx="22" ry="7"/><path d="M8 38c0 10 12 14 12 24 0 6-2 12-2 18 0 10 8 12 8 24 0 12-6 14-6 20h20c0-6-6-8-6-20 0-12 8-14 8-24 0-6-2-12-2-18 0-10 12-14 12-24"/></svg>',
    kamancheh: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 4v100"/><rect x="26" y="4" width="8" height="18" rx="1"/><circle cx="30" cy="112" r="20"/><path d="M30 132v26"/><path d="M24 94v34M36 94v34"/></svg>',
  };

  const placeholder = (tone, glyph, label) =>
    `<div class="ph" data-tone="${tone}" role="img" aria-label="${label}"><div class="ph__glyph">${ICON[glyph] || ICON.note}</div></div>`;

  /* ---------- Mock data ---------- */
  const DATA = {
    concerts: [
      {
        id: 1, status: "upcoming", title: "شب موسیقی ایرانی",
        day: "۲۵", month: "مهر", date: "۲۵ مهر ۱۴۰۵", time: "۲۰:۳۰", venue: "تالار هنر اصفهان", duration: "۱۲۰ دقیقه",
        from: 350000, tone: 1,
        short: "شبی با آثار ماندگار موسیقی ایرانی، از ردیف‌های کهن تا آهنگسازی معاصر، با صدای سازهای مضرابی.",
        about: [
          "«شب موسیقی ایرانی» اجرایی است برای کسانی که موسیقی را فقط نمی‌شنوند، بلکه در آن زندگی می‌کنند. در این شب، ارکستر مضرابی اصفهان مجموعه‌ای از قطعات برگزیده را در دو بخش به صحنه می‌آورد؛ از نواهای آشنای دستگاه‌های سنتی تا ساخته‌های تازه‌ای که با نگاهی معاصر برای ارکستر مضرابی نوشته شده‌اند.",
          "تار، سنتور، عود و سه‌تار در کنار تنبک و کمانچه، فضایی صمیمی و در عین حال باشکوه می‌سازند. این اجرا برای شنوندگان کهنه‌کار موسیقی ایرانی و برای کسانی که اولین بار پا به تالار می‌گذارند به یک اندازه دلنشین است.",
        ],
        program: [
          { part: "بخش اول", items: [["پیش‌درآمد در دستگاه شور", "ساخته‌ی گروه"], ["چهارمضراب اصفهان", "تنظیم ویژه‌ی ارکستر"], ["آواز و ساز در ماهور", "تک‌نوازی تار و سنتور"]] },
          { part: "بخش دوم", items: [["رِنگ شهرآشوب", "اجرای گروهی"], ["تصنیف «نوای نی‌ریز»", "همراه با کمانچه و عود"]] },
        ],
        tiers: [["ردیف‌های A تا C", 500000], ["ردیف‌های D تا F", 420000], ["ردیف‌های G تا J", 350000]],
      },
      {
        id: 2, status: "upcoming", title: "گفت‌وگوی تار و سنتور",
        day: "۲۰", month: "آبان", date: "۲۰ آبان ۱۴۰۵", time: "۲۰:۰۰", venue: "تالار هنر اصفهان", duration: "۹۰ دقیقه",
        from: 350000, tone: 2,
        short: "دوئتی صمیمی میان دو ساز اصیل مضرابی؛ بداهه‌نوازی و قطعاتی از استادان گذشته.",
        about: ["«گفت‌وگوی تار و سنتور» اجرایی کم‌جمعیت و صمیمی است که در آن دو ساز مضرابی با هم سخن می‌گویند. بداهه‌نوازی، پرسش و پاسخ ملودیک و قطعاتی از آهنگسازان بزرگ موسیقی ایرانی، هسته‌ی این شب را می‌سازند."],
        program: [{ part: "بخش اول", items: [["درآمد در همایون", "تار و سنتور"], ["گفت‌وگو در چهارگاه", "بداهه"]] }, { part: "بخش دوم", items: [["قطعه‌ای از ردیف میرزا عبدالله", "سنتور"], ["پایان‌بندی در اصفهان", "اجرای دو نفره"]] }],
        tiers: [["ردیف‌های A تا C", 500000], ["ردیف‌های D تا F", 420000], ["ردیف‌های G تا J", 350000]],
      },
      {
        id: 3, status: "upcoming", title: "شب یلدا با مضراب",
        day: "۳۰", month: "آذر", date: "۳۰ آذر ۱۴۰۵", time: "۲۱:۰۰", venue: "تالار هنر اصفهان", duration: "۱۱۰ دقیقه",
        from: 350000, tone: 4,
        short: "بلندترین شب سال، با نواهای شاد و دل‌نشین و قطعاتی برای هم‌خوانی.",
        about: ["بلندترین شب سال را با ارکستر مضرابی اصفهان بگذرانید؛ شبی از ترانه‌های آشنا، قطعات رقصی و نواهایی که یادآور دورهمی‌های خانوادگی است."],
        program: [{ part: "بخش اول", items: [["پیش‌درآمد یلدایی", "ارکستر"], ["ترانه‌های محلی اصفهان", "اجرای گروهی"]] }, { part: "بخش دوم", items: [["رِنگ‌های شاد", "ارکستر"], ["هم‌خوانی با حضار", "ویژه‌ی پایان شب"]] }],
        tiers: [["ردیف‌های A تا C", 500000], ["ردیف‌های D تا F", 420000], ["ردیف‌های G تا J", 350000]],
      },
      { id: 4, status: "past", title: "نوای بهاری", date: "۱۸ فروردین ۱۴۰۵", venue: "تالار هنر اصفهان", tone: 3, short: "اجرای ویژه‌ی نوروز با قطعات شاد و بهاری." },
      { id: 5, status: "past", title: "شب‌های سه‌تار", date: "۱۲ بهمن ۱۴۰۴", venue: "خانه‌ی هنرمندان اصفهان", tone: 5, short: "شبی آرام و نزدیک با صدای سه‌تار و عود." },
      { id: 6, status: "past", title: "چهارمضراب در چهل‌ستون", date: "۲۴ مهر ۱۴۰۴", venue: "کاخ چهل‌ستون", tone: 6, short: "اجرای روباز در باغ‌های تاریخی اصفهان." },
    ],
    members: [
      { name: "محمد ابراهیمیان", role: "سرپرست و نوازنده", tone: 1 },
      { name: "علی رضایی", role: "نوازنده تار", tone: 2 },
      { name: "سارا احمدی", role: "نوازنده سنتور", tone: 4 },
      { name: "نیما کریمی", role: "نوازنده عود", tone: 3 },
      { name: "مهسا صادقی", role: "نوازنده سه‌تار", tone: 5 },
      { name: "پوریا حسینی", role: "نوازنده تنبک", tone: 6 },
      { name: "آرزو موسوی", role: "نوازنده کمانچه", tone: 2 },
      { name: "کیان نوری", role: "نوازنده نی", tone: 4 },
    ],
    instruments: [
      { key: "tar", name: "تار", note: "ساز مضرابی با دو کاسه و ششوانک" },
      { key: "santur", name: "سنتور", note: "ساز مضرابی با سیم‌های ضربه‌ای" },
      { key: "oud", name: "عود", note: "ساز گرم و عمیق با دسته‌ی کوتاه" },
      { key: "setar", name: "سه‌تار", note: "ساز لطیف و صمیمی" },
      { key: "tonbak", name: "تنبک", note: "ساز ضربی و قلب ریتم" },
      { key: "kamancheh", name: "کمانچه", note: "ساز آرشه‌ای و خوش‌آوا" },
    ],
    gallery: [
      { cap: "اجرای زنده", h: 360, tone: 1, g: "mic" },
      { cap: "پشت صحنه", h: 240, tone: 3, g: "note" },
      { cap: "تمرین", h: 300, tone: 5, g: "note" },
      { cap: "نوازندگان", h: 420, tone: 2, g: "mic" },
      { cap: "سازها", h: 260, tone: 4, g: "note" },
      { cap: "سالن", h: 340, tone: 6, g: "mic" },
    ],
  };

  /* Expose a small API for other scripts (booking.js etc.) */
  window.MZ = { DATA, toFa, fmt, $, $$, ICON, placeholder };

  /* ---------- Header / Footer partials ---------- */
  const NAV = [
    ["index.html", "خانه", "home"],
    ["about.html", "ارکستر", "about"],
    ["concerts.html", "اجراها", "concerts"],
    ["index.html#gallery", "گالری", "gallery"],
    ["contact.html", "تماس", "contact"],
  ];

  function renderHeader() {
    const host = $("#site-header");
    if (!host) return;
    const page = document.body.dataset.page || "";
    const solid = document.body.dataset.header === "solid";
    host.className = "site-header" + (solid ? " is-solid" : "");
    host.innerHTML = `
      <div class="container site-header__inner">
        <a class="logo" href="index.html" aria-label="ارکستر مضرابی اصفهان — صفحه اصلی">
          <span class="logo__fa">ارکستر مضرابی اصفهان</span>
          <span class="logo__en">MOZRABI ORCHESTRA</span>
        </a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="باز کردن منو"><span></span></button>
        <nav class="nav" id="main-nav" aria-label="منوی اصلی">
          <ul class="nav__list">
            ${NAV.map(([href, label, key]) => `<li><a class="nav__link" href="${href}"${key === page ? ' aria-current="page"' : ""}>${label}</a></li>`).join("")}
          </ul>
          <a class="btn btn--sm" href="booking.html">رزرو بلیت</a>
        </nav>
      </div>`;

    const toggle = $(".menu-toggle", host);
    const setMenu = (open) => {
      host.classList.toggle("menu-open", open);
      document.body.classList.toggle("menu-lock", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "بستن منو" : "باز کردن منو");
    };
    toggle.addEventListener("click", () => setMenu(!host.classList.contains("menu-open")));
    $$(".nav a", host).forEach((a) => a.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
    window.addEventListener("resize", () => { if (window.innerWidth > 960) setMenu(false); });

    const onScroll = () => host.classList.toggle("is-scrolled", window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function renderFooter() {
    const host = $("#site-footer");
    if (!host) return;
    host.className = "site-footer";
    host.innerHTML = `
      <div class="container">
        <div class="footer__grid">
          <div class="footer__about">
            <a class="logo" href="index.html"><span class="logo__fa">ارکستر مضرابی اصفهان</span><span class="logo__en">MOZRABI ORCHESTRA</span></a>
            <p>روایتی معاصر از موسیقی ایرانی با صدای سازهای مضرابی؛ از اصفهان، برای شنوندگان موسیقی در هر جای دنیا.</p>
            <div class="social">
              <a href="#" aria-label="اینستاگرام">${ICON.insta}</a>
              <a href="#" aria-label="تلگرام">${ICON.tg}</a>
              <a href="#" aria-label="یوتیوب">${ICON.yt}</a>
            </div>
          </div>
          <div class="footer__col">
            <h3>دسترسی سریع</h3>
            <ul>${NAV.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join("")}<li><a href="booking.html">رزرو بلیت</a></li></ul>
          </div>
          <div class="footer__col">
            <h3>تماس</h3>
            <ul>
              <li><a href="contact.html">اصفهان، تالار هنر اصفهان</a></li>
              <li><a href="tel:+983112345678" class="num">${toFa("031-12345678")}</a></li>
              <li><a href="mailto:info@mozrabi-orchestra.example">info@mozrabi-orchestra.example</a></li>
            </ul>
          </div>
        </div>
        <div class="footer__bottom">
          <span>© ۱۴۰۵ ارکستر مضرابی اصفهان — تمامی حقوق محفوظ است.</span>
          <span>نسخه‌ی نمایشی · اطلاعات این سایت نمونه است</span>
        </div>
      </div>`;
  }

  /* ---------- List renderers ---------- */
  const arrowLink = (href, label) => `<a class="link-arrow" href="${href}">${label}${ICON.arrow}</a>`;

  const RENDER = {
    members(el) {
      el.innerHTML = DATA.members.slice(0, +(el.dataset.limit || 99)).map((m, i) => `
        <article class="member reveal" style="--d:${(i % 4) * 0.08}s">
          <div class="member__photo">${placeholder(m.tone, "note", "تصویر " + m.name)}</div>
          <h3>${m.name}</h3><p>${m.role}</p>
        </article>`).join("");
    },
    instruments(el) {
      el.innerHTML = DATA.instruments.map((s, i) => `
        <article class="instrument reveal" style="--d:${i * 0.06}s">
          <div class="instrument__art" role="img" aria-label="طرح ساز ${s.name}">${INSTR[s.key]}</div>
          <h3>${s.name}</h3><p>${s.note}</p>
        </article>`).join("");
    },
    past(el) {
      const list = DATA.concerts.filter((c) => c.status === "past").concat([{ id: 7, title: "جشن تابستانی", date: "۱۰ شهریور ۱۴۰۴", tone: 2 }]).slice(0, 4);
      el.innerHTML = list.map((c, i) => `
        <a class="ed reveal-img" href="concert.html?id=${c.id}" style="--d:${i * 0.12}s" aria-label="${c.title} — مشاهده">
          ${placeholder(c.tone, i % 2 ? "note" : "mic", "تصویر اجرای " + c.title)}
          <div class="ed__cap"><small class="num">${c.date}</small><h3>${c.title}</h3><span>مشاهده ${ICON.arrow}</span></div>
        </a>`).join("");
    },
    gallery(el) {
      el.innerHTML = DATA.gallery.map((g, i) => `
        <figure class="masonry__item reveal" style="--d:${(i % 3) * 0.08}s">
          <div style="height:${g.h}px">${placeholder(g.tone, g.g, "گالری: " + g.cap)}</div>
          <figcaption>${g.cap}</figcaption>
        </figure>`).join("");
    },
    "concerts-upcoming"(el) {
      el.innerHTML = DATA.concerts.filter((c) => c.status === "upcoming").map((c, i) => `
        <article class="concert-row reveal" style="--d:${i * 0.08}s">
          <div class="concert-row__date"><strong>${c.day}</strong><span>${c.month} ۱۴۰۵</span></div>
          <div>
            <h3><a href="concert.html?id=${c.id}">${c.title}</a></h3>
            <div class="concert-row__meta"><span>${c.venue}</span><span class="num">ساعت ${c.time}</span><span>${c.duration}</span></div>
            <p>${c.short}</p>
          </div>
          <div class="concert-row__actions">
            <div class="concert-row__price">شروع از <strong class="num">${fmt(c.from)}</strong> تومان</div>
            <a class="btn btn--sm btn--solid" href="booking.html?id=${c.id}">رزرو بلیت</a>
            <a class="link-arrow" style="justify-content:center" href="concert.html?id=${c.id}">مشاهده جزئیات</a>
          </div>
        </article>`).join("");
    },
    "concerts-past"(el) {
      el.innerHTML = DATA.concerts.filter((c) => c.status === "past").map((c, i) => `
        <a class="past reveal" href="concert.html?id=${c.id}" style="--d:${i * 0.1}s">
          <div class="past__img">${placeholder(c.tone, "note", "تصویر اجرای " + c.title)}</div>
          <small class="num">${c.date}</small>
          <h3>${c.title}</h3>
          <p>${c.short}</p>
          <span class="link-arrow">مشاهده اجرا ${ICON.arrow}</span>
        </a>`).join("");
    },
  };

  /* Concert detail page binding */
  function renderConcertDetail() {
    const root = $("[data-concert-detail]");
    if (!root) return;
    const id = +new URLSearchParams(location.search).get("id") || 1;
    const c = DATA.concerts.find((x) => x.id === id) || DATA.concerts[0];
    const past = c.status === "past";
    document.title = `${c.title} — ارکستر مضرابی اصفهان`;
    const set = (k, v) => $$(`[data-bind="${k}"]`).forEach((n) => (n.textContent = v));
    set("title", c.title); set("date", c.date); set("venue", c.venue);
    set("time", c.time || "۲۰:۳۰"); set("duration", c.duration || "۱۲۰ دقیقه");

    const about = c.about || [c.short, "این اجرا در آرشیو ارکستر مضرابی اصفهان نگهداری می‌شود و بخشی از مسیر هنری گروه در سال‌های اخیر است."];
    $("[data-about]").innerHTML = about.map((p) => `<p>${p}</p>`).join("");

    const prog = c.program || DATA.concerts[0].program;
    $("[data-program]").innerHTML = prog.map((s) => `
      <div class="program__part reveal"><h3>${s.part}</h3><ol style="list-style:none;padding:0;margin:0">
        ${s.items.map((it, i) => `<li><span class="num">${toFa(i + 1)}</span><div><b>${it[0]}</b><small>${it[1]}</small></div></li>`).join("")}
      </ol></div>`).join("");

    const tiers = c.tiers || DATA.concerts[0].tiers;
    $("[data-tiers]").innerHTML = tiers.map((t) => `<li><span>${t[0]}</span><strong class="num">${fmt(t[1])} تومان</strong></li>`).join("");

    $$("[data-book-link]").forEach((a) => {
      if (past) { a.setAttribute("aria-disabled", "true"); a.removeAttribute("href"); a.textContent = "این اجرا برگزار شده است"; }
      else a.href = `booking.html?id=${c.id}`;
    });
    if (past) $$("[data-hide-past]").forEach((n) => (n.hidden = true));
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    const els = $$(".reveal, .reveal-img");
    if (typeof window.IntersectionObserver !== "function") { els.forEach((e) => e.classList.add("is-in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach((e) => io.observe(e));
  }

  /* ---------- Contact form (mock) ---------- */
  function initContactForm() {
    const form = $("#contact-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!validateForm(form)) return;
      form.reset();
      const ok = $(".form-success");
      ok.classList.add("is-on");
      ok.focus();
    });
  }

  /* Generic light validation, shared with checkout */
  function validateForm(form) {
    let valid = true, first = null;
    $$("[data-validate]", form).forEach((inp) => {
      const v = inp.value.trim();
      const rule = inp.dataset.validate;
      let ok = true;
      if (inp.required && !v) ok = false;
      if (ok && v && rule === "mobile") ok = /^(\+98|0098|0)?9\d{9}$/.test(v.replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/\s|-/g, ""));
      if (ok && v && rule === "email") ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      inp.setAttribute("aria-invalid", String(!ok));
      if (!ok) { valid = false; first = first || inp; }
    });
    if (first) first.focus();
    return valid;
  }
  window.MZ.validateForm = validateForm;

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    renderHeader();
    renderFooter();
    $$("[data-render]").forEach((el) => { const fn = RENDER[el.dataset.render]; if (fn) fn(el); });
    renderConcertDetail();
    initContactForm();
    initReveal();
  });
})();
