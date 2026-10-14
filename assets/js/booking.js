/* ==========================================================================
   booking.js — Seat selection · Checkout · Digital ticket (backed by the REST API)
   - Seat availability, prices, totals and the countdown all come from the server.
   - Nothing here is trusted by the server: it re-checks seats, re-prices, and verifies payment itself.
   - sessionStorage holds only UI convenience (selected seat ids, last hold id), never prices or payment state.
   ========================================================================== */
(function () {
  "use strict";
  const { api, toFa, fmt, $, $$, esc, showState, errMsg, formError, clearFormError } = window.MZ;

  const KEY_BOOKING = "mz_booking"; // { concertId, seatIds:[...] }
  const KEY_HOLD = "mz_hold";       // { id, concertId }  last reservation this browser created
  const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const drop = (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } };

  const seatLabel = (s) => `ردیف ${esc(s.row)} — صندلی ${toFa(s.number)}`;
  const nextParam = () => encodeURIComponent(location.pathname.split("/").pop() + location.search);
  const goLogin = () => { location.href = "account.html?next=" + nextParam(); };

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 4200);
  }

  const uuidish = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g, "");

  /* =======================================================================
     BOOKING PAGE
     ======================================================================= */
  async function initBooking() {
    const plan = $("#seat-plan");
    if (!plan) return;
    const rowsEl = $("#seat-rows");
    const contBtn = $("#continue"), barBtn = $("#bar-continue");
    [contBtn, barBtn].forEach((b) => (b.disabled = true));

    let concertId = new URLSearchParams(location.search).get("id");
    const stateHost = document.createElement("div");
    rowsEl.parentElement.insertBefore(stateHost, rowsEl);

    const start = async () => {
      stateHost.innerHTML = ""; rowsEl.innerHTML = "";
      showState(stateHost, "loading", "در حال بارگذاری پلان تالار…");
      try {
        if (!/^\d+$/.test(concertId || "")) { // no id given → the next bookable concert
          const list = await api.concerts({ phase: "upcoming", pageSize: 1 });
          if (!list.length) { showState(stateHost, "empty", "فعلاً اجرایی برای رزرو وجود ندارد."); return; }
          concertId = String(list[0].id);
        }
        const [concert, map] = await Promise.all([api.concert(concertId), api.seats(concertId)]);
        stateHost.innerHTML = "";
        build(concert, map);
      } catch (e) {
        showState(stateHost, e.status === 404 ? "empty" : "error", e.status === 404 ? "این اجرا پیدا نشد." : errMsg(e), e.status === 404 ? null : start);
      }
    };
    start();

    function build(concert, map) {
      const MAX = map.maxSeatsPerReservation || 6;
      const cid = concert.id;
      const info = { title: concert.title, date: concert.display.date, time: concert.display.time, venue: concert.venue.name };
      $$("[data-bind]").forEach((n) => { if (info[n.dataset.bind]) n.textContent = info[n.dataset.bind]; });
      $$("[data-bind-max]").forEach((n) => (n.textContent = toFa(MAX)));
      document.title = `انتخاب صندلی — ${concert.title}`;

      if (!map.bookable) { showState(stateHost, "empty", "فروش بلیت این اجرا فعال نیست."); return; }

      const seatById = new Map();
      map.rows.forEach((r) => r.seats.forEach((s) => seatById.set(s.id, { ...s, row: r.label })));

      // restore selection (same concert only); the server re-validates everything later anyway
      const prev = load(KEY_BOOKING);
      let selected = prev && prev.concertId === cid ? prev.seatIds.filter((id) => seatById.has(id) && seatById.get(id).available) : [];

      /* Build hall */
      rowsEl.innerHTML = map.rows.map((row) => {
        const n = row.seats.length, half = Math.ceil(n / 2);
        const seats = (list) => list.map((s) => `<button type="button" class="seat" data-id="${s.id}" data-row="${esc(row.label)}" data-num="${s.number}"
            aria-pressed="${selected.includes(s.id)}" ${s.available ? "" : "disabled"}
            aria-label="ردیف ${esc(row.label)}، صندلی ${toFa(s.number)} — ${s.available ? fmt(s.price) + " تومان" : "فروخته شده"}"><span>${toFa(s.number)}</span></button>`).join("");
        return `<div class="seat-row" role="group" aria-label="ردیف ${esc(row.label)}">
          <span class="seat-row__label" aria-hidden="true">${esc(row.label)}</span>
          <div class="seat-block">${seats(row.seats.slice(0, half))}</div>
          <div class="aisle" aria-hidden="true"></div>
          <div class="seat-block">${seats(row.seats.slice(half))}</div>
          <span class="seat-row__label" aria-hidden="true">${esc(row.label)}</span>
        </div>`;
      }).join("");
      $("#tier-key").innerHTML = map.tiers.map((t) => `<span>${esc(t.name)}: <b class="num">${fmt(t.amount)} تومان</b></span>`).join("");

      const chosenEl = $("#chosen"), countEl = $("#chosen-count"), linesEl = $("#sum-lines"), totalEl = $("#total");
      const barCount = $("#bar-count"), barTotal = $("#bar-total");
      const sheet = $("#sheet"), sheetToggle = $("#sheet-toggle"), sheetList = $("#sheet-list"), sheetLines = $("#sheet-lines"), sheetCount = $("#sheet-count");
      let busy = false;

      function setSheet(open) { sheet.hidden = !open; sheetToggle.setAttribute("aria-expanded", String(open)); }
      sheetToggle.addEventListener("click", () => setSheet(sheet.hidden));
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) setSheet(false); });

      function render() {
        const sorted = selected.map((id) => seatById.get(id)).sort((a, b) => (a.row === b.row ? a.number - b.number : a.row.localeCompare(b.row)));
        countEl.textContent = toFa(sorted.length) + " از " + toFa(MAX);
        chosenEl.innerHTML = sorted.length
          ? sorted.map((s) => `<li><span>${seatLabel(s)}</span><span class="num">${fmt(s.price)}</span>
              <button type="button" data-remove="${s.id}" aria-label="حذف ${seatLabel(s)}">×</button></li>`).join("")
          : '<li class="chosen__empty" style="border:0;padding:1rem 0">هنوز صندلی‌ای انتخاب نکرده‌اید.</li>';

        const groups = {};
        sorted.forEach((s) => (groups[s.price] = (groups[s.price] || 0) + 1));
        linesEl.innerHTML = Object.keys(groups).sort((a, b) => b - a)
          .map((p) => `<div><span class="num">${fmt(p)} تومان × ${toFa(groups[p])}</span><span class="num">${fmt(p * groups[p])}</span></div>`).join("");
        linesEl.hidden = !sorted.length;

        // This total is a PREVIEW. The authoritative total is computed by the server when the hold is created.
        const total = sorted.reduce((a, s) => a + s.price, 0);
        totalEl.textContent = fmt(total) + " تومان";
        barCount.textContent = sorted.length ? `${toFa(sorted.length)} صندلی انتخاب شده` : "صندلی انتخاب نشده";
        barTotal.textContent = fmt(total) + " تومان";
        [contBtn, barBtn].forEach((b) => (b.disabled = !sorted.length || busy));

        sheetList.innerHTML = sorted.length ? chosenEl.innerHTML : "";
        sheetLines.innerHTML = linesEl.innerHTML;
        sheetCount.textContent = countEl.textContent;
        sheetToggle.disabled = !sorted.length;
        if (!sorted.length) setSheet(false);
        save(KEY_BOOKING, { concertId: cid, seatIds: selected });
      }

      const seatBtn = (id) => $(`.seat[data-id="${id}"]`);
      function setSeat(btn, on) {
        btn.setAttribute("aria-pressed", String(on));
        if (on) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }
      }

      plan.addEventListener("click", (e) => {
        const btn = e.target.closest(".seat");
        if (!btn || btn.disabled) return;
        const id = +btn.dataset.id;
        const idx = selected.indexOf(id);
        if (idx > -1) { selected.splice(idx, 1); setSeat(btn, false); }
        else {
          if (selected.length >= MAX) { toast(`حداکثر ${toFa(MAX)} صندلی را می‌توانید انتخاب کنید.`); return; }
          selected.push(id); setSeat(btn, true);
        }
        render();
      });

      const onRemove = (e) => {
        const rm = e.target.closest("[data-remove]");
        if (!rm) return;
        const id = +rm.dataset.remove;
        selected = selected.filter((x) => x !== id);
        const b = seatBtn(id); if (b) setSeat(b, false);
        render();
      };
      chosenEl.addEventListener("click", onRemove);
      sheetList.addEventListener("click", onRemove);
      plan.addEventListener("click", () => { if (!sheet.hidden) setSheet(false); });

      /* Keyboard: arrows move between seats */
      plan.addEventListener("keydown", (e) => {
        const cur = e.target.closest(".seat");
        if (!cur || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        const rowsBtns = $$(".seat-row", plan).map((r) => $$(".seat", r));
        const r = rowsBtns.findIndex((arr) => arr.includes(cur));
        const c = rowsBtns[r].indexOf(cur);
        let tr = r, tc = c;
        if (e.key === "ArrowLeft") tc++;
        if (e.key === "ArrowRight") tc--;
        if (e.key === "ArrowDown") tr++;
        if (e.key === "ArrowUp") tr--;
        tr = Math.max(0, Math.min(rowsBtns.length - 1, tr));
        const arr = rowsBtns[tr];
        tc = Math.max(0, Math.min(arr.length - 1, e.key === "ArrowUp" || e.key === "ArrowDown" ? Math.min(c, arr.length - 1) : tc));
        const step = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 1;
        for (let k = tc; k >= 0 && k < arr.length; k += step) { if (!arr[k].disabled) { arr[k].focus(); return; } }
      });

      /* Hall scaling (unchanged behaviour) */
      const hall = $(".hall"), scroller = $("#hall-scroll"), viewport = $("#hall-viewport");
      const zoomBtn = (k) => $(`[data-zoom="${k}"]`);
      const MIN_READABLE = 0.78, MAX_Z = 1.5;
      let natW = 0, natH = 0, z = 1, fit = 1, lastW = 0;
      const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
      const defaultZoom = () => Math.max(fit, Math.min(1, MIN_READABLE));
      function measure() {
        plan.style.transform = "none";
        natW = plan.offsetWidth; natH = plan.offsetHeight;
        const cw = scroller.clientWidth;
        fit = natW && cw ? Math.min(1, cw / natW) : 1;
      }
      function applyZoom(next, keepScroll) {
        const oldRange = scroller.scrollWidth - scroller.clientWidth;
        const p = keepScroll && oldRange > 1 ? Math.abs(scroller.scrollLeft) / oldRange : 0.5;
        z = clamp(next, fit, MAX_Z);
        plan.style.transform = `scale(${z})`;
        viewport.style.width = Math.round(natW * z) + "px";
        viewport.style.height = Math.round(natH * z) + "px";
        const range = scroller.scrollWidth - scroller.clientWidth;
        hall.classList.toggle("is-scrollable", range > 4);
        scroller.scrollLeft = range > 4 ? -p * range : 0;
        zoomBtn("out").disabled = z <= fit + 0.01;
        zoomBtn("in").disabled = z >= MAX_Z - 0.01;
      }
      function layout() { measure(); applyZoom(defaultZoom(), false); lastW = scroller.clientWidth; }
      zoomBtn("in").addEventListener("click", () => applyZoom(z * 1.2, true));
      zoomBtn("out").addEventListener("click", () => applyZoom(z / 1.2, true));
      zoomBtn("fit").addEventListener("click", () => applyZoom(z <= fit + 0.01 ? defaultZoom() : fit, true));
      layout();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
      let resizeTimer;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (scroller.clientWidth !== lastW) layout(); }, 120);
      });

      /* Keep availability fresh: other people are booking too. Selected seats that were taken are dropped with a message. */
      async function refresh() {
        if (busy || document.hidden) return;
        try {
          const m = await api.seats(cid);
          const lost = [];
          m.rows.forEach((r) => r.seats.forEach((s) => {
            const b = seatBtn(s.id); if (!b) return;
            if (!s.available && !b.disabled) {
              b.disabled = true; setSeat(b, false);
              b.setAttribute("aria-label", `ردیف ${r.label}، صندلی ${toFa(s.number)} — فروخته شده`);
              if (selected.includes(s.id)) lost.push(s.id);
            } else if (s.available && b.disabled) {
              b.disabled = false;
              b.setAttribute("aria-label", `ردیف ${r.label}، صندلی ${toFa(s.number)} — ${fmt(s.price)} تومان`);
            }
            const known = seatById.get(s.id); if (known) known.available = s.available;
          }));
          if (lost.length) { selected = selected.filter((id) => !lost.includes(id)); render(); toast("برخی از صندلی‌های انتخابی شما توسط دیگری رزرو شد و از انتخاب حذف شد."); }
        } catch (e) { /* transient; the next tick tries again */ }
      }
      const timer = setInterval(refresh, 20000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
      window.addEventListener("pagehide", () => clearInterval(timer));

      /* Continue → login → hold seats on the server → checkout */
      const setBusy = (v) => { busy = v; [contBtn, barBtn].forEach((b) => (b.disabled = v || !selected.length)); };
      async function go() {
        if (!selected.length || busy) return;
        setBusy(true);
        try {
          const user = await window.MZ.me(true);
          if (!user) { toast("برای ادامه ابتدا وارد حساب کاربری شوید."); setTimeout(goLogin, 700); return; }

          // release a previous unpaid hold of this browser so the user is not blocked by their own old hold
          const old = load(KEY_HOLD);
          if (old && old.id) { try { await api.cancelReservation(old.id); } catch (e) { /* already paid/expired/gone — fine */ } drop(KEY_HOLD); }

          // Idempotency-Key: the same seat set always maps to the same key, so a double click or a retry
          // after a network error returns the SAME reservation instead of creating a second one.
          const sig = selected.slice().sort((a, b) => a - b).join("-");
          const stored = load("mz_idem");
          const key = stored && stored.sig === `${cid}:${sig}` ? stored.key : "bk" + uuidish();
          save("mz_idem", { sig: `${cid}:${sig}`, key });

          const r = await api.createReservation(cid, selected.slice().sort((a, b) => a - b), key);
          save(KEY_HOLD, { id: r.id, concertId: cid });
          drop("mz_idem");
          location.href = "checkout.html?reservation=" + encodeURIComponent(r.id);
        } catch (e) {
          drop("mz_idem");
          if (e.status === 401) { goLogin(); return; }
          toast(errMsg(e));
          if (e.code === "SEATS_UNAVAILABLE") await refresh();
          setBusy(false);
        }
      }
      contBtn.addEventListener("click", go);
      barBtn.addEventListener("click", go);

      render();
    }
  }

  /* =======================================================================
     CHECKOUT PAGE
     ======================================================================= */
  async function initCheckout() {
    const form = $("#checkout-form");
    if (!form) return;
    const main = $("#checkout-main"), empty = $("#checkout-empty"), notice = $("#checkout-notice");
    const params = new URLSearchParams(location.search);
    const hold = load(KEY_HOLD);
    const rid = params.get("reservation") || (hold && hold.id);
    const payment = params.get("payment");

    const showNotice = (msg, error) => { notice.textContent = msg; notice.className = "notice" + (error ? " notice--error" : ""); notice.hidden = false; };
    const showEmpty = (title, text, kind) => {
      main.hidden = true; empty.hidden = false;
      $("h2", empty).textContent = title; $("p", empty).textContent = text;
      empty.dataset.kind = kind || "";
    };

    if (payment === "failed") showNotice("پرداخت انجام نشد یا لغو شد. تا پایان مهلت رزرو می‌توانید دوباره تلاش کنید.", true);
    if (payment === "refund") showNotice("پرداخت شما دریافت شد اما رزرو به‌دلیل پایان مهلت یا در دسترس نبودن صندلی‌ها تکمیل نشد. لطفاً با پشتیبانی تماس بگیرید؛ بازگشت وجه به‌صورت خودکار انجام نمی‌شود.", true);

    if (!rid) { showEmpty("هنوز صندلی‌ای انتخاب نشده است", "برای ادامه، ابتدا صندلی‌های خود را در پلان تالار انتخاب کنید.", "none"); return; }

    main.hidden = true;
    const host = document.createElement("div");
    main.parentElement.insertBefore(host, main);
    showState(host, "loading", "در حال بارگذاری رزرو…");

    let user, r;
    try {
      user = await window.MZ.me();
      if (!user) { location.href = "account.html?next=" + nextParam(); return; }
      r = await api.reservation(rid);
    } catch (e) {
      host.innerHTML = "";
      if (e.status === 404) showEmpty("رزرو پیدا نشد", "این رزرو وجود ندارد یا متعلق به حساب شما نیست.", "gone");
      else { showState(host, "error", errMsg(e), () => location.reload()); }
      return;
    }
    host.innerHTML = "";

    if (r.status === "CONFIRMED") { location.replace("ticket.html?reservation=" + encodeURIComponent(r.id)); return; }
    if (r.status !== "PENDING") {
      drop(KEY_HOLD);
      showEmpty(r.status === "EXPIRED" ? "مهلت این رزرو تمام شد" : "این رزرو لغو شده است", "صندلی‌ها آزاد شده‌اند. می‌توانید دوباره صندلی انتخاب کنید.", "ended");
      $(".btn", empty).href = "booking.html?id=" + r.concert.id;
      return;
    }
    main.hidden = false;

    const disp = r.concert.display || null;
    const when = new Date(r.concert.startsAt);
    const info = { title: r.concert.title, venue: r.concert.venue, date: disp ? disp.date : when.toLocaleDateString("fa-IR"), time: disp ? disp.time : when.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) };
    $$("[data-bind]").forEach((n) => { if (info[n.dataset.bind]) n.textContent = info[n.dataset.bind]; });
    $("#order-seats").innerHTML = r.seats.map((s) => `<li><span>${seatLabel(s)}</span><span class="num">${fmt(s.price)} تومان</span></li>`).join("");
    $("#order-count").textContent = toFa(r.seats.length) + " صندلی";
    $("#order-total").textContent = fmt(r.totalAmount) + " تومان"; // server-computed
    const edit = $("[data-edit-seats]"); if (edit) edit.href = "booking.html?id=" + r.concert.id;

    // prefill (the user can change them); nothing sensitive is stored
    $("#name").value = (r.contact && r.contact.name) || user.name || "";
    $("#mobile").value = (r.contact && r.contact.mobile) || user.mobile || "";
    $("#email").value = (r.contact && r.contact.email) || user.email || "";

    /* Countdown to the end of the hold (server time) */
    const cd = $("#countdown"), submit = $("button[type=submit]", form);
    let expired = false;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(r.expiresAt).getTime() - api.serverNow()) / 1000));
      if (left === 0 && !expired) {
        expired = true; submit.disabled = true;
        cd.innerHTML = "مهلت رزرو تمام شد. <a class=\"link-arrow\" href=\"booking.html?id=" + r.concert.id + "\">انتخاب دوباره‌ی صندلی</a>";
        clearInterval(timer); return;
      }
      cd.innerHTML = `زمان باقی‌مانده برای تکمیل رزرو: <b class="num">${toFa(String(Math.floor(left / 60)).padStart(2, "0"))}:${toFa(String(left % 60).padStart(2, "0"))}</b>`;
    };
    const timer = setInterval(tick, 1000); tick();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFormError(form);
      if (expired) return;
      if (!window.MZ.validateForm(form)) { toast("لطفاً فیلدهای مشخص‌شده را بررسی کنید."); return; }
      submit.disabled = true;
      try {
        const body = { contactName: $("#name").value.trim(), contactMobile: $("#mobile").value.trim(), acceptTerms: $("#terms").checked };
        const email = $("#email").value.trim(); if (email) body.contactEmail = email;
        const out = await api.startPayment(r.id, body);
        // follow the gateway URL the SERVER gave us (http/https only)
        const u = new URL(out.payUrl, location.href);
        if (!/^https?:$/.test(u.protocol)) throw new Error("آدرس پرداخت نامعتبر است.");
        location.href = u.href;
      } catch (err) {
        formError(form, err);
        if (err.status === 401) setTimeout(goLogin, 900);
        submit.disabled = false;
      }
    });
  }

  /* =======================================================================
     DIGITAL TICKET PAGE
     ======================================================================= */
  async function initTicket() {
    const wrap = $("#tickets");
    if (!wrap) return;
    const params = new URLSearchParams(location.search);
    const rid = params.get("reservation");
    const intro = $(".ticket-intro h1"), count = $("#ticket-count");

    $("#download").addEventListener("click", () => window.print());
    $("#back-home").addEventListener("click", () => { drop(KEY_BOOKING); drop(KEY_HOLD); });

    const run = async () => {
      showState(wrap, "loading", "در حال بارگذاری بلیت‌ها…");
      try {
        const user = await window.MZ.me();
        if (!user) { location.href = "account.html?next=" + nextParam(); return; }

        let tickets;
        if (rid) {
          let r = await api.reservation(rid);
          // the callback has already verified payment server-side; if it is still PENDING we wait briefly
          for (let i = 0; i < 4 && r.status === "PENDING" && params.get("payment") === "ok"; i++) { await new Promise((ok) => setTimeout(ok, 1500)); r = await api.reservation(rid); }
          if (r.status !== "CONFIRMED") {
            showState(wrap, "empty", r.status === "PENDING" ? "این رزرو هنوز پرداخت نشده است؛ بلیتی صادر نشده." : "برای این رزرو بلیتی صادر نشده است.");
            intro.textContent = "بلیتی برای نمایش وجود ندارد"; count.textContent = "";
            return;
          }
          tickets = await Promise.all(r.tickets.map((t) => api.ticket(t.id)));
          intro.textContent = "رزرو شما ثبت شد";
        } else {
          tickets = await api.tickets();
          intro.textContent = "بلیت‌های من";
        }
        if (!tickets.length) { showState(wrap, "empty", "هنوز بلیتی ندارید. پس از پرداخت موفق، بلیت‌ها اینجا نمایش داده می‌شوند."); count.textContent = ""; return; }

        const qrs = await Promise.all(tickets.map((t) => api.ticketQrUrl(t.id).catch(() => "")));
        wrap.innerHTML = tickets.map((t, i) => `<article class="ticket" aria-label="بلیت ردیف ${esc(t.seat.row)} صندلی ${toFa(t.seat.number)}">
          <div class="ticket__main">
            <div class="ticket__brand">
              <div><div class="en">MOZRABI ORCHESTRA</div><div class="fa">ارکستر مضرابی اصفهان</div></div>
              <div class="en" style="letter-spacing:.2em">ADMIT ONE</div>
            </div>
            <h2 class="ticket__title">${esc(t.concert.title)}</h2>
            <div class="ticket__grid">
              <div><small>تاریخ</small><strong class="num">${esc(t.concert.display.date)}</strong></div>
              <div><small>ساعت</small><strong class="num">${esc(t.concert.display.time)}</strong></div>
              <div><small>محل برگزاری</small><strong>${esc(t.concert.venue)}</strong></div>
              <div><small>دارنده‌ی بلیت</small><strong>${esc(t.holderName || "مهمان ارکستر")}</strong></div>
            </div>
          </div>
          <div class="ticket__seat">
            <div class="pair">
              <div><small>ردیف</small><strong>${esc(t.seat.row)}</strong></div>
              <div><small>صندلی</small><strong class="num">${toFa(String(t.seat.number).padStart(2, "0"))}</strong></div>
            </div>
            <div class="qr">${qrs[i] ? `<img src="${esc(qrs[i])}" alt="کد QR بلیت ${esc(t.number)}">` : "—"}</div>
            <div class="ticket__no">شماره بلیت<b>${esc(t.number)}</b>${t.status === "USED" ? "<br><small>استفاده شده</small>" : ""}</div>
          </div>
        </article>`).join("");
        count.textContent = `${toFa(tickets.length)} بلیت`;
      } catch (e) {
        if (e.status === 404) showState(wrap, "empty", "این رزرو پیدا نشد یا متعلق به حساب شما نیست.");
        else showState(wrap, "error", errMsg(e), run);
      }
    };
    run();
  }

  document.addEventListener("DOMContentLoaded", () => { initBooking(); initCheckout(); initTicket(); });
})();
