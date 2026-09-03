# راهنمای پیاده‌سازی اصلاحات

## 📋 فهرست اصلاحات

### مرحله 1: اصلاح شناسه‌سازی (30 دقیقه)

**فایل:** `app.js`

**مرحله 1.1:** تابع `generateFileId` را جایگزین کنید
```javascript
// قدیمی
function generateFileId() {
  return `file-${Date.now()}`;
}

// جدید
function generateFileId() {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substr(2, 9);
  const microTimestamp = Math.floor((Math.random() * 1000000) % 1000);
  return `file-${timestamp}-${microTimestamp}-${randomPart}`;
}
```

**مرحله 1.2:** در `saveFile()` به‌جای `generateFileId()` استفاده کنید
```javascript
id: state.editingFileId || generateFileId(),
```

**تست:** دو فایل به سرعت بسازید و شناسه‌های آن‌ها متفاوت باشند ✓

---

### مرحله 2: اصلاح احراز هویت (20 دقیقه)

**فایل:** `index.html` و `app.js`

**مرحله 2.1:** تصمیم بگیرید:

**گزینه A: فقط GitHub Token (توصیه شده)**
- فیلدهای نام‌کاربری و رمز‌عبور را از HTML حذف کنید
- تابع `setupLoginForm()` را ساده‌کنید:

```javascript
async function setupLoginForm() {
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
```

**گزینه B: نام‌کاربری و رمز‌عبور حفظ کنید**
- فیلدهای نام‌کاربری و رمز‌عبور را حفظ کنید
- Hardcoded مقادیر را حذف کنید و جای آن‌ها:

```javascript
// در انتهای app.js
const VALID_CREDENTIALS = new Map([
  ["admin", "تغییر_این_رمز"],
  ["user2", "رمزی_محفوظ"]
]);

// در setupLoginForm()
if (!VALID_CREDENTIALS.has(username)) {
  setLoginError("نام کاربری یا رمز عبور اشتباه است.");
  return;
}

if (VALID_CREDENTIALS.get(username) !== password) {
  setLoginError("نام کاربری یا رمز عبور اشتباه است.");
  return;
}
```

**تست:** 
- برای گزینه A: فقط با token وارد شوید ✓
- برای گزینه B: مقادیر درست و غلط را تست کنید ✓

---

### مرحله 3: اضافه کردن Status و followUpDate (45 دقیقه)

**فایل:** `index.html` و `app.js`

**مرحله 3.1:** در `index.html` در `fileForm` این بخش را اضافه کنید:

```html
<!-- قبل از </form> -->
<div class="form-section">
  <div class="section-title">وضعیت و پیگیری</div>
  
  <div class="form-grid">
    <div class="field">
      <label for="status">وضعیت</label>
      <select id="status">
        <option value="active">فعال</option>
        <option value="pending">در انتظار</option>
        <option value="done">انجام شده</option>
        <option value="archived">بایگانی</option>
      </select>
    </div>
    
    <div class="field">
      <label for="followUpDate">تاریخ پیگیری</label>
      <input
        id="followUpDate"
        type="datetime-local"
        placeholder="تاریخ و ساعت پیگیری"
      >
    </div>
  </div>
</div>
```

**مرحله 3.2:** در `app.js` تابع `saveFile()` را به‌روزرسانی کنید:

```javascript
// در بخش Common fields
const status = document.getElementById("status")?.value || "active";
const followUpDateInput = document.getElementById("followUpDate")?.value;
const followUpDate = followUpDateInput 
  ? new Date(followUpDateInput).toISOString() 
  : null;

// در fileData
const fileData = {
  id: state.editingFileId || generateFileId(),
  type: fileType,
  status: status,  // ✅ جدید
  followUpDate: followUpDate,  // ✅ جدید
  createdAt: state.editingFileId
    ? (state.files.find(f => f.id === state.editingFileId)?.createdAt || new Date().toISOString())
    : new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  // ... بقیه فیلدها
};
```

**مرحله 3.3:** `loadFileIntoForm()` را به‌روزرسانی کنید:

```javascript
// در آغاز تابع
const status = file.status || "active";
const followUpDate = file.followUpDate;

// برای status
const statusSelect = document.getElementById("status");
if (statusSelect) {
  statusSelect.value = status;
}

// برای followUpDate
const followUpDateInput = document.getElementById("followUpDate");
if (followUpDateInput && followUpDate) {
  const date = new Date(followUpDate);
  followUpDateInput.value = date.toISOString().slice(0, 16);
}
```

**تست:**
- فایل جدید بسازید و status را تنظیم کنید ✓
- تاریخ پیگیری را تنظیم کنید ✓
- فایل را ویرایش کنید و status/date محفوظ بماند ✓

---

### مرحله 4: تبدیل داده‌های عددی (30 دقیقه)

**فایل:** `app.js`

**مرحله 4.1:** در `saveFile()` این خطوط را اصلاح کنید:

```javascript
// قدیمی
const area = $("area")?.value || "";
const rooms = $("rooms")?.value || "";
const year = $("year")?.value || "";
const capital = $("capital")?.value || "";
const currentDeposit = $("currentDeposit")?.value || "";
const currentRent = $("currentRent")?.value || "";
const suggestedDeposit = $("suggestedDeposit")?.value || "";
const suggestedRent = $("suggestedRent")?.value || "";
const tenantDeposit = $("tenantDeposit")?.value || "";
const tenantRent = $("tenantRent")?.value || "";
const familySize = $("familySize")?.value || "";

// جدید
const area = parseInt($("area")?.value || 0, 10);
const rooms = parseInt($("rooms")?.value || 0, 10);
const year = parseInt($("year")?.value || 0, 10);
const capital = parseInt($("capital")?.value || 0, 10);
const currentDeposit = parseInt($("currentDeposit")?.value || 0, 10);
const currentRent = parseInt($("currentRent")?.value || 0, 10);
const suggestedDeposit = parseInt($("suggestedDeposit")?.value || 0, 10);
const suggestedRent = parseInt($("suggestedRent")?.value || 0, 10);
const tenantDeposit = parseInt($("tenantDeposit")?.value || 0, 10);
const tenantRent = parseInt($("tenantRent")?.value || 0, 10);
const familySize = parseInt($("familySize")?.value || 0, 10);
```

**تست:**
- مقدار عددی وارد کنید و بررسی کنید که به‌درستی ذخیره شود ✓
- فایل را ویرایش کنید و مقدار نشان داده شود ✓

---

### مرحله 5: تأیید شماره تلفن (25 دقیقه)

**فایل:** `app.js`

**مرحله 5.1:** تابع `validatePhoneNumber()` را اضافه کنید:

```javascript
function validatePhoneNumber(phone) {
  if (!phone) return false;

  // حذف کاراکترهای غیرضروری
  const cleaned = phone.replace(/[\s\-()]/g, '');

  // فرمت‌های معتبر ایرانی:
  const iranianPhoneRegex = /^(?:0098|\+98|0)?9\d{9}$/;

  return iranianPhoneRegex.test(cleaned);
}
```

**مرحله 5.2:** در `saveFile()` تأیید شماره تلفن را اضافه کنید:

```javascript
if (!phone) {
  showToast("لطفاً شماره تلفن را وارد کنید.", "error");
  return;
}

if (!validatePhoneNumber(phone)) {
  showToast("لطفاً شماره تلفن صحیح وارد کنید (09xxxxxxxxx).", "error");
  return;
}
```

**تست:**
- شماره تلفن صحیح وارد کنید (09121234567) ✓
- شماره اشتباه وارد کنید (1234567) و خطا نمایش داده شود ✓
- فرمت‌های مختلف را تست کنید (0098, +98 و غیره) ✓

---

### مرحله 6: اصلاح `updateFormVisibility()` (35 دقیقه)

**فایل:** `app.js`

**مرحله 6.1:** تابع `updateFormVisibility()` را این‌گونه اصلاح کنید:

```javascript
function updateFormVisibility() {
  const fileType = document.querySelector(
    'input[name="fileType"]:checked'
  )?.value || "sale";

  const buyerSection = document.getElementById("buyerSection");
  const tenantSection = document.getElementById("tenantSection");
  const propertyDetailsSection = document.getElementById("propertyDetailsSection");
  const propertyFields = document.querySelectorAll(".property-field");
  const landlordOnlyFields = document.querySelectorAll(".landlord-only");
  const currentDepositField = document.getElementById("currentDepositField");
  const currentRentField = document.getElementById("currentRentField");
  const familySizeField = document.getElementById("familySizeField");

  // Show/hide buyer section
  if (buyerSection) {
    buyerSection.classList.toggle("hidden", fileType !== "buyer");
  }

  // Show/hide tenant section
  if (tenantSection) {
    tenantSection.classList.toggle("hidden", fileType !== "tenant");
  }

  // Property details فقط برای sale و landlord
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
    // برای buyer و tenant
    if (currentDepositField) {
      currentDepositField.classList.add("hidden");
    }
    if (currentRentField) {
      currentRentField.classList.add("hidden");
    }
  }

  // Family size
  if (familySizeField) {
    const familyStatus = document.getElementById("familyStatus")?.value || "";
    familySizeField.classList.toggle("hidden", familyStatus !== "family");
  }
}
```

**تست:**
- نوع فایل را تغییر دهید و فیلدها درست نمایش داده شوند ✓
- occupancy را تغییر دهید و فیلدهای وابسته نمایش داده شوند ✓

---

### مرحله 7: بهتر کردن مدیریت خطا (40 دقیقه)

**فایل:** `app.js`

**مرحله 7.1:** تابع `githubRequest()` را این‌گونه اصلاح کنید:

```javascript
async function githubRequest(url, options = {}) {
  const TIMEOUT = 10000;

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
          break;
        case 403:
          message = "GitHub دسترسی این توکن را رد کرد.";
          break;
        case 404:
          message = "ریپازیتوری یا فایل پیدا نشد.";
          break;
        case 409:
          message = "هم‌زمان تغییر دیگری روی فایل انجام شده است.";
          break;
        case 422:
          message = "داده‌های ارسالی نامعتبر هستند.";
          break;
        case 429:
          message = "تعداد درخواست‌های بسیار زیاد است.";
          break;
        case 500:
        case 502:
        case 503:
          message = "سرور GitHub با مشکل روبرو است.";
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
```

**تست:**
- اینترنت را قطع کنید و پیام خطا نمایش داده شود ✓
- token اشتباه وارد کنید و خطای 401 نمایش داده شود ✓

---

### مرحله 8: اصلاح `loadFileIntoForm()` (25 دقیقه)

**فایل:** `app.js`

**مرحله 8.1:** تابع `loadFileIntoForm()` را این‌گونه اصلاح کنید:

```javascript
function loadFileIntoForm(fileId) {
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

  // تعیین تمام فیلدها
  const fields = {
    "name": data.name,
    "phone": data.phone,
    "propertyType": data.propertyType,
    "area": data.area,
    "rooms": data.rooms,
    "year": data.year,
    "location": data.location,
    "status": file.status,  // ✅ جدید
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
      const date = new Date(file.followUpDate);
      followUpDateInput.value = date.toISOString().slice(0, 16);
    }
  }

  // تعیین تمام فیلدها
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
  updateFormVisibility();
}
```

**تست:**
- فایل را ویرایش کنید و تمام فیلدها درست نمایش داده شوند ✓
- Amenities درست انتخاب شوند ✓

---

## ✅ چک‌لیست نهایی

- [ ] باگ #1: شناسه‌سازی اصلاح شد
- [ ] باگ #2: احراز هویت اصلاح شد
- [ ] باگ #3: عدم مدیریت Occupancy اصلاح شد
- [ ] باگ #4: createdAt محفوظ می‌ماند
- [ ] باگ #5: داده‌های عددی number هستند
- [ ] باگ #6: Status و followUpDate اضافه شدند
- [ ] باگ #7: شماره تلفن تأیید می‌شود
- [ ] باگ #8: Amenities درست بارگذاری می‌شوند
- [ ] باگ #10: خطای شبکه بهتر مدیریت می‌شود

---

## 🧪 تست نهایی

```javascript
// 1. ورود
// ورود با GitHub token معتبر

// 2. ایجاد فایل
// نوع مختلف بسازید و فیلدها درست نمایش داده شوند

// 3. ویرایش فایل
// فایل را ویرایش کنید و تمام اطلاعات محفوظ بماند

// 4. تأیید شماره تلفن
// شماره اشتباه وارد کنید و خطا نمایش داده شود

// 5. Status و followUpDate
// Status را تغییر دهید و followUpDate را تنظیم کنید

// 6. خطای شبکه
// اینترنت را قطع کنید و پیام مناسب نمایش داده شود
```

---

## 📞 نیاز به کمک؟

اگر به هر مرحله نیاز به توضیح بیشتری دارید، بپرسید!
