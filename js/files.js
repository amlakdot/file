/* =========================================================
   FILE HELPERS + FOLLOW-UP
========================================================= */

import { state } from "./state.js";
import { $ } from "./helpers.js";

export function getFileData(file) {
  if (!file || typeof file !== "object") return {};
  if (file.data && typeof file.data === "object") return file.data;
  return file;
}

export function getFileName(file) {
  const data = getFileData(file);
  return (
    data.name ||
    data.propertyName ||
    data.buyerName ||
    data.tenantName ||
    "بدون نام"
  );
}

export function getFilePhone(file) {
  const data = getFileData(file);
  return (
    data.phone ||
    data.propertyPhone ||
    data.buyerPhone ||
    data.tenantPhone ||
    ""
  );
}

export function getFileLocation(file) {
  const data = getFileData(file);
  return (
    data.location ||
    data.propertyLocation ||
    data.buyerLocation ||
    data.tenantLocation ||
    ""
  );
}

export function isFollowUp(file) {
  if (!file) return false;
  if (file.status === "followup" || file.status === "needs-followup") {
    return true;
  }
  if (!file.followUpDate) return false;
  const timestamp = new Date(file.followUpDate).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

export function updateFollowUpStatuses() {
  let changed = false;

  for (const file of state.files) {
    if (!file) continue;
    if (file.status === "archived" || file.status === "done") continue;
    if (!file.followUpDate) continue;

    const deadline = new Date(file.followUpDate).getTime();
    if (
      Number.isFinite(deadline) &&
      deadline <= Date.now() &&
      file.status !== "followup"
    ) {
      file.status = "followup";
      changed = true;
    }
  }

  updateFollowUpCount();
  return changed;
}

export function updateFollowUpCount() {
  const count = state.files.filter((f) => isFollowUp(f)).length;
  const el = $("followUpCount");
  if (el) el.textContent = count.toLocaleString("fa-IR");
}
