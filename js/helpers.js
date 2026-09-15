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

/**
 * تبدیل ارقام فارسی/عربی به لاتین
 */
export function toEnglishDigits(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

/**
 * فقط رقم‌ها را نگه می‌دارد
 */
export function parseMoney(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  const cleaned = toEnglishDigits(value).replace(/[^\d]/g, "");
  if (!cleaned) return 0;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * فرمت نمایش عدد با جداکننده سه‌رقمی: 10,000,000
 */
export function formatGroupedNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : parseMoney(value);
  if (!Number.isFinite(n) || n === 0) {
    // اگر صفر واقعی از ورودی خالی آمده، خالی برگردان
    if (value === "" || value === null || value === undefined) return "";
  }
  if (!Number.isFinite(n)) return "";
  return Math.trunc(n).toLocaleString("en-US");
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
  return Number(value).toLocaleString("en-US");
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = parseMoney(value);
  if (!number) return "—";
  return `${number.toLocaleString("en-US")} تومان`;
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
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    let hex = "";
    for (let i = 0; i < arr.length; i++) {
      hex += arr[i].toString(16).padStart(2, "0");
    }
    return `file-${Date.now()}-${hex}`;
  }
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 11);
  const micro = Math.floor(Math.random() * 1000);
  return `file-${timestamp}-${micro}-${randomPart}`;
}

export function validatePhoneNumber(phone) {
  if (!phone) return false;
  const cleaned = toEnglishDigits(phone).replace(/[\s\-()]/g, "");
  const iranianPhoneRegex = /^(?:0098|\+98|0)?9\d{9}$/;
  return iranianPhoneRegex.test(cleaned);
}

export async function copyToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fallback
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function shareFileText(title, text) {
  const payload = {
    title: title || "املاک DOT",
    text: text || ""
  };

  try {
    if (navigator.share && navigator.canShare?.(payload)) {
      await navigator.share(payload);
      return "shared";
    }
  } catch (err) {
    if (err && err.name === "AbortError") return "cancelled";
  }

  const ok = await copyToClipboard(text);
  return ok ? "copied" : "failed";
}

/**
 * اتصال فرمت‌کننده پول به اینپوت‌های کلاس money-input
 */
export function setupMoneyInputs(root = document) {
  const inputs = root.querySelectorAll(".money-input");

  inputs.forEach((input) => {
    if (input.dataset.moneyBound === "1") return;
    input.dataset.moneyBound = "1";

    input.addEventListener("input", () => {
      const raw = parseMoney(input.value);
      const formatted = raw ? formatGroupedNumber(raw) : "";
      // حفظ موقعیت تقریبی کرسر
      const oldLen = input.value.length;
      const pos = input.selectionStart ?? oldLen;
      input.value = formatted;
      const newLen = input.value.length;
      const newPos = Math.max(0, pos + (newLen - oldLen));
      try {
        input.setSelectionRange(newPos, newPos);
      } catch {
        // ignore
      }
    });

    input.addEventListener("blur", () => {
      const raw = parseMoney(input.value);
      input.value = raw ? formatGroupedNumber(raw) : "";
    });
  });
}

export function setMoneyInputValue(id, value) {
  const el = $(id);
  if (!el) return;
  const n = parseMoney(value);
  el.value = n ? formatGroupedNumber(n) : "";
}

export function isEncryptedPhonePlaceholder(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (v.startsWith("enc:")) return true;
  if (v === "[رمز شده]" || v.includes("رمز شده")) return true;
  return false;
}


export function buildWhatsAppText(lines) {
  return Array.isArray(lines) ? lines.filter(Boolean).join("\n") : String(lines || "");
}

export function openWhatsApp(text) {
  const url = "https://wa.me/?text=" + encodeURIComponent(text || "");
  window.open(url, "_blank", "noopener,noreferrer");
}
