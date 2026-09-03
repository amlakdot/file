/* =========================================================
   FILTER & RENDER
========================================================= */

import { state } from "./state.js";
import { $, normalize, escapeHtml, formatDate } from "./helpers.js";
import {
  TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
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
        data.propertyName,
        data.propertyPhone,
        data.propertyLocation
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

export function renderFileCard(file) {
  const data = getFileData(file);
  const type = file.type || "sale";
  const status = file.status || "active";
  const name = getFileName(file);
  const phone = getFilePhone(file);
  const location = getFileLocation(file);
  const propertyType = data.propertyType || "";
  const area = data.area || "";
  const hasFollowUp = isFollowUp(file);

  return `
    <div class="file-card" data-file-id="${escapeHtml(file.id)}" role="button" tabindex="0">
      <div class="card-top">
        <div>
          <div class="card-type">${escapeHtml(TYPE_LABELS[type] || type)}</div>
          <div class="card-title">${escapeHtml(name)}</div>
        </div>
        ${hasFollowUp ? `<div class="followup-badge">پیگیری</div>` : ""}
      </div>
      <div class="card-info">
        <div class="info-item">
          <div class="info-label">تلفن</div>
          <div class="info-value">${escapeHtml(phone || "—")}</div>
        </div>
        <div class="info-item">
          <div class="info-label">موقعیت</div>
          <div class="info-value">${escapeHtml(location || "—")}</div>
        </div>
        <div class="info-item">
          <div class="info-label">نوع ملک</div>
          <div class="info-value">${escapeHtml(
            PROPERTY_TYPE_LABELS[propertyType] || propertyType || "—"
          )}</div>
        </div>
        <div class="info-item">
          <div class="info-label">متراژ</div>
          <div class="info-value">${escapeHtml(
            area ? `${area} متر` : "—"
          )}</div>
        </div>
      </div>
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
