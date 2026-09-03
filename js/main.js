/* =========================================================
   MAIN - Entry Point
========================================================= */

import { state } from "./state.js";
import { $, setLoginError } from "./helpers.js";
import { loginWithToken, logout } from "./auth.js";
import {
  openFileModal,
  setupModalClose,
  setFormHandlers
} from "./modal.js";
import {
  setupFileForm,
  updateFormVisibility,
  loadFileIntoForm
} from "./form.js";
import { applyFilters, renderHome } from "./render.js";

function setupLoginForm() {
  const form = $("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setLoginError("");

    const token = $("githubToken")?.value || "";
    if (!token.trim()) {
      setLoginError("لطفاً GitHub Token را وارد کنید.");
      return;
    }

    try {
      await loginWithToken(token);
    } catch (err) {
      setLoginError(err.message);
    }
  });
}

function setupTopBar() {
  $("newFileButton")?.addEventListener("click", () => {
    state.editingFileId = null;
    openFileModal();
  });

  $("logoutButton")?.addEventListener("click", logout);

  $("followUpButton")?.addEventListener("click", () => {
    state.currentFilter = "followup";
    applyFilters();
  });

  $("emptyNewFileButton")?.addEventListener("click", () => {
    state.editingFileId = null;
    openFileModal();
  });
}

function setupSearch() {
  $("searchInput")?.addEventListener("input", (e) => {
    state.search = e.target?.value || "";
    renderHome();
  });
}

function setupFilters() {
  document.querySelectorAll(".filter-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = btn.getAttribute("data-filter");
      if (filter) {
        state.currentFilter = filter;
        applyFilters();
      }
    });
  });
}

// کلیک روی کارت → ویرایش
document.addEventListener("click", (e) => {
  const card = e.target?.closest(".file-card");
  if (!card) return;
  const fileId = card.getAttribute("data-file-id");
  if (!fileId) return;
  state.editingFileId = fileId;
  openFileModal();
});

// =============================================
// INIT
// =============================================

document.addEventListener("DOMContentLoaded", () => {
  // اتصال handlerهای فرم به مودال (جلوگیری از وابستگی دایره‌ای)
  setFormHandlers({
    loadFileIntoForm,
    updateFormVisibility
  });

  setupLoginForm();
  setupTopBar();
  setupSearch();
  setupFilters();
  setupFileForm();
  setupModalClose();

  document.addEventListener("change", (e) => {
    if (e.target?.id === "occupancy" || e.target?.id === "familyStatus") {
      updateFormVisibility();
    }
  });
});
