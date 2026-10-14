/* API client — the ONLY place that calls fetch(). Everything else uses window.MZ.api.* */
(function () {
  "use strict";
  var cfg = window.MZ_CONFIG;
  var MZ = (window.MZ = window.MZ || {});

  function ApiError(status, code, message, details) {
    this.name = "ApiError"; this.status = status; this.code = code; this.message = message; this.details = details;
  }
  ApiError.prototype = Object.create(Error.prototype);

  var skew = 0;            // server clock - client clock (ms), from the Date header
  var csrf = null;         // CSRF token (fetched lazily)
  var transport = null;    // set only in mock mode

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("load " + src)); };
      document.head.appendChild(s);
    });
  }
  // Resolves when the client is usable. In mock mode it first loads the dev-only mock transport.
  var ready = cfg.MOCK
    ? loadScript("assets/js/mock-api.js").then(function () { transport = window.MZ_MOCK; })
    : Promise.resolve();

  function networkError() { return new ApiError(0, "NETWORK", "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."); }

  async function raw(method, path, opts) {
    opts = opts || {};
    await ready;
    if (transport) return transport.handle(method, path, opts);
    var headers = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.headers) Object.assign(headers, opts.headers);
    var unsafe = method !== "GET" && method !== "HEAD";
    if (unsafe) {
      if (!csrf) await fetchCsrf();
      headers["X-CSRF-Token"] = csrf;
    }
    var res;
    try {
      res = await fetch(cfg.API_BASE + path, { method: method, headers: headers, credentials: "include", body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    } catch (e) { throw networkError(); }
    var d = res.headers.get("date");
    if (d) skew = new Date(d).getTime() - Date.now();
    return res;
  }

  async function fetchCsrf() {
    var res;
    try { res = await fetch(cfg.API_BASE + "/csrf", { credentials: "include" }); } catch (e) { throw networkError(); }
    var j = await res.json().catch(function () { return null; });
    if (!j || !j.success) throw new ApiError(res.status, "CSRF", "دریافت توکن امنیتی ناموفق بود.");
    csrf = j.data.csrfToken;
  }

  async function request(method, path, opts) {
    var res = await raw(method, path, opts);
    if (transport) return res;             // mock returns {data, meta} already (or throws ApiError)
    var j = await res.json().catch(function () { return null; });
    if (!res.ok || !j || j.success === false) {
      var e = (j && j.error) || {};
      if (e.code === "CSRF_INVALID" && !(opts && opts._retried)) { csrf = null; return request(method, path, Object.assign({}, opts, { _retried: true })); }
      throw new ApiError(res.status, e.code || "HTTP_" + res.status, e.message || "خطای نامشخص از سمت سرور.", e.details);
    }
    return { data: j.data, meta: j.meta };
  }

  var get = function (p) { return request("GET", p).then(function (r) { return r.data; }); };
  var q = function (o) {
    var s = new URLSearchParams(); Object.keys(o || {}).forEach(function (k) { if (o[k] !== undefined && o[k] !== null) s.set(k, o[k]); });
    var t = s.toString(); return t ? "?" + t : "";
  };

  var api = {
    ApiError: ApiError,
    ready: ready,
    /** Server "now" in ms (corrected by the Date header). */
    serverNow: function () { return Date.now() + skew; },
    health: function () { return get("/health"); },
    // auth
    me: function () { return get("/auth/me").then(function (d) { return d.user; }); },
    register: function (b) { return request("POST", "/auth/register", { body: b }).then(function (r) { return r.data.user; }); },
    login: function (b) { return request("POST", "/auth/login", { body: b }).then(function (r) { return r.data.user; }); },
    logout: function () { return request("POST", "/auth/logout", { body: {} }).then(function () { csrf = null; }); },
    // public content
    concerts: function (o) { return request("GET", "/concerts" + q(o)).then(function (r) { return r.data; }); },
    concert: function (id) { return get("/concerts/" + encodeURIComponent(id)); },
    seats: function (id) { return get("/concerts/" + encodeURIComponent(id) + "/seats"); },
    members: function () { return get("/members"); },
    instruments: function () { return get("/instruments"); },
    gallery: function (o) { return get("/gallery" + q(o)); },
    contact: function (b) { return request("POST", "/contact", { body: b }).then(function (r) { return r.data; }); },
    // reservations / payment / tickets
    createReservation: function (concertId, seatIds, idempotencyKey) {
      return request("POST", "/reservations", { body: { concertId: concertId, seatIds: seatIds }, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {} }).then(function (r) { return r.data; });
    },
    reservation: function (id) { return get("/reservations/" + encodeURIComponent(id)); },
    reservations: function (o) { return get("/reservations" + q(o)); },
    cancelReservation: function (id) { return request("DELETE", "/reservations/" + encodeURIComponent(id)).then(function (r) { return r.data; }); },
    startPayment: function (id, b) { return request("POST", "/reservations/" + encodeURIComponent(id) + "/payment", { body: b }).then(function (r) { return r.data; }); },
    tickets: function () { return get("/tickets"); },
    ticket: function (id) { return get("/tickets/" + encodeURIComponent(id)); },
    /** QR as a data: URL (server-generated SVG; contains only a signed opaque id). */
    ticketQrUrl: async function (id) {
      var res = await raw("GET", "/tickets/" + encodeURIComponent(id) + "/qr.svg");
      if (transport) return res;
      if (!res.ok) throw new ApiError(res.status, "QR", "بارگذاری کد QR ناموفق بود.");
      var svg = await res.text();
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    },
  };
  MZ.api = api;
  MZ.config = cfg;
})();
