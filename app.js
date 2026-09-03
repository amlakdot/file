// =========================================================
// DOT Real Estate
// GitHub Pages / LocalStorage Version
// =========================================================

"use strict";

const STORAGE_KEY = "dot_real_estate_files";
const AUTH_KEY = "dot_real_estate_auth";
const USER_KEY = "dot_real_estate_user";

// ---------------------------------------------------------
// Demo users
// ---------------------------------------------------------
// توجه:
// این رمزها فقط برای ورود ظاهری به سایت هستند.
// چون پروژه بدون Backend است، امنیت واقعی ایجاد نمی‌کنند.
// بعداً اگر Backend اضافه کردیم، احراز هویت واقعی را منتقل می‌کنیم.

const USERS = {
  admin: {
    username: "admin",
    password: "123456",
    name: "مدیر",
    role: "admin",
  },

  consultant: {
    username: "consultant",
    password: "123456",
    name: "مشاور",
    role: "consultant",
  },
};


// =========================================================
// Labels
// =========================================================

const FILE_TYPE_LABELS = {
  sale: "ملک فروشی",
  landlord: "مالک / موجر",
  buyer: "خریدار",
  tenant: "مستاجر",
};

const PROPERTY_TYPE_LABELS = {
  apartment: "آپارتمان",
  villa: "ویلا",
  office: "دفتر",
  commercial: "تجاری",
  land: "زمین",
  garden: "باغ",
  any: "فرقی ندارد",
};

const CONDITION_LABELS = {
  new: "نوساز",
  unused: "کلید نخورده",
  renovated: "بازسازی‌شده",
  "not-renovated": "بازسازی‌نشده",
  renovating: "در حال بازسازی",
};

const OCCUPANCY_LABELS = {
  empty: "خالی",
  tenant: "مستاجر دارد",
  owner: "مالک ساکن است",
  evacuating: "در حال تخلیه",
};

const KEY_HOLDER_LABELS = {
  owner: "مالک",
  tenant: "مستاجر",
  guard: "نگهبان",
  office: "دفتر",
  other: "سایر",
};

const FAMILY_STATUS_LABELS = {
  single: "مجرد",
  married: "متأهل",
  family: "خانواده",
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
  roof: "روف‌گاردن",
  lobby: "لابی",
  guard: "نگهبانی",
  package: "پکیج",
  cooler: "کولر",
  "floor-heating": "گرمایش از کف",
  cabinet: "کابینت",
  closet: "کمد دیواری",
};


// =========================================================
// State
// =========================================================

const state = {
  files: [],
  filteredFiles: [],
  currentUser: null,
  activeFilter: "all",
  search: "",
  editingId: null,
  selectedFile: null,
};


// =========================================================
// DOM
// =========================================================

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  Array.from(document.querySelectorAll(selector));


// =========================================================
// Helpers
// =========================================================

function escapeHTML(value) {
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


function generateId() {
  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2, 10)
  );
}


function nowISO() {
  return new Date().toISOString();
}


function calculateFollowUp(days) {
  const date = new Date();

  date.setDate(
    date.getDate() + Number(days || 10)
  );

  return date.toISOString();
}


function isFollowUp(file) {
  if (!file?.followUpAt) {
    return false;
  }

  return (
    new Date(file.followUpAt).getTime() <=
    Date.now()
  );
}


function formatNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
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

  return `${Number(value).toLocaleString("fa-IR")} تومان`;
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(
    "fa-IR",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );
}


function getNextCode() {
  const max = state.files.reduce(
    (highest, file) =>
      Math.max(
        highest,
        Number(file.code) || 0
      ),
    0
  );

  return max + 1;
}


function toast(message, type = "default") {
  let element =
    document.querySelector(".dot-toast");

  if (!element) {
    element = document.createElement("div");

    element.className =
      "dot-toast";

    document.body.appendChild(element);
  }

  element.textContent = message;

  element.dataset.type = type;

  clearTimeout(
    toast.timeout
  );

  element.classList.add("show");

  toast.timeout = setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}


// =========================================================
// Local Storage
// =========================================================

function loadFiles() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!raw) {
      state.files = [];
      return;
    }

    const parsed =
      JSON.parse(raw);

    state.files =
      Array.isArray(parsed)
        ? parsed
        : [];
  } catch (error) {
    console.error(error);

    state.files = [];

    toast(
      "خواندن اطلاعات ذخیره‌شده با مشکل مواجه شد.",
      "error"
    );
  }
}


function saveFiles() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state.files)
    );

    return true;
  } catch (error) {
    console.error(error);

    toast(
      "ذخیره اطلاعات انجام نشد.",
      "error"
    );

    return false;
  }
}


// =========================================================
// Authentication
// =========================================================

function checkAuth() {
  try {
    const auth =
      localStorage.getItem(
        AUTH_KEY
      );

    const username =
      localStorage.getItem(
        USER_KEY
      );

    if (
      auth === "1" &&
      username &&
      USERS[username]
    ) {
      state.currentUser =
        USERS[username];

      showApp();

      return true;
    }
  } catch {
    // Ignore
  }

  showLogin();

  return false;
}


function login(username, password) {
  const user =
    USERS[username];

  if (
    !user ||
    user.password !== password
  ) {
    return false;
  }

  state.currentUser = user;

  localStorage.setItem(
    AUTH_KEY,
    "1"
  );

  localStorage.setItem(
    USER_KEY,
    user.username
  );

  return true;
}


function logout() {
  localStorage.removeItem(
    AUTH_KEY
  );

  localStorage.removeItem(
    USER_KEY
  );

  state.currentUser = null;

  showLogin();
}


// =========================================================
// Login / App
// =========================================================

function showLogin() {
  const loginScreen =
    $("#loginScreen");

  const app =
    $("#app");

  if (loginScreen) {
    loginScreen.classList.remove(
      "hidden"
    );
  }

  if (app) {
    app.classList.add(
      "hidden"
    );
  }
}


function showApp() {
  const loginScreen =
    $("#loginScreen");

  const app =
    $("#app");

  if (loginScreen) {
    loginScreen.classList.add(
      "hidden"
    );
  }

  if (app) {
    app.classList.remove(
      "hidden"
    );
  }

  updateUserUI();

  loadFiles();

  renderHome();
}


function updateUserUI() {
  const user =
    state.currentUser;

  if (!user) {
    return;
  }

  const possibleElements = [
    "#currentUserName",
    "#userName",
    "#loggedUserName",
  ];

  possibleElements.forEach(
    (selector) => {
      const element =
        $(selector);

      if (element) {
        element.textContent =
          user.name;
      }
    }
  );
}


// =========================================================
// Rendering
// =========================================================

function renderHome() {
  applyFilters();

  renderFiles();

  updateFollowUpCount();
}


function applyFilters() {
  let files = [...state.files];

  if (
    state.activeFilter !==
    "all"
  ) {
    if (
      state.activeFilter ===
      "followup"
    ) {
      files =
        files.filter(
          isFollowUp
        );
    } else {
      files =
        files.filter(
          file =>
            file.type ===
            state.activeFilter
        );
    }
  }

  if (state.search) {
    const query =
      state.search
        .trim()
        .toLowerCase();

    files =
      files.filter(
        file => {
          const text = [
            file.code,
            file.name,
            file.phone,
            file.location,
            file.notes,
            FILE_TYPE_LABELS[
              file.type
            ],
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return text.includes(
            query
          );
        }
      );
  }

  files.sort(
    (a, b) => {
      const aFollow =
        isFollowUp(a);

      const bFollow =
        isFollowUp(b);

      if (
        aFollow &&
        !bFollow
      ) {
        return -1;
      }

      if (
        !aFollow &&
        bFollow
      ) {
        return 1;
      }

      return (
        Number(b.code || 0) -
        Number(a.code || 0)
      );
    }
  );

  state.filteredFiles =
    files;
}


function renderFiles() {
  const container =
    $("#filesContainer");

  const emptyState =
    $("#emptyState");

  if (!container) {
    return;
  }

  if (
    state.filteredFiles.length ===
    0
  ) {
    container.innerHTML = "";

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

  container.innerHTML =
    state.filteredFiles
      .map(
        renderFileCard
      )
      .join("");
}


function renderFileCard(file) {
  const followUp =
    isFollowUp(file);

  const typeLabel =
    FILE_TYPE_LABELS[
      file.type
    ] ||
    file.type;

  let mainInfo = "";

  if (
    file.type === "sale" ||
    file.type === "landlord"
  ) {
    mainInfo = `
      <div class="file-card-meta">
        ${
          file.propertyType
            ? `
              <span>
                ${escapeHTML(
                  PROPERTY_TYPE_LABELS[
                    file.propertyType
                  ] ||
                  file.propertyType
                )}
              </span>
            `
            : ""
        }

        ${
          file.area
            ? `
              <span>
                ${formatNumber(
                  file.area
                )} متر
              </span>
            `
            : ""
        }

        ${
          file.rooms !== null &&
          file.rooms !== undefined &&
          file.rooms !== ""
            ? `
              <span>
                ${formatNumber(
                  file.rooms
                )} خواب
              </span>
            `
            : ""
        }
      </div>
    `;
  }

  if (file.type === "buyer") {
    mainInfo = `
      <div class="file-card-meta">
        ${
          file.propertyType
            ? `
              <span>
                ${escapeHTML(
                  PROPERTY_TYPE_LABELS[
                    file.propertyType
                  ] ||
                  file.propertyType
                )}
              </span>
            `
            : ""
        }

        ${
          file.area
            ? `
              <span>
                تا ${formatNumber(
                  file.area
                )} متر
              </span>
            `
            : ""
        }
      </div>
    `;
  }

  if (file.type === "tenant") {
    mainInfo = `
      <div class="file-card-meta">
        ${
          file.propertyType
            ? `
              <span>
                ${escapeHTML(
                  PROPERTY_TYPE_LABELS[
                    file.propertyType
                  ] ||
                  file.propertyType
                )}
              </span>
            `
            : ""
        }

        ${
          file.rent
            ? `
              <span>
                ${formatMoney(
                  file.rent
                )}
              </span>
            `
            : ""
        }
      </div>
    `;
  }

  return `
    <article
      class="file-card ${
        followUp
          ? "is-followup"
          : ""
      }"
      data-id="${escapeHTML(
        file.id
      )}"
      onclick="openDetail('${escapeHTML(
        file.id
      )}')"
    >

      <div class="file-card-top">

        <span class="file-code">
          #${formatNumber(
            file.code
          )}
        </span>

        <span class="file-type">
          ${escapeHTML(
            typeLabel
          )}
        </span>

      </div>

      <div class="file-card-title">
        ${escapeHTML(
          file.name
        )}
      </div>

      ${
        file.phone
          ? `
            <div class="file-card-phone">
              ${escapeHTML(
                file.phone
              )}
            </div>
          `
          : ""
      }

      ${
        file.location
          ? `
            <div class="file-card-location">
              ${escapeHTML(
                file.location
              )}
            </div>
          `
          : ""
      }

      ${mainInfo}

      ${
        followUp
          ? `
            <div class="followup-badge">
              نیاز به پیگیری
            </div>
          `
          : ""
      }

    </article>
  `;
}


function updateFollowUpCount() {
  const count =
    state.files.filter(
      isFollowUp
    ).length;

  const elements = [
    "#followUpCount",
    "#followupCount",
  ];

  elements.forEach(
    selector => {
      const element =
        $(selector);

      if (element) {
        element.textContent =
          formatNumber(count);
      }
    }
  );
}


// =========================================================
// Modal helpers
// =========================================================

function openModal(element) {
  if (!element) {
    return;
  }

  element.classList.remove(
    "hidden"
  );

  document.body.classList.add(
    "modal-open"
  );
}


function closeModal(element) {
  if (!element) {
    return;
  }

  element.classList.add(
    "hidden"
  );

  document.body.classList.remove(
    "modal-open"
  );
}


// =========================================================
// File Form
// =========================================================

function resetForm() {
  const form =
    $("#fileForm");

  if (!form) {
    return;
  }

  form.reset();

  state.editingId = null;

  const editingId =
    $("#editingFileId");

  if (editingId) {
    editingId.value = "";
  }

  const followUpDays =
    $("#followUpDays");

  if (followUpDays) {
    followUpDays.value = "10";
  }

  const type =
    $('input[name="fileType"]:checked');

  if (!type) {
    const first =
      $('input[name="fileType"]');

    if (first) {
      first.checked = true;
    }
  }

  updateFormSections();
}


function openNewFile() {
  resetForm();

  const eyebrow =
    $("#modalEyebrow");

  const title =
    $("#modalTitle");

  if (eyebrow) {
    eyebrow.textContent =
      "ثبت فایل جدید";
  }

  if (title) {
    title.textContent =
      "فایل جدید";
  }

  openModal(
    $("#fileModal")
  );
}


function openEdit(file) {
  if (!file) {
    return;
  }

  state.editingId =
    file.id;

  populateForm(file);

  const eyebrow =
    $("#modalEyebrow");

  const title =
    $("#modalTitle");

  if (eyebrow) {
    eyebrow.textContent =
      "ویرایش فایل";
  }

  if (title) {
    title.textContent =
      `ویرایش فایل #${file.code}`;
  }

  closeModal(
    $("#detailModal")
  );

  openModal(
    $("#fileModal")
  );
}


function populateForm(file) {
  const form =
    $("#fileForm");

  if (!form) {
    return;
  }

  form.reset();

  const setValue = (
    id,
    value
  ) => {
    const element =
      $(`#${id}`);

    if (element) {
      element.value =
        value ??
        "";
    }
  };

  setValue(
    "editingFileId",
    file.id
  );

  const typeInput =
    $(
      `input[name="fileType"][value="${file.type}"]`
    );

  if (typeInput) {
    typeInput.checked =
      true;
  }

  setValue(
    "name",
    file.name
  );

  setValue(
    "phone",
    file.phone
  );

  setValue(
    "propertyType",
    file.propertyType
  );

  setValue(
    "area",
    file.area
  );

  setValue(
    "rooms",
    file.rooms
  );

  setValue(
    "year",
    file.year
  );

  setValue(
    "location",
    file.location
  );

  setValue(
    "keyHolder",
    file.keyHolder
  );

  setValue(
    "condition",
    file.condition
  );

  setValue(
    "occupancy",
    file.occupancy
  );

  setValue(
    "price",
    file.price
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

  setValue(
    "capital",
    file.capital
  );

  setValue(
    "deposit",
    file.deposit
  );

  setValue(
    "rent",
    file.rent
  );

  setValue(
    "familyStatus",
    file.familyStatus
  );

  setValue(
    "familySize",
    file.familySize
  );

  setValue(
    "notes",
    file.notes
  );

  setValue(
    "followUpDays",
    file.followUpDays ||
      10
  );

  const amenities =
    Array.isArray(
      file.amenities
    )
      ? file.amenities
      : [];

  $$(
    'input[name="amenities"]'
  ).forEach(
    checkbox => {
      checkbox.checked =
        amenities.includes(
          checkbox.value
        );
    }
  );

  updateFormSections();
}


function updateFormSections() {
  const type =
    $(
      'input[name="fileType"]:checked'
    )?.value;

  const propertySection =
    $("#propertyFields");

  const buyerSection =
    $("#buyerFields");

  const tenantSection =
    $("#tenantFields");

  const landlordSection =
    $("#landlordFields");

  if (propertySection) {
    propertySection.classList.toggle(
      "hidden",
      ![
        "sale",
        "landlord",
      ].includes(type)
    );
  }

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

  if (landlordSection) {
    landlordSection.classList.toggle(
      "hidden",
      type !== "landlord"
    );
  }

  // Some versions of the HTML use
  // individual field groups instead.
  updateElementVisibility(
    ".sale-only",
    type === "sale"
  );

  updateElementVisibility(
    ".landlord-only",
    type === "landlord"
  );

  updateElementVisibility(
    ".buyer-only",
    type === "buyer"
  );

  updateElementVisibility(
    ".tenant-only",
    type === "tenant"
  );
}


function updateElementVisibility(
  selector,
  visible
) {
  $$(selector).forEach(
    element => {
      element.classList.toggle(
        "hidden",
        !visible
      );
    }
  );
}


// =========================================================
// Collect form
// =========================================================

function getFormData() {
  const form =
    $("#fileForm");

  if (!form) {
    return null;
  }

  const get =
    id =>
      $(`#${id}`)?.value
        ?.trim() || null;

  const getNumber =
    id => {
      const value =
        $(`#${id}`)?.value;

      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return null;
      }

      const number =
        Number(value);

      return Number.isFinite(
        number
      )
        ? number
        : null;
    };

  const amenities =
    $$(
      'input[name="amenities"]:checked'
    ).map(
      checkbox =>
        checkbox.value
    );

  return {
    type:
      $(
        'input[name="fileType"]:checked'
      )?.value ||
      "sale",

    name:
      get("name"),

    phone:
      get("phone"),

    propertyType:
      get("propertyType"),

    area:
      getNumber("area"),

    rooms:
      getNumber("rooms"),

    year:
      getNumber("year"),

    location:
      get("location"),

    keyHolder:
      get("keyHolder"),

    condition:
      get("condition"),

    occupancy:
      get("occupancy"),

    price:
      getNumber("price"),

    currentDeposit:
      getNumber(
        "currentDeposit"
      ),

    currentRent:
      getNumber(
        "currentRent"
      ),

    suggestedDeposit:
      getNumber(
        "suggestedDeposit"
      ),

    suggestedRent:
      getNumber(
        "suggestedRent"
      ),

    capital:
      getNumber("capital"),

    deposit:
      getNumber("deposit"),

    rent:
      getNumber("rent"),

    familyStatus:
      get("familyStatus"),

    familySize:
      getNumber("familySize"),

    notes:
      get("notes"),

    amenities,

    followUpDays:
      Number(
        $(
          "#followUpDays"
        )?.value ||
        10
      ),
  };
}


function validateFormData(data) {
  if (!data) {
    return "اطلاعات فرم نامعتبر است.";
  }

  if (!data.name) {
    return "نام را وارد کنید.";
  }

  if (!data.phone) {
    return "شماره تماس را وارد کنید.";
  }

  if (
    !data.followUpDays ||
    data.followUpDays < 1
  ) {
    return "مدت پیگیری نامعتبر است.";
  }

  return null;
}


// =========================================================
// Save File
// =========================================================

function saveFile(data) {
  const error =
    validateFormData(data);

  if (error) {
    toast(
      error,
      "error"
    );

    return false;
  }

  const editingId =
    state.editingId;

  if (editingId) {
    const index =
      state.files.findIndex(
        file =>
          String(file.id) ===
          String(editingId)
      );

    if (index === -1) {
      toast(
        "فایل پیدا نشد.",
        "error"
      );

      return false;
    }

    const oldFile =
      state.files[index];

    state.files[index] = {
      ...oldFile,
      ...data,
      updatedAt:
        nowISO(),
      updatedBy:
        state.currentUser?.username ||
        null,
    };

    state.files[index]
      .followUpAt =
      calculateFollowUp(
        data.followUpDays
      );

    toast(
      "فایل با موفقیت ویرایش شد.",
      "success"
    );
  } else {
    const file = {
      id:
        generateId(),

      code:
        getNextCode(),

      ...data,

      followUpAt:
        calculateFollowUp(
          data.followUpDays
        ),

      createdBy:
        state.currentUser?.username ||
        null,

      createdByName:
        state.currentUser?.name ||
        null,

      createdAt:
        nowISO(),

      updatedAt:
        nowISO(),

      status:
        "active",
    };

    state.files.unshift(
      file
    );

    toast(
      `فایل شماره ${file.code} ثبت شد.`,
      "success"
    );
  }

  if (!saveFiles()) {
    return false;
  }

  closeModal(
    $("#fileModal")
  );

  renderHome();

  return true;
}


// =========================================================
// Detail
// =========================================================

function openDetail(id) {
  const file =
    state.files.find(
      item =>
        String(item.id) ===
        String(id)
    );

  if (!file) {
    return;
  }

  state.selectedFile =
    file;

  renderDetail(file);

  openModal(
    $("#detailModal")
  );
}


function renderDetail(file) {
  const type =
    $("#detailType");

  const title =
    $("#detailTitle");

  const content =
    $("#detailContent");

  if (type) {
    type.textContent =
      FILE_TYPE_LABELS[
        file.type
      ] ||
      file.type;
  }

  if (title) {
    title.textContent =
      `#${file.code} — ${file.name}`;
  }

  if (!content) {
    return;
  }

  const rows = [];

  addDetailRow(
    rows,
    "شماره فایل",
    `#${formatNumber(
      file.code
    )}`
  );

  addDetailRow(
    rows,
    "نوع فایل",
    FILE_TYPE_LABELS[
      file.type
    ] ||
    file.type
  );

  addDetailRow(
    rows,
    "نام",
    file.name
  );

  addDetailRow(
    rows,
    "شماره تماس",
    file.phone
  );

  addDetailRow(
    rows,
    "موقعیت",
    file.location
  );

  addDetailRow(
    rows,
    "نوع ملک",
    PROPERTY_TYPE_LABELS[
      file.propertyType
    ]
  );

  addDetailRow(
    rows,
    "متراژ",
    file.area
      ? `${formatNumber(
          file.area
        )} متر`
      : null
  );

  addDetailRow(
    rows,
    "تعداد خواب",
    file.rooms !== null &&
    file.rooms !== undefined
      ? formatNumber(
          file.rooms
        )
      : null
  );

  addDetailRow(
    rows,
    "سال ساخت",
    file.year
      ? formatNumber(
          file.year
        )
      : null
  );

  addDetailRow(
    rows,
    "وضعیت ملک",
    CONDITION_LABELS[
      file.condition
    ]
  );

  addDetailRow(
    rows,
    "وضعیت سکونت",
    OCCUPANCY_LABELS[
      file.occupancy
    ]
  );

  addDetailRow(
    rows,
    "دارنده کلید",
    KEY_HOLDER_LABELS[
      file.keyHolder
    ]
  );

  if (
    file.price !== null &&
    file.price !== undefined
  ) {
    addDetailRow(
      rows,
      "قیمت",
      formatMoney(
        file.price
      )
    );
  }

  if (
    file.currentDeposit !==
      null &&
    file.currentDeposit !==
      undefined
  ) {
    addDetailRow(
      rows,
      "ودیعه فعلی",
      formatMoney(
        file.currentDeposit
      )
    );
  }

  if (
    file.currentRent !==
      null &&
    file.currentRent !==
      undefined
  ) {
    addDetailRow(
      rows,
      "اجاره فعلی",
      formatMoney(
        file.currentRent
      )
    );
  }

  if (
    file.suggestedDeposit !==
      null &&
    file.suggestedDeposit !==
      undefined
  ) {
    addDetailRow(
      rows,
      "ودیعه پیشنهادی",
      formatMoney(
        file.suggestedDeposit
      )
    );
  }

  if (
    file.suggestedRent !==
      null &&
    file.suggestedRent !==
      undefined
  ) {
    addDetailRow(
      rows,
      "اجاره پیشنهادی",
      formatMoney(
        file.suggestedRent
      )
    );
  }

  if (
    file.capital !== null &&
    file.capital !== undefined
  ) {
    addDetailRow(
      rows,
      "سرمایه",
      formatMoney(
        file.capital
      )
    );
  }

  if (
    file.deposit !== null &&
    file.deposit !== undefined
  ) {
    addDetailRow(
      rows,
      "ودیعه",
      formatMoney(
        file.deposit
      )
    );
  }

  if (
    file.rent !== null &&
    file.rent !== undefined
  ) {
    addDetailRow(
      rows,
      "اجاره",
      formatMoney(
        file.rent
      )
    );
  }

  if (file.familyStatus) {
    addDetailRow(
      rows,
      "وضعیت تأهل",
      FAMILY_STATUS_LABELS[
        file.familyStatus
      ]
    );
  }

  if (
    file.familySize !== null &&
    file.familySize !== undefined
  ) {
    addDetailRow(
      rows,
      "تعداد اعضای خانواده",
      formatNumber(
        file.familySize
      )
    );
  }

  if (
    Array.isArray(
      file.amenities
    ) &&
    file.amenities.length
  ) {
    addDetailRow(
      rows,
      "امکانات",
      file.amenities
        .map(
          item =>
            AMENITY_LABELS[
              item
            ] ||
            item
        )
        .join("، ")
    );
  }

  addDetailRow(
    rows,
    "مدت پیگیری",
    `${formatNumber(
      file.followUpDays
    )} روز`
  );

  addDetailRow(
    rows,
    "تاریخ پیگیری",
    formatDate(
      file.followUpAt
    )
  );

  addDetailRow(
    rows,
    "ثبت‌کننده",
    file.createdByName ||
      file.createdBy
  );

  if (file.notes) {
    addDetailRow(
      rows,
      "توضیحات",
      file.notes
    );
  }

  content.innerHTML = `
    <div class="detail-grid">
      ${rows.join("")}
    </div>

    ${
      isFollowUp(file)
        ? `
          <div class="detail-followup">
            این فایل نیاز به پیگیری دارد.
          </div>
        `
        : ""
    }
  `;

  updateDetailPermissions(
    file
  );
}


function addDetailRow(
  rows,
  label,
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return;
  }

  rows.push(`
    <div class="detail-row">
      <div class="detail-label">
        ${escapeHTML(
          label
        )}
      </div>

      <div class="detail-value">
        ${escapeHTML(
          value
        )}
      </div>
    </div>
  `);
}


function updateDetailPermissions(
  file
) {
  const editButton =
    $("#editDetailButton");

  const deleteButton =
    $("#deleteDetailButton");

  const user =
    state.currentUser;

  const canEdit =
    user &&
    (
      user.role ===
        "admin" ||
      String(
        file.createdBy
      ) ===
        String(
          user.username
        )
    );

  if (editButton) {
    editButton.classList.toggle(
      "hidden",
      !canEdit
    );
  }

  if (deleteButton) {
    deleteButton.classList.toggle(
      "hidden",
      user?.role !==
        "admin"
    );
  }
}


// =========================================================
// Renew
// =========================================================

function openRenew() {
  if (!state.selectedFile) {
    return;
  }

  const title =
    $("#renewTitle");

  if (title) {
    title.textContent =
      `پیگیری فایل #${state.selectedFile.code}`;
  }

  openModal(
    $("#renewModal")
  );
}


function renewFile(days) {
  const file =
    state.selectedFile;

  if (!file) {
    return;
  }

  file.followUpDays =
    Number(days);

  file.followUpAt =
    calculateFollowUp(
      Number(days)
    );

  file.updatedAt =
    nowISO();

  file.updatedBy =
    state.currentUser?.username ||
    null;

  saveFiles();

  closeModal(
    $("#renewModal")
  );

  renderDetail(file);

  renderHome();

  toast(
    `پیگیری برای ${days} روز تمدید شد.`,
    "success"
  );
}


// =========================================================
// Delete
// =========================================================

function deleteSelectedFile() {
  const file =
    state.selectedFile;

  if (!file) {
    return;
  }

  if (
    state.currentUser?.role !==
    "admin"
  ) {
    toast(
      "فقط مدیر می‌تواند فایل را حذف کند.",
      "error"
    );

    return;
  }

  const confirmed =
    window.confirm(
      `فایل شماره ${file.code} بایگانی شود؟`
    );

  if (!confirmed) {
    return;
  }

  const index =
    state.files.findIndex(
      item =>
        String(item.id) ===
        String(file.id)
    );

  if (index === -1) {
    return;
  }

  state.files[index] = {
    ...state.files[index],
    status:
      "archived",
    updatedAt:
      nowISO(),
    updatedBy:
      state.currentUser?.username ||
      null,
  };

  // فایل‌های بایگانی‌شده
  // در لیست اصلی نمایش داده نمی‌شوند.
  state.files =
    state.files.filter(
      item =>
        item.status !==
        "archived"
    );

  saveFiles();

  closeModal(
    $("#detailModal")
  );

  renderHome();

  toast(
    "فایل بایگانی شد.",
    "success"
  );
}


// =========================================================
// Filters
// =========================================================

function setFilter(filter) {
  state.activeFilter =
    filter;

  $$(".filter-button, .filter-btn").forEach(
    button => {
      const buttonFilter =
        button.dataset.filter;

      button.classList.toggle(
        "active",
        buttonFilter ===
          filter
      );
    }
  );

  renderHome();
}


// =========================================================
// Events
// =========================================================

function bindEvents() {
  // Login
  const loginForm =
    $("#loginForm");

  if (loginForm) {
    loginForm.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const username =
          $("#username")?.value
            .trim();

        const password =
          $("#password")?.value ||
          "";

        const success =
          login(
            username,
            password
          );

        if (!success) {
          const error =
            $("#loginError");

          if (error) {
            error.textContent =
              "نام کاربری یا رمز عبور اشتباه است.";

            error.classList.remove(
              "hidden"
            );
          }

          return;
        }

        const error =
          $("#loginError");

        if (error) {
          error.textContent = "";

          error.classList.add(
            "hidden"
          );
        }

        showApp();
      }
    );
  }


  // Logout
  const logoutButton =
    $("#logoutButton");

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      logout
    );
  }


  // New file
  const newFileButton =
    $("#newFileButton");

  if (newFileButton) {
    newFileButton.addEventListener(
      "click",
      openNewFile
    );
  }


  const emptyNewFileButton =
    $("#emptyNewFileButton");

  if (emptyNewFileButton) {
    emptyNewFileButton.addEventListener(
      "click",
      openNewFile
    );
  }


  // Search
  const searchInput =
    $("#searchInput");

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      event => {
        state.search =
          event.target.value;

        renderHome();
      }
    );
  }


  // Filters
  $$(
    "[data-filter]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          setFilter(
            button.dataset.filter
          );
        }
      );
    }
  );


  // Follow-up button
  const followUpButton =
    $("#followUpButton");

  if (followUpButton) {
    followUpButton.addEventListener(
      "click",
      () => {
        setFilter(
          "followup"
        );
      }
    );
  }


  // File type
  $$(
    'input[name="fileType"]'
  ).forEach(
    input => {
      input.addEventListener(
        "change",
        updateFormSections
      );
    }
  );


  // File form
  const fileForm =
    $("#fileForm");

  if (fileForm) {
    fileForm.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const data =
          getFormData();

        saveFile(data);
      }
    );
  }


  // Cancel form
  const cancelFormButton =
    $("#cancelFormButton");

  if (cancelFormButton) {
    cancelFormButton.addEventListener(
      "click",
      () => {
        closeModal(
          $("#fileModal")
        );
      }
    );
  }


  // Close buttons
  const closeModalButton =
    $("#closeModalButton");

  if (closeModalButton) {
    closeModalButton.addEventListener(
      "click",
      () => {
        closeModal(
          $("#fileModal")
        );
      }
    );
  }


  const closeDetailButton =
    $("#closeDetailButton");

  if (closeDetailButton) {
    closeDetailButton.addEventListener(
      "click",
      () => {
        closeModal(
          $("#detailModal")
        );
      }
    );
  }


  const closeRenewButton =
    $("#closeRenewButton");

  if (closeRenewButton) {
    closeRenewButton.addEventListener(
      "click",
      () => {
        closeModal(
          $("#renewModal")
        );
      }
    );
  }


  // Edit detail
  const editDetailButton =
    $("#editDetailButton");

  if (editDetailButton) {
    editDetailButton.addEventListener(
      "click",
      () => {
        openEdit(
          state.selectedFile
        );
      }
    );
  }


  // Renew detail
  const renewDetailButton =
    $("#renewDetailButton");

  if (renewDetailButton) {
    renewDetailButton.addEventListener(
      "click",
      openRenew
    );
  }


  // Delete
  const deleteDetailButton =
    $("#deleteDetailButton");

  if (deleteDetailButton) {
    deleteDetailButton.addEventListener(
      "click",
      deleteSelectedFile
    );
  }


  // Renew options
  $$(
    "[data-days]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          renewFile(
            Number(
              button.dataset.days
            )
          );
        }
      );
    }
  );


  // Close modal by clicking backdrop
  $$(".modal").forEach(
    modal => {
      modal.addEventListener(
        "click",
        event => {
          if (
            event.target ===
            modal
          ) {
            closeModal(
              modal
            );
          }
        }
      );
    }
  );


  // Escape
  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      $$(".modal:not(.hidden)").forEach(
        modal => {
          closeModal(
            modal
          );
        }
      );
    }
  );
}


// =========================================================
// Demo data helper
// =========================================================
// برای زمانی که بخواهیم بعداً تست کنیم.

function clearAllData() {
  const confirmed =
    window.confirm(
      "تمام فایل‌های ذخیره‌شده روی این دستگاه حذف شوند؟"
    );

  if (!confirmed) {
    return;
  }

  state.files = [];

  localStorage.removeItem(
    STORAGE_KEY
  );

  renderHome();

  toast(
    "تمام اطلاعات این دستگاه حذف شد.",
    "success"
  );
}


// =========================================================
// Init
// =========================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {
    bindEvents();

    updateFormSections();

    checkAuth();
  }
);


// =========================================================
// Global functions
// =========================================================

window.openDetail =
  openDetail;

window.openNewFile =
  openNewFile;

window.clearAllData =
  clearAllData;
