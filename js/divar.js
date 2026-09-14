/* =========================================================
   DIVAR IMPORT
   دریافت آگهی از لینک دیوار و تبدیل به ساختار فایل املاک
========================================================= */

import { generateFileId, showToast, toEnglishDigits } from "./helpers.js";
import { state } from "./state.js";
import { commitFiles } from "./github.js";
import { getFileName, getFilePhone, isDeleted } from "./files.js";

const TAG_NEEDS_REVIEW = "needs-review-from-ad";
const TAG_DIVAR_DELETED = "divar-deleted";
const TAG_NEEDS_REVIEW_GENERAL = "needs-review";

/**
 * استخراج توکن آگهی از لینک دیوار
 * مثال: https://divar.ir/v/.../gajafK0m  →  gajafK0m
 */
export function extractDivarToken(url) {
  if (!url) return null;
  const s = String(url).trim();
  // /v/{slug}/{token} یا فقط token در انتهای مسیر
  const m =
    s.match(/divar\.ir\/v\/[^/]+\/([A-Za-z0-9_-]+)/i) ||
    s.match(/divar\.ir\/v\/([A-Za-z0-9_-]+)\/?$/i) ||
    s.match(/\/([A-Za-z0-9_-]{5,})\/?$/);
  if (m) return m[1];
  // اگر فقط توکن خام وارد شده
  if (/^[A-Za-z0-9_-]{5,20}$/.test(s)) return s;
  return null;
}

export function buildDivarUrl(token) {
  if (!token) return "";
  return `https://divar.ir/v/${token}`;
}

function parsePersianNumber(value) {
  if (value === null || value === undefined) return 0;
  let s = toEnglishDigits(String(value));
  s = s.replace(/[^\d]/g, "");
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseMoneyValue(value) {
  if (value === null || value === undefined) return 0;
  const s = toEnglishDigits(String(value))
    .replace(/,/g, "")
    .replace(/[^\d]/g, "");
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRooms(value) {
  if (value === null || value === undefined) return 0;
  const s = toEnglishDigits(String(value)).trim();
  const map = {
    یک: 1,
    دو: 2,
    سه: 3,
    چهار: 4,
    پنج: 5,
    "بدون اتاق": 0,
    استودیو: 0
  };
  if (map[s] !== undefined) return map[s];
  const n = parseInt(s.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function detectTypeFromCategory(category, title, description) {
  const cat = String(category || "").toLowerCase();
  const text = `${title || ""} ${description || ""}`.toLowerCase();

  const rentHints = [
    "rent",
    "اجاره",
    "رهن",
    "ودیعه",
    "residential-rent",
    "apartment-rent",
    "house-rent",
    "villa-rent"
  ];
  const saleHints = [
    "sell",
    "sale",
    "فروش",
    "residential-sell",
    "apartment-sell",
    "house-sell",
    "villa-sell"
  ];

  if (rentHints.some((h) => cat.includes(h) || text.includes(h))) {
    return "landlord";
  }
  if (saleHints.some((h) => cat.includes(h) || text.includes(h))) {
    return "sale";
  }
  // پیش‌فرض: اگر ودیعه/اجاره در متن بود اجاره
  if (/ودیعه|اجاره|رهن/.test(text)) return "landlord";
  return "sale";
}

function detectPropertyType(category, title) {
  const t = `${category || ""} ${title || ""}`.toLowerCase();
  if (/villa|ویلا|خانه.?ویلا|دربستی/.test(t)) return "villa";
  if (/office|اداری|دفتر/.test(t)) return "office";
  if (/commercial|تجاری|مغازه|فروشگاه/.test(t)) return "commercial";
  if (/land|زمین|قطعه/.test(t)) return "land";
  if (/garden|باغ/.test(t)) return "garden";
  return "apartment";
}

function collectKeyValues(obj, out = {}) {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    obj.forEach((item) => collectKeyValues(item, out));
    return out;
  }

  // ساختارهای رایج دیوار
  if (obj.title && (obj.value !== undefined || obj.available !== undefined)) {
    const key = String(obj.title).trim();
    out[key] = obj.value !== undefined ? obj.value : obj.available;
  }
  if (obj.name && obj.value !== undefined) {
    out[String(obj.name).trim()] = obj.value;
  }

  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") collectKeyValues(v, out);
  }
  return out;
}

function extractFromSections(sections) {
  const result = {
    title: "",
    description: "",
    attributes: {},
    amenities: []
  };
  if (!Array.isArray(sections)) return result;

  for (const section of sections) {
    const name = String(section.section_name || section.name || "").toUpperCase();
    const widgets = section.widgets || [];

    for (const w of widgets) {
      const data = w.data || w;
      if (!data) continue;

      if (name.includes("TITLE") || data.title) {
        if (data.title && !result.title) result.title = data.title;
        if (data.subtitle) result.subtitle = data.subtitle;
      }

      if (name.includes("DESCRIPTION") || data.text) {
        if (data.text && !result.description) result.description = data.text;
      }

      // ویژگی‌های گروهی
      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          if (item.title && item.value !== undefined) {
            result.attributes[String(item.title).trim()] = item.value;
          }
          if (item.title && item.available !== undefined) {
            const available = !!item.available;
            const title = String(item.title).trim();
            result.attributes[title] = available;
            mapAmenity(title, available, result.amenities);
          }
        }
      }

      if (data.title && data.value !== undefined) {
        result.attributes[String(data.title).trim()] = data.value;
      }
    }
  }
  return result;
}

function mapAmenity(title, available, list) {
  if (!available) return;
  const t = String(title).replace(/\s/g, "");
  const map = {
    پارکینگ: "parking",
    آسانسور: "elevator",
    انباری: "storage",
    بالکن: "balcony",
    تراس: "terrace",
    حیاط: "yard",
    استخر: "pool",
    جکوزی: "jacuzzi",
    روف: "roof",
    لابی: "lobby",
    نگهبان: "guard",
    پکیج: "package",
    کولر: "cooler",
    "گرمایشازکف": "floor-heating",
    کابینت: "cabinet",
    کمد: "closet"
  };
  for (const [fa, en] of Object.entries(map)) {
    if (t.includes(fa) && !list.includes(en)) list.push(en);
  }
}

function extractFromWidgets(widgets) {
  const result = {
    title: "",
    description: "",
    attributes: {},
    amenities: [],
    district: "",
    city: ""
  };
  if (!widgets || typeof widgets !== "object") return result;

  if (widgets.header) {
    result.title = widgets.header.title || result.title;
    result.date = widgets.header.date;
  }
  if (widgets.description) {
    result.description =
      widgets.description.text || widgets.description || result.description;
  }

  const listData = widgets.list_data;
  if (Array.isArray(listData)) {
    for (const block of listData) {
      if (Array.isArray(block.items)) {
        for (const item of block.items) {
          if (item.title && item.value !== undefined) {
            result.attributes[String(item.title).trim()] = item.value;
          }
          if (item.title && item.available !== undefined) {
            result.attributes[String(item.title).trim()] = item.available;
            mapAmenity(item.title, item.available, result.amenities);
          }
        }
      }
    }
  }

  collectKeyValues(widgets, result.attributes);
  return result;
}

function pickAttr(attrs, keys) {
  for (const k of keys) {
    for (const [title, value] of Object.entries(attrs)) {
      if (title.includes(k) || title === k) return value;
    }
  }
  return null;
}

/**
 * تبدیل پاسخ خام API دیوار به آبجکت فایل املاک
 */
export function mapDivarPostToFile(raw, token, originalUrl) {
  const dataRoot = raw.data || {};
  const webengage = dataRoot.webengage || {};
  const seo = raw.seo || {};
  const category =
    raw.category ||
    dataRoot.category ||
    seo.web_info?.category_slug ||
    webengage.category ||
    "";

  let parsed = { title: "", description: "", attributes: {}, amenities: [] };

  if (Array.isArray(raw.sections)) {
    parsed = { ...parsed, ...extractFromSections(raw.sections) };
  }
  if (raw.widgets) {
    const w = extractFromWidgets(raw.widgets);
    parsed.title = parsed.title || w.title;
    parsed.description = parsed.description || w.description;
    parsed.attributes = { ...w.attributes, ...parsed.attributes };
    parsed.amenities = [...new Set([...parsed.amenities, ...w.amenities])];
  }

  // عنوان از seo یا data
  const title =
    parsed.title ||
    raw.title ||
    dataRoot.title ||
    seo.title ||
    seo.web_info?.title ||
    "آگهی دیوار";

  const description =
    parsed.description ||
    dataRoot.description ||
    seo.description ||
    webengage.description ||
    "";

  const district =
    dataRoot.district ||
    seo.web_info?.district_persian ||
    webengage.district ||
    raw.district ||
    "";
  const city =
    dataRoot.city ||
    seo.web_info?.city_persian ||
    webengage.city ||
    raw.city ||
    "";

  const attrs = parsed.attributes;

  // متراژ
  let area =
    parsePersianNumber(webengage.size) ||
    parsePersianNumber(webengage.meterage) ||
    parsePersianNumber(pickAttr(attrs, ["متراژ", "متراژ بنا", "اندازه"]));

  // سال ساخت
  let year =
    parsePersianNumber(webengage.year) ||
    parsePersianNumber(webengage.construction_year) ||
    parsePersianNumber(pickAttr(attrs, ["ساخت", "سال ساخت", "سال"]));

  // اتاق
  let rooms =
    normalizeRooms(webengage.rooms) ||
    normalizeRooms(pickAttr(attrs, ["اتاق", "خواب", "تعداد اتاق"]));

  // طبقه
  const floorRaw =
    pickAttr(attrs, ["طبقه"]) ||
    webengage.floor ||
    "";
  let unitFloor = "";
  let totalFloors = 0;
  if (floorRaw) {
    const floorStr = toEnglishDigits(String(floorRaw));
    const parts = floorStr.match(/(\d+)\s*(?:از|\/)\s*(\d+)/);
    if (parts) {
      unitFloor = parts[1];
      totalFloors = parseInt(parts[2], 10) || 0;
    } else if (/همکف/.test(floorStr)) {
      unitFloor = "ground";
    } else if (/زیرزمین/.test(floorStr)) {
      unitFloor = "basement";
    } else {
      const n = parsePersianNumber(floorStr);
      if (n) unitFloor = String(n);
    }
  }

  // امکانات از attributes متنی (مثل «پارکینگ ندارد»)
  for (const [title, value] of Object.entries(attrs)) {
    const t = String(title);
    if (typeof value === "boolean") {
      mapAmenity(t, value, parsed.amenities);
    } else {
      const has = !/ندارد|بدون/.test(String(value)) && !/ندارد/.test(t);
      if (/پارکینگ|آسانسور|انباری|بالکن|تراس/.test(t)) {
        mapAmenity(t.replace(/ندارد/g, ""), has, parsed.amenities);
      }
    }
  }

  // قیمت‌ها
  const credit =
    parseMoneyValue(webengage.credit) ||
    parseMoneyValue(pickAttr(attrs, ["ودیعه", "رهن", "پیش‌پرداخت", "پیش پرداخت"]));
  const rent =
    parseMoneyValue(webengage.rent) ||
    parseMoneyValue(pickAttr(attrs, ["اجاره", "اجارهٔ ماهانه", "اجاره ماهانه"]));
  const salePrice =
    parseMoneyValue(webengage.price) ||
    parseMoneyValue(dataRoot.price) ||
    parseMoneyValue(pickAttr(attrs, ["قیمت", "مبلغ", "قیمت کل"]));

  const type = detectTypeFromCategory(category, title, description);
  const propertyType = detectPropertyType(category, title);

  const locationParts = [city, district].filter(Boolean);
  const location = locationParts.join("، ") || district || city || "";

  const notesParts = [];
  if (title) notesParts.push(`عنوان دیوار: ${title}`);
  if (description) notesParts.push(description);

  const now = new Date().toISOString();
  const file = {
    id: generateFileId(),
    type,
    status: "active",
    followUpDate: null,
    createdAt: now,
    updatedAt: now,
    name: "", // عمداً خالی — تا زمان وارد کردن دستی
    phone: "",
    propertyType,
    area,
    rooms,
    year,
    location,
    plaque: "",
    unitFloor,
    totalFloors,
    keyHolder: "",
    keyHolderName: "",
    keyHolderPhone: "",
    condition: "",
    occupancy: "",
    salePrice: type === "sale" ? salePrice : 0,
    currentDeposit: 0,
    currentRent: 0,
    suggestedDeposit: type === "landlord" ? credit : 0,
    suggestedRent: type === "landlord" ? rent : 0,
    capital: 0,
    buyerNotes: "",
    tenantDeposit: 0,
    tenantRent: 0,
    familyStatus: "",
    familySize: 0,
    tenantNotes: "",
    notes: notesParts.join("\n\n"),
    amenities: [...new Set(parsed.amenities)],
    // فیلدهای مخصوص دیوار
    source: "divar",
    divarToken: token,
    divarUrl: originalUrl || buildDivarUrl(token),
    divarTitle: title,
    tags: [TAG_NEEDS_REVIEW]
  };

  return file;
}

/**
 * دریافت آگهی از API دیوار
 * چند endpoint و در صورت نیاز پروکسی را امتحان می‌کند
 */
export async function fetchDivarPost(token) {
  const endpoints = [
    `https://api.divar.ir/v8/posts-v2/web/${token}`,
    `https://api.divar.ir/v8/posts/${token}`,
    `https://api.divar.ir/v8/posts/v2/web/${token}`
  ];

  const headers = {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  };

  let lastError = null;
  let notFound = false;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: "GET", headers, mode: "cors" });
      if (res.status === 404) {
        notFound = true;
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      if (json && (json.sections || json.widgets || json.data || json.title)) {
        return { ok: true, data: json, deleted: false };
      }
      lastError = new Error("ساختار پاسخ ناشناخته");
    } catch (err) {
      lastError = err;
      // CORS یا شبکه — endpoint بعدی
    }
  }

  // تلاش با پروکسی عمومی (ممکن است محدود باشد)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://api.divar.ir/v8/posts-v2/web/${token}`
    )}`;
    const res = await fetch(proxyUrl, { method: "GET" });
    if (res.ok) {
      const json = await res.json();
      if (json && (json.sections || json.widgets || json.data || json.title)) {
        return { ok: true, data: json, deleted: false };
      }
    }
    if (res.status === 404) notFound = true;
  } catch (err) {
    lastError = err;
  }

  if (notFound) {
    return { ok: false, deleted: true, error: "آگهی در دیوار پیدا نشد (حذف شده یا منقضی)." };
  }

  return {
    ok: false,
    deleted: false,
    error:
      lastError?.message ||
      "دریافت آگهی از دیوار ممکن نشد. احتمالاً محدودیت CORS یا شبکه است. لینک را ذخیره کنید و اطلاعات را دستی تکمیل کنید."
  };
}

/**
 * ساخت فایل حداقلی فقط با لینک (وقتی fetch شکست خورد)
 */
export function createStubDivarFile(token, originalUrl, typeHint = "landlord") {
  const now = new Date().toISOString();
  return {
    id: generateFileId(),
    type: typeHint === "sale" ? "sale" : "landlord",
    status: "active",
    followUpDate: null,
    createdAt: now,
    updatedAt: now,
    name: "",
    phone: "",
    propertyType: "apartment",
    area: 0,
    rooms: 0,
    year: 0,
    location: "",
    plaque: "",
    unitFloor: "",
    totalFloors: 0,
    keyHolder: "",
    keyHolderName: "",
    keyHolderPhone: "",
    condition: "",
    occupancy: "",
    salePrice: 0,
    currentDeposit: 0,
    currentRent: 0,
    suggestedDeposit: 0,
    suggestedRent: 0,
    capital: 0,
    buyerNotes: "",
    tenantDeposit: 0,
    tenantRent: 0,
    familyStatus: "",
    familySize: 0,
    tenantNotes: "",
    notes: `لینک دیوار:\n${originalUrl || buildDivarUrl(token)}`,
    amenities: [],
    source: "divar",
    divarToken: token,
    divarUrl: originalUrl || buildDivarUrl(token),
    divarTitle: "",
    tags: [TAG_NEEDS_REVIEW]
  };
}

/**
 * بررسی اینکه فایل هنوز نیاز به تکمیل نام/تلفن دارد
 */
export function fileNeedsReviewFromAd(file) {
  if (!file || file.source !== "divar") return false;
  const tags = Array.isArray(file.tags) ? file.tags : [];
  if (tags.includes(TAG_NEEDS_REVIEW) || tags.includes(TAG_NEEDS_REVIEW_GENERAL)) {
    return true;
  }
  const name = (getFileName(file) || "").trim();
  const phone = (getFilePhone(file) || "").trim();
  const isPlaceholderName =
    !name ||
    name === "بدون نام" ||
    name.startsWith("آگهی دیوار");
  return isPlaceholderName || !phone;
}

export function fileIsDivarDeleted(file) {
  if (!file) return false;
  const tags = Array.isArray(file.tags) ? file.tags : [];
  return tags.includes(TAG_DIVAR_DELETED);
}

/**
 * بعد از ذخیره/ویرایش: اگر نام و تلفن پر شد، تگ نیاز به بررسی را بردار
 */
export function refreshDivarTags(file) {
  if (!file || file.source !== "divar") return file;
  const tags = new Set(Array.isArray(file.tags) ? file.tags : []);
  const name = (file.name || "").trim();
  const phone = (file.phone || "").trim();
  const hasRealContact =
    name &&
    name !== "بدون نام" &&
    !name.startsWith("آگهی دیوار") &&
    phone &&
    phone.length >= 10;

  if (hasRealContact) {
    tags.delete(TAG_NEEDS_REVIEW);
    tags.delete(TAG_NEEDS_REVIEW_GENERAL);
  } else {
    tags.add(TAG_NEEDS_REVIEW);
  }
  file.tags = [...tags];
  return file;
}

/**
 * علامت‌گذاری آگهی حذف‌شده از دیوار
 */
export function markDivarDeleted(file) {
  if (!file) return file;
  const tags = new Set(Array.isArray(file.tags) ? file.tags : []);
  tags.add(TAG_DIVAR_DELETED);
  tags.add(TAG_NEEDS_REVIEW_GENERAL);
  file.tags = [...tags];
  file.updatedAt = new Date().toISOString();
  return file;
}

/**
 * جلوگیری از ثبت تکراری همان آگهی دیوار
 */
export function findDuplicateDivarToken(token, excludeId = null) {
  if (!token) return null;
  return (
    state.files.find((f) => {
      if (!f || isDeleted(f)) return false;
      if (excludeId && f.id === excludeId) return false;
      return f.divarToken === token || f.source === "divar" && f.divarToken === token;
    }) || null
  );
}

/**
 * فرآیند کامل: لینک → فایل → ذخیره در state + GitHub
 */
export async function importFromDivarUrl(url, typeHint = null) {
  const token = extractDivarToken(url);
  if (!token) {
    throw new Error("لینک دیوار معتبر نیست. نمونه: https://divar.ir/v/.../TOKEN");
  }

  const dup = findDuplicateDivarToken(token);
  if (dup) {
    throw new Error(
      `این آگهی قبلاً با عنوان «${getFileName(dup)}» ثبت شده است.`
    );
  }

  const result = await fetchDivarPost(token);
  let file;

  if (result.ok) {
    file = mapDivarPostToFile(result.data, token, url.trim());
    if (typeHint === "sale" || typeHint === "landlord") {
      file.type = typeHint;
    }
  } else if (result.deleted) {
    file = createStubDivarFile(token, url.trim(), typeHint || "landlord");
    markDivarDeleted(file);
    showToast("آگهی در دیوار پیدا نشد — با تگ «حذف‌شده از دیوار» ذخیره شد.", "warning");
  } else {
    // CORS یا خطای شبکه: stub ذخیره می‌کنیم تا لینک از دست نرود
    file = createStubDivarFile(token, url.trim(), typeHint || "landlord");
    showToast(
      "دریافت خودکار کامل نشد. لینک ذخیره شد؛ مشخصات را دستی تکمیل کنید.",
      "warning"
    );
  }

  // نام موقت برای نمایش تا زمان تکمیل
  if (!file.name) {
    file.name = file.divarTitle
      ? `آگهی دیوار: ${file.divarTitle}`
      : "آگهی دیوار (نیاز به بررسی)";
  }

  const newFiles = [...state.files, file];
  const success = await commitFiles(
    newFiles,
    `Import Divar ad ${token}`
  );
  if (!success) {
    throw new Error("ذخیره روی GitHub ناموفق بود.");
  }
  state.files = newFiles;
  return file;
}

export {
  TAG_NEEDS_REVIEW,
  TAG_DIVAR_DELETED,
  TAG_NEEDS_REVIEW_GENERAL
};
