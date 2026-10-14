/* ==========================================================================
   ارکستر مضرابی اصفهان — main.js
   Shared: helpers · header/footer · reveal · API-driven list renderers (loading / error / empty states)
   All data comes from window.MZ.api (api.js). No mock data lives here.
   ========================================================================== */
(function () {
  "use strict";
  const MZ = (window.MZ = window.MZ || {});
  const api = MZ.api;

  /* ---------- Helpers ---------- */
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const toFa = (v) => String(v).replace(/\d/g, (d) => FA[d]);
  const fmt = (n) => toFa(Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  /** Escape anything that came from the server before it goes into innerHTML. */
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };

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

  /* Line-art instrument illustrations (decorative, keyed by Instrument.key) */
  const INSTR = {
    tar: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 6v78"/><rect x="26" y="4" width="8" height="18" rx="1"/><path d="M30 84c-14 0-20 8-18 18 1 5 5 7 8 8-5 3-8 8-6 14 2 8 10 12 16 12s14-4 16-12c2-6-1-11-6-14 3-1 7-3 8-8 2-10-4-18-18-18Z"/><path d="M30 92v50M25 96v44M35 96v44"/></svg>',
    santur: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M10 96 34 24h52l24 72Z"/><path d="M20 84 40 34M30 84 46 34M40 84 52 34M50 84 58 34M60 84V34M70 84 62 34M80 84 68 34M90 84 74 34M100 84 80 34"/><circle cx="26" cy="92" r="1.6"/><circle cx="94" cy="92" r="1.6"/></svg>',
    oud: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 8v62"/><path d="M26 4c0 8 4 12 4 12s4-4 4-12"/><path d="M30 70c-18 0-26 14-24 30 2 18 14 30 24 30s22-12 24-30c2-16-6-30-24-30Z"/><circle cx="30" cy="104" r="7"/><path d="M30 70v52M25 72v50M35 72v50"/></svg>',
    setar: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 6v100"/><rect x="26" y="4" width="8" height="14" rx="1"/><path d="M30 106c-11 0-16 7-15 15s7 14 15 14 14-6 15-14-4-15-15-15Z"/><path d="M30 110v20"/></svg>',
    tonbak: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><ellipse cx="30" cy="38" rx="22" ry="7"/><path d="M8 38c0 10 12 14 12 24 0 6-2 12-2 18 0 10 8 12 8 24 0 12-6 14-6 20h20c0-6-6-8-6-20 0-12 8-14 8-24 0-6-2-12-2-18 0-10 12-14 12-24"/></svg>',
    kamancheh: '<svg viewBox="0 0 60 160" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M30 4v100"/><rect x="26" y="4" width="8" height="18" rx="1"/><circle cx="30" cy="112" r="20"/><path d="M30 132v26"/><path d="M24 94v34M36 94v34"/></svg>',
  };
  const GENERIC_INSTR = INSTR.setar;

  const placeholder = (tone, glyph, label) =>
    `<div class="ph" data-tone="${tone}" role="img" aria-label="${esc(label)}"><div class="ph__glyph">${ICON[glyph] || ICON.note}</div></div>`;
  const tone = (id) => ((Number(id) || 0) % 6) + 1; // presentation only: the API has no "tone"

  Object.assign(MZ, { toFa, fmt, $, $$, ICON, placeholder, esc, safeUrl });

  /* ---------- Loading / error / empty states ---------- */
  function showState(el, kind, message, onRetry) {
    const spin = kind === "loading" ? '<div class="state__spin" aria-hidden="true"></div>' : "";
    el.innerHTML = `<div class="state state--${kind}" role="${kind === "error" ? "alert" : "status"}">${spin}<p>${esc(message)}</p>${onRetry ? '<button type="button" class="btn btn--sm" data-retry>تلاش دوباره</button>' : ""}</div>`;
    if (onRetry) $("[data-retry]", el).addEventListener("click", onRetry);
  }
  const errMsg = (e) => (e && e.message) || "خطایی رخ داد. دوباره تلاش کنید.";
  /** Run `fetcher`, show loading → (error | empty | rendered). */
  async function populate(el, fetcher, render, emptyMsg) {
    showState(el, "loading", "در حال بارگذاری…");
    try {
      const data = await fetcher();
      if (!data || (Array.isArray(data) && !data.length)) { showState(el, "empty", emptyMsg); return; }
      el.innerHTML = render(data);
      reveal(el);
    } catch (e) {
      showState(el, "error", errMsg(e), () => populate(el, fetcher, render, emptyMsg));
    }
  }

  /* ---------- Session / health (shared, fetched once per page) ---------- */
  let mePromise = null;
  MZ.me = (force) => { if (!mePromise || force) mePromise = api.me().catch(() => null); return mePromise; };
  let healthPromise = null;
  MZ.health = () => (healthPromise = healthPromise || api.health().catch(() => null));

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
            <li><a class="nav__link" href="account.html" data-auth-link${page === "account" ? ' aria-current="page"' : ""}>ورود / ثبت‌نام</a></li>
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

    MZ.me().then((u) => { const a = $("[data-auth-link]", host); if (a && u) a.textContent = "حساب من"; });
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
          <span data-demo-note hidden>نسخه‌ی آزمایشی · درگاه پرداخت واقعی متصل نیست</span>
        </div>
      </div>`;
  }

  /* Demo notes ("payment is fake") are shown ONLY when the server reports the mock payment provider. */
  async function applyDemoNotes() {
    const h = await MZ.health();
    const isMock = !!(h && h.paymentProvider === "mock");
    $$("[data-demo-note]").forEach((n) => { n.hidden = !isMock; });
    if (MZ.config && MZ.config.MOCK && !$("#dev-banner")) {
      const b = document.createElement("div");
      b.id = "dev-banner"; b.className = "dev-banner"; b.textContent = "حالت توسعه: داده‌های نمونه‌ی مرورگر (mock) — به سرور متصل نیست";
      document.body.appendChild(b);
    }
  }

  /* ---------- Reveal on scroll ---------- */
  let io = null;
  function reveal(root = document) {
    const els = $$(".reveal:not(.is-in), .reveal-img:not(.is-in)", root);
    if (typeof window.IntersectionObserver !== "function") { els.forEach((e) => e.classList.add("is-in")); return; }
    io = io || new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach((e) => io.observe(e));
  }

  /* ---------- List renderers ---------- */
  const arrow = ICON.arrow;
  const venueName = (c) => (c.venue && c.venue.name) || "";
  const concertsCache = {};
  const loadConcerts = (phase, pageSize = 50) => (concertsCache[phase + pageSize] = concertsCache[phase + pageSize] || api.concerts({ phase, pageSize }));
  const retryable = (key, fn) => () => { delete concertsCache[key]; return fn(); };

  const RENDER = {
    members(el) {
      const limit = +(el.dataset.limit || 99);
      return populate(el, () => api.members().then((l) => l.slice(0, limit)), (list) => list.map((m, i) => {
        const img = safeUrl(m.imageUrl);
        return `<article class="member reveal" style="--d:${(i % 4) * 0.08}s">
          <div class="member__photo">${img ? `<img src="${esc(img)}" alt="تصویر ${esc(m.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : placeholder(tone(m.id), "note", "تصویر " + m.name)}</div>
          <h3>${esc(m.name)}</h3><p>${esc(m.title)}</p>
        </article>`;
      }).join(""), "هنوز عضوی ثبت نشده است.");
    },
    instruments(el) {
      return populate(el, () => api.instruments(), (list) => list.map((s, i) => `
        <article class="instrument reveal" style="--d:${i * 0.06}s">
          <div class="instrument__art" role="img" aria-label="طرح ساز ${esc(s.name)}">${INSTR[s.key] || GENERIC_INSTR}</div>
          <h3>${esc(s.name)}</h3><p>${esc(s.description)}</p>
        </article>`).join(""), "هنوز سازی ثبت نشده است.");
    },
    past(el) {
      return populate(el, retryable("past4", () => loadConcerts("past", 4)), (list) => list.map((c, i) => `
        <a class="ed reveal-img" href="concert.html?id=${c.id}" style="--d:${i * 0.12}s" aria-label="${esc(c.title)} — مشاهده">
          ${placeholder(tone(c.id), i % 2 ? "note" : "mic", "تصویر اجرای " + c.title)}
          <div class="ed__cap"><small class="num">${esc(c.display.date)}</small><h3>${esc(c.title)}</h3><span>مشاهده ${arrow}</span></div>
        </a>`).join(""), "هنوز اجرای گذشته‌ای ثبت نشده است.");
    },
    gallery(el) {
      const H = [360, 240, 300, 420, 260, 340];
      return populate(el, () => api.gallery(), (list) => list.map((g, i) => {
        const img = safeUrl(g.imageUrl);
        return `<figure class="masonry__item reveal" style="--d:${(i % 3) * 0.08}s">
          <div style="height:${H[i % H.length]}px">${img ? `<img src="${esc(img)}" alt="${esc(g.title)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : placeholder(tone(g.id), i % 2 ? "note" : "mic", "گالری: " + g.title)}</div>
          <figcaption>${esc(g.title)}</figcaption>
        </figure>`;
      }).join(""), "هنوز تصویری در گالری نیست.");
    },
    "concerts-upcoming"(el) {
      return populate(el, retryable("upcoming50", () => loadConcerts("upcoming")), (list) => list.map((c, i) => `
        <article class="concert-row reveal" style="--d:${i * 0.08}s">
          <div class="concert-row__date"><strong>${esc(c.display.day)}</strong><span>${esc(c.display.month)} ${esc(c.display.year)}</span></div>
          <div>
            <h3><a href="concert.html?id=${c.id}">${esc(c.title)}</a></h3>
            <div class="concert-row__meta"><span>${esc(venueName(c))}</span><span class="num">ساعت ${esc(c.display.time)}</span><span>${esc(c.display.duration || "")}</span></div>
            <p>${esc(c.summary)}</p>
          </div>
          <div class="concert-row__actions">
            ${c.fromPrice != null ? `<div class="concert-row__price">شروع از <strong class="num">${fmt(c.fromPrice)}</strong> تومان</div>` : ""}
            ${c.bookable ? `<a class="btn btn--sm btn--solid" href="booking.html?id=${c.id}">رزرو بلیت</a>` : ""}
            <a class="link-arrow" style="justify-content:center" href="concert.html?id=${c.id}">مشاهده جزئیات</a>
          </div>
        </article>`).join(""), "فعلاً اجرای پیش‌رویی برنامه‌ریزی نشده است. به‌زودی دوباره سر بزنید.");
    },
    "concerts-past"(el) {
      return populate(el, retryable("past50", () => loadConcerts("past")), (list) => list.map((c, i) => `
        <a class="past reveal" href="concert.html?id=${c.id}" style="--d:${i * 0.1}s">
          <div class="past__img">${placeholder(tone(c.id), "note", "تصویر اجرای " + c.title)}</div>
          <small class="num">${esc(c.display.date)}</small>
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.summary)}</p>
          <span class="link-arrow">مشاهده اجرا ${arrow}</span>
        </a>`).join(""), "هنوز اجرای گذشته‌ای ثبت نشده است.");
    },
    /* Home page "next concert" feature block (same markup the static page had) */
    feature(el) {
      return populate(el, retryable("upcoming50", () => loadConcerts("upcoming").then((l) => l.slice(0, 1))), ([c]) => `
        <article class="feature reveal">
          <div class="feature__media">
            <div class="ph" data-tone="${tone(c.id)}" role="img" aria-label="تصویر اجرای ${esc(c.title)}"></div>
            <div class="feature__date"><strong>${esc(c.display.day)}</strong><span>${esc(c.display.month)} ${esc(c.display.year)}</span></div>
          </div>
          <div class="feature__body">
            <span class="eyebrow">اجرای ویژه</span>
            <h3 class="feature__title">${esc(c.title)}</h3>
            <ul class="feature__list">
              <li><span>موسیقی</span><strong class="num">ایرانی و مضرابی</strong></li>
              <li><span>محل</span><strong>${esc(venueName(c))}</strong></li>
              <li><span>مدت اجرا</span><strong class="num">${esc(c.display.duration || "")}</strong></li>
            </ul>
            ${c.fromPrice != null ? `<div class="price-from"><small>شروع از</small><strong class="num">${fmt(c.fromPrice)}</strong><span>تومان</span></div>` : ""}
            <div class="feature__actions" style="display:flex;gap:1rem;flex-wrap:wrap">
              ${c.bookable ? `<a class="btn btn--solid" href="booking.html?id=${c.id}">رزرو بلیت</a>` : ""}
              <a class="btn" href="concert.html?id=${c.id}">مشاهده جزئیات</a>
            </div>
          </div>
        </article>`, "فعلاً اجرای پیش‌رویی برنامه‌ریزی نشده است.");
    },
  };

  /* Concert detail page */
  async function renderConcertDetail() {
    const root = $("[data-concert-detail]");
    if (!root) return;
    const id = new URLSearchParams(location.search).get("id");
    const body = $("[data-concert-body]", root) || root;
    const sections = $$("[data-concert-section]", root);
    const setHidden = (h) => sections.forEach((s) => (s.hidden = h));
    const run = async () => {
      if (!/^\d+$/.test(id || "")) { setHidden(true); showState($("[data-concert-state]"), "empty", "اجرایی انتخاب نشده است."); return; }
      setHidden(true);
      showState($("[data-concert-state]"), "loading", "در حال بارگذاری اجرا…");
      let c;
      try { c = await api.concert(id); }
      catch (e) {
        showState($("[data-concert-state]"), e.status === 404 ? "empty" : "error", e.status === 404 ? "این اجرا پیدا نشد." : errMsg(e), e.status === 404 ? null : run);
        return;
      }
      $("[data-concert-state]").innerHTML = "";
      setHidden(false);
      const past = !c.bookable;
      document.title = `${c.title} — ارکستر مضرابی اصفهان`;
      const set = (k, v) => $$(`[data-bind="${k}"]`).forEach((n) => (n.textContent = v));
      set("title", c.title); set("date", c.display.date); set("venue", venueName(c));
      set("time", c.display.time); set("duration", c.display.duration || "—");

      $("[data-about]").innerHTML = (c.about.length ? c.about : [c.summary]).map((p) => `<p>${esc(p)}</p>`).join("");
      $("[data-program]").innerHTML = c.program && c.program.length
        ? c.program.map((s) => `
          <div class="program__part reveal"><h3>${esc(s.part)}</h3><ol style="list-style:none;padding:0;margin:0">
            ${(s.items || []).map((it, i) => `<li><span class="num">${toFa(i + 1)}</span><div><b>${esc(it.title)}</b><small>${esc(it.note || "")}</small></div></li>`).join("")}
          </ol></div>`).join("")
        : '<p class="state" style="padding:1rem 0;justify-items:start;text-align:start">برنامه‌ی قطعات این اجرا ثبت نشده است.</p>';
      $("[data-tiers]").innerHTML = (c.tiers || []).map((t) => `<li><span>${esc(t.name)}</span><strong class="num">${fmt(t.amount)} تومان</strong></li>`).join("");

      $$("[data-book-link]").forEach((a) => {
        if (past) {
          a.setAttribute("aria-disabled", "true"); a.removeAttribute("href");
          a.textContent = c.phase === "past" ? "این اجرا برگزار شده است" : c.status === "CANCELLED" ? "این اجرا لغو شده است" : "فروش بلیت بسته است";
        } else a.href = `booking.html?id=${c.id}`;
      });
      $$("[data-hide-past]").forEach((n) => (n.hidden = past));
      if (!past) api.seats(c.id).then((m) => { set("capacity", toFa(m.summary.total)); }).catch(() => { const p = $("[data-capacity-note]"); if (p) p.hidden = true; });
      reveal(root);
    };
    run();
  }

  /* ---------- Forms ---------- */
  function validateForm(form) {
    let valid = true, first = null;
    $$("[data-validate]", form).forEach((inp) => {
      const v = (inp.type === "checkbox" ? (inp.checked ? "1" : "") : inp.value).trim();
      const rule = inp.dataset.validate;
      let ok = true;
      if (inp.required && !v) ok = false;
      if (ok && v && rule === "mobile") ok = /^(\+98|0098|0)?9\d{9}$/.test(v.replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/\s|-/g, ""));
      if (ok && v && rule === "email") ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (ok && v && rule === "password") ok = v.length >= 8;
      inp.setAttribute("aria-invalid", String(!ok));
      if (!ok) { valid = false; first = first || inp; }
    });
    if (first) first.focus();
    return valid;
  }
  MZ.validateForm = validateForm;

  /** Show a server error on a form: the message, plus field-level marks when the API names fields. */
  function formError(form, e) {
    const box = $("[data-form-error]", form) || $(".form-error", form.parentElement);
    if (box) { box.textContent = errMsg(e); box.classList.add("is-on"); box.focus && box.focus(); }
  }
  const clearFormError = (form) => { const box = $("[data-form-error]", form) || $(".form-error", form.parentElement); if (box) box.classList.remove("is-on"); };
  Object.assign(MZ, { showState, errMsg, formError, clearFormError, reveal });

  function initContactForm() {
    const form = $("#contact-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFormError(form);
      if (!validateForm(form)) return;
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      try {
        const phone = $("#c-phone").value.trim();
        await api.contact({ name: $("#c-name").value.trim(), email: $("#c-email").value.trim(), phone: phone || undefined, message: $("#c-msg").value.trim() });
        form.reset();
        const ok = $(".form-success");
        ok.classList.add("is-on");
        ok.focus();
      } catch (err) { formError(form, err); }
      finally { btn.disabled = false; }
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    renderHeader();
    renderFooter();
    $$("[data-render]").forEach((el) => { const fn = RENDER[el.dataset.render]; if (fn) fn(el); });
    renderConcertDetail();
    initContactForm();
    reveal();
    applyDemoNotes();
  });
})();
