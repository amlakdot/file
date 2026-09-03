/* =========================================================
   HELPERS
========================================================= */

export const $ = (id) => document.getElementById(id);

export function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    Number.isNaN(Number(value))
  ) {
    return "";
  }
  return Number(value).toLocaleString("fa-IR");
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(value);
  return `${number.toLocaleString("fa-IR")} تومان`;
}

export function formatDate(dateValue) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatDateTime(dateValue) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function showToast(message, type = "success") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden", "success", "error", "warning");
  toast.classList.add(type);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

export function setLoginError(message) {
  const element = $("loginError");
  if (!element) return;
  element.textContent = message || "";
  if (message) {
    element.classList.remove("hidden");
  } else {
    element.classList.add("hidden");
  }
}

export function generateFileId() {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 11);
  const micro = Math.floor(Math.random() * 1000);
  return `file-${timestamp}-${micro}-${randomPart}`;
}

export function validatePhoneNumber(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  const iranianPhoneRegex = /^(?:0098|\+98|0)?9\d{9}$/;
  return iranianPhoneRegex.test(cleaned);
}
