/* Runtime configuration — loaded BEFORE api.js.
   API base URL, in order of priority:
     1. window.MZ_CONFIG.API_BASE (set it in an inline script above this file)
     2. <meta name="mz-api-base" content="https://api.example.com/api/v1">
     3. "/api/v1" (same origin — the default when Express serves this folder)
   MOCK mode (fake in-browser data from mock-api.js) is a DEVELOPMENT aid only: it is honoured
   only on localhost / 127.0.0.1 and is switched on with ?mock=1 (off with ?mock=0). On any other
   host it is forced off and mock-api.js is never requested. */
(function () {
  "use strict";
  var preset = window.MZ_CONFIG || {};
  var meta = document.querySelector('meta[name="mz-api-base"]');
  var base = preset.API_BASE || (meta && meta.content) || "/api/v1";
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var mock = false;
  if (isLocal) {
    try {
      var q = new URLSearchParams(location.search).get("mock");
      if (q === "1") sessionStorage.setItem("mz_mock", "1");
      if (q === "0") sessionStorage.removeItem("mz_mock");
      mock = sessionStorage.getItem("mz_mock") === "1";
    } catch (e) { mock = false; }
  }
  window.MZ_CONFIG = { API_BASE: String(base).replace(/\/+$/, ""), MOCK: mock };
})();
