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

/**
 * امتیاز منطقه ۰–۱
 * - بدون داده در هر دو طرف → خنثی (از وزن خارج می‌شود در محاسبه نهایی)
 * - تطابق کامل / زیررشته / اشتراک توکن
 */
function locationScore(a, b) {
  const la = normalize(getFileLocation(a));
  const lb = normalize(getFileLocation(b));
  if (!la && !lb) return { score: 0, hasData: false };
  if (!la || !lb) return { score: 0.25, hasData: true }; // یکی خالی: ضعیف

  if (la === lb) return { score: 1, hasData: true };
  if (la.includes(lb) || lb.includes(la)) {
    const ratio = Math.min(la.length, lb.length) / Math.max(la.length, lb.length);
    return { score: 0.75 + 0.2 * ratio, hasData: true };
  }

  const tokenize = (s) =>
    s
      .split(/[\s،,/\-_]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);

  const wa = tokenize(la);
  const wb = tokenize(lb);
  if (!wa.length || !wb.length) return { score: 0.2, hasData: true };

  const setB = new Set(wb);
  let common = 0;
  for (const w of wa) if (setB.has(w)) common += 1;
  const jaccard = common / (new Set([...wa, ...wb]).size || 1);
  // اشتراک جزئی کلمات (مثلاً «ارکیده» داخل «ارکیده ۳»)
  let partial = 0;
  for (const x of wa) {
    for (const y of wb) {
      if (x !== y && (x.includes(y) || y.includes(x))) partial += 0.5;
    }
  }
  const raw = Math.min(1, jaccard * 1.2 + partial * 0.15);
  return { score: Math.max(0.05, raw), hasData: true };
}

/**
 * متراژ و اتاق — پیوسته و اصولی
 * متراژ: نسبت have/need با جریمه برای کمبود بیشتر از مازاد
 * اتاق: تعداد دقیق یا نزدیک
 */
function areaRoomsScore(demand, supply) {
  const dd = getFileData(demand);
  const sd = getFileData(supply);
  const needArea = Number(dd.area) || 0;
  const haveArea = Number(sd.area) || 0;
  const needRooms = Number(dd.rooms) || 0;
  const haveRooms = Number(sd.rooms) || 0;

  const parts = [];

  if (needArea > 0 && haveArea > 0) {
    const ratio = haveArea / needArea;
    let s;
    if (ratio >= 0.95 && ratio <= 1.15) {
      // نزدیک به نیاز
      s = 1 - Math.abs(1 - ratio) * 1.5;
    } else if (ratio > 1.15 && ratio <= 1.4) {
      s = 0.85 - (ratio - 1.15) * 0.8; // مازاد ملایم
    } else if (ratio >= 0.8 && ratio < 0.95) {
      s = 0.55 + (ratio - 0.8) * 2; // کمی کوچک‌تر
    } else if (ratio >= 0.65) {
      s = 0.25 + (ratio - 0.65) * 1.5;
    } else {
      s = Math.max(0, ratio * 0.3);
    }
    parts.push(Math.max(0, Math.min(1, s)));
  }

  if (needRooms > 0 && haveRooms > 0) {
    const diff = haveRooms - needRooms;
    let s;
    if (diff === 0) s = 1;
    else if (diff === 1) s = 0.85;
    else if (diff > 1) s = Math.max(0.4, 0.85 - (diff - 1) * 0.15);
    else if (diff === -1) s = 0.45;
    else s = Math.max(0, 0.2 + diff * 0.1);
    parts.push(s);
  }

  if (!parts.length) return { score: 0, hasData: false };
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  return { score: avg, hasData: true };
}

/**
 * امتیاز قیمت ۰–۱ فقط بر اساس نزدیک بودن بودجه به قیمت (بدون تلرانس UI)
 */
function priceScore(budget, ask) {
  if (!budget || budget <= 0 || !ask || ask <= 0) return 0;
  const ratio = budget / ask;
  const rel = Math.abs(ratio - 1);
  if (rel <= 0.02) return 1;
  if (rel <= 0.1) return 0.92 - (rel - 0.02) * 1.5;
  if (rel <= 0.25) return 0.8 - (rel - 0.1) * 2;
  if (rel <= 0.5) return 0.5 - (rel - 0.25) * 1.2;
  if (rel <= 1) return Math.max(0.08, 0.2 - (rel - 0.5) * 0.24);
  return Math.max(0, 0.08 / rel);
}

function hasPriceData(budget, ask) {
  return budget > 0 && ask > 0;
}

/** فیلتر امکانات: اگر انتخاب شده، ملک باید همه را داشته باشد */
export function supplyHasAmenities(file, required) {
  if (!required || !required.length) return true;
  const data = getFileData(file);
  const list = Array.isArray(data.amenities) ? data.amenities : [];
  return required.every((a) => list.includes(a));
}

/**
 * سقف اختلاف قابل قبول در حالت رهن‌کامل:
 * معادل ۹ میلیون اجاره ≈ ۳۰۰ میلیون رهن (با نرخ ۳)
 */
export const MAX_FULL_DEPOSIT_DELTA = 300_000_000;

function buildMatchResult({
  mode,
  demand,
  supply,
  budgetFull,
  askFull,
  demandMoney,
  supplyMoney
}) {
  if (!hasPriceData(budgetFull, askFull)) return null;

  // رهن‌کامل: فقط اگر اختلاف رهن‌کامل ≤ ۳۰۰ میلیون باشد
  if (mode === "rent") {
    const delta = Math.abs(budgetFull - askFull);
    if (delta > MAX_FULL_DEPOSIT_DELTA) return null;
  }

  const pScore = priceScore(budgetFull, askFull);
  const total = Math.round(pScore * 1000) / 10;
  const diffPct =
    askFull > 0
      ? Math.round(((budgetFull - askFull) / askFull) * 1000) / 10
      : 0;
  return {
    mode,
    demand,
    supply,
    score: total,
    budgetFull,
    askFull,
    demandMoney,
    supplyMoney,
    diffPct,
    priceScore: total,
    locationScore: null,
    areaScore: null
  };
}

/* ---------- پیگیری پیشنهاد ---------- */
const FOLLOWUP_KEY = "amlakdot_match_followup_v1";

function pairKey(demandId, supplyId) {
  return `${demandId}|${supplyId}`;
}

function loadFollowups() {
  try {
    const raw = localStorage.getItem(FOLLOWUP_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function saveFollowups(map) {
  try {
    localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export const FOLLOWUP_LABELS = {
  open: "باز",
  suggested: "پیشنهاد شد",
  called: "تماس",
  rejected: "رد",
  done: "توافق"
};

export function getMatchFollowup(demandId, supplyId) {
  if (!demandId || !supplyId) return "open";
  const map = loadFollowups();
  return map[pairKey(demandId, supplyId)] || "open";
}

export function setMatchFollowup(demandId, supplyId, status) {
  const map = loadFollowups();
  const key = pairKey(demandId, supplyId);
  if (!status || status === "open") delete map[key];
  else map[key] = status;
  saveFollowups(map);
  return getMatchFollowup(demandId, supplyId);
}

/**
 * تطبیق مستأجر → ملک‌های اجاره‌ای
 */
export function matchTenantToLandlords(tenant, opts = {}) {
  const rate = opts.rate ?? getMatchRate();
  const required = opts.amenities || [];
  const tenantMoney = getRentMoney(tenant, rate);
  if (!tenantMoney.full) return [];

  const landlords = getActiveFiles().filter(
    (f) =>
      f.type === "landlord" &&
      f.status !== "done" &&
      f.status !== "archived" &&
      supplyHasAmenities(f, required)
  );

  const results = [];
  for (const land of landlords) {
    const lm = getRentMoney(land, rate);
    if (!lm.full) continue;
    const m = buildMatchResult({
      mode: "rent",
      demand: tenant,
      supply: land,
      budgetFull: tenantMoney.full,
      askFull: lm.full,
      demandMoney: tenantMoney,
      supplyMoney: lm
    });
    if (m) results.push(m);
  }

  results.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  return results;
}

/**
 * تطبیق ملک اجاره‌ای → مستأجرها
 */
export function matchLandlordToTenants(landlord, opts = {}) {
  const rate = opts.rate ?? getMatchRate();
  const required = opts.amenities || [];
  const lm = getRentMoney(landlord, rate);
  if (!lm.full) return [];
  if (!supplyHasAmenities(landlord, required)) return [];

  const tenants = getActiveFiles().filter(
    (f) => f.type === "tenant" && f.status !== "done" && f.status !== "archived"
  );

  const results = [];
  for (const ten of tenants) {
    const tm = getRentMoney(ten, rate);
    if (!tm.full) continue;
    const m = buildMatchResult({
      mode: "rent",
      demand: ten,
      supply: landlord,
      budgetFull: tm.full,
      askFull: lm.full,
      demandMoney: tm,
      supplyMoney: lm
    });
    if (m) results.push(m);
  }

  results.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  return results;
}

/**
 * تطبیق خریدار → ملک‌های فروشی
 */
export function matchBuyerToSales(buyer, opts = {}) {
  const required = opts.amenities || [];
  const bm = getSaleMoney(buyer);
  if (!bm.amount) return [];

  const sales = getActiveFiles().filter(
    (f) =>
      f.type === "sale" &&
      f.status !== "done" &&
      f.status !== "archived" &&
      supplyHasAmenities(f, required)
  );

  const results = [];
  for (const sale of sales) {
    const sm = getSaleMoney(sale);
    if (!sm.amount) continue;
    const m = buildMatchResult({
      mode: "sale",
      demand: buyer,
      supply: sale,
      budgetFull: bm.amount,
      askFull: sm.amount,
      demandMoney: bm,
      supplyMoney: sm
    });
    if (m) results.push(m);
  }

  results.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  return results;
}

/**
 * تطبیق ملک فروشی → خریداران
 */
export function matchSaleToBuyers(sale, opts = {}) {
  const required = opts.amenities || [];
  const sm = getSaleMoney(sale);
  if (!sm.amount) return [];
  if (!supplyHasAmenities(sale, required)) return [];

  const buyers = getActiveFiles().filter(
    (f) => f.type === "buyer" && f.status !== "done" && f.status !== "archived"
  );

  const results = [];
  for (const buyer of buyers) {
    const bm = getSaleMoney(buyer);
    if (!bm.amount) continue;
    const m = buildMatchResult({
      mode: "sale",
      demand: buyer,
      supply: sale,
      budgetFull: bm.amount,
      askFull: sm.amount,
      demandMoney: bm,
      supplyMoney: sm
    });
    if (m) results.push(m);
  }

  results.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  return results;
}

/** همه جفت‌های اجاره با تبدیل به رهن کامل */
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

/**
 * تطبیق مستقیم رهن و اجاره — بدون تبدیل؛ فقط قیمت هر جزء
 */
function componentScore(budgetPart, askPart) {
  if ((!budgetPart || budgetPart <= 0) && (!askPart || askPart <= 0)) {
    return { skip: true, score: 0 };
  }
  if (!budgetPart || budgetPart <= 0 || !askPart || askPart <= 0) {
    return { skip: false, score: 0.1, partial: true };
  }
  return { skip: false, score: priceScore(budgetPart, askPart), partial: false };
}

function buildDirectRentResult(tenant, land) {
  const tm = getRentMoney(tenant);
  const lm = getRentMoney(land);

  const dep = componentScore(tm.deposit, lm.deposit);
  const ren = componentScore(tm.rent, lm.rent);

  if (dep.skip && ren.skip) return null;

  let priceCombined = 0;
  let w = 0;
  if (!dep.skip) {
    const wd = ren.skip ? 1 : 0.55;
    priceCombined += dep.score * wd;
    w += wd;
  }
  if (!ren.skip) {
    const wr = dep.skip ? 1 : 0.45;
    priceCombined += ren.score * wr;
    w += wr;
  }
  if (w > 0) priceCombined /= w;
  if (priceCombined <= 0) return null;

  const total = Math.round(priceCombined * 1000) / 10;

  const depDiff =
    lm.deposit > 0 && tm.deposit > 0
      ? Math.round(((tm.deposit - lm.deposit) / lm.deposit) * 1000) / 10
      : null;
  const rentDiff =
    lm.rent > 0 && tm.rent > 0
      ? Math.round(((tm.rent - lm.rent) / lm.rent) * 1000) / 10
      : null;

  return {
    mode: "rent-direct",
    demand: tenant,
    supply: land,
    score: total,
    budgetFull: tm.full,
    askFull: lm.full,
    demandMoney: tm,
    supplyMoney: lm,
    diffPct: depDiff != null ? depDiff : rentDiff || 0,
    depositDiffPct: depDiff,
    rentDiffPct: rentDiff,
    priceScore: total,
    depositScore: dep.skip ? null : Math.round(dep.score * 1000) / 10,
    rentScore: ren.skip ? null : Math.round(ren.score * 1000) / 10,
    locationScore: null,
    areaScore: null
  };
}

export function matchTenantToLandlordsDirect(tenant, opts = {}) {
  const required = opts.amenities || [];
  const tm = getRentMoney(tenant);
  if (!tm.deposit && !tm.rent) return [];

  const landlords = getActiveFiles().filter(
    (f) =>
      f.type === "landlord" &&
      f.status !== "done" &&
      f.status !== "archived" &&
      supplyHasAmenities(f, required)
  );

  const results = [];
  for (const land of landlords) {
    const m = buildDirectRentResult(tenant, land);
    if (m) results.push(m);
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

/** همه جفت‌های اجاره با مقایسه مستقیم رهن و اجاره */
export function getAllRentDirectMatches(opts = {}) {
  const tenants = getActiveFiles().filter(
    (f) => f.type === "tenant" && f.status !== "done" && f.status !== "archived"
  );
  const seen = new Set();
  const all = [];
  for (const t of tenants) {
    for (const m of matchTenantToLandlordsDirect(t, opts)) {
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
  if (diffPct == null || Number.isNaN(Number(diffPct))) return "";
  if (diffPct === 0) return "دقیقاً روی قیمت";
  if (diffPct > 0) return `${diffPct}٪ بالاتر از قیمت`;
  return `${Math.abs(diffPct)}٪ پایین‌تر از قیمت`;
}

function formatDirectDiff(match) {
  const parts = [];
  if (match.depositDiffPct != null) {
    const d = match.depositDiffPct;
    if (d === 0) parts.push("رهن مساوی");
    else if (d > 0) parts.push(`رهن ${d}٪ بیشتر`);
    else parts.push(`رهن ${Math.abs(d)}٪ کمتر`);
  }
  if (match.rentDiffPct != null) {
    const r = match.rentDiffPct;
    if (r === 0) parts.push("اجاره مساوی");
    else if (r > 0) parts.push(`اجاره ${r}٪ بیشتر`);
    else parts.push(`اجاره ${Math.abs(r)}٪ کمتر`);
  }
  return parts.length ? parts.join(" · ") : formatDiff(match.diffPct);
}

function moneyLineRent(money, { showFull = true } = {}) {
  const parts = [];
  if (money?.deposit) parts.push(`رهن ${formatMoney(money.deposit)}`);
  if (money?.rent) parts.push(`اجاره ${formatMoney(money.rent)}`);
  if (showFull && money?.full) parts.push(`رهن‌کامل ${formatMoney(money.full)}`);
  return parts.length ? parts.join(" · ") : "—";
}

function moneyLineSale(money) {
  return formatMoney(money.amount || money);
}

function formatScorePct(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return Number.isInteger(n) ? `${n}٪` : `${n.toFixed(1)}٪`;
}

function sideSpecs(file) {
  const d = getFileData(file);
  const bits = [];
  if (d.area) bits.push(`${Number(d.area).toLocaleString("fa-IR")} متر`);
  if (d.rooms) bits.push(`${Number(d.rooms).toLocaleString("fa-IR")} خواب`);
  if (d.propertyType) bits.push(String(d.propertyType));
  return bits.length ? bits.join(" · ") : "";
}

function scoreClassOf(score) {
  return score >= 80 ? "high" : score >= 70 ? "mid" : "low";
}

function moneyHtmlForMatch(match, side /* demand|supply */) {
  const isDirect = match.mode === "rent-direct";
  const isRent = match.mode === "rent" || isDirect;
  const money = side === "demand" ? match.demandMoney : match.supplyMoney;
  // رهن‌کامل در UI نشان داده نمی‌شود — فقط رهن و اجاره
  if (isRent) return moneyLineRent(money, { showFull: false });
  return moneyLineSale(money);
}

function breakdownForMatch(match) {
  const isDirect = match.mode === "rent-direct";
  const bits = [];
  if (isDirect) {
    if (match.depositScore != null) bits.push(`رهن ${formatScorePct(match.depositScore)}`);
    if (match.rentScore != null) bits.push(`اجاره ${formatScorePct(match.rentScore)}`);
  } else {
    bits.push(`نزدیکی قیمت ${formatScorePct(match.priceScore)}`);
  }
  return bits.map((t) => `<span class="mb-item">${escapeHtml(t)}</span>`).join("");
}

/**
 * یک فایل پیشنهادی — ظاهر شبیه کارت لیست اصلی + نوار تطبیق
 */
function renderMatchSuggestionCard(match, showSide = "supply") {
  const supply = match?.supply;
  const demand = match?.demand;
  if (!supply || !demand) return "";

  const file = showSide === "demand" ? demand : supply;
  const type = file.type || "sale";
  const data = getFileData(file);
  const name = escapeHtml(getFileName(file));
  const loc = escapeHtml(getFileLocation(file) || "—");
  const phone = getFilePhone(file) || "";
  const code = file.code != null ? escapeHtml(String(file.code)) : "";
  const isDirect = match.mode === "rent-direct";
  const isRent = match.mode === "rent" || isDirect;
  const money = moneyHtmlForMatch(match, showSide === "demand" ? "demand" : "supply");
  const diffText = isDirect ? formatDirectDiff(match) : formatDiff(match.diffPct);
  const fu = getMatchFollowup(demand.id, supply.id);
  const fuOpts = ["open", "suggested", "called", "rejected", "done"]
    .map(
      (s) =>
        `<option value="${s}"${s === fu ? " selected" : ""}>${FOLLOWUP_LABELS[s]}</option>`
    )
    .join("");

  const typeLabel =
    type === "landlord"
      ? "ملک / مالک"
      : type === "sale"
        ? "فروشی"
        : type === "tenant"
          ? "مستأجر"
          : type === "buyer"
            ? "خریدار"
            : type;

  const area = data.area ? `${Number(data.area).toLocaleString("fa-IR")} متر` : "";
  const rooms = data.rooms ? `${Number(data.rooms).toLocaleString("fa-IR")} خواب` : "";
  const meta = [area, rooms].filter(Boolean).join(" · ");

  return `
  <article class="file-card card-summary md-card match-suggestion-card" data-demand-id="${escapeHtml(demand.id)}" data-supply-id="${escapeHtml(supply.id)}" data-followup="${escapeHtml(fu)}">
    <div class="card-type-stripe" aria-hidden="true"></div>
    <div class="match-score-bar">
      <span class="match-score ${scoreClassOf(match.score)}">${formatScorePct(match.score)}</span>
      ${diffText ? `<span class="match-diff">${escapeHtml(diffText)}</span>` : ""}
      <div class="match-breakdown">${breakdownForMatch(match)}</div>
    </div>
    <div class="card-top">
      <div class="card-top-main">
        <div class="card-type">${escapeHtml(typeLabel)}</div>
        <div class="card-title">${name}</div>
      </div>
      <div class="card-top-badges">
        ${code ? `<div class="file-code-badge">کد ${code}</div>` : ""}
      </div>
    </div>
    <div class="card-price-block"><div class="card-price-row"><span class="card-price-value">${money}</span></div></div>
    <div class="card-info">
      <div class="info-item">
        <div class="info-label">موقعیت</div>
        <div class="info-value">${loc}</div>
      </div>
      ${
        meta
          ? `<div class="info-item"><div class="info-label">مشخصات</div><div class="info-value">${meta}</div></div>`
          : ""
      }
    </div>
    <div class="match-side-actions card-match-actions">
      ${
        phone
          ? `<button type="button" class="match-call-btn" data-phone="${escapeHtml(phone)}">تماس</button>`
          : ""
      }
      <button type="button" class="match-open-btn" data-file-id="${escapeHtml(file.id)}">جزئیات</button>
      <label class="match-followup-label">
        <select class="match-followup-select" data-demand-id="${escapeHtml(demand.id)}" data-supply-id="${escapeHtml(supply.id)}" title="وضعیت پیگیری">
          ${fuOpts}
        </select>
      </label>
    </div>
  </article>`;
}

export function renderMatchGroup(demand, matches) {
  if (!matches || !matches.length) return "";
  const sample = matches[0];
  const isRent = sample.mode === "rent" || sample.mode === "rent-direct";
  const demandRole = isRent ? "مستأجر / تقاضا" : "خریدار / تقاضا";
  // اگر از سمت ملک باز شده باشد، demand همان متقاضی است
  const dName = escapeHtml(getFileName(demand));
  const dLoc = escapeHtml(getFileLocation(demand) || "—");
  const dPhone = getFilePhone(demand) || "";
  const dCode = demand.code != null ? escapeHtml(String(demand.code)) : "";
  const budgetHtml = moneyHtmlForMatch(sample, "demand");
  const best = matches[0].score;
  const count = matches.length;
  const rows = matches.map(renderMatchSuggestionCard).join("");

  return `
  <section class="match-group-card" data-demand-id="${escapeHtml(demand.id)}">
    <header class="match-group-head file-card card-summary">
      <div class="match-group-head-main">
        <div class="match-role">${demandRole}</div>
        <div class="match-name">${dName}${dCode ? ` <span class="match-code">#${dCode}</span>` : ""}</div>
        <div class="match-meta">📍 ${dLoc}</div>
        <div class="match-money">${budgetHtml}</div>
      </div>
      <div class="match-group-head-side">
        <span class="match-score ${scoreClassOf(best)}">${formatScorePct(best)}</span>
        <span class="match-count-badge">${count.toLocaleString("fa-IR")} پیشنهاد</span>
        <div class="match-side-actions">
          ${
            dPhone
              ? `<button type="button" class="match-call-btn" data-phone="${escapeHtml(dPhone)}" data-role="demand">تماس</button>`
              : ""
          }
          <button type="button" class="match-open-btn" data-file-id="${escapeHtml(demand.id)}">جزئیات</button>
        </div>
      </div>
    </header>
    <div class="match-group-label">پیشنهادهای مناسب (≥ ۷۰٪)</div>
    <div class="match-group-rows match-card-grid">
      ${rows}
    </div>
  </section>`;
}

/** گروه‌بندی بر اساس demand (مستأجر / خریدار) */
const MAX_SUGGESTIONS_PER_CARD = 8;
/** فقط پیشنهادهای با امتیاز ۷۰٪ به بالا نمایش داده می‌شوند */
const MIN_SCORE_TO_SHOW = 70;

export function groupMatchesByDemand(matches) {
  const map = new Map();
  for (const m of matches || []) {
    if (!m || m.score < MIN_SCORE_TO_SHOW) continue;
    const id = m.demand?.id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, { demand: m.demand, items: [] });
    map.get(id).items.push(m);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => b.score - a.score || Math.abs(a.diffPct || 0) - Math.abs(b.diffPct || 0));
    if (g.items.length > MAX_SUGGESTIONS_PER_CARD) {
      g.items = g.items.slice(0, MAX_SUGGESTIONS_PER_CARD);
    }
  }
  groups.sort((a, b) => (b.items[0]?.score || 0) - (a.items[0]?.score || 0));
  return groups;
}


export function renderMatchList(matches, opts = {}) {
  const statusFilter = opts.statusFilter || "all";
  /**
   * perspective:
   * - "auto" / undefined: گروه‌بندی بر اساس متقاضی (مرور همه)
   * - "from-demand": فقط کارت‌های ملک/فروشی (از روی مستأجر/خریدار)
   * - "from-supply": فقط کارت‌های مستأجر/خریدار (از روی مالک/فروشی)
   */
  const perspective = opts.perspective || "auto";
  let list = matches || [];
  if (statusFilter && statusFilter !== "all") {
    list = list.filter((m) => {
      const st = getMatchFollowup(m.demand.id, m.supply.id);
      if (statusFilter === "open") return st === "open";
      return st === statusFilter;
    });
  }
  list = list.filter((m) => m && m.score >= MIN_SCORE_TO_SHOW);
  list.sort((a, b) => b.score - a.score || Math.abs(a.diffPct || 0) - Math.abs(b.diffPct || 0));

  if (!list.length) {
    return `<p class="match-empty">پیشنهادی با امتیاز بالای ۷۰٪ پیدا نشد. فیلتر امکانات یا وضعیت پیگیری را عوض کنید.</p>`;
  }

  // از روی یک فایل خاص: فقط طرف مقابل (خلاصه در عنوان مودال است)
  if (perspective === "from-demand" || perspective === "from-supply") {
    const capped = list.slice(0, MAX_SUGGESTIONS_PER_CARD);
    const showSide = perspective === "from-demand" ? "supply" : "demand";
    const cards = capped.map((m) => renderMatchSuggestionCard(m, showSide)).join("");
    return `<div class="match-card-grid">${cards}</div>`;
  }

  // مرور همه: گروه بر اساس متقاضی
  const groups = groupMatchesByDemand(list);
  if (!groups.length) {
    return `<p class="match-empty">پیشنهادی با امتیاز بالای ۷۰٪ پیدا نشد.</p>`;
  }
  return groups.map((g) => renderMatchGroup(g.demand, g.items)).join("");
}

/** سازگاری با کد قدیمی */
export function renderMatchCard(match) {
  return renderMatchGroup(match.demand, [match]);
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

/**
 * تطبیق فقط برای یک فایل مشخص
 * @returns {{ matches: array, defaultTab: string, title: string, tabs: string[] }}
 */
export function getMatchesForFile(file, opts = {}) {
  if (!file || !file.id) {
    return { matches: [], defaultTab: "rent", title: "تطبیق", tabs: ["rent", "rent-direct", "sale"] };
  }
  const type = file.type || "sale";
  const name = getFileName(file);
  const code = file.code != null ? `#${file.code}` : "";

  if (type === "tenant") {
    const tab = opts.tab === "rent-direct" ? "rent-direct" : "rent";
    const matches =
      tab === "rent-direct"
        ? matchTenantToLandlordsDirect(file, opts)
        : matchTenantToLandlords(file, opts);
    return {
      matches,
      defaultTab: tab,
      title: `ملک مناسب برای ${name} ${code}`.trim(),
      tabs: ["rent", "rent-direct"],
      focusRole: "tenant"
    };
  }
  if (type === "landlord") {
    const tab = opts.tab === "rent-direct" ? "rent-direct" : "rent";
    // از سمت ملک: همه مستأجرها را بگیر و فقط جفت‌هایی که supply همین ملک است
    let matches;
    if (tab === "rent-direct") {
      const tenants = getActiveFiles().filter(
        (f) => f.type === "tenant" && f.status !== "done" && f.status !== "archived"
      );
      matches = [];
      for (const t of tenants) {
        for (const m of matchTenantToLandlordsDirect(t, opts)) {
          if (m.supply?.id === file.id) matches.push(m);
        }
      }
    } else {
      matches = matchLandlordToTenants(file, opts);
    }
    matches.sort((a, b) => b.score - a.score);
    return {
      matches,
      defaultTab: tab,
      title: `مستأجر مناسب برای ${name} ${code}`.trim(),
      tabs: ["rent", "rent-direct"],
      focusRole: "landlord"
    };
  }
  if (type === "buyer") {
    const matches = matchBuyerToSales(file, opts);
    return {
      matches,
      defaultTab: "sale",
      title: `ملک فروشی برای ${name} ${code}`.trim(),
      tabs: ["sale"],
      focusRole: "buyer"
    };
  }
  // sale
  const matches = matchSaleToBuyers(file, opts);
  return {
    matches,
    defaultTab: "sale",
    title: `خریدار مناسب برای ${name} ${code}`.trim(),
    tabs: ["sale"],
    focusRole: "sale"
  };
}

export function matchButtonLabel(file) {
  const type = file?.type || "";
  switch (type) {
    case "tenant":
      return "ملک مناسب";
    case "landlord":
      return "مستأجر مناسب";
    case "buyer":
      return "فروشی مناسب";
    case "sale":
      return "خریدار مناسب";
    default:
      return "تطبیق";
  }
}


export function findFileById(id) {
  return state.files.find((f) => f && f.id === id && !isDeleted(f)) || null;
}

// برای جلوگیری از tree-shake اشتباه در برخی باندلرها
export const MATCH_TYPE_LABEL = typeLabel;
