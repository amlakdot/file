/* =========================================================
   صفحه عمومی املاک — فقط مشخصات ملک
========================================================= */

import { CONFIG } from "./config.js";
import {
  formatMoney,
  formatDate,
  escapeHtml,
  normalize
} from "./helpers.js";
import {
  TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  FLOOR_LABELS,
  AMENITY_LABELS
} from "./labels.js";

const TYPE_FILTERS = [
  { id: "all", label: "همه" },
  { id: "sale", label: "فروشی" },
  { id: "landlord", label: "اجاره" },
  { id: "buyer", label: "تقاضای خرید" },
  { id: "tenant", label: "تقاضای اجاره" }
];

let allFiles = [];
let currentFilter = "all";
let search = "";

function amenityLabels(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((k) => AMENITY_LABELS[k] || k)
    .filter(Boolean);
}

function getPriceRows(file) {
  const data = file.data || {};
  const type = file.type;
  const rows = [];
  if (type === "sale" && data.salePrice) {
    rows.push({ label: "قیمت", value: formatMoney(data.salePrice) });
  } else if (type === "landlord") {
    if (data.suggestedDeposit)
      rows.push({ label: "رهن / ودیعه", value: formatMoney(data.suggestedDeposit) });
    if (data.suggestedRent)
      rows.push({ label: "اجاره", value: formatMoney(data.suggestedRent) });
  } else if (type === "tenant") {
    if (data.tenantDeposit)
      rows.push({ label: "رهن / ودیعه", value: formatMoney(data.tenantDeposit) });
    if (data.tenantRent)
      rows.push({ label: "اجاره", value: formatMoney(data.tenantRent) });
  } else if (type === "buyer" && data.capital) {
    rows.push({ label: "بودجه", value: formatMoney(data.capital) });
  }
  return rows;
}

function metaBits(data) {
  const bits = [];
  if (data.propertyType)
    bits.push(PROPERTY_TYPE_LABELS[data.propertyType] || data.propertyType);
  if (data.area) bits.push(`${data.area} متر`);
  if (data.rooms) bits.push(`${data.rooms} خواب`);
  if (data.unitFloor)
    bits.push(`طبقه ${FLOOR_LABELS[data.unitFloor] || data.unitFloor}`);
  if (data.yearBuilt) bits.push(`ساخت ${data.yearBuilt}`);
  return bits;
}

function renderCard(file) {
  const data = file.data || {};
  const type = file.type || "sale";
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

  const loc = data.location || data.region || data.address || "—";
  const prices = getPriceRows(file);
  const meta = metaBits(data);
  const notes = data.notes || data.description || "";
  const amenities = amenityLabels(data.amenities).slice(0, 5);

  const priceHtml = prices.length
    ? `<div class="card-prices">${prices
        .map(
          (r) => `<div class="card-price-row">
        <span class="card-price-label">${escapeHtml(r.label)}</span>
        <span class="card-price-value">${escapeHtml(r.value)}</span>
      </div>`
        )
        .join("")}</div>`
    : "";

  return `
    <article class="file-card card-summary md-card public-card ${typeClass}">
      <div class="card-type-stripe" aria-hidden="true"></div>
      <div class="card-top">
        <div class="card-top-main">
          <div class="card-type">${escapeHtml(TYPE_LABELS[type] || type)}</div>
          <div class="card-title">${escapeHtml(file.title || "فایل املاک")}</div>
        </div>
      </div>
      <div class="card-info">
        <div class="info-item">
          <div class="info-label">موقعیت</div>
          <div class="info-value">${escapeHtml(loc)}</div>
        </div>
        ${
          meta.length
            ? `<div class="info-item">
          <div class="info-label">مشخصات</div>
          <div class="info-value">${escapeHtml(meta.join(" · "))}</div>
        </div>`
            : ""
        }
      </div>
      ${priceHtml}
      ${notes ? `<div class="card-notes">${escapeHtml(notes)}</div>` : ""}
      ${
        amenities.length
          ? `<div class="card-amenities-mini">${amenities
              .map((a) => `<span class="card-tag">${escapeHtml(a)}</span>`)
              .join("")}</div>`
          : ""
      }
      <div class="card-footer">
        <div>${file.updatedAt ? escapeHtml(formatDate(file.updatedAt)) : ""}</div>
        <div class="public-privacy-note">بدون اطلاعات تماس</div>
      </div>
    </article>
  `;
}

function getFiltered() {
  let list = allFiles.slice();
  if (currentFilter !== "all") {
    list = list.filter((f) => f.type === currentFilter);
  }
  const q = normalize(search);
  if (q) {
    list = list.filter((f) => {
      const data = f.data || {};
      const blob = [
        f.title,
        f.type,
        data.location,
        data.region,
        data.address,
        data.notes,
        data.description,
        data.area,
        data.rooms,
        data.propertyType
      ]
        .filter(Boolean)
        .join(" ");
      return normalize(blob).includes(q);
    });
  }
  return list;
}

function render() {
  const container = document.getElementById("publicFiles");
  const empty = document.getElementById("publicEmpty");
  const countEl = document.getElementById("publicCount");
  if (!container) return;

  const filtered = getFiltered();
  if (countEl) {
    countEl.textContent = `${filtered.length.toLocaleString("fa-IR")} فایل`;
  }

  if (!filtered.length) {
    container.innerHTML = "";
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");
  container.innerHTML = filtered.map(renderCard).join("");
}

async function loadPublicData() {
  const status = document.getElementById("publicStatus");
  if (status) status.textContent = "در حال بارگذاری...";

  const candidates = [];
  if (CONFIG.publicDataUrl) candidates.push(CONFIG.publicDataUrl);
  candidates.push("./data/public-files.json");
  candidates.push(
    `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${CONFIG.publicDataPath || "data/public-files.json"}`
  );

  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const db = await res.json();
      allFiles = Array.isArray(db.files) ? db.files : [];
      if (status) {
        status.textContent = db.updatedAt
          ? `به‌روزرسانی: ${formatDate(db.updatedAt)}`
          : "آماده";
      }
      render();
      return;
    } catch (err) {
      lastErr = err;
    }
  }

  if (status) {
    status.textContent =
      "داده عمومی در دسترس نیست. ابتدا از پنل مشاور یک‌بار ذخیره کنید.";
  }
  console.warn("public data load failed", lastErr);
  allFiles = [];
  render();
}

function setupUi() {
  const filters = document.getElementById("publicFilters");
  if (filters) {
    filters.innerHTML = TYPE_FILTERS.map(
      (f) =>
        `<button type="button" class="filter-button${f.id === "all" ? " active" : ""}" data-filter="${f.id}">${f.label}</button>`
    ).join("");
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      currentFilter = btn.getAttribute("data-filter") || "all";
      filters.querySelectorAll(".filter-button").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      render();
    });
  }

  document.getElementById("publicSearch")?.addEventListener("input", (e) => {
    search = e.target.value || "";
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupUi();
  loadPublicData();
});
