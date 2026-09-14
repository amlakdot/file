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
 * پشتیبانی از:
 *  https://divar.ir/v/slug-name/TOKEN
 *  https://divar.ir/v/TOKEN
 *  TOKEN خام
 */
export function extractDivarToken(url) {
  if (!url) return null;
  const s = String(url).trim();

  // فرم کامل: /v/{slug}/{token}
  let m = s.match(/divar\.ir\/v\/[^/?#]+\/([A-Za-z0-9_-]{5,})/i);
  if (m) return m[1];

  // فرم کوتاه: /v/{token}
  m = s.match(/divar\.ir\/v\/([A-Za-z0-9_-]{5,})\/?(?:[?#]|$)/i);
  if (m) return m[1];

  // فقط توکن
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
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  const s = toEnglishDigits(String(value))
    .replace(/,/g, "")
    .replace(/[^\d]/g, "");
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRooms(value) {
  if (value === null || value === undefined || value === "") return 0;
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

  if (
    /rent|اجاره|رهن|ودیعه|residential-rent|apartment-rent|house-rent|villa-rent/.test(
      cat
    ) ||
    /اجاره|رهن|ودیعه/.test(text)
  ) {
    return "landlord";
  }
  if (
    /sell|sale|فروش|residential-sell|apartment-sell|house-sell|villa-sell/.test(
      cat
    ) ||
    /فروش/.test(text)
  ) {
    return "sale";
  }
  return "sale";
}

function detectPropertyType(category, title) {
  const t = `${category || ""} ${title || ""}`.toLowerCase();
  if (/villa|ویلا|خانه.?ویلا|دربستی|house-/.test(t)) return "villa";
  if (/office|اداری|دفتر/.test(t)) return "office";
  if (/commercial|تجاری|مغازه|فروشگاه/.test(t)) return "commercial";
  if (/land|زمین|قطعه/.test(t)) return "land";
  if (/garden|باغ/.test(t)) return "garden";
  return "apartment";
}

function mapAmenity(title, available, list) {
  if (!available) return;
  const t = String(title || "").replace(/\s/g, "");
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
    گرمایشازکف: "floor-heating",
    کابینت: "cabinet",
    کمد: "closet"
  };
  for (const [fa, en] of Object.entries(map)) {
    if (t.includes(fa) && !list.includes(en)) list.push(en);
  }
}

/**
 * استخراج فیلدها از ساختار واقعی posts-v2/web
 */
function parseDivarResponse(raw) {
  const result = {
    title: "",
    description: "",
    subtitle: "",
    category: "",
    city: "",
    district: "",
    area: 0,
    year: 0,
    rooms: 0,
    unitFloor: "",
    totalFloors: 0,
    credit: 0,
    rent: 0,
    salePrice: 0,
    amenities: [],
    attributes: {}
  };

  const webengage = raw.webengage || {};
  const seo = raw.seo || {};
  const webInfo = seo.web_info || {};
  const cityObj = raw.city || {};

  result.title =
    webInfo.title ||
    (raw.share && raw.share.title) ||
    webengage.title ||
    "";
  result.category =
    webengage.category ||
    webengage.cat_3 ||
    webengage.cat_2 ||
    webInfo.category_slug_persian ||
    "";
  result.city =
    cityObj.name ||
    webInfo.city_persian ||
    webengage.city ||
    "";
  result.district = webengage.district || "";

  result.credit = parseMoneyValue(webengage.credit);
  result.rent = parseMoneyValue(webengage.rent);
  result.salePrice = parseMoneyValue(webengage.price);

  const sections = Array.isArray(raw.sections) ? raw.sections : [];

  for (const section of sections) {
    const sectionName = String(section.section_name || "").toUpperCase();
    const widgets = section.widgets || [];

    for (const widget of widgets) {
      const wt = String(widget.widget_type || "").toUpperCase();
      const d = widget.data || {};

      if (sectionName === "TITLE") {
        if (wt.includes("TITLE") && d.title && !result.title) {
          result.title = d.title;
        }
        if (wt === "EXPANDABLE_SECTION" && d.title) {
          result.subtitle = d.title;
        }
      }

      if (sectionName === "DESCRIPTION" && d.text) {
        if (wt === "DESCRIPTION_ROW" || (!result.description && d.text !== "توضیحات")) {
          if (d.text !== "توضیحات") {
            result.description = d.text;
          }
        }
      }

      if (sectionName === "LIST_DATA") {
        if (wt === "GROUP_INFO_ROW" && Array.isArray(d.items)) {
          for (const item of d.items) {
            const t = String(item.title || "").trim();
            const v = item.value;
            result.attributes[t] = v;
            if (t.includes("متراژ")) result.area = parsePersianNumber(v);
            else if (t.includes("ساخت") || t.includes("سال"))
              result.year = parsePersianNumber(v);
            else if (t.includes("اتاق") || t.includes("خواب"))
              result.rooms = normalizeRooms(v);
          }
        }

        if (wt === "UNEXPANDABLE_ROW" && d.title) {
          const t = String(d.title).trim();
          const v = d.value;
          result.attributes[t] = v;
          if (t.includes("طبقه") && v) {
            const floorStr = toEnglishDigits(String(v));
            const parts = floorStr.match(/(\d+)\s*(?:از|\/)\s*(\d+)/);
            if (parts) {
              result.unitFloor = parts[1];
              result.totalFloors = parseInt(parts[2], 10) || 0;
            } else if (/همکف/.test(floorStr)) {
              result.unitFloor = "ground";
            } else if (/زیرزمین/.test(floorStr)) {
              result.unitFloor = "basement";
            } else {
              const n = parsePersianNumber(floorStr);
              if (n) result.unitFloor = String(n);
            }
          }
          if (t.includes("ودیعه") || t.includes("رهن")) {
            const money = parseMoneyValue(v);
            if (money > 0) result.credit = money;
          }
          if (t.includes("اجاره")) {
            if (/رایگان/.test(String(v))) {
              result.rent = 0;
            } else {
              const money = parseMoneyValue(v);
              if (money > 0) result.rent = money;
            }
          }
          if (t.includes("قیمت") && !t.includes("اجاره") && !t.includes("ودیعه")) {
            const money = parseMoneyValue(v);
            if (money > 0) result.salePrice = money;
          }
        }

        if (wt === "RENT_SLIDER") {
          if (d.credit) {
            const c =
              parseMoneyValue(d.credit.value) ||
              parseMoneyValue(d.credit.transformed_value);
            if (c > 0) result.credit = c;
          }
          if (d.rent) {
            const r =
              parseMoneyValue(d.rent.value) ||
              parseMoneyValue(d.rent.transformed_value);
            if (d.rent.value !== undefined || d.rent.transformed_value !== undefined) {
              result.rent = r;
            }
          }
        }

        if (wt === "GROUP_FEATURE_ROW" && Array.isArray(d.items)) {
          for (const item of d.items) {
            const available = item.available === true;
            mapAmenity(item.title, available, result.amenities);
            result.attributes[String(item.title || "")] = available;
          }
        }
      }
    }
  }

  if (result.subtitle) {
    const locMatch = result.subtitle.match(/در\s+(.+)$/);
    if (locMatch) {
      const loc = locMatch[1].trim();
      if (!result.district) {
        result.district = loc;
      }
    }
  }

  return result;
}

/**
 * تبدیل پاسخ خام API دیوار به آبجکت فایل املاک
 */
export function mapDivarPostToFile(raw, token, originalUrl) {
  const parsed = parseDivarResponse(raw);

  const type = detectTypeFromCategory(
    parsed.category,
    parsed.title,
    parsed.description
  );
  const propertyType = detectPropertyType(parsed.category, parsed.title);

  let location = "";
  if (parsed.district && parsed.city) {
    if (parsed.district.includes(parsed.city)) {
      location = parsed.district;
    } else {
      location = `${parsed.city}، ${parsed.district}`;
    }
  } else {
    location = parsed.district || parsed.city || "";
  }

  const notesParts = [];
  if (parsed.title) notesParts.push(`عنوان دیوار: ${parsed.title}`);
  if (parsed.description) notesParts.push(parsed.description);

  const now = new Date().toISOString();
  const displayTitle = parsed.title || "آگهی دیوار";

  const file = {
    id: generateFileId(),
    type,
    status: "active",
    followUpDate: null,
    createdAt: now,
    updatedAt: now,
    name: `آگهی دیوار: ${displayTitle}`,
    phone: "",
    propertyType,
    area: parsed.area || 0,
    rooms: parsed.rooms || 0,
    year: parsed.year || 0,
    location,
    plaque: "",
    unitFloor: parsed.unitFloor || "",
    totalFloors: parsed.totalFloors || 0,
    keyHolder: "",
    keyHolderName: "",
    keyHolderPhone: "",
    condition: "",
    occupancy: "",
    salePrice: type === "sale" ? parsed.salePrice || 0 : 0,
    currentDeposit: 0,
    currentRent: 0,
    suggestedDeposit: type === "landlord" ? parsed.credit || 0 : 0,
    suggestedRent: type === "landlord" ? parsed.rent || 0 : 0,
    capital: 0,
    buyerNotes: "",
    tenantDeposit: 0,
    tenantRent: 0,
    familyStatus: "",
    familySize: 0,
    tenantNotes: "",
    notes: notesParts.join("\n\n"),
    amenities: [...new Set(parsed.amenities)],
    source: "divar",
    divarToken: token,
    divarUrl: originalUrl || buildDivarUrl(token),
    divarTitle: displayTitle,
    tags: [TAG_NEEDS_REVIEW]
  };

  return file;
}

async function fetchViaAllOrigins(apiUrl) {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
  const res = await fetch(proxyUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(`proxy HTTP ${res.status}`);
  }
  const wrapper = await res.json();
  const httpCode = wrapper && wrapper.status && wrapper.status.http_code;
  if (httpCode === 404) {
    const err = new Error("NOT_FOUND");
    err.notFound = true;
    throw err;
  }
  if (httpCode && httpCode >= 400) {
    throw new Error(`upstream HTTP ${httpCode}`);
  }
  let data = wrapper.contents;
  if (typeof data === "string") {
    data = JSON.parse(data);
  }
  return data;
}

async function fetchDirect(apiUrl) {
  const res = await fetch(apiUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    mode: "cors"
  });
  if (res.status === 404) {
    const err = new Error("NOT_FOUND");
    err.notFound = true;
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchDivarPost(token) {
  const endpoints = [
    `https://api.divar.ir/v8/posts-v2/web/${token}`,
    `https://api.divar.ir/v8/posts/${token}`
  ];

  let notFound = false;
  let lastError = null;

  for (const url of endpoints) {
    try {
      const data = await fetchViaAllOrigins(url);
      if (data && (data.sections || data.webengage || data.seo || data.share)) {
        return { ok: true, data, deleted: false };
      }
      lastError = new Error("ساختار پاسخ ناشناخته از پروکسی");
    } catch (err) {
      if (err.notFound) notFound = true;
      lastError = err;
    }
  }

  for (const url of endpoints) {
    try {
      const data = await fetchDirect(url);
      if (data && (data.sections || data.webengage || data.seo || data.share)) {
        return { ok: true, data, deleted: false };
      }
    } catch (err) {
      if (err.notFound) notFound = true;
      lastError = err;
    }
  }

  if (notFound) {
    return {
      ok: false,
      deleted: true,
      error: "آگهی در دیوار پیدا نشد (حذف شده یا منقضی)."
    };
  }

  return {
    ok: false,
    deleted: false,
    error:
      (lastError && lastError.message) ||
      "دریافت آگهی از دیوار ممکن نشد. لینک ذخیره می‌شود؛ مشخصات را دستی تکمیل کنید."
  };
}

export function createStubDivarFile(token, originalUrl, typeHint = "landlord") {
  const now = new Date().toISOString();
  return {
    id: generateFileId(),
    type: typeHint === "sale" ? "sale" : "landlord",
    status: "active",
    followUpDate: null,
    createdAt: now,
    updatedAt: now,
    name: "آگهی دیوار (نیاز به بررسی)",
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

export function fileNeedsReviewFromAd(file) {
  if (!file || file.source !== "divar") return false;
  const tags = Array.isArray(file.tags) ? file.tags : [];
  if (tags.includes(TAG_NEEDS_REVIEW) || tags.includes(TAG_NEEDS_REVIEW_GENERAL)) {
    return true;
  }
  const name = (getFileName(file) || "").trim();
  const phone = (getFilePhone(file) || "").trim();
  const isPlaceholderName =
    !name || name === "بدون نام" || name.startsWith("آگهی دیوار");
  return isPlaceholderName || !phone;
}

export function fileIsDivarDeleted(file) {
  if (!file) return false;
  const tags = Array.isArray(file.tags) ? file.tags : [];
  return tags.includes(TAG_DIVAR_DELETED);
}

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

export function markDivarDeleted(file) {
  if (!file) return file;
  const tags = new Set(Array.isArray(file.tags) ? file.tags : []);
  tags.add(TAG_DIVAR_DELETED);
  tags.add(TAG_NEEDS_REVIEW_GENERAL);
  file.tags = [...tags];
  file.updatedAt = new Date().toISOString();
  return file;
}

export function findDuplicateDivarToken(token, excludeId = null) {
  if (!token) return null;
  return (
    state.files.find((f) => {
      if (!f || isDeleted(f)) return false;
      if (excludeId && f.id === excludeId) return false;
      return f.divarToken === token;
    }) || null
  );
}

export async function importFromDivarUrl(url, typeHint = null) {
  const token = extractDivarToken(url);
  if (!token) {
    throw new Error(
      "لینک دیوار معتبر نیست. نمونه: https://divar.ir/v/TOKEN یا https://divar.ir/v/عنوان/TOKEN"
    );
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
      if (typeHint === "sale") {
        file.salePrice = file.salePrice || file.suggestedDeposit || 0;
        file.suggestedDeposit = 0;
        file.suggestedRent = 0;
      }
    }
  } else if (result.deleted) {
    file = createStubDivarFile(token, url.trim(), typeHint || "landlord");
    markDivarDeleted(file);
    showToast(
      "آگهی در دیوار پیدا نشد — با تگ «حذف‌شده از دیوار» ذخیره شد.",
      "warning"
    );
  } else {
    file = createStubDivarFile(token, url.trim(), typeHint || "landlord");
    showToast(
      "دریافت خودکار کامل نشد. لینک ذخیره شد؛ مشخصات را دستی تکمیل کنید.",
      "warning"
    );
  }

  const newFiles = [...state.files, file];
  const success = await commitFiles(newFiles, `Import Divar ad ${token}`);
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
