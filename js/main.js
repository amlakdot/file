/* =========================================================
   MAIN - Entry Point
========================================================= */

import { state } from "./state.js";
import {
  $,
  setLoginError,
  parseMoney,
  setupMoneyInputs,
  showToast,
  copyToClipboard,
  appLog,
  getAppLogs,
  clearAppLogs,
  formatLogsForCopy,
  escapeHtml
} from "./helpers.js";
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
import {
  getMatchRate,
  setMatchRate,
  getMatchTolerance,
  setMatchTolerance,
  getAllRentMatches,
  getAllRentDirectMatches,
  getAllSaleMatches,
  getMatchStats,
  renderMatchList,
  DEFAULT_RAHN_RATE
} from "./match.js";

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

  // دکمه پیست لینک از کلیپ‌بورد
  $("pasteDivarUrlButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const input = $("divarUrlInput");
    if (!input) return;
    try {
      let text = "";
      if (navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
      text = String(text || "").trim();
      if (!text) {
        showToast("کلیپ‌بورد خالی است یا دسترسی داده نشد.", "error");
        appLog("warn", "ui", "پیست لینک دیوار: کلیپ‌بورد خالی");
        return;
      }
      input.value = text;
      input.focus();
      showToast("لینک چسبانده شد.", "success");
      appLog("info", "ui", "لینک دیوار از کلیپ‌بورد پیست شد", { length: text.length });
    } catch (err) {
      showToast("دسترسی به کلیپ‌بورد ممکن نیست. لینک را دستی بچسبانید.", "error");
      appLog("error", "ui", "خطا در پیست لینک دیوار", { message: err?.message });
    }
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
    appLog("info", "divar", "شروع import از لینک", { url, typeHint });
    try {
      const file = await importFromDivarUrl(url, typeHint);
      closeDivarImportModal();
      showToast("آگهی از دیوار ذخیره شد. نام و تلفن را تکمیل کنید.", "success");
      appLog("info", "divar", "import موفق", { id: file?.id, token });
      renderHome();
      // باز کردن جزئیات فایل جدید
      if (file?.id) openDetailModal(file.id);
    } catch (err) {
      hadError = true;
      appLog("error", "divar", "import ناموفق", {
        message: err?.message,
        name: err?.name
      });
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

/* ---------- Logs panel ---------- */
let _logsFilterCat = "all";

function openLogsModal() {
  closeMoreMenu();
  const modal = $("logsModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderLogsList();
  appLog("debug", "ui", "باز شدن پنل لاگ");
}

function closeLogsModal() {
  $("logsModal")?.classList.add("hidden");
  if (
    $("fileModal")?.classList.contains("hidden") &&
    $("detailModal")?.classList.contains("hidden") &&
    $("divarImportModal")?.classList.contains("hidden") &&
    $("calculatorModal")?.classList.contains("hidden") &&
    $("matchModal")?.classList.contains("hidden")
  ) {
    document.body.style.overflow = "";
  }
}

function renderLogsList() {
  const listEl = $("logsList");
  const emptyEl = $("logsEmpty");
  if (!listEl) return;

  const entries = getAppLogs({ category: _logsFilterCat }).reverse();
  if (!entries.length) {
    listEl.innerHTML = "";
    emptyEl?.classList.remove("hidden");
    return;
  }
  emptyEl?.classList.add("hidden");

  listEl.innerHTML = entries
    .map((e) => {
      const time = new Date(e.ts).toLocaleString("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit"
      });
      const detail = e.detail
        ? `<div class="log-detail">${escapeHtml(e.detail)}</div>`
        : "";
      return `<div class="logs-entry level-${escapeHtml(e.level)}">
        <div class="log-meta">
          <span class="log-cat">${escapeHtml(e.category)}</span>
          <span>${escapeHtml(time)}</span>
          <span> · ${escapeHtml(e.level)}</span>
        </div>
        <div class="log-msg">${escapeHtml(e.message)}</div>
        ${detail}
      </div>`;
    })
    .join("");
}

/* ---------- Match panel ---------- */
let _matchTab = "rent";

function openMatchModal() {
  closeMoreMenu();
  const modal = $("matchModal");
  if (!modal) return;
  const rateEl = $("matchRateInput");
  const tolEl = $("matchToleranceInput");
  if (rateEl) rateEl.value = String(getMatchRate());
  if (tolEl) tolEl.value = String(Math.round(getMatchTolerance() * 100));
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  refreshMatchResults();
  appLog("info", "ui", "باز شدن پنل تطبیق");
}

function closeMatchModal() {
  state.returnToMatch = false;
  $("matchModal")?.classList.add("hidden");
  if (
    $("fileModal")?.classList.contains("hidden") &&
    $("detailModal")?.classList.contains("hidden") &&
    $("divarImportModal")?.classList.contains("hidden") &&
    $("calculatorModal")?.classList.contains("hidden") &&
    $("logsModal")?.classList.contains("hidden")
  ) {
    document.body.style.overflow = "";
  }
}

function refreshMatchResults() {
  const rate = setMatchRate($("matchRateInput")?.value || DEFAULT_RAHN_RATE);
  const tolPct = Number($("matchToleranceInput")?.value);
  const tolerance = setMatchTolerance(
    Number.isFinite(tolPct) ? tolPct : 15
  );

  const stats = getMatchStats();
  const statsEl = $("matchStatsLine");
  if (statsEl) {
    statsEl.textContent = `فعال: ${stats.landlords} مالک · ${stats.tenants} مستأجر · ${stats.sales} فروشی · ${stats.buyers} خریدار · نرخ ${rate} · تلرانس ${Math.round(tolerance * 100)}٪`;
  }

  const rateField = $("matchRateInput")?.closest?.(".match-field");
  if (rateField) {
    // نرخ تبدیل فقط برای حالت رهن‌کامل لازم است
    rateField.style.display = _matchTab === "rent" ? "" : "none";
  }

  const hintEl = $("matchModeHint");
  if (hintEl) {
    if (_matchTab === "rent") {
      hintEl.textContent =
        "رهن و اجاره با نرخ تبدیل به «رهن کامل» یکسان می‌شود و بعد مقایسه می‌گردد.";
    } else if (_matchTab === "rent-direct") {
      hintEl.textContent =
        "رهن با رهن و اجاره با اجاره جداگانه مقایسه می‌شود — بدون تبدیل.";
    } else {
      hintEl.textContent = "سرمایه خریدار با قیمت فروش ملک مقایسه می‌شود.";
    }
  }

  const opts = { rate, tolerance };
  let matches;
  if (_matchTab === "sale") matches = getAllSaleMatches(opts);
  else if (_matchTab === "rent-direct") matches = getAllRentDirectMatches(opts);
  else matches = getAllRentMatches(opts);

  const box = $("matchResults");
  if (box) box.innerHTML = renderMatchList(matches);
  appLog("debug", "ui", "تطبیق بروزرسانی شد", {
    tab: _matchTab,
    count: matches.length,
    rate,
    tolerance
  });
}

function setupMatchPanel() {
  const open = (e) => {
    e?.preventDefault?.();
    openMatchModal();
  };
  $("openMatchButton")?.addEventListener("click", open);
  $("openMatchHeaderButton")?.addEventListener("click", open);

  $("closeMatchButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMatchModal();
  });
  $("matchModalBackdrop")?.addEventListener("click", () => closeMatchModal());

  $("matchRefreshButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    refreshMatchResults();
    showToast("تطبیق بروزرسانی شد.", "success");
  });

  document.querySelectorAll(".match-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".match-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      _matchTab = tab.getAttribute("data-match-tab") || "rent";
      refreshMatchResults();
    });
  });

  // تماس و جزئیات داخل نتایج
  $("matchResults")?.addEventListener("click", (e) => {
    const callBtn = e.target?.closest?.(".match-call-btn");
    if (callBtn) {
      e.preventDefault();
      e.stopPropagation();
      const phone = callBtn.getAttribute("data-phone") || "";
      if (!phone) {
        showToast("شماره‌ای ثبت نشده.", "error");
        return;
      }
      const digits = String(phone).replace(/[^\d+]/g, "");
      if (digits) {
        window.location.href = `tel:${digits}`;
        appLog("info", "ui", "تماس از تطبیق", { phone: digits });
      }
      return;
    }
    const openBtn = e.target?.closest?.(".match-open-btn");
    if (openBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = openBtn.getAttribute("data-file-id");
      if (!id) return;
      // پنل تطبیق را فقط مخفی می‌کنیم؛ با بستن جزئیات دوباره باز می‌شود
      state.returnToMatch = true;
      $("matchModal")?.classList.add("hidden");
      openDetailModal(id);
    }
  });
}

function setupLogsPanel() {
  $("openLogsButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    openLogsModal();
  });
  $("closeLogsButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeLogsModal();
  });
  $("logsModalBackdrop")?.addEventListener("click", () => closeLogsModal());

  document.querySelectorAll(".logs-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".logs-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _logsFilterCat = btn.getAttribute("data-log-cat") || "all";
      renderLogsList();
    });
  });

  $("clearLogsButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    clearAppLogs();
    renderLogsList();
    showToast("لاگ‌ها پاک شد.", "success");
  });

  $("copyLogsButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const text = formatLogsForCopy(getAppLogs({ category: _logsFilterCat }));
    const ok = await copyToClipboard(text || "(empty)");
    showToast(ok ? "لاگ‌ها کپی شد." : "کپی نشد.", ok ? "success" : "error");
  });
}

function openNewFile() {
  state.editingFileId = null;
  openFileModal();
}

function goFollowUp() {
  state.currentFilter = "followup";
  applyFilters();
  window.scrollTo({ top: 0, behavior: "smooth" });
  const n = document.querySelectorAll("#filesContainer .file-card").length;
  if (n === 0) {
    showToast("فایلی برای پیگیری نیست.", "success");
  } else {
    showToast(`${n.toLocaleString("fa-IR")} فایل برای پیگیری`, "success");
  }
}

function clearSearch() {
  state.search = "";
  const input = $("searchInput");
  if (input) input.value = "";
  $("clearSearchButton")?.classList.add("hidden");
  renderHome();
  input?.focus();
}

function syncClearSearchVisibility() {
  const has = !!(state.search && String(state.search).trim());
  $("clearSearchButton")?.classList.toggle("hidden", !has);
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
      appLog("error", "auth", "خطا در logout", { message: err?.message });
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
    syncClearSearchVisibility();
    renderHome();
  });

  $("clearSearchButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearSearch();
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
  setupLogsPanel();
  setupMatchPanel();
  setupCalculator();
  setupMoneyInputs(document);
  appLog("info", "ui", "اپ آماده شد");

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
