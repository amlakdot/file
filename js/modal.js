/* =========================================================
   MODAL
========================================================= */

import { state } from "./state.js";
import { $ } from "./helpers.js";

// این توابع از form بعداً ست می‌شوند تا وابستگی دایره‌ای نداشته باشیم
let _loadFileIntoForm = null;
let _updateFormVisibility = null;

export function setFormHandlers({ loadFileIntoForm, updateFormVisibility }) {
  _loadFileIntoForm = loadFileIntoForm;
  _updateFormVisibility = updateFormVisibility;
}

export function openFileModal() {
  const modal = $("fileModal");
  if (!modal) return;

  modal.classList.remove("hidden");

  if (state.editingFileId) {
    $("modalEyebrow").textContent = "ویرایش فایل";
    $("modalTitle").textContent = "ویرایش";
    if (_loadFileIntoForm) _loadFileIntoForm(state.editingFileId);
  } else {
    $("modalEyebrow").textContent = "فایل جدید";
    $("modalTitle").textContent = "ثبت فایل";
    $("fileForm")?.reset();
    if ($("followUpDays")) $("followUpDays").value = 10;

    const saleRadio = document.querySelector(
      'input[name="fileType"][value="sale"]'
    );
    if (saleRadio) saleRadio.checked = true;

    if (_updateFormVisibility) _updateFormVisibility();
  }
}

export function closeFileModal() {
  $("fileModal")?.classList.add("hidden");
  state.editingFileId = null;
}

export function setupModalClose() {
  $("closeModalButton")?.addEventListener("click", closeFileModal);
  $("cancelFormButton")?.addEventListener("click", closeFileModal);

  $("fileModal")?.addEventListener("click", (e) => {
    if (
      e.target === $("fileModal") ||
      e.target.classList.contains("modal-backdrop")
    ) {
      closeFileModal();
    }
  });
}
