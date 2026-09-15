/* =========================================================
   داده عمومی — بدون مشخصات شخصی
   ساختار فایل‌ها: فیلدها در ریشه آبجکت (نه فقط file.data)
========================================================= */

/** فیلدهای شخصی / سیستمی که نباید عمومی شوند */
const STRIP_KEYS = new Set([
  "name",
  "phone",
  "ownerName",
  "ownerPhone",
  "contactName",
  "contactPhone",
  "secondPhone",
  "mobile",
  "tel",
  "keyHolderName",
  "keyHolderPhone",
  "buyerName",
  "buyerPhone",
  "tenantName",
  "tenantPhone",
  "propertyPhone",
  "propertyName",
  "divarToken",
  "divarUrl",
  "divarTitle",
  "encryptedPhone",
  "phoneIv",
  "followUpDate",
  "deletedAt",
  "createdAt",
  "id",
  "type",
  "status",
  "source",
  "tags",
  "data"
]);

/**
 * حذف شماره‌های تلفن از متن (حتی داخل توضیحات)
 */
export function redactPhonesFromText(text) {
  if (!text) return "";
  let s = String(text);

  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  s = s.replace(/[۰-۹٠-٩]/g, (ch) => {
    const i = persian.indexOf(ch);
    if (i >= 0) return String(i);
    const j = arabic.indexOf(ch);
    return j >= 0 ? String(j) : ch;
  });

  s = s.replace(
    /(?:\+98|0098|098|0)?[\s\-_.]*9\d{2}[\s\-_.]*\d{3}[\s\-_.]*\d{4}/g,
    "[شماره حذف‌شده]"
  );

  s = s.replace(
    /0\d{2,3}[\s\-_.]*\d{3,4}[\s\-_.]*\d{3,4}/g,
    "[شماره حذف‌شده]"
  );

  s = s.replace(/\b\d{10,12}\b/g, "[شماره حذف‌شده]");

  return s.trim();
}

/**
 * استخراج داده ملک از ساختار واقعی فایل
 * (فیلدها اغلب روی خود file هستند، نه file.data)
 */
export function extractPropertyFields(file) {
  if (!file || typeof file !== "object") return {};

  const nested =
    file.data && typeof file.data === "object" && !Array.isArray(file.data)
      ? file.data
      : {};

  // اول ریشه، بعد nested — nested اولویت دارد اگر پر باشد
  const merged = { ...file, ...nested };
  const out = {};

  for (const [key, value] of Object.entries(merged)) {
    if (STRIP_KEYS.has(key)) continue;
    if (key === "updatedAt" || key === "createdAt" || key === "followUpDate") continue;
    if (value === null || value === undefined || value === "") continue;
    // رمزنگاری‌شده
    if (typeof value === "string" && value.startsWith("enc:")) continue;
    out[key] = value;
  }

  // متن‌ها را از شماره پاک کن
  for (const textKey of [
    "notes",
    "description",
    "buyerNotes",
    "tenantNotes"
  ]) {
    if (out[textKey]) out[textKey] = redactPhonesFromText(out[textKey]);
  }

  // یکدست‌سازی نام فیلد سال
  if (out.year && !out.yearBuilt) out.yearBuilt = out.year;

  return out;
}

const PROPERTY_TYPE_FA = {
  apartment: "آپارتمان",
  villa: "ویلا / خانه",
  office: "دفتر",
  shop: "مغازه",
  land: "زمین",
  garden: "باغ",
  other: "سایر"
};

/**
 * ساخت عنوان عمومی متمرکز روی ملک (نه شخص)
 */
export function buildPublicTitle(file, data) {
  const bits = [];
  if (data.propertyType) {
    bits.push(PROPERTY_TYPE_FA[data.propertyType] || data.propertyType);
  }
  if (data.area) bits.push(`${data.area} متر`);
  if (data.rooms) bits.push(`${data.rooms} خواب`);
  const loc = data.location || data.region || data.address || "";
  if (loc) bits.push(String(loc).split(/[،,]/)[0].trim());
  if (bits.length) return bits.join(" · ");

  const type = file.type || "";
  if (type === "sale") return "ملک فروشی";
  if (type === "landlord") return "ملک اجاره‌ای";
  if (type === "buyer") return "تقاضای خرید";
  if (type === "tenant") return "تقاضای اجاره";
  return "فایل املاک";
}

/**
 * تبدیل یک فایل داخلی به نسخه عمومی امن
 */
export function toPublicFile(file) {
  if (!file || typeof file !== "object") return null;
  if (file.deletedAt) return null;

  const status = file.status || "active";
  if (status === "deleted" || status === "trash") return null;

  const data = extractPropertyFields(file);

  return {
    id: file.id,
    type: file.type || "sale",
    status: "active",
    title: buildPublicTitle(file, data),
    data,
    source: file.source === "divar" ? "divar" : "panel",
    updatedAt: file.updatedAt || file.createdAt || null
  };
}

/**
 * ساخت دیتابیس عمومی از لیست فایل‌های کامل
 */
export function buildPublicDatabase(files) {
  const list = Array.isArray(files) ? files : [];
  const publicFiles = list.map((f) => toPublicFile(f)).filter(Boolean);

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    files: publicFiles
  };
}
