/* =========================================================
   صفحه عمومی املاک — فقط مشخصات ملک
========================================================= */

import { CONFIG } from "./config.js";
import {
  formatMoney,
  formatDate,
  formatFileCode,
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
  { id: "landlord", label: "اجاره" }
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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getPriceRows(file) {
  const data = file.data || {};
  const type = file.type;
  const rows = [];
  if (type === "sale" && num(data.salePrice)) {
    rows.push({ label: "قیمت", value: formatMoney(data.salePrice) });
  } else if (type === "landlord") {
    if (num(data.suggestedDeposit))
      rows.push({ label: "رهن / ودیعه", value: formatMoney(data.suggestedDeposit) });
    if (num(data.suggestedRent))
      rows.push({ label: "اجاره", value: formatMoney(data.suggestedRent) });
  } else if (type === "tenant") {
    if (num(data.tenantDeposit))
      rows.push({ label: "رهن / ودیعه", value: formatMoney(data.tenantDeposit) });
    if (num(data.tenantRent))
      rows.push({ label: "اجاره", value: formatMoney(data.tenantRent) });
  } else if (type === "buyer" && num(data.capital)) {
    rows.push({ label: "بودجه", value: formatMoney(data.capital) });
  }
  return rows;
}

function metaBits(data) {
  const bits = [];
  if (data.propertyType)
    bits.push(PROPERTY_TYPE_LABELS[data.propertyType] || data.propertyType);
  if (num(data.area)) bits.push(`${data.area} متر`);
  if (num(data.rooms)) bits.push(`${data.rooms} خواب`);
  if (data.unitFloor)
    bits.push(`طبقه ${FLOOR_LABELS[data.unitFloor] || data.unitFloor}`);
  const year = data.yearBuilt || data.year;
  if (num(year)) bits.push(`ساخت ${year}`);
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

  const loc = data.location || data.region || data.address || "";
  const prices = getPriceRows(file);
  const meta = metaBits(data);
  let notes =
    data.notes ||
    data.description ||
    data.tenantNotes ||
    data.buyerNotes ||
    "";
  // عبارت قدیمی redact و شماره را از نمایش عمومی بردار
  notes = String(notes)
    .replace(/\[شماره حذف‌شده\]/g, " ")
    .replace(
      /(?:\+98|0098|098|0)?[\s\-_.]*9\d{2}[\s\-_.]*\d{3}[\s\-_.]*\d{4}/g,
      " "
    )
    .replace(/\s{2,}/g, " ")
    .trim();
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

  const codeNum = Number(file.code);
  const codeText =
    Number.isFinite(codeNum) && codeNum > 0 ? formatFileCode(codeNum) : "";
  const codeBadge = codeText
    ? `<span class="file-code-badge" title="کد فایل">کد ${escapeHtml(
        codeText
      )}</span>`
    : "";

  return `
    <article class="file-card card-summary md-card public-card ${typeClass}">
      <div class="card-type-stripe" aria-hidden="true"></div>
      <div class="card-top">
        <div class="card-top-main">
          <div class="card-type card-type-with-code">
            <span>${escapeHtml(TYPE_LABELS[type] || type)}</span>
            ${codeBadge}
          </div>
          <div class="card-title">${escapeHtml(file.title || "فایل املاک")}</div>
        </div>
      </div>
      <div class="card-info">
        ${
          loc
            ? `<div class="info-item">
          <div class="info-label">موقعیت</div>
          <div class="info-value">${escapeHtml(loc)}</div>
        </div>`
            : ""
        }
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

function publicDataCandidates() {
  const path = CONFIG.publicDataPath || "data/public-files.json";
  const list = [];

  if (CONFIG.publicDataUrl) list.push(CONFIG.publicDataUrl);

  // مسیر نسبی روی همان GitHub Pages
  list.push("./" + path);
  list.push(path);

  // raw گیت‌هاب (اگر ریپو عمومی باشد)
  list.push(
    `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${path}`
  );

  // آدرس متداول GitHub Pages پروژه
  list.push(
    `https://${CONFIG.owner}.github.io/${CONFIG.repo}/${path}`
  );

  // یکتا کردن
  return [...new Set(list)];
}

async function loadPublicData({ silent = false } = {}) {
  const status = document.getElementById("publicStatus");
  const btn = document.getElementById("publicRefreshButton");

  if (!silent && status) status.textContent = "در حال بارگذاری از منبع...";
  if (btn) {
    btn.classList.add("is-loading");
    btn.textContent = "در حال به‌روزرسانی...";
  }

  let lastErr = null;
  for (const url of publicDataCandidates()) {
    try {
      const sep = url.includes("?") ? "&" : "?";
      const res = await fetch(`${url}${sep}t=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
      const db = await res.json();
      allFiles = Array.isArray(db.files) ? db.files : [];
      if (status) {
        const when = db.updatedAt ? formatDate(db.updatedAt) : "همین الان";
        status.textContent = `آخرین نسخه منبع · ${when}`;
      }
      render();
      return true;
    } catch (err) {
      lastErr = err;
    }
  }

  if (status) {
    status.textContent =
      "داده عمومی در دسترس نیست. از پنل مشاور «انتشار برای عموم» را بزنید.";
  }
  console.warn("public data load failed", lastErr);
  allFiles = [];
  render();
  return false;
}

async function refreshPublicData() {
  const btn = document.getElementById("publicRefreshButton");
  try {
    const ok = await loadPublicData();
    if (ok && btn) {
      btn.textContent = "به‌روز شد";
      setTimeout(() => {
        if (btn) btn.textContent = "به‌روزرسانی";
      }, 1200);
    }
  } finally {
    if (btn) {
      btn.classList.remove("is-loading");
      if (btn.textContent === "در حال به‌روزرسانی...") {
        btn.textContent = "به‌روزرسانی";
      }
    }
  }
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

  document.getElementById("publicRefreshButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    refreshPublicData();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupUi();
  refreshPublicData();
});
