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
 * امتیاز قیمت ۰–۱ — پیوسته نسبت به فاصله نسبی
 *
 * ایده:
 * - بودجه = قیمت → ۱
 * - بودجه کمی بالاتر از قیمت (تا +۱۰٪) → نزدیک ۱ (توان پرداخت خوب)
 * - بودجه کمتر از قیمت → سریع‌تر جریمه می‌شود
 * - خارج از باند تلرانس → ۰ (فیلتر جداگانه)
 */
function priceScore(budget, ask, tolerance) {
  if (!budget || budget <= 0 || !ask || ask <= 0) return 0;
  const ratio = budget / ask; // >1 یعنی بودجه بیشتر از قیمت
  const tol = Math.max(tolerance || 0.15, 0.01);

  // فاصله نسبی از نقطه ایده‌آل (۱)
  // نقطه شیرین: کمی بالاتر از قیمت (ratio ≈ 1.02)
  const ideal = 1.02;
  let dist;
  if (ratio >= ideal) {
    // مازاد بودجه: جریمه ملایم‌تر
    dist = (ratio - ideal) / (tol * 1.4);
  } else {
    // کمبود بودجه: جریمه تندتر
    dist = (ideal - ratio) / tol;
  }

  if (dist <= 0) return 1;
  if (dist >= 1.5) return 0;
  // منحنی نرم: 1 در مرکز، ~0.55 روی لبه تلرانس
  const s = Math.cos((Math.min(dist, 1) * Math.PI) / 2);
  // بعد از لبه تلرانس تا 1.5 با شیب خطی به صفر
  if (dist <= 1) return Math.max(0, Math.min(1, 0.5 + 0.5 * s));
  return Math.max(0, 0.5 * (1.5 - dist) / 0.5);
}

function withinTolerance(budget, ask, tolerance) {
  if (!budget || !ask) return false;
  const tol = Math.max(tolerance || 0.15, 0);
  // بودجه در بازه [ask*(1-tol), ask*(1+tol*1.35)]
  // کمی فضای بیشتر برای بودجه بالاتر (می‌تواند بخرد/اجاره کند)
  const lo = ask * (1 - tol);
  const hi = ask * (1 + tol * 1.35);
  return budget >= lo && budget <= hi;
}

/**
 * ترکیب وزن‌دار — فقط معیارهایی که داده دارند در مخرج می‌آیند
 * قیمت همیشه هست (پیش‌شرط فیلتر)
 */
function combineScores({ price, location, specs }, mode) {
  // وزن پایه
  const weights =
    mode === "sale"
      ? { price: 0.55, location: 0.25, specs: 0.2 }
      : { price: 0.5, location: 0.3, specs: 0.2 };

  let totalW = weights.price;
  let sum = price * weights.price;

  if (location.hasData) {
    totalW += weights.location;
    sum += location.score * weights.location;
  }
  if (specs.hasData) {
    totalW += weights.specs;
    sum += specs.score * weights.specs;
  }

  if (totalW <= 0) return 0;
  return Math.round((sum / totalW) * 1000) / 10; // یک رقم اعشار برای دقت بیشتر
}

function buildMatchResult({
  mode,
  demand,
  supply,
  budgetFull,
  askFull,
  demandMoney,
  supplyMoney,
  tolerance
}) {
  const pScore = priceScore(budgetFull, askFull, tolerance);
  const lScore = locationScore(demand, supply);
  const aScore = areaRoomsScore(demand, supply);
  const total = combineScores(
    { price: pScore, location: lScore, specs: aScore },
    mode
  );

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
    priceScore: Math.round(pScore * 1000) / 10,
    locationScore: lScore.hasData ? Math.round(lScore.score * 1000) / 10 : null,
    areaScore: aScore.hasData ? Math.round(aScore.score * 1000) / 10 : null
  };
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

    results.push(
      buildMatchResult({
        mode: "rent",
        demand: tenant,
        supply: land,
        budgetFull: tenantMoney.full,
        askFull: lm.full,
        demandMoney: tenantMoney,
        supplyMoney: lm,
        tolerance
      })
    );
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

    results.push(
      buildMatchResult({
        mode: "rent",
        demand: ten,
        supply: landlord,
        budgetFull: tm.full,
        askFull: lm.full,
        demandMoney: tm,
        supplyMoney: lm,
        tolerance
      })
    );
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

    results.push(
      buildMatchResult({
        mode: "sale",
        demand: buyer,
        supply: sale,
        budgetFull: bm.amount,
        askFull: sm.amount,
        demandMoney: bm,
        supplyMoney: sm,
        tolerance
      })
    );
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

    results.push(
      buildMatchResult({
        mode: "sale",
        demand: buyer,
        supply: sale,
        budgetFull: bm.amount,
        askFull: sm.amount,
        demandMoney: bm,
        supplyMoney: sm,
        tolerance
      })
    );
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
 * تطبیق مستقیم رهن و اجاره — بدون تبدیل به رهن کامل
 * هر جزء (رهن، اجاره) جداگانه با تلرانس مقایسه می‌شود.
 */
function componentOk(budgetPart, askPart, tolerance) {
  // اگر هر دو صفر باشند، این جزء را نادیده می‌گیریم
  if ((!budgetPart || budgetPart <= 0) && (!askPart || askPart <= 0)) {
    return { ok: true, skip: true, score: 0 };
  }
  // یکی هست و دیگری نیست → ضعیف ولی حذف مطلق نکن اگر طرف دیگر قوی باشد
  if (!budgetPart || budgetPart <= 0 || !askPart || askPart <= 0) {
    return { ok: true, skip: false, score: 0.15, partial: true };
  }
  if (!withinTolerance(budgetPart, askPart, tolerance)) {
    return { ok: false, skip: false, score: 0 };
  }
  return {
    ok: true,
    skip: false,
    score: priceScore(budgetPart, askPart, tolerance),
    partial: false
  };
}

function buildDirectRentResult(tenant, land, tolerance) {
  const tm = getRentMoney(tenant);
  const lm = getRentMoney(land);

  const dep = componentOk(tm.deposit, lm.deposit, tolerance);
  const ren = componentOk(tm.rent, lm.rent, tolerance);

  // حداقل یکی از دو جزء باید قابل مقایسه باشد
  if (dep.skip && ren.skip) return null;
  // اگر هر دو جزء موجودند و هیچ‌کدام در تلرانس نیست → رد
  if (!dep.skip && !ren.skip && !dep.ok && !ren.ok) return null;
  // اگر فقط یک جزء داریم و خارج تلرانس است → رد
  if (!dep.skip && ren.skip && !dep.ok) return null;
  if (dep.skip && !ren.skip && !ren.ok) return null;

  // امتیاز قیمت ترکیبی از رهن و اجاره
  let priceCombined = 0;
  let w = 0;
  if (!dep.skip) {
    // رهن معمولاً وزن بیشتری دارد
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

  // اگر یکی خارج تلرانس بود ولی دیگری داخل، جریمه
  if (!dep.skip && !dep.ok) priceCombined *= 0.35;
  if (!ren.skip && !ren.ok) priceCombined *= 0.35;

  // فیلتر نرم: امتیاز قیمت ترکیبی خیلی پایین رد شود
  if (priceCombined < 0.2) return null;

  const lScore = locationScore(tenant, land);
  const aScore = areaRoomsScore(tenant, land);
  const total = combineScores(
    { price: priceCombined, location: lScore, specs: aScore },
    "rent"
  );

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
    budgetFull: tm.full, // فقط برای نمایش کمکی
    askFull: lm.full,
    demandMoney: tm,
    supplyMoney: lm,
    diffPct: depDiff != null ? depDiff : rentDiff || 0,
    depositDiffPct: depDiff,
    rentDiffPct: rentDiff,
    priceScore: Math.round(priceCombined * 1000) / 10,
    depositScore: dep.skip ? null : Math.round(dep.score * 1000) / 10,
    rentScore: ren.skip ? null : Math.round(ren.score * 1000) / 10,
    locationScore: lScore.hasData ? Math.round(lScore.score * 1000) / 10 : null,
    areaScore: aScore.hasData ? Math.round(aScore.score * 1000) / 10 : null
  };
}

export function matchTenantToLandlordsDirect(tenant, opts = {}) {
  const tolerance = opts.tolerance ?? getMatchTolerance();
  const tm = getRentMoney(tenant);
  if (!tm.deposit && !tm.rent) return [];

  const landlords = getActiveFiles().filter(
    (f) => f.type === "landlord" && f.status !== "done" && f.status !== "archived"
  );

  const results = [];
  for (const land of landlords) {
    const m = buildDirectRentResult(tenant, land, tolerance);
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
  return score >= 80 ? "high" : score >= 55 ? "mid" : "low";
}

function moneyHtmlForMatch(match, side /* demand|supply */) {
  const isRent = match.mode === "rent" || match.mode === "rent-direct";
  const money = side === "demand" ? match.demandMoney : match.supplyMoney;
  return isRent ? moneyLineRent(money) : moneyLineSale(money);
}

function breakdownForMatch(match) {
  const isDirect = match.mode === "rent-direct";
  const bits = [];
  if (isDirect) {
    if (match.depositScore != null) bits.push(`رهن ${formatScorePct(match.depositScore)}`);
    if (match.rentScore != null) bits.push(`اجاره ${formatScorePct(match.rentScore)}`);
  } else {
    bits.push(`قیمت ${formatScorePct(match.priceScore)}`);
  }
  if (match.locationScore != null) bits.push(`منطقه ${formatScorePct(match.locationScore)}`);
  if (match.areaScore != null) bits.push(`مشخصات ${formatScorePct(match.areaScore)}`);
  return bits.map((t) => `<span class="mb-item">${escapeHtml(t)}</span>`).join("");
}

/** یک ردیف پیشنهاد (ملک/طرف مقابل) داخل کارت گروه */
function renderMatchRow(match) {
  const supply = match.supply;
  const sName = escapeHtml(getFileName(supply));
  const sLoc = escapeHtml(getFileLocation(supply) || "منطقه ثبت نشده");
  const sPhone = getFilePhone(supply) || "";
  const sCode = supply.code != null ? escapeHtml(String(supply.code)) : "—";
  const sSpecs = escapeHtml(sideSpecs(supply));
  const isDirect = match.mode === "rent-direct";
  const isRent = match.mode === "rent" || isDirect;
  const supplyRole = isRent ? "ملک / مالک" : "ملک فروشی";
  const askHtml = moneyHtmlForMatch(match, "supply");
  const diffText = isDirect ? formatDirectDiff(match) : formatDiff(match.diffPct);

  return `
  <div class="match-row" data-supply-id="${escapeHtml(supply.id)}">
    <div class="match-row-top">
      <span class="match-score ${scoreClassOf(match.score)}" title="امتیاز تطبیق">${formatScorePct(match.score)}</span>
      <div class="match-row-title">
        <span class="match-role">${supplyRole}</span>
        <span class="match-name">${sName} <span class="match-code">#${sCode}</span></span>
      </div>
    </div>
    <div class="match-meta">📍 ${sLoc}${sSpecs ? ` · ${sSpecs}` : ""}</div>
    <div class="match-money">${askHtml}</div>
    ${diffText ? `<div class="match-diff-line">${escapeHtml(diffText)}</div>` : ""}
    <div class="match-breakdown">${breakdownForMatch(match)}</div>
    <div class="match-side-actions">
      ${
        sPhone
          ? `<button type="button" class="match-call-btn" data-phone="${escapeHtml(sPhone)}" data-role="supply">تماس</button>`
          : ""
      }
      <button type="button" class="match-open-btn" data-file-id="${escapeHtml(supply.id)}">جزئیات</button>
    </div>
  </div>`;
}

/**
 * کارت گروهی: یک طرف تقاضا + لیست همه پیشنهادهای مناسب
 */
export function renderMatchGroup(demand, matches) {
  if (!matches || !matches.length) return "";
  const sample = matches[0];
  const isRent = sample.mode === "rent" || sample.mode === "rent-direct";
  const demandRole = isRent ? "مستأجر" : "خریدار";
  const dName = escapeHtml(getFileName(demand));
  const dLoc = escapeHtml(getFileLocation(demand) || "منطقه ثبت نشده");
  const dPhone = getFilePhone(demand) || "";
  const dCode = demand.code != null ? escapeHtml(String(demand.code)) : "—";
  const dSpecs = escapeHtml(sideSpecs(demand));
  const budgetHtml = moneyHtmlForMatch(sample, "demand");
  const best = matches[0].score;
  const count = matches.length;

  const rows = matches.map(renderMatchRow).join("");

  return `
  <article class="match-group-card" data-demand-id="${escapeHtml(demand.id)}">
    <header class="match-group-head">
      <div class="match-group-head-main">
        <div class="match-role">${demandRole}</div>
        <div class="match-name">${dName} <span class="match-code">#${dCode}</span></div>
        <div class="match-meta">📍 ${dLoc}${dSpecs ? ` · ${dSpecs}` : ""}</div>
        <div class="match-money">${budgetHtml}</div>
      </div>
      <div class="match-group-head-side">
        <span class="match-score ${scoreClassOf(best)}" title="بهترین امتیاز">${formatScorePct(best)}</span>
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
    <div class="match-group-label">پیشنهادهای مناسب (مرتب‌شده بر اساس امتیاز)</div>
    <div class="match-group-rows">
      ${rows}
    </div>
  </article>`;
}

/** گروه‌بندی بر اساس demand (مستأجر / خریدار) */
export function groupMatchesByDemand(matches) {
  const map = new Map();
  for (const m of matches || []) {
    const id = m.demand?.id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, { demand: m.demand, items: [] });
    map.get(id).items.push(m);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => b.score - a.score || Math.abs(a.diffPct) - Math.abs(b.diffPct));
  }
  // گروه با بهترین امتیاز اول
  groups.sort((a, b) => (b.items[0]?.score || 0) - (a.items[0]?.score || 0));
  return groups;
}

export function renderMatchList(matches) {
  if (!matches || !matches.length) {
    return `<p class="match-empty">پیشنهادی با این فیلتر پیدا نشد. تلرانس قیمت یا نرخ تبدیل را تغییر دهید.</p>`;
  }
  const groups = groupMatchesByDemand(matches);
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

export function findFileById(id) {
  return state.files.find((f) => f && f.id === id && !isDeleted(f)) || null;
}

// برای جلوگیری از tree-shake اشتباه در برخی باندلرها
export const MATCH_TYPE_LABEL = typeLabel;
