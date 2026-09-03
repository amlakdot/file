# گزارش باگ‌های پروژه DOT Real Estate

## خلاصه
این سامانه برای مدیریت فایل‌های ملکی است که از GitHub برای ذخیره‌سازی داده‌ها استفاده می‌کند. تعدادی از باگ‌ها شناسایی شده‌اند که باید اصلاح شوند.

---

## 🐛 باگ #1: شناسه‌سازی فایل ضعیف (Critical)

### مکان
`app.js` - تابع `generateFileId()`

```javascript
function generateFileId() {
  return `file-${Date.now()}`;
}
```

### مشکل
- اگر دو فایل در یک میلی‌ثانیه ایجاد شوند، دو فایل با شناسه یکسان خواهند شد
- `Date.now()` تنها میلی‌ثانیه دقت دارد
- برخورد شناسه‌ها منجر به از دست رفتن داده‌ها می‌شود

### حل
```javascript
function generateFileId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  const counter = Math.floor(Math.random() * 10000);
  return `file-${timestamp}-${random}-${counter}`;
}
```

---

## 🐛 باگ #2: عدم اعتبارسنجی نام کاربری/رمز عبور (High)

### مکان
`app.js` - تابع `setupLoginForm()`

```javascript
if (username !== "admin" || password !== "admin") {
  setLoginError("نام کاربری یا رمز عبور اشتباه است.");
  return;
}
```

### مشکل
- نام کاربری و رمز عبور به صورت hard-coded هستند
- هیچ توجیهی برای این اعتبارسنجی وجود ندارد
- تنها GitHub token مهم است
- این کنترل غیر ضروری است

### حل
```javascript
// گزینه 1: اگر نام‌کاربری و رمز عبور ضروری است:
const VALID_CREDENTIALS = {
  "admin": "admin", // تغییر دهید
  "user2": "secure_pass_here"
};

if (!VALID_CREDENTIALS[username] || VALID_CREDENTIALS[username] !== password) {
  setLoginError("نام کاربری یا رمز عبور اشتباه است.");
  return;
}

// گزینه 2: اگر فقط GitHub token مهم است (بهتر):
// این بخش را کاملاً حذف کنید و فقط token را بررسی کنید
```

---

## 🐛 باگ #3: عدم مدیریت خطای Occupancy (Medium)

### مکان
`app.js` - تابع `updateFormVisibility()`

```javascript
const occupancy = document.querySelector('#occupancy')?.value || "";

if (currentDepositField) {
  currentDepositField.classList.toggle(
    "hidden",
    occupancy !== "tenant"
  );
}
```

### مشکل
- فیلدهای "ودیعه فعلی" و "اجاره فعلی" نباید برای تمام فایل‌ها نمایش داده شوند
- هنگام تغییر نوع فایل از `sale` به `landlord`، select element برای occupancy نیست
- منطق نشان‌دادن/پنهان کردن درست نیست

### حل
```javascript
function updateFormVisibility() {
  const fileType = document.querySelector(
    'input[name="fileType"]:checked'
  )?.value || "sale";

  const occupancyElement = $("occupancy");
  const occupancy = occupancyElement?.value || "";

  const currentDepositField = $("currentDepositField");
  const currentRentField = $("currentRentField");

  // فقط برای sale و landlord نمایش دهید
  const shouldShowOccupancy = fileType === "sale" || fileType === "landlord";

  if (currentDepositField) {
    const show = shouldShowOccupancy && occupancy === "tenant";
    currentDepositField.classList.toggle("hidden", !show);
  }

  if (currentRentField) {
    const show = shouldShowOccupancy && occupancy === "tenant";
    currentRentField.classList.toggle("hidden", !show);
  }
}
```

---

## 🐛 باگ #4: عدم ذخیره‌سازی تاریخ ایجاد (Medium)

### مکان
`app.js` - تابع `saveFile()`

```javascript
const fileData = {
  id: state.editingFileId || generateFileId(),
  type: fileType,
  status: "active",
  createdAt: state.editingFileId
    ? undefined
    : new Date().toISOString(),  // ⚠️ undefined اگر در حال ویرایش باشد
  updatedAt: new Date().toISOString(),
  // ...
};
```

### مشکل
- هنگام ویرایش فایل، `createdAt` حذف می‌شود
- اطلاعات اصلی‌ای گم می‌شود

### حل
```javascript
const fileData = {
  id: state.editingFileId || generateFileId(),
  type: fileType,
  status: "active",
  createdAt: state.editingFileId
    ? (state.files.find(f => f.id === state.editingFileId)?.createdAt || new Date().toISOString())
    : new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  // ...
};
```

---

## 🐛 باگ #5: عدم صحیح‌سازی داده‌های عددی (Medium)

### مکان
`app.js` - تابع `saveFile()`

```javascript
const area = $("area")?.value || "";  // string
const rooms = $("rooms")?.value || "";  // string
// ...
```

### مشکل
- داده‌های عددی به‌صورت string ذخیره می‌شوند
- مقایسه و فیلتر کردن دشوار می‌شود
- نمایش داده‌ها غلط است

### حل
```javascript
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

---

## 🐛 باگ #6: عدم ذخیره‌سازی Status و followUpDate (High)

### مکان
`app.js` - تابع `saveFile()`

```javascript
const fileData = {
  id: state.editingFileId || generateFileId(),
  type: fileType,
  status: "active",  // ⚠️ همیشه "active"
  // ⚠️ followUpDate وجود ندارد
  // ...
};
```

### مشکل
- در فرم، فیلدهای status و followUpDate وجود ندارند
- نمی‌توان فایل‌ها را برای پیگیری علامت‌گذاری کرد
- سیستم پیگیری کار نمی‌کند

### حل
```javascript
// در HTML (index.html) این فیلدها را اضافه کنید:
<div class="form-section">
  <div class="section-title">وضعیت و پیگیری</div>
  <div class="form-grid">
    <div class="field">
      <label for="status">وضعیت</label>
      <select id="status">
        <option value="active">فعال</option>
        <option value="pending">در انتظار</option>
        <option value="archived">بایگانی</option>
        <option value="done">انجام شده</option>
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

// در JavaScript:
const status = $("status")?.value || "active";
const followUpDate = $("followUpDate")?.value || null;

const fileData = {
  // ...
  status,
  followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
  // ...
};
```

---

## 🐛 باگ #7: عدم صحیح‌سازی شماره تلفن (Medium)

### مکان
`app.js` - تابع `setupLoginForm()` و `saveFile()`

```javascript
const phone = ($("phone")?.value || "").trim();
// فقط trim می‌شود، تا‌ ایراد نمی‌گیرد
```

### مشکل
- شماره تلفن هیچ اعتبارسنجی ندارد
- فیلد خالی قبول می‌شود اما مورد نیاز است
- قالب شماره تلفن بررسی نمی‌شود

### حل
```javascript
function validatePhoneNumber(phone) {
  // فرمت ایرانی: 09XX-XXXXXXXX
  const iranianPhoneRegex = /^(?:0098|\+98|0)?9\d{9}$/;
  return iranianPhoneRegex.test(phone.replace(/[\s\-()]/g, ''));
}

// در saveFile:
if (!phone) {
  showToast("لطفاً شماره تلفن را وارد کنید.", "error");
  return;
}

if (!validatePhoneNumber(phone)) {
  showToast("لطفاً شماره تلفن صحیح وارد کنید (09xxxxxxxxx).", "error");
  return;
}
```

---

## 🐛 باگ #8: Amenities بدون مقدار اولیه (Low)

### مکان
`index.html` - فیلدهای Amenities

```html
<div class="amenities-grid">
  <label>
    <input type="checkbox" value="parking" class="amenity">
    پارکینگ
  </label>
  <!-- ... -->
</div>
```

### مشکل
- هنگام بارگذاری فایل برای ویرایش، amenitiesها درست نشان داده نمی‌شوند

### حل
```javascript
// در loadFileIntoForm:
document.querySelectorAll(".amenity").forEach((checkbox) => {
  // بررسی کنید آیا این آمنیتی در لیست است
  const isSelected = Array.isArray(data.amenities) && 
                     data.amenities.includes(checkbox.value);
  checkbox.checked = isSelected;
});
```

---

## 🐛 باگ #9: Pagination یا Load More نیست (Low)

### مشکل
- اگر هزاران فایل باشد، صفحه بسیار کند می‌شود
- تمام فایل‌ها به‌صورت یکجا render می‌شوند

### حل
```javascript
// Virtual scrolling یا pagination اضافه کنید
const ITEMS_PER_PAGE = 20;
let currentPage = 1;

function renderHome() {
  const container = $("filesContainer");
  const empty = $("emptyState");

  if (!container) {
    return;
  }

  const filtered = getFilteredFiles();

  if (filtered.length === 0) {
    container.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
    }
    return;
  }

  if (empty) {
    empty.classList.add("hidden");
  }

  // Pagination
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageItems = filtered.slice(start, end);

  container.innerHTML = pageItems
    .map(file => renderFileCard(file))
    .join("");

  // نمایش دکمه‌های pagination
  renderPagination(filtered.length);
}

function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  // ... کد pagination
}
```

---

## 🐛 باگ #10: عدم مدیریت خطای شبکه (High)

### مشکل
- اگر اتصال قطع شود، هیچ پیام خطای واضحی نیست
- کاربر نمی‌داند چه اتفاقی افتاده

### حل
```javascript
async function githubRequest(url, options = {}) {
  try {
    if (!state.token) {
      throw new Error("توکن GitHub وارد نشده است.");
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
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
      if (response.status === 401) {
        message = "توکن GitHub معتبر نیست یا منقضی شده است.";
      }
      if (response.status === 403) {
        message = "GitHub دسترسی این توکن را رد کرد.";
      }
      if (response.status === 404) {
        message = "ریپازیتوری یا فایل پیدا نشد.";
      }
      if (response.status === 409) {
        message = "هم‌زمان تغییر دیگری روی فایل انجام شده است.";
      }
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error("زمان درخواست تمام شد (timeout). اتصال اینترنت خود را بررسی کنید.");
    }
    throw error;
  }
}
```

---

## 📋 خلاصه تغییرات

| شناسه | عنوان | شدت | نوع |
|------|------|-----|------|
| #1 | شناسه‌سازی ضعیف فایل | Critical | Logic |
| #2 | hard-coded credentials | High | Security |
| #3 | عدم مدیریت Occupancy | Medium | Logic |
| #4 | عدم ذخیره createdAt | Medium | Data |
| #5 | داده‌های عددی string | Medium | Data |
| #6 | Status و followUpDate | High | Feature |
| #7 | عدم تأیید شماره تلفن | Medium | Validation |
| #8 | Amenities نادرست | Low | UX |
| #9 | بدون Pagination | Low | Performance |
| #10 | خطای شبکه | High | Error Handling |

---

## 🚀 اولویت اصلاح

### فوری (امروز)
- ✅ #1 (شناسه‌سازی)
- ✅ #2 (security)
- ✅ #6 (Status/followUp)

### زود (این هفته)
- ✅ #3 (Occupancy)
- ✅ #5 (داده‌های عددی)
- ✅ #10 (مدیریت خطا)

### عادی
- ✅ #4 (createdAt)
- ✅ #7 (تأیید تلفن)
- ✅ #8 (Amenities)
- ✅ #9 (Pagination)
