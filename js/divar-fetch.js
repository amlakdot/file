/* =========================================================
   DIVAR — FETCH via proxy
========================================================= */

import { CONFIG } from "./config.js";
import { appLog } from "./helpers.js";
import { buildDivarUrl } from "./divar-url.js";
import {
  unwrapDivarPayload,
  normalizeDivarPostShape,
  extractPostFromDivarHtml,
  isValidDivarPost
} from "./divar-parse.js";

async function proxyFetchText(proxyBase, targetUrl, accept, timeoutMs = 10000) {
  const url = `${proxyBase}/?url=${encodeURIComponent(targetUrl)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: accept || "*/*"
      },
      mode: "cors",
      cache: "no-store",
      signal: controller.signal
    });
    return res;
  } catch (err) {
    // مرورگرهای جدید: "signal is aborted without reason"
    if (
      err?.name === "AbortError" ||
      /aborted/i.test(String(err?.message || ""))
    ) {
      const e = new Error("TIMEOUT");
      e.name = "AbortError";
      throw e;
    }
    // پروکسی در دسترس نیست / CORS / DNS
    if (
      err?.name === "TypeError" ||
      /Failed to fetch|NetworkError|Load failed/i.test(String(err?.message || ""))
    ) {
      const e = new Error("PROXY_DOWN");
      e.cause = err;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * دریافت از Cloudflare Worker (CONFIG.divarProxy)
 * 1) API JSON دیوار
 * 2) fallback: HTML صفحه آگهی و __PRELOADED_STATE__
 */
async function fetchDivarPostFromBackend(token) {
  const proxyBase = String(CONFIG.divarProxy || "")
    .trim()
    .replace(/\/$/, "");

  if (!proxyBase) {
    appLog("error", "divar", "PROXY_NOT_CONFIGURED");
    throw new Error("PROXY_NOT_CONFIGURED");
  }

  appLog("info", "divar", "شروع دریافت آگهی", { token, proxyBase });

  // فقط یک endpoint اصلی — سریع‌تر از تست چند مسیر پشت‌سرهم
  const apiCandidates = [
    `https://api.divar.ir/v8/posts-v2/web/${encodeURIComponent(token)}`
  ];

  let lastErr = null;
  let sawNotFound = false;

  for (const apiUrl of apiCandidates) {
    try {
      appLog("debug", "network", "درخواست API دیوار", { apiUrl });
      const res = await proxyFetchText(
        proxyBase,
        apiUrl,
        "application/json",
        9000
      );

      if (res.status === 404) {
        sawNotFound = true;
        lastErr = new Error("NOT_FOUND");
        lastErr.notFound = true;
        continue;
      }
      if (res.status === 401) throw new Error("BACKEND_UNAUTHORIZED");
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (res.status === 403) {
        lastErr = new Error("BACKEND_FORBIDDEN");
        continue;
      }
      if (!res.ok) {
        lastErr = new Error(`BACKEND_HTTP_${res.status}`);
        continue;
      }

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        lastErr = new Error("INVALID_JSON");
        continue;
      }

      const post = unwrapDivarPayload(data);
      if (post) {
        appLog("info", "divar", "آگهی از API دریافت شد", { token });
        return normalizeDivarPostShape(post);
      }

      lastErr = new Error("UNRECOGNIZED_RESPONSE");
      appLog("warn", "divar", "پاسخ API قابل تشخیص نبود", { status: res.status });
    } catch (e) {
      appLog("warn", "network", "خطا در درخواست API دیوار", {
        message: e?.message,
        name: e?.name
      });
      if (e?.message === "BACKEND_UNAUTHORIZED" || e?.message === "RATE_LIMIT") {
        throw e;
      }
      if (e?.notFound) {
        sawNotFound = true;
        lastErr = e;
        continue;
      }
      lastErr = e;
    }
  }

  // Fallback: صفحه HTML آگهی (برای موبایل وقتی API کند/قطع است)
  try {
    const pageUrl = `https://divar.ir/v/${encodeURIComponent(token)}`;
    appLog("debug", "network", "fallback HTML دیوار", { pageUrl });
    const res = await proxyFetchText(proxyBase, pageUrl, "text/html", 12000);

    if (res.status === 404) {
      const err = new Error("NOT_FOUND");
      err.notFound = true;
      throw err;
    }

    if (res.ok) {
      const html = await res.text();
      const post = extractPostFromDivarHtml(html);
      if (post) {
        appLog("info", "divar", "آگهی از HTML استخراج شد", { token });
        return post;
      }
      lastErr = new Error("HTML_PARSE_FAILED");
      appLog("warn", "divar", "HTML_PARSE_FAILED");
    } else {
      lastErr = new Error(`HTML_HTTP_${res.status}`);
      appLog("warn", "network", `HTML_HTTP_${res.status}`);
    }
  } catch (e) {
    appLog("error", "network", "خطا در fallback HTML", {
      message: e?.message,
      name: e?.name
    });
    if (e?.notFound) throw e;
    lastErr = e;
  }

  if (sawNotFound && lastErr?.notFound) throw lastErr;
  if (lastErr?.notFound) throw lastErr;
  if (lastErr) {
    appLog("error", "divar", "دریافت آگهی ناموفق", {
      message: lastErr?.message,
      name: lastErr?.name
    });
    throw lastErr;
  }
  throw new Error("BACKEND_HTTP_0");
}


/* =========================================================
   PUBLIC FETCH
   ========================================================= */

export async function fetchDivarPost(
  token
) {

  if (!token) {

    return {
      ok: false,
      deleted: false,
      error:
        "توکن آگهی خالی است."
    };
  }


  try {

    const data =
      await fetchDivarPostFromBackend(
        token
      );


    /*
      پاسخ معتبر باید object باشد.
    */

    if (
      !data ||
      typeof data !== "object"
    ) {

      return {
        ok: false,
        deleted: false,
        error:
          "پاسخ نامعتبر از سرور دیوار."
      };
    }


    return {
      ok: true,
      data,
      deleted: false
    };

  } catch (err) {

    /*
      فقط 404 را حذف‌شده حساب می‌کنیم.
    */

    if (err?.notFound) {

      return {
        ok: false,
        deleted: true,
        error:
          "آگهی در دیوار پیدا نشد (حذف شده یا منقضی)."
      };
    }


    let error =
      "دریافت آگهی از دیوار ناموفق بود.";

    // Abort / timeout (signal is aborted without reason و مشابه)
    if (
      err?.name === "AbortError" ||
      err?.message === "TIMEOUT" ||
      /aborted/i.test(String(err?.message || ""))
    ) {
      error =
        "درخواست منقضی شد یا قطع شد. اتصال اینترنت یا پروکسی دیوار را بررسی کنید و دوباره تلاش کنید.";
    } else {
      switch (err?.message) {
        case "PROXY_NOT_CONFIGURED":
          error =
            "آدرس پروکسی دیوار تنظیم نشده. در js/config.js مقدار divarProxy را پر کنید.";
          break;

        case "PROXY_DOWN":
          error =
            "پروکسی دیوار در دسترس نیست یا قطع است. اتصال اینترنت را چک کنید یا کمی بعد دوباره تلاش کنید. اگر ادامه داشت، وضعیت Worker پروکسی را بررسی کنید.";
          break;

        case "BACKEND_UNAUTHORIZED":
          error = "احراز هویت پروکسی ناموفق است.";
          break;

        case "BACKEND_FORBIDDEN":
          error = "پروکسی اجازه دریافت آگهی دیوار را ندارد.";
          break;

        case "RATE_LIMIT":
          error =
            "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
          break;

        case "INVALID_JSON":
        case "UNRECOGNIZED_RESPONSE":
        case "HTML_PARSE_FAILED":
        case "EMPTY_RESPONSE":
          error =
            "پاسخ دیوار قابل‌خواندن نبود. اتصال یا پروکسی را بررسی کنید.";
          break;

        case "TIMEOUT":
          error =
            "درخواست منقضی شد. اتصال اینترنت یا پروکسی را بررسی کنید.";
          break;

        default:
          if (err?.message && !/aborted/i.test(err.message)) {
            error = `${error} (${err.message})`;
          }
      }
    }


    return {
      ok: false,
      deleted: false,
      error
    };
  }
}

