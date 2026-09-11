/* =========================================================
   FILTER & RENDER
========================================================= */

import { state } from "./state.js";
import {
  $,
  normalize,
  escapeHtml,
  formatDate,
  formatMoney
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
  getStatusLabel
} from "./labels.js";
import {
  getFileData,
  getFileName,
  getFilePhone,
  getFileLocation,
  isFollowUp
} from "./files.js";

export function getFilteredFiles() {
  let result = [...state.files];

  if (state.currentFilter === "followup") {
    result = result.filter((f) => isFollowUp(f));
  } else if (state.currentFilter !== "all") {
    result = result.filter((f) => f.type === state.currentFilter);
  }

  const query = normalize(state.search);
  if (query) {
    result = result.filter((file) => {
      const data = getFileData(file);
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
        String(data.salePrice || ""),
        String(data.capital || "")
      ];
      return searchable.some((v) => normalize(v).includes(query));
    });
  }

  return result;
}

export function renderHome() {
  const container = $("filesContainer");
  const empty = $("emptyState");
  if (!container) return;

  const filtered = getFilteredFiles();

  if (filtered.length === 0) {
    container.innerHTML = "";
    empty?.classList.remove("hidden");
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

export function renderFileCard(file) {
  const data = getFileData(file);
  const type = file.type || "sale";
  const status = file.status || "active";
  const name = getFileName(file);
  const phone = getFilePhone(file);
  const location = getFileLocation(file);
  const propertyType = data.propertyType || "";
  const area = data.area || "";
  const rooms = data.rooms || "";
  const year = data.year || "";
  const hasFollowUp = isFollowUp(file);

  const items = [];

  items.push(infoItem("تلفن", escapeHtml(phone || "—")));
  items.push(infoItem("موقعیت", escapeHtml(location || "—")));

  if (type === "sale" || type === "landlord") {
    items.push(
      infoItem(
        "نوع ملک",
        escapeHtml(PROPERTY_TYPE_LABELS[propertyType] || propertyType || "—")
      )
    );
    if (area) items.push(infoItem("متراژ", escapeHtml(`${area} متر`)));
    if (rooms) items.push(infoItem("خواب", escapeHtml(String(rooms))));
    if (year) items.push(infoItem("سال ساخت", escapeHtml(String(year))));

    if (data.unitFloor) {
      const floorLabel =
        FLOOR_LABELS[data.unitFloor] || String(data.unitFloor);
      items.push(infoItem("طبقه واحد", escapeHtml(floorLabel)));
    }
    if (data.totalFloors) {
      items.push(
        infoItem("کل طبقات", escapeHtml(String(data.totalFloors)))
      );
    }

    if (data.keyHolder) {
      let keyText = KEY_HOLDER_LABELS[data.keyHolder] || data.keyHolder;
      if (
        data.keyHolder !== "owner" &&
        data.keyHolder !== "office" &&
        (data.keyHolderName || data.keyHolderPhone)
      ) {
        const parts = [];
        if (data.keyHolderName) parts.push(data.keyHolderName);
        if (data.keyHolderPhone) parts.push(data.keyHolderPhone);
        keyText = `${keyText}: ${parts.join(" — ")}`;
      }
      items.push(infoItem("کلید دست", escapeHtml(keyText)));
    }
    if (data.condition) {
      items.push(
        infoItem(
          "وضعیت ملک",
          escapeHtml(CONDITION_LABELS[data.condition] || data.condition)
        )
      );
    }
    if (data.occupancy) {
      items.push(
        infoItem(
          "سکونت",
          escapeHtml(OCCUPANCY_LABELS[data.occupancy] || data.occupancy)
        )
      );
    }
  }

  // قیمت‌ها
  if (type === "sale" && data.salePrice) {
    items.push(
      infoItem("قیمت فروش", escapeHtml(formatMoney(data.salePrice)))
    );
  }
  if (type === "buyer" && data.capital) {
    items.push(infoItem("سرمایه", escapeHtml(formatMoney(data.capital))));
  }
  if (type === "landlord") {
    if (data.suggestedDeposit) {
      items.push(
        infoItem("ودیعه پیشنهادی", escapeHtml(formatMoney(data.suggestedDeposit)))
      );
    }
    if (data.suggestedRent) {
      items.push(
        infoItem("اجاره پیشنهادی", escapeHtml(formatMoney(data.suggestedRent)))
      );
    }
  }
  if (type === "tenant") {
    if (data.tenantDeposit) {
      items.push(
        infoItem("ودیعه", escapeHtml(formatMoney(data.tenantDeposit)))
      );
    }
    if (data.tenantRent) {
      items.push(
        infoItem("اجاره", escapeHtml(formatMoney(data.tenantRent)))
      );
    }
    if (data.familyStatus) {
      items.push(
        infoItem(
          "خانوادگی",
          escapeHtml(FAMILY_LABELS[data.familyStatus] || data.familyStatus)
        )
      );
    }
    if (data.familySize) {
      items.push(infoItem("نفرات", escapeHtml(String(data.familySize))));
    }
  }

  if (data.occupancy === "tenant") {
    if (data.currentDeposit) {
      items.push(
        infoItem("ودیعه فعلی", escapeHtml(formatMoney(data.currentDeposit)))
      );
    }
    if (data.currentRent) {
      items.push(
        infoItem("اجاره فعلی", escapeHtml(formatMoney(data.currentRent)))
      );
    }
  }

  // امکانات
  let amenitiesHtml = "";
  if (Array.isArray(data.amenities) && data.amenities.length) {
    const tags = data.amenities
      .map(
        (a) =>
          `<span class="card-tag">${escapeHtml(AMENITY_LABELS[a] || a)}</span>`
      )
      .join("");
    amenitiesHtml = `<div class="card-amenities">${tags}</div>`;
  }

  // توضیحات
  const notesParts = [];
  if (data.notes) notesParts.push(data.notes);
  if (type === "buyer" && data.buyerNotes) notesParts.push(data.buyerNotes);
  if (type === "tenant" && data.tenantNotes) notesParts.push(data.tenantNotes);
  const notesText = notesParts.filter(Boolean).join(" | ");

  const notesHtml = notesText
    ? `<div class="card-notes"><span class="info-label">توضیحات</span><div class="card-notes-text">${escapeHtml(notesText)}</div></div>`
    : "";

  return `
    <div class="file-card" data-file-id="${escapeHtml(file.id)}" role="button" tabindex="0">
      <div class="card-top">
        <div>
          <div class="card-type">${escapeHtml(TYPE_LABELS[type] || type)}</div>
          <div class="card-title">${escapeHtml(name)}</div>
        </div>
        ${hasFollowUp ? `<div class="followup-badge">پیگیری</div>` : ""}
      </div>
      <div class="card-info card-info-full">
        ${items.join("")}
      </div>
      ${amenitiesHtml}
      ${notesHtml}
      <div class="card-footer">
        <div>${escapeHtml(formatDate(file.updatedAt))}</div>
        <div class="status-badge" style="background:${getStatusColor(status)}">
          ${escapeHtml(getStatusLabel(status))}
        </div>
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
