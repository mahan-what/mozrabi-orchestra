/* account.js — login · register · my reservations. Talks only to window.MZ.api. */
(function () {
  "use strict";
  const { api, $, $$, esc, toFa, fmt, showState, errMsg, formError, clearFormError, validateForm } = window.MZ;
  const root = $("#acct-root");
  if (!root) return;

  /* `next` is only followed when it is a plain same-site page like "checkout.html?reservation=…" (no open redirect). */
  const SAFE_NEXT = /^[a-z0-9_-]+\.html(\?[A-Za-z0-9_=&%.-]*)?$/i;
  const next = () => { const n = new URLSearchParams(location.search).get("next"); return n && SAFE_NEXT.test(n) ? n : null; };

  const STATUS = { PENDING: "در انتظار پرداخت", CONFIRMED: "تأیید شده", CANCELLED: "لغو شده", EXPIRED: "منقضی شده" };

  function authView() {
    root.innerHTML = `
      <section class="panel-light" aria-labelledby="acct-title">
        <h2 id="acct-title">ورود یا ثبت‌نام</h2>
        <p>برای رزرو بلیت و مشاهده‌ی بلیت‌ها وارد حساب خود شوید.</p>
        <div class="acct__tabs" role="tablist">
          <button type="button" role="tab" id="tab-login" aria-selected="true" aria-controls="p-login">ورود</button>
          <button type="button" role="tab" id="tab-register" aria-selected="false" aria-controls="p-register">ثبت‌نام</button>
        </div>
        <form id="p-login" novalidate role="tabpanel" aria-labelledby="tab-login">
          <div class="form-error" role="alert" tabindex="-1" data-form-error></div>
          <div class="field"><label for="l-id">موبایل یا ایمیل</label>
            <input id="l-id" type="text" autocomplete="username" required data-validate="text" dir="ltr" style="text-align:right" aria-describedby="l-id-err">
            <div class="field__err" id="l-id-err">موبایل یا ایمیل را وارد کنید.</div></div>
          <div class="field"><label for="l-pw">گذرواژه</label>
            <input id="l-pw" type="password" autocomplete="current-password" required data-validate="text" dir="ltr" style="text-align:right" aria-describedby="l-pw-err">
            <div class="field__err" id="l-pw-err">گذرواژه را وارد کنید.</div></div>
          <button type="submit" class="btn btn--dark btn--lg" style="width:100%">ورود</button>
        </form>
        <form id="p-register" novalidate role="tabpanel" aria-labelledby="tab-register" hidden>
          <div class="form-error" role="alert" tabindex="-1" data-form-error></div>
          <div class="field"><label for="r-name">نام و نام خانوادگی</label>
            <input id="r-name" type="text" autocomplete="name" required data-validate="text" aria-describedby="r-name-err">
            <div class="field__err" id="r-name-err">نام را وارد کنید.</div></div>
          <div class="field-row">
            <div class="field"><label for="r-mobile">شماره موبایل</label>
              <input id="r-mobile" type="tel" inputmode="tel" autocomplete="tel" required data-validate="mobile" dir="ltr" style="text-align:right" aria-describedby="r-mobile-err">
              <div class="field__err" id="r-mobile-err">شماره موبایل معتبر نیست.</div></div>
            <div class="field"><label for="r-email">ایمیل <small>(اختیاری)</small></label>
              <input id="r-email" type="email" autocomplete="email" data-validate="email" dir="ltr" style="text-align:right" aria-describedby="r-email-err">
              <div class="field__err" id="r-email-err">ایمیل معتبر نیست.</div></div>
          </div>
          <div class="field"><label for="r-pw">گذرواژه <small>(دست‌کم ۸ نویسه)</small></label>
            <input id="r-pw" type="password" autocomplete="new-password" required data-validate="password" dir="ltr" style="text-align:right" aria-describedby="r-pw-err">
            <div class="field__err" id="r-pw-err">گذرواژه باید دست‌کم ۸ نویسه باشد.</div></div>
          <button type="submit" class="btn btn--dark btn--lg" style="width:100%">ساخت حساب</button>
        </form>
      </section>`;

    const tabs = { login: [$("#tab-login"), $("#p-login")], register: [$("#tab-register"), $("#p-register")] };
    const show = (k) => Object.entries(tabs).forEach(([n, [t, p]]) => { t.setAttribute("aria-selected", String(n === k)); p.hidden = n !== k; });
    tabs.login[0].addEventListener("click", () => show("login"));
    tabs.register[0].addEventListener("click", () => show("register"));

    const done = () => { const n = next(); if (n) location.href = n; else { window.MZ.me(true).then(accountView); } };
    const submitter = (form, fn) => form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearFormError(form);
      if (!validateForm(form)) return;
      const btn = $("button[type=submit]", form); btn.disabled = true;
      try { await fn(); done(); } catch (err) { formError(form, err); btn.disabled = false; }
    });
    submitter(tabs.login[1], () => api.login({ identifier: $("#l-id").value.trim(), password: $("#l-pw").value }));
    submitter(tabs.register[1], () => {
      const email = $("#r-email").value.trim();
      return api.register({ name: $("#r-name").value.trim(), mobile: $("#r-mobile").value.trim(), ...(email ? { email } : {}), password: $("#r-pw").value });
    });
  }

  async function accountView(user) {
    if (!user) return authView();
    root.innerHTML = `
      <section class="panel-light">
        <h2>${esc(user.name)}</h2>
        <p class="num" dir="ltr" style="text-align:right">${esc(user.mobile)}</p>
        <div style="display:flex;gap:1rem;flex-wrap:wrap">
          <a class="btn btn--dark" href="ticket.html">بلیت‌های من</a>
          <a class="btn btn--dark" href="booking.html">رزرو بلیت</a>
          <button type="button" class="btn" id="logout" style="color:var(--text-on-light);border-color:var(--text-on-light)">خروج</button>
        </div>
      </section>
      <h3 style="margin:2.2rem 0 1rem">رزروهای من</h3>
      <div id="res-host"></div>`;
    $("#logout").addEventListener("click", async () => { try { await api.logout(); } finally { window.MZ.me(true).then(accountView); } });
    const host = $("#res-host");
    const load = async () => {
      showState(host, "loading", "در حال بارگذاری رزروها…");
      try {
        const list = await api.reservations({ pageSize: 20 });
        if (!list.length) { showState(host, "empty", "هنوز رزروی ندارید."); return; }
        host.innerHTML = `<ul class="res-list">${list.map((r) => `
          <li class="res-item">
            <div class="res-item__top"><strong>${esc(r.concert.title)}</strong><span class="res-item__st res-item__st--${esc(r.status)}">${esc(STATUS[r.status] || r.status)}</span></div>
            <div>${esc(r.concert.display ? r.concert.display.date : "")} · ${r.seats.map((s) => esc(s.row) + toFa(s.number)).join("، ")}</div>
            <div class="num">${fmt(r.totalAmount)} تومان</div>
            <div>${r.status === "CONFIRMED" ? `<a class="link-arrow" href="ticket.html?reservation=${encodeURIComponent(r.id)}">مشاهده بلیت</a>`
              : r.status === "PENDING" && new Date(r.expiresAt).getTime() > api.serverNow() ? `<a class="link-arrow" href="checkout.html?reservation=${encodeURIComponent(r.id)}">ادامه پرداخت</a>` : ""}</div>
          </li>`).join("")}</ul>`;
      } catch (e) { showState(host, "error", errMsg(e), load); }
    };
    load();
  }

  window.MZ.me().then(
    (u) => { if (u && next()) { location.href = next(); return; } accountView(u); },
  );
})();
