/* =========================================================
   MODAL (form + detail)
========================================================= */

import { state } from "./state.js";
import { $ } from "./helpers.js";
import {
  getFileData,
  getFileName,
  getFilePhone,
  getFileLocation,
  isInTrash
} from "./files.js";
import { renderFileDetailHtml } from "./render.js";
import {
  TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  getStatusLabel
} from "./labels.js";
import { formatMoney, copyToClipboard, openWhatsApp, showToast } from "./helpers.js";

let _loadFileIntoForm = null;
let _updateFormVisibility = null;
let _resetFormFields = null;

export function setFormHandlers({
  loadFileIntoForm,
  updateFormVisibility,
  resetFormFields
}) {
  _loadFileIntoForm = loadFileIntoForm;
  _updateFormVisibility = updateFormVisibility;
  _resetFormFields = resetFormFields;
}

function setEditActionButtons(isEditing) {
  const deleteBtn = $("deleteFileButton");
  const shareBtn = $("shareFileButton");
  if (deleteBtn) {
    deleteBtn.classList.toggle("hidden", !isEditing);
    deleteBtn.disabled = !isEditing;
  }
  if (shareBtn) {
    shareBtn.classList.remove("hidden");
    shareBtn.disabled = false;
  }
}

export function markFormDirty() {
  state.formDirty = true;
}

export function clearFormDirty() {
  state.formDirty = false;
}

export function confirmDiscardIfDirty() {
  if (!state.formDirty) return true;
  return window.confirm(
    "تغییرات ذخیره‌نشده دارید. از بستن فرم مطمئن هستید؟"
  );
}

export function openFileModal(opts = {}) {
  const modal = $("fileModal");
  if (!modal) return;

  closeDetailModal(true);
  closeDetailMoreSheet();

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  clearFormDirty();

  if (state.editingFileId) {
    if ($("modalEyebrow")) $("modalEyebrow").textContent = "ویرایش فایل";
    if ($("modalTitle")) $("modalTitle").textContent = "ویرایش";
    setEditActionButtons(true);
    if (_loadFileIntoForm) _loadFileIntoForm(state.editingFileId);
  } else {
    if ($("modalEyebrow")) $("modalEyebrow").textContent = "فایل جدید";
    if ($("modalTitle")) $("modalTitle").textContent = "ثبت فایل";
    setEditActionButtons(false);
    if (_resetFormFields) _resetFormFields();
    else {
      $("fileForm")?.reset();
      if ($("followUpDays")) $("followUpDays").value = 10;
      if ($("fileStatus")) $("fileStatus").value = "active";
    }
    if (_updateFormVisibility) _updateFormVisibility();
  }

  // dirty tracking
  const form = $("fileForm");
  if (form && form.dataset.dirtyBound !== "1") {
    form.dataset.dirtyBound = "1";
    form.addEventListener("input", markFormDirty);
    form.addEventListener("change", markFormDirty);
  }

  // ثبت سریع: فوکوس روی نام برای فایل جدید
  if (!state.editingFileId && !opts.skipAutoFocus) {
    requestAnimationFrame(() => {
      const nameInput = $("name");
      if (nameInput) {
        nameInput.focus();
        nameInput.select?.();
      }
    });
  }
}

export function openDetailMoreSheet() {
  const sheet = $("detailMoreSheet");
  if (!sheet) return;
  sheet.classList.remove("hidden");
  sheet.setAttribute("aria-hidden", "false");
  $("detailMoreButton")?.setAttribute("aria-expanded", "true");
}

export function closeDetailMoreSheet() {
  const sheet = $("detailMoreSheet");
  if (!sheet) return;
  sheet.classList.add("hidden");
  sheet.setAttribute("aria-hidden", "true");
  $("detailMoreButton")?.setAttribute("aria-expanded", "false");
}

export function closeFileModal(force = false) {
  if (!force && !confirmDiscardIfDirty()) return false;
  $("fileModal")?.classList.add("hidden");
  state.editingFileId = null;
  clearFormDirty();
  document.body.style.overflow = "";
  setEditActionButtons(false);
  $("formIncompleteBanner")?.remove();
  document.querySelectorAll(".field-incomplete").forEach((el) => {
    el.classList.remove("field-incomplete");
  });
  return true;
}

export function openDetailModal(fileId) {
  const file = state.files.find((f) => f.id === fileId);
  if (!file) {
    showToast("فایل پیدا نشد.", "error");
    return;
  }

  state.viewingFileId = fileId;
  closeDetailMoreSheet();
  const modal = $("detailModal");
  if (!modal) return;

  const body = $("detailBody");
  if (body) body.innerHTML = renderFileDetailHtml(file);

  if ($("detailTitle")) $("detailTitle").textContent = getFileName(file);

  const inTrash = isInTrash(file);
  $("detailMatchButton")?.classList.toggle("hidden", inTrash);
  $("detailEditButton")?.classList.toggle("hidden", inTrash);
  $("detailArchiveButton")?.classList.toggle("hidden", inTrash);
  $("detailRestoreButton")?.classList.toggle("hidden", !inTrash);
  $("detailPurgeButton")?.classList.toggle("hidden", !inTrash);
  $("detailWhatsAppButton")?.classList.toggle("hidden", inTrash);

  const phone = getFilePhone(file);
  const callBtn = $("detailCallButton");
  if (callBtn) {
    const canCall = !!(phone && !inTrash);
    callBtn.classList.toggle("hidden", !canCall);
    if (canCall) {
      const digits = String(phone).replace(/[^\d+]/g, "");
      callBtn.setAttribute("href", digits ? `tel:${digits}` : "#");
    } else {
      callBtn.setAttribute("href", "#");
    }
  }

  const divarBtn = $("detailDivarLinkButton");
  if (divarBtn) {
    const hasDivar = !!(file.divarUrl || file.divarToken);
    divarBtn.classList.toggle("hidden", !hasDivar || inTrash);
  }

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

export function closeDetailModal(silent = false) {
  closeDetailMoreSheet();
  $("detailModal")?.classList.add("hidden");
  state.viewingFileId = null;

  // برگشت به پنل تطبیق (اگر از آنجا آمده باشیم)
  if (state.returnToMatch) {
    state.returnToMatch = false;
    const matchModal = $("matchModal");
    if (matchModal) {
      matchModal.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      return;
    }
  }

  if (
    !silent &&
    $("fileModal")?.classList.contains("hidden") &&
    $("matchModal")?.classList.contains("hidden")
  ) {
    document.body.style.overflow = "";
  }
}

export function getSharePayloadForFile(file) {
  const data = getFileData(file);
  const type = file.type || "sale";
  const lines = [
    "🏠 املاک DOT",
    `نوع: ${TYPE_LABELS[type] || type}`,
    `نام: ${getFileName(file)}`,
    `تلفن: ${getFilePhone(file) || "—"}`,
    `موقعیت: ${getFileLocation(file) || "—"}`
  ];
  if (data.propertyType)
    lines.push(
      `نوع ملک: ${PROPERTY_TYPE_LABELS[data.propertyType] || data.propertyType}`
    );
  if (data.area) lines.push(`متراژ: ${data.area} متر`);
  if (data.unitFloor) lines.push(`طبقه: ${data.unitFloor}`);
  if (data.salePrice) lines.push(`قیمت: ${formatMoney(data.salePrice)}`);
  if (data.capital) lines.push(`سرمایه: ${formatMoney(data.capital)}`);
  if (data.notes) lines.push(`توضیحات: ${data.notes}`);
  lines.push(`وضعیت: ${getStatusLabel(file.status || "active")}`);
  return lines.join("\n");
}

export async function detailCopyPhone() {
  const file = state.files.find((f) => f.id === state.viewingFileId);
  if (!file) return;
  const phone = getFilePhone(file);
  if (!phone) {
    showToast("شماره‌ای ثبت نشده.", "error");
    return;
  }
  const ok = await copyToClipboard(phone);
  showToast(ok ? "شماره کپی شد." : "کپی نشد.", ok ? "success" : "error");
}

export async function detailCopyAddress() {
  const file = state.files.find((f) => f.id === state.viewingFileId);
  if (!file) return;
  const loc = getFileLocation(file);
  if (!loc) {
    showToast("آدرسی ثبت نشده.", "error");
    return;
  }
  const ok = await copyToClipboard(loc);
  showToast(ok ? "آدرس کپی شد." : "کپی نشد.", ok ? "success" : "error");
}

export function detailWhatsApp() {
  const file = state.files.find((f) => f.id === state.viewingFileId);
  if (!file) return;
  openWhatsApp(getSharePayloadForFile(file));
}

export async function detailShareCopy() {
  const file = state.files.find((f) => f.id === state.viewingFileId);
  if (!file) return;
  const ok = await copyToClipboard(getSharePayloadForFile(file));
  showToast(ok ? "متن فایل کپی شد." : "کپی نشد.", ok ? "success" : "error");
}

export function setupModalClose() {
  $("closeModalButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeFileModal();
  });
  $("cancelFormButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeFileModal();
  });
  $("fileModal")?.addEventListener("click", (e) => {
    if (
      e.target === $("fileModal") ||
      e.target.classList.contains("modal-backdrop")
    ) {
      closeFileModal();
    }
  });

  $("closeDetailButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDetailMoreSheet();
    closeDetailModal();
  });
  $("detailModal")?.addEventListener("click", (e) => {
    if (
      e.target === $("detailModal") ||
      e.target.classList.contains("modal-backdrop")
    ) {
      closeDetailMoreSheet();
      closeDetailModal();
    }
  });

  $("detailMoreButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    const sheet = $("detailMoreSheet");
    if (sheet && sheet.classList.contains("hidden")) openDetailMoreSheet();
    else closeDetailMoreSheet();
  });
  $("detailMoreBackdrop")?.addEventListener("click", () => {
    closeDetailMoreSheet();
  });
  // بستن sheet بعد از انتخاب آیتم
  ["detailCopyPhoneButton", "detailCopyAddressButton", "detailShareCopyButton",
   "detailDivarLinkButton", "detailMatchButton", "detailArchiveButton",
   "detailRestoreButton", "detailPurgeButton"].forEach((id) => {
    $(id)?.addEventListener("click", () => {
      closeDetailMoreSheet();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("detailMoreSheet") && !$("detailMoreSheet").classList.contains("hidden")) {
      closeDetailMoreSheet();
      return;
    }
    if ($("fileModal") && !$("fileModal").classList.contains("hidden")) {
      closeFileModal();
      return;
    }
    if ($("detailModal") && !$("detailModal").classList.contains("hidden")) {
      closeDetailModal();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.formDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
