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
   FILE HELPERS
========================================================= */

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

                    data.propertyType,
                    data.area,
                    data.rooms,
                    data.year,

                    data.notes,
                    data.buyerNotes,
                    data.tenantNotes,

                    data.capital,
                    data.tenantDeposit,
                    data.tenantRent,
                    data.suggestedDeposit,
                    data.suggestedRent
                ]
                    .filter(
                        (value) =>
                            value !== null &&
                            value !== undefined
                    )
                    .map(normalize)
                    .join(" ");

                return searchable.includes(query);
            }
        );
    }

    result.sort(
        (a, b) => {
            const aDate =
                new Date(
                    a.updatedAt ||
                    a.createdAt ||
                    0
                ).getTime();

            const bDate =
                new Date(
                    b.updatedAt ||
                    b.createdAt ||
                    0
                ).getTime();

            return bDate - aDate;
        }
    );

    return result;
}


/* =========================================================
   RENDER HOME
========================================================= */

function renderHome() {
    renderFiles();
    updateFollowUpCount();
    updateFileCount();
}


function updateFileCount() {
    const element =
        $("fileCountText");

    if (!element) {
        return;
    }

    const count =
        getFilteredFiles().length;

    element.textContent =
        `${count.toLocaleString("fa-IR")} فایل`;
}


function renderFiles() {
    const container =
        $("filesContainer");

    const emptyState =
        $("emptyState");

    if (!container) {
        return;
    }

    const files =
        getFilteredFiles();

    container.innerHTML = "";

    if (!files.length) {
        if (emptyState) {
            emptyState.classList.remove(
                "hidden"
            );
        }

        return;
    }

    if (emptyState) {
        emptyState.classList.add(
            "hidden"
        );
    }

    for (const file of files) {
        container.insertAdjacentHTML(
            "beforeend",
            createFileCard(file)
        );
    }
}


/* =========================================================
   FILE CARD
========================================================= */

function createFileCard(file) {
    const data =
        getFileData(file);

    const type =
        TYPE_LABELS[file.type] ||
        "فایل";

    const name =
        getFileName(file);

    const phone =
        getFilePhone(file);

    const location =
        getFileLocation(file);

    const followUp =
        isFollowUp(file);

    let meta = [];

    if (data.propertyType) {
        meta.push(
            PROPERTY_TYPE_LABELS[
                data.propertyType
            ] ||
            data.propertyType
        );
    }

    if (data.area) {
        meta.push(
            `${formatNumber(data.area)} متر`
        );
    }

    if (data.rooms) {
        meta.push(
            `${formatNumber(data.rooms)} خواب`
        );
    }

    if (location) {
        meta.push(location);
    }

    let money = "";

    if (
        file.type === "sale" &&
        data.price
    ) {
        money =
            formatMoney(data.price);
    }

    if (
        file.type === "landlord" &&
        (
            data.suggestedDeposit ||
            data.suggestedRent
        )
    ) {
        money = [
            data.suggestedDeposit
                ? `رهن ${formatMoney(data.suggestedDeposit)}`
                : "",
            data.suggestedRent
                ? `اجاره ${formatMoney(data.suggestedRent)}`
                : ""
        ]
            .filter(Boolean)
            .join(" / ");
    }

    if (
        file.type === "buyer" &&
        data.capital
    ) {
        money =
            `سرمایه ${formatMoney(data.capital)}`;
    }

    if (
        file.type === "tenant" &&
        (
            data.tenantDeposit ||
            data.tenantRent
        )
    ) {
        money = [
            data.tenantDeposit
                ? `ودیعه ${formatMoney(data.tenantDeposit)}`
                : "",
            data.tenantRent
                ? `اجاره ${formatMoney(data.tenantRent)}`
                : ""
        ]
            .filter(Boolean)
            .join(" / ");
    }

    return `
        <article
            class="file-card ${followUp ? "is-followup" : ""}"
            data-file-id="${escapeHtml(file.id)}"
        >
            <div class="file-card-top">
                <div>
                    <div class="file-type">
                        ${escapeHtml(type)}
                    </div>

                    <h3>
                        ${escapeHtml(name)}
                    </h3>
                </div>

                ${
                    followUp
                        ? `
                            <span class="status-badge">
                                نیاز به پیگیری
                            </span>
                          `
                        : ""
                }
            </div>

            ${
                meta.length
                    ? `
                        <div class="file-meta">
                            ${meta
                                .map(
                                    (item) =>
                                        `<span>${escapeHtml(item)}</span>`
                                )
                                .join("")}
                        </div>
                      `
                    : ""
            }

            ${
                money
                    ? `
                        <div class="file-money">
                            ${escapeHtml(money)}
                        </div>
                      `
                    : ""
            }

            ${
                phone
                    ? `
                        <div class="file-phone" dir="ltr">
                            ${escapeHtml(phone)}
                        </div>
                      `
                    : ""
            }

            <div class="file-card-footer">
                <span>
                    ${
                        file.followUpDate
                            ? `پیگیری: ${formatDate(file.followUpDate)}`
                            : "بدون پیگیری"
                    }
                </span>

                <button
                    type="button"
                    class="ghost-button view-file-button"
                    data-file-id="${escapeHtml(file.id)}"
                >
                    مشاهده
                </button>
            </div>
        </article>
    `;
}


/* =========================================================
   MODAL: NEW FILE
========================================================= */

function openNewFileModal() {
    state.editingFileId = null;

    const form =
        $("fileForm");

    if (form) {
        form.reset();
    }

    const editing =
        $("editingFileId");

    if (editing) {
        editing.value = "";
    }

    const followUpDays =
        $("followUpDays");

    if (followUpDays) {
        followUpDays.value = "10";
    }

    const firstType =
        document.querySelector(
            'input[name="fileType"][value="sale"]'
        );

    if (firstType) {
        firstType.checked = true;
    }

    updateFormVisibility();

    if ($("modalEyebrow")) {
        $("modalEyebrow").textContent =
            "فایل جدید";
    }

    if ($("modalTitle")) {
        $("modalTitle").textContent =
            "ثبت فایل";
    }

    openModal("fileModal");
}


/* =========================================================
   MODAL: EDIT FILE
========================================================= */

function openEditFileModal(id) {
    const file =
        state.files.find(
            (item) =>
                String(item.id) === String(id)
        );

    if (!file) {
        showToast(
            "فایل پیدا نشد.",
            "error"
        );
        return;
    }

    const data =
        getFileData(file);

    state.editingFileId =
        String(file.id);

    const form =
        $("fileForm");

    if (form) {
        form.reset();
    }

    const editing =
        $("editingFileId");

    if (editing) {
        editing.value =
            String(file.id);
    }

    const typeInput =
        document.querySelector(
            `input[name="fileType"][value="${file.type}"]`
        );

    if (typeInput) {
        typeInput.checked = true;
    }

    setValue("name", data.name || "");
    setValue("phone", data.phone || "");
    setValue(
        "propertyType",
        data.propertyType || "apartment"
    );
    setValue("area", data.area || "");
    setValue("rooms", data.rooms || "");
    setValue("year", data.year || "");
    setValue("location", data.location || "");

    setValue(
        "keyHolder",
        data.keyHolder || "owner"
    );

    setValue(
        "condition",
        data.condition || "new"
    );

    setValue(
        "occupancy",
        data.occupancy || "empty"
    );

    setValue(
        "currentDeposit",
        data.currentDeposit || ""
    );

    setValue(
        "currentRent",
        data.currentRent || ""
    );

    setValue(
        "suggestedDeposit",
        data.suggestedDeposit || ""
    );

    setValue(
        "suggestedRent",
        data.suggestedRent || ""
    );

    setValue(
        "capital",
        data.capital || ""
    );

    setValue(
        "buyerNotes",
        data.buyerNotes || ""
    );

    setValue(
        "tenantDeposit",
        data.tenantDeposit || ""
    );

    setValue(
        "tenantRent",
        data.tenantRent || ""
    );

    setValue(
        "familyStatus",
        data.familyStatus || "single"
    );

    setValue(
        "familySize",
        data.familySize || ""
    );

    setValue(
        "tenantNotes",
        data.tenantNotes || ""
    );

    setValue(
        "followUpDays",
        file.followUpDays || 10
    );

    const amenities =
        Array.isArray(data.amenities)
            ? data.amenities
            : [];

    document
        .querySelectorAll(".amenity")
        .forEach(
            (checkbox) => {
                checkbox.checked =
                    amenities.includes(
                        checkbox.value
                    );
            }
        );

    updateFormVisibility();

    if ($("modalEyebrow")) {
        $("modalEyebrow").textContent =
            "ویرایش فایل";
    }

    if ($("modalTitle")) {
        $("modalTitle").textContent =
            "ویرایش فایل";
    }

    closeModal("detailModal");
    openModal("fileModal");
}


/* =========================================================
   FORM HELPERS
========================================================= */

function setValue(id, value) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.value =
        value === null ||
        value === undefined
            ? ""
            : value;
}


function getValue(id) {
    const element = $(id);

    if (!element) {
        return "";
    }

    return element.value.trim();
}


function getNumberValue(id) {
    const value =
        getValue(id);

    if (!value) {
        return null;
    }

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}


/* =========================================================
   FORM VISIBILITY
========================================================= */

function getSelectedFileType() {
    const selected =
        document.querySelector(
            'input[name="fileType"]:checked'
        );

    return selected
        ? selected.value
        : "sale";
}


function updateFormVisibility() {
    const type =
        getSelectedFileType();

    const propertyDetails =
        $("propertyDetailsSection");

    const buyerSection =
        $("buyerSection");

    const tenantSection =
        $("tenantSection");

    const amenitiesSection =
        $("amenitiesSection");

    const landlordFields =
        document.querySelectorAll(
            ".landlord-only"
        );

    const currentDepositField =
        $("currentDepositField");

    const currentRentField =
        $("currentRentField");

    const occupancy =
        getValue("occupancy");

    if (buyerSection) {
        buyerSection.classList.toggle(
            "hidden",
            type !== "buyer"
        );
    }

    if (tenantSection) {
        tenantSection.classList.toggle(
            "hidden",
            type !== "tenant"
        );
    }

    if (propertyDetails) {
        propertyDetails.classList.toggle(
            "hidden",
            type === "buyer" ||
            type === "tenant"
        );
    }

    if (amenitiesSection) {
        amenitiesSection.classList.toggle(
            "hidden",
            type === "buyer" ||
            type === "tenant"
        );
    }

    landlordFields.forEach(
        (element) => {
            element.classList.toggle(
                "hidden",
                type !== "landlord"
            );
        }
    );

    const showCurrentRent =
        type === "landlord" &&
        occupancy === "tenant";

    if (currentDepositField) {
        currentDepositField.classList.toggle(
            "hidden",
            !showCurrentRent
        );
    }

    if (currentRentField) {
        currentRentField.classList.toggle(
            "hidden",
            !showCurrentRent
        );
    }

    const familyStatus =
        getValue("familyStatus");

    const familySizeField =
        $("familySizeField");

    if (familySizeField) {
        familySizeField.classList.toggle(
            "hidden",
            type !== "tenant" ||
            familyStatus !== "family"
        );
    }
}


/* =========================================================
   COLLECT FORM DATA
========================================================= */

function collectFormData() {
    const type =
        getSelectedFileType();

    const now =
        new Date().toISOString();

    const editingId =
        state.editingFileId;

    const oldFile =
        editingId
            ? state.files.find(
                  (file) =>
                      String(file.id) ===
                      String(editingId)
              )
            : null;

    const followUpDays =
        Math.max(
            1,
            Number(
                getValue("followUpDays")
            ) || 10
        );

    let followUpDate;

    if (
        oldFile &&
        oldFile.followUpDate
    ) {
        /*
         * هنگام ویرایش، مدت پیگیری جدید
         * از همین لحظه محاسبه می‌شود.
         */
        const date =
            new Date();

        date.setDate(
            date.getDate() +
            followUpDays
        );

        followUpDate =
            date.toISOString();

    } else {
        const date =
            new Date();

        date.setDate(
            date.getDate() +
            followUpDays
        );

        followUpDate =
            date.toISOString();
    }

    const amenities =
        Array.from(
            document.querySelectorAll(
                ".amenity:checked"
            )
        ).map(
            (checkbox) =>
                checkbox.value
        );

    const data = {
        name: getValue("name"),
        phone: getValue("phone"),

        propertyType:
            getValue("propertyType"),

        area:
            getNumberValue("area"),

        rooms:
            getNumberValue("rooms"),

        year:
            getNumberValue("year"),

        location:
            getValue("location"),

        keyHolder:
            getValue("keyHolder"),

        condition:
            getValue("condition"),

        occupancy:
            getValue("occupancy"),

        currentDeposit:
            getNumberValue("currentDeposit"),

        currentRent:
            getNumberValue("currentRent"),

        suggestedDeposit:
            getNumberValue("suggestedDeposit"),

        suggestedRent:
            getNumberValue("suggestedRent"),

        capital:
            getNumberValue("capital"),

        buyerNotes:
            getValue("buyerNotes"),

        tenantDeposit:
            getNumberValue("tenantDeposit"),

        tenantRent:
            getNumberValue("tenantRent"),

        familyStatus:
            getValue("familyStatus"),

        familySize:
            getNumberValue("familySize"),

        tenantNotes:
            getValue("tenantNotes"),

        amenities
    };

    /*
     * برای جست‌وجوی راحت‌تر، نام مخصوص
     * هر نوع فایل را هم ذخیره می‌کنیم.
     */
    if (type === "buyer") {
        data.name =
            data.name ||
            getValue("name");
    }

    if (type === "tenant") {
        data.name =
            data.name ||
            getValue("name");
    }

    const file = {
        id:
            editingId ||
            createId(),

        type,

        data,

        status:
            oldFile?.status === "done"
                ? "done"
                : "active",

        followUpDays,

        followUpDate,

        createdAt:
            oldFile?.createdAt ||
            now,

        updatedAt:
            now
    };

    return file;
}


/* =========================================================
   CREATE ID
========================================================= */

function createId() {
    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .slice(2, 9)
    );
}


/* =========================================================
   SAVE FORM
========================================================= */

async function handleFileSubmit(event) {
    event.preventDefault();

    if (state.isSaving) {
        return;
    }

    const file =
        collectFormData();

    const name =
        getFileName(file);

    if (!name) {
        showToast(
            "لطفاً نام فایل را وارد کنید.",
            "warning"
        );

        const nameInput =
            $("name");

        if (nameInput) {
            nameInput.focus();
        }

        return;
    }

    const isEditing =
        Boolean(
            state.editingFileId
        );

    let newFiles;

    if (isEditing) {
        newFiles =
            state.files.map(
                (item) =>
                    String(item.id) ===
                    String(file.id)
                        ? file
                        : item
            );
    } else {
        newFiles = [
            file,
            ...state.files
        ];
    }

    const success =
        await commitFiles(
            newFiles,
            isEditing
                ? `Update real estate file ${file.id}`
                : `Create real estate file ${file.id}`
        );

    if (!success) {
        return;
    }

    closeModal("fileModal");

    state.editingFileId = null;

    renderHome();
}


/* =========================================================
   DELETE
========================================================= */

async function deleteSelectedFile() {
    const id =
        state.selectedFileId;

    if (!id) {
        return;
    }

    const file =
        state.files.find(
            (item) =>
                String(item.id) ===
                String(id)
        );

    if (!file) {
        return;
    }

    const name =
        getFileName(file);

    const confirmed =
        window.confirm(
            `آیا از حذف فایل «${name}» مطمئن هستید؟`
        );

    if (!confirmed) {
        return;
    }

    const newFiles =
        state.files.filter(
            (item) =>
                String(item.id) !==
                String(id)
        );

    const success =
        await commitFiles(
            newFiles,
            `Delete real estate file ${id}`
        );

    if (!success) {
        return;
    }

    state.selectedFileId = null;

    closeModal("detailModal");

    renderHome();
}


/* =========================================================
   DETAIL MODAL
========================================================= */

function openDetailModal(id) {
    const file =
        state.files.find(
            (item) =>
                String(item.id) ===
                String(id)
        );

    if (!file) {
        showToast(
            "فایل پیدا نشد.",
            "error"
        );
        return;
    }

    state.selectedFileId =
        String(file.id);

    renderDetail(file);

    openModal("detailModal");
}


function renderDetail(file) {
    const data =
        getFileData(file);

    const type =
        TYPE_LABELS[file.type] ||
        "فایل";

    const title =
        getFileName(file);

    if ($("detailType")) {
        $("detailType").textContent =
            type;
    }

    if ($("detailTitle")) {
        $("detailTitle").textContent =
            title;
    }

    const content =
        $("detailContent");

    if (!content) {
        return;
    }

    let html = "";

    html += detailSection(
        "اطلاعات اصلی",
        [
            detailItem(
                "نام",
                data.name
            ),
            detailItem(
                "شماره تماس",
                data.phone,
                true
            ),
            detailItem(
                "موقعیت",
                data.location
            ),
            detailItem(
                "نوع ملک",
                PROPERTY_TYPE_LABELS[
                    data.propertyType
                ] ||
                data.propertyType
            ),
            detailItem(
                "متراژ",
                data.area
                    ? `${formatNumber(data.area)} متر`
                    : ""
            ),
            detailItem(
                "تعداد خواب",
                data.rooms !== null &&
                data.rooms !== undefined &&
                data.rooms !== ""
                    ? formatNumber(
                          data.rooms
                      )
                    : ""
            ),
            detailItem(
                "سال ساخت",
                data.year
            )
        ]
    );

    if (
        file.type === "sale" ||
        file.type === "landlord"
    ) {
        html += detailSection(
            "وضعیت ملک",
            [
                detailItem(
                    "کلید دست",
                    KEY_HOLDER_LABELS[
                        data.keyHolder
                    ] ||
                    data.keyHolder
                ),
                detailItem(
                    "وضعیت ملک",
                    CONDITION_LABELS[
                        data.condition
                    ] ||
                    data.condition
                ),
                detailItem(
                    "وضعیت سکونت",
                    OCCUPANCY_LABELS[
                        data.occupancy
                    ] ||
                    data.occupancy
                ),
                detailItem(
                    "ودیعه فعلی",
                    data.currentDeposit
                        ? formatMoney(
                              data.currentDeposit
                          )
                        : ""
                ),
                detailItem(
                    "اجاره فعلی",
                    data.currentRent
                        ? formatMoney(
                              data.currentRent
                          )
                        : ""
                ),
                detailItem(
                    "ودیعه پیشنهادی",
                    data.suggestedDeposit
                        ? formatMoney(
                              data.suggestedDeposit
                          )
                        : ""
                ),
                detailItem(
                    "اجاره پیشنهادی",
                    data.suggestedRent
                        ? formatMoney(
                              data.suggestedRent
                          )
                        : ""
                )
            ]
        );
    }


    if (file.type === "buyer") {
        html += detailSection(
            "مشخصات خرید",
            [
                detailItem(
                    "سرمایه",
                    data.capital
                        ? formatMoney(
                              data.capital
                          )
                        : ""
                ),
                detailItem(
                    "توضیحات",
                    data.buyerNotes,
                    false,
                    true
                )
            ]
        );
    }


    if (file.type === "tenant") {
        html += detailSection(
            "مشخصات مستاجر",
            [
                detailItem(
                    "ودیعه",
                    data.tenantDeposit
                        ? formatMoney(
                              data.tenantDeposit
                          )
                        : ""
                ),
                detailItem(
                    "اجاره",
                    data.tenantRent
                        ? formatMoney(
                              data.tenantRent
                          )
                        : ""
                ),
                detailItem(
                    "وضعیت خانوادگی",
                    FAMILY_LABELS[
                        data.familyStatus
                    ] ||
                    data.familyStatus
                ),
                detailItem(
                    "تعداد نفرات",
                    data.familySize
                        ? formatNumber(
                              data.familySize
                          )
                        : ""
                ),
                detailItem(
                    "توضیحات",
                    data.tenantNotes,
                    false,
                    true
                )
            ]
        );
    }


    if (
        Array.isArray(data.amenities) &&
        data.amenities.length
    ) {
        html += detailSection(
            "امکانات",
            [
                `
                <div class="detail-item field-full">
                    <span class="detail-label">
                        امکانات
                    </span>
                    <div class="amenity-tags">
                        ${
                            data.amenities
                                .map(
                                    (amenity) =>
                                        `<span>${escapeHtml(
                                            AMENITY_LABELS[
                                                amenity
                                            ] ||
                                            amenity
                                        )}</span>`
                                )
                                .join("")
                        }
                    </div>
                </div>
                `
            ]
        );
    }


    html += detailSection(
        "پیگیری",
        [
            detailItem(
                "وضعیت",
                isFollowUp(file)
                    ? "نیاز به پیگیری"
                    : "فعال"
            ),
            detailItem(
                "تاریخ پیگیری",
                file.followUpDate
                    ? formatDate(
                          file.followUpDate
                      )
                    : ""
            ),
            detailItem(
                "آخرین ویرایش",
                file.updatedAt
                    ? formatDateTime(
                          file.updatedAt
                      )
                    : ""
            )
        ]
    );

    content.innerHTML =
        html;
}


function detailSection(
    title,
    items
) {
    return `
        <section class="detail-section">
            <h3>
                ${escapeHtml(title)}
            </h3>

            <div class="detail-grid">
                ${items.join("")}
            </div>
        </section>
    `;
}


function detailItem(
    label,
    value,
    ltr = false,
    full = false
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "";
    }

    return `
        <div
            class="detail-item ${full ? "field-full" : ""}"
        >
            <span class="detail-label">
                ${escapeHtml(label)}
            </span>

            <span
                class="detail-value"
                ${ltr ? 'dir="ltr"' : ""}
            >
                ${escapeHtml(value)}
            </span>
        </div>
    `;
}


/* =========================================================
   RENEW FOLLOW-UP
========================================================= */

function openRenewModal() {
    if (!state.selectedFileId) {
        return;
    }

    const file =
        state.files.find(
            (item) =>
                String(item.id) ===
                String(state.selectedFileId)
        );

    if (!file) {
        return;
    }

    state.renewFileId =
        String(file.id);

    if ($("renewTitle")) {
        $("renewTitle").textContent =
            `تمدید پیگیری — ${getFileName(file)}`;
    }

    openModal("renewModal");
}


async function renewFollowUp(days) {
    const id =
        state.renewFileId;

    if (!id) {
        return;
    }

    const file =
        state.files.find(
            (item) =>
                String(item.id) ===
                String(id)
        );

    if (!file) {
        return;
    }

    const date =
        new Date();

    date.setDate(
        date.getDate() +
        Number(days)
    );

    const updatedFile = {
        ...file,

        status: "active",

        followUpDays:
            Number(days),

        followUpDate:
            date.toISOString(),

        updatedAt:
            new Date().toISOString()
    };

    const newFiles =
        state.files.map(
            (item) =>
                String(item.id) ===
                String(id)
                    ? updatedFile
                    : item
        );

    const success =
        await commitFiles(
            newFiles,
            `Renew follow-up ${id}`
        );

    if (!success) {
        return;
    }

    closeModal("renewModal");

    state.renewFileId = null;

    renderHome();

    if (state.selectedFileId) {
        const updated =
            state.files.find(
                (item) =>
                    String(item.id) ===
                    String(
                        state.selectedFileId
                    )
            );

        if (updated) {
            renderDetail(updated);
        }
    }
}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {
    const modal = $(id);

    if (!modal) {
        return;
    }

    modal.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "modal-open"
    );
}


function closeModal(id) {
    const modal = $(id);

    if (!modal) {
        return;
    }

    modal.classList.add(
        "hidden"
    );

    const anyOpen =
        document.querySelector(
            ".modal:not(.hidden)"
        );

    if (!anyOpen) {
        document.body.classList.remove(
            "modal-open"
        );
    }
}


function closeAllModals() {
    document
        .querySelectorAll(".modal")
        .forEach(
            (modal) =>
                modal.classList.add(
                    "hidden"
                )
        );

    document.body.classList.remove(
        "modal-open"
    );
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEvents() {

    /* LOGIN */

    const loginForm =
        $("loginForm");

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();

                setLoginError("");

                const tokenInput =
                    $("githubToken");

                const button =
                    loginForm.querySelector(
                        'button[type="submit"]'
                    );

                const token =
                    tokenInput
                        ? tokenInput.value
                        : "";

                if (button) {
                    button.disabled = true;
                    button.textContent =
                        "در حال ورود...";
                }

                try {
                    await loginWithToken(
                        token
                    );

                    if (tokenInput) {
                        /*
                         * بعد از ورود، مقدار input را پاک می‌کنیم.
                         * خود توکن همچنان فقط داخل state حافظه است.
                         */
                        tokenInput.value = "";
                    }

                } catch (error) {
                    console.error(error);

                    state.token = null;

                    setLoginError(
                        error.message ||
                        "ورود انجام نشد."
                    );

                } finally {
                    if (button) {
                        button.disabled = false;
                        button.textContent =
                            "ورود";
                    }
                }
            }
        );
    }


    /* LOGOUT */

    const logoutButton =
        $("logoutButton");

    if (logoutButton) {
        logoutButton.addEventListener(
            "click",
            logout
        );
    }


    /* NEW FILE */

    const newFileButton =
        $("newFileButton");

    if (newFileButton) {
        newFileButton.addEventListener(
            "click",
            openNewFileModal
        );
    }


    const emptyNewFileButton =
        $("emptyNewFileButton");

    if (emptyNewFileButton) {
        emptyNewFileButton.addEventListener(
            "click",
            openNewFileModal
        );
    }


    /* FILE FORM */

    const fileForm =
        $("fileForm");

    if (fileForm) {
        fileForm.addEventListener(
            "submit",
            handleFileSubmit
        );
    }


    /* CLOSE FILE MODAL */

    const closeModalButton =
        $("closeModalButton");

    if (closeModalButton) {
        closeModalButton.addEventListener(
            "click",
            () =>
                closeModal(
                    "fileModal"
                )
        );
    }


    const cancelFormButton =
        $("cancelFormButton");

    if (cancelFormButton) {
        cancelFormButton.addEventListener(
            "click",
            () =>
                closeModal(
                    "fileModal"
                )
        );
    }


    /* DETAIL */

    const closeDetailButton =
        $("closeDetailButton");

    if (closeDetailButton) {
        closeDetailButton.addEventListener(
            "click",
            () =>
                closeModal(
                    "detailModal"
                )
        );
    }


    const editDetailButton =
        $("editDetailButton");

    if (editDetailButton) {
        editDetailButton.addEventListener(
            "click",
            () => {
                if (
                    state.selectedFileId
                ) {
                    openEditFileModal(
                        state.selectedFileId
                    );
                }
            }
        );
    }


    const deleteDetailButton =
        $("deleteDetailButton");

    if (deleteDetailButton) {
        deleteDetailButton.addEventListener(
            "click",
            deleteSelectedFile
        );
    }


    const renewDetailButton =
        $("renewDetailButton");

    if (renewDetailButton) {
        renewDetailButton.addEventListener(
            "click",
            openRenewModal
        );
    }


    /* RENEW */

    const closeRenewButton =
        $("closeRenewButton");

    if (closeRenewButton) {
        closeRenewButton.addEventListener(
            "click",
            () =>
                closeModal(
                    "renewModal"
                )
        );
    }


    document
        .querySelectorAll(
            ".renew-button"
        )
        .forEach(
            (button) => {
                button.addEventListener(
                    "click",
                    () => {
                        const days =
                            Number(
                                button.dataset.days
                            );

                        renewFollowUp(
                            days
                        );
                    }
                );
            }
        );


    /* SEARCH */

    const searchInput =
        $("searchInput");

    if (searchInput) {
        searchInput.addEventListener(
            "input",
            () => {
                state.search =
                    searchInput.value;

                renderHome();
            }
        );
    }


    /* FILTERS */

    document
        .querySelectorAll(
            ".filter-button"
        )
        .forEach(
            (button) => {
                button.addEventListener(
                    "click",
                    () => {
                        document
                            .querySelectorAll(
                                ".filter-button"
                            )
                            .forEach(
                                (item) =>
                                    item.classList.remove(
                                        "active"
                                    )
                            );

                        button.classList.add(
                            "active"
                        );

                        state.currentFilter =
                            button.dataset.filter ||
                            "all";

                        renderHome();
                    }
                );
            }
        );


    /* FOLLOW-UP */

    const followUpButton =
        $("followUpButton");

    if (followUpButton) {
        followUpButton.addEventListener(
            "click",
            () => {
                state.currentFilter =
                    "followup";

                document
                    .querySelectorAll(
                        ".filter-button"
                    )
                    .forEach(
                        (button) => {
                            button.classList.toggle(
                                "active",
                                button.dataset.filter ===
                                    "followup"
                            );
                        }
                    );

                renderHome();
            }
        );
    }


    /* TYPE CHANGE */

    document
        .querySelectorAll(
            'input[name="fileType"]'
        )
        .forEach(
            (input) => {
                input.addEventListener(
                    "change",
                    updateFormVisibility
                );
            }
        );


    /* OCCUPANCY */

    const occupancy =
        $("occupancy");

    if (occupancy) {
        occupancy.addEventListener(
            "change",
            updateFormVisibility
        );
    }


    /* FAMILY STATUS */

    const familyStatus =
        $("familyStatus");

    if (familyStatus) {
        familyStatus.addEventListener(
            "change",
            updateFormVisibility
        );
    }


    /* FILE CARDS */

    const filesContainer =
        $("filesContainer");

    if (filesContainer) {
        filesContainer.addEventListener(
            "click",
            (event) => {
                const button =
                    event.target.closest(
                        "[data-file-id]"
                    );

                if (!button) {
                    return;
                }

                const id =
                    button.dataset.fileId;

                if (id) {
                    openDetailModal(
                        id
                    );
                }
            }
        );
    }


    /* BACKDROPS */

    document
        .querySelectorAll(
            ".modal-backdrop"
        )
        .forEach(
            (backdrop) => {
                backdrop.addEventListener(
                    "click",
                    () => {
                        const modal =
                            backdrop.closest(
                                ".modal"
                            );

                        if (modal) {
                            closeModal(
                                modal.id
                            );
                        }
                    }
                );
            }
        );


    /* ESCAPE */

    document.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key !== "Escape"
            ) {
                return;
            }

            closeAllModals();
        }
    );
}


/* =========================================================
   INITIALIZE
========================================================= */

function init() {
    setupEvents();

    updateFormVisibility();

    showLogin();

    setSyncStatus(
        "error",
        "وارد نشده‌اید"
    );
}


document.addEventListener(
    "DOMContentLoaded",
    init
);
