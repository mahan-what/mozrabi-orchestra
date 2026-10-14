/* ==========================================================================
   booking.js — Seat selection · Checkout · Digital ticket (all mock)
   State lives in sessionStorage only. No network, no backend.
   ========================================================================== */
(function () {
  "use strict";
  const { DATA, toFa, fmt, $, $$, ICON } = window.MZ;

  const MAX_SEATS = 6;
  const ROWS = [
    ["A", 8], ["B", 10], ["C", 10], ["D", 12], ["E", 12],
    ["F", 12], ["G", 14], ["H", 14], ["I", 14], ["J", 14],
  ]; // = 120 seats
  const KEY_BOOKING = "mz_booking";
  const KEY_ORDER = "mz_order";

  /* ---------- storage helpers ---------- */
  const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: ignore */ } };

  const concertById = (id) => DATA.concerts.find((c) => c.id === id && c.status === "upcoming") || DATA.concerts[0];
  const tierPrice = (concert, rowLetter) => {
    const i = rowLetter <= "C" ? 0 : rowLetter <= "F" ? 1 : 2;
    return concert.tiers[i][1];
  };

  /* Deterministic "sold" seats per concert so the hall looks lived-in */
  function seededRandom(seed) {
    let a = seed * 2654435761 >>> 0;
    return () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function soldSet(concertId) {
    const rnd = seededRandom(concertId * 97 + 13);
    const sold = new Set();
    ROWS.forEach(([row, n], ri) => {
      for (let i = 1; i <= n; i++) {
        const front = ri < 3 ? 0.42 : ri < 6 ? 0.34 : 0.22;
        if (rnd() < front) sold.add(row + i);
      }
    });
    // Keep a nice adjacent pair free in row B for the demo flow
    ["B5", "B6", "B7"].forEach((s) => sold.delete(s));
    return sold;
  }

  const seatLabel = (s) => `ردیف ${s.row} — صندلی ${toFa(s.num)}`;

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 2800);
  }

  /* =======================================================================
     BOOKING PAGE
     ======================================================================= */
  function initBooking() {
    const plan = $("#seat-plan");
    if (!plan) return;

    const params = new URLSearchParams(location.search);
    const concert = concertById(+params.get("id") || 1);
    const sold = soldSet(concert.id);

    // restore previous selection for the same concert
    const prev = load(KEY_BOOKING);
    let selected = prev && prev.concertId === concert.id ? prev.seats.filter((s) => !sold.has(s.row + s.num)) : [];

    // bind concert info
    $$("[data-bind]").forEach((n) => {
      const k = n.dataset.bind;
      const map = { title: concert.title, date: concert.date, time: concert.time, venue: concert.venue };
      if (map[k]) n.textContent = map[k];
    });
    document.title = `انتخاب صندلی — ${concert.title}`;

    /* Build hall */
    const rowsEl = $("#seat-rows");
    rowsEl.innerHTML = ROWS.map(([row, n]) => {
      const half = n / 2;
      const price = tierPrice(concert, row);
      const seats = (from, to) => {
        let h = "";
        for (let i = from; i <= to; i++) {
          const id = row + i, isSold = sold.has(id);
          const pressed = selected.some((s) => s.row === row && s.num === i);
          h += `<button type="button" class="seat" data-row="${row}" data-num="${i}" data-price="${price}"
            aria-pressed="${pressed}" ${isSold ? "disabled" : ""}
            aria-label="ردیف ${row}، صندلی ${toFa(i)} — ${isSold ? "فروخته شده" : fmt(price) + " تومان"}"><span>${toFa(i)}</span></button>`;
        }
        return h;
      };
      return `<div class="seat-row" role="group" aria-label="ردیف ${row}">
        <span class="seat-row__label" aria-hidden="true">${row}</span>
        <div class="seat-block">${seats(1, half)}</div>
        <div class="aisle" aria-hidden="true"></div>
        <div class="seat-block">${seats(half + 1, n)}</div>
        <span class="seat-row__label" aria-hidden="true">${row}</span>
      </div>`;
    }).join("");

    $("#tier-key").innerHTML = concert.tiers.map((t) => `<span>${t[0]}: <b class="num">${fmt(t[1])} تومان</b></span>`).join("");

    /* Elements */
    const chosenEl = $("#chosen"), countEl = $("#chosen-count"), linesEl = $("#sum-lines"), totalEl = $("#total");
    const contBtn = $("#continue"), barBtn = $("#bar-continue"), barCount = $("#bar-count"), barTotal = $("#bar-total");
    const sheet = $("#sheet"), sheetToggle = $("#sheet-toggle"), sheetList = $("#sheet-list"), sheetLines = $("#sheet-lines"), sheetCount = $("#sheet-count");

    function setSheet(open) {
      sheet.hidden = !open;
      sheetToggle.setAttribute("aria-expanded", String(open));
    }
    sheetToggle.addEventListener("click", () => setSheet(sheet.hidden));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) setSheet(false); });

    function render() {
      const sorted = selected.slice().sort((a, b) => (a.row === b.row ? a.num - b.num : a.row.localeCompare(b.row)));
      countEl.textContent = toFa(sorted.length) + " از " + toFa(MAX_SEATS);
      chosenEl.innerHTML = sorted.length
        ? sorted.map((s) => `<li><span>${seatLabel(s)}</span><span class="num">${fmt(s.price)}</span>
            <button type="button" data-remove="${s.row}${s.num}" aria-label="حذف ${seatLabel(s)}">×</button></li>`).join("")
        : '<li class="chosen__empty" style="border:0;padding:1rem 0">هنوز صندلی‌ای انتخاب نکرده‌اید.</li>';

      // group by price
      const groups = {};
      sorted.forEach((s) => (groups[s.price] = (groups[s.price] || 0) + 1));
      linesEl.innerHTML = Object.keys(groups).sort((a, b) => b - a)
        .map((p) => `<div><span class="num">${fmt(p)} تومان × ${toFa(groups[p])}</span><span class="num">${fmt(p * groups[p])}</span></div>`).join("");
      linesEl.hidden = !sorted.length;

      const total = sorted.reduce((a, s) => a + s.price, 0);
      totalEl.textContent = fmt(total) + " تومان";
      barCount.textContent = sorted.length ? `${toFa(sorted.length)} صندلی انتخاب شده` : "صندلی انتخاب نشده";
      barTotal.textContent = fmt(total) + " تومان";
      [contBtn, barBtn].forEach((b) => (b.disabled = !sorted.length));

      // mobile bottom sheet mirrors the sidebar
      sheetList.innerHTML = sorted.length ? chosenEl.innerHTML : "";
      sheetLines.innerHTML = linesEl.innerHTML;
      sheetCount.textContent = countEl.textContent;
      sheetToggle.disabled = !sorted.length;
      if (!sorted.length) setSheet(false);
      save(KEY_BOOKING, { concertId: concert.id, seats: sorted });
    }

    function setSeat(btn, on) {
      btn.setAttribute("aria-pressed", String(on));
      if (on) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }
    }

    plan.addEventListener("click", (e) => {
      const btn = e.target.closest(".seat");
      if (!btn || btn.disabled) return;
      const row = btn.dataset.row, num = +btn.dataset.num, price = +btn.dataset.price;
      const idx = selected.findIndex((s) => s.row === row && s.num === num);
      if (idx > -1) { selected.splice(idx, 1); setSeat(btn, false); }
      else {
        if (selected.length >= MAX_SEATS) { toast(`حداکثر ${toFa(MAX_SEATS)} صندلی را می‌توانید انتخاب کنید.`); return; }
        selected.push({ row, num, price }); setSeat(btn, true);
      }
      render();
    });

    const onRemove = (e) => {
      const rm = e.target.closest("[data-remove]");
      if (!rm) return;
      const id = rm.dataset.remove;
      selected = selected.filter((s) => s.row + s.num !== id);
      const seatBtn = $(`.seat[data-row="${id[0]}"][data-num="${id.slice(1)}"]`);
      if (seatBtn) setSeat(seatBtn, false);
      render();
    };
    chosenEl.addEventListener("click", onRemove);
    sheetList.addEventListener("click", onRemove);
    plan.addEventListener("click", () => { if (!sheet.hidden) setSheet(false); }); // don't let the sheet cover the map

    /* Keyboard: arrows move between seats */
    plan.addEventListener("keydown", (e) => {
      const cur = e.target.closest(".seat");
      if (!cur || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const rowsBtns = $$(".seat-row", plan).map((r) => $$(".seat", r));
      const r = rowsBtns.findIndex((arr) => arr.includes(cur));
      const c = rowsBtns[r].indexOf(cur);
      let tr = r, tc = c;
      if (e.key === "ArrowLeft") tc++;      // RTL: visually left = next in DOM
      if (e.key === "ArrowRight") tc--;
      if (e.key === "ArrowDown") tr++;
      if (e.key === "ArrowUp") tr--;
      tr = Math.max(0, Math.min(rowsBtns.length - 1, tr));
      const arr = rowsBtns[tr];
      tc = Math.max(0, Math.min(arr.length - 1, e.key === "ArrowUp" || e.key === "ArrowDown" ? Math.min(c, arr.length - 1) : tc));
      // find nearest enabled seat in that direction
      const step = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 1;
      for (let k = tc; k >= 0 && k < arr.length; k += step) { if (!arr[k].disabled) { arr[k].focus(); return; } }
    });

    /* Hall scaling: fit to width, never smaller than a readable size on phones,
       with zoom in/out and an "overview" toggle. The plan is scaled with transform
       and the viewport box is resized to match, so there is no page-wide overflow. */
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
      fit = natW && cw ? Math.min(1, cw / natW) : 1; // guard against hidden / zero-size layouts
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
      scroller.scrollLeft = range > 4 ? -p * range : 0; // RTL: scrollLeft runs 0 → negative
      zoomBtn("out").disabled = z <= fit + 0.01;
      zoomBtn("in").disabled = z >= MAX_Z - 0.01;
    }
    function layout() {
      measure();
      applyZoom(defaultZoom(), false);
      lastW = scroller.clientWidth;
    }
    zoomBtn("in").addEventListener("click", () => applyZoom(z * 1.2, true));
    zoomBtn("out").addEventListener("click", () => applyZoom(z / 1.2, true));
    zoomBtn("fit").addEventListener("click", () => applyZoom(z <= fit + 0.01 ? defaultZoom() : fit, true));

    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      // width only: mobile address-bar show/hide changes height and must not reset the zoom
      resizeTimer = setTimeout(() => { if (scroller.clientWidth !== lastW) layout(); }, 120);
    });

    const go = () => { if (selected.length) location.href = "checkout.html"; };
    contBtn.addEventListener("click", go);
    barBtn.addEventListener("click", go);

    render();
  }

  /* =======================================================================
     CHECKOUT PAGE
     ======================================================================= */
  function initCheckout() {
    const form = $("#checkout-form");
    if (!form) return;

    const b = load(KEY_BOOKING);
    if (!b || !b.seats || !b.seats.length) {
      $("#checkout-main").hidden = true;
      $("#checkout-empty").hidden = false;
      return;
    }
    const concert = concertById(b.concertId);
    $$("[data-bind]").forEach((n) => {
      const map = { title: concert.title, date: concert.date, time: concert.time, venue: concert.venue };
      if (map[n.dataset.bind]) n.textContent = map[n.dataset.bind];
    });
    const total = b.seats.reduce((a, s) => a + s.price, 0);
    $("#order-seats").innerHTML = b.seats.map((s) => `<li><span>${seatLabel(s)}</span><span class="num">${fmt(s.price)} تومان</span></li>`).join("");
    $("#order-count").textContent = toFa(b.seats.length) + " صندلی";
    $("#order-total").textContent = fmt(total) + " تومان";

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!window.MZ.validateForm(form)) { toast("لطفاً فیلدهای مشخص‌شده را بررسی کنید."); return; }
      save(KEY_ORDER, {
        concertId: concert.id, seats: b.seats, total,
        name: $("#name").value.trim(), mobile: $("#mobile").value.trim(), email: $("#email").value.trim(),
      });
      location.href = "ticket.html";
    });
  }

  /* =======================================================================
     DIGITAL TICKET PAGE
     ======================================================================= */
  function qrSVG(seed) {
    const N = 25;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = seededRandom(h >>> 0);
    const cells = Array.from({ length: N }, () => Array(N).fill(false));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cells[y][x] = rnd() > 0.52;
    const finder = (ox, oy) => {
      for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
        const px = ox + x, py = oy + y;
        if (px < 0 || py < 0 || px >= N || py >= N) continue;
        const edge = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        cells[py][px] = x >= 0 && x <= 6 && y >= 0 && y <= 6 && (edge || core);
      }
    };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    let rects = "";
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (cells[y][x]) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    return `<svg viewBox="0 0 ${N} ${N}" fill="#0b0a08" shape-rendering="crispEdges" role="img" aria-label="کد QR نمونه">${rects}</svg>`;
  }

  function initTicket() {
    const wrap = $("#tickets");
    if (!wrap) return;

    let order = load(KEY_ORDER);
    let demo = false;
    if (!order) { // fallback demo so the page always looks right
      demo = true;
      order = { concertId: 1, seats: [{ row: "B", num: 5, price: 500000 }], name: "", total: 500000 };
    }
    const concert = concertById(order.concertId);
    const base = 124;

    wrap.innerHTML = order.seats.map((s, i) => {
      const no = "MZ-1405-" + String(base + i).padStart(6, "0");
      return `<article class="ticket" aria-label="بلیت ${seatLabel(s)}">
        <div class="ticket__main">
          <div class="ticket__brand">
            <div><div class="en">MOZRABI ORCHESTRA</div><div class="fa">ارکستر مضرابی اصفهان</div></div>
            <div class="en" style="letter-spacing:.2em">ADMIT ONE</div>
          </div>
          <h2 class="ticket__title">${concert.title}</h2>
          <div class="ticket__grid">
            <div><small>تاریخ</small><strong class="num">${concert.date}</strong></div>
            <div><small>ساعت</small><strong class="num">${concert.time}</strong></div>
            <div><small>محل برگزاری</small><strong>${concert.venue}</strong></div>
            <div><small>دارنده‌ی بلیت</small><strong>${order.name || "مهمان ارکستر"}</strong></div>
          </div>
        </div>
        <div class="ticket__seat">
          <div class="pair">
            <div><small>ردیف</small><strong>${s.row}</strong></div>
            <div><small>صندلی</small><strong class="num">${toFa(String(s.num).padStart(2, "0"))}</strong></div>
          </div>
          <div class="qr">${qrSVG(no)}</div>
          <div class="ticket__no">شماره بلیت<b>${no}</b></div>
        </div>
      </article>`;
    }).join("");

    $("#ticket-count").textContent = demo ? "نمونه‌ای از بلیت دیجیتال شما" : `${toFa(order.seats.length)} بلیت برای شما صادر شد`;

    $("#download").addEventListener("click", () => toast("این یک نسخه‌ی نمایشی است؛ دانلود در نسخه‌ی نهایی فعال می‌شود."));
    $("#back-home").addEventListener("click", () => {
      try { sessionStorage.removeItem(KEY_BOOKING); sessionStorage.removeItem(KEY_ORDER); } catch (e) { /* ignore */ }
    });
  }

  document.addEventListener("DOMContentLoaded", () => { initBooking(); initCheckout(); initTicket(); });
})();
