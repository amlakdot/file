/* =========================================================
   تطبیق فایل‌ها — اجاره (مالک/مستأجر) و خرید/فروش
   نرخ پیش‌فرض: هر ۱۰۰ میلیون رهن ≈ ۳ میلیون اجاره ماهانه
========================================================= */

import { state } from "./state.js";
import {
  getFileData,
  getFileName,
  getFilePhone,
  getFileLocation,
  getActiveFiles,
  isDeleted
} from "./files.js";
import { formatMoney, escapeHtml, normalize, appLog } from "./helpers.js";

/** میلیون اجاره به ازای هر ۱۰۰ میلیون رهن */
export const DEFAULT_RAHN_RATE = 3;

const RATE_STORAGE_KEY = "amlakdot_match_rahn_rate";
const TOLERANCE_STORAGE_KEY = "amlakdot_match_tolerance";

/** پیش‌فرض تلرانس قیمت: ±۱۵٪ */
export const DEFAULT_TOLERANCE = 0.15;

export function getMatchRate() {
  try {
    const v = Number(localStorage.getItem(RATE_STORAGE_KEY));
    if (v > 0 && v < 100) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_RAHN_RATE;
}

export function setMatchRate(rate) {
  const n = Number(rate);
  if (!n || n <= 0) return getMatchRate();
  try {
    localStorage.setItem(RATE_STORAGE_KEY, String(n));
  } catch {
    /* ignore */
  }
  return n;
}

export function getMatchTolerance() {
  try {
    const v = Number(localStorage.getItem(TOLERANCE_STORAGE_KEY));
    if (v >= 0 && v <= 1) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_TOLERANCE;
}

export function setMatchTolerance(pct) {
  // pct به صورت درصد عدد (مثلاً 15) یا اعشار (0.15)
  let n = Number(pct);
  if (!Number.isFinite(n)) return getMatchTolerance();
  if (n > 1) n = n / 100;
  if (n < 0) n = 0;
  if (n > 1) n = 1;
  try {
    localStorage.setItem(TOLERANCE_STORAGE_KEY, String(n));
  } catch {
    /* ignore */
  }
  return n;
}

/**
 * تبدیل رهن + اجاره به رهن کامل معادل
 * rate = میلیون اجاره به ازای هر ۱۰۰ میلیون رهن (پیش‌فرض ۳)
 */
export function toFullDeposit(deposit, rent, rate = DEFAULT_RAHN_RATE) {
  const d = Number(deposit) || 0;
  const r = Number(rent) || 0;
  const rt = Number(rate) || DEFAULT_RAHN_RATE;
  if (rt <= 0) return d;
  // هر rate میلیون اجاره ≈ ۱۰۰ میلیون رهن
  // رهن از اجاره = (rent / (rate * 1e6)) * 1e8
  const fromRent = (r / (rt * 1_000_000)) * 100_000_000;
  return Math.round(d + fromRent);
}

/** جزئیات رهن/اجاره یک فایل اجاره‌ای یا مستأجر */
export function getRentMoney(file, rate = getMatchRate()) {
  const data = getFileData(file);
  const type = file?.type || "";
  if (type === "landlord") {
    const deposit = Number(data.suggestedDeposit) || 0;
    const rent = Number(data.suggestedRent) || 0;
    return {
      deposit,
      rent,
      full: toFullDeposit(deposit, rent, rate),
      label: "پیشنهادی مالک"
    };
  }
  if (type === "tenant") {
    const deposit = Number(data.tenantDeposit) || 0;
    const rent = Number(data.tenantRent) || 0;
    return {
      deposit,
      rent,
      full: toFullDeposit(deposit, rent, rate),
      label: "بودجه مستأجر"
    };
  }
  return { deposit: 0, rent: 0, full: 0, label: "" };
}

export function getSaleMoney(file) {
  const data = getFileData(file);
  const type = file?.type || "";
  if (type === "sale") {
    return {
      amount: Number(data.salePrice) || 0,
      label: "قیمت فروش"
    };
  }
  if (type === "buyer") {
    return {
      amount: Number(data.capital) || 0,
      label: "سرمایه خریدار"
    };
  }
  return { amount: 0, label: "" };
}

function locationScore(a, b) {
  const la = normalize(getFileLocation(a));
  const lb = normalize(getFileLocation(b));
  if (!la || !lb) return 0.35; // بدون منطقه: امتیاز خنثی پایین
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.85;
  // اشتراک کلمات
  const wa = new Set(la.split(/\s+/).filter((w) => w.length >= 2));
  const wb = new Set(lb.split(/\s+/).filter((w) => w.length >= 2));
  let common = 0;
  for (const w of wa) if (wb.has(w)) common += 1;
  if (common === 0) return 0.15;
  return Math.min(1, 0.4 + common * 0.2);
}

function areaRoomsScore(demand, supply) {
  const dd = getFileData(demand);
  const sd = getFileData(supply);
  const needArea = Number(dd.area) || 0;
  const haveArea = Number(sd.area) || 0;
  const needRooms = Number(dd.rooms) || 0;
  const haveRooms = Number(sd.rooms) || 0;

  let score = 0.5;
  let parts = 0;

  if (needArea > 0 && haveArea > 0) {
    parts += 1;
    if (haveArea >= needArea * 0.9) score += 0.3;
    else if (haveArea >= needArea * 0.75) score += 0.15;
    else score -= 0.2;
  }
  if (needRooms > 0 && haveRooms > 0) {
    parts += 1;
    if (haveRooms >= needRooms) score += 0.2;
    else if (haveRooms >= needRooms - 1) score += 0.05;
    else score -= 0.15;
  }
  if (parts === 0) return 0.4;
  return Math.max(0, Math.min(1, score));
}

function priceScore(budget, ask, tolerance) {
  if (!budget || budget <= 0 || !ask || ask <= 0) return 0;
  const ratio = budget / ask;
  // ایده‌آل: بودجه نزدیک یا کمی بالاتر از قیمت
  if (ratio >= 1 - tolerance && ratio <= 1 + tolerance) {
    // نزدیک‌تر = بهتر؛ کمی بالاتر از قیمت کمی امتیاز بیشتر
    const dist = Math.abs(1 - ratio);
    return Math.max(0.55, 1 - dist / Math.max(tolerance, 0.01));
  }
  if (ratio > 1 + tolerance && ratio <= 1 + tolerance * 2) return 0.4;
  if (ratio < 1 - tolerance && ratio >= 1 - tolerance * 2) return 0.25;
  return 0;
}

function withinTolerance(budget, ask, tolerance) {
  if (!budget || !ask) return false;
  const lo = ask * (1 - tolerance);
  const hi = ask * (1 + tolerance);
  // بودجه مستأجر/خریدار باید حداقل نزدیک کف باشد
  // اجازه می‌دهیم بودجه کمی کمتر هم بیاید (تلرانس)
  return budget >= lo && budget <= hi * 1.25;
}

/**
 * تطبیق مستأجر → ملک‌های اجاره‌ای
 */
export function matchTenantToLandlords(tenant, opts = {}) {
  const rate = opts.rate ?? getMatchRate();
  const tolerance = opts.tolerance ?? getMatchTolerance();
  const tenantMoney = getRentMoney(tenant, rate);
  if (!tenantMoney.full) return [];

  const landlords = getActiveFiles().filter(
    (f) => f.type === "landlord" && f.status !== "done" && f.status !== "archived"
  );

  const results = [];
  for (const land of landlords) {
    const lm = getRentMoney(land, rate);
    if (!lm.full) continue;
    if (!withinTolerance(tenantMoney.full, lm.full, tolerance)) continue;

    const pScore = priceScore(tenantMoney.full, lm.full, tolerance);
    const lScore = locationScore(tenant, land);
    const aScore = areaRoomsScore(tenant, land);
    const total = Math.round((pScore * 0.5 + lScore * 0.3 + aScore * 0.2) * 100);

    const diffPct =
      lm.full > 0
        ? Math.round(((tenantMoney.full - lm.full) / lm.full) * 1000) / 10
        : 0;

    results.push({
      mode: "rent",
      demand: tenant,
      supply: land,
      score: total,
      budgetFull: tenantMoney.full,
      askFull: lm.full,
      demandMoney: tenantMoney,
      supplyMoney: lm,
      diffPct,
      priceScore: pScore,
      locationScore: lScore,
      areaScore: aScore
    });
  }

  results.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  return results;
}

/**
 * تطبیق ملک اجاره‌ای → مستأجرها
 */
export function matchLandlordToTenants(landlord, opts = {}) {
  const rate = opts.rate ?? getMatchRate();
  const tolerance = opts.tolerance ?? getMatchTolerance();
  const lm = getRentMoney(landlord, rate);
  if (!lm.full) return [];

  const tenants = getActiveFiles().filter(
    (f) => f.type === "tenant" && f.status !== "done" && f.status !== "archived"
  );

  const results = [];
  for (const ten of tenants) {
    const tm = getRentMoney(ten, rate);
    if (!tm.full) continue;
    if (!withinTolerance(tm.full, lm.full, tolerance)) continue;

    const pScore = priceScore(tm.full, lm.full, tolerance);
    const lScore = locationScore(ten, landlord);
    const aScore = areaRoomsScore(ten, landlord);
    const total = Math.round((pScore * 0.5 + lScore * 0.3 + aScore * 0.2) * 100);
    const diffPct =
      lm.full > 0 ? Math.round(((tm.full - lm.full) / lm.full) * 1000) / 10 : 0;

    results.push({
      mode: "rent",
      demand: ten,
      supply: landlord,
      score: total,
      budgetFull: tm.full,
      askFull: lm.full,
      demandMoney: tm,
      supplyMoney: lm,
      diffPct,
      priceScore: pScore,
      locationScore: lScore,
      areaScore: aScore
    });
  }

  results.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  return results;
}

/**
 * تطبیق خریدار → ملک‌های فروشی
 */
export function matchBuyerToSales(buyer, opts = {}) {
  const tolerance = opts.tolerance ?? getMatchTolerance();
  const bm = getSaleMoney(buyer);
  if (!bm.amount) return [];

  const sales = getActiveFiles().filter(
    (f) => f.type === "sale" && f.status !== "done" && f.status !== "archived"
  );

  const results = [];
  for (const sale of sales) {
    const sm = getSaleMoney(sale);
    if (!sm.amount) continue;
    if (!withinTolerance(bm.amount, sm.amount, tolerance)) continue;

    const pScore = priceScore(bm.amount, sm.amount, tolerance);
    const lScore = locationScore(buyer, sale);
    const aScore = areaRoomsScore(buyer, sale);
    const total = Math.round((pScore * 0.55 + lScore * 0.25 + aScore * 0.2) * 100);
    const diffPct =
      sm.amount > 0
        ? Math.round(((bm.amount - sm.amount) / sm.amount) * 1000) / 10
        : 0;

    results.push({
      mode: "sale",
      demand: buyer,
      supply: sale,
      score: total,
      budgetFull: bm.amount,
      askFull: sm.amount,
      demandMoney: bm,
      supplyMoney: sm,
      diffPct,
      priceScore: pScore,
      locationScore: lScore,
      areaScore: aScore
    });
  }

  results.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  return results;
}

/**
 * تطبیق ملک فروشی → خریداران
 */
export function matchSaleToBuyers(sale, opts = {}) {
  const tolerance = opts.tolerance ?? getMatchTolerance();
  const sm = getSaleMoney(sale);
  if (!sm.amount) return [];

  const buyers = getActiveFiles().filter(
    (f) => f.type === "buyer" && f.status !== "done" && f.status !== "archived"
  );

  const results = [];
  for (const buyer of buyers) {
    const bm = getSaleMoney(buyer);
    if (!bm.amount) continue;
    if (!withinTolerance(bm.amount, sm.amount, tolerance)) continue;

    const pScore = priceScore(bm.amount, sm.amount, tolerance);
    const lScore = locationScore(buyer, sale);
    const aScore = areaRoomsScore(buyer, sale);
    const total = Math.round((pScore * 0.55 + lScore * 0.25 + aScore * 0.2) * 100);
    const diffPct =
      sm.amount > 0
        ? Math.round(((bm.amount - sm.amount) / sm.amount) * 1000) / 10
        : 0;

    results.push({
      mode: "sale",
      demand: buyer,
      supply: sale,
      score: total,
      budgetFull: bm.amount,
      askFull: sm.amount,
      demandMoney: bm,
      supplyMoney: sm,
      diffPct,
      priceScore: pScore,
      locationScore: lScore,
      areaScore: aScore
    });
  }

  results.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  return results;
}

/** همه جفت‌های اجاره (بدون تکرار جفت) */
export function getAllRentMatches(opts = {}) {
  const tenants = getActiveFiles().filter(
    (f) => f.type === "tenant" && f.status !== "done" && f.status !== "archived"
  );
  const seen = new Set();
  const all = [];
  for (const t of tenants) {
    for (const m of matchTenantToLandlords(t, opts)) {
      const key = `${m.demand.id}|${m.supply.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(m);
    }
  }
  all.sort((a, b) => b.score - a.score);
  return all;
}

/** همه جفت‌های خرید/فروش */
export function getAllSaleMatches(opts = {}) {
  const buyers = getActiveFiles().filter(
    (f) => f.type === "buyer" && f.status !== "done" && f.status !== "archived"
  );
  const seen = new Set();
  const all = [];
  for (const b of buyers) {
    for (const m of matchBuyerToSales(b, opts)) {
      const key = `${m.demand.id}|${m.supply.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(m);
    }
  }
  all.sort((a, b) => b.score - a.score);
  return all;
}

function typeLabel(type) {
  switch (type) {
    case "landlord":
      return "مالک";
    case "tenant":
      return "مستأجر";
    case "sale":
      return "فروشی";
    case "buyer":
      return "خریدار";
    default:
      return type || "—";
  }
}

function formatDiff(diffPct) {
  if (diffPct === 0) return "دقیقاً روی قیمت";
  if (diffPct > 0) return `${diffPct}٪ بالاتر از قیمت`;
  return `${Math.abs(diffPct)}٪ پایین‌تر از قیمت`;
}

function moneyLineRent(money) {
  const parts = [];
  if (money.deposit) parts.push(`رهن ${formatMoney(money.deposit)}`);
  if (money.rent) parts.push(`اجاره ${formatMoney(money.rent)}`);
  parts.push(`معادل رهن کامل ${formatMoney(money.full)}`);
  return parts.join(" · ");
}

function moneyLineSale(money) {
  return formatMoney(money.amount || money);
}

/**
 * HTML یک کارت پیشنهاد
 */
export function renderMatchCard(match) {
  const demand = match.demand;
  const supply = match.supply;
  const dName = escapeHtml(getFileName(demand));
  const sName = escapeHtml(getFileName(supply));
  const dLoc = escapeHtml(getFileLocation(demand) || "—");
  const sLoc = escapeHtml(getFileLocation(supply) || "—");
  const dPhone = getFilePhone(demand) || "";
  const sPhone = getFilePhone(supply) || "";
  const dCode = demand.code != null ? escapeHtml(String(demand.code)) : "—";
  const sCode = supply.code != null ? escapeHtml(String(supply.code)) : "—";

  const isRent = match.mode === "rent";
  const budgetHtml = isRent
    ? moneyLineRent(match.demandMoney)
    : moneyLineSale(match.demandMoney);
  const askHtml = isRent
    ? moneyLineRent(match.supplyMoney)
    : moneyLineSale(match.supplyMoney);

  const scoreClass =
    match.score >= 75 ? "high" : match.score >= 50 ? "mid" : "low";

  const demandRole = isRent ? "مستأجر" : "خریدار";
  const supplyRole = isRent ? "ملک / مالک" : "ملک فروشی";

  return `
  <article class="match-card" data-demand-id="${escapeHtml(demand.id)}" data-supply-id="${escapeHtml(supply.id)}">
    <div class="match-card-top">
      <span class="match-score ${scoreClass}">${match.score}٪</span>
      <span class="match-diff">${escapeHtml(formatDiff(match.diffPct))}</span>
    </div>
    <div class="match-pair">
      <div class="match-side">
        <div class="match-role">${demandRole}</div>
        <div class="match-name">${dName} <span class="match-code">#${dCode}</span></div>
        <div class="match-meta">${dLoc}</div>
        <div class="match-money">${budgetHtml}</div>
        ${
          dPhone
            ? `<button type="button" class="match-call-btn" data-phone="${escapeHtml(dPhone)}" data-role="demand">تماس ${demandRole}</button>`
            : ""
        }
        <button type="button" class="match-open-btn ghost-mini" data-file-id="${escapeHtml(demand.id)}">جزئیات</button>
      </div>
      <div class="match-arrow" aria-hidden="true">↔</div>
      <div class="match-side">
        <div class="match-role">${supplyRole}</div>
        <div class="match-name">${sName} <span class="match-code">#${sCode}</span></div>
        <div class="match-meta">${sLoc}</div>
        <div class="match-money">${askHtml}</div>
        ${
          sPhone
            ? `<button type="button" class="match-call-btn" data-phone="${escapeHtml(sPhone)}" data-role="supply">تماس ${supplyRole}</button>`
            : ""
        }
        <button type="button" class="match-open-btn ghost-mini" data-file-id="${escapeHtml(supply.id)}">جزئیات</button>
      </div>
    </div>
  </article>`;
}

export function renderMatchList(matches) {
  if (!matches || !matches.length) {
    return `<p class="match-empty">پیشنهادی با این فیلتر پیدا نشد. تلرانس قیمت یا نرخ تبدیل را تغییر دهید.</p>`;
  }
  return matches.map(renderMatchCard).join("");
}

export function getMatchStats() {
  const files = getActiveFiles();
  return {
    landlords: files.filter((f) => f.type === "landlord").length,
    tenants: files.filter((f) => f.type === "tenant").length,
    sales: files.filter((f) => f.type === "sale").length,
    buyers: files.filter((f) => f.type === "buyer").length
  };
}

export function findFileById(id) {
  return state.files.find((f) => f && f.id === id && !isDeleted(f)) || null;
}

// برای جلوگیری از tree-shake اشتباه در برخی باندلرها
export const MATCH_TYPE_LABEL = typeLabel;
