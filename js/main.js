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
  loadFileIntoForm,
  resetFormFields
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
      setLoginError(err.message || "ورود ناموفق بود.");
    }
  });
}

function setupTopBar() {
  $("newFileButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.editingFileId = null;
    openFileModal();
  });

  // رفع باگ خروج
  const logoutBtn = $("logoutButton");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        logout();
      } catch (err) {
        console.error("logout error:", err);
        state.token = null;
        state.files = [];
        $("loginScreen")?.classList.remove("hidden");
        $("appScreen")?.classList.add("hidden");
      }
    });
  }

  $("followUpButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    state.currentFilter = "followup";
    applyFilters();
  });

  $("emptyNewFileButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
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
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
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
  // اگر روی دکمه یا کنترل داخل کارت کلیک شد، ادیت باز نشود
  if (e.target.closest("button, a, input, select, textarea, label")) {
    return;
  }

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
  setFormHandlers({
    loadFileIntoForm,
    updateFormVisibility,
    resetFormFields
  });

  setupLoginForm();
  setupTopBar();
  setupSearch();
  setupFilters();
  setupFileForm();
  setupModalClose();

  document.addEventListener("change", (e) => {
    const id = e.target?.id;
    if (
      id === "occupancy" ||
      id === "familyStatus" ||
      id === "propertyType" ||
      id === "keyHolder"
    ) {
      updateFormVisibility();
    }
  });
});
