/* =========================================================
   GITHUB API
========================================================= */

import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { $, formatDateTime, showToast } from "./helpers.js";
import { updateFollowUpStatuses } from "./files.js";
import { renderHome } from "./render.js";
import { decryptAllFiles, encryptAllFiles } from "./crypto.js";

export async function githubRequest(url, options = {}) {
  const TIMEOUT = 15000;

  if (!state.token) {
    throw new Error("توکن GitHub وارد نشده است.");
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${state.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    });

    clearTimeout(timeout);

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      let message = data.message || "خطا در ارتباط با GitHub.";
      switch (response.status) {
        case 401:
          message = "توکن GitHub معتبر نیست یا منقضی شده است.";
          break;
        case 403:
          message = "GitHub دسترسی این توکن را رد کرد.";
          break;
        case 404:
          message = "ریپازیتوری یا فایل پیدا نشد.";
          break;
        case 409:
          message =
            "هم‌زمان تغییر دیگری روی فایل انجام شده است. دوباره تلاش کنید.";
          break;
        case 422:
          message = "داده‌های ارسالی نامعتبر هستند.";
          break;
        case 429:
          message = "تعداد درخواست‌ها زیاد است. کمی صبر کنید.";
          break;
        case 500:
        case 502:
        case 503:
          message = "سرور GitHub مشکل دارد.";
          break;
      }
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `درخواست منقضی شد (${TIMEOUT / 1000} ثانیه). اتصال اینترنت را بررسی کنید.`
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        "خطا در ارتباط با شبکه. اتصال اینترنت را بررسی کنید."
      );
    }
    throw error;
  }
}

export async function verifyToken() {
  const url =
    `${CONFIG.githubApi}/repos/` +
    `${encodeURIComponent(CONFIG.owner)}/` +
    `${encodeURIComponent(CONFIG.repo)}`;

  const repo = await githubRequest(url);

  if (!repo || !repo.full_name) {
    throw new Error("امکان دسترسی به ریپازیتوری وجود ندارد.");
  }

  const expected = `${CONFIG.owner}/${CONFIG.repo}`.toLowerCase();
  if (repo.full_name.toLowerCase() !== expected) {
    throw new Error("توکن به ریپازیتوری موردنظر دسترسی ندارد.");
  }

  return repo;
}

export async function getFilesFromGitHub() {
  const url =
    `${CONFIG.githubApi}/repos/` +
    `${encodeURIComponent(CONFIG.owner)}/` +
    `${encodeURIComponent(CONFIG.repo)}/contents/` +
    `${CONFIG.dataPath}?ref=${encodeURIComponent(CONFIG.branch)}` +
    `&t=${Date.now()}`;

  const data = await githubRequest(url, { cache: "no-store" });

  if (!data || !data.content) {
    throw new Error("محتوای data/files.json دریافت نشد.");
  }

  const binary = atob(data.content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const decoded = new TextDecoder("utf-8").decode(bytes);

  let database;
  try {
    database = JSON.parse(decoded);
  } catch {
    throw new Error("فایل data/files.json معتبر نیست.");
  }

  if (!database || typeof database !== "object") {
    throw new Error("ساختار data/files.json اشتباه است.");
  }

  if (!Array.isArray(database.files)) {
    database.files = [];
  }

  return { database, sha: data.sha };
}

export function setSyncStatus(type, text, date = null) {
  const indicator = $("syncIndicator");
  const syncText = $("syncText");
  const lastSyncText = $("lastSyncText");

  if (indicator) {
    indicator.className = "sync-dot";
    if (type === "success") indicator.classList.add("success");
    if (type === "error") indicator.classList.add("error");
    if (type === "loading" || type === "saving") {
      indicator.classList.add("loading");
    }
  }

  if (syncText) syncText.textContent = text || "";

  if (lastSyncText && date) {
    lastSyncText.textContent = `آخرین همگام‌سازی: ${formatDateTime(date)}`;
  }
}

export async function loadFiles(options = {}) {
  const silent = options.silent === true;

  try {
    if (!silent) {
      setSyncStatus("loading", "در حال دریافت اطلاعات...");
    }

    const result = await getFilesFromGitHub();
    const rawFiles = Array.isArray(result.database.files)
      ? result.database.files
      : [];
    // شماره تلفن‌ها را بعد از خواندن از GitHub رمزگشایی کن
    state.files = await decryptAllFiles(rawFiles);
    state.lastSyncSha = result.sha;

    updateFollowUpStatuses();
    renderHome();

    setSyncStatus("success", "همگام با GitHub", new Date());
    return true;
  } catch (error) {
    console.error(error);
    setSyncStatus("error", error.message || "خطا در دریافت اطلاعات");
    if (!silent) {
      showToast(
        error.message || "دریافت اطلاعات از GitHub انجام نشد.",
        "error"
      );
    }
    return false;
  }
}

export async function saveDatabase(newFiles, commitMessage) {
  if (state.isSaving) {
    throw new Error("یک عملیات ذخیره در حال انجام است.");
  }

  state.isSaving = true;

  try {
    setSyncStatus("saving", "در حال ذخیره در GitHub...");

    const latest = await getFilesFromGitHub();
    const database = latest.database;

    database.version = 1;
    database.updatedAt = new Date().toISOString();
    // قبل از ذخیره در GitHub، شماره تلفن‌ها را رمزنگاری کن
    // state.files همچنان نسخه رمزگشایی‌شده را نگه می‌دارد
    database.files = await encryptAllFiles(newFiles);

    const content = JSON.stringify(database, null, 2);
    const bytes = new TextEncoder().encode(content);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
      );
    }
    const base64 = btoa(binary);

    const url =
      `${CONFIG.githubApi}/repos/` +
      `${encodeURIComponent(CONFIG.owner)}/` +
      `${encodeURIComponent(CONFIG.repo)}/contents/` +
      CONFIG.dataPath;

    const result = await githubRequest(url, {
      method: "PUT",
      headers: { "Content-Type": "application/vnd.github+json" },
      body: JSON.stringify({
        message: commitMessage || "Update real estate files",
        content: base64,
        sha: latest.sha,
        branch: CONFIG.branch
      })
    });

    state.files = newFiles;
    state.lastSyncSha = result?.content?.sha || latest.sha;

    updateFollowUpStatuses();
    renderHome();

    setSyncStatus("success", "ذخیره شد", new Date());
    return result;
  } finally {
    state.isSaving = false;
  }
}

export async function commitFiles(
  newFiles,
  message = "Update real estate files"
) {
  try {
    await saveDatabase(newFiles, message);
    showToast("اطلاعات با موفقیت ذخیره شد.", "success");
    return true;
  } catch (error) {
    console.error(error);
    setSyncStatus("error", error.message || "ذخیره انجام نشد.");
    showToast(error.message || "ذخیره انجام نشد.", "error");
    return false;
  }
}
