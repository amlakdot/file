/* =========================================================
   AUTH + POLLING
========================================================= */

import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { $, setLoginError } from "./helpers.js";
import { verifyToken, loadFiles } from "./github.js";
import { closeFileModal } from "./modal.js";

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
  stopPolling();

  state.token = null;
  state.files = [];
  state.currentFilter = "all";
  state.search = "";
  state.editingFileId = null;
  state.lastSyncSha = null;

  closeFileModal();

  if ($("loginForm")) $("loginForm").reset();
  if ($("searchInput")) $("searchInput").value = "";

  showLogin();
  setLoginError("");
}

export function showLogin() {
  $("loginScreen")?.classList.remove("hidden");
  $("appScreen")?.classList.add("hidden");
}

export function showApp() {
  $("loginScreen")?.classList.add("hidden");
  $("appScreen")?.classList.remove("hidden");
}

export function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(async () => {
    if (!state.token) return;
    await loadFiles({ silent: true });
  }, CONFIG.pollInterval);
}

export function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}
