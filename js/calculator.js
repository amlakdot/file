/* =========================================================
   ماشین حساب املاک — رهن/اجاره + کمیسیون
========================================================= */

import { $ } from "./helpers.js";

let mode = "rahntorent";

function formatNumberInput(input) {
  let value = String(input.value || "").replace(/,/g, "");
  if (!value) {
    input.value = "";
    return;
  }
  value = value.replace(/\D/g, "");
  if (!value) {
    input.value = "";
    return;
  }
  input.value = Number(value).toLocaleString("en-US");
}

function getNumber(id) {
  const el = $(id);
  if (!el) return 0;
  return Number(String(el.value || "").replace(/,/g, "")) || 0;
}

function formatMoney(number) {
  return Math.round(Number(number) || 0).toLocaleString("en-US");
}

function switchTab(tabId) {
  document.querySelectorAll(".calc-section").forEach((sec) => {
    sec.classList.toggle("active", sec.id === tabId);
  });
  document.querySelectorAll(".calc-app-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("data-tab") === tabId);
  });
}

function setMode(selectedMode) {
  mode = selectedMode;
  const rahnGroup = $("rahnGroup");
  const rentGroup = $("rentGroup");
  $("rahntoRentBtn")?.classList.toggle("active", mode === "rahntorent");
  $("renttoRahnBtn")?.classList.toggle("active", mode === "renttorahn");
  if (rahnGroup) rahnGroup.style.display = mode === "rahntorent" ? "block" : "none";
  if (rentGroup) rentGroup.style.display = mode === "renttorahn" ? "block" : "none";
  $("resultTab1")?.classList.remove("show");
}

function toggleCommFields() {
  const type = $("commType")?.value || "sale1";
  const isRent = type === "rent";
  if ($("commSaleGroup")) $("commSaleGroup").style.display = isRent ? "none" : "block";
  if ($("commRahnGroup")) $("commRahnGroup").style.display = isRent ? "block" : "none";
  if ($("commRentGroup")) $("commRentGroup").style.display = isRent ? "block" : "none";
  $("resultTab2")?.classList.remove("show");
}

function calculateRahn() {
  const rate = Number($("rate")?.value);
  if (!rate || rate <= 0) {
    alert("لطفاً نرخ تبدیل را وارد کنید.");
    return;
  }

  let result = 0;
  let detail = "";

  if (mode === "rahntorent") {
    const rahn = getNumber("rahn");
    if (!rahn || rahn <= 0) {
      alert("لطفاً مبلغ رهن را وارد کنید.");
      return;
    }
    result = (rahn / 100000000) * (rate * 1000000);
    if ($("resultNumberTab1")) $("resultNumberTab1").textContent = formatMoney(result);
    if ($("resultUnitTab1")) $("resultUnitTab1").textContent = "تومان اجاره ماهانه";
    detail =
      formatMoney(rahn) +
      " تومان رهن، معادل " +
      formatMoney(result) +
      " تومان اجاره است.";
  } else {
    const rent = getNumber("rent");
    if (!rent || rent <= 0) {
      alert("لطفاً مبلغ اجاره را وارد کنید.");
      return;
    }
    result = (rent / (rate * 1000000)) * 100000000;
    if ($("resultNumberTab1")) $("resultNumberTab1").textContent = formatMoney(result);
    if ($("resultUnitTab1")) $("resultUnitTab1").textContent = "تومان رهن";
    detail =
      formatMoney(rent) +
      " تومان اجاره، معادل " +
      formatMoney(result) +
      " تومان رهن است.";
  }

  if ($("resultDetailTab1")) $("resultDetailTab1").textContent = detail;
  $("resultTab1")?.classList.add("show");
  requestAnimationFrame(() => {
    $("resultTab1")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function clearRahn() {
  if ($("rahn")) $("rahn").value = "";
  if ($("rent")) $("rent").value = "";
  $("resultTab1")?.classList.remove("show");
}

function calculateCommission() {
  const type = $("commType")?.value || "sale1";
  let commission = 0;
  let detail = "";
  const taxRate = 0.1;

  if (type === "sale1") {
    const sale = getNumber("commSale");
    if (sale <= 0) {
      alert("لطفاً مبلغ معامله را وارد کنید.");
      return;
    }
    const baseComm = sale * 0.01;
    commission = baseComm * (1 + taxRate);
    detail =
      "محاسبه: ۱٪ از مبلغ کل (" +
      formatMoney(baseComm) +
      " تومان) + ۱۰٪ مالیات بر ارزش افزوده (از هر طرف).";
  } else if (type === "sale2") {
    const sale = getNumber("commSale");
    if (sale <= 0) {
      alert("لطفاً مبلغ معامله را وارد کنید.");
      return;
    }
    const part1 = Math.min(sale, 1000000000) * 0.005;
    const part2 = Math.max(0, sale - 1000000000) * 0.0025;
    const baseComm = part1 + part2;
    commission = baseComm * (1 + taxRate);
    detail =
      "محاسبه پله‌ای (۰.۵٪ برای یک میلیارد اول + ۰.۲۵٪ مازاد) + ۱۰٪ مالیات بر ارزش افزوده (از هر طرف).";
  } else if (type === "rent") {
    const rahn = getNumber("commRahn");
    const rent = getNumber("commRent");
    const baseComm = rent / 4 + rahn * 0.0075;
    commission = baseComm * (1 + taxRate);
    detail =
      "محاسبه: (یک‌چهارم اجاره بها + ۰.۷۵٪ رهن) + ۱۰٪ مالیات بر ارزش افزوده (از هر طرف).";
  }

  if ($("resultNumberTab2")) $("resultNumberTab2").textContent = formatMoney(commission);
  if ($("resultUnitTab2")) $("resultUnitTab2").textContent = "تومان کمیسیون (هر طرف)";
  if ($("resultDetailTab2")) $("resultDetailTab2").textContent = detail;
  $("resultTab2")?.classList.add("show");
  requestAnimationFrame(() => {
    $("resultTab2")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function clearCommission() {
  if ($("commSale")) $("commSale").value = "";
  if ($("commRahn")) $("commRahn").value = "";
  if ($("commRent")) $("commRent").value = "";
  $("resultTab2")?.classList.remove("show");
}

export function openCalculatorModal() {
  $("calculatorModal")?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

export function closeCalculatorModal() {
  $("calculatorModal")?.classList.add("hidden");
  document.body.style.overflow = "";
}

export function setupCalculator() {
  document.querySelectorAll(".calc-app-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.getAttribute("data-tab");
      if (id) switchTab(id);
    });
  });

  $("rahntoRentBtn")?.addEventListener("click", () => setMode("rahntorent"));
  $("renttoRahnBtn")?.addEventListener("click", () => setMode("renttorahn"));
  $("commType")?.addEventListener("change", toggleCommFields);

  ["rahn", "rent", "commSale", "commRahn", "commRent"].forEach((id) => {
    $(id)?.addEventListener("input", (e) => formatNumberInput(e.target));
  });

  $("calcRahnBtn")?.addEventListener("click", calculateRahn);
  $("clearRahnBtn")?.addEventListener("click", clearRahn);
  $("calcCommBtn")?.addEventListener("click", calculateCommission);
  $("clearCommBtn")?.addEventListener("click", clearCommission);

  $("openCalculatorButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    openCalculatorModal();
  });

  $("closeCalculatorButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeCalculatorModal();
  });

  $("calculatorModal")?.querySelector(".modal-backdrop")?.addEventListener("click", () => {
    closeCalculatorModal();
  });

  setMode("rahntorent");
  toggleCommFields();
}
