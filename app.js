/* =========================================================
   DOT Real Estate — app.js
   ========================================================= */

const API_BASE = window.DOT_API_BASE || "";

const state = {
    user: null,
    files: [],
    activeFilter: "all",
    search: "",
    editingFile: null,
    selectedFile: null
};

const FILE_TYPES = {
    sale: "ملک فروشی",
    landlord: "مالک / موجر",
    buyer: "خریدار",
    tenant: "مستاجر"
};

const PROPERTY_TYPES = {
    apartment: "آپارتمان",
    villa: "ویلا",
    office: "دفتر کار",
    commercial: "تجاری",
    land: "زمین",
    garden: "باغ",
    any: "فرقی ندارد"
};

const CONDITIONS = {
    new: "نوساز",
    unused: "کلید نخورده",
    renovated: "بازسازی‌شده",
    "not-renovated": "بازسازی نشده",
    renovating: "در حال بازسازی"
};

const OCCUPANCY = {
    empty: "خالی",
    tenant: "مستاجر دارد",
    owner: "مالک ساکن است",
    evacuating: "در حال تخلیه"
};

const KEY_HOLDERS = {
    owner: "مالک",
    tenant: "مستاجر",
    guard: "نگهبان",
    office: "دفتر",
    other: "سایر"
};

const FAMILY_STATUS = {
    single: "مجرد",
    married: "متأهل",
    family: "خانوادگی"
};

const AMENITIES = {
    parking: "پارکینگ",
    elevator: "آسانسور",
    storage: "انباری",
    balcony: "بالکن",
    terrace: "تراس",
    yard: "حیاط",
    pool: "استخر",
    jacuzzi: "جکوزی",
    roof: "روف‌گاردن",
    lobby: "لابی",
    guard: "نگهبانی",
    package: "پکیج",
    cooler: "کولر",
    "floor-heating": "گرمایش از کف",
    cabinet: "کابینت",
    closet: "کمد دیواری"
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [
    ...parent.querySelectorAll(selector)
];

/* =========================================================
   Helpers
   ========================================================= */

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatNumber(value) {
    if (value === null || value === undefined || value === "") {
        return "—";
    }

    const number = Number(String(value).replace(/,/g, ""));

    if (!Number.isFinite(number)) {
        return escapeHtml(value);
    }

    return new Intl.NumberFormat("fa-IR").format(number);
}

function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
        return "—";
    }

    return `${formatNumber(value)} تومان`;
}

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHtml(value);
    }

    return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(date);
}

function getFileTypeLabel(type) {
    return FILE_TYPES[type] || type || "پرونده";
}

function getPropertyTypeLabel(type) {
    return PROPERTY_TYPES[type] || type || "—";
}

function getConditionLabel(value) {
    return CONDITIONS[value] || value || "—";
}

function getOccupancyLabel(value) {
    return OCCUPANCY[value] || value || "—";
}

function getKeyHolderLabel(value) {
    return KEY_HOLDERS[value] || value || "—";
}

function getFamilyStatusLabel(value) {
    return FAMILY_STATUS[value] || value || "—";
}

function normalizeSearch(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/ي/g, "ی")
        .replace(/ك/g, "ک");
}

function getFileName(file) {
    return (
        file.name ||
        file.fullName ||
        file.title ||
        file.customerName ||
        file.ownerName ||
        file.buyerName ||
        file.tenantName ||
        "بدون نام"
    );
}

function getFileLocation(file) {
    return file.location || file.address || "موقعیت ثبت نشده";
}

function getFileCode(file) {
    return file.code || file.fileCode || file.id || "—";
}

function getFollowUpDate(file) {
    return (
        file.followUpAt ||
        file.follow_up_at ||
        file.nextFollowUpAt ||
        file.next_follow_up_at
    );
}

function isFollowUp(file) {
    if (
        file.followUpStatus === "followup" ||
        file.status === "followup" ||
        file.needsFollowUp === true ||
        file.needs_follow_up === true
    ) {
        return true;
    }

    const date = getFollowUpDate(file);

    if (!date) {
        return false;
    }

    const timestamp = new Date(date).getTime();

    if (!Number.isFinite(timestamp)) {
        return false;
    }

    return timestamp <= Date.now();
}

function showToast(message, type = "success") {
    let container = $(".toast-container");

    if (!container) {
        container = document.createElement("div");
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(5px)";

        window.setTimeout(() => {
            toast.remove();
        }, 180);
    }, 3200);
}

function setButtonLoading(button, loading, text = "در حال انجام...") {
    if (!button) {
        return;
    }

    if (loading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }

        button.disabled = true;
        button.textContent = text;
    } else {
        button.disabled = false;

        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

function openModal(modal) {
    if (!modal) {
        return;
    }

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeModal(modal) {
    if (!modal) {
        return;
    }

    modal.classList.remove("open");

    if (!$(".modal.open")) {
        document.body.style.overflow = "";
    }
}

function closeAllModals() {
    $$(".modal.open").forEach(modal => {
        modal.classList.remove("open");
    });

    document.body.style.overflow = "";
}

/* =========================================================
   API
   ========================================================= */

async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});

    if (
        options.body &&
        !(options.body instanceof FormData) &&
        !headers.has("Content-Type")
    ) {
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...options,
        headers
    });

    let data = null;

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        try {
            data = await response.json();
        } catch {
            data = null;
        }
    } else {
        try {
            data = await response.text();
        } catch {
            data = null;
        }
    }

    if (!response.ok) {
        const message =
            data?.error ||
            data?.message ||
            (typeof data === "string" && data) ||
            `خطا در ارتباط با سرور (${response.status})`;

        const error = new Error(message);
        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}

async function login(username, password) {
    return apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({
            username,
            password
        })
    });
}

async function logout() {
    return apiFetch("/api/logout", {
        method: "POST"
    });
}

async function getCurrentUser() {
    return apiFetch("/api/me", {
        method: "GET"
    });
}

async function getFiles() {
    return apiFetch("/api/files", {
        method: "GET"
    });
}

async function createFile(payload) {
    return apiFetch("/api/files", {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

async function updateFile(id, payload) {
    return apiFetch(`/api/files/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
    });
}

async function deleteFile(id) {
    return apiFetch(`/api/files/${encodeURIComponent(id)}`, {
        method: "DELETE"
    });
}

/* =========================================================
   Authentication
   ========================================================= */

async function checkSession() {
    try {
        const response = await getCurrentUser();

        state.user =
            response?.user ||
            response?.data?.user ||
            response?.data ||
            response;

        showApp();
        await loadFiles();
    } catch (error) {
        state.user = null;
        showLogin();
    }
}

function showLogin() {
    const loginScreen = $(".login-screen");
    const app = $(".app");

    if (loginScreen) {
        loginScreen.classList.remove("hidden");
    }

    if (app) {
        app.classList.add("hidden");
    }
}

function showApp() {
    const loginScreen = $(".login-screen");
    const app = $(".app");

    if (loginScreen) {
        loginScreen.classList.add("hidden");
    }

    if (app) {
        app.classList.remove("hidden");
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const usernameInput = $("#username");
    const passwordInput = $("#password");
    const errorElement = $("#loginError");
    const submitButton = $('button[type="submit"]', form);

    const username = usernameInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!username || !password) {
        if (errorElement) {
            errorElement.textContent = "نام کاربری و رمز عبور را وارد کنید.";
        }

        return;
    }

    if (errorElement) {
        errorElement.textContent = "";
    }

    setButtonLoading(submitButton, true, "در حال ورود...");

    try {
        const response = await login(username, password);

        state.user =
            response?.user ||
            response?.data?.user ||
            response?.data ||
            response;

        form.reset();

        showApp();
        await loadFiles();
    } catch (error) {
        console.error(error);

        if (errorElement) {
            errorElement.textContent =
                error.status === 401
                    ? "نام کاربری یا رمز عبور اشتباه است."
                    : error.message || "ورود انجام نشد.";
        }
    } finally {
        setButtonLoading(submitButton, false);
    }
}

async function handleLogout() {
    try {
        await logout();
    } catch (error) {
        console.error(error);
    }

    state.user = null;
    state.files = [];
    state.editingFile = null;
    state.selectedFile = null;

    closeAllModals();
    showLogin();
}

/* =========================================================
   Files
   ========================================================= */

async function loadFiles() {
    const container = $("#filesContainer");

    if (container) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
            </div>
        `;
    }

    try {
        const response = await getFiles();

        const files =
            response?.files ||
            response?.data?.files ||
            response?.data ||
            response ||
            [];

        state.files = Array.isArray(files) ? files : [];

        renderHome();
        updateFollowUpCount();
    } catch (error) {
        console.error(error);

        state.files = [];

        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-inner">
                        <div class="empty-icon">!</div>
                        <h2>خطا در دریافت پرونده‌ها</h2>
                        <p>${escapeHtml(
                            error.message || "ارتباط با سرور برقرار نشد."
                        )}</p>
                        <button class="button button-primary" id="retryFilesButton">
                            تلاش مجدد
                        </button>
                    </div>
                </div>
            `;

            $("#retryFilesButton")?.addEventListener("click", loadFiles);
        }
    }
}

function getFilteredFiles() {
    let files = [...state.files];

    if (state.activeFilter === "followup") {
        files = files.filter(isFollowUp);
    } else if (state.activeFilter !== "all") {
        files = files.filter(file => {
            const type = file.type || file.fileType;

            return type === state.activeFilter;
        });
    }

    const query = normalizeSearch(state.search);

    if (query) {
        files = files.filter(file => {
            const searchable = [
                getFileName(file),
                getFileLocation(file),
                getFileCode(file),
                file.phone,
                file.propertyType,
                file.notes,
                file.description,
                file.area,
                file.rooms
            ]
                .filter(Boolean)
                .map(normalizeSearch)
                .join(" ");

            return searchable.includes(query);
        });
    }

    files.sort((a, b) => {
        const followupA = isFollowUp(a) ? 1 : 0;
        const followupB = isFollowUp(b) ? 1 : 0;

        if (followupA !== followupB) {
            return followupB - followupA;
        }

        const dateA = new Date(
            a.createdAt || a.created_at || 0
        ).getTime();

        const dateB = new Date(
            b.createdAt || b.created_at || 0
        ).getTime();

        return dateB - dateA;
    });

    return files;
}

function renderHome() {
    const container = $("#filesContainer");
    const emptyState = $("#emptyState");

    if (!container) {
        return;
    }

    const files = getFilteredFiles();

    if (!files.length) {
        container.innerHTML = "";

        if (emptyState) {
            emptyState.classList.remove("hidden");

            const title = $("h2", emptyState);
            const text = $("p", emptyState);

            if (state.search || state.activeFilter !== "all") {
                if (title) {
                    title.textContent = "پرونده‌ای پیدا نشد";
                }

                if (text) {
                    text.textContent =
                        "با تغییر جست‌وجو یا فیلتر دوباره امتحان کنید.";
                }
            } else {
                if (title) {
                    title.textContent = "هنوز پرونده‌ای ثبت نشده";
                }

                if (text) {
                    text.textContent =
                        "برای شروع، اولین پرونده را ثبت کنید.";
                }
            }
        }

        return;
    }

    if (emptyState) {
        emptyState.classList.add("hidden");
    }

    container.innerHTML = `
        <div class="files-grid">
            ${files.map(renderFileCard).join("")}
        </div>
    `;

    $$(".file-card", container).forEach(card => {
        card.addEventListener("click", () => {
            const id = card.dataset.id;

            const file = state.files.find(item => {
                return String(item.id) === String(id);
            });

            if (file) {
                openDetail(file);
            }
        });
    });
}

function renderFileCard(file) {
    const type = file.type || file.fileType || "sale";
    const name = getFileName(file);
    const location = getFileLocation(file);
    const code = getFileCode(file);
    const followup = isFollowUp(file);

    let summary = "";

    if (type === "sale" || type === "landlord") {
        summary = `
            <div class="summary-item">
                <span>نوع ملک</span>
                <strong>${escapeHtml(
                    getPropertyTypeLabel(file.propertyType)
                )}</strong>
            </div>

            <div class="summary-item">
                <span>متراژ</span>
                <strong>${
                    file.area
                        ? `${formatNumber(file.area)} متر`
                        : "—"
                }</strong>
            </div>

            <div class="summary-item">
                <span>اتاق</span>
                <strong>${file.rooms ? formatNumber(file.rooms) : "—"}</strong>
            </div>

            <div class="summary-item">
                <span>${
                    type === "landlord" ? "اجاره پیشنهادی" : "قیمت"
                }</span>
                <strong>${escapeHtml(
                    type === "landlord"
                        ? formatMoney(file.suggestedRent)
                        : formatMoney(file.price || file.amount)
                )}</strong>
            </div>
        `;
    } else if (type === "buyer") {
        summary = `
            <div class="summary-item">
                <span>نوع ملک</span>
                <strong>${escapeHtml(
                    getPropertyTypeLabel(file.propertyType)
                )}</strong>
            </div>

            <div class="summary-item">
                <span>متراژ</span>
                <strong>${
                    file.area
                        ? `${formatNumber(file.area)} متر`
                        : "—"
                }</strong>
            </div>

            <div class="summary-item">
                <span>اتاق</span>
                <strong>${file.rooms ? formatNumber(file.rooms) : "—"}</strong>
            </div>

            <div class="summary-item">
                <span>سرمایه</span>
                <strong>${escapeHtml(
                    formatMoney(file.capital)
                )}</strong>
            </div>
        `;
    } else if (type === "tenant") {
        summary = `
            <div class="summary-item">
                <span>نوع ملک</span>
                <strong>${escapeHtml(
                    getPropertyTypeLabel(file.propertyType)
                )}</strong>
            </div>

            <div class="summary-item">
                <span>متراژ</span>
                <strong>${
                    file.area
                        ? `${formatNumber(file.area)} متر`
                        : "—"
                }</strong>
            </div>

            <div class="summary-item">
                <span>ودیعه</span>
                <strong>${escapeHtml(
                    formatMoney(file.deposit)
                )}</strong>
            </div>

            <div class="summary-item">
                <span>اجاره</span>
                <strong>${escapeHtml(
                    formatMoney(file.rent)
                )}</strong>
            </div>
        `;
    }

    return `
        <article
            class="file-card ${followup ? "is-followup" : ""}"
            data-id="${escapeHtml(file.id)}"
        >
            <div class="file-card-top">
                <span class="file-type-badge ${escapeHtml(type)}">
                    ${escapeHtml(getFileTypeLabel(type))}
                </span>

                <span class="file-number">
                    #${escapeHtml(code)}
                </span>
            </div>

            <h3>${escapeHtml(name)}</h3>

            <p class="file-location">
                ${escapeHtml(location)}
            </p>

            <div class="file-summary">
                ${summary}
            </div>

            <div class="file-card-footer">
                ${
                    followup
                        ? `
                            <span class="followup-badge">
                                نیاز به پیگیری
                            </span>
                        `
                        : `
                            <span class="followup-badge normal">
                                پیگیری: ${formatFollowUp(file)}
                            </span>
                        `
                }

                <span class="file-date">
                    ${formatDate(
                        file.createdAt ||
                            file.created_at ||
                            file.updatedAt ||
                            file.updated_at
                    )}
                </span>
            </div>
        </article>
    `;
}

function formatFollowUp(file) {
    const date = getFollowUpDate(file);

    if (!date) {
        return "—";
    }

    const timestamp = new Date(date).getTime();

    if (!Number.isFinite(timestamp)) {
        return "—";
    }

    const diff = timestamp - Date.now();

    if (diff <= 0) {
        return "امروز";
    }

    const days = Math.ceil(diff / 86400000);

    return `${formatNumber(days)} روز`;
}

/* =========================================================
   Follow-up
   ========================================================= */

function updateFollowUpCount() {
    const count = state.files.filter(isFollowUp).length;

    const elements = [
        $("#followUpCount"),
        $("#followUpButton")
    ].filter(Boolean);

    const countElement = $("#followUpCount");

    if (countElement) {
        countElement.textContent = formatNumber(count);
        countElement.classList.toggle("hidden", count === 0);
    }

    elements.forEach(element => {
        element.dataset.count = count;
    });
}

/* =========================================================
   Form
   ========================================================= */

function resetFileForm() {
    const form = $("#fileForm");

    if (!form) {
        return;
    }

    form.reset();

    $("#editingFileId").value = "";

    const defaultType = $('input[name="fileType"][value="sale"]');

    if (defaultType) {
        defaultType.checked = true;
    }

    if ($("#followUpDays")) {
        $("#followUpDays").value = "10";
    }

    state.editingFile = null;

    updateFormSections();
}

function openNewFileModal() {
    resetFileForm();

    if ($("#modalEyebrow")) {
        $("#modalEyebrow").textContent = "پرونده جدید";
    }

    if ($("#modalTitle")) {
        $("#modalTitle").textContent = "ثبت پرونده";
    }

    openModal($("#fileModal"));
}

function openEditFileModal(file) {
    state.editingFile = file;

    populateForm(file);

    if ($("#modalEyebrow")) {
        $("#modalEyebrow").textContent = "ویرایش پرونده";
    }

    if ($("#modalTitle")) {
        $("#modalTitle").textContent = "ویرایش پرونده";
    }

    openModal($("#fileModal"));
}

function setValue(id, value) {
    const element = $(`#${id}`);

    if (!element) {
        return;
    }

    element.value =
        value === null || value === undefined ? "" : value;
}

function setChecked(id, checked) {
    const element = $(`#${id}`);

    if (element) {
        element.checked = Boolean(checked);
    }
}

function setRadio(name, value) {
    if (!value) {
        return;
    }

    const input = $(
        `input[name="${name}"][value="${CSS.escape(String(value))}"]`
    );

    if (input) {
        input.checked = true;
    }
}

function populateAmenities(amenities) {
    const values = Array.isArray(amenities)
        ? amenities
        : typeof amenities === "string"
        ? amenities.split(",").map(value => value.trim())
        : [];

    $$(".amenity-input").forEach(input => {
        input.checked = values.includes(input.value);
    });

    Object.keys(AMENITIES).forEach(key => {
        const checkbox = $(
            `.amenity-input[value="${CSS.escape(key)}"]`
        );

        if (checkbox) {
            checkbox.checked = values.includes(key);
        }
    });
}

function populateForm(file) {
    const form = $("#fileForm");

    if (!form) {
        return;
    }

    form.reset();

    setValue("editingFileId", file.id);

    setRadio(
        "fileType",
        file.type || file.fileType || "sale"
    );

    setValue("name", getFileName(file));
    setValue("propertyType", file.propertyType);
    setValue("area", file.area);
    setValue("rooms", file.rooms);
    setValue("year", file.year);
    setValue("location", file.location);
    setValue("phone", file.phone);

    setRadio("keyHolder", file.keyHolder);
    setRadio("condition", file.condition);
    setRadio("occupancy", file.occupancy);

    setValue("currentDeposit", file.currentDeposit);
    setValue("currentRent", file.currentRent);
    setValue("suggestedDeposit", file.suggestedDeposit);
    setValue("suggestedRent", file.suggestedRent);

    setValue("capital", file.capital);
    setValue("notes", file.notes);

    setValue("deposit", file.deposit);
    setValue("rent", file.rent);

    setRadio("familyStatus", file.familyStatus);
    setValue("familySize", file.familySize);

    setValue(
        "followUpDays",
        file.followUpDays || 10
    );

    populateAmenities(file.amenities);

    updateFormSections();
}

function updateFormSections() {
    const type =
        $('input[name="fileType"]:checked')?.value ||
        "sale";

    const propertySections = [
        "#propertyFields",
        "#propertyAmenities",
        "#keyHolderField",
        "#conditionField",
        "#occupancyField"
    ];

    const buyerSections = [
        "#buyerFields"
    ];

    const tenantSections = [
        "#tenantFields"
    ];

    propertySections.forEach(selector => {
        const element = $(selector);

        if (element) {
            element.classList.toggle(
                "hidden",
                !(type === "sale" || type === "landlord")
            );
        }
    });

    buyerSections.forEach(selector => {
        const element = $(selector);

        if (element) {
            element.classList.toggle(
                "hidden",
                type !== "buyer"
            );
        }
    });

    tenantSections.forEach(selector => {
        const element = $(selector);

        if (element) {
            element.classList.toggle(
                "hidden",
                type !== "tenant"
            );
        }
    });

    const tenantFamilySize = $("#tenantFamilySize");

    if (tenantFamilySize) {
        const familyStatus =
            $('input[name="familyStatus"]:checked')?.value;

        tenantFamilySize.classList.toggle(
            "hidden",
            familyStatus !== "family"
        );
    }

    const currentRentField = $("#currentRentField");
    const currentDepositField = $("#currentDepositField");

    const occupancy =
        $('input[name="occupancy"]:checked')?.value;

    if (currentRentField) {
        currentRentField.classList.toggle(
            "hidden",
            !(type === "sale" && occupancy === "tenant")
        );
    }

    if (currentDepositField) {
        currentDepositField.classList.toggle(
            "hidden",
            !(type === "sale" && occupancy === "tenant")
        );
    }
}

function getRadioValue(name) {
    return $(`input[name="${name}"]:checked`)?.value || "";
}

function getCheckedAmenities() {
    return $$(".amenity-input:checked").map(
        input => input.value
    );
}

function numberOrNull(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const normalized = String(value)
        .replace(/,/g, "")
        .trim();

    if (!normalized) {
        return null;
    }

    const number = Number(normalized);

    return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
    const normalized = String(value || "").trim();

    return normalized || null;
}

function collectFormData() {
    const type = getRadioValue("fileType");

    const payload = {
        type,
        name: stringOrNull($("#name")?.value),
        phone: stringOrNull($("#phone")?.value),
        location: stringOrNull($("#location")?.value),
        followUpDays:
            numberOrNull($("#followUpDays")?.value) || 10
    };

    if (type === "sale" || type === "landlord") {
        payload.propertyType = stringOrNull(
            $("#propertyType")?.value
        );

        payload.area = numberOrNull(
            $("#area")?.value
        );

        payload.rooms = numberOrNull(
            $("#rooms")?.value
        );

        payload.year = numberOrNull(
            $("#year")?.value
        );

        payload.keyHolder = stringOrNull(
            getRadioValue("keyHolder")
        );

        payload.condition = stringOrNull(
            getRadioValue("condition")
        );

        payload.occupancy = stringOrNull(
            getRadioValue("occupancy")
        );

        payload.currentDeposit = numberOrNull(
            $("#currentDeposit")?.value
        );

        payload.currentRent = numberOrNull(
            $("#currentRent")?.value
        );

        payload.suggestedDeposit = numberOrNull(
            $("#suggestedDeposit")?.value
        );

        payload.suggestedRent = numberOrNull(
            $("#suggestedRent")?.value
        );

        payload.amenities = getCheckedAmenities();
    }

    if (type === "buyer") {
        payload.propertyType = stringOrNull(
            $("#buyerPropertyType")?.value
        );

        payload.area = numberOrNull(
            $("#buyerArea")?.value
        );

        payload.rooms = numberOrNull(
            $("#buyerRooms")?.value
        );

        payload.year = numberOrNull(
            $("#buyerYear")?.value
        );

        payload.capital = numberOrNull(
            $("#capital")?.value
        );

        payload.notes = stringOrNull(
            $("#buyerNotes")?.value ||
                $("#notes")?.value
        );
    }

    if (type === "tenant") {
        payload.propertyType = stringOrNull(
            $("#tenantPropertyType")?.value
        );

        payload.area = numberOrNull(
            $("#tenantArea")?.value
        );

        payload.rooms = numberOrNull(
            $("#tenantRooms")?.value
        );

        payload.year = numberOrNull(
            $("#tenantYear")?.value
        );

        payload.deposit = numberOrNull(
            $("#deposit")?.value
        );

        payload.rent = numberOrNull(
            $("#rent")?.value
        );

        payload.familyStatus = stringOrNull(
            getRadioValue("familyStatus")
        );

        payload.familySize = numberOrNull(
            $("#familySize")?.value
        );

        payload.notes = stringOrNull(
            $("#tenantNotes")?.value ||
                $("#notes")?.value
        );
    }

    if (type !== "buyer" && type !== "tenant") {
        payload.notes = stringOrNull(
            $("#notes")?.value
        );
    }

    return payload;
}

function validateForm(payload) {
    if (!payload.type) {
        return "نوع پرونده را انتخاب کنید.";
    }

    if (!payload.name) {
        return "نام را وارد کنید.";
    }

    if (!payload.phone) {
        return "شماره تماس را وارد کنید.";
    }

    if (payload.type === "sale" || payload.type === "landlord") {
        if (!payload.propertyType) {
            return "نوع ملک را انتخاب کنید.";
        }

        if (!payload.location) {
            return "موقعیت ملک را وارد کنید.";
        }
    }

    if (payload.type === "buyer") {
        if (!payload.propertyType) {
            return "نوع ملک موردنظر را انتخاب کنید.";
        }
    }

    if (payload.type === "tenant") {
        if (!payload.propertyType) {
            return "نوع ملک موردنظر را انتخاب کنید.";
        }

        if (payload.deposit === null) {
            return "ودیعه را وارد کنید.";
        }

        if (payload.rent === null) {
            return "اجاره را وارد کنید.";
        }
    }

    if (
        payload.followUpDays === null ||
        payload.followUpDays < 1
    ) {
        return "مدت پیگیری باید حداقل ۱ روز باشد.";
    }

    return null;
}

async function handleFileSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const submitButton =
        $('button[type="submit"]', form);

    const payload = collectFormData();
    const validationError = validateForm(payload);

    if (validationError) {
        showToast(validationError, "error");
        return;
    }

    setButtonLoading(
        submitButton,
        true,
        state.editingFile
            ? "در حال ذخیره..."
            : "در حال ثبت..."
    );

    try {
        if (state.editingFile) {
            await updateFile(
                state.editingFile.id,
                payload
            );

            showToast("پرونده با موفقیت ویرایش شد.");
        } else {
            await createFile(payload);

            showToast("پرونده با موفقیت ثبت شد.");
        }

        closeModal($("#fileModal"));

        state.editingFile = null;

        await loadFiles();
    } catch (error) {
        console.error(error);

        showToast(
            error.message || "ذخیره پرونده انجام نشد.",
            "error"
        );
    } finally {
        setButtonLoading(
            submitButton,
            false
        );
    }
}

/* =========================================================
   Detail
   ========================================================= */

function openDetail(file) {
    state.selectedFile = file;

    const type =
        file.type ||
        file.fileType ||
        "sale";

    const title = getFileName(file);

    if ($("#detailType")) {
        $("#detailType").textContent =
            getFileTypeLabel(type);
    }

    if ($("#detailTitle")) {
        $("#detailTitle").textContent = title;
    }

    renderDetailContent(file);

    const editButton = $("#editDetailButton");
    const deleteButton = $("#deleteDetailButton");

    const role =
        state.user?.role ||
        state.user?.userRole ||
        "";

    const isAdmin =
        role === "admin" ||
        role === "administrator";

    const createdBy =
        file.createdBy ||
        file.created_by ||
        file.userId ||
        file.user_id;

    const currentUserId =
        state.user?.id ||
        state.user?.userId;

    const canEdit =
        isAdmin ||
        !createdBy ||
        String(createdBy) === String(currentUserId);

    if (editButton) {
        editButton.classList.toggle(
            "hidden",
            !canEdit
        );
    }

    if (deleteButton) {
        deleteButton.classList.toggle(
            "hidden",
            !isAdmin
        );
    }

    openModal($("#detailModal"));
}

function detailItem(label, value, full = false) {
    return `
        <div class="detail-item ${full ? "full" : ""}">
            <div class="detail-item-label">
                ${escapeHtml(label)}
            </div>

            <div class="detail-item-value">
                ${value || "—"}
            </div>
        </div>
    `;
}

function renderDetailContent(file) {
    const container = $("#detailContent");

    if (!container) {
        return;
    }

    const type =
        file.type ||
        file.fileType ||
        "sale";

    let html = "";

    if (type === "sale" || type === "landlord") {
        html += `
            <section class="detail-section">
                <h3>اطلاعات اصلی</h3>

                <div class="detail-grid">
                    ${detailItem(
                        "نام",
                        escapeHtml(getFileName(file))
                    )}

                    ${detailItem(
                        "شماره تماس",
                        escapeHtml(file.phone)
                    )}

                    ${detailItem(
                        "نوع ملک",
                        escapeHtml(
                            getPropertyTypeLabel(
                                file.propertyType
                            )
                        )
                    )}

                    ${detailItem(
                        "متراژ",
                        file.area
                            ? `${formatNumber(file.area)} متر`
                            : "—"
                    )}

                    ${detailItem(
                        "تعداد اتاق",
                        file.rooms
                            ? formatNumber(file.rooms)
                            : "—"
                    )}

                    ${detailItem(
                        "سال ساخت",
                        file.year
                            ? formatNumber(file.year)
                            : "—"
                    )}

                    ${detailItem(
                        "موقعیت",
                        escapeHtml(file.location),
                        true
                    )}

                    ${detailItem(
                        "کلید دست",
                        escapeHtml(
                            getKeyHolderLabel(
                                file.keyHolder
                            )
                        )
                    )}

                    ${detailItem(
                        "وضعیت",
                        escapeHtml(
                            getConditionLabel(
                                file.condition
                            )
                        )
                    )}

                    ${detailItem(
                        "سکونت",
                        escapeHtml(
                            getOccupancyLabel(
                                file.occupancy
                            )
                        )
                    )}
                </div>
            </section>
        `;

        if (
            file.currentDeposit ||
            file.currentRent ||
            file.suggestedDeposit ||
            file.suggestedRent
        ) {
            html += `
                <section class="detail-section">
                    <h3>اطلاعات مالی</h3>

                    <div class="detail-grid">
                        ${detailItem(
                            "ودیعه فعلی",
                            escapeHtml(
                                formatMoney(
                                    file.currentDeposit
                                )
                            )
                        )}

                        ${detailItem(
                            "اجاره فعلی",
                            escapeHtml(
                                formatMoney(
                                    file.currentRent
                                )
                            )
                        )}

                        ${detailItem(
                            "ودیعه پیشنهادی",
                            escapeHtml(
                                formatMoney(
                                    file.suggestedDeposit
                                )
                            )
                        )}

                        ${detailItem(
                            "اجاره پیشنهادی",
                            escapeHtml(
                                formatMoney(
                                    file.suggestedRent
                                )
                            )
                        )}

                        ${
                            type === "sale"
                                ? detailItem(
                                      "قیمت",
                                      escapeHtml(
                                          formatMoney(
                                              file.price ||
                                                  file.amount
                                          )
                                      )
                                  )
                                : ""
                        }
                    </div>
                </section>
            `;
        }
    }

    if (type === "buyer") {
        html += `
            <section class="detail-section">
                <h3>مشخصات خریدار</h3>

                <div class="detail-grid">
                    ${detailItem(
                        "نام",
                        escapeHtml(getFileName(file))
                    )}

                    ${detailItem(
                        "شماره تماس",
                        escapeHtml(file.phone)
                    )}

                    ${detailItem(
                        "نوع ملک",
                        escapeHtml(
                            getPropertyTypeLabel(
                                file.propertyType
                            )
                        )
                    )}

                    ${detailItem(
                        "متراژ",
                        file.area
                            ? `${formatNumber(file.area)} متر`
                            : "—"
                    )}

                    ${detailItem(
                        "اتاق",
                        file.rooms
                            ? formatNumber(file.rooms)
                            : "—"
                    )}

                    ${detailItem(
                        "سال ساخت",
                        file.year
                            ? formatNumber(file.year)
                            : "—"
                    )}

                    ${detailItem(
                        "سرمایه",
                        escapeHtml(
                            formatMoney(file.capital)
                        )
                    )}

                    ${detailItem(
                        "موقعیت",
                        escapeHtml(file.location),
                        true
                    )}

                    ${detailItem(
                        "توضیحات",
                        escapeHtml(file.notes),
                        true
                    )}
                </div>
            </section>
        `;
    }

    if (type === "tenant") {
        html += `
            <section class="detail-section">
                <h3>مشخصات مستاجر</h3>

                <div class="detail-grid">
                    ${detailItem(
                        "نام",
                        escapeHtml(getFileName(file))
                    )}

                    ${detailItem(
                        "شماره تماس",
                        escapeHtml(file.phone)
                    )}

                    ${detailItem(
                        "نوع ملک",
                        escapeHtml(
                            getPropertyTypeLabel(
                                file.propertyType
                            )
                        )
                    )}

                    ${detailItem(
                        "متراژ",
                        file.area
                            ? `${formatNumber(file.area)} متر`
                            : "—"
                    )}

                    ${detailItem(
                        "اتاق",
                        file.rooms
                            ? formatNumber(file.rooms)
                            : "—"
                    )}

                    ${detailItem(
                        "سال ساخت",
                        file.year
                            ? formatNumber(file.year)
                            : "—"
                    )}

                    ${detailItem(
                        "ودیعه",
                        escapeHtml(
                            formatMoney(file.deposit)
                        )
                    )}

                    ${detailItem(
                        "اجاره",
                        escapeHtml(
                            formatMoney(file.rent)
                        )
                    )}

                    ${detailItem(
                        "وضعیت تأهل",
                        escapeHtml(
                            getFamilyStatusLabel(
                                file.familyStatus
                            )
                        )
                    )}

                    ${
                        file.familySize
                            ? detailItem(
                                  "تعداد اعضای خانواده",
                                  formatNumber(
                                      file.familySize
                                  )
                              )
                            : ""
                    }

                    ${detailItem(
                        "موقعیت",
                        escapeHtml(file.location),
                        true
                    )}

                    ${detailItem(
                        "توضیحات",
                        escapeHtml(file.notes),
                        true
                    )}
                </div>
            </section>
        `;
    }

    const amenities = Array.isArray(file.amenities)
        ? file.amenities
        : [];

    if (
        (type === "sale" || type === "landlord") &&
        amenities.length
    ) {
        html += `
            <section class="detail-section">
                <h3>امکانات</h3>

                <div class="detail-amenities">
                    ${amenities
                        .map(
                            amenity => `
                                <span class="amenity-badge">
                                    ${escapeHtml(
                                        AMENITIES[amenity] ||
                                            amenity
                                    )}
                                </span>
                            `
                        )
                        .join("")}
                </div>
            </section>
        `;
    }

    html += `
        <section class="detail-section">
            <h3>پیگیری</h3>

            <div class="detail-grid">
                ${detailItem(
                    "وضعیت پیگیری",
                    isFollowUp(file)
                        ? '<span class="text-danger">نیاز به پیگیری</span>'
                        : '<span class="text-success">در وضعیت عادی</span>'
                )}

                ${detailItem(
                    "تاریخ پیگیری",
                    escapeHtml(
                        formatDate(
                            getFollowUpDate(file)
                        )
                    )
                )}

                ${detailItem(
                    "آخرین بروزرسانی",
                    escapeHtml(
                        formatDate(
                            file.updatedAt ||
                                file.updated_at
                        )
                    )
                )}
            </div>
        </section>
    `;

    container.innerHTML = html;
}

/* =========================================================
   Renew
   ========================================================= */

function openRenewModal() {
    if (!state.selectedFile) {
        return;
    }

    if ($("#renewTitle")) {
        $("#renewTitle").textContent =
            `تمدید پیگیری «${getFileName(
                state.selectedFile
            )}»`;
    }

    openModal($("#renewModal"));
}

async function renewFile(days) {
    if (!state.selectedFile) {
        return;
    }

    const file = state.selectedFile;

    try {
        await updateFile(file.id, {
            followUpDays: Number(days)
        });

        showToast(
            `پیگیری برای ${formatNumber(days)} روز تمدید شد.`
        );

        closeModal($("#renewModal"));
        closeModal($("#detailModal"));

        state.selectedFile = null;

        await loadFiles();
    } catch (error) {
        console.error(error);

        showToast(
            error.message || "تمدید پیگیری انجام نشد.",
            "error"
        );
    }
}

/* =========================================================
   Delete
   ========================================================= */

async function handleDeleteSelectedFile() {
    if (!state.selectedFile) {
        return;
    }

    const file = state.selectedFile;

    const confirmed = window.confirm(
        `آیا از حذف پرونده «${getFileName(
            file
        )}» مطمئن هستید؟\n\nاین عملیات پرونده را از لیست فعال خارج می‌کند.`
    );

    if (!confirmed) {
        return;
    }

    const button = $("#deleteDetailButton");

    setButtonLoading(
        button,
        true,
        "در حال حذف..."
    );

    try {
        await deleteFile(file.id);

        showToast("پرونده با موفقیت حذف شد.");

        closeModal($("#detailModal"));

        state.selectedFile = null;

        await loadFiles();
    } catch (error) {
        console.error(error);

        showToast(
            error.message || "حذف پرونده انجام نشد.",
            "error"
        );
    } finally {
        setButtonLoading(
            button,
            false
        );
    }
}

/* =========================================================
   Filters / Search
   ========================================================= */

function setFilter(filter) {
    state.activeFilter = filter;

    $$(".filter-button").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.filter === filter
        );
    });

    renderHome();
}

function handleSearch(event) {
    state.search = event.currentTarget.value || "";

    renderHome();
}

/* =========================================================
   Event Binding
   ========================================================= */

function bindEvents() {
    $("#loginForm")?.addEventListener(
        "submit",
        handleLogin
    );

    $("#logoutButton")?.addEventListener(
        "click",
        handleLogout
    );

    $("#newFileButton")?.addEventListener(
        "click",
        openNewFileModal
    );

    $("#emptyNewFileButton")?.addEventListener(
        "click",
        openNewFileModal
    );

    $("#fileForm")?.addEventListener(
        "submit",
        handleFileSubmit
    );

    $("#cancelFormButton")?.addEventListener(
        "click",
        () => closeModal($("#fileModal"))
    );

    $("#closeModalButton")?.addEventListener(
        "click",
        () => closeModal($("#fileModal"))
    );

    $("#closeDetailButton")?.addEventListener(
        "click",
        () => closeModal($("#detailModal"))
    );

    $("#closeRenewButton")?.addEventListener(
        "click",
        () => closeModal($("#renewModal"))
    );

    $("#editDetailButton")?.addEventListener(
        "click",
        () => {
            if (!state.selectedFile) {
                return;
            }

            closeModal($("#detailModal"));
            openEditFileModal(
                state.selectedFile
            );
        }
    );

    $("#renewDetailButton")?.addEventListener(
        "click",
        openRenewModal
    );

    $("#deleteDetailButton")?.addEventListener(
        "click",
        handleDeleteSelectedFile
    );

    $("#searchInput")?.addEventListener(
        "input",
        handleSearch
    );

    $$(".filter-button").forEach(button => {
        button.addEventListener(
            "click",
            () => {
                setFilter(
                    button.dataset.filter || "all"
                );
            }
        );
    });

    $$('input[name="fileType"]').forEach(input => {
        input.addEventListener(
            "change",
            updateFormSections
        );
    });

    $$('input[name="occupancy"]').forEach(input => {
        input.addEventListener(
            "change",
            updateFormSections
        );
    });

    $$('input[name="familyStatus"]').forEach(input => {
        input.addEventListener(
            "change",
            updateFormSections
        );
    });

    $$(".renew-option").forEach(button => {
        button.addEventListener(
            "click",
            () => {
                const days = Number(
                    button.dataset.days
                );

                if (
                    Number.isFinite(days) &&
                    days > 0
                ) {
                    renewFile(days);
                }
            }
        );
    });

    $$(".modal").forEach(modal => {
        modal.addEventListener(
            "click",
            event => {
                if (event.target === modal) {
                    closeModal(modal);
                }
            }
        );
    });

    document.addEventListener(
        "keydown",
        event => {
            if (event.key === "Escape") {
                closeAllModals();
            }
        }
    );

    $("#followUpButton")?.addEventListener(
        "click",
        () => {
            setFilter("followup");

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
    );
}

/* =========================================================
   Init
   ========================================================= */

async function init() {
    bindEvents();
    updateFormSections();
    showLogin();

    await checkSession();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init
    );
} else {
    init();
}
