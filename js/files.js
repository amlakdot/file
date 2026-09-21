/* =========================================================
   FILE HELPERS + FOLLOW-UP + TRASH
========================================================= */

import { state } from "./state.js";
import { $ } from "./helpers.js";

export const TRASH_DAYS = 30;

export function getFileData(file) {
  if (!file || typeof file !== "object") return {};
  if (file.data && typeof file.data === "object") return file.data;
  return file;
}

export function getFileName(file) {
  const data = getFileData(file);
  return (
    data.name ||
    data.propertyName ||
    data.buyerName ||
    data.tenantName ||
    data.divarTitle ||
    "بدون نام"
  );
}

export function getFilePhone(file) {
  const data = getFileData(file);
  return (
    data.phone ||
    data.propertyPhone ||
    data.buyerPhone ||
    data.tenantPhone ||
    ""
  );
}

export function getFileLocation(file) {
  const data = getFileData(file);
  return (
    data.location ||
    data.propertyLocation ||
    data.buyerLocation ||
    data.tenantLocation ||
    ""
  );
}

export function normalizePhoneKey(phone) {
  if (!phone) return "";
  let s = String(phone)
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[^\d]/g, "");
  if (s.startsWith("0098")) s = s.slice(4);
  if (s.startsWith("98") && s.length > 10) s = s.slice(2);
  if (s.startsWith("0")) s = s.slice(1);
  return s;
}

export function isDeleted(file) {
  return !!(file && file.deletedAt);
}

export function isInTrash(file) {
  if (!isDeleted(file)) return false;
  const t = new Date(file.deletedAt).getTime();
  if (!Number.isFinite(t)) return true;
  const age = Date.now() - t;
  return age <= TRASH_DAYS * 24 * 60 * 60 * 1000;
}

export function isTrashExpired(file) {
  if (!isDeleted(file)) return false;
  return !isInTrash(file);
}

export function getActiveFiles() {
  return state.files.filter((f) => f && !isDeleted(f));
}

export function getTrashFiles() {
  return state.files.filter((f) => f && isInTrash(f));
}

export function getFilePrice(file) {
  const data = getFileData(file);
  const type = file.type || "sale";
  if (type === "sale") return Number(data.salePrice) || 0;
  if (type === "buyer") return Number(data.capital) || 0;
  if (type === "landlord") {
    return Number(data.suggestedDeposit) || Number(data.suggestedRent) || 0;
  }
  if (type === "tenant") {
    return Number(data.tenantDeposit) || Number(data.tenantRent) || 0;
  }
  return 0;
}

export function isFollowUp(file) {
  if (!file || isDeleted(file)) return false;
  if (file.status === "archived" || file.status === "done") return false;
  // اگر تاریخ پیگیری در آینده است، دیگر «نیاز به پیگیری» محسوب نشود
  if (file.followUpDate) {
    const timestamp = new Date(file.followUpDate).getTime();
    if (Number.isFinite(timestamp) && timestamp > Date.now()) {
      return false;
    }
    if (Number.isFinite(timestamp) && timestamp <= Date.now()) {
      return true;
    }
  }
  return file.status === "followup";
}

export function updateFollowUpStatuses() {
  let changed = false;

  for (const file of state.files) {
    if (!file || isDeleted(file)) continue;
    if (file.status === "archived" || file.status === "done") continue;
    if (!file.followUpDate) continue;

    const deadline = new Date(file.followUpDate).getTime();
    if (
      Number.isFinite(deadline) &&
      deadline <= Date.now() &&
      file.status !== "followup"
    ) {
      file.status = "followup";
      file.updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  updateFollowUpCount();
  return changed;
}

export function updateFollowUpCount() {
  const count = getActiveFiles().filter((f) => isFollowUp(f)).length;
  const text = count.toLocaleString("fa-IR");
  const el = $("followUpCount");
  if (el) el.textContent = text;
  const elMobile = $("followUpCountMobile");
  if (elMobile) {
    elMobile.textContent = text;
    elMobile.classList.toggle("hidden", count === 0);
  }
}

export function findDuplicatePhone(phone, excludeId = null) {
  const key = normalizePhoneKey(phone);
  if (!key || key.length < 10) return null;
  return (
    state.files.find((f) => {
      if (!f || isDeleted(f)) return false;
      if (excludeId && f.id === excludeId) return false;
      return normalizePhoneKey(getFilePhone(f)) === key;
    }) || null
  );
}

export function findDuplicatePlaque(plaque, excludeId = null) {
  const p = String(plaque || "").trim().toLowerCase();
  if (!p) return null;
  return (
    state.files.find((f) => {
      if (!f || isDeleted(f)) return false;
      if (excludeId && f.id === excludeId) return false;
      const data = getFileData(f);
      return String(data.plaque || "").trim().toLowerCase() === p;
    }) || null
  );
}

/** حذف دائمی فایل‌های سطل زباله قدیمی‌تر از ۳۰ روز */
export function purgeExpiredTrash() {
  const before = state.files.length;
  state.files = state.files.filter((f) => !isTrashExpired(f));
  return state.files.length !== before;
}

/** تگ‌های فایل (مثلاً نیاز به بررسی از آگهی دیوار) */
export function getFileTags(file) {
  if (!file) return [];
  if (Array.isArray(file.tags)) return file.tags;
  const data = getFileData(file);
  return Array.isArray(data.tags) ? data.tags : [];
}

export function hasTag(file, tag) {
  return getFileTags(file).includes(tag);
}
