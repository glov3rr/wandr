export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDate(isoDate) {
  return new Date(isoDate + "T00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export const cedis = (amount) => "GHS " + amount.toLocaleString("en-GB");

export const plural = (count, word, many = word + "s") => `${count} ${count === 1 ? word : many}`;

export function todayISO() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function nightsBetween(start, end) {
  return Math.round((new Date(end + "T00:00") - new Date(start + "T00:00")) / 86400000);
}
