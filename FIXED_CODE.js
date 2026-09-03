/* =========================================================
کدهای اصلاح‌شده برای باگ‌های شناسایی‌شده
========================================================= */

// ============================================
// FIX #1: بهتر کردن generateFileId
// ============================================

/**
 * شناسه فایل‌ منحصربه‌فرد و غیرقابل‌برخورد
 */
function generateFileId() {
  // روش 1: استفاده از UUID
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substr(2, 9);
  const microTimestamp = Math.floor((Math.random() * 1000000) % 1000);
  
  return `file-${timestamp}-${microTimestamp}-${randomPart}`;
}

// یا روش 2: استفاده از crypto (بهتر)
function generateFileIdSecure() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    let id = '';
    for (let i = 0; i < arr.length; i++) {
      id += arr[i].toString(16).padStart(2, '0');
    }
    return `file-${id}`;
  }
  
  // fallback
  return generateFileId();
}

// ============================================
// FIX #2: اصلاح احراز هویت
// ============================================

/**
 * حذف hard-coded credentials و فقط بررسی GitHub token
 */
async function setupLoginFormFixed() {
  const form = document.getElementById("loginForm");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    setLoginError("");

    const tokenInput = document.getElementById("githubToken");
    const token = tokenInput?.value || "";

    if (!token) {
      setLoginError("لطفاً GitHub Token را وارد کنید.");
      return;
    }

    try {
      await loginWithToken(token);
    } catch (error) {
      setLoginError(error.message);
    }
  });
}

// اگر واقعاً نیاز به نام‌کاربری و رمز عبور است:
const VALID_CREDENTIALS = new Map([
  ["admin", "changeMe123"],
  ["manager", "securePass456"]
]);

function validateCredentials(username, password) {
  if (!username || !password) {
    return false;
  }

  const storedPassword = VALID_CREDENTIALS.get(username);
  if (!storedPassword) {
    return false;
  }

  // در production، هش کردن استفاده کنید!
  return storedPassword === password;
}

// ============================================
// FIX #3: اصلاح ذخیره‌سازی تاریخ ایجاد
// ============================================

/**
 * ذخیره و به‌روزرسانی صحیح اطلاعات فایل
 */
async function saveFileFixed() {
  const form = document.getElementById("fileForm");

  if (!form) {
    return;
  }

  // Get file type
  const fileType = document.querySelector(
    'input[name="fileType"]:checked'
  )?.value || "sale";

  // Common fields
  const name = (document.getElementById("name")?.value || "").trim();
  const phone = (document.getElementById("phone")?.value || "").trim();
  const propertyType = document.getElementById("propertyType")?.value || "";
  const area = parseInt(document.getElementById("area")?.value || 0, 10);
  const rooms = parseInt(document.getElementById("rooms")?.value || 0, 10);
  const year = parseInt(document.getElementById("year")?.value || 0, 10);
  const location = (document.getElementById("location")?.value || "").trim();

  // Status fields (اضافه شده)
  const status = document.getElementById("status")?.value || "active";
  const followUpDateInput = document.getElementById("followUpDate")?.value;
  const followUpDate = followUpDateInput 
    ? new Date(followUpDateInput).toISOString() 
    : null;

  // Property details
  const keyHolder = document.getElementById("keyHolder")?.value || "";
  const condition = document.getElementById("condition")?.value || "";
  const occupancy = document.getElementById("occupancy")?.value || "";
  const currentDeposit = parseInt(document.getElementById("currentDeposit")?.value || 0, 10);
  const currentRent = parseInt(document.getElementById("currentRent")?.value || 0, 10);
  const suggestedDeposit = parseInt(document.getElementById("suggestedDeposit")?.value || 0, 10);
  const suggestedRent = parseInt(document.getElementById("suggestedRent")?.value || 0, 10);

  // Buyer fields
  const capital = parseInt(document.getElementById("capital")?.value || 0, 10);
  const buyerNotes = (document.getElementById("buyerNotes")?.value || "").trim();

  // Tenant fields
  const tenantDeposit = parseInt(document.getElementById("tenantDeposit")?.value || 0, 10);
  const tenantRent = parseInt(document.getElementById("tenantRent")?.value || 0, 10);
  const familyStatus = document.getElementById("familyStatus")?.value || "";
  const familySize = parseInt(document.getElementById("familySize")?.value || 0, 10);
  const tenantNotes = (document.getElementById("tenantNotes")?.value || "").trim();

  // Amenities
  const amenities = Array.from(
    document.querySelectorAll(".amenity:checked")
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

  if (!validatePhoneNumber(phone)) {
    showToast("لطفاً شماره تلفن صحیح وارد کنید (09xxxxxxxxx).", "error");
    return;
  }

  // دریافت فایل قدیمی اگر در حال ویرایش است
  let existingFile = null;
  if (state.editingFileId) {
    existingFile = state.files.find(f => f.id === state.editingFileId);
  }

  // Create file object
  const fileData = {
    id: state.editingFileId || generateFileIdSecure(),
    type: fileType,
    status: status,
    followUpDate: followUpDate,
    createdAt: existingFile?.createdAt || new Date().toISOString(),  // ✅ حفظ تاریخ ایجاد
    updatedAt: new Date().toISOString(),
    name,
    phone,
    propertyType,
    area,  // اکنون number است
    rooms,  // اکنون number است
    year,  // اکنون number است
    location,
    keyHolder,
    condition,
    occupancy,
    currentDeposit,  // اکنون number است
    currentRent,  // اکنون number است
    suggestedDeposit,  // اکنون number است
    suggestedRent,  // اکنون number است
    capital,  // اکنون number است
    buyerNotes,
    tenantDeposit,  // اکنون number است
    tenantRent,  // اکنون number است
    familyStatus,
    familySize,  // اکنون number است
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

// ============================================
// FIX #4: تأیید شماره تلفن
// ============================================

/**
 * تأیید شماره تلفن ایرانی
 */
function validatePhoneNumber(phone) {
  if (!phone) return false;

  // حذف کاراکترهای غیرضروری
  const cleaned = phone.replace(/[\s\-()]/g, '');

  // فرمت‌های معتبر ایرانی:
  // 09xxxxxxxxx (11 رقم)
  // 9xxxxxxxxx (10 رقم، با فرض 0 در ابتدا)
  // 00989xxxxxxxxx (0098 + شماره)
  // +989xxxxxxxxx (0098 + شماره)
  const iranianPhoneRegex = /^(?:0098|\+98|0)?9\d{9}$/;

  return iranianPhoneRegex.test(cleaned);
}

// Test
console.log(validatePhoneNumber("09121234567"));  // true
console.log(validatePhoneNumber("9121234567"));   // true
console.log(validatePhoneNumber("00989121234567")); // true
console.log(validatePhoneNumber("+989121234567"));  // true
console.log(validatePhoneNumber("0912123"));       // false

// ============================================
// FIX #5: بهتر کردن updateFormVisibility
// ============================================

/**
 * نمایش/پنهان کردن فیلدها بر اساس نوع فایل
 */
function updateFormVisibilityFixed() {
  const fileType = document.querySelector(
    'input[name="fileType"]:checked'
  )?.value || "sale";

  // Sections
  const buyerSection = document.getElementById("buyerSection");
  const tenantSection = document.getElementById("tenantSection");
  const propertyDetailsSection = document.getElementById("propertyDetailsSection");

  // Fields
  const propertyFields = document.querySelectorAll(".property-field");
  const landlordOnlyFields = document.querySelectorAll(".landlord-only");
  const currentDepositField = document.getElementById("currentDepositField");
  const currentRentField = document.getElementById("currentRentField");
  const familySizeField = document.getElementById("familySizeField");

  // Show/hide sections based on type
  if (buyerSection) {
    buyerSection.classList.toggle("hidden", fileType !== "buyer");
  }

  if (tenantSection) {
    tenantSection.classList.toggle("hidden", fileType !== "tenant");
  }

  // Property details for sale and landlord
  const showPropertyDetails = fileType === "sale" || fileType === "landlord";
  
  if (propertyDetailsSection) {
    propertyDetailsSection.classList.toggle("hidden", !showPropertyDetails);
  }

  // Property fields
  propertyFields.forEach((field) => {
    field.classList.toggle("hidden", !showPropertyDetails);
  });

  // Landlord-only fields
  landlordOnlyFields.forEach((field) => {
    field.classList.toggle("hidden", fileType !== "landlord");
  });

  // Occupancy-based fields (فقط برای sale و landlord)
  if (showPropertyDetails) {
    const occupancy = document.getElementById("occupancy")?.value || "";
    const showOccupancyFields = occupancy === "tenant";

    if (currentDepositField) {
      currentDepositField.classList.toggle("hidden", !showOccupancyFields);
    }

    if (currentRentField) {
      currentRentField.classList.toggle("hidden", !showOccupancyFields);
    }
  } else {
    // برای buyer و tenant، این فیلدها نباید نمایش داده شوند
    if (currentDepositField) {
      currentDepositField.classList.add("hidden");
    }
    if (currentRentField) {
      currentRentField.classList.add("hidden");
    }
  }

  // Family size for tenant
  if (familySizeField) {
    const familyStatus = document.getElementById("familyStatus")?.value || "";
    familySizeField.classList.toggle("hidden", familyStatus !== "family");
  }
}

// ============================================
// FIX #6: بهتر کردن مدیریت خطا
// ============================================

/**
 * درخواست GitHub با مدیریت بهتر خطا و timeout
 */
async function githubRequestFixed(url, options = {}) {
  const TIMEOUT = 10000;  // 10 ثانیه

  if (!state.token) {
    throw new Error("توکن GitHub وارد نشده است.");
  }

  try {
    // Setup timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${state.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    });

    clearTimeout(timeout);

    const text = await response.text();
    let data = {};
    
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      let message = data.message || "خطا در ارتباط با GitHub.";
      
      switch (response.status) {
        case 401:
          message = "توکن GitHub معتبر نیست یا منقضی شده است.";
          // logout();
          break;
        case 403:
          message = "GitHub دسترسی این توکن را رد کرد. دسترسی Contents باید روی Read and write باشد.";
          break;
        case 404:
          message = "ریپازیتوری یا فایل data/files.json پیدا نشد.";
          break;
        case 409:
          message = "هم‌زمان تغییر دیگری روی فایل انجام شده است. دوباره امتحان کنید.";
          break;
        case 422:
          message = "داده‌های ارسالی نامعتبر هستند. لطفاً دوباره امتحان کنید.";
          break;
        case 429:
          message = "تعداد درخواست‌های بسیار زیاد است. لطفاً بعد از چند دقیقه دوباره امتحان کنید.";
          break;
        case 500:
        case 502:
        case 503:
          message = "سرور GitHub با مشکل روبرو است. لطفاً بعداً دوباره امتحان کنید.";
          break;
      }

      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        `درخواست منقضی شد (${TIMEOUT / 1000}ث). اتصال اینترنت خود را بررسی کنید.`
      );
    }
    
    if (error instanceof TypeError) {
      throw new Error(
        "خطا در ارتباط با شبکه. اتصال اینترنت خود را بررسی کنید."
      );
    }

    throw error;
  }
}

// ============================================
// FIX #7: بهتر کردن loadFileIntoForm
// ============================================

/**
 * بارگذاری فایل برای ویرایش
 */
function loadFileIntoFormFixed(fileId) {
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
  const fields = {
    "name": data.name,
    "phone": data.phone,
    "propertyType": data.propertyType,
    "area": data.area,
    "rooms": data.rooms,
    "year": data.year,
    "location": data.location,
    "status": file.status,  // ✅ اضافه شده
    "keyHolder": data.keyHolder,
    "condition": data.condition,
    "occupancy": data.occupancy,
    "currentDeposit": data.currentDeposit,
    "currentRent": data.currentRent,
    "suggestedDeposit": data.suggestedDeposit,
    "suggestedRent": data.suggestedRent,
    "capital": data.capital,
    "buyerNotes": data.buyerNotes,
    "tenantDeposit": data.tenantDeposit,
    "tenantRent": data.tenantRent,
    "familyStatus": data.familyStatus,
    "familySize": data.familySize,
    "tenantNotes": data.tenantNotes
  };

  // تعیین followUpDate
  if (file.followUpDate) {
    const followUpDateInput = document.getElementById("followUpDate");
    if (followUpDateInput) {
      // تبدیل ISO format به datetime-local
      const date = new Date(file.followUpDate);
      const localDateTime = date.toISOString().slice(0, 16);
      followUpDateInput.value = localDateTime;
    }
  }

  Object.entries(fields).forEach(([fieldId, value]) => {
    const field = document.getElementById(fieldId);
    if (field && value !== undefined && value !== null) {
      field.value = value;
    }
  });

  // Set amenities
  document.querySelectorAll(".amenity").forEach((checkbox) => {
    const isSelected = Array.isArray(data.amenities) && 
                       data.amenities.includes(checkbox.value);
    checkbox.checked = isSelected;
  });

  // Update form visibility
  updateFormVisibilityFixed();
}

// ============================================
// FIX #8: حفاظت از XSS
// ============================================

/**
 * تابع بهتر برای escapeHtml
 */
function escapeHtmlSafe(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;'
  };

  return String(value).replace(/[&<>"'\/]/g, (char) => map[char]);
}

// یا استفاده از textContent به‌جای innerHTML
function renderFileCardSafe(file) {
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

  // ساخت element با textContent (محفوظ‌تر)
  const cardDiv = document.createElement('div');
  cardDiv.className = 'file-card';
  cardDiv.dataset.fileId = file.id;
  cardDiv.setAttribute('role', 'button');
  cardDiv.setAttribute('tabindex', '0');

  // Inner HTML (فقط برای سازه)
  cardDiv.innerHTML = `
    <div class="card-top">
      <div>
        <div class="card-type"></div>
        <div class="card-title"></div>
      </div>
      ${hasFollowUp ? '<div class="followup-badge">پیگیری</div>' : ''}
    </div>
    <div class="card-info">
      <div class="info-item">
        <div class="info-label">تلفن</div>
        <div class="info-value"></div>
      </div>
      <div class="info-item">
        <div class="info-label">موقعیت</div>
        <div class="info-value"></div>
      </div>
      <div class="info-item">
        <div class="info-label">نوع ملک</div>
        <div class="info-value"></div>
      </div>
      <div class="info-item">
        <div class="info-label">متراژ</div>
        <div class="info-value"></div>
      </div>
    </div>
    <div class="card-footer">
      <div></div>
      <div class="status-badge"></div>
    </div>
  `;

  // تعیین textContent (محفوظ)
  cardDiv.querySelector('.card-type').textContent = 
    TYPE_LABELS[type] || type;
  cardDiv.querySelector('.card-title').textContent = name;
  cardDiv.querySelectorAll('.card-info .info-value')[0].textContent = 
    phone || "—";
  cardDiv.querySelectorAll('.card-info .info-value')[1].textContent = 
    location || "—";
  cardDiv.querySelectorAll('.card-info .info-value')[2].textContent = 
    PROPERTY_TYPE_LABELS[propertyType] || propertyType || "—";
  cardDiv.querySelectorAll('.card-info .info-value')[3].textContent = 
    area ? `${area} متر` : "—";
  cardDiv.querySelector('.card-footer > div').textContent = 
    updatedAtText;
  cardDiv.querySelector('.status-badge').textContent = 
    getStatusLabel(status);
  cardDiv.querySelector('.status-badge').style.background = 
    getStatusColor(status);

  return cardDiv.outerHTML;
}

// ============================================
// FIX #9: بهتر کردن syncStatus
// ============================================

/**
 * نمایش وضعیت sync بهتر
 */
function setSyncStatusFixed(type, text, date = null) {
  const indicator = document.getElementById("syncIndicator");
  const syncText = document.getElementById("syncText");
  const lastSyncText = document.getElementById("lastSyncText");

  if (indicator) {
    indicator.className = "sync-dot";
    
    const statusClasses = {
      "success": "success",
      "error": "error",
      "loading": "loading",
      "saving": "loading"
    };

    if (statusClasses[type]) {
      indicator.classList.add(statusClasses[type]);
    }
  }

  if (syncText) {
    syncText.textContent = text || "";
  }

  if (lastSyncText && date) {
    lastSyncText.textContent = 
      `آخرین همگام‌سازی: ${formatDateTime(date)}`;
  }

  // Log برای debugging
  console.log(`[Sync] ${type}: ${text}`, { date });
}

// ============================================
// Export Functions
// ============================================

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    generateFileId,
    generateFileIdSecure,
    validatePhoneNumber,
    validateCredentials,
    escapeHtmlSafe,
    setupLoginFormFixed,
    saveFileFixed,
    updateFormVisibilityFixed,
    loadFileIntoFormFixed,
    githubRequestFixed,
    setSyncStatusFixed
  };
}
