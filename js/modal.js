/* =========================================================
   MODAL
========================================================= */

import { state } from "./state.js";
import { $ } from "./helpers.js";

// این توابع از form بعداً ست می‌شوند تا وابستگی دایره‌ای نداشته باشیم
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

  // شیر برای فایل جدید و ویرایش در دسترس است
  if (shareBtn) {
    shareBtn.classList.remove("hidden");
    shareBtn.disabled = false;
  }
}

export function openFileModal() {
  const modal = $("fileModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  if (state.editingFileId) {
    if ($("modalEyebrow")) $("modalEyebrow").textContent = "ویرایش فایل";
    if ($("modalTitle")) $("modalTitle").textContent = "ویرایش";
    setEditActionButtons(true);
    if (_loadFileIntoForm) _loadFileIntoForm(state.editingFileId);
  } else {
    if ($("modalEyebrow")) $("modalEyebrow").textContent = "فایل جدید";
    if ($("modalTitle")) $("modalTitle").textContent = "ثبت فایل";
    setEditActionButtons(false);

    if (_resetFormFields) {
      _resetFormFields();
    } else {
      $("fileForm")?.reset();
      if ($("followUpDays")) $("followUpDays").value = 10;
      if ($("fileStatus")) $("fileStatus").value = "active";
      const saleRadio = document.querySelector(
        'input[name="fileType"][value="sale"]'
      );
      if (saleRadio) saleRadio.checked = true;
    }

    if (_updateFormVisibility) _updateFormVisibility();
  }
}

export function closeFileModal() {
  $("fileModal")?.classList.add("hidden");
  state.editingFileId = null;
  document.body.style.overflow = "";
  setEditActionButtons(false);
}

export function setupModalClose() {
  $("closeModalButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeFileModal();
  });

  $("cancelFormButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
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

  // ESC برای بستن
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = $("fileModal");
      if (modal && !modal.classList.contains("hidden")) {
        closeFileModal();
      }
    }
  });
}
