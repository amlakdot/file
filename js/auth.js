/* =========================================================
   AUTH + SMART POLLING
========================================================= */

import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { $, setLoginError } from "./helpers.js";
import { verifyToken, loadFiles } from "./github.js";
import { closeFileModal, closeDetailModal } from "./modal.js";
import { clearCryptoCache } from "./crypto.js";

/** کلید ذخیره نشست در localStorage */
const SESSION_KEY = "dot_auth_session_v1";

/** مدت اعتبار نشست (میلی‌ثانیه) — پیش‌فرض ۷ روز */
function sessionTtlMs() {
  const days = Number(CONFIG.sessionDays);
  const d = Number.isFinite(days) && days > 0 ? days : 7;
  return d * 24 * 60 * 60 * 1000;
}

function saveSession(token) {
  try {
    const payload = {
      token: String(token),
      savedAt: Date.now(),
      expiresAt: Date.now() + sessionTtlMs()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("saveSession failed:", err);
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.token) return null;
    if (data.expiresAt && Date.now() > Number(data.expiresAt)) {
      clearSession();
      return null;
    }
    return String(data.token);
  } catch {
    clearSession();
    return null;
  }
}

export async function loginWithToken(token, { persist = true } = {}) {
  token = String(token || "").trim();
  if (!token) throw new Error("لطفاً GitHub Token را وارد کنید.");

  state.token = token;
  await verifyToken();

  const loaded = await loadFiles();
  if (!loaded) {
    state.token = null;
    throw new Error(
      "توکن معتبر است، اما اطلاعات فایل‌ها دریافت نشد."
    );
  }

  if (persist) {
    saveSession(token);
  }

  showApp();
  startPolling();
}

/**
 * تلاش برای ورود خودکار از نشست ذخیره‌شده (تا ۷ روز)
 * @returns {Promise<boolean>} true اگر ورود موفق بود
 */
export async function tryRestoreSession() {
  const token = readSession();
  if (!token) return false;

  try {
    // persist=false چون همین نشست را تمدید می‌کنیم بعد از موفقیت
    await loginWithToken(token, { persist: true });
    return true;
  } catch (err) {
    console.warn("tryRestoreSession failed:", err);
    clearSession();
    state.token = null;
    showLogin();
    return false;
  }
}

export function logout() {
  try {
    stopPolling();
  } catch {
    // ignore
  }

  clearSession();

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
