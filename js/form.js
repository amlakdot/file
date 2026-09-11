/* =========================================================
   FORM
========================================================= */

import { state } from "./state.js";
import {
  $,
  generateFileId,
  validatePhoneNumber,
  showToast,
  shareFileText,
  parseMoney,
  formatGroupedNumber,
  formatMoney,
  setupMoneyInputs,
  setMoneyInputValue
} from "./helpers.js";
import { commitFiles } from "./github.js";
import {
  getFileData,
  getFileName,
  getFilePhone,
  getFileLocation
} from "./files.js";
import { closeFileModal } from "./modal.js";
import {
  TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  getStatusLabel
} from "./labels.js";

const MONEY_FIELD_IDS = [
  "salePrice",
  "currentDeposit",
  "currentRent",
  "suggestedDeposit",
  "suggestedRent",
  "capital",
  "tenantDeposit",
  "tenantRent"
];

export function setupFileForm() {
  const form = $("fileForm");
  if (!form) return;

  form.querySelectorAll('input[name="fileType"]').forEach((radio) => {
    radio.addEventListener("change", updateFormVisibility);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveFile();
  });

  $("deleteFileButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteCurrentFile();
  });

  $("shareFileButton")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await shareCurrentFile();
  });

  setupMoneyInputs(form);
  updateFormVisibility();
}

export function updateFormVisibility() {
  const fileType =
    document.querySelector('input[name="fileType"]:checked')?.value ||
    "sale";

  $("buyerSection")?.classList.toggle("hidden", fileType !== "buyer");
  $("tenantSection")?.classList.toggle("hidden", fileType !== "tenant");

  const showPropertyDetails =
    fileType === "sale" || fileType === "landlord";

  $("propertyDetailsSection")?.classList.toggle(
    "hidden",
    !showPropertyDetails
  );

  document.querySelectorAll(".property-field").forEach((el) => {
    el.classList.toggle("hidden", !showPropertyDetails);
  });

  document.querySelectorAll(".landlord-only").forEach((el) => {
    el.classList.toggle("hidden", fileType !== "landlord");
  });

  // قیمت فروش فقط برای ملک فروشی
  document.querySelectorAll(".sale-only").forEach((el) => {
    el.classList.toggle("hidden", fileType !== "sale");
  });

  const occupancy = $("occupancy")?.value || "";
  const showOccupancyFields =
    showPropertyDetails && occupancy === "tenant";

  $("currentDepositField")?.classList.toggle(
    "hidden",
    !showOccupancyFields
  );
  $("currentRentField")?.classList.toggle(
    "hidden",
    !showOccupancyFields
  );

  const familyStatus = $("familyStatus")?.value || "";
  $("familySizeField")?.classList.toggle(
    "hidden",
    familyStatus !== "family"
  );

  $("amenitiesSection")?.classList.toggle("hidden", !showPropertyDetails);
}

function resetFormFields() {
  const form = $("fileForm");
  if (form) form.reset();

  if ($("followUpDays")) $("followUpDays").value = 10;
  if ($("fileStatus")) $("fileStatus").value = "active";

  MONEY_FIELD_IDS.forEach((id) => {
    if ($(id)) $(id).value = "";
  });

  if ($("notes")) $("notes").value = "";

  document.querySelectorAll(".amenity").forEach((cb) => {
    cb.checked = false;
  });

  const saleRadio = document.querySelector(
    'input[name="fileType"][value="sale"]'
  );
  if (saleRadio) saleRadio.checked = true;
}

export async function saveFile() {
  if (state.isSaving) {
    showToast("در حال ذخیره... لطفاً صبر کنید.", "warning");
    return;
  }

  const fileType =
    document.querySelector('input[name="fileType"]:checked')?.value ||
    "sale";

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

  const salePrice = parseMoney($("salePrice")?.value);
  const currentDeposit = parseMoney($("currentDeposit")?.value);
  const currentRent = parseMoney($("currentRent")?.value);
  const suggestedDeposit = parseMoney($("suggestedDeposit")?.value);
  const suggestedRent = parseMoney($("suggestedRent")?.value);

  const capital = parseMoney($("capital")?.value);
  const buyerNotes = ($("buyerNotes")?.value || "").trim();

  const tenantDeposit = parseMoney($("tenantDeposit")?.value);
  const tenantRent = parseMoney($("tenantRent")?.value);
  const familyStatus = $("familyStatus")?.value || "";
  const familySize = parseInt($("familySize")?.value || "0", 10) || 0;
  const tenantNotes = ($("tenantNotes")?.value || "").trim();

  const notes = ($("notes")?.value || "").trim();

  const amenities = Array.from(
    document.querySelectorAll(".amenity:checked")
  ).map((c) => c.value);

  let status = $("fileStatus")?.value || "active";
  const allowedStatuses = ["active", "followup", "pending", "archived", "done"];
  if (!allowedStatuses.includes(status)) status = "active";

  const days = parseInt($("followUpDays")?.value || "10", 10);
  let followUpDate = null;

  if (Number.isFinite(days) && days > 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    followUpDate = d.toISOString();
  }

  if (status === "followup" && !followUpDate) {
    followUpDate = new Date().toISOString();
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
    showToast(
      "لطفاً شماره تلفن صحیح وارد کنید (09xxxxxxxxx).",
      "error"
    );
    return;
  }

  let existingFile = null;
  if (state.editingFileId) {
    existingFile = state.files.find((f) => f.id === state.editingFileId);
    if (!existingFile) {
      showToast("فایل موردنظر برای ویرایش پیدا نشد.", "error");
      return;
    }
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
    salePrice,
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
    notes,
    amenities
  };

  let newFiles;
  if (state.editingFileId) {
    newFiles = state.files.map((f) =>
      f.id === state.editingFileId ? { ...f, ...fileData } : f
    );
  } else {
    newFiles = [...state.files, fileData];
  }

  const success = await commitFiles(
    newFiles,
    state.editingFileId
      ? `Update file ${fileData.id}`
      : `Create new file ${fileData.id}`
  );

  if (success) closeFileModal();
}

export async function deleteCurrentFile() {
  if (!state.editingFileId) {
    showToast("فایلی برای حذف انتخاب نشده است.", "error");
    return;
  }

  if (state.isSaving) {
    showToast("در حال ذخیره... لطفاً صبر کنید.", "warning");
    return;
  }

  const file = state.files.find((f) => f.id === state.editingFileId);
  if (!file) {
    showToast("فایل پیدا نشد.", "error");
    return;
  }

  const name = getFileName(file);
  const confirmed = window.confirm(
    `آیا از حذف فایل «${name}» مطمئن هستید؟\nاین عمل قابل بازگشت نیست.`
  );
  if (!confirmed) return;

  const newFiles = state.files.filter((f) => f.id !== state.editingFileId);
  const success = await commitFiles(
    newFiles,
    `Delete file ${state.editingFileId}`
  );

  if (success) {
    showToast("فایل حذف شد.", "success");
    closeFileModal();
  }
}

export async function shareCurrentFile() {
  let name = "";
  let phone = "";
  let location = "";
  let type = "sale";
  let status = "active";
  let propertyType = "";
  let area = "";
  let salePrice = 0;
  let capital = 0;
  let notes = "";

  if (state.editingFileId) {
    const file = state.files.find((f) => f.id === state.editingFileId);
    if (file) {
      name = getFileName(file);
      phone = getFilePhone(file);
      location = getFileLocation(file);
      type = file.type || "sale";
      status = file.status || "active";
      const data = getFileData(file);
      propertyType = data.propertyType || "";
      area = data.area || "";
      salePrice = data.salePrice || 0;
      capital = data.capital || 0;
      notes = data.notes || "";
    }
  }

  name = ($("name")?.value || "").trim() || name;
  phone = ($("phone")?.value || "").trim() || phone;
  location = ($("location")?.value || "").trim() || location;
  type =
    document.querySelector('input[name="fileType"]:checked')?.value || type;
  status = $("fileStatus")?.value || status;
  propertyType = $("propertyType")?.value || propertyType;
  area = $("area")?.value || area;
  salePrice = parseMoney($("salePrice")?.value) || salePrice;
  capital = parseMoney($("capital")?.value) || capital;
  notes = ($("notes")?.value || "").trim() || notes;

  if (!name && !phone) {
    showToast("اطلاعاتی برای اشتراک‌گذاری وجود ندارد.", "error");
    return;
  }

  const lines = [
    "🏠 املاک DOT",
    `نوع: ${TYPE_LABELS[type] || type}`,
    `نام: ${name || "—"}`,
    `تلفن: ${phone || "—"}`,
    `موقعیت: ${location || "—"}`
  ];

  if (propertyType) {
    lines.push(
      `نوع ملک: ${PROPERTY_TYPE_LABELS[propertyType] || propertyType}`
    );
  }
  if (area) lines.push(`متراژ: ${area} متر`);
  if (salePrice) lines.push(`قیمت: ${formatMoney(salePrice)}`);
  if (capital) lines.push(`سرمایه: ${formatMoney(capital)}`);
  if (notes) lines.push(`توضیحات: ${notes}`);
  lines.push(`وضعیت: ${getStatusLabel(status)}`);

  const text = lines.join("\n");
  const result = await shareFileText("املاک DOT", text);

  if (result === "shared") {
    showToast("اشتراک‌گذاری انجام شد.", "success");
  } else if (result === "copied") {
    showToast("متن فایل در کلیپ‌بورد کپی شد.", "success");
  } else if (result === "cancelled") {
    // لغو کاربر
  } else {
    showToast("اشتراک‌گذاری ناموفق بود.", "error");
  }
}

export function loadFileIntoForm(fileId) {
  const file = state.files.find((f) => f.id === fileId);
  if (!file) {
    showToast("فایل برای ویرایش پیدا نشد.", "error");
    return;
  }

  resetFormFields();

  const data = getFileData(file);

  const typeRadio = document.querySelector(
    `input[name="fileType"][value="${file.type || "sale"}"]`
  );
  if (typeRadio) typeRadio.checked = true;

  if ($("fileStatus")) {
    $("fileStatus").value = file.status || "active";
  }

  const textFields = {
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
    buyerNotes: data.buyerNotes,
    familyStatus: data.familyStatus,
    familySize: data.familySize,
    tenantNotes: data.tenantNotes,
    notes: data.notes
  };

  Object.entries(textFields).forEach(([id, value]) => {
    const el = $(id);
    if (!el) return;
    if (value === undefined || value === null) {
      el.value = "";
    } else {
      el.value = value;
    }
  });

  // فیلدهای پولی با جداکننده
  setMoneyInputValue("salePrice", data.salePrice);
  setMoneyInputValue("currentDeposit", data.currentDeposit);
  setMoneyInputValue("currentRent", data.currentRent);
  setMoneyInputValue("suggestedDeposit", data.suggestedDeposit);
  setMoneyInputValue("suggestedRent", data.suggestedRent);
  setMoneyInputValue("capital", data.capital);
  setMoneyInputValue("tenantDeposit", data.tenantDeposit);
  setMoneyInputValue("tenantRent", data.tenantRent);

  if (file.followUpDate) {
    const target = new Date(file.followUpDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
    if ($("followUpDays")) {
      $("followUpDays").value = Math.max(1, diffDays);
    }
  } else if ($("followUpDays")) {
    $("followUpDays").value = 10;
  }

  document.querySelectorAll(".amenity").forEach((cb) => {
    cb.checked =
      Array.isArray(data.amenities) && data.amenities.includes(cb.value);
  });

  updateFormVisibility();
}

export { resetFormFields };
