// Persian (Jalali) date/time formatting done on the server so the frontend stays free of calendar logic.
const TZ = "Asia/Tehran";
const dateParts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fa-IR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const yearOnly = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { timeZone: TZ, year: "numeric" });

const FA = "۰۱۲۳۴۵۶۷۸۹";
export const toFaDigits = (v) => String(v).replace(/\d/g, (d) => FA[d]);

export function displayFor(date, durationMinutes) {
  const d = new Date(date);
  const parts = Object.fromEntries(dateParts.formatToParts(d).map((p) => [p.type, p.value]));
  const time = timeFmt.format(d);
  return {
    day: parts.day,
    month: parts.month,
    year: parts.year,
    date: `${parts.day} ${parts.month} ${parts.year}`,
    time,
    duration: durationMinutes ? `${toFaDigits(durationMinutes)} دقیقه` : null,
  };
}

/** Jalali year as a latin number, e.g. 1405 */
export const jalaliYear = (date) => Number(yearOnly.formatToParts(new Date(date)).find((p) => p.type === "year").value.replace(/\D/g, ""));

/** Gregorian Date (UTC instant) of a Jalali wall-clock time in Tehran. Used by the seed only. */
export function fromJalali(y, m, d, hh = 0, mm = 0) {
  const target = `${y}-${m}-${d}`;
  const fmt = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" });
  const start = Date.UTC(y + 621, 0, 1);
  for (let i = 0; i < 800; i++) {
    const probe = new Date(start + i * 86400000 + 12 * 3600000);
    const p = Object.fromEntries(fmt.formatToParts(probe).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === target) {
      const tehranMidnightUtc = Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), probe.getUTCDate()) - 3.5 * 3600000;
      return new Date(tehranMidnightUtc + (hh * 60 + mm) * 60000);
    }
  }
  throw new Error(`Cannot convert Jalali date ${target}`);
}
