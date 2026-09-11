/* =========================================================
   FORM
========================================================= */

import { state } from "./state.js";
import {
  $,
  generateFileId,
  validatePhoneNumber,
  showToast,
  shareFileText
} from "./helpers.js";
import { commitFiles } from "./github.js";
import { getFileData, getFileName, getFilePhone, getFileLocation } from "./files.js";
import { closeFileModal } from "./modal.js";
import { TYPE_LABELS, PROPERTY_TYPE_LABELS, getStatusLabel } from "./labels.js";

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

  // امکانات فقط برای ملک فروشی و مالک
  $("amenitiesSection")?.classList.toggle("hidden", !showPropertyDetails);
}

function resetFormFields() {
  const form = $("fileForm");
  if (form) form.reset();

  if ($("followUpDays")) $("followUpDays").value = 10;
  if ($("fileStatus")) $("fileStatus").value = "active";

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
  const currentDeposit =
    parseInt($("currentDeposit")?.value || "0", 10) || 0;
  const currentRent = parseInt($("currentRent")?.value || "0", 10) || 0;
  const suggestedDeposit =
    parseInt($("suggestedDeposit")?.value || "0", 10) || 0;
  const suggestedRent =
    parseInt($("suggestedRent")?.value || "0", 10) || 0;

  const capital = parseInt($("capital")?.value || "0", 10) || 0;
  const buyerNotes = ($("buyerNotes")?.value || "").trim();

  const tenantDeposit =
    parseInt($("tenantDeposit")?.value || "0", 10) || 0;
  const tenantRent = parseInt($("tenantRent")?.value || "0", 10) || 0;
  const familyStatus = $("familyStatus")?.value || "";
  const familySize = parseInt($("familySize")?.value || "0", 10) || 0;
  const tenantNotes = ($("tenantNotes")?.value || "").trim();

  const amenities = Array.from(
    document.querySelectorAll(".amenity:checked")
  ).map((c) => c.value);

  // وضعیت فایل (قابل تغییر توسط کاربر)
  let status = $("fileStatus")?.value || "active";
  const allowedStatuses = ["active", "followup", "pending", "archived", "done"];
  if (!allowedStatuses.includes(status)) status = "active";

  // Follow-up: days → date
  const days = parseInt($("followUpDays")?.value || "10", 10);
  let followUpDate = null;

  if (Number.isFinite(days) && days > 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    followUpDate = d.toISOString();
  }

  // اگر وضعیت پیگیری است و تاریخ نداریم، امروز را بگذار
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
    }
  }

  // اولویت با مقادیر فعلی فرم
  name = ($("name")?.value || "").trim() || name;
  phone = ($("phone")?.value || "").trim() || phone;
  location = ($("location")?.value || "").trim() || location;
  type =
    document.querySelector('input[name="fileType"]:checked')?.value || type;
  status = $("fileStatus")?.value || status;
  propertyType = $("propertyType")?.value || propertyType;
  area = $("area")?.value || area;

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
  if (area) {
    lines.push(`متراژ: ${area} متر`);
  }
  lines.push(`وضعیت: ${getStatusLabel(status)}`);

  const text = lines.join("\n");
  const result = await shareFileText("املاک DOT", text);

  if (result === "shared") {
    showToast("اشتراک‌گذاری انجام شد.", "success");
  } else if (result === "copied") {
    showToast("متن فایل در کلیپ‌بورد کپی شد.", "success");
  } else if (result === "cancelled") {
    // کاربر لغو کرد
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

  // اول فرم را کامل پاک کن تا داده قبلی نماند
  resetFormFields();

  const data = getFileData(file);

  const typeRadio = document.querySelector(
    `input[name="fileType"][value="${file.type || "sale"}"]`
  );
  if (typeRadio) typeRadio.checked = true;

  if ($("fileStatus")) {
    $("fileStatus").value = file.status || "active";
  }

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
    if (!el) return;
    if (value === undefined || value === null) {
      el.value = "";
    } else {
      el.value = value;
    }
  });

  // محاسبه روزهای باقی‌مانده برای پیگیری
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
