/* =========================================================
   داده عمومی — بدون مشخصات شخصی
========================================================= */

/**
 * حذف شماره‌های تلفن از متن (حتی داخل توضیحات)
 * الگوها: 09xx، +98، 0098، خط ثابت ۰۲۱-...
 */
export function redactPhonesFromText(text) {
  if (!text) return "";
  let s = String(text);

  // نرمال‌سازی ارقام فارسی/عربی به انگلیسی برای تشخیص
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  s = s.replace(/[۰-۹٠-٩]/g, (ch) => {
    const i = persian.indexOf(ch);
    if (i >= 0) return String(i);
    const j = arabic.indexOf(ch);
    return j >= 0 ? String(j) : ch;
  });

  // موبایل ایران: 09xxxxxxxxx با جداکننده اختیاری
  s = s.replace(
    /(?:\+98|0098|098|0)?[\s\-_.]*9\d{2}[\s\-_.]*\d{3}[\s\-_.]*\d{4}/g,
    "[شماره حذف‌شده]"
  );

  // خط ثابت رایج: 0xx-xxxxxxx یا 0xxxxxxxxxx
  s = s.replace(
    /0\d{2,3}[\s\-_.]*\d{3,4}[\s\-_.]*\d{3,4}/g,
    "[شماره حذف‌شده]"
  );

  // اعداد بلند شبیه تلفن (۱۰–۱۱ رقم پشت‌سرهم)
  s = s.replace(/\b\d{10,12}\b/g, "[شماره حذف‌شده]");

  return s.trim();
}

function cleanDataObject(data) {
  if (!data || typeof data !== "object") return {};
  const out = { ...data };

  // فیلدهای شخصی
  delete out.name;
  delete out.phone;
  delete out.ownerName;
  delete out.ownerPhone;
  delete out.contactName;
  delete out.contactPhone;
  delete out.secondPhone;
  delete out.mobile;
  delete out.tel;

  if (out.notes) out.notes = redactPhonesFromText(out.notes);
  if (out.description) out.description = redactPhonesFromText(out.description);

  return out;
}

/**
 * ساخت عنوان عمومی متمرکز روی ملک (نه شخص)
 */
export function buildPublicTitle(file, data) {
  const bits = [];
  if (data.propertyType) bits.push(data.propertyType);
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
  if (!file || file.deletedAt) return null;

  const status = file.status || "active";
  if (status === "deleted" || status === "trash") return null;

  const rawData = file.data && typeof file.data === "object" ? file.data : {};
  const data = cleanDataObject(rawData);

  return {
    id: file.id,
    type: file.type || "sale",
    status: "active",
    title: buildPublicTitle(file, data),
    data,
    source: file.source === "divar" ? "divar" : "manual",
    updatedAt: file.updatedAt || file.createdAt || null
    // عمداً: name, phone, divarToken, tags شخصی و... نیست
  };
}

/**
 * ساخت دیتابیس عمومی از لیست فایل‌های کامل
 */
export function buildPublicDatabase(files) {
  const list = Array.isArray(files) ? files : [];
  const publicFiles = list
    .map((f) => toPublicFile(f))
    .filter(Boolean);

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    files: publicFiles
  };
}
