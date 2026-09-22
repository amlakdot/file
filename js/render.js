/* =========================================================
   FILTER, SORT & RENDER
========================================================= */

import { state } from "./state.js";
import {
  $,
  normalize,
  escapeHtml,
  highlightMatches,
  formatDate,
  formatMoney,
  formatFileCode
} from "./helpers.js";
import {
  TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  KEY_HOLDER_LABELS,
  FLOOR_LABELS,
  CONDITION_LABELS,
  OCCUPANCY_LABELS,
  FAMILY_LABELS,
  AMENITY_LABELS,
  getStatusColor,
  getStatusLabel,
  getTagLabel
} from "./labels.js";
import {
  getFileData,
  getFileName,
  getFilePhone,
  getFileLocation,
  getFilePrice,
  isFollowUp,
  isDeleted,
  isInTrash,
  getActiveFiles,
  getFileTags
} from "./files.js";
import { matchButtonLabel } from "./match.js";

function amenityLabels(list) {
  if (!Array.isArray(list)) return [];
  return list.map((a) => AMENITY_LABELS[a] || a);
}

export function getFilteredFiles() {
  const inTrashView = state.currentFilter === "trash";

  let result = state.files.filter((f) => {
    if (!f) return false;
    if (inTrashView) return isInTrash(f);
    return !isDeleted(f);
  });

  if (!inTrashView) {
    if (state.currentFilter === "followup") {
      result = result.filter((f) => isFollowUp(f));
    } else if (state.currentFilter === "needs-review") {
      result = result.filter((f) => {
        const tags = getFileTags(f);
        if (tags.includes("needs-review-from-ad") || tags.includes("needs-review")) {
          return true;
        }
        const name = (getFileName(f) || "").trim();
        return name.startsWith("آگهی دیوار") || f.source === "divar" && !getFilePhone(f);
      });
    } else if (
      state.currentFilter !== "all" &&
      state.currentFilter !== "trash"
    ) {
      result = result.filter((f) => f.type === state.currentFilter);
    }
  }

  // فیلتر منطقه
  const region = normalize(state.region);
  if (region) {
    result = result.filter((file) =>
      normalize(getFileLocation(file)).includes(region)
    );
  }

  // فیلتر قیمت
  const min = state.priceMin;
  const max = state.priceMax;
  if (min != null && min !== "" && Number.isFinite(Number(min))) {
    const n = Number(min);
    result = result.filter((f) => getFilePrice(f) >= n);
  }
  if (max != null && max !== "" && Number.isFinite(Number(max))) {
    const n = Number(max);
    result = result.filter((f) => {
      const p = getFilePrice(f);
      return p > 0 && p <= n;
    });
  }

  // جست‌وجوی گسترده
  const query = normalize(state.search);
  if (query) {
    result = result.filter((file) => {
      const data = getFileData(file);
      const amLabels = amenityLabels(data.amenities).join(" ");
      const searchable = [
        file.id,
        file.type,
        file.status,
        data.name,
        data.phone,
        data.location,
        data.region,
        data.notes,
        data.buyerNotes,
        data.tenantNotes,
        data.propertyName,
        data.propertyPhone,
        data.propertyLocation,
        data.keyHolderName,
        data.keyHolderPhone,
        data.keyHolder,
        data.plaque,
        data.unitFloor,
        data.totalFloors,
        FLOOR_LABELS[data.unitFloor] || "",
        amLabels,
        String(data.salePrice || ""),
        String(data.capital || ""),
        String(data.suggestedDeposit || ""),
        String(data.suggestedRent || ""),
        String(data.tenantDeposit || ""),
        String(data.tenantRent || ""),
        String(data.area || ""),
        String(data.rooms || ""),
        file.divarTitle || "",
        file.divarToken || "",
        file.source || "",
        ...(Array.isArray(file.tags) ? file.tags : []),
        String(data.year || "")
      ];
      return searchable.some((v) => normalize(v).includes(query));
    });
  }

  // پیگیری: قدیمی‌ترین موعد اول (بیشترین تأخیر بالاتر)
  if (state.currentFilter === "followup") {
    result.sort((a, b) => {
      const ta = a.followUpDate ? new Date(a.followUpDate).getTime() : 0;
      const tb = b.followUpDate ? new Date(b.followUpDate).getTime() : 0;
      const sa = Number.isFinite(ta) ? ta : 0;
      const sb = Number.isFinite(tb) ? tb : 0;
      if (sa !== sb) return sa - sb;
      return (
        new Date(b.updatedAt || 0).getTime() -
        new Date(a.updatedAt || 0).getTime()
      );
    });
    return result;
  }

  // مرتب‌سازی عادی
  const dir = state.sortDir === "asc" ? 1 : -1;
  const sortBy = state.sortBy || "updatedAt";

  result.sort((a, b) => {
    let va;
    let vb;
    switch (sortBy) {
      case "name":
        va = normalize(getFileName(a));
        vb = normalize(getFileName(b));
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      case "price":
        va = getFilePrice(a);
        vb = getFilePrice(b);
        return (va - vb) * dir;
      case "area":
        va = Number(getFileData(a).area) || 0;
        vb = Number(getFileData(b).area) || 0;
        return (va - vb) * dir;
      case "createdAt":
        va = new Date(a.createdAt || 0).getTime();
        vb = new Date(b.createdAt || 0).getTime();
        return (va - vb) * dir;
      case "updatedAt":
      default:
        va = new Date(a.updatedAt || 0).getTime();
        vb = new Date(b.updatedAt || 0).getTime();
        return (va - vb) * dir;
    }
  });

  return result;
}

/** متن کوتاه وضعیت پیگیری برای کارت */
function followUpBadgeText(file) {
  if (!file?.followUpDate) return "پیگیری";
  const ts = new Date(file.followUpDate).getTime();
  if (!Number.isFinite(ts)) return "پیگیری";
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((Date.now() - ts) / dayMs);
  if (diffDays > 0) return `${diffDays} روز تأخیر`;
  if (diffDays === 0) return "امروز";
  return "پیگیری";
}

/** شمارش فایل‌ها برای هر چیپ فیلتر (بدون اعمال جست‌وجو/قیمت) */
export function getFilterCounts() {
  const active = getActiveFiles();
  const counts = {
    all: active.length,
    sale: 0,
    landlord: 0,
    buyer: 0,
    tenant: 0,
    followup: 0,
    "needs-review": 0,
    trash: 0
  };

  for (const f of active) {
    if (f.type && counts[f.type] != null) counts[f.type] += 1;
    if (isFollowUp(f)) counts.followup += 1;
    const tags = getFileTags(f);
    const name = (getFileName(f) || "").trim();
    if (
      tags.includes("needs-review-from-ad") ||
      tags.includes("needs-review") ||
      name.startsWith("آگهی دیوار") ||
      (f.source === "divar" && !getFilePhone(f))
    ) {
      counts["needs-review"] += 1;
    }
  }

  for (const f of state.files) {
    if (f && isInTrash(f)) counts.trash += 1;
  }

  return counts;
}

function updateFilterChipCounts() {
  const counts = getFilterCounts();
  document.querySelectorAll(".filter-button[data-filter]").forEach((btn) => {
    const key = btn.getAttribute("data-filter");
    const el = btn.querySelector(".filter-count");
    if (!el || key == null) return;
    const n = counts[key];
    el.textContent = n != null ? String(n) : "0";
  });
}

function updateResultsCount(filteredLength, totalActive) {
  const el = $("resultsCount");
  if (!el) return;
  const inTrash = state.currentFilter === "trash";
  if (inTrash) {
    el.textContent = `نمایش ${filteredLength} فایل در سطل`;
    el.classList.remove("hidden");
    return;
  }
  const hasExtraFilter = !!(
    state.search ||
    state.region ||
    state.priceMin != null ||
    state.priceMax != null ||
    state.currentFilter !== "all"
  );
  if (!hasExtraFilter) {
    el.textContent = `${totalActive} فایل`;
  } else {
    el.textContent = `نمایش ${filteredLength} از ${totalActive} فایل`;
  }
  el.classList.remove("hidden");
}

export function renderHome() {
  const container = $("filesContainer");
  const empty = $("emptyState");
  if (!container) return;

  const filtered = getFilteredFiles();
  const activeCount = getActiveFiles().length;
  const inTrash = state.currentFilter === "trash";

  updateFilterChipCounts();
  updateResultsCount(filtered.length, activeCount);

  if (filtered.length === 0) {
    container.innerHTML = "";
    empty?.classList.remove("hidden");
    const title = $("emptyTitle");
    const desc = $("emptyDesc");
    const btn = $("emptyNewFileButton");

    if (inTrash) {
      if (title) title.textContent = "سطل بازیابی خالی است";
      if (desc)
        desc.textContent =
          "فایل‌های حذف‌شده تا ۳۰ روز اینجا می‌مانند و قابل بازگردانی هستند.";
      if (btn) btn.classList.add("hidden");
    } else if (activeCount === 0 && !state.search && !state.region && !state.priceMin && !state.priceMax) {
      if (title) title.textContent = "هنوز فایلی ثبت نشده";
      if (desc)
        desc.textContent = "اولین فایل املاک را ثبت کنید تا اینجا نمایش داده شود.";
      if (btn) btn.classList.remove("hidden");
    } else {
      if (title) title.textContent = "نتیجه‌ای پیدا نشد";
      if (desc)
        desc.textContent =
          "با این جست‌وجو یا فیلتر فایلی نیست. فیلترها را تغییر دهید یا جست‌وجو را پاک کنید.";
      if (btn) btn.classList.add("hidden");
    }
    return;
  }

  empty?.classList.add("hidden");
  container.innerHTML = filtered.map((f) => renderFileCard(f)).join("");
}

function infoItem(label, value) {
  if (value === null || value === undefined || value === "" || value === "—") {
    return "";
  }
  return `
    <div class="info-item">
      <div class="info-label">${escapeHtml(label)}</div>
      <div class="info-value">${value}</div>
    </div>
  `;
}

/** کارت خلاصه — جزئیات مهم قبل از باز شدن */
export function renderFileCard(file) {
  const data = getFileData(file);
  const type = file.type || "sale";
  const status = file.status || "active";
  const name = getFileName(file);
  const phone = getFilePhone(file);
  const location = getFileLocation(file);
  const hasFollowUp = isFollowUp(file);
  const propertyType = data.propertyType || "";
  const area = data.area || "";
  const tags = getFileTags(file);
  const isDivar = file.source === "divar" || !!file.divarToken;

  // مبالغ — رهن و اجاره با هم
  const priceRows = [];
  if (type === "sale") {
    if (data.salePrice) {
      priceRows.push({ label: "قیمت", value: formatMoney(data.salePrice) });
    }
  } else if (type === "landlord") {
    if (data.suggestedDeposit) {
      priceRows.push({ label: "رهن / ودیعه", value: formatMoney(data.suggestedDeposit) });
    }
    if (data.suggestedRent) {
      priceRows.push({ label: "اجاره", value: formatMoney(data.suggestedRent) });
    }
  } else if (type === "tenant") {
    if (data.tenantDeposit) {
      priceRows.push({ label: "رهن / ودیعه", value: formatMoney(data.tenantDeposit) });
    }
    if (data.tenantRent) {
      priceRows.push({ label: "اجاره", value: formatMoney(data.tenantRent) });
    }
  } else if (type === "buyer") {
    if (data.capital) {
      priceRows.push({ label: "بودجه", value: formatMoney(data.capital) });
    }
  }

  if (!priceRows.length) {
    const fallback = getFilePrice(file);
    if (fallback) priceRows.push({ label: "مبلغ", value: formatMoney(fallback) });
  }

  const metaBits = [];
  if (propertyType) {
    metaBits.push(PROPERTY_TYPE_LABELS[propertyType] || propertyType);
  }
  if (area) metaBits.push(`${area} متر`);
  if (data.rooms) metaBits.push(`${data.rooms} خواب`);
  if (data.unitFloor) {
    metaBits.push(`طبقه ${FLOOR_LABELS[data.unitFloor] || data.unitFloor}`);
  }
  if (data.yearBuilt) metaBits.push(`ساخت ${data.yearBuilt}`);

  const amenityBits = amenityLabels(data.amenities).slice(0, 4);
  const notesRaw = String(data.notes || data.description || "").trim();
  let notesPreview = "";
  if (notesRaw) {
    notesPreview = notesRaw.length > 110 ? notesRaw.slice(0, 110).trim() + "…" : notesRaw;
  }

  const tagBadges = tags
    .map((t) => {
      const cls =
        t === "divar-deleted"
          ? "tag-badge tag-deleted"
          : t === "needs-review-from-ad" || t === "needs-review"
            ? "tag-badge tag-review"
            : "tag-badge";
      return `<div class="${cls}">${escapeHtml(getTagLabel(t))}</div>`;
    })
    .join("");

  const typeClass =
    type === "sale"
      ? "type-sale"
      : type === "landlord"
        ? "type-landlord"
        : type === "buyer"
          ? "type-buyer"
          : type === "tenant"
            ? "type-tenant"
            : "type-default";

  const searchKw = state.search || "";

  const priceHtml = priceRows.length
    ? `<div class="card-prices">${priceRows
        .map(
          (r) => `
      <div class="card-price-row">
        <span class="card-price-label">${escapeHtml(r.label)}</span>
        <span class="card-price-value">${escapeHtml(r.value)}</span>
      </div>`
        )
        .join("")}</div>`
    : "";

  const amenitiesHtml = amenityBits.length
    ? `<div class="card-amenities-mini">${amenityBits
        .map((a) => `<span class="card-tag">${escapeHtml(a)}</span>`)
        .join("")}</div>`
    : "";

  const nameHtml = highlightMatches(name, searchKw);
  const locationHtml = location
    ? highlightMatches(location, searchKw)
    : escapeHtml("—");
  const metaHtml = metaBits.length
    ? highlightMatches(metaBits.join(" · "), searchKw)
    : "";
  const notesHtml = notesPreview
    ? `<div class="card-notes">${highlightMatches(notesPreview, searchKw)}</div>`
    : "";

  return `
    <div class="file-card card-summary md-card ${typeClass}" data-file-id="${escapeHtml(file.id)}" role="button" tabindex="0">
      <div class="card-type-stripe" aria-hidden="true"></div>
      <div class="card-top">
        <div class="card-top-main">
          <div class="card-type">${escapeHtml(TYPE_LABELS[type] || type)}${isDivar ? ' <span class="divar-source-mark">دیوار</span>' : ""}</div>
          <div class="card-title">${nameHtml}</div>
        </div>
        <div class="card-top-badges">
          ${
            Number(file.code) > 0
              ? `<div class="file-code-badge" title="کد فایل">کد ${escapeHtml(
                  formatFileCode(file.code)
                )}</div>`
              : ""
          }
          ${
            hasFollowUp
              ? `<div class="followup-badge${
                  file.followUpDate &&
                  Number.isFinite(new Date(file.followUpDate).getTime()) &&
                  new Date(file.followUpDate).getTime() < Date.now() - 86400000
                    ? " followup-overdue"
                    : ""
                }">${escapeHtml(followUpBadgeText(file))}</div>`
              : ""
          }
          ${isInTrash(file) ? `<div class="trash-badge">حذف‌شده</div>` : ""}
          ${tagBadges}
        </div>
      </div>

      ${priceHtml}

      <div class="card-info">
        <div class="info-item">
          <div class="info-label">موقعیت</div>
          <div class="info-value">${locationHtml}</div>
        </div>
        ${
          metaHtml
            ? `<div class="info-item">
          <div class="info-label">مشخصات</div>
          <div class="info-value">${metaHtml}</div>
        </div>`
            : ""
        }
        ${
          phone
            ? `<div class="info-item">
          <div class="info-label">تلفن</div>
          <button type="button" class="info-value card-phone-copy" data-phone="${escapeHtml(phone)}" title="کپی شماره">${escapeHtml(phone)}</button>
        </div>`
            : ""
        }
      </div>

      ${notesHtml}

      ${amenitiesHtml}

      <div class="card-footer">
        <div class="card-footer-left">
          <div class="card-date">${escapeHtml(formatDate(file.updatedAt || file.deletedAt))}</div>
          ${
            !isInTrash(file) && !isDeleted(file)
              ? `<button type="button" class="card-match-btn" data-match-file-id="${escapeHtml(file.id)}" title="${escapeHtml(matchButtonLabel(file))}">${escapeHtml(matchButtonLabel(file))}</button>`
              : ""
          }
        </div>
        <div class="status-badge" style="background:${getStatusColor(status)}">
          ${escapeHtml(getStatusLabel(status))}
        </div>
      </div>
    </div>
  `;
}

/** محتوای کامل برای مودال جزئیات */
export function renderFileDetailHtml(file) {
  const data = getFileData(file);
  const type = file.type || "sale";
  const status = file.status || "active";
  const name = getFileName(file);
  const phone = getFilePhone(file);
  const location = getFileLocation(file);
  const items = [];
  const tags = getFileTags(file);

  items.push(infoItem("نوع فایل", escapeHtml(TYPE_LABELS[type] || type)));
  items.push(infoItem("وضعیت", escapeHtml(getStatusLabel(status))));
  if (tags.length) {
    items.push(
      infoItem(
        "برچسب‌ها",
        tags.map((t) => escapeHtml(getTagLabel(t))).join(" · ")
      )
    );
  }
  if (file.source === "divar" || file.divarToken) {
    items.push(infoItem("منبع", "دیوار"));
    if (file.divarTitle) {
      items.push(infoItem("عنوان آگهی", escapeHtml(file.divarTitle)));
    }
  }
  items.push(infoItem("نام", escapeHtml(name)));
  items.push(infoItem("تلفن", escapeHtml(phone || "—")));
  items.push(infoItem("موقعیت", escapeHtml(location || "—")));
  if (data.plaque) items.push(infoItem("پلاک", escapeHtml(data.plaque)));

  if (type === "sale" || type === "landlord") {
    if (data.propertyType)
      items.push(
        infoItem(
          "نوع ملک",
          escapeHtml(PROPERTY_TYPE_LABELS[data.propertyType] || data.propertyType)
        )
      );
    if (data.area) items.push(infoItem("متراژ", escapeHtml(`${data.area} متر`)));
    if (data.rooms) items.push(infoItem("خواب", escapeHtml(String(data.rooms))));
    if (data.year) items.push(infoItem("سال ساخت", escapeHtml(String(data.year))));
    if (data.unitFloor)
      items.push(
        infoItem(
          "طبقه واحد",
          escapeHtml(FLOOR_LABELS[data.unitFloor] || String(data.unitFloor))
        )
      );
    if (data.totalFloors)
      items.push(infoItem("کل طبقات", escapeHtml(String(data.totalFloors))));
    if (data.keyHolder) {
      let keyText = KEY_HOLDER_LABELS[data.keyHolder] || data.keyHolder;
      if (data.keyHolderName || data.keyHolderPhone) {
        const parts = [];
        if (data.keyHolderName) parts.push(data.keyHolderName);
        if (data.keyHolderPhone) parts.push(data.keyHolderPhone);
        keyText += `: ${parts.join(" — ")}`;
      }
      items.push(infoItem("کلید دست", escapeHtml(keyText)));
    }
    if (data.condition)
      items.push(
        infoItem(
          "وضعیت ملک",
          escapeHtml(CONDITION_LABELS[data.condition] || data.condition)
        )
      );
    if (data.occupancy)
      items.push(
        infoItem(
          "سکونت",
          escapeHtml(OCCUPANCY_LABELS[data.occupancy] || data.occupancy)
        )
      );
  }

  if (type === "sale" && data.salePrice)
    items.push(infoItem("قیمت فروش", escapeHtml(formatMoney(data.salePrice))));
  if (type === "buyer" && data.capital)
    items.push(infoItem("سرمایه", escapeHtml(formatMoney(data.capital))));
  if (type === "landlord") {
    if (data.suggestedDeposit)
      items.push(
        infoItem("ودیعه پیشنهادی", escapeHtml(formatMoney(data.suggestedDeposit)))
      );
    if (data.suggestedRent)
      items.push(
        infoItem("اجاره پیشنهادی", escapeHtml(formatMoney(data.suggestedRent)))
      );
  }
  if (type === "tenant") {
    if (data.tenantDeposit)
      items.push(infoItem("ودیعه", escapeHtml(formatMoney(data.tenantDeposit))));
    if (data.tenantRent)
      items.push(infoItem("اجاره", escapeHtml(formatMoney(data.tenantRent))));
    if (data.familyStatus)
      items.push(
        infoItem(
          "خانوادگی",
          escapeHtml(FAMILY_LABELS[data.familyStatus] || data.familyStatus)
        )
      );
    if (data.familySize)
      items.push(infoItem("نفرات", escapeHtml(String(data.familySize))));
  }
  if (data.occupancy === "tenant") {
    if (data.currentDeposit)
      items.push(
        infoItem("ودیعه فعلی", escapeHtml(formatMoney(data.currentDeposit)))
      );
    if (data.currentRent)
      items.push(
        infoItem("اجاره فعلی", escapeHtml(formatMoney(data.currentRent)))
      );
  }

  let amenitiesHtml = "";
  if (Array.isArray(data.amenities) && data.amenities.length) {
    amenitiesHtml = `<div class="card-amenities">${data.amenities
      .map(
        (a) =>
          `<span class="card-tag">${escapeHtml(AMENITY_LABELS[a] || a)}</span>`
      )
      .join("")}</div>`;
  }

  const notesParts = [];
  if (data.notes) notesParts.push(data.notes);
  if (type === "buyer" && data.buyerNotes) notesParts.push(data.buyerNotes);
  if (type === "tenant" && data.tenantNotes) notesParts.push(data.tenantNotes);
  const notesHtml = notesParts.length
    ? `<div class="card-notes"><span class="info-label">توضیحات</span><div class="card-notes-text">${escapeHtml(
        notesParts.join("\n")
      )}</div></div>`
    : "";

  return `
    <div class="detail-grid-wrap">
      <div class="card-info card-info-full">${items.join("")}</div>
      ${amenitiesHtml}
      ${notesHtml}
      <div class="detail-meta">
        ثبت: ${escapeHtml(formatDate(file.createdAt))} ·
        بروزرسانی: ${escapeHtml(formatDate(file.updatedAt))}
        ${
          file.deletedAt
            ? ` · حذف: ${escapeHtml(formatDate(file.deletedAt))}`
            : ""
        }
      </div>
    </div>
  `;
}

export function applyFilters() {
  document.querySelectorAll(".filter-button").forEach((btn) => {
    const filter = btn.getAttribute("data-filter");
    btn.classList.toggle("active", filter === state.currentFilter);
  });
  renderHome();
}
