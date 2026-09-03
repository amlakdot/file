/* =========================================================
DOT REAL ESTATE - FIXED VERSION
GitHub-only storage
Authentication: GitHub Token only
========================================================= */

const CONFIG = {
  owner: "amlakdot",
  repo: "file",
  branch: "main",
  dataPath: "data/files.json",
  githubApi: "https://api.github.com",
  pollInterval: 5 * 60 * 1000
};

let state = {
  token: null,
  files: [],
  currentFilter: "all",
  search: "",
  editingFileId: null,
  isSaving: false,
  pollTimer: null,
  lastSyncSha: null
};

const $ = (id) => document.getElementById(id);

// =============================================
// HELPERS
// =============================================

function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
    return "";
  }
  return Number(value).toLocaleString("fa-IR");
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(value);
  return `${number.toLocaleString("fa-IR")} تومان`;
}

function formatDate(dateValue) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDateTime(dateValue) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function showToast(message, type = "success") {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden", "success", "error", "warning");
  toast.classList.add(type);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

function setLoginError(message) {
  const element = $("loginError");
  if (!element) return;
  element.textContent = message || "";
  if (message) {
    element.classList.remove("hidden");
  } else {
    element.classList.add("hidden");
  }
}

function generateFileId() {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 11);
  const micro = Math.floor(Math.random() * 1000);
  return `file-${timestamp}-${micro}-${randomPart}`;
}

function validatePhoneNumber(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  const iranianPhoneRegex = /^(?:0098|\+98|0)?9\d{9}$/;
  return iranianPhoneRegex.test(cleaned);
}

// =============================================
// GITHUB API
// =============================================

async function githubRequest(url, options = {}) {
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
        case 401: message = "توکن GitHub معتبر نیست یا منقضی شده است."; break;
        case 403: message = "GitHub دسترسی این توکن را رد کرد."; break;
        case 404: message = "ریپازیتوری یا فایل پیدا نشد."; break;
        case 409: message = "هم‌زمان تغییر دیگری روی فایل انجام شده است. دوباره تلاش کنید."; break;
        case 422: message = "داده‌های ارسالی نامعتبر هستند."; break;
        case 429: message = "تعداد درخواست‌ها زیاد است. کمی صبر کنید."; break;
        case 500:
        case 502:
        case 503: message = "سرور GitHub مشکل دارد."; break;
      }
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`درخواست منقضی شد (${TIMEOUT / 1000} ثانیه). اتصال اینترنت را بررسی کنید.`);
    }
    if (error instanceof TypeError) {
      throw new Error("خطا در ارتباط با شبکه. اتصال اینترنت را بررسی کنید.");
    }
    throw error;
  }
}

async function verifyToken() {
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

async function getFilesFromGitHub() {
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

async function loadFiles(options = {}) {
  const silent = options.silent === true;

  try {
    if (!silent) {
      setSyncStatus("loading", "در حال دریافت اطلاعات...");
    }

    const result = await getFilesFromGitHub();
    state.files = Array.isArray(result.database.files) ? result.database.files : [];
    state.lastSyncSha = result.sha;

    updateFollowUpStatuses(false);
    renderHome();

    setSyncStatus("success", "همگام با GitHub", new Date());
    return true;
  } catch (error) {
    console.error(error);
    setSyncStatus("error", error.message || "خطا در دریافت اطلاعات");
    if (!silent) {
      showToast(error.message || "دریافت اطلاعات از GitHub انجام نشد.", "error");
    }
    return false;
  }
}

async function saveDatabase(newFiles, commitMessage) {
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
    database.files = newFiles;

    const content = JSON.stringify(database, null, 2);
    const bytes = new TextEncoder().encode(content);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
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

    updateFollowUpStatuses(false);
    renderHome();

    setSyncStatus("success", "ذخیره شد", new Date());
    return result;
  } finally {
    state.isSaving = false;
  }
}

async function commitFiles(newFiles, message = "Update real estate files") {
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

function setSyncStatus(type, text, date = null) {
  const indicator = $("syncIndicator");
  const syncText = $("syncText");
  const lastSyncText = $("lastSyncText");

  if (indicator) {
    indicator.className = "sync-dot";
    if (type === "success") indicator.classList.add("success");
    if (type === "error") indicator.classList.add("error");
    if (type === "loading" || type === "saving") indicator.classList.add("loading");
  }

  if (syncText) syncText.textContent = text || "";

  if (lastSyncText && date) {
    lastSyncText.textContent = `آخرین همگام‌سازی: ${formatDateTime(date)}`;
  }
}

// =============================================
// AUTH
// =============================================

async function loginWithToken(token) {
  token = String(token || "").trim();
  if (!token) throw new Error("لطفاً GitHub Token را وارد کنید.");

  state.token = token;
  await verifyToken();
  const loaded = await loadFiles();
  if (!loaded) {
    throw new Error("توکن معتبر است، اما اطلاعات فایل‌ها دریافت نشد.");
  }

  showApp();
  startPolling();
}

function logout() {
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

function showLogin() {
  $("loginScreen")?.classList.remove("hidden");
  $("appScreen")?.classList.add("hidden");
}

function showApp() {
  $("loginScreen")?.classList.add("hidden");
  $("appScreen")?.classList.remove("hidden");
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(async () => {
    if (!state.token) return;
    await loadFiles({ silent: true });
  }, CONFIG.pollInterval);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

// =============================================
// LABELS
// =============================================

const TYPE_LABELS = {
  sale: "ملک فروشی",
  landlord: "مالک / موجر",
  buyer: "خریدار",
  tenant: "مستاجر"
};

const PROPERTY_TYPE_LABELS = {
  apartment: "آپارتمان",
  villa: "ویلا",
  office: "دفتر / اداری",
  commercial: "تجاری",
  land: "زمین",
  garden: "باغ",
  any: "فرقی ندارد"
};

// =============================================
// FILE HELPERS
// =============================================

function getFileData(file) {
  if (!file || typeof file !== "object") return {};
  if (file.data && typeof file.data === "object") return file.data;
  return file;
}

function getFileName(file) {
  const data = getFileData(file);
  return data.name || data.propertyName || data.buyerName || data.tenantName || "بدون نام";
}

function getFilePhone(file) {
  const data = getFileData(file);
  return data.phone || data.propertyPhone || data.buyerPhone || data.tenantPhone || "";
}

function getFileLocation(file) {
  const data = getFileData(file);
  return data.location || data.propertyLocation || data.buyerLocation || data.tenantLocation || "";
}

function isFollowUp(file) {
  if (!file) return false;
  if (file.status === "followup" || file.status === "needs-followup") return true;
  if (!file.followUpDate) return false;
  const timestamp = new Date(file.followUpDate).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function updateFollowUpStatuses(saveChanges = false) {
  let changed = false;

  for (const file of state.files) {
    if (!file) continue;
    if (file.status === "archived" || file.status === "done") continue;
    if (!file.followUpDate) continue;

    const deadline = new Date(file.followUpDate).getTime();
    if (Number.isFinite(deadline) && deadline <= Date.now() && file.status !== "followup") {
      file.status = "followup";
      changed = true;
    }
  }

  updateFollowUpCount();

  if (saveChanges && changed) {
    commitFiles(state.files, "Update follow-up statuses");
  }

  return changed;
}

function updateFollowUpCount() {
  const count = state.files.filter((f) => isFollowUp(f)).length;
  const el = $("followUpCount");
  if (el) el.textContent = count.toLocaleString("fa-IR");
}

// =============================================
// FILTER & RENDER
// =============================================

function getFilteredFiles() {
  let result = [...state.files];

  if (state.currentFilter === "followup") {
    result = result.filter((f) => isFollowUp(f));
  } else if (state.currentFilter !== "all") {
    result = result.filter((f) => f.type === state.currentFilter);
  }

  const query = normalize(state.search);
  if (query) {
    result = result.filter((file) => {
      const data = getFileData(file);
      const searchable = [
        file.id, file.type, file.status,
        data.name, data.phone, data.location, data.region,
        data.propertyName, data.propertyPhone, data.propertyLocation
      ];
      return searchable.some((v) => normalize(v).includes(query));
    });
  }

  return result;
}

function renderHome() {
  const container = $("filesContainer");
  const empty = $("emptyState");
  if (!container) return;

  const filtered = getFilteredFiles();

  if (filtered.length === 0) {
    container.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");
  container.innerHTML = filtered.map((f) => renderFileCard(f)).join("");
}

function getStatusColor(status) {
  const colors = {
    active: "#55b878",
    pending: "#e3a93f",
    archived: "#727a82",
    done: "#55b878",
    followup: "#e05252"
  };
  return colors[status] || "#aeb5bb";
}

function getStatusLabel(status) {
  const labels = {
    active: "فعال",
    pending: "در انتظار",
    archived: "بایگانی",
    done: "انجام شده",
    followup: "نیاز به پیگیری"
  };
  return labels[status] || status;
}

function renderFileCard(file) {
  const data = getFileData(file);
  const type = file.type || "sale";
  const status = file.status || "active";
  const name = getFileName(file);
  const phone = getFilePhone(file);
  const location = getFileLocation(file);
  const propertyType = data.propertyType || "";
  const area = data.area || "";
  const hasFollowUp = isFollowUp(file);

  return `
    <div class="file-card" data-file-id="${escapeHtml(file.id)}" role="button" tabindex="0">
      <div class="card-top">
        <div>
          <div class="card-type">${escapeHtml(TYPE_LABELS[type] || type)}</div>
          <div class="card-title">${escapeHtml(name)}</div>
        </div>
        ${hasFollowUp ? `<div class="followup-badge">پیگیری</div>` : ""}
      </div>
      <div class="card-info">
        <div class="info-item">
          <div class="info-label">تلفن</div>
          <div class="info-value">${escapeHtml(phone || "—")}</div>
        </div>
        <div class="info-item">
          <div class="info-label">موقعیت</div>
          <div class="info-value">${escapeHtml(location || "—")}</div>
        </div>
        <div class="info-item">
          <div class="info-label">نوع ملک</div>
          <div class="info-value">${escapeHtml(PROPERTY_TYPE_LABELS[propertyType] || propertyType || "—")}</div>
        </div>
        <div class="info-item">
          <div class="info-label">متراژ</div>
          <div class="info-value">${escapeHtml(area ? `${area} متر` : "—")}</div>
        </div>
      </div>
      <div class="card-footer">
        <div>${escapeHtml(formatDate(file.updatedAt))}</div>
        <div class="status-badge" style="background:${getStatusColor(status)}">
          ${escapeHtml(getStatusLabel(status))}
        </div>
      </div>
    </div>
  `;
}

// =============================================
// EVENTS
// =============================================

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

function applyFilters() {
  document.querySelectorAll(".filter-button").forEach((btn) => {
    const filter = btn.getAttribute("data-filter");
    btn.classList.toggle("active", filter === state.currentFilter);
  });
  renderHome();
}

// =============================================
// MODAL
// =============================================

function openFileModal() {
  const modal = $("fileModal");
  if (!modal) return;

  modal.classList.remove("hidden");

  if (state.editingFileId) {
    $("modalEyebrow").textContent = "ویرایش فایل";
    $("modalTitle").textContent = "ویرایش";
    loadFileIntoForm(state.editingFileId);
  } else {
    $("modalEyebrow").textContent = "فایل جدید";
    $("modalTitle").textContent = "ثبت فایل";
    $("fileForm")?.reset();
    if ($("followUpDays")) $("followUpDays").value = 10;
    document.querySelector('input[name="fileType"][value="sale"]')?.setAttribute("checked", "checked");
    const saleRadio = document.querySelector('input[name="fileType"][value="sale"]');
    if (saleRadio) saleRadio.checked = true;
    updateFormVisibility();
  }
}

function closeFileModal() {
  $("fileModal")?.classList.add("hidden");
  state.editingFileId = null;
}

function setupModalClose() {
  $("closeModalButton")?.addEventListener("click", closeFileModal);
  $("cancelFormButton")?.addEventListener("click", closeFileModal);

  $("fileModal")?.addEventListener("click", (e) => {
    if (e.target === $("fileModal") || e.target.classList.contains("modal-backdrop")) {
      closeFileModal();
    }
  });
}

// =============================================
// FORM
// =============================================

function setupFileForm() {
  const form = $("fileForm");
  if (!form) return;

  form.querySelectorAll('input[name="fileType"]').forEach((radio) => {
    radio.addEventListener("change", updateFormVisibility);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveFile();
  });

  updateFormVisibility();
}

function updateFormVisibility() {
  const fileType = document.querySelector('input[name="fileType"]:checked')?.value || "sale";

  $("buyerSection")?.classList.toggle("hidden", fileType !== "buyer");
  $("tenantSection")?.classList.toggle("hidden", fileType !== "tenant");

  const showPropertyDetails = fileType === "sale" || fileType === "landlord";
  $("propertyDetailsSection")?.classList.toggle("hidden", !showPropertyDetails);

  document.querySelectorAll(".property-field").forEach((el) => {
    el.classList.toggle("hidden", !showPropertyDetails);
  });

  document.querySelectorAll(".landlord-only").forEach((el) => {
    el.classList.toggle("hidden", fileType !== "landlord");
  });

  const occupancy = $("occupancy")?.value || "";
  const showOccupancyFields = showPropertyDetails && occupancy === "tenant";
  $("currentDepositField")?.classList.toggle("hidden", !showOccupancyFields);
  $("currentRentField")?.classList.toggle("hidden", !showOccupancyFields);

  const familyStatus = $("familyStatus")?.value || "";
  $("familySizeField")?.classList.toggle("hidden", familyStatus !== "family");
}

async function saveFile() {
  const fileType = document.querySelector('input[name="fileType"]:checked')?.value || "sale";

  const name = ($("name")?.value || "").trim();
  const phone = ($("phone")?.value || "").trim();
  const propertyType = $("propertyType")?.value || "";
  const area = parseInt($("area")?.value || "0", 10) || 0;
  const rooms = parseInt($("rooms")?.value || "0", 10) || 0;
  const year = parseInt($("year")?.value || "0", 10) || 0;
  const location = ($("location")?.value || "").trim();

  const keyHolder = $("keyHolder")?.value || "";
  const condition = $("condition")?.value || "";
  const occupancy = $("occupancy")?.value || "";
  const currentDeposit = parseInt($("currentDeposit")?.value || "0", 10) || 0;
  const currentRent = parseInt($("currentRent")?.value || "0", 10) || 0;
  const suggestedDeposit = parseInt($("suggestedDeposit")?.value || "0", 10) || 0;
  const suggestedRent = parseInt($("suggestedRent")?.value || "0", 10) || 0;

  const capital = parseInt($("capital")?.value || "0", 10) || 0;
  const buyerNotes = ($("buyerNotes")?.value || "").trim();

  const tenantDeposit = parseInt($("tenantDeposit")?.value || "0", 10) || 0;
  const tenantRent = parseInt($("tenantRent")?.value || "0", 10) || 0;
  const familyStatus = $("familyStatus")?.value || "";
  const familySize = parseInt($("familySize")?.value || "0", 10) || 0;
  const tenantNotes = ($("tenantNotes")?.value || "").trim();

  const amenities = Array.from(document.querySelectorAll(".amenity:checked")).map((c) => c.value);

  // Follow-up: days → date
  const days = parseInt($("followUpDays")?.value || "10", 10);
  let followUpDate = null;
  let status = "active";

  if (Number.isFinite(days) && days > 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    followUpDate = d.toISOString();
  }

  if (!name) {
    showToast("لطفاً نام را وارد کنید.", "error");
    return;
  }
  if (!phone) {
    showToast("لطفاً شماره تلفن را وارد کنید.", "error");
    return;
  }
  if (!validatePhoneNumber(phone)) {
    showToast("لطفاً شماره تلفن صحیح وارد کنید (09xxxxxxxxx).", "error");
    return;
  }

  let existingFile = null;
  if (state.editingFileId) {
    existingFile = state.files.find((f) => f.id === state.editingFileId);
  }

  const fileData = {
    id: state.editingFileId || generateFileId(),
    type: fileType,
    status,
    followUpDate,
    createdAt: existingFile?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name,
    phone,
    propertyType,
    area,
    rooms,
    year,
    location,
    keyHolder,
    condition,
    occupancy,
    currentDeposit,
    currentRent,
    suggestedDeposit,
    suggestedRent,
    capital,
    buyerNotes,
    tenantDeposit,
    tenantRent,
    familyStatus,
    familySize,
    tenantNotes,
    amenities
  };

  let newFiles;
  if (state.editingFileId) {
    newFiles = state.files.map((f) => (f.id === state.editingFileId ? { ...f, ...fileData } : f));
  } else {
    newFiles = [...state.files, fileData];
  }

  const success = await commitFiles(
    newFiles,
    state.editingFileId ? `Update file ${fileData.id}` : `Create new file ${fileData.id}`
  );

  if (success) closeFileModal();
}

function loadFileIntoForm(fileId) {
  const file = state.files.find((f) => f.id === fileId);
  if (!file) return;

  const data = getFileData(file);

  const typeRadio = document.querySelector(`input[name="fileType"][value="${file.type || "sale"}"]`);
  if (typeRadio) typeRadio.checked = true;

  const fields = {
    name: data.name,
    phone: data.phone,
    propertyType: data.propertyType,
    area: data.area,
    rooms: data.rooms,
    year: data.year,
    location: data.location,
    keyHolder: data.keyHolder,
    condition: data.condition,
    occupancy: data.occupancy,
    currentDeposit: data.currentDeposit,
    currentRent: data.currentRent,
    suggestedDeposit: data.suggestedDeposit,
    suggestedRent: data.suggestedRent,
    capital: data.capital,
    buyerNotes: data.buyerNotes,
    tenantDeposit: data.tenantDeposit,
    tenantRent: data.tenantRent,
    familyStatus: data.familyStatus,
    familySize: data.familySize,
    tenantNotes: data.tenantNotes
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = $(id);
    if (el && value !== undefined && value !== null && value !== "") {
      el.value = value;
    }
  });

  // محاسبه روزهای باقی‌مانده برای پیگیری
  if (file.followUpDate) {
    const target = new Date(file.followUpDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.max(1, Math.round((target - today) / (1000 * 60 * 60 * 24)));
    if ($("followUpDays")) $("followUpDays").value = diffDays;
  } else if ($("followUpDays")) {
    $("followUpDays").value = 10;
  }

  document.querySelectorAll(".amenity").forEach((cb) => {
    cb.checked = Array.isArray(data.amenities) && data.amenities.includes(cb.value);
  });

  updateFormVisibility();
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
