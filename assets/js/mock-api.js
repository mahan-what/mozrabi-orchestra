/* DEVELOPMENT-ONLY mock transport. Loaded dynamically by api.js ONLY when MZ_CONFIG.MOCK is true,
   which config.js allows only on localhost with ?mock=1. It imitates the REST API's response shapes
   with in-memory/sessionStorage data so the UI can be worked on without a backend.
   It is NOT used in production and shares no data with the real API. Payments here are fake. */
(function () {
  "use strict";
  var ApiError = window.MZ.api.ApiError;
  var FA = "۰۱۲۳۴۵۶۷۸۹", fa = function (v) { return String(v).replace(/\d/g, function (d) { return FA[d]; }); };
  var ROWS = [["A", 8], ["B", 10], ["C", 10], ["D", 12], ["E", 12], ["F", 12], ["G", 14], ["H", 14], ["I", 14], ["J", 14]];
  var TIERS = [{ id: 1, name: "ردیف‌های A تا C", amount: 500000, rows: ["A", "B", "C"] }, { id: 2, name: "ردیف‌های D تا F", amount: 420000, rows: ["D", "E", "F"] }, { id: 3, name: "ردیف‌های G تا J", amount: 350000, rows: ["G", "H", "I", "J"] }];
  var VENUE = { id: 1, name: "تالار هنر اصفهان", city: "اصفهان" };
  function C(id, title, d, m, time, dur, summary, about, program, phase) {
    var up = phase === "upcoming";
    return { id: id, title: title, summary: summary, about: about, program: program || [], venue: VENUE, startsAt: new Date(Date.now() + (up ? 1 : -1) * id * 864e5 * 20).toISOString(),
      display: { day: fa(d), month: m, year: "۱۴۰۵", date: fa(d) + " " + m + " ۱۴۰۵", time: time, duration: fa(dur) + " دقیقه" }, durationMinutes: dur, status: "PUBLISHED", phase: phase, bookable: up,
      maxSeatsPerReservation: 6, coverImageUrl: null, fromPrice: up ? 350000 : null, tiers: up ? TIERS : [] };
  }
  var prog = [{ part: "بخش اول", items: [{ title: "پیش‌درآمد در دستگاه شور", note: "ساخته‌ی گروه" }, { title: "چهارمضراب اصفهان", note: "تنظیم ویژه‌ی ارکستر" }] }, { part: "بخش دوم", items: [{ title: "رِنگ شهرآشوب", note: "اجرای گروهی" }] }];
  var CONCERTS = [
    C(1, "شب موسیقی ایرانی", 25, "مهر", "۲۰:۳۰", 120, "نمونه: شبی با آثار ماندگار موسیقی ایرانی.", ["(داده‌ی نمونه) متن درباره‌ی اجرا."], prog, "upcoming"),
    C(2, "گفت‌وگوی تار و سنتور", 20, "آبان", "۲۰:۰۰", 90, "نمونه: دوئتی صمیمی میان دو ساز.", ["(داده‌ی نمونه)"], prog, "upcoming"),
    C(3, "نوای بهاری", 18, "فروردین", "۲۰:۰۰", 100, "نمونه: اجرای ویژه‌ی نوروز.", ["(داده‌ی نمونه)"], [], "past"),
  ];
  var MEMBERS = ["محمد ابراهیمیان|سرپرست و نوازنده", "علی رضایی|نوازنده تار", "سارا احمدی|نوازنده سنتور", "نیما کریمی|نوازنده عود"].map(function (s, i) { var p = s.split("|"); return { id: i + 1, name: p[0], title: p[1], bio: null, imageUrl: null }; });
  var INSTR = [["tar", "تار"], ["santur", "سنتور"], ["oud", "عود"], ["setar", "سه‌تار"], ["tonbak", "تنبک"], ["kamancheh", "کمانچه"]].map(function (a, i) { return { id: i + 1, key: a[0], name: a[1], description: "(داده‌ی نمونه)" }; });
  var GALLERY = ["اجرای زنده", "پشت صحنه", "تمرین"].map(function (t, i) { return { id: i + 1, title: t, description: null, imageUrl: null }; });

  var store = {
    get: function (k, d) { try { return JSON.parse(sessionStorage.getItem("mzmock_" + k)) || d; } catch (e) { return d; } },
    set: function (k, v) { try { sessionStorage.setItem("mzmock_" + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function seatId(cid, row, n) { return cid * 1000 + row.charCodeAt(0) * 20 + n; }
  function sold(cid) { var r = rnd(cid * 97 + 13), s = {}; ROWS.forEach(function (rw, ri) { for (var i = 1; i <= rw[1]; i++) if (r() < (ri < 3 ? 0.42 : ri < 6 ? 0.34 : 0.22)) s[seatId(cid, rw[0], i)] = 1; }); ["B5", "B6", "B7"].forEach(function (x) { delete s[seatId(cid, x[0], +x.slice(1))]; }); return s; }
  function tierOf(row) { return TIERS.filter(function (t) { return t.rows.indexOf(row) > -1; })[0]; }
  function find(id) { var c = CONCERTS.filter(function (x) { return x.id === +id; })[0]; if (!c) throw new ApiError(404, "CONCERT_NOT_FOUND", "این اجرا پیدا نشد."); return c; }
  function uid() { return "mock-" + Math.random().toString(16).slice(2, 10) + Date.now().toString(16); }
  function me() { return store.get("user", null); }
  function needAuth() { var u = me(); if (!u) throw new ApiError(401, "UNAUTHENTICATED", "برای ادامه وارد حساب کاربری شوید."); return u; }
  function resv(id) { var r = store.get("res", {})[id]; if (!r) throw new ApiError(404, "RESERVATION_NOT_FOUND", "رزرو پیدا نشد."); return r; }
  function saveRes(r) { var all = store.get("res", {}); all[r.id] = r; store.set("res", all); }
  function view(r) { if (r.status === "PENDING" && new Date(r.expiresAt) < new Date()) r.status = "EXPIRED"; return JSON.parse(JSON.stringify(r)); }
  function qr(seed) {
    var N = 25, r = rnd(seed.length * 7919), cells = [], x, y, h = "";
    for (y = 0; y < N; y++) { cells[y] = []; for (x = 0; x < N; x++) cells[y][x] = r() > 0.52; }
    [[0, 0], [N - 7, 0], [0, N - 7]].forEach(function (o) { for (var yy = -1; yy <= 7; yy++) for (var xx = -1; xx <= 7; xx++) { var px = o[0] + xx, py = o[1] + yy; if (px < 0 || py < 0 || px >= N || py >= N) continue; cells[py][px] = xx >= 0 && xx <= 6 && yy >= 0 && yy <= 6 && (xx === 0 || xx === 6 || yy === 0 || yy === 6 || (xx >= 2 && xx <= 4 && yy >= 2 && yy <= 4)); } });
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) if (cells[y][x]) h += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + N + " " + N + '" fill="#0b0a08" shape-rendering="crispEdges">' + h + "</svg>");
  }
  var ok = function (data, meta) { return { data: data, meta: meta }; };

  function handle(method, path, opts) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () { try { resolve(route(method, path.split("?")[0], new URLSearchParams(path.split("?")[1] || ""), opts || {})); } catch (e) { reject(e); } }, 120);
    });
  }
  function route(method, path, qs, opts) {
    var m, body = opts.body || {};
    if (path === "/health") return ok({ status: "ok", paymentProvider: "mock", mockApi: true });
    if (path === "/auth/me") { var u = me(); return ok({ user: u }); }
    if (path === "/auth/register" || path === "/auth/login") {
      var user = path === "/auth/register" ? { id: 1, name: body.name, mobile: body.mobile, email: body.email || null, role: "USER" } : (store.get("account", null));
      if (path === "/auth/register") store.set("account", user);
      else if (!user) throw new ApiError(401, "INVALID_CREDENTIALS", "موبایل/ایمیل یا گذرواژه نادرست است. (حالت نمونه: ابتدا ثبت‌نام کنید)");
      store.set("user", user); return ok({ user: user });
    }
    if (path === "/auth/logout") { store.set("user", null); return ok({ loggedOut: true }); }
    if (path === "/concerts") { var ph = qs.get("phase") || "upcoming", items = CONCERTS.filter(function (c) { return c.phase === ph; }); return ok(items, { page: 1, pageSize: 12, total: items.length, totalPages: 1 }); }
    if ((m = /^\/concerts\/(\d+)$/.exec(path))) return ok(find(m[1]));
    if ((m = /^\/concerts\/(\d+)\/seats$/.exec(path))) {
      var c = find(m[1]), s = sold(c.id), held = store.get("held_" + c.id, {}), n = 0, av = 0;
      var rows = ROWS.map(function (rw) { return { label: rw[0], seats: Array.apply(null, Array(rw[1])).map(function (_, i) { var id = seatId(c.id, rw[0], i + 1), a = !s[id] && !held[id]; n++; if (a) av++; return { id: id, number: i + 1, tierId: tierOf(rw[0]).id, price: tierOf(rw[0]).amount, available: a }; }) }; });
      return ok({ concertId: c.id, bookable: c.bookable, maxSeatsPerReservation: 6, tiers: c.tiers, rows: rows, summary: { total: n, available: av }, serverTime: new Date().toISOString() });
    }
    if (path === "/members") return ok(MEMBERS);
    if (path === "/instruments") return ok(INSTR);
    if (path === "/gallery") return ok(GALLERY);
    if (path === "/contact") return ok({ id: 1 });
    if (path === "/reservations" && method === "POST") {
      needAuth(); var cc = find(body.concertId), sd = sold(cc.id), hl = store.get("held_" + cc.id, {});
      body.seatIds.forEach(function (id) { if (sd[id] || hl[id]) throw new ApiError(409, "SEATS_UNAVAILABLE", "برخی از صندلی‌های انتخابی دیگر موجود نیستند."); });
      var seats = body.seatIds.map(function (id) { var row = String.fromCharCode(Math.floor((id % 1000) / 20)), num = (id % 1000) % 20, t = tierOf(row); return { seatId: id, row: row, number: num, tier: t.name, price: t.amount }; });
      var r = { id: uid(), status: "PENDING", totalAmount: seats.reduce(function (a, x) { return a + x.price; }, 0), currency: "IRT", expiresAt: new Date(Date.now() + 10 * 60000).toISOString(), confirmedAt: null, contact: null,
        concert: { id: cc.id, title: cc.title, startsAt: cc.startsAt, venue: cc.venue.name, display: cc.display }, seats: seats, payments: [], tickets: [] };
      body.seatIds.forEach(function (id) { hl[id] = r.id; }); store.set("held_" + cc.id, hl); saveRes(r); return ok(view(r));
    }
    if (path === "/reservations" && method === "GET") { needAuth(); var all = store.get("res", {}); var list = Object.keys(all).map(function (k) { return view(all[k]); }); return ok(list, { page: 1, pageSize: 10, total: list.length, totalPages: 1 }); }
    if ((m = /^\/reservations\/([^/]+)$/.exec(path))) {
      needAuth(); var rr = resv(m[1]);
      if (method === "DELETE") { if (rr.status === "PENDING") { rr.status = "CANCELLED"; var h2 = store.get("held_" + rr.concert.id, {}); rr.seats.forEach(function (x) { delete h2[x.seatId]; }); store.set("held_" + rr.concert.id, h2); saveRes(rr); } return ok(view(rr)); }
      return ok(view(rr));
    }
    if ((m = /^\/reservations\/([^/]+)\/payment$/.exec(path))) {
      needAuth(); var pr = resv(m[1]); pr.contact = { name: body.contactName, mobile: body.contactMobile, email: body.contactEmail || null };
      pr.status = "CONFIRMED"; pr.confirmedAt = new Date().toISOString();           // FAKE payment: always succeeds in mock mode
      pr.tickets = pr.seats.map(function (s, i) { return { id: uid(), serial: 124 + i, status: "VALID", concertSeatId: s.seatId }; }); saveRes(pr);
      return ok({ paymentId: uid(), amount: pr.totalAmount, payUrl: "ticket.html?reservation=" + pr.id + "&payment=ok", expiresAt: pr.expiresAt });
    }
    if (path === "/tickets") { needAuth(); var all2 = store.get("res", {}), out = []; Object.keys(all2).forEach(function (k) { if (all2[k].status === "CONFIRMED") out = out.concat(all2[k].tickets.map(function (t) { return tview(all2[k], t); })); }); return ok(out); }
    if ((m = /^\/tickets\/([^/]+)\/qr\.svg$/.exec(path))) return qr(m[1]);
    if ((m = /^\/tickets\/([^/]+)$/.exec(path))) {
      needAuth(); var a3 = store.get("res", {}); for (var k in a3) for (var i = 0; i < a3[k].tickets.length; i++) if (a3[k].tickets[i].id === m[1]) return ok(tview(a3[k], a3[k].tickets[i]));
      throw new ApiError(404, "TICKET_NOT_FOUND", "بلیت پیدا نشد.");
    }
    throw new ApiError(404, "NOT_FOUND", "مورد درخواستی پیدا نشد. (mock)");
  }
  function tview(r, t) { var s = r.seats.filter(function (x) { return x.seatId === t.concertSeatId; })[0]; return { id: t.id, number: "MZ-۱۴۰۵-" + String(t.serial).padStart(6, "0"), status: t.status, holderName: r.contact ? r.contact.name : "", seat: { row: s.row, number: s.number, tier: s.tier }, concert: { id: r.concert.id, title: r.concert.title, venue: r.concert.venue, startsAt: r.concert.startsAt, display: r.concert.display }, reservationId: r.id }; }

  window.MZ_MOCK = { handle: handle };
})();
