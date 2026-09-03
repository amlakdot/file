/* =========================================================
DOT REAL ESTATE
GitHub-only storage
Authentication: GitHub Fine-grained Personal Access Token
========================================================= */

const CONFIG = {
  owner: "amlakdot",
  repo: "file",
  branch: "main",
  dataPath: "data/files.json",
  githubApi: "https://api.github.com",
  // هر ۵ دقیقه اطلاعات جدید GitHub بررسی می‌شود
  pollInterval: 5 * 60 * 1000
};

/* =========================================================
STATE
========================================================= */

let state = {
  token: null,
  files: [],
  currentFilter: "all",
  search: "",
  editingFileId: null,
  selectedFileId: null,
  renewFileId: null,
  isSaving: false,
  pollTimer: null,
  lastSyncSha: null
};

/* =========================================================
DOM
========================================================= */

const $ = (id) => document.getElementById(id);

/* =========================================================
BASIC HELPERS
========================================================= */

function normalize(value) {
  if (value === null || value === undefined) {
    return "";
  }
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
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    Number.isNaN(Number(value))
  ) {
    return "";
  }
  return Number(value).toLocaleString("fa-IR");
}

function formatMoney(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }
  return `${number.toLocaleString("fa-IR")} تومان`;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "—";
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return "—";
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
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
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.remove(
    "hidden",
    "success",
    "error",
    "warning"
  );
  toast.classList.add(type);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

/* =========================================================
LOGIN ERROR
========================================================= */

function setLoginError(message) {
  const element = $("loginError");
  if (!element) {
    return;
  }
  element.textContent = message || "";
  if (message) {
    element.classList.remove("hidden");
  } else {
    element.classList.add("hidden");
  }
}

/* =========================================================
GITHUB API
========================================================= */

async function githubRequest(url, options = {}) {
  if (!state.token) {
    throw new Error("توکن GitHub وارد نشده است.");
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      message: text
    };
  }

  if (!response.ok) {
    let message = data.message || "خطا در ارتباط با GitHub.";
    if (response.status === 401) {
      message = "توکن GitHub معتبر نیست یا منقضی شده است.";
    }
    if (response.status === 403) {
      message =
        "GitHub دسترسی این توکن را رد کرد. دسترسی Contents باید روی Read and write باشد.";
    }
    if (response.status === 404) {
      message =
        "ریپازیتوری یا فایل data/files.json پیدا نشد.";
    }
    if (response.status === 409) {
      message =
        "هم‌زمان تغییر دیگری روی فایل انجام شده است. دوباره امتحان کنید.";
    }
    throw new Error(message);
  }

  return data;
}

/* =========================================================
VERIFY TOKEN
========================================================= */

async function verifyToken() {
  const url =
    `${CONFIG.githubApi}/repos/` +
    `${encodeURIComponent(CONFIG.owner)}/` +
    `${encodeURIComponent(CONFIG.repo)}`;
  const repo = await githubRequest(url);
  if (!repo || !repo.full_name) {
    throw new Error(
      "امکان دسترسی به ریپازیتوری وجود ندارد."
    );
  }
  const expected =
    `${CONFIG.owner}/${CONFIG.repo}`.toLowerCase();
  if (repo.full_name.toLowerCase() !== expected) {
    throw new Error(
      "توکن به ریپازیتوری موردنظر دسترسی ندارد."
    );
  }
  return repo;
}

/* =========================================================
READ files.json
========================================================= */

async function getFilesFromGitHub() {
  const url =
    `${CONFIG.githubApi}/repos/` +
    `${encodeURIComponent(CONFIG.owner)}/` +
    `${encodeURIComponent(CONFIG.repo)}/contents/` +
    `${CONFIG.dataPath}?ref=${encodeURIComponent(CONFIG.branch)}` +
    `&t=${Date.now()}`;
  const data = await githubRequest(url, {
    cache: "no-store"
  });

  if (!data || !data.content) {
    throw new Error(
      "محتوای data/files.json دریافت نشد."
    );
  }

  const binary = atob(
    data.content.replace(/\s/g, "")
  );
  const bytes = Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0)
  );
  const decoded = new TextDecoder("utf-8").decode(bytes);

  let database;
  try {
    database = JSON.parse(decoded);
  } catch {
    throw new Error(
      "فایل data/files.json معتبر نیست."
    );
  }

  if (!database || typeof database !== "object") {
    throw new Error(
      "ساختار data/files.json اشتباه است."
    );
  }

  if (!Array.isArray(database.files)) {
    database.files = [];
  }

  return {
    database,
    sha: data.sha
  };
}

/* =========================================================
LOAD FILES
========================================================= */

async function loadFiles(options = {}) {
  const silent = options.silent === true;

  try {
    if (!silent) {
      setSyncStatus(
        "loading",
        "در حال دریافت اطلاعات..."
      );
    }

    const result = await getFilesFromGitHub();
    state.files = Array.isArray(result.database.files)
      ? result.database.files
      : [];
    state.lastSyncSha = result.sha;

    updateFollowUpStatuses(false);
    renderHome();

    setSyncStatus(
      "success",
      "همگام با GitHub",
      new Date()
    );

    return true;
  } catch (error) {
    console.error(error);
    setSyncStatus(
      "error",
      error.message || "خطا در دریافت اطلاعات"
    );
    if (!silent) {
      showToast(
        error.message ||
        "دریافت اطلاعات از GitHub انجام نشد.",
        "error"
      );
    }
    return false;
  }
}

/* =========================================================
SAVE DATABASE TO GITHUB
========================================================= */

async function saveDatabase(newFiles, commitMessage) {
  if (state.isSaving) {
    throw new Error(
      "یک عملیات ذخیره در حال انجام است."
    );
  }

  state.isSaving = true;

  try {
    setSyncStatus(
      "saving",
      "در حال ذخیره در GitHub..."
    );

    /*
    * قبل از ذخیره، آخرین نسخه را دوباره می‌گیریم.
    * این کار احتمال overwrite شدن تغییرات همکار دیگر
    * را کمتر می‌کند.
    */
    const latest = await getFilesFromGitHub();
    const database = latest.database;

    database.version = 1;
    database.updatedAt =
      new Date().toISOString();
    database.files = newFiles;

    const content = JSON.stringify(
      database,
      null,
      2
    );

    const bytes =
      new TextEncoder().encode(content);
    let binary = "";
    const chunkSize = 0x8000;
    for (
      let index = 0;
      index < bytes.length;
      index += chunkSize
    ) {
      binary += String.fromCharCode(
        ...bytes.subarray(
          index,
          Math.min(
            index + chunkSize,
            bytes.length
          )
        )
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
      headers: {
        "Content-Type":
          "application/vnd.github+json"
      },
      body: JSON.stringify({
        message:
          commitMessage ||
          "Update real estate files",
        content: base64,
        sha: latest.sha,
        branch: CONFIG.branch
      })
    });

    state.files = newFiles;
    state.lastSyncSha =
      result?.content?.sha ||
      latest.sha;

    updateFollowUpStatuses(false);
    renderHome();

    setSyncStatus(
      "success",
      "ذخیره شد",
      new Date()
    );

    return result;
  } finally {
    state.isSaving = false;
  }
}

/* =========================================================
SAVE WITH ERROR HANDLING
========================================================= */

async function commitFiles(
  newFiles,
  message = "Update real estate files"
) {
  try {
    await saveDatabase(
      newFiles,
      message
    );

    showToast(
      "اطلاعات با موفقیت ذخیره شد.",
      "success"
    );

    return true;
  } catch (error) {
    console.error(error);

    setSyncStatus(
      "error",
      error.message ||
      "ذخیره انجام نشد."
    );

    showToast(
      error.message ||
      "ذخیره انجام نشد.",
      "error"
    );

    return false;
  }
}

/* =========================================================
SYNC STATUS
========================================================= */

function setSyncStatus(
  type,
  text,
  date = null
) {
  const indicator =
    $("syncIndicator");
  const syncText =
    $("syncText");
  const lastSyncText =
    $("lastSyncText");

  if (indicator) {
    indicator.className =
      "sync-dot";
    if (type === "success") {
      indicator.classList.add("success");
    }
    if (type === "error") {
      indicator.classList.add("error");
    }
    if (type === "loading" ||
      type === "saving") {
      indicator.classList.add("loading");
    }
  }

  if (syncText) {
    syncText.textContent =
      text || "";
  }

  if (lastSyncText && date) {
    lastSyncText.textContent =
      `آخرین همگام‌سازی: ${formatDateTime(date)}`;
  }
}

/* =========================================================
LOGIN
========================================================= */

async function loginWithToken(token) {
  token = String(token || "").trim();

  if (!token) {
    throw new Error(
      "لطفاً GitHub Token را وارد کنید."
    );
  }

  state.token = token;

  /*
  * اول بررسی می‌کنیم توکن واقعاً به ریپوی
  * amlaldot/file دسترسی دارد.
  */
  await verifyToken();

  /*
  * بعد فایل اصلی را می‌خوانیم.
  */
  const loaded = await loadFiles();

  if (!loaded) {
    throw new Error(
      "توکن معتبر است، اما اطلاعات فایل‌ها دریافت نشد."
    );
  }

  showApp();
  startPolling();
}

/* =========================================================
LOGOUT
========================================================= */

function logout() {
  stopPolling();

  state.token = null;
  state.files = [];
  state.currentFilter = "all";
  state.search = "";
  state.editingFileId = null;
  state.selectedFileId = null;
  state.renewFileId = null;
  state.lastSyncSha = null;

  closeAllModals();

  if ($("loginForm")) {
    $("loginForm").reset();
  }

  if ($("searchInput")) {
    $("searchInput").value = "";
  }

  showLogin();
  setLoginError("");
}

/* =========================================================
UI: LOGIN / APP
========================================================= */

function showLogin() {
  const loginScreen =
    $("loginScreen");
  const appScreen =
    $("appScreen");

  if (loginScreen) {
    loginScreen.classList.remove("hidden");
  }

  if (appScreen) {
    appScreen.classList.add("hidden");
  }
}

function showApp() {
  const loginScreen =
    $("loginScreen");
  const appScreen =
    $("appScreen");

  if (loginScreen) {
    loginScreen.classList.add("hidden");
  }

  if (appScreen) {
    appScreen.classList.remove("hidden");
  }
}

/* =========================================================
POLLING
========================================================= */

function startPolling() {
  stopPolling();

  state.pollTimer =
    setInterval(async () => {
      if (!state.token) {
        return;
      }

      await loadFiles({
        silent: true
      });
    }, CONFIG.pollInterval);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

/* =========================================================
FILE TYPES
========================================================= */

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

const KEY_HOLDER_LABELS = {
  owner: "مالک",
  tenant: "مستاجر",
  guard: "نگهبان",
  office: "دفتر",
  other: "سایر"
};

const CONDITION_LABELS = {
  new: "نوساز",
  unused: "کلید نخورده",
  renovated: "بازسازی‌شده",
  "not-renovated": "بازسازی‌نشده",
  renovating: "در حال بازسازی"
};

const OCCUPANCY_LABELS = {
  empty: "خالی",
  tenant: "مستاجر",
  owner: "مالک ساکن",
  evacuating: "در حال تخلیه"
};

const FAMILY_LABELS = {
  single: "مجرد",
  married: "متأهل",
  family: "خانوادگی"
};

const AMENITY_LABELS = {
  parking: "پارکینگ",
  elevator: "آسانسور",
  storage: "انباری",
  balcony: "بالکن",
  terrace: "تراس",
  yard: "حیاط",
  pool: "استخر",
  jacuzzi: "جکوزی",
  roof: "روف",
  lobby: "لابی",
  guard: "نگهبان",
  package: "پکیج",
  cooler: "کولر",
  "floor-heating": "گرمایش از کف",
  cabinet: "کابینت",
  closet: "کمد"
};

/* =========================================================
FILE HELPERS - BUG #1
========================================================= */

// BAAG: getFileData function is incomplete/missing important logic

function getFileData(file) {
  if (!file || typeof file !== "object") {
    return {};
  }

  if (file.data && typeof file.data === "object") {
    return file.data;
  }

  return file;
}

function getFileName(file) {
  const data = getFileData(file);
  return (
    data.name ||
    data.propertyName ||
    data.buyerName ||
    data.tenantName ||
    "بدون نام"
  );
}

function getFilePhone(file) {
  const data = getFileData(file);
  return data.phone ||
    data.propertyPhone ||
    data.buyerPhone ||
    data.tenantPhone ||
    "";
}

function getFileLocation(file) {
  const data = getFileData(file);
  return (
    data.location ||
    data.propertyLocation ||
    data.buyerLocation ||
    data.tenantLocation ||
    ""
  );
}

function isFollowUp(file) {
  if (!file) {
    return false;
  }

  if (
    file.status === "followup" ||
    file.status === "needs-followup"
  ) {
    return true;
  }

  if (!file.followUpDate) {
    return false;
  }

  const timestamp =
    new Date(file.followUpDate).getTime();

  return (
    Number.isFinite(timestamp) &&
    timestamp <= Date.now()
  );
}

/* =========================================================
FOLLOW-UP STATUS
========================================================= */

function updateFollowUpStatuses(saveChanges = false) {
  let changed = false;

  for (const file of state.files) {
    if (!file) {
      continue;
    }

    if (
      file.status === "archived" ||
      file.status === "done"
    ) {
      continue;
    }

    if (!file.followUpDate) {
      continue;
    }

    const deadline =
      new Date(
        file.followUpDate
      ).getTime();

    if (
      Number.isFinite(deadline) &&
      deadline <= Date.now() &&
      file.status !== "followup"
    ) {
      file.status = "followup";
      changed = true;
    }
  }

  updateFollowUpCount();

  /*
  * عمداً به‌صورت خودکار هر بار commit نمی‌کنیم،
  * چون صرفاً باز شدن سایت نباید بی‌دلیل commit بسازد.
  */
  if (saveChanges && changed) {
    commitFiles(
      state.files,
      "Update follow-up statuses"
    );
  }

  return changed;
}

function updateFollowUpCount() {
  const count =
    state.files.filter(
      (file) => isFollowUp(file)
    ).length;

  const element =
    $("followUpCount");

  if (element) {
    element.textContent =
      count.toLocaleString("fa-IR");
  }
}

/* =========================================================
FILTER
========================================================= */

function getFilteredFiles() {
  let result = [...state.files];

  if (state.currentFilter === "followup") {
    result = result.filter(
      (file) => isFollowUp(file)
    );
  } else if (
    state.currentFilter !== "all"
  ) {
    result = result.filter(
      (file) =>
        file.type === state.currentFilter
    );
  }

  const query =
    normalize(state.search);

  if (query) {
    result = result.filter(
      (file) => {
        const data =
          getFileData(file);

        const searchable = [
          file.id,
          file.type,
          file.status,
          data.name,
          data.propertyName,
          data.phone,
          data.propertyPhone,
          data.buyerName,
          data.buyerPhone,
          data.tenantName,
          data.tenantPhone,
          data.location,
          data.propertyLocation,
          data.buyerLocation,
          data.tenantLocation,
          data.region,
          data.propertyRegion
        ];

        return searchable.some(
          (value) =>
            normalize(value).includes(query)
        );
      }
    );
  }

  return result;
}

/* =========================================================
RENDER: HOME/LIST
========================================================= */

function renderHome() {
  const container = $("filesContainer");
  const empty = $("emptyState");

  if (!container) {
    return;
  }

  const filtered = getFilteredFiles();

  if (filtered.length === 0) {
    container.innerHTML = "";

    if (empty) {
      empty.classList.remove("hidden");
    }

    return;
  }

  if (empty) {
    empty.classList.add("hidden");
  }

  container.innerHTML = filtered
    .map(
      (file) => renderFileCard(file)
    )
    .join("");
}

/* =========================================================
RENDER: FILE CARD - BUG #2
========================================================= */

// BAAG: Missing proper HTML escaping and security issues

function renderFileCard(file) {
  const data = getFileData(file);
  const type = file.type || "sale";
  const status = file.status || "active";
  const updatedAtText = formatDate(file.updatedAt);

  const name = getFileName(file);
  const phone = getFilePhone(file);
  const location = getFileLocation(file);
  const propertyType = data.propertyType || "";
  const area = data.area || "";
  const rooms = data.rooms || "";

  const hasFollowUp = isFollowUp(file);

  const followUpBadge = hasFollowUp
    ? `<div class="followup-badge">
        پیگیری
      </div>`
    : "";

  return `
    <div
      class="file-card"
      data-file-id="${escapeHtml(file.id)}"
      role="button"
      tabindex="0"
    >
      <div class="card-top">
        <div>
          <div class="card-type">
            ${escapeHtml(TYPE_LABELS[type] || type)}
          </div>
          <div class="card-title">
            ${escapeHtml(name)}
          </div>
        </div>
        ${followUpBadge}
      </div>

      <div class="card-info">
        <div class="info-item">
          <div class="info-label">
            تلفن
          </div>
          <div class="info-value">
            ${escapeHtml(phone || "—")}
          </div>
        </div>

        <div class="info-item">
          <div class="info-label">
            موقعیت
          </div>
          <div class="info-value">
            ${escapeHtml(location || "—")}
          </div>
        </div>

        <div class="info-item">
          <div class="info-label">
            نوع ملک
          </div>
          <div class="info-value">
            ${escapeHtml(PROPERTY_TYPE_LABELS[propertyType] || propertyType || "—")}
          </div>
        </div>

        <div class="info-item">
          <div class="info-label">
            متراژ
          </div>
          <div class="info-value">
            ${escapeHtml(area ? `${area} متر` : "—")}
          </div>
        </div>
      </div>

      <div class="card-footer">
        <div>
          ${escapeHtml(updatedAtText)}
        </div>

        <div class="status-badge" style="background: ${getStatusColor(status)}">
          ${escapeHtml(getStatusLabel(status))}
        </div>
      </div>
    </div>
  `;
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

/* =========================================================
EVENTS: LOGIN
========================================================= */

async function setupLoginForm() {
  const form = $("loginForm");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    setLoginError("");

    const usernameInput = $("username");
    const passwordInput = $("password");
    const tokenInput = $("githubToken");

    const username = usernameInput?.value || "";
    const password = passwordInput?.value || "";
    const token = tokenInput?.value || "";

    if (!username || !password || !token) {
      setLoginError("لطفاً تمام فیلد‌ها را پر کنید.");
      return;
    }

    // BUG #3: Username and password not used, hardcoded check needed
    // BAAG: Username و password برای هیچ چیز استفاده نمی‌شن
    if (username !== "admin" || password !== "admin") {
      setLoginError("نام کاربری یا رمز عبور اشتباه است.");
      return;
    }

    try {
      await loginWithToken(token);
    } catch (error) {
      setLoginError(error.message);
    }
  });
}

/* =========================================================
EVENTS: TOP BAR
========================================================= */

function setupTopBar() {
  const newFileButton = $("newFileButton");
  const logoutButton = $("logoutButton");
  const followUpButton = $("followUpButton");
  const emptyNewFileButton = $("emptyNewFileButton");

  if (newFileButton) {
    newFileButton.addEventListener(
      "click",
      () => {
        state.editingFileId = null;
        openFileModal();
      }
    );
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }

  if (followUpButton) {
    followUpButton.addEventListener("click", () => {
      state.currentFilter = "followup";
      applyFilters();
    });
  }

  if (emptyNewFileButton) {
    emptyNewFileButton.addEventListener(
      "click",
      () => {
        state.editingFileId = null;
        openFileModal();
      }
    );
  }
}

/* =========================================================
EVENTS: SEARCH & FILTER
========================================================= */

function setupSearch() {
  const searchInput = $("searchInput");

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      (event) => {
        state.search = event.target?.value || "";
        renderHome();
      }
    );
  }
}

function setupFilters() {
  const buttons = document.querySelectorAll(
    ".filter-button"
  );

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.getAttribute("data-filter");

      if (filter) {
        state.currentFilter = filter;
        applyFilters();
      }
    });
  });
}

function applyFilters() {
  const buttons = document.querySelectorAll(
    ".filter-button"
  );

  buttons.forEach((button) => {
    const filter = button.getAttribute("data-filter");

    if (filter === state.currentFilter) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });

  renderHome();
}

/* =========================================================
MODAL: OPEN/CLOSE
========================================================= */

function openFileModal() {
  const modal = $("fileModal");

  if (!modal) {
    return;
  }

  modal.classList.remove("hidden");

  if (state.editingFileId) {
    loadFileIntoForm(state.editingFileId);
  } else {
    $("fileForm")?.reset();
  }
}

function closeFileModal() {
  const modal = $("fileModal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
  state.editingFileId = null;
}

function closeAllModals() {
  closeFileModal();
}

/* =========================================================
MODAL: FILE FORM SETUP
========================================================= */

function setupFileForm() {
  const form = $("fileForm");

  if (!form) {
    return;
  }

  // Type changes
  const typeRadios = form.querySelectorAll(
    'input[name="fileType"]'
  );

  typeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      updateFormVisibility();
    });
  });

  // Save form
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveFile();
  });

  // Initial visibility
  updateFormVisibility();
}

function updateFormVisibility() {
  const fileType = document.querySelector(
    'input[name="fileType"]:checked'
  )?.value || "sale";

  const buyerSection = $("buyerSection");
  const tenantSection = $("tenantSection");
  const propertyDetailsSection = $("propertyDetailsSection");
  const propertyFields = document.querySelectorAll(
    ".property-field"
  );
  const landlordOnlyFields = document.querySelectorAll(
    ".landlord-only"
  );
  const currentDepositField = $("currentDepositField");
  const currentRentField = $("currentRentField");
  const familySizeField = $("familySizeField");

  // Show/hide sections based on type
  if (buyerSection) {
    buyerSection.classList.toggle(
      "hidden",
      fileType !== "buyer"
    );
  }

  if (tenantSection) {
    tenantSection.classList.toggle(
      "hidden",
      fileType !== "tenant"
    );
  }

  // Property details for sale and landlord
  if (propertyDetailsSection) {
    propertyDetailsSection.classList.toggle(
      "hidden",
      fileType === "buyer" || fileType === "tenant"
    );
  }

  // Property fields for sale and landlord
  propertyFields.forEach((field) => {
    field.classList.toggle(
      "hidden",
      fileType === "buyer" || fileType === "tenant"
    );
  });

  // Landlord-only fields
  landlordOnlyFields.forEach((field) => {
    field.classList.toggle(
      "hidden",
      fileType !== "landlord"
    );
  });

  // Occupancy-based fields
  const occupancy = document.querySelector(
    '#occupancy'
  )?.value || "";

  if (currentDepositField) {
    currentDepositField.classList.toggle(
      "hidden",
      occupancy !== "tenant"
    );
  }

  if (currentRentField) {
    currentRentField.classList.toggle(
      "hidden",
      occupancy !== "tenant"
    );
  }

  // Family size for tenant
  if (familySizeField) {
    const familyStatus = document.querySelector(
      '#familyStatus'
    )?.value || "";

    familySizeField.classList.toggle(
      "hidden",
      familyStatus !== "family"
    );
  }
}

/* =========================================================
FILE FORM: SAVE
========================================================= */

// BUG #4: File IDs not properly generated
// BAAG: شناسه فایل ها درست ایجاد نمی‌شن

async function saveFile() {
  const form = $("fileForm");

  if (!form) {
    return;
  }

  // Get file type
  const fileType = document.querySelector(
    'input[name="fileType"]:checked'
  )?.value || "sale";

  // Common fields
  const name = ($("name")?.value || "").trim();
  const phone = ($("phone")?.value || "").trim();
  const propertyType = $("propertyType")?.value || "";
  const area = $("area")?.value || "";
  const rooms = $("rooms")?.value || "";
  const year = $("year")?.value || "";
  const location = ($("location")?.value || "").trim();

  // Property details
  const keyHolder = $("keyHolder")?.value || "";
  const condition = $("condition")?.value || "";
  const occupancy = $("occupancy")?.value || "";
  const currentDeposit = $("currentDeposit")?.value || "";
  const currentRent = $("currentRent")?.value || "";
  const suggestedDeposit = $("suggestedDeposit")?.value || "";
  const suggestedRent = $("suggestedRent")?.value || "";

  // Buyer fields
  const capital = $("capital")?.value || "";
  const buyerNotes = ($("buyerNotes")?.value || "").trim();

  // Tenant fields
  const tenantDeposit = $("tenantDeposit")?.value || "";
  const tenantRent = $("tenantRent")?.value || "";
  const familyStatus = $("familyStatus")?.value || "";
  const familySize = $("familySize")?.value || "";
  const tenantNotes = ($("tenantNotes")?.value || "").trim();

  // Amenities
  const amenities = Array.from(
    document.querySelectorAll(
      ".amenity:checked"
    )
  ).map((checkbox) => checkbox.value);

  // Validation
  if (!name) {
    showToast("لطفاً نام را وارد کنید.", "error");
    return;
  }

  if (!phone) {
    showToast("لطفاً تلفن را وارد کنید.", "error");
    return;
  }

  // Create file object
  const fileData = {
    id: state.editingFileId || generateFileId(),
    type: fileType,
    status: "active",
    createdAt: state.editingFileId
      ? undefined
      : new Date().toISOString(),
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

  // Save
  let newFiles;

  if (state.editingFileId) {
    // Update existing
    newFiles = state.files.map((file) =>
      file.id === state.editingFileId
        ? { ...file, ...fileData }
        : file
    );
  } else {
    // Add new
    newFiles = [...state.files, fileData];
  }

  const success = await commitFiles(
    newFiles,
    state.editingFileId
      ? `Update file ${fileData.id}`
      : `Create new file ${fileData.id}`
  );

  if (success) {
    closeFileModal();
  }
}

function generateFileId() {
  // BUG: This generates non-unique IDs
  // BAAG: این روش شناسه‌های غیر منحصر به فرد می‌سازد
  return `file-${Date.now()}`;
}

/* =========================================================
FILE FORM: LOAD
========================================================= */

function loadFileIntoForm(fileId) {
  const file = state.files.find((f) => f.id === fileId);

  if (!file) {
    return;
  }

  const data = getFileData(file);

  // Set type
  const typeRadio = document.querySelector(
    `input[name="fileType"][value="${file.type || "sale"}"]`
  );

  if (typeRadio) {
    typeRadio.checked = true;
  }

  // Set common fields
  if ($("name")) $("name").value = data.name || "";
  if ($("phone")) $("phone").value = data.phone || "";
  if ($("propertyType"))
    $("propertyType").value = data.propertyType || "";
  if ($("area")) $("area").value = data.area || "";
  if ($("rooms")) $("rooms").value = data.rooms || "";
  if ($("year")) $("year").value = data.year || "";
  if ($("location")) $("location").value = data.location || "";

  // Set property details
  if ($("keyHolder"))
    $("keyHolder").value = data.keyHolder || "";
  if ($("condition"))
    $("condition").value = data.condition || "";
  if ($("occupancy"))
    $("occupancy").value = data.occupancy || "";
  if ($("currentDeposit"))
    $("currentDeposit").value = data.currentDeposit || "";
  if ($("currentRent"))
    $("currentRent").value = data.currentRent || "";
  if ($("suggestedDeposit"))
    $("suggestedDeposit").value = data.suggestedDeposit || "";
  if ($("suggestedRent"))
    $("suggestedRent").value = data.suggestedRent || "";

  // Set buyer fields
  if ($("capital")) $("capital").value = data.capital || "";
  if ($("buyerNotes"))
    $("buyerNotes").value = data.buyerNotes || "";

  // Set tenant fields
  if ($("tenantDeposit"))
    $("tenantDeposit").value = data.tenantDeposit || "";
  if ($("tenantRent"))
    $("tenantRent").value = data.tenantRent || "";
  if ($("familyStatus"))
    $("familyStatus").value = data.familyStatus || "";
  if ($("familySize"))
    $("familySize").value = data.familySize || "";
  if ($("tenantNotes"))
    $("tenantNotes").value = data.tenantNotes || "";

  // Set amenities
  document.querySelectorAll(".amenity").forEach((checkbox) => {
    checkbox.checked =
      (data.amenities || []).includes(
        checkbox.value
      );
  });

  // Update form visibility
  updateFormVisibility();
}

/* =========================================================
FILE CARD: CLICK
========================================================= */

document.addEventListener("click", (event) => {
  const fileCard = event.target?.closest(
    ".file-card"
  );

  if (!fileCard) {
    return;
  }

  const fileId = fileCard.getAttribute(
    "data-file-id"
  );

  if (!fileId) {
    return;
  }

  state.editingFileId = fileId;
  openFileModal();
});

/* =========================================================
MODAL: CLOSE BUTTON
========================================================= */

function setupModalClose() {
  const closeButton = $("closeModalButton");
  const backdrop = $("fileModal");

  if (closeButton) {
    closeButton.addEventListener("click", closeFileModal);
  }

  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeFileModal();
      }
    });
  }
}

/* =========================================================
ON LOAD
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  setupLoginForm();
  setupTopBar();
  setupSearch();
  setupFilters();
  setupFileForm();
  setupModalClose();

  // Intercept form changes to update visibility
  document.addEventListener("change", (event) => {
    if (
      event.target?.id === "occupancy" ||
      event.target?.id === "familyStatus"
    ) {
      updateFormVisibility();
    }
  });
});

/* =========================================================
EXPORT FOR TESTING
========================================================= */

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    generateFileId,
    getFileData,
    escapeHtml,
    normalize
  };
}
