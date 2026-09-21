/* =========================================================
   MAIN - Entry Point
========================================================= */

import { state } from "./state.js";
import { $, setLoginError, parseMoney, setupMoneyInputs, showToast, copyToClipboard } from "./helpers.js";
import { loginWithToken, logout, manualSync, tryRestoreSession } from "./auth.js";
import { setupCalculator } from "./calculator.js";
import { publishPublicFiles } from "./github.js";
import {
  openFileModal,
  openDetailModal,
  closeDetailModal,
  setupModalClose,
  setFormHandlers,
  detailCopyPhone,
  detailCopyAddress,
  detailWhatsApp,
  detailShareCopy
} from "./modal.js";
import {
  setupFileForm,
  updateFormVisibility,
  loadFileIntoForm,
  resetFormFields,
  softDeleteFile,
  restoreFile,
  purgeFile
} from "./form.js";
import { applyFilters, renderHome } from "./render.js";
import {
  importFromDivarUrl,
  buildDivarUrl,
  extractDivarToken
} from "./divar.js";

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

function openDivarImportModal() {
  const modal = $("divarImportModal");
  if (!modal) return;
  if ($("divarUrlInput")) $("divarUrlInput").value = "";
  if ($("divarImportError")) {
    $("divarImportError").textContent = "";
    $("divarImportError").classList.add("hidden");
  }
  const confirmBtn = $("confirmDivarImportButton");
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "دریافت و ذخیره";
  }
  const auto = document.querySelector('input[name="divarTypeHint"][value="auto"]');
  if (auto) auto.checked = true;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  $("divarUrlInput")?.focus();
}

function closeDivarImportModal() {
  $("divarImportModal")?.classList.add("hidden");
  if ($("fileModal")?.classList.contains("hidden") && $("detailModal")?.classList.contains("hidden")) {
    document.body.style.overflow = "";
  }
}

function setupDivarImport() {
  $("importDivarButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    openDivarImportModal();
  });

  $("closeDivarImportButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDivarImportModal();
  });
  $("cancelDivarImportButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDivarImportModal();
  });

  $("divarImportModal")?.querySelector(".modal-backdrop")?.addEventListener("click", () => {
    closeDivarImportModal();
  });

  $("confirmDivarImportButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    let url = ($("divarUrlInput")?.value || "").trim();
    const errEl = $("divarImportError");
    const btn = $("confirmDivarImportButton");

    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }

    if (!url) {
      if (errEl) {
        errEl.textContent = "لطفاً لینک آگهی دیوار را وارد کنید.";
        errEl.classList.remove("hidden");
      }
      return;
    }

    // لینک موبایل (?ref=android و …) را به فرم تمیز تبدیل کن
    const token = extractDivarToken(url);
    if (!token) {
      if (errEl) {
        errEl.textContent = "لینک دیوار معتبر نیست.";
        errEl.classList.remove("hidden");
      }
      return;
    }
    url = buildDivarUrl(token);
    if ($("divarUrlInput")) $("divarUrlInput").value = url;

    const hint =
      document.querySelector('input[name="divarTypeHint"]:checked')?.value ||
      "auto";
    const typeHint = hint === "auto" ? null : hint;

    if (btn) {
      btn.disabled = true;
      btn.textContent = "در حال دریافت...";
    }

    let hadError = false;
    try {
      const file = await importFromDivarUrl(url, typeHint);
      closeDivarImportModal();
      showToast("آگهی از دیوار ذخیره شد. نام و تلفن را تکمیل کنید.", "success");
      renderHome();
      // باز کردن جزئیات فایل جدید
      if (file?.id) openDetailModal(file.id);
    } catch (err) {
      hadError = true;
      if (errEl) {
        errEl.textContent = err.message || "خطا در دریافت آگهی.";
        errEl.classList.remove("hidden");
      }
      showToast(err.message || "خطا در دریافت آگهی.", "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = hadError ? "تلاش مجدد" : "دریافت و ذخیره";
      }
    }
  });
}

function openMoreMenu() {
  const sheet = $("moreMenuSheet");
  if (!sheet) return;
  sheet.classList.remove("hidden");
  sheet.setAttribute("aria-hidden", "false");
}

function closeMoreMenu() {
  const sheet = $("moreMenuSheet");
  if (!sheet) return;
  sheet.classList.add("hidden");
  sheet.setAttribute("aria-hidden", "true");
}

function openNewFile() {
  state.editingFileId = null;
  openFileModal();
}

function goFollowUp() {
  state.currentFilter = "followup";
  applyFilters();
}

function updateActiveFiltersBadge() {
  let n = 0;
  if ((state.region || "").trim()) n += 1;
  if (state.priceMin != null && state.priceMin !== "") n += 1;
  if (state.priceMax != null && state.priceMax !== "") n += 1;
  if (state.sortBy && state.sortBy !== "updatedAt") n += 1;
  if (state.sortDir && state.sortDir !== "desc") n += 1;
  const badge = $("activeFiltersCount");
  if (badge) {
    badge.textContent = String(n);
    badge.classList.toggle("hidden", n === 0);
  }
  const btn = $("toggleFiltersButton");
  if (btn) btn.classList.toggle("has-active", n > 0);
}

function setupTopBar() {
  // فایل جدید فقط از FAB و empty state
  $("fabNewFile")?.addEventListener("click", (e) => {
    e.preventDefault();
    openNewFile();
  });

  $("publishPublicButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    closeMoreMenu();
    await publishPublicFiles();
  });

  $("logoutButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMoreMenu();
    try {
      logout();
    } catch (err) {
      console.error(err);
      state.token = null;
      $("loginScreen")?.classList.remove("hidden");
      $("appScreen")?.classList.add("hidden");
    }
  });

  $("followUpButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    goFollowUp();
  });

  $("emptyNewFileButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    openNewFile();
  });

  $("manualSyncButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget;
    btn?.classList.add("spinning");
    try {
      await manualSync();
    } finally {
      setTimeout(() => btn?.classList.remove("spinning"), 600);
    }
  });

  $("moreMenuButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    openMoreMenu();
  });
  $("moreMenuBackdrop")?.addEventListener("click", () => closeMoreMenu());
}

function setupSearchAndFilters() {
  $("searchInput")?.addEventListener("input", (e) => {
    state.search = e.target?.value || "";
    renderHome();
  });

  $("regionFilter")?.addEventListener("input", (e) => {
    state.region = e.target?.value || "";
    updateActiveFiltersBadge();
    renderHome();
  });

  $("priceMinFilter")?.addEventListener("input", (e) => {
    const v = parseMoney(e.target?.value);
    state.priceMin = v || null;
    updateActiveFiltersBadge();
    renderHome();
  });

  $("priceMaxFilter")?.addEventListener("input", (e) => {
    const v = parseMoney(e.target?.value);
    state.priceMax = v || null;
    updateActiveFiltersBadge();
    renderHome();
  });

  $("sortBySelect")?.addEventListener("change", (e) => {
    state.sortBy = e.target?.value || "updatedAt";
    updateActiveFiltersBadge();
    renderHome();
  });

  $("sortDirSelect")?.addEventListener("change", (e) => {
    state.sortDir = e.target?.value || "desc";
    updateActiveFiltersBadge();
    renderHome();
  });

  document.querySelectorAll(".filter-button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const filter = btn.getAttribute("data-filter");
      if (filter) {
        state.currentFilter = filter;
        applyFilters();
      }
    });
  });

  $("toggleFiltersButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    const panel = $("advancedFiltersPanel");
    const btn = $("toggleFiltersButton");
    if (!panel) return;
    panel.classList.toggle("collapsed");
    const isCollapsed = panel.classList.contains("collapsed");
    btn?.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    btn?.classList.toggle("open", !isCollapsed);
  });

  updateActiveFiltersBadge();
}

function setupDetailActions() {
  $("detailEditButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    const id = state.viewingFileId;
    if (!id) return;
    closeDetailModal(true);
    state.editingFileId = id;
    openFileModal();
  });

  $("detailArchiveButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const id = state.viewingFileId;
    if (!id) return;
    const ok = await softDeleteFile(id);
    if (ok) closeDetailModal();
  });

  $("detailRestoreButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const id = state.viewingFileId;
    if (!id) return;
    const ok = await restoreFile(id);
    if (ok) closeDetailModal();
  });

  $("detailPurgeButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const id = state.viewingFileId;
    if (!id) return;
    const ok = await purgeFile(id);
    if (ok) closeDetailModal();
  });

  $("detailCopyPhoneButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    detailCopyPhone();
  });
  $("detailCopyAddressButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    detailCopyAddress();
  });
  $("detailWhatsAppButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    detailWhatsApp();
  });
  $("detailShareCopyButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    detailShareCopy();
  });

  $("detailDivarLinkButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    const file = state.files.find((f) => f.id === state.viewingFileId);
    if (!file) return;
    const url = file.divarUrl || buildDivarUrl(file.divarToken);
    if (!url) {
      showToast("لینک دیوار موجود نیست.", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

// کپی شماره با لمس روی شماره کارت
document.addEventListener("click", async (e) => {
  const phoneBtn = e.target?.closest(".card-phone-copy");
  if (phoneBtn) {
    e.preventDefault();
    e.stopPropagation();
    const phone = phoneBtn.getAttribute("data-phone") || phoneBtn.textContent || "";
    if (!phone || phone === "—") {
      showToast("شماره‌ای ثبت نشده.", "error");
      return;
    }
    const ok = await copyToClipboard(phone.trim());
    showToast(ok ? "شماره کپی شد." : "کپی نشد.", ok ? "success" : "error");
    return;
  }

  // کارت → جزئیات کامل (نه مستقیم ادیت)
  if (e.target.closest("button, a, input, select, textarea, label")) return;
  const card = e.target?.closest(".file-card");
  if (!card) return;
  const fileId = card.getAttribute("data-file-id");
  if (!fileId) return;
  openDetailModal(fileId);
});

document.addEventListener("DOMContentLoaded", async () => {
  setFormHandlers({
    loadFileIntoForm,
    updateFormVisibility,
    resetFormFields
  });

  setupLoginForm();
  setupTopBar();
  setupSearchAndFilters();
  setupFileForm();
  setupModalClose();
  setupDetailActions();
  setupDivarImport();
  setupCalculator();
  setupMoneyInputs(document);

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

  // ورود خودکار اگر نشست معتبر (تا ۷ روز) ذخیره شده باشد
  try {
    await tryRestoreSession();
  } catch (err) {
    console.warn("auto login skipped:", err);
  }
});
