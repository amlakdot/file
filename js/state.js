/* =========================================================
   STATE
========================================================= */

export const state = {
  token: null,
  files: [],
  currentFilter: "all",
  search: "",
  sortBy: "updatedAt",
  sortDir: "desc",
  priceMin: null,
  priceMax: null,
  region: "",
  editingFileId: null,
  viewingFileId: null,
  isSaving: false,
  formDirty: false,
  pollTimer: null,
  lastSyncSha: null,
  lastLocalChangeAt: 0,
  lastPollAt: 0,
  /** اگر true باشد با بستن جزئیات دوباره پنل تطبیق باز می‌شود */
  returnToMatch: false
};
