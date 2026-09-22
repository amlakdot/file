/* =========================================================
   DIVAR — URL / TOKEN
========================================================= */

import { toEnglishDigits } from "./helpers.js";

/* =========================================================
   TOKEN
   ========================================================= */

/**
 * پاک‌سازی متن کپی‌شده از موبایل (کاراکتر نامرئی، فاصلهٔ اضافه)
 */
function cleanPastedUrl(url) {
  return String(url || "")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "") // zero-width / nbsp
    .replace(/\s+/g, "")
    .trim();
}

/**
 * استخراج توکن آگهی از لینک دیوار
 *
 * پشتیبانی:
 * https://divar.ir/v/slug-name/TOKEN
 * https://divar.ir/v/TOKEN
 * https://divar.ir/v/TOKEN?ref=android
 * TOKEN
 */
export function extractDivarToken(url) {
  if (!url) return null;

  let s = cleanPastedUrl(url);

  // فقط token
  if (/^[A-Za-z0-9_-]{5,40}$/.test(s)) {
    return s;
  }

  // بدون پروتکل: divar.ir/v/...
  if (!/^https?:\/\//i.test(s) && /divar\.ir/i.test(s)) {
    s = "https://" + s.replace(/^\/+/, "");
  }

  try {
    // query و hash را قبل از parse حذف نکن — URL API خودش pathname می‌دهد
    const u = new URL(s);

    if (!u.hostname.toLowerCase().endsWith("divar.ir")) {
      return null;
    }

    const parts = u.pathname
      .split("/")
      .filter(Boolean);

    const vIndex = parts.findIndex(
      (part) => part.toLowerCase() === "v"
    );

    if (vIndex === -1) {
      // گاهی token فقط در query است
      const qToken =
        u.searchParams.get("token") ||
        u.searchParams.get("post_token");
      if (qToken && /^[A-Za-z0-9_-]{5,40}$/.test(qToken)) {
        return qToken;
      }
      return null;
    }

    const afterV = parts.slice(vIndex + 1);

    if (!afterV.length) {
      return null;
    }

    /*
      دیوار ممکن است:
      /v/TOKEN
      /v/slug/TOKEN
      /v/عنوان-فارسی/TOKEN
      آخرین بخش بعد از /v/ را token در نظر می‌گیریم.
      ?ref=android و بقیه query نادیده گرفته می‌شوند.
    */
    const token = decodeURIComponent(
      afterV[afterV.length - 1]
    ).trim();

    if (!/^[A-Za-z0-9_-]{5,40}$/.test(token)) {
      return null;
    }

    return token;
  } catch {
    // آخرین شانس: پیدا کردن الگوی token در متن (با یا بدون ?ref=)
    const m = String(url).match(
      /(?:\/v\/(?:[^/\s?#]+\/)?)([A-Za-z0-9_-]{5,40})(?:[/?#]|$)/
    );
    return m ? m[1] : null;
  }
}


export function buildDivarUrl(token) {
  if (!token) return "";
  return `https://divar.ir/v/${encodeURIComponent(token)}`;
}

/**
 * لینک دیوار را به فرم تمیز استاندارد تبدیل می‌کند:
 * https://divar.ir/v/TOKEN
 * (بدون ?ref=android و پارامترهای اضافه)
 */
export function normalizeDivarUrl(url) {
  const token = extractDivarToken(url);
  if (!token) return "";
  return buildDivarUrl(token);
}


export { cleanPastedUrl };
