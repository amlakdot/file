/* =========================================================
   FORM
========================================================= */

import { state } from "./state.js";
import {
  $,
  generateFileId,
  generateFileCode,
  validatePhoneNumber,
  showToast,
  shareFileText,
  parseMoney,
  formatMoney,
  setupMoneyInputs,
  setMoneyInputValue,
  isEncryptedPhonePlaceholder
} from "./helpers.js";
import { commitFiles, publishPublicFiles } from "./github.js";
import {
  getFileData,
  getFileName,
  getFilePhone,
  getFileLocation,
  findDuplicatePhone,
  findDuplicatePlaque
} from "./files.js";
import { closeFileModal, clearFormDirty } from "./modal.js";
import {
  TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  getStatusLabel
} from "./labels.js";
import { refreshDivarTags } from "./divar.js";

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

const FORM_TOTAL_STEPS = 3;
let formCurrentStep = 1;

export function getFormCurrentStep() {
  return formCurrentStep;
}

export function setFormStep(step) {
  const s = Math.max(1, Math.min(FORM_TOTAL_STEPS, Number(step) || 1));
  formCurrentStep = s;

  document.querySelectorAll("[data-form-step]").forEach((el) => {
    const n = Number(el.getAttribute("data-form-step"));
    el.classList.toggle("hidden", n !== s);
  });

  document.querySelectorAll("[data-step-dot]").forEach((dot) => {
    const n = Number(dot.getAttribute("data-step-dot"));
    dot.classList.toggle("active", n === s);
    dot.classList.toggle("done", n < s);
  });

  document.querySelectorAll(".form-step-line").forEach((line, idx) => {
    line.classList.toggle("done", idx + 1 < s);
  });

  const prevBtn = $("formPrevStepButton");
  const nextBtn = $("formNextStepButton");
  const saveBtn = $("saveFileButton");
  if (prevBtn) prevBtn.classList.toggle("hidden", s <= 1);
  if (nextBtn) nextBtn.classList.toggle("hidden", s >= FORM_TOTAL_STEPS);
  if (saveBtn) saveBtn.classList.toggle("hidden", s < FORM_TOTAL_STEPS);

  const formBody = $("fileForm");
  if (formBody) {
    const modalCard = formBody.closest(".modal-card");
    if (modalCard) modalCard.scrollTop = 0;
    formBody.scrollTop = 0;
  }
}

function validateFormStep(step) {
  if (step === 1) {
    const name = ($("name")?.value || "").trim();
    const phone = ($("phone")?.value || "").trim();
    const editingId = state.editingFileId;
    const existing = editingId
      ? state.files.find((f) => f.id === editingId)
      : null;
    const isDivar =
      existing?.source === "divar" || !!existing?.divarToken;
    if (!name && !isDivar) {
      showToast("لطفاً نام را وارد کنید.", "error");
      $("name")?.focus();
      return false;
    }
    if (!phone && !isDivar) {
      showToast("لطفاً شماره تلفن را وارد کنید.", "error");
      $("phone")?.focus();
      return false;
    }
  }
  return true;
}

export function setupFileForm() {
  const form = $("fileForm");
  if (!form) return;

  form.querySelectorAll('input[name="fileType"]').forEach((radio) => {
    radio.addEventListener("change", updateFormVisibility);
  });

  $("propertyType")?.addEventListener("change", updateFormVisibility);
  $("keyHolder")?.addEventListener("change", updateFormVisibility);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (formCurrentStep < FORM_TOTAL_STEPS) {
      if (!validateFormStep(formCurrentStep)) return;
      setFormStep(formCurrentStep + 1);
      return;
    }
    await saveFile();
  });

  $("formNextStepButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!validateFormStep(formCurrentStep)) return;
    setFormStep(formCurrentStep + 1);
  });

  $("formPrevStepButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    setFormStep(formCurrentStep - 1);
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

  $("saveFileButton")?.addEventListener("click", async (e) => {
    // type=submit handles via form submit
  });

  setupMoneyInputs(form);
  updateFormVisibility();
  setFormStep(1);
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

  document.querySelectorAll(".sale-only").forEach((el) => {
    el.classList.toggle("hidden", fileType !== "sale");
  });

  // طبقه فقط برای آپارتمان (و در حالت ملک/مالک)
  const propertyType = $("propertyType")?.value || "";
  const showFloor =
    showPropertyDetails &&
    (propertyType === "apartment" || propertyType === "office" || propertyType === "commercial");

  document.querySelectorAll(".floor-field").forEach((el) => {
    el.classList.toggle("hidden", !showFloor);
  });

  // تماس دارنده کلید وقتی مالک یا دفتر نیست
  const keyHolder = $("keyHolder")?.value || "";
  const needsKeyContact =
    showPropertyDetails &&
    keyHolder &&
    keyHolder !== "owner" &&
    keyHolder !== "office";

  $("keyHolderContactFields")?.classList.toggle("hidden", !needsKeyContact);

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
  if ($("publicNotes")) $("publicNotes").value = "";
  if ($("plaque")) $("plaque").value = "";
  if ($("unitFloor")) $("unitFloor").value = "";
  if ($("totalFloors")) $("totalFloors").value = "";
  if ($("keyHolderName")) $("keyHolderName").value = "";
  if ($("keyHolderPhone")) $("keyHolderPhone").value = "";

  document.querySelectorAll(".amenity").forEach((cb) => {
    cb.checked = false;
  });

  const saleRadio = document.querySelector(
    'input[name="fileType"][value="sale"]'
  );
  if (saleRadio) saleRadio.checked = true;

  clearIncompleteHighlights();
  setFormStep(1);
}

export function clearIncompleteHighlights() {
  document.querySelectorAll(".field-incomplete").forEach((el) => {
    el.classList.remove("field-incomplete");
  });
  $("formIncompleteBanner")?.remove();
}

export function highlightIncompleteFields(file) {
  clearIncompleteHighlights();
  const name = (getFileName(file) || "").trim();
  const phone = (getFilePhone(file) || "").trim();
  const needsName = !name || name.startsWith("آگهی دیوار");
  const needsPhone = !phone;

  if (!needsName && !needsPhone) return;

  const form = $("fileForm");
  if (form && !$("formIncompleteBanner")) {
    const banner = document.createElement("div");
    banner.id = "formIncompleteBanner";
    banner.className = "field-incomplete-banner";
    banner.textContent =
      "این فایل از دیوار آمده. نام و شماره تماس را تکمیل کنید.";
    const stepper = $("formStepper");
    if (stepper) stepper.insertAdjacentElement("afterend", banner);
    else form.prepend(banner);
  }

  if (needsName) {
    $("name")?.classList.add("field-incomplete");
    $("name")?.closest(".field")?.classList.add("field-incomplete");
  }
  if (needsPhone) {
    $("phone")?.classList.add("field-incomplete");
    $("phone")?.closest(".field")?.classList.add("field-incomplete");
  }
  setFormStep(1);
  requestAnimationFrame(() => {
    const focusEl = needsName ? $("name") : $("phone");
    focusEl?.focus();
  });
}

function setSaveButtonLoading(loading) {
  const btn = $("saveFileButton");
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "در حال ذخیره...";
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    } else {
      btn.textContent = "ذخیره";
    }
  }
}

export async function saveFile() {
  // جلوگیری از double-submit
  if (state.isSaving) {
    showToast("در حال ذخیره... لطفاً صبر کنید.", "warning");
    return;
  }

  // شناسه ویرایش را همان اول قفل کن (closeModal بعداً null می‌کند)
  const editingId = state.editingFileId;

  const fileType =
    document.querySelector('input[name="fileType"]:checked')?.value ||
    "sale";

  const name = ($("name")?.value || "").trim();
  let phone = ($("phone")?.value || "").trim();
  const propertyType = $("propertyType")?.value || "";
  const area = parseInt($("area")?.value || "0", 10) || 0;
  const rooms = parseInt($("rooms")?.value || "0", 10) || 0;
  const year = parseInt($("year")?.value || "0", 10) || 0;
  const location = ($("location")?.value || "").trim();

  const unitFloor = ($("unitFloor")?.value || "").trim();
  const totalFloors = parseInt($("totalFloors")?.value || "0", 10) || 0;

  const keyHolder = $("keyHolder")?.value || "";
  const keyHolderName = ($("keyHolderName")?.value || "").trim();
  let keyHolderPhone = ($("keyHolderPhone")?.value || "").trim();
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
  const publicNotes = ($("publicNotes")?.value || "").trim();

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
    // ظهر محلی تا جابه‌جایی timezone باعث یک روز عقب/جلو نشود
    d.setHours(12, 0, 0, 0);
    followUpDate = d.toISOString();
    // تمدید به آینده: وضعیت را از «پیگیری» به «فعال» برگردان
    if (status === "followup") {
      status = "active";
    }
  }

  if (status === "followup" && !followUpDate) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    followUpDate = d.toISOString();
  }

  let existingFile = null;
  if (editingId) {
    existingFile = state.files.find((f) => f.id === editingId);
    if (!existingFile) {
      showToast("فایل موردنظر برای ویرایش پیدا نشد. صفحه را رفرش کنید.", "error");
      return;
    }
  }

  // فایل‌های واردشده از دیوار تا زمان تکمیل نام/تلفن مجازند خالی باشند
  const isDivarSource =
    existingFile?.source === "divar" ||
    existingFile?.divarToken ||
    false;

  if (!name && !isDivarSource) {
    showToast("لطفاً نام را وارد کنید.", "error");
    $("name")?.focus();
    return;
  }
  if (!phone && !isDivarSource) {
    showToast("لطفاً شماره تلفن را وارد کنید.", "error");
    $("phone")?.focus();
    return;
  }

  // اگر تلفن رمزشده یا غیرقابل‌خواندن است، از نسخه قبلی نگه دار
  if (phone && !validatePhoneNumber(phone)) {
    if (
      editingId &&
      existingFile &&
      isEncryptedPhonePlaceholder(phone)
    ) {
      phone = getFilePhone(existingFile) || existingFile.phone || phone;
    }
    if (!validatePhoneNumber(phone)) {
      // شاید هنوز plaintext معتبر در فایل قبلی باشد
      const prev = existingFile ? getFilePhone(existingFile) : "";
      if (prev && validatePhoneNumber(prev) && isEncryptedPhonePlaceholder(($("phone")?.value || "").trim())) {
        phone = prev;
      } else if (!isDivarSource) {
        showToast(
          "لطفاً شماره تلفن صحیح وارد کنید (09xxxxxxxxx).",
          "error"
        );
        $("phone")?.focus();
        return;
      }
    }
  }

  // تلفن دارنده کلید اختیاری است؛ اگر پر شد باید معتبر باشد
  if (keyHolderPhone) {
    if (!validatePhoneNumber(keyHolderPhone)) {
      showToast("شماره تلفن دارنده کلید معتبر نیست.", "error");
      $("keyHolderPhone")?.focus();
      return;
    }
  }

  const plaque = ($("plaque")?.value || "").trim();

  // جلوگیری از تکراری بودن تلفن (فقط وقتی شماره معتبر داریم)
  if (phone && validatePhoneNumber(phone)) {
    const dupPhone = findDuplicatePhone(phone, editingId);
    if (dupPhone) {
      showToast(
        `این شماره قبلاً برای «${getFileName(dupPhone)}» ثبت شده است.`,
        "error"
      );
      $("phone")?.focus();
      return;
    }
  }

  // جلوگیری از پلاک تکراری
  if (plaque) {
    const dupPlaque = findDuplicatePlaque(plaque, editingId);
    if (dupPlaque) {
      showToast(
        `این پلاک قبلاً برای «${getFileName(dupPlaque)}» ثبت شده است.`,
        "error"
      );
      $("plaque")?.focus();
      return;
    }
  }

  // کد عددی فایل — روی ویرایش حفظ، برای فایل جدید خودکار
  const fileCode =
    existingFile && Number(existingFile.code) > 0
      ? Math.floor(Number(existingFile.code))
      : generateFileCode(state.files);

  let fileData = {
    id: editingId || generateFileId(),
    code: fileCode,
    type: fileType,
    status,
    followUpDate,
    createdAt: existingFile?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: name || (isDivarSource ? existingFile?.name || "" : name),
    phone: phone || (isDivarSource ? existingFile?.phone || "" : phone),
    propertyType,
    area,
    rooms,
    year,
    location,
    plaque,
    unitFloor,
    totalFloors,
    keyHolder,
    keyHolderName:
      keyHolder === "owner" || keyHolder === "office" ? "" : keyHolderName,
    keyHolderPhone:
      keyHolder === "owner" || keyHolder === "office" ? "" : keyHolderPhone,
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
    publicNotes,
    amenities
  };

  // حفظ فیلدهای دیوار هنگام ویرایش
  if (existingFile?.source === "divar" || existingFile?.divarToken) {
    fileData.source = existingFile.source || "divar";
    fileData.divarToken = existingFile.divarToken || "";
    fileData.divarUrl = existingFile.divarUrl || "";
    fileData.divarTitle = existingFile.divarTitle || "";
    fileData.tags = Array.isArray(existingFile.tags)
      ? [...existingFile.tags]
      : [];
    fileData = refreshDivarTags(fileData);
  }

  let newFiles;
  if (editingId) {
    newFiles = state.files.map((f) =>
      f.id === editingId ? { ...f, ...fileData } : f
    );
  } else {
    newFiles = [...state.files, fileData];
  }

  setSaveButtonLoading(true);
  try {
    const success = await commitFiles(
      newFiles,
      editingId ? `Update file ${fileData.id}` : `Create new file ${fileData.id}`
    );

    if (success) {
      clearFormDirty();
      closeFileModal(true);
      showToast("ذخیره شد. در حال به‌روزرسانی صفحه عمومی…", "success");
      // انتشار عمومی در پس‌زمینه تا صفحه public قدیمی نماند
      publishPublicFiles()
        .then((ok) => {
          if (ok) showToast("صفحه عمومی هم به‌روز شد.", "success");
        })
        .catch((e) => {
          console.warn("auto public publish:", e);
          showToast(
            "ذخیره شد، ولی انتشار عمومی ناموفق بود. از منو «انتشار برای عموم» را بزنید.",
            "warning"
          );
        });
    }
  } catch (err) {
    console.error(err);
    showToast(err?.message || "ذخیره انجام نشد.", "error");
  } finally {
    setSaveButtonLoading(false);
  }
}

export async function softDeleteFile(fileId) {
  if (!fileId) {
    showToast("فایلی انتخاب نشده است.", "error");
    return false;
  }
  if (state.isSaving) {
    showToast("در حال ذخیره... لطفاً صبر کنید.", "warning");
    return false;
  }
  const file = state.files.find((f) => f.id === fileId);
  if (!file) {
    showToast("فایل پیدا نشد.", "error");
    return false;
  }
  const name = getFileName(file);
  const confirmed = window.confirm(
    `فایل «${name}» به سطل بازیابی منتقل شود؟\nتا ۳۰ روز قابل بازگردانی است.`
  );
  if (!confirmed) return false;

  const newFiles = state.files.map((f) =>
    f.id === fileId
      ? {
          ...f,
          deletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      : f
  );
  const success = await commitFiles(newFiles, `Soft-delete file ${fileId}`);
  if (success) {
    showToast("به سطل بازیابی منتقل شد.", "success");
    clearFormDirty();
    closeFileModal(true);
    publishPublicFiles().catch(() => {});
  }
  return success;
}

export async function restoreFile(fileId) {
  if (!fileId || state.isSaving) return false;
  const newFiles = state.files.map((f) => {
    if (f.id !== fileId) return f;
    const { deletedAt, ...rest } = f;
    return { ...rest, updatedAt: new Date().toISOString() };
  });
  const success = await commitFiles(newFiles, `Restore file ${fileId}`);
  if (success) {
    showToast("فایل بازگردانی شد.", "success");
    publishPublicFiles().catch(() => {});
  }
  return success;
}

export async function purgeFile(fileId) {
  if (!fileId || state.isSaving) return false;
  const file = state.files.find((f) => f.id === fileId);
  if (!file) return false;
  const confirmed = window.confirm(
    `حذف دائمی «${getFileName(file)}»؟\nقابل بازگشت نیست.`
  );
  if (!confirmed) return false;
  const newFiles = state.files.filter((f) => f.id !== fileId);
  const success = await commitFiles(newFiles, `Purge file ${fileId}`);
  if (success) {
    showToast("برای همیشه حذف شد.", "success");
    publishPublicFiles().catch(() => {});
  }
  return success;
}

export async function deleteCurrentFile() {
  const editingId = state.editingFileId;
  if (!editingId) {
    showToast("فایلی برای حذف انتخاب نشده است.", "error");
    return;
  }
  await softDeleteFile(editingId);
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
  let unitFloor = "";
  let totalFloors = "";

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
      unitFloor = data.unitFloor || "";
      totalFloors = data.totalFloors || "";
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
  unitFloor = ($("unitFloor")?.value || "").trim() || unitFloor;
  totalFloors = ($("totalFloors")?.value || "").trim() || totalFloors;

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
  if (unitFloor) lines.push(`طبقه: ${unitFloor}`);
  if (totalFloors) lines.push(`کل طبقات: ${totalFloors}`);
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
    // لغو
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
    plaque: data.plaque,
    unitFloor: data.unitFloor,
    totalFloors: data.totalFloors,
    keyHolder: data.keyHolder,
    keyHolderName: data.keyHolderName,
    keyHolderPhone: data.keyHolderPhone,
    condition: data.condition,
    occupancy: data.occupancy,
    buyerNotes: data.buyerNotes,
    familyStatus: data.familyStatus,
    familySize: data.familySize,
    tenantNotes: data.tenantNotes,
    notes: data.notes,
    publicNotes: data.publicNotes
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
      // اگر تاریخ پیگیری گذشته باشد، برای تمدید پیش‌فرض ۷ روز پیشنهاد می‌شود
      $("followUpDays").value = diffDays > 0 ? diffDays : 7;
    }
  } else if ($("followUpDays")) {
    $("followUpDays").value = 10;
  }

  document.querySelectorAll(".amenity").forEach((cb) => {
    cb.checked =
      Array.isArray(data.amenities) && data.amenities.includes(cb.value);
  });

  updateFormVisibility();
  setFormStep(1);
}

export { resetFormFields };
