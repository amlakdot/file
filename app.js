"use strict";

/*
========================================================
DOT REAL ESTATE
GitHub-only storage
========================================================

Repository:
https://github.com/amlakdot/file

Data file:
data/files.json

IMPORTANT:
GitHub token is kept only in memory.
It is NOT saved to localStorage.
========================================================
*/


/* ======================================================
   CONFIG
====================================================== */

const CONFIG = {
    owner: "amlakdot",
    repo: "file",
    branch: "main",
    dataPath: "data/files.json",

    githubApi: "https://api.github.com",

    pollInterval: 5 * 60 * 1000,

    username: "admin",

    // SHA-256 of the site's password.
    //
    // Default password:
    // 123456
    //
    // You can replace this hash later.
    passwordHash:
        "8d969eef6ecad3c29a3a629280e686cff8fab7d8b6b5e3b8f8a7f8b8b7e8f8a"
};


/*
========================================================
STATE
========================================================
*/

const state = {
    token: null,

    files: [],

    fileSha: null,

    currentFilter: "all",

    search: "",

    selectedFileId: null,

    loading: false
};


/*
========================================================
USERS
========================================================
*/

const USER_NAMES = {
    admin: "مدیر"
};


/*
========================================================
TYPE LABELS
========================================================
*/

const TYPE_LABELS = {
    sale: "ملک فروشی",
    landlord: "مالک / موجر",
    buyer: "خریدار",
    tenant: "مستاجر"
};

const PROPERTY_LABELS = {
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


/*
========================================================
DOM
========================================================
*/

const $ = (selector) =>
    document.querySelector(selector);

const $$ = (selector) =>
    [...document.querySelectorAll(selector)];


/*
========================================================
LOGIN
========================================================
*/

document
    .getElementById("loginForm")
    .addEventListener("submit", handleLogin);


/*
========================================================
INIT
========================================================
*/

document.addEventListener("DOMContentLoaded", () => {

    setupEvents();

});


/*
========================================================
EVENTS
========================================================
*/

function setupEvents() {

    $("#logoutButton")
        .addEventListener("click", logout);

    $("#newFileButton")
        .addEventListener("click", openNewFile);

    $("#emptyNewFileButton")
        .addEventListener("click", openNewFile);

    $("#followUpButton")
        .addEventListener("click", () => {

            state.currentFilter = "followup";

            updateFilterButtons();

            renderFiles();

        });

    $("#searchInput")
        .addEventListener("input", (event) => {

            state.search =
                event.target.value.trim().toLowerCase();

            renderFiles();

        });


    $$(".filter-button").forEach((button) => {

        button.addEventListener("click", () => {

            state.currentFilter =
                button.dataset.filter;

            updateFilterButtons();

            renderFiles();

        });

    });


    $("#closeModalButton")
        .addEventListener("click", closeFileModal);

    $("#cancelFormButton")
        .addEventListener("click", closeFileModal);

    $("#fileForm")
        .addEventListener("submit", saveFile);


    $$('input[name="fileType"]').forEach((input) => {

        input.addEventListener("change", updateFormVisibility);

    });


    $("#occupancy")
        .addEventListener("change", updateOccupancyFields);

    $("#familyStatus")
        .addEventListener("change", updateFamilyFields);


    $("#closeDetailButton")
        .addEventListener("click", closeDetailModal);

    $("#editDetailButton")
        .addEventListener("click", editSelectedFile);

    $("#renewDetailButton")
        .addEventListener("click", openRenewModal);

    $("#deleteDetailButton")
        .addEventListener("click", deleteSelectedFile);


    $("#closeRenewButton")
        .addEventListener("click", closeRenewModal);


    $$(".renew-button").forEach((button) => {

        button.addEventListener("click", () => {

            const days =
                Number(button.dataset.days);

            renewSelectedFile(days);

        });

    });


    // Close modals by clicking backdrop.

    $$(".modal-backdrop").forEach((backdrop) => {

        backdrop.addEventListener("click", () => {

            const modal =
                backdrop.closest(".modal");

            if (modal) {
                modal.classList.add("hidden");
            }

        });

    });


    // Escape key.

    document.addEventListener("keydown", (event) => {

        if (event.key !== "Escape") {
            return;
        }

        closeFileModal();
        closeDetailModal();
        closeRenewModal();

    });

}


/*
========================================================
LOGIN
========================================================
*/

async function handleLogin(event) {

    event.preventDefault();

    const username =
        $("#username").value.trim();

    const password =
        $("#password").value;

    const token =
        $("#githubToken").value.trim();

    showLoginError("");

    if (!username || !password || !token) {

        showLoginError(
            "لطفاً همه اطلاعات ورود را وارد کنید."
        );

        return;
    }


    if (username !== CONFIG.username) {

        showLoginError(
            "نام کاربری یا رمز عبور اشتباه است."
        );

        return;
    }


    const validPassword =
        await verifyPassword(password);

    if (!validPassword) {

        showLoginError(
            "نام کاربری یا رمز عبور اشتباه است."
        );

        return;
    }


    try {

        state.token = token;

        await testGitHubAccess();

        $("#loginScreen")
            .classList.add("hidden");

        $("#appScreen")
            .classList.remove("hidden");

        setSyncStatus(
            "online",
            "متصل به GitHub"
        );

        await loadFiles();

        startPolling();

    } catch (error) {

        state.token = null;

        console.error(error);

        showLoginError(
            getErrorMessage(error)
        );

    }

}


/*
========================================================
PASSWORD HASH
========================================================
*/

async function sha256(text) {

    const data =
        new TextEncoder().encode(text);

    const hashBuffer =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );

    const hashArray =
        Array.from(
            new Uint8Array(hashBuffer)
        );

    return hashArray
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");

}


async function verifyPassword(password) {

    /*
    ----------------------------------------------------
    NOTE
    ----------------------------------------------------

    The password hash above is intentionally replaceable.

    For the default demo password use:

    123456

    If you want a different password, use the browser
    console with:

    sha256("YOUR_PASSWORD")

    and replace CONFIG.passwordHash.
    ----------------------------------------------------
    */

    const hash =
        await sha256(password);

    return hash === CONFIG.passwordHash;

}


/*
========================================================
GITHUB API
========================================================
*/

function githubHeaders() {

    return {
        "Accept":
            "application/vnd.github+json",

        "Authorization":
            `Bearer ${state.token}`,

        "X-GitHub-Api-Version":
            "2026-03-10"
    };

}


function dataUrl() {

    return (
        `${CONFIG.githubApi}/repos/` +
        `${CONFIG.owner}/` +
        `${CONFIG.repo}/contents/` +
        `${CONFIG.dataPath}`
    );

}


/*
========================================================
TEST GITHUB ACCESS
========================================================
*/

async function testGitHubAccess() {

    const response =
        await fetch(
            `${CONFIG.githubApi}/user`,
            {
                headers: githubHeaders()
            }
        );


    if (!response.ok) {

        throw new Error(
            "توکن GitHub معتبر نیست."
        );

    }


    const user =
        await response.json();


    if (!user.login) {

        throw new Error(
            "امکان شناسایی حساب GitHub وجود ندارد."
        );

    }

}


/*
========================================================
LOAD FILES
========================================================
*/

async function loadFiles(options = {}) {

    const silent =
        options.silent === true;

    if (!silent) {

        setSyncStatus(
            "loading",
            "در حال دریافت اطلاعات..."
        );

    }


    try {

        const response =
            await fetch(
                `${dataUrl()}?ref=${encodeURIComponent(CONFIG.branch)}&t=${Date.now()}`,
                {
                    method: "GET",

                    headers: {
                        ...githubHeaders(),

                        "Cache-Control":
                            "no-cache"
                    },

                    cache: "no-store"
                }
            );


        if (!response.ok) {

            if (response.status === 404) {

                throw new Error(
                    "فایل data/files.json پیدا نشد."
                );

            }

            throw new Error(
                `GitHub خطای ${response.status} برگرداند.`
            );

        }


        const data =
            await response.json();


        state.fileSha =
            data.sha;


        const decoded =
            decodeBase64Unicode(
                data.content
            );


        const json =
            JSON.parse(decoded);


        state.files =
            Array.isArray(json.files)
                ? json.files
                : [];


        renderFiles();


        updateFollowUpCount();


        setSyncStatus(
            "online",
            "همگام است"
        );


        const date =
            json.updatedAt
                ? new Date(json.updatedAt)
                : new Date();


        $("#lastSyncText")
            .textContent =
                `آخرین بروزرسانی: ${formatDateTime(date)}`;


    } catch (error) {

        console.error(error);

        setSyncStatus(
            "error",
            "خطا در اتصال به GitHub"
        );

        if (!silent) {

            showToast(
                getErrorMessage(error),
                "error"
            );

        }

        throw error;

    }

}


/*
========================================================
SAVE FILES TO GITHUB
========================================================
*/

async function saveDatabase(files) {

    if (!state.token) {

        throw new Error(
            "توکن GitHub وجود ندارد."
        );

    }


    const payload = {

        version: 1,

        updatedAt:
            new Date().toISOString(),

        files

    };


    const content =
        encodeBase64Unicode(
            JSON.stringify(
                payload,
                null,
                2
            )
        );


    const body = {

        message:
            "Update real estate files",

        content,

        branch:
            CONFIG.branch,

        sha:
            state.fileSha

    };


    setSyncStatus(
        "loading",
        "در حال ذخیره در GitHub..."
    );


    const response =
        await fetch(
            dataUrl(),
            {
                method: "PUT",

                headers: {
                    ...githubHeaders(),

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(body)
            }
        );


    if (!response.ok) {

        let message =
            `GitHub خطای ${response.status} برگرداند.`;

        try {

            const error =
                await response.json();

            if (error.message) {
                message =
                    error.message;
            }

        } catch {
            // Ignore JSON parsing errors.
        }


        throw new Error(message);

    }


    const result =
        await response.json();


    if (result.content?.sha) {

        state.fileSha =
            result.content.sha;

    }


    state.files =
        files;


    renderFiles();

    updateFollowUpCount();


    setSyncStatus(
        "online",
        "با موفقیت ذخیره شد"
    );


    $("#lastSyncText")
        .textContent =
            `آخرین ذخیره: ${formatDateTime(new Date())}`;

}


/*
========================================================
SAFE SAVE
========================================================
*/

async function commitFiles(mutator) {

    /*
    ----------------------------------------------------
    Before writing, fetch the latest version.

    This reduces the chance that two consultants overwrite
    each other when they save close together.
    ----------------------------------------------------
    */

    await loadFiles({
        silent: true
    });


    const latestFiles =
        JSON.parse(
            JSON.stringify(state.files)
        );


    const result =
        await mutator(latestFiles);


    const filesToSave =
        Array.isArray(result)
            ? result
            : latestFiles;


    try {

        await saveDatabase(
            filesToSave
        );

    } catch (error) {

        /*
        Retry once using the newest SHA.
        */

        if (
            error.message
                .toLowerCase()
                .includes("sha")
        ) {

            await loadFiles({
                silent: true
            });

            const retryFiles =
                JSON.parse(
                    JSON.stringify(state.files)
                );

            const retryResult =
                await mutator(retryFiles);

            await saveDatabase(
                Array.isArray(retryResult)
                    ? retryResult
                    : retryFiles
            );

        } else {

            throw error;

        }

    }

}


/*
========================================================
CREATE FILE
========================================================
*/

async function createFile(file) {

    await commitFiles((files) => {

        files.unshift(file);

        return files;

    });

}


/*
========================================================
UPDATE FILE
========================================================
*/

async function updateFile(id, changes) {

    await commitFiles((files) => {

        const index =
            files.findIndex(
                file => file.id === id
            );


        if (index === -1) {

            throw new Error(
                "فایل موردنظر پیدا نشد."
            );

        }


        files[index] = {
            ...files[index],
            ...changes,
            updatedAt:
                new Date().toISOString()
        };


        return files;

    });

}


/*
========================================================
DELETE FILE
========================================================
*/

async function removeFile(id) {

    await commitFiles((files) => {

        return files.filter(
            file => file.id !== id
        );

    });

}


/*
========================================================
POLLING
========================================================
*/

let pollingTimer = null;


function startPolling() {

    stopPolling();


    pollingTimer =
        setInterval(
            async () => {

                try {

                    await loadFiles({
                        silent: true
                    });

                } catch (error) {

                    console.error(
                        "Polling error:",
                        error
                    );

                }

            },
            CONFIG.pollInterval
        );

}


function stopPolling() {

    if (pollingTimer) {

        clearInterval(
            pollingTimer
        );

        pollingTimer = null;

    }

}


/*
========================================================
FORM
========================================================
*/

function getSelectedFileType() {

    return $(
        'input[name="fileType"]:checked'
    )?.value || "sale";

}


function updateFormVisibility() {

    const type =
        getSelectedFileType();


    const propertyDetails =
        $("#propertyDetailsSection");

    const buyerSection =
        $("#buyerSection");

    const tenantSection =
        $("#tenantSection");

    const amenities =
        $("#amenitiesSection");


    propertyDetails
        .classList.toggle(
            "hidden",
            type === "buyer" ||
            type === "tenant"
        );


    buyerSection
        .classList.toggle(
            "hidden",
            type !== "buyer"
        );


    tenantSection
        .classList.toggle(
            "hidden",
            type !== "tenant"
        );


    amenities
        .classList.toggle(
            "hidden",
            type === "buyer" ||
            type === "tenant"
        );


    $$(".landlord-only")
        .forEach((element) => {

            element.classList.toggle(
                "hidden",
                type !== "landlord"
            );

        });


    if (type === "tenant") {

        $("#propertyType")
            .value = "apartment";

    }


    updateOccupancyFields();

}


function updateOccupancyFields() {

    const occupancy =
        $("#occupancy").value;


    const showTenantValues =
        occupancy === "tenant";


    $("#currentDepositField")
        .classList.toggle(
            "hidden",
            !showTenantValues
        );


    $("#currentRentField")
        .classList.toggle(
            "hidden",
            !showTenantValues
        );

}


function updateFamilyFields() {

    const status =
        $("#familyStatus").value;


    $("#familySizeField")
        .classList.toggle(
            "hidden",
            status === "single"
        );

}


/*
========================================================
OPEN NEW FILE
========================================================
*/

function openNewFile() {

    resetForm();


    $("#modalEyebrow")
        .textContent =
            "فایل جدید";

    $("#modalTitle")
        .textContent =
            "ثبت فایل";


    $("#fileModal")
        .classList.remove("hidden");


    updateFormVisibility();

}


/*
========================================================
RESET FORM
========================================================
*/

function resetForm() {

    $("#fileForm").reset();

    $("#editingFileId").value = "";

    $("#followUpDays").value = 10;

    $('input[name="fileType"][value="sale"]')
        .checked = true;


    $$(".amenity")
        .forEach(
            checkbox =>
                checkbox.checked = false
        );


    updateFormVisibility();

    updateOccupancyFields();

    updateFamilyFields();

}


/*
========================================================
SAVE FORM
========================================================
*/

async function saveFile(event) {

    event.preventDefault();


    if (state.loading) {
        return;
    }


    state.loading = true;


    try {

        const type =
            getSelectedFileType();


        const id =
            $("#editingFileId").value.trim();


        const name =
            $("#name").value.trim();


        const phone =
            $("#phone").value.trim();


        if (!name) {

            throw new Error(
                "نام را وارد کنید."
            );

        }


        if (!phone) {

            throw new Error(
                "شماره تماس را وارد کنید."
            );

        }


        const followUpDays =
            Math.max(
                1,
                Number(
                    $("#followUpDays").value
                ) || 10
            );


        const now =
            new Date();


        const existing =
            id
                ? state.files.find(
                    file =>
                        file.id === id
                )
                : null;


        const followUpAt =
            existing?.followUpAt ||
            addDays(
                now,
                followUpDays
            ).toISOString();


        const common = {

            name,

            phone,

            propertyType:
                $("#propertyType").value,

            area:
                numberOrNull(
                    $("#area").value
                ),

            rooms:
                numberOrNull(
                    $("#rooms").value
                ),

            year:
                numberOrNull(
                    $("#year").value
                ),

            location:
                $("#location").value.trim()

        };


        const file = {

            id:
                id ||
                generateId(),

            type,

            ...common,

            keyHolder:
                $("#keyHolder").value,

            condition:
                $("#condition").value,

            occupancy:
                $("#occupancy").value,

            currentDeposit:
                numberOrNull(
                    $("#currentDeposit").value
                ),

            currentRent:
                numberOrNull(
                    $("#currentRent").value
                ),

            suggestedDeposit:
                numberOrNull(
                    $("#suggestedDeposit").value
                ),

            suggestedRent:
                numberOrNull(
                    $("#suggestedRent").value
                ),

            capital:
                numberOrNull(
                    $("#capital").value
                ),

            buyerNotes:
                $("#buyerNotes").value.trim(),

            tenantDeposit:
                numberOrNull(
                    $("#tenantDeposit").value
                ),

            tenantRent:
                numberOrNull(
                    $("#tenantRent").value
                ),

            familyStatus:
                $("#familyStatus").value,

            familySize:
                numberOrNull(
                    $("#familySize").value
                ),

            tenantNotes:
                $("#tenantNotes").value.trim(),

            amenities:
                $$(".amenity:checked")
                    .map(
                        checkbox =>
                            checkbox.value
                    ),

            followUpAt,

            followUpDays,

            createdAt:
                existing?.createdAt ||
                now.toISOString(),

            updatedAt:
                now.toISOString(),

            createdBy:
                existing?.createdBy ||
                USER_NAMES[CONFIG.username] ||
                CONFIG.username

        };


        if (existing) {

            await updateFile(
                id,
                file
            );

            showToast(
                "فایل با موفقیت ویرایش شد."
            );

        } else {

            await createFile(
                file
            );

            showToast(
                "فایل با موفقیت ذخیره شد."
            );

        }


        closeFileModal();


        /*
        ------------------------------------------------
        The GitHub commit is already done.
        GitHub Actions can now run from that commit.
        ------------------------------------------------
        */

    } catch (error) {

        console.error(error);

        showToast(
            getErrorMessage(error),
            "error"
        );

    } finally {

        state.loading = false;

    }

}


/*
========================================================
EDIT
========================================================
*/

function editSelectedFile() {

    const file =
        state.files.find(
            item =>
                item.id ===
                state.selectedFileId
        );


    if (!file) {
        return;
    }


    closeDetailModal();

    fillForm(file);


    $("#modalEyebrow")
        .textContent =
            "ویرایش فایل";

    $("#modalTitle")
        .textContent =
            "ویرایش فایل";


    $("#fileModal")
        .classList.remove("hidden");


    updateFormVisibility();

}


/*
========================================================
FILL FORM
========================================================
*/

function fillForm(file) {

    $("#editingFileId")
        .value = file.id || "";


    $$(
        'input[name="fileType"]'
    ).forEach((radio) => {

        radio.checked =
            radio.value === file.type;

    });


    $("#name").value =
        file.name || "";

    $("#phone").value =
        file.phone || "";

    $("#propertyType").value =
        file.propertyType ||
        "apartment";

    $("#area").value =
        file.area ?? "";

    $("#rooms").value =
        file.rooms ?? "";

    $("#year").value =
        file.year ?? "";

    $("#location").value =
        file.location || "";


    $("#keyHolder").value =
        file.keyHolder ||
        "owner";

    $("#condition").value =
        file.condition ||
        "new";

    $("#occupancy").value =
        file.occupancy ||
        "empty";


    $("#currentDeposit").value =
        file.currentDeposit ?? "";

    $("#currentRent").value =
        file.currentRent ?? "";


    $("#suggestedDeposit").value =
        file.suggestedDeposit ?? "";

    $("#suggestedRent").value =
        file.suggestedRent ?? "";


    $("#capital").value =
        file.capital ?? "";

    $("#buyerNotes").value =
        file.buyerNotes || "";


    $("#tenantDeposit").value =
        file.tenantDeposit ?? "";

    $("#tenantRent").value =
        file.tenantRent ?? "";

    $("#familyStatus").value =
        file.familyStatus ||
        "single";

    $("#familySize").value =
        file.familySize ?? "";

    $("#tenantNotes").value =
        file.tenantNotes || "";


    $("#followUpDays").value =
        file.followUpDays ||
        10;


    const amenities =
        Array.isArray(file.amenities)
            ? file.amenities
            : [];


    $$(".amenity")
        .forEach((checkbox) => {

            checkbox.checked =
                amenities.includes(
                    checkbox.value
                );

        });


    updateFormVisibility();

    updateOccupancyFields();

    updateFamilyFields();

}


/*
========================================================
CLOSE FILE MODAL
========================================================
*/

function closeFileModal() {

    $("#fileModal")
        .classList.add("hidden");

}


/*
========================================================
RENDER FILES
========================================================
*/

function renderFiles() {

    const container =
        $("#filesContainer");

    const empty =
        $("#emptyState");


    const filtered =
        getFilteredFiles();


    container.innerHTML = "";


    if (!filtered.length) {

        empty.classList.remove(
            "hidden"
        );

        return;

    }


    empty.classList.add(
        "hidden"
    );


    filtered.forEach((file) => {

        container.appendChild(
            createFileCard(file)
        );

    });

}


/*
========================================================
FILTER
========================================================
*/

function getFilteredFiles() {

    let files =
        [...state.files];


    if (
        state.currentFilter ===
        "followup"
    ) {

        files =
            files.filter(
                isFollowUp
            );

    } else if (
        state.currentFilter !==
        "all"
    ) {

        files =
            files.filter(
                file =>
                    file.type ===
                    state.currentFilter
            );

    }


    if (state.search) {

        files =
            files.filter(
                file =>
                    searchableFileText(
                        file
                    ).includes(
                        state.search
                    )
            );

    }


    files.sort(
        (a, b) =>
            new Date(
                b.updatedAt ||
                b.createdAt ||
                0
            ) -
            new Date(
                a.updatedAt ||
                a.createdAt ||
                0
            )
    );


    return files;

}


/*
========================================================
SEARCH TEXT
========================================================
*/

function searchableFileText(file) {

    return [

        file.name,

        file.phone,

        file.location,

        file.propertyType,

        PROPERTY_LABELS[
            file.propertyType
        ],

        TYPE_LABELS[
            file.type
        ],

        file.buyerNotes,

        file.tenantNotes,

        file.capital,

        file.area,

        file.rooms,

        file.year

    ]
        .filter(
            value =>
                value !== null &&
                value !== undefined
        )
        .join(" ")
        .toLowerCase();

}


/*
========================================================
CARD
========================================================
*/

function createFileCard(file) {

    const card =
        document.createElement("article");


    card.className =
        "file-card";


    card.addEventListener(
        "click",
        () => openDetail(file.id)
    );


    const followUp =
        isFollowUp(file);


    const typeLabel =
        TYPE_LABELS[
            file.type
        ] ||
        file.type;


    const propertyLabel =
        PROPERTY_LABELS[
            file.propertyType
        ] ||
        "-";


    const location =
        file.location ||
        "-";


    const phone =
        file.phone ||
        "-";


    const area =
        file.area
            ? `${formatNumber(file.area)} متر`
            : "-";


    const followupBadge =
        followUp
            ? `
                <span class="followup-badge">
                    نیاز به پیگیری
                </span>
            `
            : "";


    card.innerHTML = `

        <div class="card-top">

            <div>

                <div class="card-type">
                    ${escapeHtml(typeLabel)}
                </div>

                <div class="card-title">
                    ${escapeHtml(file.name || "بدون نام")}
                </div>

            </div>

            ${followupBadge}

        </div>


        <div class="card-info">

            <div class="info-item">

                <span class="info-label">
                    نوع ملک
                </span>

                <div class="info-value">
                    ${escapeHtml(propertyLabel)}
                </div>

            </div>


            <div class="info-item">

                <span class="info-label">
                    متراژ
                </span>

                <div class="info-value">
                    ${escapeHtml(area)}
                </div>

            </div>


            <div class="info-item">

                <span class="info-label">
                    شماره
                </span>

                <div class="info-value">
                    ${escapeHtml(phone)}
                </div>

            </div>


            <div class="info-item">

                <span class="info-label">
                    موقعیت
                </span>

                <div class="info-value">
                    ${escapeHtml(location)}
                </div>

            </div>

        </div>


        <div class="card-footer">

            <span>
                ${escapeHtml(
                    formatRelativeDate(
                        file.updatedAt ||
                        file.createdAt
                    )
                )}
            </span>

            <span>
                ${escapeHtml(
                    file.createdBy || ""
                )}
            </span>

        </div>
    `;


    return card;

}


/*
========================================================
DETAIL
========================================================
*/

function openDetail(id) {

    const file =
        state.files.find(
            item =>
                item.id === id
        );


    if (!file) {
        return;
    }


    state.selectedFileId =
        id;


    $("#detailType")
        .textContent =
            TYPE_LABELS[
                file.type
            ] || file.type;


    $("#detailTitle")
        .textContent =
            file.name ||
            "بدون نام";


    $("#detailContent")
        .innerHTML =
            buildDetailHtml(file);


    $("#detailModal")
        .classList.remove(
            "hidden"
        );

}


function buildDetailHtml(file) {

    const groups = [];


    groups.push(`

        <div class="detail-group">

            <div class="detail-group-title">
                اطلاعات اصلی
            </div>

            <div class="detail-grid">

                ${detailItem(
                    "نام",
                    file.name
                )}

                ${detailItem(
                    "شماره تماس",
                    file.phone
                )}

                ${detailItem(
                    "نوع ملک",
                    PROPERTY_LABELS[
                        file.propertyType
                    ]
                )}

                ${detailItem(
                    "متراژ",
                    file.area
                        ? `${formatNumber(file.area)} متر`
                        : "-"
                )}

                ${detailItem(
                    "تعداد خواب",
                    file.rooms
                )}

                ${detailItem(
                    "سال ساخت",
                    file.year
                )}

                ${detailItem(
                    "موقعیت",
                    file.location
                )}

            </div>

        </div>
    `);


    if (
        file.type === "sale" ||
        file.type === "landlord"
    ) {

        groups.push(`

            <div class="detail-group">

                <div class="detail-group-title">
                    وضعیت ملک
                </div>

                <div class="detail-grid">

                    ${detailItem(
                        "کلید دست",
                        KEY_HOLDER_LABELS[
                            file.keyHolder
                        ]
                    )}

                    ${detailItem(
                        "وضعیت ملک",
                        CONDITION_LABELS[
                            file.condition
                        ]
                    )}

                    ${detailItem(
                        "وضعیت سکونت",
                        OCCUPANCY_LABELS[
                            file.occupancy
                        ]
                    )}

                    ${detailItem(
                        "ودیعه فعلی",
                        money(
                            file.currentDeposit
                        )
                    )}

                    ${detailItem(
                        "اجاره فعلی",
                        money(
                            file.currentRent
                        )
                    )}

                    ${detailItem(
                        "ودیعه پیشنهادی",
                        money(
                            file.suggestedDeposit
                        )
                    )}

                    ${detailItem(
                        "اجاره پیشنهادی",
                        money(
                            file.suggestedRent
                        )
                    )}

                </div>

            </div>
        `);

    }


    if (file.type === "buyer") {

        groups.push(`

            <div class="detail-group">

                <div class="detail-group-title">
                    مشخصات خرید
                </div>

                <div class="detail-grid">

                    ${detailItem(
                        "سرمایه",
                        money(file.capital)
                    )}

                    ${detailItem(
                        "توضیحات",
                        file.buyerNotes
                    )}

                </div>

            </div>
        `);

    }


    if (file.type === "tenant") {

        groups.push(`

            <div class="detail-group">

                <div class="detail-group-title">
                    مشخصات مستاجر
                </div>

                <div class="detail-grid">

                    ${detailItem(
                        "ودیعه",
                        money(file.tenantDeposit)
                    )}

                    ${detailItem(
                        "اجاره",
                        money(file.tenantRent)
                    )}

                    ${detailItem(
                        "وضعیت خانوادگی",
                        FAMILY_LABELS[
                            file.familyStatus
                        ]
                    )}

                    ${detailItem(
                        "تعداد نفرات",
                        file.familySize
                    )}

                    ${detailItem(
                        "توضیحات",
                        file.tenantNotes
                    )}

                </div>

            </div>
        `);

    }


    const amenities =
        Array.isArray(file.amenities)
            ? file.amenities
            : [];


    if (amenities.length) {

        groups.push(`

            <div class="detail-group">

                <div class="detail-group-title">
                    امکانات
                </div>

                <div class="amenity-tags">

                    ${amenities
                        .map(
                            item => `
                                <span class="amenity-tag">
                                    ${escapeHtml(
                                        AMENITY_LABELS[item] ||
                                        item
                                    )}
                                </span>
                            `
                        )
                        .join("")}

                </div>

            </div>
        `);

    }


    groups.push(`

        <div class="detail-group">

            <div class="detail-group-title">
                پیگیری
            </div>

            <div class="detail-grid">

                ${detailItem(
                    "وضعیت",
                    isFollowUp(file)
                        ? "نیاز به پیگیری"
                        : "فعال"
                )}

                ${detailItem(
                    "تاریخ پیگیری",
                    file.followUpAt
                        ? formatDateTime(
                            new Date(
                                file.followUpAt
                            )
                        )
                        : "-"
                )}

                ${detailItem(
                    "ثبت‌کننده",
                    file.createdBy
                )}

                ${detailItem(
                    "آخرین ویرایش",
                    file.updatedAt
                        ? formatDateTime(
                            new Date(
                                file.updatedAt
                            )
                        )
                        : "-"
                )}

            </div>

        </div>
    `);


    return groups.join("");

}


/*
========================================================
DETAIL HELPERS
========================================================
*/

function detailItem(label, value) {

    const safeValue =
        value === null ||
        value === undefined ||
        value === ""
            ? "-"
            : String(value);


    return `

        <div>

            <div class="detail-item-label">
                ${escapeHtml(label)}
            </div>

            <div class="detail-item-value">
                ${escapeHtml(safeValue)}
            </div>

        </div>
    `;

}


/*
========================================================
CLOSE DETAIL
========================================================
*/

function closeDetailModal() {

    $("#detailModal")
        .classList.add("hidden");

}


/*
========================================================
DELETE
========================================================
*/

async function deleteSelectedFile() {

    const id =
        state.selectedFileId;


    const file =
        state.files.find(
            item =>
                item.id === id
        );


    if (!file) {
        return;
    }


    const confirmed =
        confirm(
            `آیا از حذف فایل «${file.name}» مطمئن هستید؟`
        );


    if (!confirmed) {
        return;
    }


    try {

        await removeFile(id);

        closeDetailModal();

        state.selectedFileId =
            null;

        showToast(
            "فایل حذف شد."
        );

    } catch (error) {

        console.error(error);

        showToast(
            getErrorMessage(error),
            "error"
        );

    }

}


/*
========================================================
RENEW
========================================================
*/

function openRenewModal() {

    const file =
        state.files.find(
            item =>
                item.id ===
                state.selectedFileId
        );


    if (!file) {
        return;
    }


    $("#renewTitle")
        .textContent =
            `تمدید پیگیری ${file.name || ""}`;


    $("#renewModal")
        .classList.remove(
            "hidden"
        );

}


function closeRenewModal() {

    $("#renewModal")
        .classList.add(
            "hidden"
        );

}


async function renewSelectedFile(days) {

    const id =
        state.selectedFileId;


    if (!id) {
        return;
    }


    try {

        const followUpAt =
            addDays(
                new Date(),
                days
            ).toISOString();


        await updateFile(
            id,
            {
                followUpAt,
                followUpDays:
                    days
            }
        );


        closeRenewModal();

        closeDetailModal();

        showToast(
            `پیگیری برای ${days} روز تمدید شد.`
        );

    } catch (error) {

        console.error(error);

        showToast(
            getErrorMessage(error),
            "error"
        );

    }

}


/*
========================================================
FOLLOW-UP
========================================================
*/

function isFollowUp(file) {

    if (!file.followUpAt) {
        return false;
    }


    return (
        new Date(
            file.followUpAt
        ).getTime() <=
        Date.now()
    );

}


function updateFollowUpCount() {

    const count =
        state.files.filter(
            isFollowUp
        ).length;


    $("#followUpCount")
        .textContent =
            formatNumber(count);

}


/*
========================================================
FILTER BUTTONS
========================================================
*/

function updateFilterButtons() {

    $$(".filter-button")
        .forEach((button) => {

            button.classList.toggle(
                "active",
                button.dataset.filter ===
                    state.currentFilter
            );

        });

}


/*
========================================================
LOGOUT
========================================================
*/

function logout() {

    stopPolling();

    state.token = null;

    state.files = [];

    state.fileSha = null;

    state.selectedFileId = null;


    $("#appScreen")
        .classList.add("hidden");


    $("#loginScreen")
        .classList.remove("hidden");


    $("#password").value = "";

    $("#githubToken").value = "";

    showLoginError("");

}


/*
========================================================
SYNC STATUS
========================================================
*/

function setSyncStatus(
    type,
    text
) {

    const indicator =
        $("#syncIndicator");


    indicator.className =
        "sync-dot";


    if (type === "online") {

        indicator.classList.add(
            "online"
        );

    }


    if (type === "error") {

        indicator.classList.add(
            "error"
        );

    }


    $("#syncText")
        .textContent =
            text;

}


/*
========================================================
TOAST
========================================================
*/

let toastTimer = null;


function showToast(
    message,
    type = "success"
) {

    const toast =
        $("#toast");


    toast.textContent =
        message;


    toast.classList.remove(
        "hidden"
    );


    if (type === "error") {

        toast.style.borderColor =
            "rgba(224, 82, 82, .45)";

        toast.style.color =
            "#f27777";

    } else {

        toast.style.borderColor =
            "var(--border-light)";

        toast.style.color =
            "var(--text)";

    }


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.add(
                    "hidden"
                );

            },
            3000
        );

}


/*
========================================================
LOGIN ERROR
========================================================
*/

function showLoginError(message) {

    const element =
        $("#loginError");


    if (!message) {

        element.classList.add(
            "hidden"
        );

        element.textContent =
            "";

        return;

    }


    element.textContent =
        message;


    element.classList.remove(
        "hidden"
    );

}


/*
========================================================
BASE64
========================================================
*/

function encodeBase64Unicode(text) {

    const bytes =
        new TextEncoder()
            .encode(text);


    let binary = "";

    const chunkSize =
        0x8000;


    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        binary += String.fromCharCode(
            ...bytes.subarray(
                i,
                i + chunkSize
            )
        );

    }


    return btoa(binary);

}


function decodeBase64Unicode(base64) {

    const clean =
        base64.replace(
            /\s/g,
            ""
        );


    const binary =
        atob(clean);


    const bytes =
        Uint8Array.from(
            binary,
            char =>
                char.charCodeAt(0)
        );


    return new TextDecoder()
        .decode(bytes);

}


/*
========================================================
UTILITIES
========================================================
*/

function generateId() {

    return (
        Date.now().toString(36) +
        "-" +
        crypto.randomUUID()
    );

}


function addDays(date, days) {

    const result =
        new Date(date);


    result.setDate(
        result.getDate() +
        Number(days)
    );


    return result;

}


function numberOrNull(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return null;

    }


    const number =
        Number(value);


    return Number.isFinite(number)
        ? number
        : null;

}


function formatNumber(value) {

    const number =
        Number(value);


    if (!Number.isFinite(number)) {
        return String(value ?? "");
    }


    return new Intl.NumberFormat(
        "fa-IR"
    ).format(number);

}


function money(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "-";

    }


    return (
        formatNumber(value) +
        " تومان"
    );

}


function formatDateTime(date) {

    if (
        !(date instanceof Date) ||
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "-";

    }


    return new Intl.DateTimeFormat(
        "fa-IR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(date);

}


function formatRelativeDate(value) {

    if (!value) {
        return "";
    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    const diff =
        Date.now() -
        date.getTime();


    const minute =
        60 * 1000;

    const hour =
        60 * minute;

    const day =
        24 * hour;


    if (diff < minute) {
        return "همین الان";
    }


    if (diff < hour) {

        return (
            formatNumber(
                Math.floor(
                    diff / minute
                )
            ) +
            " دقیقه پیش"
        );

    }


    if (diff < day) {

        return (
            formatNumber(
                Math.floor(
                    diff / hour
                )
            ) +
            " ساعت پیش"
        );

    }


    if (diff < 7 * day) {

        return (
            formatNumber(
                Math.floor(
                    diff / day
                )
            ) +
            " روز پیش"
        );

    }


    return formatDateTime(date);

}


function escapeHtml(value) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


function getErrorMessage(error) {

    if (
        error instanceof Error &&
        error.message
    ) {

        return error.message;

    }


    return "یک خطای نامشخص رخ داد.";

}
