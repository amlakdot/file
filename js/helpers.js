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
 * هایلایت کلمات جست‌وجو داخل متن (خروجی HTML امن)
 * keywords: آرایه یا رشته؛ زیررشته‌ها case-insensitive match می‌شوند
 */
export function highlightMatches(text, keywords) {
  const raw = String(text ?? "");
  if (!raw) return "";

  let list = [];
  if (Array.isArray(keywords)) {
    list = keywords.map((k) => String(k ?? "").trim()).filter(Boolean);
  } else if (keywords != null && String(keywords).trim()) {
    list = String(keywords)
      .trim()
      .split(/\s+/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 1);
  }

  if (!list.length) return escapeHtml(raw);

  const escaped = list.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = raw.split(pattern);

  return parts
    .map((part) => {
      if (!part) return "";
      const isMatch = list.some(
        (k) => part.toLowerCase() === k.toLowerCase()
      );
      const safe = escapeHtml(part);
      return isMatch ? `<mark class="search-highlight">${safe}</mark>` : safe;
    })
    .join("");
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

/**
 * کد عددی فایل برای نمایش روی کارت (مثل تگ)
 * از روی لیست فعلی، بزرگ‌ترین کد + ۱ (شروع از ۱۰۰۱)
 */
export function generateFileCode(files = []) {
  const list = Array.isArray(files) ? files : [];
  let max = 1000;
  for (const f of list) {
    const n = Number(f?.code);
    if (Number.isFinite(n) && n > max) max = Math.floor(n);
  }
  return max + 1;
}

/** نمایش کد فایل با ارقام فارسی */
export function formatFileCode(code) {
  const n = Number(code);
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.floor(n).toLocaleString("fa-IR");
}

/**
 * به فایل‌های بدون کد، کد عددی بده (به ترتیب createdAt)
 * @returns {{ files: any[], changed: boolean }}
 */
export function ensureFileCodes(files = []) {
  const list = Array.isArray(files) ? files.map((f) => ({ ...f })) : [];
  let max = 1000;
  for (const f of list) {
    const n = Number(f?.code);
    if (Number.isFinite(n) && n > max) max = Math.floor(n);
  }
  const missing = list
    .filter((f) => !(Number(f?.code) > 0))
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return ta - tb;
    });
  if (!missing.length) return { files: list, changed: false };
  const byId = new Map(list.map((f) => [f.id, f]));
  for (const f of missing) {
    max += 1;
    const target = byId.get(f.id);
    if (target) target.code = max;
  }
  return { files: list, changed: true };
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

/* =========================================================
   APP LOGGER — دسته‌بندی‌شده برای دیباگ
========================================================= */

const LOG_MAX = 300;
const LOG_STORAGE_KEY = "amlakdot_app_logs_v1";

/** @type {{ id: number, ts: number, level: string, category: string, message: string, detail?: string }[]} */
let _logEntries = [];
let _logIdSeq = 1;

function _loadLogsFromStorage() {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      _logEntries = parsed.slice(-LOG_MAX);
      const maxId = _logEntries.reduce((m, e) => Math.max(m, e.id || 0), 0);
      _logIdSeq = maxId + 1;
    }
  } catch {
    /* ignore */
  }
}

function _persistLogs() {
  try {
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(_logEntries.slice(-LOG_MAX)));
  } catch {
    /* quota / private mode */
  }
}

_loadLogsFromStorage();

/**
 * ثبت لاگ دسته‌بندی‌شده
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} category  e.g. divar | network | github | auth | ui | general
 * @param {string} message
 * @param {unknown} [detail]
 */
export function appLog(level, category, message, detail) {
  const entry = {
    id: _logIdSeq++,
    ts: Date.now(),
    level: level || "info",
    category: category || "general",
    message: String(message || ""),
    detail:
      detail == null
        ? undefined
        : typeof detail === "string"
          ? detail
          : (() => {
              try {
                return JSON.stringify(detail, null, 2);
              } catch {
                return String(detail);
              }
            })()
  };
  _logEntries.push(entry);
  if (_logEntries.length > LOG_MAX) {
    _logEntries = _logEntries.slice(-LOG_MAX);
  }
  _persistLogs();

  // console هم برای DevTools
  const prefix = `[${entry.category}]`;
  if (level === "error") console.error(prefix, message, detail ?? "");
  else if (level === "warn") console.warn(prefix, message, detail ?? "");
  else if (level === "debug") console.debug(prefix, message, detail ?? "");
  else console.info(prefix, message, detail ?? "");

  return entry;
}

export function getAppLogs({ category, level, limit } = {}) {
  let list = _logEntries;
  if (category && category !== "all") {
    if (category === "error") {
      list = list.filter((e) => e.level === "error");
    } else {
      list = list.filter((e) => e.category === category);
    }
  }
  if (level) list = list.filter((e) => e.level === level);
  if (limit && limit > 0) list = list.slice(-limit);
  return list.slice();
}

export function clearAppLogs() {
  _logEntries = [];
  _persistLogs();
}

export function formatLogsForCopy(entries) {
  return (entries || _logEntries)
    .map((e) => {
      const t = new Date(e.ts).toISOString();
      const d = e.detail ? `\n  ${e.detail.replace(/\n/g, "\n  ")}` : "";
      return `[${t}] ${e.level.toUpperCase()} ${e.category}: ${e.message}${d}`;
    })
    .join("\n");
}
