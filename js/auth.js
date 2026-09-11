/* =========================================================
   AUTH + SMART POLLING
========================================================= */

import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { $, setLoginError } from "./helpers.js";
import { verifyToken, loadFiles } from "./github.js";
import { closeFileModal, closeDetailModal } from "./modal.js";
import { clearCryptoCache } from "./crypto.js";

export async function loginWithToken(token) {
  token = String(token || "").trim();
  if (!token) throw new Error("لطفاً GitHub Token را وارد کنید.");

  state.token = token;
  await verifyToken();

  const loaded = await loadFiles();
  if (!loaded) {
    throw new Error(
      "توکن معتبر است، اما اطلاعات فایل‌ها دریافت نشد."
    );
  }

  showApp();
  startPolling();
}

export function logout() {
  try {
    stopPolling();
  } catch {
    // ignore
  }

  state.token = null;
  state.files = [];
  state.currentFilter = "all";
  state.search = "";
  state.region = "";
  state.priceMin = null;
  state.priceMax = null;
  state.editingFileId = null;
  state.viewingFileId = null;
  state.lastSyncSha = null;
  state.isSaving = false;
  state.formDirty = false;

  try {
    clearCryptoCache();
  } catch {
    // ignore
  }

  try {
    closeFileModal(true);
    closeDetailModal(true);
  } catch {
    // ignore
  }

  if ($("loginForm")) $("loginForm").reset();
  if ($("searchInput")) $("searchInput").value = "";
  if ($("regionFilter")) $("regionFilter").value = "";
  if ($("priceMinFilter")) $("priceMinFilter").value = "";
  if ($("priceMaxFilter")) $("priceMaxFilter").value = "";
  if ($("followUpCount")) $("followUpCount").textContent = "0";
  if ($("filesContainer")) $("filesContainer").innerHTML = "";

  showLogin();
  setLoginError("");
}

export function showLogin() {
  $("loginScreen")?.classList.remove("hidden");
  $("appScreen")?.classList.add("hidden");
  document.body.style.overflow = "";
}

export function showApp() {
  $("loginScreen")?.classList.add("hidden");
  $("appScreen")?.classList.remove("hidden");
}

/**
 * Polling هوشمند:
 * - فقط وقتی تب visible است
 * - حداقل فاصله minPollGap
 * - اگر اخیراً ذخیره محلی شده کمی صبر می‌کند
 */
async function smartPollTick() {
  if (!state.token) return;
  if (state.isSaving) return;
  if (document.visibilityState === "hidden") return;

  const now = Date.now();
  if (now - (state.lastPollAt || 0) < (CONFIG.minPollGap || 60000)) return;
  if (now - (state.lastLocalChangeAt || 0) < 15000) return;

  await loadFiles({ silent: true });
}

export function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(smartPollTick, CONFIG.pollInterval || 180000);

  if (!startPolling._visBound) {
    startPolling._visBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.token) {
        smartPollTick();
      }
    });
    window.addEventListener("focus", () => {
      if (state.token) smartPollTick();
    });
  }
}

export function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

export async function manualSync() {
  if (!state.token) return;
  await loadFiles({ silent: false });
}
