/* =========================================================
   DOT REAL ESTATE FILE MANAGER
========================================================= */


/* =========================================================
   SETTINGS
========================================================= */

// فعلاً برای دمو.
// بعداً این قسمت را باید با سیستم احراز هویت واقعی عوض کنیم.
const ACCESS_CODE = "DOT-1405";

const STORAGE_KEY = "dot_real_estate_files";

const SESSION_KEY = "dot_logged_in";


/* =========================================================
   DOM
========================================================= */

const loginScreen = document.getElementById("loginScreen");
const app = document.getElementById("app");

const loginForm = document.getElementById("loginForm");
const accessCodeInput = document.getElementById("accessCode");
const loginError = document.getElementById("loginError");

const logoutButton = document.getElementById("logoutButton");

const filesContainer = document.getElementById("filesContainer");
const emptyState = document.getElementById("emptyState");

const fileCountText = document.getElementById("fileCountText");
const followUpCount = document.getElementById("followUpCount");

const searchInput = document.getElementById("searchInput");

const newFileButton = document.getElementById("newFileButton");
const emptyNewFileButton = document.getElementById("emptyNewFileButton");
const followUpButton = document.getElementById("followUpButton");

const fileModal = document.getElementById("fileModal");
const detailModal = document.getElementById("detailModal");
const renewModal = document.getElementById("renewModal");

const closeModalButton = document.getElementById("closeModalButton");
const closeDetailButton = document.getElementById("closeDetailButton");
const closeRenewButton = document.getElementById("closeRenewButton");

const cancelFormButton = document.getElementById("cancelFormButton");

const fileForm = document.getElementById("fileForm");

const propertyFields = document.getElementById("propertyFields");
const buyerFields = document.getElementById("buyerFields");
const tenantFields = document.getElementById("tenantFields");

const currentTenantFields =
    document.getElementById("currentTenantFields");

const rentTermsSection =
    document.getElementById("rentTermsSection");

const familySizeField =
    document.getElementById("familySizeField");

const occupancy =
    document.getElementById("occupancy");

const tenantFamilyStatus =
    document.getElementById("tenantFamilyStatus");

const editingFileId =
    document.getElementById("editingFileId");

const modalTitle =
    document.getElementById("modalTitle");

const modalEyebrow =
    document.getElementById("modalEyebrow");

const detailTitle =
    document.getElementById("detailTitle");

const detailType =
    document.getElementById("detailType");

const detailContent =
    document.getElementById("detailContent");

const editDetailButton =
    document.getElementById("editDetailButton");

const deleteDetailButton =
    document.getElementById("deleteDetailButton");

const renewDetailButton =
    document.getElementById("renewDetailButton");

const followUpDaysInput =
    document.getElementById("followUpDays");


/* =========================================================
   STATE
========================================================= */

let files = loadFiles();

let currentFilter = "all";

let currentDetailId = null;

let currentRenewId = null;


/* =========================================================
   LABELS
========================================================= */

const typeLabels = {

    sale: "ملک فروشی",

    rent: "مالک / موجر",

    buyer: "خریدار",

    tenant: "مستاجر"

};


const propertyTypeLabels = {

    apartment: "آپارتمانی",

    villa: "ویلایی",

    office: "اداری",

    commercial: "تجاری",

    land: "زمین",

    garden: "باغ",

    any: "فرقی ندارد"

};


const conditionLabels = {

    new: "نوساز",

    unused: "کلید نخورده",

    renovated: "بازسازی شده",

    "not-renovated": "بازسازی نشده",

    renovating: "در حال بازسازی"

};


const occupancyLabels = {

    empty: "خالی",

    tenant: "مستاجر دارد",

    owner: "مالک ساکن است",

    evacuating: "در حال تخلیه"

};


const keyHolderLabels = {

    owner: "مالک",

    tenant: "مستاجر",

    guard: "نگهبانی",

    office: "دفتر",

    other: "سایر"

};


const familyLabels = {

    single: "مجرد",

    married: "متاهل",

    family: "خانواده"

};


const amenityLabels = {

    parking: "پارکینگ",

    elevator: "آسانسور",

    storage: "انباری",

    balcony: "بالکن",

    terrace: "تراس",

    yard: "حیاط",

    pool: "استخر",

    jacuzzi: "سونا / جکوزی",

    roof: "روف‌گاردن",

    lobby: "لابی",

    guard: "سرایداری",

    package: "پکیج",

    cooler: "کولر / اسپلیت",

    "floor-heating": "گرمایش از کف",

    cabinet: "کابینت",

    closet: "کمد دیواری"

};


/* =========================================================
   STORAGE
========================================================= */

function loadFiles() {

    try {

        const saved =
            localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return [];
        }

        const parsed = JSON.parse(saved);

        return Array.isArray(parsed)
            ? parsed
            : [];

    } catch (error) {

        console.error(error);

        return [];

    }
}


function saveFiles() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(files)
    );

}


/* =========================================================
   LOGIN
========================================================= */

function checkLogin() {

    const loggedIn =
        sessionStorage.getItem(SESSION_KEY);

    if (loggedIn === "true") {

        showApp();

    } else {

        showLogin();

    }

}


function showLogin() {

    loginScreen.classList.remove("hidden");

    app.classList.add("hidden");

}


function showApp() {

    loginScreen.classList.add("hidden");

    app.classList.remove("hidden");

    renderFiles();

}


loginForm.addEventListener("submit", function (event) {

    event.preventDefault();

    const code =
        accessCodeInput.value.trim();

    if (code === ACCESS_CODE) {

        sessionStorage.setItem(
            SESSION_KEY,
            "true"
        );

        loginError.textContent = "";

        accessCodeInput.value = "";

        showApp();

    } else {

        loginError.textContent =
            "کد دسترسی صحیح نیست.";

        accessCodeInput.select();

    }

});


logoutButton.addEventListener("click", function () {

    sessionStorage.removeItem(SESSION_KEY);

    showLogin();

});


/* =========================================================
   DATE
========================================================= */

function getTodayISO() {

    return new Date().toISOString();

}


function addDays(dateISO, days) {

    const date = new Date(dateISO);

    date.setDate(
        date.getDate() + Number(days)
    );

    return date.toISOString();

}


function formatDate(dateISO) {

    if (!dateISO) {
        return "-";
    }

    try {

        return new Intl.DateTimeFormat(
            "fa-IR",
            {
                year: "numeric",
                month: "long",
                day: "numeric"
            }
        ).format(new Date(dateISO));

    } catch {

        return dateISO;

    }

}


/* =========================================================
   NUMBER FORMAT
========================================================= */

function formatNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "-";

    }

    return Number(value).toLocaleString("fa-IR");

}


/* =========================================================
   ID / CODE
========================================================= */

function generateFileCode() {

    let maxNumber = 0;

    files.forEach(file => {

        const match =
            String(file.code || "")
                .match(/^DOT-(\d+)$/);

        if (match) {

            maxNumber =
                Math.max(
                    maxNumber,
                    Number(match[1])
                );

        }

    });

    return `DOT-${String(maxNumber + 1).padStart(4, "0")}`;

}


function generateId() {

    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .substring(2, 8)
    );

}


/* =========================================================
   STATUS
========================================================= */

function getEffectiveStatus(file) {

    // وضعیت‌های دستی هیچ‌وقت با پیگیری جایگزین نمی‌شوند.

    if (
        file.status === "reserved" ||
        file.status === "done" ||
        file.status === "archived"
    ) {

        return file.status;

    }

    if (
        file.followUpDate &&
        new Date() >= new Date(file.followUpDate)
    ) {

        return "followup";

    }

    return "active";

}


function getStatusLabel(status) {

    const labels = {

        active: "فعال",

        followup: "نیاز به پیگیری",

        reserved: "رزرو",

        done: "انجام شد",

        archived: "بایگانی"

    };

    return labels[status] || "فعال";

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   SEARCH TEXT
========================================================= */

function getSearchText(file) {

    return JSON.stringify(file)
        .toLowerCase();

}


/* =========================================================
   FILTER
========================================================= */

function matchesFilter(file) {

    const status =
        getEffectiveStatus(file);

    if (currentFilter === "all") {
        return true;
    }

    if (currentFilter === "followup") {

        return status === "followup";

    }

    return file.type === currentFilter;

}


/* =========================================================
   RENDER FILES
========================================================= */

function renderFiles() {

    updateFollowUpCount();

    const search =
        searchInput.value
            .trim()
            .toLowerCase();

    let filteredFiles =
        files.filter(file => {

            const matchesSearch =
                !search ||
                getSearchText(file)
                    .includes(search);

            return (
                matchesSearch &&
                matchesFilter(file)
            );

        });


    // جدیدترین‌ها اول

    filteredFiles.sort(
        (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
    );


    filesContainer.innerHTML = "";


    if (filteredFiles.length === 0) {

        emptyState.classList.remove("hidden");

    } else {

        emptyState.classList.add("hidden");

        filteredFiles.forEach(file => {

            filesContainer.appendChild(
                createFileCard(file)
            );

        });

    }


    fileCountText.textContent =
        `${files.length.toLocaleString("fa-IR")} فایل ثبت شده`;

}


function createFileCard(file) {

    const card =
        document.createElement("article");

    card.className = "file-card";

    card.dataset.id = file.id;


    const status =
        getEffectiveStatus(file);


    let title = "";
    let subtitle = "";


    if (file.type === "sale") {

        title =
            file.propertyName ||
            "ملک بدون نام";

        subtitle =
            propertyTypeLabels[file.propertyType] ||
            "ملک";

    }


    if (file.type === "rent") {

        title =
            file.propertyName ||
            "ملک بدون نام";

        subtitle = "فایل اجاره";

    }


    if (file.type === "buyer") {

        title =
            file.buyerName ||
            "خریدار بدون نام";

        subtitle = "متقاضی خرید";

    }


    if (file.type === "tenant") {

        title =
            file.tenantName ||
            "مستاجر بدون نام";

        subtitle = "متقاضی اجاره";

    }


    let mainInfo = "";


    if (
        file.type === "sale" ||
        file.type === "rent"
    ) {

        mainInfo = `

            <div class="info-item">
                <span>متراژ</span>
                <b>
                    ${escapeHTML(file.propertyArea || "-")}
                    متر
                </b>
            </div>

            <div class="info-item">
                <span>اتاق</span>
                <b>
                    ${escapeHTML(file.propertyRooms || "-")}
                </b>
            </div>

            <div class="info-item">
                <span>محدوده</span>
                <b>
                    ${escapeHTML(file.propertyLocation || "-")}
                </b>
            </div>

            <div class="info-item">
                <span>نوع</span>
                <b>
                    ${escapeHTML(
                        propertyTypeLabels[file.propertyType] || "-"
                    )}
                </b>
            </div>

        `;

    }


    if (file.type === "buyer") {

        mainInfo = `

            <div class="info-item">
                <span>سرمایه</span>
                <b>
                    ${formatNumber(file.buyerCapital)}
                </b>
            </div>

            <div class="info-item">
                <span>متراژ</span>
                <b>
                    ${escapeHTML(file.buyerArea || "-")}
                </b>
            </div>

            <div class="info-item">
                <span>نوع ملک</span>
                <b>
                    ${escapeHTML(
                        propertyTypeLabels[file.buyerPropertyType] || "-"
                    )}
                </b>
            </div>

            <div class="info-item">
                <span>محدوده</span>
                <b>
                    ${escapeHTML(file.buyerLocation || "-")}
                </b>
            </div>

        `;

    }


    if (file.type === "tenant") {

        mainInfo = `

            <div class="info-item">
                <span>رهن</span>
                <b>
                    ${formatNumber(file.tenantDeposit)}
                </b>
            </div>

            <div class="info-item">
                <span>اجاره</span>
                <b>
                    ${formatNumber(file.tenantRent)}
                </b>
            </div>

            <div class="info-item">
                <span>متراژ</span>
                <b>
                    ${escapeHTML(file.tenantArea || "-")}
                </b>
            </div>

            <div class="info-item">
                <span>محدوده</span>
                <b>
                    ${escapeHTML(file.tenantLocation || "-")}
                </b>
            </div>

        `;

    }


    card.innerHTML = `

        <div class="card-top">

            <div>

                <div class="file-code">
                    ${escapeHTML(file.code)}
                </div>

                <div class="file-title">
                    ${escapeHTML(title)}
                </div>

                <div style="
                    color: var(--muted);
                    font-size: 10px;
                    margin-top: 5px;
                ">
                    ${escapeHTML(subtitle)}
                </div>

            </div>

            <span class="status ${status}">
                ${getStatusLabel(status)}
            </span>

        </div>


        <div class="card-info">

            ${mainInfo}

        </div>


        <div class="card-footer">

            <small>
                ثبت:
                ${formatDate(file.createdAt)}
            </small>

            <small>
                پیگیری:
                ${formatDate(file.followUpDate)}
            </small>

        </div>

    `;


    return card;

}


/* =========================================================
   FOLLOW UP COUNT
========================================================= */

function updateFollowUpCount() {

    const count =
        files.filter(
            file =>
                getEffectiveStatus(file) ===
                "followup"
        ).length;

    followUpCount.textContent =
        count.toLocaleString("fa-IR");

}


/* =========================================================
   FILTER BUTTONS
========================================================= */

document
    .querySelectorAll(".filter-btn")
    .forEach(button => {

        button.addEventListener(
            "click",
            function () {

                document
                    .querySelectorAll(".filter-btn")
                    .forEach(btn =>
                        btn.classList.remove("active")
                    );

                this.classList.add("active");

                currentFilter =
                    this.dataset.filter;

                renderFiles();

            }
        );

    });


searchInput.addEventListener(
    "input",
    renderFiles
);


/* =========================================================
   FILE MODAL
========================================================= */

function openNewFileModal() {

    fileForm.reset();

    editingFileId.value = "";

    modalEyebrow.textContent =
        "ثبت فایل";

    modalTitle.textContent =
        "فایل جدید";

    followUpDaysInput.value = 10;

    setFileType("sale");

    openModal(fileModal);

}


function openEditFileModal(file) {

    fileForm.reset();

    editingFileId.value =
        file.id;

    modalEyebrow.textContent =
        "ویرایش فایل";

    modalTitle.textContent =
        `ویرایش ${file.code}`;

    setFileType(file.type);

    fillForm(file);

    openModal(fileModal);

}


function openModal(modal) {

    modal.classList.remove("hidden");

    document.body.style.overflow =
        "hidden";

}


function closeModal(modal) {

    modal.classList.add("hidden");

    document.body.style.overflow =
        "";

}


newFileButton.addEventListener(
    "click",
    openNewFileModal
);


emptyNewFileButton.addEventListener(
    "click",
    openNewFileModal
);


closeModalButton.addEventListener(
    "click",
    () => closeModal(fileModal)
);


cancelFormButton.addEventListener(
    "click",
    () => closeModal(fileModal)
);


/* =========================================================
   FILE TYPE
========================================================= */

document
    .querySelectorAll(
        'input[name="fileType"]'
    )
    .forEach(input => {

        input.addEventListener(
            "change",
            function () {

                setFileType(this.value);

            }
        );

    });


function setFileType(type) {

    propertyFields.classList.add("hidden");

    buyerFields.classList.add("hidden");

    tenantFields.classList.add("hidden");

    rentTermsSection.classList.add("hidden");


    if (
        type === "sale" ||
        type === "rent"
    ) {

        propertyFields.classList.remove(
            "hidden"
        );

    }


    if (type === "rent") {

        rentTermsSection.classList.remove(
            "hidden"
        );

    }


    if (type === "buyer") {

        buyerFields.classList.remove(
            "hidden"
        );

    }


    if (type === "tenant") {

        tenantFields.classList.remove(
            "hidden"
        );

    }

}


/* =========================================================
   OCCUPANCY
========================================================= */

occupancy.addEventListener(
    "change",
    updateOccupancyFields
);


function updateOccupancyFields() {

    if (occupancy.value === "tenant") {

        currentTenantFields.classList.remove(
            "hidden"
        );

    } else {

        currentTenantFields.classList.add(
            "hidden"
        );

    }

}


/* =========================================================
   FAMILY
========================================================= */

tenantFamilyStatus.addEventListener(
    "change",
    updateFamilyFields
);


function updateFamilyFields() {

    if (
        tenantFamilyStatus.value ===
        "family"
    ) {

        familySizeField.classList.remove(
            "hidden"
        );

    } else {

        familySizeField.classList.add(
            "hidden"
        );

    }

}


/* =========================================================
   GET SELECTED AMENITIES
========================================================= */

function getAmenities() {

    return [
        ...document.querySelectorAll(
            ".amenities input[type='checkbox']:checked"
        )
    ].map(input => input.value);

}


/* =========================================================
   SET AMENITIES
========================================================= */

function setAmenities(amenities = []) {

    document
        .querySelectorAll(
            ".amenities input[type='checkbox']"
        )
        .forEach(input => {

            input.checked =
                amenities.includes(input.value);

        });

}


/* =========================================================
   CREATE FILE OBJECT
========================================================= */

function createFileFromForm() {

    const type =
        document.querySelector(
            'input[name="fileType"]:checked'
        ).value;


    const existingId =
        editingFileId.value;


    const existingFile =
        files.find(
            file => file.id === existingId
        );


    const createdAt =
        existingFile
            ? existingFile.createdAt
            : getTodayISO();


    const followUpDays =
        Number(
            followUpDaysInput.value
        ) || 10;


    const followUpDate =
        addDays(
            getTodayISO(),
            followUpDays
        );


    const base = {

        id:
            existingFile
                ? existingFile.id
                : generateId(),

        code:
            existingFile
                ? existingFile.code
                : generateFileCode(),

        type,

        createdAt,

        updatedAt:
            getTodayISO(),

        followUpDays,

        followUpDate,

        status:
            existingFile?.status === "reserved" ||
            existingFile?.status === "done" ||
            existingFile?.status === "archived"
                ? existingFile.status
                : "active"

    };


    /* =====================
       PROPERTY
    ====================== */

    if (
        type === "sale" ||
        type === "rent"
    ) {

        base.propertyName =
            getValue("propertyName");

        base.propertyType =
            getValue("propertyType");

        base.propertyArea =
            getValue("propertyArea");

        base.propertyRooms =
            getValue("propertyRooms");

        base.propertyYear =
            getValue("propertyYear");

        base.propertyLocation =
            getValue("propertyLocation");

        base.propertyPhone =
            getValue("propertyPhone");

        base.keyHolder =
            getValue("keyHolder");

        base.propertyCondition =
            getValue("propertyCondition");

        base.occupancy =
            getValue("occupancy");

        base.currentDeposit =
            getValue("currentDeposit");

        base.currentRent =
            getValue("currentRent");

        base.suggestedDeposit =
            getValue("suggestedDeposit");

        base.suggestedRent =
            getValue("suggestedRent");

        base.amenities =
            getAmenities();

    }


    /* =====================
       BUYER
    ====================== */

    if (type === "buyer") {

        base.buyerName =
            getValue("buyerName");

        base.buyerPhone =
            getValue("buyerPhone");

        base.buyerPropertyType =
            getValue("buyerPropertyType");

        base.buyerArea =
            getValue("buyerArea");

        base.buyerRooms =
            getValue("buyerRooms");

        base.buyerYear =
            getValue("buyerYear");

        base.buyerLocation =
            getValue("buyerLocation");

        base.buyerCapital =
            getValue("buyerCapital");

        base.buyerNotes =
            getValue("buyerNotes");

    }


    /* =====================
       TENANT
    ====================== */

    if (type === "tenant") {

        base.tenantName =
            getValue("tenantName");

        base.tenantPhone =
            getValue("tenantPhone");

        base.tenantPropertyType =
            getValue("tenantPropertyType");

        base.tenantArea =
            getValue("tenantArea");

        base.tenantRooms =
            getValue("tenantRooms");

        base.tenantYear =
            getValue("tenantYear");

        base.tenantLocation =
            getValue("tenantLocation");

        base.tenantDeposit =
            getValue("tenantDeposit");

        base.tenantRent =
            getValue("tenantRent");

        base.tenantFamilyStatus =
            getValue("tenantFamilyStatus");

        base.tenantFamilySize =
            getValue("tenantFamilySize");

        base.tenantNotes =
            getValue("tenantNotes");

    }


    return base;

}


/* =========================================================
   GET VALUE
========================================================= */

function getValue(id) {

    const element =
        document.getElementById(id);

    return element
        ? element.value.trim()
        : "";

}


/* =========================================================
   SET VALUE
========================================================= */

function setValue(id, value) {

    const element =
        document.getElementById(id);

    if (element) {

        element.value =
            value ?? "";

    }

}


/* =========================================================
   SAVE FORM
========================================================= */

fileForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();


        const newFile =
            createFileFromForm();


        const existingIndex =
            files.findIndex(
                file =>
                    file.id === newFile.id
            );


        if (existingIndex >= 0) {

            files[existingIndex] =
                newFile;

        } else {

            files.push(newFile);

        }


        saveFiles();

        closeModal(fileModal);

        renderFiles();

    }
);


/* =========================================================
   FILL FORM
========================================================= */

function fillForm(file) {

    document.querySelector(
        `input[name="fileType"][value="${file.type}"]`
    ).checked = true;


    if (
        file.type === "sale" ||
        file.type === "rent"
    ) {

        setValue(
            "propertyName",
            file.propertyName
        );

        setValue(
            "propertyType",
            file.propertyType
        );

        setValue(
            "propertyArea",
            file.propertyArea
        );

        setValue(
            "propertyRooms",
            file.propertyRooms
        );

        setValue(
            "propertyYear",
            file.propertyYear
        );

        setValue(
            "propertyLocation",
            file.propertyLocation
        );

        setValue(
            "propertyPhone",
            file.propertyPhone
        );

        setValue(
            "keyHolder",
            file.keyHolder
        );

        setValue(
            "propertyCondition",
            file.propertyCondition
        );

        setValue(
            "occupancy",
            file.occupancy
        );

        setValue(
            "currentDeposit",
            file.currentDeposit
        );

        setValue(
            "currentRent",
            file.currentRent
        );

        setValue(
            "suggestedDeposit",
            file.suggestedDeposit
        );

        setValue(
            "suggestedRent",
            file.suggestedRent
        );

        setAmenities(
            file.amenities || []
        );

        updateOccupancyFields();

    }


    if (file.type === "buyer") {

        setValue(
            "buyerName",
            file.buyerName
        );

        setValue(
            "buyerPhone",
            file.buyerPhone
        );

        setValue(
            "buyerPropertyType",
            file.buyerPropertyType
        );

        setValue(
            "buyerArea",
            file.buyerArea
        );

        setValue(
            "buyerRooms",
            file.buyerRooms
        );

        setValue(
            "buyerYear",
            file.buyerYear
        );

        setValue(
            "buyerLocation",
            file.buyerLocation
        );

        setValue(
            "buyerCapital",
            file.buyerCapital
        );

        setValue(
            "buyerNotes",
            file.buyerNotes
        );

    }


    if (file.type === "tenant") {

        setValue(
            "tenantName",
            file.tenantName
        );

        setValue(
            "tenantPhone",
            file.tenantPhone
        );

        setValue(
            "tenantPropertyType",
            file.tenantPropertyType
        );

        setValue(
            "tenantArea",
            file.tenantArea
        );

        setValue(
            "tenantRooms",
            file.tenantRooms
        );

        setValue(
            "tenantYear",
            file.tenantYear
        );

        setValue(
            "tenantLocation",
            file.tenantLocation
        );

        setValue(
            "tenantDeposit",
            file.tenantDeposit
        );

        setValue(
            "tenantRent",
            file.tenantRent
        );

        setValue(
            "tenantFamilyStatus",
            file.tenantFamilyStatus
        );

        setValue(
            "tenantFamilySize",
            file.tenantFamilySize
        );

        setValue(
            "tenantNotes",
            file.tenantNotes
        );

        updateFamilyFields();

    }


    // مقدار تقریبی قبلی
    followUpDaysInput.value =
        file.followUpDays || 10;

}


/* =========================================================
   CARD CLICK
========================================================= */

filesContainer.addEventListener(
    "click",
    function (event) {

        const card =
            event.target.closest(".file-card");

        if (!card) {
            return;
        }

        const id =
            card.dataset.id;

        const file =
            files.find(
                item => item.id === id
            );

        if (file) {

            openDetail(file);

        }

    }
);


/* =========================================================
   DETAIL
========================================================= */

function openDetail(file) {

    currentDetailId =
        file.id;

    detailTitle.textContent =
        getFileTitle(file);

    detailType.textContent =
        `${file.code} • ${typeLabels[file.type]}`;


    detailContent.innerHTML =
        buildDetailHTML(file);


    openModal(detailModal);

}


function getFileTitle(file) {

    if (file.type === "sale") {

        return file.propertyName ||
            "ملک بدون نام";

    }

    if (file.type === "rent") {

        return file.propertyName ||
            "ملک بدون نام";

    }

    if (file.type === "buyer") {

        return file.buyerName ||
            "خریدار بدون نام";

    }

    if (file.type === "tenant") {

        return file.tenantName ||
            "مستاجر بدون نام";

    }

    return "فایل";

}


/* =========================================================
   DETAIL HTML
========================================================= */

function detailItem(label, value) {

    return `

        <div class="detail-item">

            <span>
                ${escapeHTML(label)}
            </span>

            <b>
                ${escapeHTML(value || "-")}
            </b>

        </div>

    `;

}


function buildDetailHTML(file) {

    const status =
        getEffectiveStatus(file);


    let html = `

        <div class="detail-section">

            <div class="detail-section-title">
                وضعیت فایل
            </div>

            <div class="detail-grid">

                ${detailItem(
                    "کد فایل",
                    file.code
                )}

                ${detailItem(
                    "وضعیت",
                    getStatusLabel(status)
                )}

                ${detailItem(
                    "تاریخ ثبت",
                    formatDate(file.createdAt)
                )}

                ${detailItem(
                    "تاریخ پیگیری",
                    formatDate(file.followUpDate)
                )}

            </div>

        </div>

    `;


    /* =====================
       PROPERTY
    ====================== */

    if (
        file.type === "sale" ||
        file.type === "rent"
    ) {

        html += `

            <div class="detail-section">

                <div class="detail-section-title">
                    اطلاعات ملک
                </div>

                <div class="detail-grid">

                    ${detailItem(
                        "نام",
                        file.propertyName
                    )}

                    ${detailItem(
                        "نوع ملک",
                        propertyTypeLabels[file.propertyType]
                    )}

                    ${detailItem(
                        "متراژ",
                        file.propertyArea
                            ? `${file.propertyArea} متر`
                            : "-"
                    )}

                    ${detailItem(
                        "تعداد اتاق",
                        file.propertyRooms
                    )}

                    ${detailItem(
                        "سال ساخت",
                        file.propertyYear
                    )}

                    ${detailItem(
                        "محدوده",
                        file.propertyLocation
                    )}

                    ${detailItem(
                        "شماره مالک",
                        file.propertyPhone
                    )}

                    ${detailItem(
                        "کلید نزد",
                        keyHolderLabels[file.keyHolder]
                    )}

                    ${detailItem(
                        "وضعیت",
                        conditionLabels[file.propertyCondition]
                    )}

                    ${detailItem(
                        "سکونت",
                        occupancyLabels[file.occupancy]
                    )}

                </div>

            </div>

        `;


        if (file.occupancy === "tenant") {

            html += `

                <div class="detail-section">

                    <div class="detail-section-title">
                        مستاجر فعلی
                    </div>

                    <div class="detail-grid">

                        ${detailItem(
                            "رهن فعلی",
                            formatNumber(file.currentDeposit)
                        )}

                        ${detailItem(
                            "اجاره فعلی",
                            formatNumber(file.currentRent)
                        )}

                    </div>

                </div>

            `;

        }


        if (file.type === "rent") {

            html += `

                <div class="detail-section">

                    <div class="detail-section-title">
                        شرایط اجاره پیشنهادی
                    </div>

                    <div class="detail-grid">

                        ${detailItem(
                            "رهن پیشنهادی",
                            formatNumber(file.suggestedDeposit)
                        )}

                        ${detailItem(
                            "اجاره پیشنهادی",
                            formatNumber(file.suggestedRent)
                        )}

                    </div>

                </div>

            `;

        }


        if (
            file.amenities &&
            file.amenities.length
        ) {

            html += `

                <div class="detail-section">

                    <div class="detail-section-title">
                        امکانات
                    </div>

                    <div class="amenity-list">

                        ${file.amenities
                            .map(
                                item => `
                                    <span class="amenity-tag">
                                        ${escapeHTML(
                                            amenityLabels[item] || item
                                        )}
                                    </span>
                                `
                            )
                            .join("")
                        }

                    </div>

                </div>

            `;

        }

    }


    /* =====================
       BUYER
    ====================== */

    if (file.type === "buyer") {

        html += `

            <div class="detail-section">

                <div class="detail-section-title">
                    اطلاعات خریدار
                </div>

                <div class="detail-grid">

                    ${detailItem(
                        "نام",
                        file.buyerName
                    )}

                    ${detailItem(
                        "شماره تماس",
                        file.buyerPhone
                    )}

                    ${detailItem(
                        "نوع ملک",
                        propertyTypeLabels[file.buyerPropertyType]
                    )}

                    ${detailItem(
                        "متراژ",
                        file.buyerArea
                    )}

                    ${detailItem(
                        "تعداد اتاق",
                        file.buyerRooms
                    )}

                    ${detailItem(
                        "سال ساخت",
                        file.buyerYear
                    )}

                    ${detailItem(
                        "محدوده",
                        file.buyerLocation
                    )}

                    ${detailItem(
                        "سرمایه",
                        formatNumber(file.buyerCapital)
                    )}

                </div>

            </div>

        `;


        if (file.buyerNotes) {

            html += `

                <div class="detail-section">

                    <div class="detail-section-title">
                        توضیحات خریدار
                    </div>

                    <div class="detail-notes">
                        ${escapeHTML(file.buyerNotes)}
                    </div>

                </div>

            `;

        }

    }


    /* =====================
       TENANT
    ====================== */

    if (file.type === "tenant") {

        html += `

            <div class="detail-section">

                <div class="detail-section-title">
                    اطلاعات مستاجر
                </div>

                <div class="detail-grid">

                    ${detailItem(
                        "نام",
                        file.tenantName
                    )}

                    ${detailItem(
                        "شماره تماس",
                        file.tenantPhone
                    )}

                    ${detailItem(
                        "نوع ملک",
                        propertyTypeLabels[file.tenantPropertyType]
                    )}

                    ${detailItem(
                        "متراژ",
                        file.tenantArea
                    )}

                    ${detailItem(
                        "تعداد اتاق",
                        file.tenantRooms
                    )}

                    ${detailItem(
                        "سال ساخت",
                        file.tenantYear
                    )}

                    ${detailItem(
                        "محدوده",
                        file.tenantLocation
                    )}

                    ${detailItem(
                        "رهن",
                        formatNumber(file.tenantDeposit)
                    )}

                    ${detailItem(
                        "اجاره",
                        formatNumber(file.tenantRent)
                    )}

                    ${detailItem(
                        "وضعیت خانوادگی",
                        familyLabels[file.tenantFamilyStatus]
                    )}

                    ${detailItem(
                        "تعداد نفرات",
                        file.tenantFamilySize
                    )}

                </div>

            </div>

        `;


        if (file.tenantNotes) {

            html += `

                <div class="detail-section">

                    <div class="detail-section-title">
                        توضیحات مستاجر
                    </div>

                    <div class="detail-notes">
                        ${escapeHTML(file.tenantNotes)}
                    </div>

                </div>

            `;

        }

    }


    return html;

}


/* =========================================================
   CLOSE DETAIL
========================================================= */

closeDetailButton.addEventListener(
    "click",
    () => closeModal(detailModal)
);


/* =========================================================
   EDIT
========================================================= */

editDetailButton.addEventListener(
    "click",
    function () {

        const file =
            files.find(
                item =>
                    item.id === currentDetailId
            );

        if (!file) {
            return;
        }

        closeModal(detailModal);

        openEditFileModal(file);

    }
);


/* =========================================================
   DELETE
========================================================= */

deleteDetailButton.addEventListener(
    "click",
    function () {

        const file =
            files.find(
                item =>
                    item.id === currentDetailId
            );

        if (!file) {
            return;
        }


        const confirmed =
            confirm(
                `آیا از حذف فایل ${file.code} مطمئن هستید؟`
            );


        if (!confirmed) {
            return;
        }


        files =
            files.filter(
                item =>
                    item.id !== currentDetailId
            );


        saveFiles();

        closeModal(detailModal);

        renderFiles();

    }
);


/* =========================================================
   RENEW
========================================================= */

renewDetailButton.addEventListener(
    "click",
    function () {

        currentRenewId =
            currentDetailId;

        closeModal(detailModal);

        openModal(renewModal);

    }
);


closeRenewButton.addEventListener(
    "click",
    () => closeModal(renewModal)
);


document
    .querySelectorAll(".renew-options button")
    .forEach(button => {

        button.addEventListener(
            "click",
            function () {

                const days =
                    Number(
                        this.dataset.days
                    );

                renewFollowUp(
                    currentRenewId,
                    days
                );

            }
        );

    });


function renewFollowUp(id, days) {

    const file =
        files.find(
            item => item.id === id
        );

    if (!file) {
        return;
    }


    file.followUpDays =
        days;

    file.followUpDate =
        addDays(
            getTodayISO(),
            days
        );


    // اگر فایل نیازمند پیگیری بوده،
    // با تمدید دوباره فعال می‌شود.

    if (
        file.status === "active" ||
        file.status === undefined ||
        file.status === "followup"
    ) {

        file.status = "active";

    }


    file.updatedAt =
        getTodayISO();


    saveFiles();

    closeModal(renewModal);

    renderFiles();


    // باز کردن دوباره جزئیات

    const updatedFile =
        files.find(
            item => item.id === id
        );

    if (updatedFile) {

        openDetail(updatedFile);

    }

}


/* =========================================================
   FOLLOW UP FILTER
========================================================= */

followUpButton.addEventListener(
    "click",
    function () {

        currentFilter = "followup";

        document
            .querySelectorAll(".filter-btn")
            .forEach(btn =>
                btn.classList.remove("active")
            );

        const button =
            document.querySelector(
                '.filter-btn[data-filter="followup"]'
            );

        if (button) {
            button.classList.add("active");
        }

        renderFiles();

    }
);


/* =========================================================
   MODAL OVERLAY
========================================================= */

document
    .querySelectorAll(".modal-overlay")
    .forEach(overlay => {

        overlay.addEventListener(
            "click",
            function () {

                const modal =
                    this.closest(".modal");

                if (modal) {

                    closeModal(modal);

                }

            }
        );

    });


/* =========================================================
   ESC KEY
========================================================= */

document.addEventListener(
    "keydown",
    function (event) {

        if (event.key !== "Escape") {
            return;
        }

        document
            .querySelectorAll(".modal:not(.hidden)")
            .forEach(modal =>
                closeModal(modal)
            );

    }
);


/* =========================================================
   INITIALIZE
========================================================= */

checkLogin();
