/* =========================================
   DOT FILE MANAGER
========================================= */


/*
    موقتاً برای تست

    بعداً این مقدار را به سیستم
    هش + Secret منتقل می‌کنیم.
*/

const ACCESS_CODE = "DOT-1405";


/* =========================================
   ELEMENTS
========================================= */

const loginPage = document.getElementById("loginPage");
const app = document.getElementById("app");

const loginForm = document.getElementById("loginForm");
const accessCode = document.getElementById("accessCode");
const loginError = document.getElementById("loginError");

const logoutBtn = document.getElementById("logoutBtn");

const addFileBtn = document.getElementById("addFileBtn");

const modal = document.getElementById("modal");
const closeModal = document.getElementById("closeModal");
const cancelBtn = document.getElementById("cancelBtn");

const fileForm = document.getElementById("fileForm");

const filesContainer = document.getElementById("filesContainer");

const fileCount = document.getElementById("fileCount");

const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("statusFilter");


/* =========================================
   STORAGE
========================================= */

const STORAGE_KEY = "dot_real_estate_files";

let files = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "[]"
);


/* =========================================
   LOGIN
========================================= */

loginForm.addEventListener("submit", function (e) {

    e.preventDefault();

    const value = accessCode.value;

    if (value === ACCESS_CODE) {

        sessionStorage.setItem(
            "dot_logged_in",
            "true"
        );

        loginError.textContent = "";

        showApp();

    } else {

        loginError.textContent =
            "کد دسترسی اشتباه است.";

    }

});


/* =========================================
   SESSION
========================================= */

function checkLogin() {

    const loggedIn =
        sessionStorage.getItem("dot_logged_in");

    if (loggedIn === "true") {

        showApp();

    } else {

        showLogin();

    }

}


function showApp() {

    loginPage.classList.add("hidden");

    app.classList.remove("hidden");

    renderFiles();

}


function showLogin() {

    loginPage.classList.remove("hidden");

    app.classList.add("hidden");

}


/* =========================================
   LOGOUT
========================================= */

logoutBtn.addEventListener("click", function () {

    sessionStorage.removeItem(
        "dot_logged_in"
    );

    showLogin();

});


/* =========================================
   MODAL
========================================= */

addFileBtn.addEventListener("click", function () {

    openAddModal();

});


closeModal.addEventListener("click", closeModalWindow);

cancelBtn.addEventListener("click", closeModalWindow);


modal.addEventListener("click", function (e) {

    if (e.target === modal) {

        closeModalWindow();

    }

});


function openAddModal() {

    fileForm.reset();

    document.getElementById("fileId").value = "";

    document.getElementById("modalTitle").textContent =
        "افزودن فایل";

    modal.classList.remove("hidden");

}


function closeModalWindow() {

    modal.classList.add("hidden");

}


/* =========================================
   SAVE FILE
========================================= */

fileForm.addEventListener("submit", function (e) {

    e.preventDefault();

    const id =
        document.getElementById("fileId").value;

    const file = {

        id: id || crypto.randomUUID(),

        type:
            document.getElementById("fileType").value,

        code:
            document.getElementById("code").value.trim(),

        propertyType:
            document.getElementById("propertyType").value.trim(),

        area:
            document.getElementById("area").value,

        rooms:
            document.getElementById("rooms").value,

        floor:
            document.getElementById("floor").value.trim(),

        age:
            document.getElementById("age").value.trim(),

        location:
            document.getElementById("location").value.trim(),

        price:
            document.getElementById("price").value.trim(),

        description:
            document.getElementById("description").value.trim(),

        ownerName:
            document.getElementById("ownerName").value.trim(),

        ownerPhone:
            document.getElementById("ownerPhone").value.trim(),

        exactAddress:
            document.getElementById("exactAddress").value.trim(),

        privateNotes:
            document.getElementById("privateNotes").value.trim(),

        status:
            document.getElementById("status").value,

        updatedAt:
            new Date().toISOString()

    };


    if (id) {

        const index =
            files.findIndex(item => item.id === id);

        if (index !== -1) {

            files[index] = file;

        }

    } else {

        files.unshift(file);

    }


    saveFiles();

    renderFiles();

    closeModalWindow();

});


/* =========================================
   SAVE TO LOCAL STORAGE
========================================= */

function saveFiles() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(files)
    );

}


/* =========================================
   RENDER
========================================= */

function renderFiles() {

    let result = [...files];


    /* SEARCH */

    const search =
        searchInput.value
            .trim()
            .toLowerCase();


    if (search) {

        result = result.filter(file => {

            const text = [

                file.code,
                file.propertyType,
                file.location,
                file.description,
                file.ownerName,
                file.ownerPhone,
                file.exactAddress,
                file.privateNotes

            ]
                .join(" ")
                .toLowerCase();


            return text.includes(search);

        });

    }


    /* TYPE */

    if (typeFilter.value !== "all") {

        result = result.filter(
            file =>
                file.type === typeFilter.value
        );

    }


    /* STATUS */

    if (statusFilter.value !== "all") {

        result = result.filter(
            file =>
                file.status === statusFilter.value
        );

    }


    fileCount.textContent =
        `${result.length} فایل`;


    if (!result.length) {

        filesContainer.innerHTML = `
            <div class="empty">
                فایلی پیدا نشد.
            </div>
        `;

        return;

    }


    filesContainer.innerHTML =
        result.map(renderCard).join("");


}


/* =========================================
   CARD
========================================= */

function renderCard(file) {

    return `

        <article class="file-card">

            <div class="file-top">

                <span class="file-code">
                    ${escapeHTML(file.code)}
                </span>

                <span class="badge">
                    ${getTypeName(file.type)}
                </span>

            </div>


            <div class="file-title">

                ${escapeHTML(
                    file.propertyType || "ملک"
                )}

            </div>


            <div class="file-info">

                <div>
                    📐 ${escapeHTML(file.area || "-")} متر
                </div>

                <div>
                    🛏 ${escapeHTML(file.rooms || "-")} خواب
                </div>

                <div>
                    🏢 طبقه ${escapeHTML(file.floor || "-")}
                </div>

                <div>
                    📍 ${escapeHTML(file.location || "-")}
                </div>

                <div>
                    🏗 ${escapeHTML(file.age || "-")}
                </div>

                <div>
                    💰 ${escapeHTML(file.price || "-")}
                </div>

            </div>


            ${
                file.description
                ?
                `
                <div class="file-description">

                    ${escapeHTML(file.description)}

                </div>
                `
                :
                ""
            }


            <div class="private-info">

                <strong>
                    🔒 اطلاعات خصوصی
                </strong>

                <div>
                    👤 ${escapeHTML(
                        file.ownerName || "-"
                    )}
                </div>

                <div>
                    📞 ${escapeHTML(
                        file.ownerPhone || "-"
                    )}
                </div>

                <div>
                    📍 ${escapeHTML(
                        file.exactAddress || "-"
                    )}
                </div>

                <div>
                    📝 ${escapeHTML(
                        file.privateNotes || "-"
                    )}
                </div>

            </div>


            <div class="card-actions">

                <button
                    class="edit-btn"
                    onclick="editFile('${file.id}')"
                >
                    ویرایش
                </button>

                <button
                    class="delete-btn"
                    onclick="deleteFile('${file.id}')"
                >
                    حذف
                </button>

            </div>

        </article>

    `;

}


/* =========================================
   EDIT
========================================= */

function editFile(id) {

    const file =
        files.find(item => item.id === id);

    if (!file) return;


    document.getElementById("fileId").value =
        file.id;

    document.getElementById("fileType").value =
        file.type;

    document.getElementById("code").value =
        file.code;

    document.getElementById("propertyType").value =
        file.propertyType;

    document.getElementById("area").value =
        file.area;

    document.getElementById("rooms").value =
        file.rooms;

    document.getElementById("floor").value =
        file.floor;

    document.getElementById("age").value =
        file.age;

    document.getElementById("location").value =
        file.location;

    document.getElementById("price").value =
        file.price;

    document.getElementById("description").value =
        file.description;

    document.getElementById("ownerName").value =
        file.ownerName;

    document.getElementById("ownerPhone").value =
        file.ownerPhone;

    document.getElementById("exactAddress").value =
        file.exactAddress;

    document.getElementById("privateNotes").value =
        file.privateNotes;

    document.getElementById("status").value =
        file.status;


    document.getElementById("modalTitle").textContent =
        "ویرایش فایل";


    modal.classList.remove("hidden");

}


/* =========================================
   DELETE
========================================= */

function deleteFile(id) {

    const file =
        files.find(item => item.id === id);

    if (!file) return;


    const confirmDelete =
        confirm(
            `فایل ${file.code} حذف شود؟`
        );


    if (!confirmDelete) return;


    files =
        files.filter(item => item.id !== id);


    saveFiles();

    renderFiles();

}


/* =========================================
   FILTER EVENTS
========================================= */

searchInput.addEventListener(
    "input",
    renderFiles
);

typeFilter.addEventListener(
    "change",
    renderFiles
);

statusFilter.addEventListener(
    "change",
    renderFiles
);


/* =========================================
   TYPE NAME
========================================= */

function getTypeName(type) {

    const types = {

        sale: "فروش",

        rent: "اجاره",

        buyer: "خریدار",

        tenant: "مستأجر",

        landlord: "موجر"

    };

    return types[type] || type;

}


/* =========================================
   HTML SECURITY
========================================= */

function escapeHTML(value) {

    if (value === undefined || value === null) {

        return "";

    }


    return String(value)

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");

}


/* =========================================
   START
========================================= */

checkLogin();
