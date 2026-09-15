/* =========================================================
   DIVAR IMPORT
   دریافت آگهی از لینک دیوار و تبدیل به ساختار فایل املاک
   ========================================================= */

import {
  generateFileId,
  generateFileCode,
  showToast,
  toEnglishDigits
} from "./helpers.js";
import { state } from "./state.js";
import { commitFiles } from "./github.js";
import { getFileName, getFilePhone, isDeleted } from "./files.js";
import { CONFIG } from "./config.js";

const TAG_NEEDS_REVIEW = "needs-review-from-ad";
const TAG_DIVAR_DELETED = "divar-deleted";
const TAG_NEEDS_REVIEW_GENERAL = "needs-review";


/* =========================================================
   TOKEN
   ========================================================= */

/**
 * استخراج توکن آگهی از لینک دیوار
 *
 * پشتیبانی:
 * https://divar.ir/v/slug-name/TOKEN
 * https://divar.ir/v/TOKEN
 * TOKEN
 */
export function extractDivarToken(url) {
  if (!url) return null;

  const s = String(url).trim();

  // فقط token
  if (/^[A-Za-z0-9_-]{5,40}$/.test(s)) {
    return s;
  }

  try {
    const u = new URL(s);

    if (!u.hostname.toLowerCase().endsWith("divar.ir")) {
      return null;
    }

    const parts = u.pathname
      .split("/")
      .filter(Boolean);

    const vIndex = parts.findIndex(
      part => part.toLowerCase() === "v"
    );

    if (vIndex === -1) {
      return null;
    }

    const afterV = parts.slice(vIndex + 1);

    if (!afterV.length) {
      return null;
    }

    /*
      دیوار ممکن است:

      /v/TOKEN
      /v/slug/TOKEN

      داشته باشد.

      آخرین بخش بعد از /v/ را token در نظر می‌گیریم.
    */
    const token = afterV[afterV.length - 1];

    if (!/^[A-Za-z0-9_-]{5,40}$/.test(token)) {
      return null;
    }

    return token;
  } catch {
    return null;
  }
}


export function buildDivarUrl(token) {
  if (!token) return "";
  return `https://divar.ir/v/${encodeURIComponent(token)}`;
}


/* =========================================================
   NUMBER PARSERS
   ========================================================= */

function parsePersianNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  let s = toEnglishDigits(String(value));

  /*
    اعداد فارسی / انگلیسی
    جداکننده‌ها و واحدها حذف می‌شوند.
  */
  s = s.replace(/[^\d]/g, "");

  if (!s) return 0;

  const n = parseInt(s, 10);

  return Number.isFinite(n) ? n : 0;
}


function parseMoneyValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? Math.trunc(value)
      : 0;
  }

  const s = toEnglishDigits(String(value))
    .replace(/,/g, "")
    .replace(/[^\d]/g, "");

  if (!s) return 0;

  const n = parseInt(s, 10);

  return Number.isFinite(n) ? n : 0;
}


function normalizeRooms(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const s = toEnglishDigits(
    String(value)
  ).trim();

  const map = {
    یک: 1,
    دو: 2,
    سه: 3,
    چهار: 4,
    پنج: 5,
    شش: 6,
    هفت: 7,
    هشت: 8,
    نه: 9,
    ده: 10,
    "بدون اتاق": 0,
    استودیو: 0
  };

  if (map[s] !== undefined) {
    return map[s];
  }

  const n = parseInt(
    s.replace(/[^\d]/g, ""),
    10
  );

  return Number.isFinite(n) ? n : 0;
}


/* =========================================================
   TYPE DETECTION
   ========================================================= */

function detectTypeFromCategory(
  category,
  title,
  description
) {
  const cat = String(category || "").toLowerCase();

  const text = `
    ${title || ""}
    ${description || ""}
  `.toLowerCase();

  if (
    /rent|اجاره|رهن|ودیعه|residential-rent|apartment-rent|house-rent|villa-rent/
      .test(cat) ||
    /اجاره|رهن|ودیعه/.test(text)
  ) {
    return "landlord";
  }

  if (
    /sell|sale|فروش|residential-sell|apartment-sell|house-sell|villa-sell/
      .test(cat) ||
    /فروش/.test(text)
  ) {
    return "sale";
  }

  return "sale";
}


function detectPropertyType(
  category,
  title
) {
  const t = `
    ${category || ""}
    ${title || ""}
  `.toLowerCase();

  if (
    /villa|ویلا|خانه.?ویلا|دربستی|house-/
      .test(t)
  ) {
    return "villa";
  }

  if (
    /office|اداری|دفتر/
      .test(t)
  ) {
    return "office";
  }

  if (
    /commercial|تجاری|مغازه|فروشگاه/
      .test(t)
  ) {
    return "commercial";
  }

  if (
    /land|زمین|قطعه/
      .test(t)
  ) {
    return "land";
  }

  if (
    /garden|باغ/
      .test(t)
  ) {
    return "garden";
  }

  return "apartment";
}


/* =========================================================
   AMENITIES
   ========================================================= */

function mapAmenity(
  title,
  available,
  list
) {
  if (!available) return;

  const t = String(title || "")
    .replace(/\s/g, "");

  const map = {
    پارکینگ: "parking",
    آسانسور: "elevator",
    انباری: "storage",
    بالکن: "balcony",
    تراس: "terrace",
    حیاط: "yard",
    استخر: "pool",
    جکوزی: "jacuzzi",
    روف: "roof",
    لابی: "lobby",
    نگهبان: "guard",
    پکیج: "package",
    کولر: "cooler",
    گرمایشازکف: "floor-heating",
    کابینت: "cabinet",
    کمد: "closet"
  };

  for (const [fa, en] of Object.entries(map)) {
    if (
      t.includes(fa) &&
      !list.includes(en)
    ) {
      list.push(en);
    }
  }
}


/* =========================================================
   GENERIC VALUE HELPERS
   ========================================================= */

function getString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return "";
}


function firstString(...values) {
  for (const value of values) {
    const s = getString(value);

    if (s) return s;
  }

  return "";
}


function getObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}


/* =========================================================
   DESCRIPTION EXTRACTION
   ========================================================= */

function extractDescription(raw) {
  const sections = Array.isArray(raw?.sections)
    ? raw.sections
    : [];

  const parts = [];

  for (const section of sections) {
    const sectionName = String(
      section?.section_name || ""
    ).toUpperCase();

    if (
      sectionName !== "DESCRIPTION"
    ) {
      continue;
    }

    const widgets = Array.isArray(
      section?.widgets
    )
      ? section.widgets
      : [];

    for (const widget of widgets) {
      const data = getObject(
        widget?.data
      );

      const text = firstString(
        data.text,
        data.description,
        data.value
      );

      if (
        text &&
        text !== "توضیحات" &&
        !parts.includes(text)
      ) {
        parts.push(text);
      }
    }
  }

  /*
    fallback برای ساختارهای احتمالی دیگر
  */
  const candidates = [
    raw?.description,
    raw?.post?.description,
    raw?.data?.description
  ];

  for (const value of candidates) {
    const text = getString(value);

    if (
      text &&
      !parts.includes(text)
    ) {
      parts.push(text);
    }
  }

  return parts.join("\n\n").trim();
}


/* =========================================================
   IMAGE EXTRACTION
   ========================================================= */

function extractImages(raw) {
  const images = [];

  function add(value) {
    if (!value) return;

    let url = "";

    if (typeof value === "string") {
      url = value;
    } else if (typeof value === "object") {
      url = firstString(
        value.url,
        value.image_url,
        value.src,
        value.original,
        value.original_url
      );
    }

    if (
      url &&
      /^https?:\/\//i.test(url) &&
      !images.includes(url)
    ) {
      images.push(url);
    }
  }


  /*
    ساختارهای رایج
  */

  const directLists = [
    raw?.images,
    raw?.photos,
    raw?.post?.images,
    raw?.data?.images
  ];

  for (const list of directLists) {
    if (Array.isArray(list)) {
      list.forEach(add);
    }
  }


  /*
    sections
  */

  const sections = Array.isArray(raw?.sections)
    ? raw.sections
    : [];

  for (const section of sections) {
    const widgets = Array.isArray(
      section?.widgets
    )
      ? section.widgets
      : [];

    for (const widget of widgets) {
      const data = getObject(
        widget?.data
      );

      const candidates = [
        data.images,
        data.photos,
        data.items
      ];

      for (const list of candidates) {
        if (Array.isArray(list)) {
          list.forEach(add);
        }
      }

      add(data.image);
      add(data.image_url);
      add(data.url);
    }
  }

  return images;
}


/* =========================================================
   PARSE DIVAR RESPONSE
   ========================================================= */

/**
 * پاسخ API دیوار را به ساختار داخلی پروژه تبدیل می‌کند.
 *
 * توجه:
 * این parser عمداً چند fallback دارد تا اگر بخشی
 * از ساختار پاسخ تغییر کرد، کل importer از کار نیفتد.
 */
function parseDivarResponse(raw) {
  const result = {
    title: "",
    description: "",
    subtitle: "",
    category: "",
    city: "",
    district: "",
    area: 0,
    year: 0,
    rooms: 0,
    unitFloor: "",
    totalFloors: 0,
    credit: 0,
    rent: 0,
    salePrice: 0,
    amenities: [],
    attributes: {},
    images: [],
    raw: raw
  };


  const webengage = getObject(
    raw?.webengage
  );

  const seo = getObject(
    raw?.seo
  );

  const webInfo = getObject(
    seo?.web_info
  );

  const cityObj = getObject(
    raw?.city
  );


  /* -------------------------
     عنوان
  ------------------------- */

  result.title = firstString(
    raw?.title,
    raw?.post?.title,
    raw?.data?.title,
    webInfo?.title,
    raw?.share?.title,
    webengage?.title
  );


  /* -------------------------
     دسته
  ------------------------- */

  result.category = firstString(
    raw?.category,
    raw?.category_slug,
    raw?.post?.category,
    raw?.data?.category,
    webengage?.category,
    webengage?.cat_3,
    webengage?.cat_2,
    webInfo?.category_slug_persian
  );


  /* -------------------------
     شهر
  ------------------------- */

  result.city = firstString(
    raw?.city_name,
    raw?.post?.city,
    raw?.data?.city,
    cityObj?.name,
    webInfo?.city_persian,
    webengage?.city
  );


  /* -------------------------
     محدوده
  ------------------------- */

  result.district = firstString(
    raw?.district,
    raw?.district_name,
    raw?.post?.district,
    raw?.data?.district,
    webengage?.district
  );


  /* -------------------------
     توضیحات
  ------------------------- */

  result.description =
    extractDescription(raw);


  /* -------------------------
     قیمت‌های اولیه
  ------------------------- */

  result.credit =
    parseMoneyValue(
      firstString(
        raw?.credit,
        raw?.data?.credit,
        webengage?.credit
      )
    );

  result.rent =
    parseMoneyValue(
      firstString(
        raw?.rent,
        raw?.data?.rent,
        webengage?.rent
      )
    );

  result.salePrice =
    parseMoneyValue(
      firstString(
        raw?.price,
        raw?.sale_price,
        raw?.data?.price,
        webengage?.price
      )
    );


  /* =======================================================
     SECTIONS
     ======================================================= */

  const sections = Array.isArray(
    raw?.sections
  )
    ? raw.sections
    : [];


  for (const section of sections) {

    const sectionName = String(
      section?.section_name || ""
    ).toUpperCase();

    const widgets = Array.isArray(
      section?.widgets
    )
      ? section.widgets
      : [];


    for (const widget of widgets) {

      const wt = String(
        widget?.widget_type || ""
      ).toUpperCase();

      const d = getObject(
        widget?.data
      );


      /* -------------------------
         TITLE
      ------------------------- */

      if (
        sectionName === "TITLE"
      ) {

        if (
          d.title &&
          !result.title
        ) {
          result.title =
            getString(d.title);
        }

        if (
          wt === "EXPANDABLE_SECTION" &&
          d.title
        ) {
          result.subtitle =
            getString(d.title);
        }
      }


      /* -------------------------
         DESCRIPTION
      ------------------------- */

      if (
        sectionName === "DESCRIPTION"
      ) {

        const text = firstString(
          d.text,
          d.description,
          d.value
        );

        if (
          text &&
          text !== "توضیحات" &&
          !result.description
        ) {
          result.description = text;
        }
      }


      /* -------------------------
         LIST DATA
      ------------------------- */

      if (
        sectionName === "LIST_DATA"
      ) {

        if (
          wt === "GROUP_INFO_ROW" &&
          Array.isArray(d.items)
        ) {

          for (
            const item of d.items
          ) {

            const title =
              getString(item?.title);

            const value =
              item?.value;

            if (!title) continue;

            result.attributes[title] =
              value;


            if (
              title.includes("متراژ")
            ) {
              result.area =
                parsePersianNumber(value);
            }


            else if (
              title.includes("ساخت") ||
              title.includes("سال")
            ) {
              result.year =
                parsePersianNumber(value);
            }


            else if (
              title.includes("اتاق") ||
              title.includes("خواب")
            ) {
              result.rooms =
                normalizeRooms(value);
            }
          }
        }


        if (
          wt === "UNEXPANDABLE_ROW" &&
          d.title
        ) {

          const title =
            String(d.title).trim();

          const value =
            d.value;

          result.attributes[title] =
            value;


          /* طبقه */

          if (
            title.includes("طبقه") &&
            value
          ) {

            const floorStr =
              toEnglishDigits(
                String(value)
              );

            const parts =
              floorStr.match(
                /(\d+)\s*(?:از|\/)\s*(\d+)/
              );

            if (parts) {

              result.unitFloor =
                parts[1];

              result.totalFloors =
                parseInt(
                  parts[2],
                  10
                ) || 0;

            } else if (
              /همکف/.test(
                floorStr
              )
            ) {

              result.unitFloor =
                "ground";

            } else if (
              /زیرزمین/.test(
                floorStr
              )
            ) {

              result.unitFloor =
                "basement";

            } else {

              const n =
                parsePersianNumber(
                  floorStr
                );

              if (n) {
                result.unitFloor =
                  String(n);
              }
            }
          }


          /* ودیعه */

          if (
            title.includes("ودیعه") ||
            title.includes("رهن")
          ) {

            const money =
              parseMoneyValue(
                value
              );

            if (money > 0) {
              result.credit =
                money;
            }
          }


          /* اجاره */

          if (
            title.includes("اجاره")
          ) {

            if (
              /رایگان/.test(
                String(value)
              )
            ) {

              result.rent = 0;

            } else {

              const money =
                parseMoneyValue(
                  value
                );

              if (money > 0) {
                result.rent =
                  money;
              }
            }
          }


          /* قیمت فروش */

          if (
            title.includes("قیمت") &&
            !title.includes("اجاره") &&
            !title.includes("ودیعه")
          ) {

            const money =
              parseMoneyValue(
                value
              );

            if (money > 0) {
              result.salePrice =
                money;
            }
          }
        }


        /* -------------------------
           RENT SLIDER
        ------------------------- */

        if (
          wt === "RENT_SLIDER"
        ) {

          if (d.credit) {

            const credit =
              parseMoneyValue(
                d.credit.value
              ) ||
              parseMoneyValue(
                d.credit.transformed_value
              );

            if (credit > 0) {
              result.credit =
                credit;
            }
          }


          if (d.rent) {

            const rent =
              parseMoneyValue(
                d.rent.value
              ) ||
              parseMoneyValue(
                d.rent.transformed_value
              );

            if (
              d.rent.value !== undefined ||
              d.rent.transformed_value !== undefined
            ) {
              result.rent =
                rent;
            }
          }
        }


        /* -------------------------
           FEATURES
        ------------------------- */

        if (
          wt === "GROUP_FEATURE_ROW" &&
          Array.isArray(d.items)
        ) {

          for (
            const item of d.items
          ) {

            const title =
              getString(item?.title);

            const available =
              item?.available === true;

            if (!title) continue;

            mapAmenity(
              title,
              available,
              result.amenities
            );

            result.attributes[title] =
              available;
          }
        }
      }
    }
  }


  /* =======================================================
     FALLBACK ATTRIBUTES
     ======================================================= */

  if (!result.area) {
    result.area =
      parsePersianNumber(
        raw?.area ||
        raw?.post?.area ||
        raw?.data?.area
      );
  }


  if (!result.year) {
    result.year =
      parsePersianNumber(
        raw?.year ||
        raw?.construction_year ||
        raw?.post?.year ||
        raw?.data?.year
      );
  }


  if (!result.rooms) {
    result.rooms =
      normalizeRooms(
        raw?.rooms ||
        raw?.room_count ||
        raw?.post?.rooms ||
        raw?.data?.rooms
      );
  }


  /* =======================================================
     SUBTITLE → DISTRICT
     ======================================================= */

  if (
    result.subtitle &&
    !result.district
  ) {

    const locMatch =
      result.subtitle.match(
        /در\s+(.+)$/
      );

    if (locMatch) {
      result.district =
        locMatch[1].trim();
    }
  }


  /* =======================================================
     IMAGES
     ======================================================= */

  result.images =
    extractImages(raw);


  return result;
}


/* =========================================================
   MAP → FILE
   ========================================================= */

export function mapDivarPostToFile(
  raw,
  token,
  originalUrl
) {

  const parsed =
    parseDivarResponse(raw);


  const type =
    detectTypeFromCategory(
      parsed.category,
      parsed.title,
      parsed.description
    );


  const propertyType =
    detectPropertyType(
      parsed.category,
      parsed.title
    );


  /* location */

  let location = "";

  if (
    parsed.district &&
    parsed.city
  ) {

    if (
      parsed.district.includes(
        parsed.city
      )
    ) {

      location =
        parsed.district;

    } else {

      location =
        `${parsed.city}، ${parsed.district}`;
    }

  } else {

    location =
      parsed.district ||
      parsed.city ||
      "";
  }


  /* notes */

  const notesParts = [];

  if (parsed.title) {
    notesParts.push(
      `عنوان دیوار: ${parsed.title}`
    );
  }

  if (parsed.description) {
    notesParts.push(
      parsed.description
    );
  }


  const now =
    new Date().toISOString();

  const displayTitle =
    parsed.title ||
    "آگهی دیوار";


  const file = {

    id: generateFileId(),

    code: generateFileCode(state.files),

    type,

    status: "active",

    followUpDate: null,

    createdAt: now,

    updatedAt: now,

    name:
      `آگهی دیوار: ${displayTitle}`,

    phone: "",

    propertyType,

    area:
      parsed.area || 0,

    rooms:
      parsed.rooms || 0,

    year:
      parsed.year || 0,

    location,

    plaque: "",

    unitFloor:
      parsed.unitFloor || "",

    totalFloors:
      parsed.totalFloors || 0,

    keyHolder: "",

    keyHolderName: "",

    keyHolderPhone: "",

    condition: "",

    occupancy: "",

    salePrice:
      type === "sale"
        ? parsed.salePrice || 0
        : 0,

    currentDeposit: 0,

    currentRent: 0,

    suggestedDeposit:
      type === "landlord"
        ? parsed.credit || 0
        : 0,

    suggestedRent:
      type === "landlord"
        ? parsed.rent || 0
        : 0,

    capital: 0,

    buyerNotes: "",

    tenantDeposit: 0,

    tenantRent: 0,

    familyStatus: "",

    familySize: 0,

    tenantNotes: "",

    notes:
      notesParts.join("\n\n"),

    amenities:
      [...new Set(
        parsed.amenities
      )],

    source: "divar",

    divarToken:
      token,

    divarUrl:
      originalUrl ||
      buildDivarUrl(token),

    divarTitle:
      displayTitle,

    /*
      اطلاعات اضافی آگهی
      بدون اینکه ساختار اصلی فایل‌های تو خراب شود.
    */
    divarDescription:
      parsed.description || "",

    divarImages:
      parsed.images || [],

    divarAttributes:
      parsed.attributes || {},

    tags: [
      TAG_NEEDS_REVIEW
    ]
  };


  return file;
}


/* =========================================================
   DIVAR API
   ========================================================= */

/*
  مهم:

  این تابع نباید API Key دیوار را داخل فرانت‌اند داشته باشد.

  فرانت‌اند:
      /api/divar/TOKEN

  Backend / Cloudflare Worker:
      https://open-api.divar.ir/v1/open-platform/finder/post/TOKEN

  و Backend باید x-api-key را خودش اضافه کند.
*/

/**
 * دریافت از Cloudflare Worker (CONFIG.divarProxy)
 * Worker باید ?url= را به api.divar.ir پروکسی کند.
 */
async function fetchDivarPostFromBackend(token) {
  const proxyBase = String(CONFIG.divarProxy || "")
    .trim()
    .replace(/\/$/, "");

  if (!proxyBase) {
    throw new Error(
      "PROXY_NOT_CONFIGURED"
    );
  }

  const apiUrl = `https://api.divar.ir/v8/posts-v2/web/${encodeURIComponent(token)}`;
  const url = `${proxyBase}/?url=${encodeURIComponent(apiUrl)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    mode: "cors"
  });

  if (res.status === 404) {
    const err = new Error("NOT_FOUND");
    err.notFound = true;
    throw err;
  }

  if (res.status === 401) {
    throw new Error("BACKEND_UNAUTHORIZED");
  }

  if (res.status === 403) {
    throw new Error("BACKEND_FORBIDDEN");
  }

  if (res.status === 429) {
    throw new Error("RATE_LIMIT");
  }

  if (!res.ok) {
    throw new Error(`BACKEND_HTTP_${res.status}`);
  }

  const data = await res.json();

  // پاسخ مستقیم دیوار یا { data: ... }
  if (
    data &&
    data.data &&
    typeof data.data === "object" &&
    !Array.isArray(data.data) &&
    !(data.sections || data.webengage || data.seo)
  ) {
    return data.data;
  }

  return data;
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


    switch (err?.message) {

      case "PROXY_NOT_CONFIGURED":
        error =
          "آدرس پروکسی دیوار تنظیم نشده. در js/config.js مقدار divarProxy را پر کنید.";
        break;

      case "BACKEND_UNAUTHORIZED":
        error =
          "احراز هویت پروکسی ناموفق است.";
        break;

      case "BACKEND_FORBIDDEN":
        error =
          "پروکسی اجازه دریافت آگهی دیوار را ندارد.";
        break;

      case "RATE_LIMIT":
        error =
          "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
        break;

      default:

        if (
          err?.message
        ) {
          error =
            `${error} ${err.message}`;
        }
    }


    return {
      ok: false,
      deleted: false,
      error
    };
  }
}


/* =========================================================
   STUB FILE
   ========================================================= */

export function createStubDivarFile(
  token,
  originalUrl,
  typeHint = "landlord"
) {

  const now =
    new Date().toISOString();


  return {

    id:
      generateFileId(),

    code:
      generateFileCode(state.files),

    type:
      typeHint === "sale"
        ? "sale"
        : "landlord",

    status:
      "active",

    followUpDate:
      null,

    createdAt:
      now,

    updatedAt:
      now,

    name:
      "آگهی دیوار (نیاز به بررسی)",

    phone:
      "",

    propertyType:
      "apartment",

    area:
      0,

    rooms:
      0,

    year:
      0,

    location:
      "",

    plaque:
      "",

    unitFloor:
      "",

    totalFloors:
      0,

    keyHolder:
      "",

    keyHolderName:
      "",

    keyHolderPhone:
      "",

    condition:
      "",

    occupancy:
      "",

    salePrice:
      0,

    currentDeposit:
      0,

    currentRent:
      0,

    suggestedDeposit:
      0,

    suggestedRent:
      0,

    capital:
      0,

    buyerNotes:
      "",

    tenantDeposit:
      0,

    tenantRent:
      0,

    familyStatus:
      "",

    familySize:
      0,

    tenantNotes:
      "",

    notes:
      `لینک دیوار:\n${
        originalUrl ||
        buildDivarUrl(token)
      }`,

    amenities:
      [],

    source:
      "divar",

    divarToken:
      token,

    divarUrl:
      originalUrl ||
      buildDivarUrl(token),

    divarTitle:
      "",

    divarDescription:
      "",

    divarImages:
      [],

    divarAttributes:
      {},

    tags:
      [TAG_NEEDS_REVIEW]
  };
}


/* =========================================================
   REVIEW / TAGS
   ========================================================= */

export function fileNeedsReviewFromAd(
  file
) {

  if (
    !file ||
    file.source !== "divar"
  ) {
    return false;
  }


  const tags =
    Array.isArray(file.tags)
      ? file.tags
      : [];


  if (
    tags.includes(
      TAG_NEEDS_REVIEW
    ) ||
    tags.includes(
      TAG_NEEDS_REVIEW_GENERAL
    )
  ) {
    return true;
  }


  const name =
    (getFileName(file) || "")
      .trim();

  const phone =
    (getFilePhone(file) || "")
      .trim();


  const isPlaceholderName =
    !name ||
    name === "بدون نام" ||
    name.startsWith(
      "آگهی دیوار"
    );


  return (
    isPlaceholderName ||
    !phone
  );
}


export function fileIsDivarDeleted(
  file
) {

  if (!file) return false;

  const tags =
    Array.isArray(file.tags)
      ? file.tags
      : [];

  return tags.includes(
    TAG_DIVAR_DELETED
  );
}


export function refreshDivarTags(
  file
) {

  if (
    !file ||
    file.source !== "divar"
  ) {
    return file;
  }


  const tags =
    new Set(
      Array.isArray(file.tags)
        ? file.tags
        : []
    );


  const name =
    (file.name || "")
      .trim();

  const phone =
    (file.phone || "")
      .trim();


  const hasRealContact =
    name &&
    name !== "بدون نام" &&
    !name.startsWith(
      "آگهی دیوار"
    ) &&
    phone &&
    phone.length >= 10;


  if (hasRealContact) {

    tags.delete(
      TAG_NEEDS_REVIEW
    );

    tags.delete(
      TAG_NEEDS_REVIEW_GENERAL
    );

  } else {

    tags.add(
      TAG_NEEDS_REVIEW
    );
  }


  file.tags =
    [...tags];

  return file;
}


export function markDivarDeleted(
  file
) {

  if (!file) return file;


  const tags =
    new Set(
      Array.isArray(file.tags)
        ? file.tags
        : []
    );


  tags.add(
    TAG_DIVAR_DELETED
  );

  tags.add(
    TAG_NEEDS_REVIEW_GENERAL
  );


  file.tags =
    [...tags];

  file.updatedAt =
    new Date().toISOString();


  return file;
}


/* =========================================================
   DUPLICATE
   ========================================================= */

export function findDuplicateDivarToken(
  token,
  excludeId = null
) {

  if (!token) return null;


  return (
    state.files.find(
      file => {

        if (
          !file ||
          isDeleted(file)
        ) {
          return false;
        }

        if (
          excludeId &&
          file.id === excludeId
        ) {
          return false;
        }

        return (
          file.divarToken === token
        );
      }
    ) || null
  );
}


/* =========================================================
   IMPORT
   ========================================================= */

export async function importFromDivarUrl(
  url,
  typeHint = null
) {

  const token =
    extractDivarToken(url);


  if (!token) {

    throw new Error(
      "لینک دیوار معتبر نیست.\n\n" +
      "نمونه:\n" +
      "https://divar.ir/v/TOKEN\n" +
      "https://divar.ir/v/عنوان/TOKEN"
    );
  }


  /* -------------------------
     duplicate
  ------------------------- */

  const dup =
    findDuplicateDivarToken(
      token
    );


  if (dup) {

    throw new Error(
      `این آگهی قبلاً با عنوان «${getFileName(dup)}» ثبت شده است.`
    );
  }


  /* -------------------------
     دریافت
  ------------------------- */

  const result =
    await fetchDivarPost(
      token
    );


  let file;


  /* =======================================================
     SUCCESS
     ======================================================= */

  if (result.ok) {

    file =
      mapDivarPostToFile(
        result.data,
        token,
        String(url).trim()
      );


    /*
      اگر از UI نوع مشخص شده باشد،
      انتخاب کاربر بر تشخیص خودکار اولویت دارد.
    */

    if (
      typeHint === "sale" ||
      typeHint === "landlord"
    ) {

      file.type =
        typeHint;


      if (
        typeHint === "sale"
      ) {

        /*
          قیمت فروش واقعی را نگه می‌داریم.
        */

        file.salePrice =
          file.salePrice || 0;

        file.suggestedDeposit =
          0;

        file.suggestedRent =
          0;
      }
    }


    /*
      اگر اطلاعات تماس دیوار در پاسخ عمومی
      وجود نداشته باشد، نیاز به بررسی بماند.
    */

    refreshDivarTags(
      file
    );


    showToast(
      "آگهی دیوار با موفقیت دریافت شد.",
      "success"
    );
  }


  /* =======================================================
     NOT FOUND / DELETED
     ======================================================= */

  else if (result.deleted) {

    file =
      createStubDivarFile(
        token,
        String(url).trim(),
        typeHint || "landlord"
      );


    markDivarDeleted(
      file
    );


    showToast(
      "آگهی در دیوار پیدا نشد — با تگ «حذف‌شده از دیوار» ذخیره شد.",
      "warning"
    );
  }


  /* =======================================================
     ERROR
     ======================================================= */

  else {

    file =
      createStubDivarFile(
        token,
        String(url).trim(),
        typeHint || "landlord"
      );


    /*
      اینجا آگهی را حذف‌شده نمی‌کنیم.
      چون ممکن است مشکل موقت API یا Backend باشد.
    */

    file.tags = [
      ...new Set([
        ...(file.tags || []),
        TAG_NEEDS_REVIEW_GENERAL
      ])
    ];


    showToast(
      result.error ||
      "دریافت خودکار کامل نشد. لینک ذخیره شد؛ مشخصات را دستی تکمیل کنید.",
      "warning"
    );
  }


  /* =======================================================
     SAVE
     ======================================================= */

  const newFiles = [
    ...state.files,
    file
  ];


  const success =
    await commitFiles(
      newFiles,
      `Import Divar ad ${token}`
    );


  if (!success) {

    throw new Error(
      "ذخیره روی GitHub ناموفق بود."
    );
  }


  state.files =
    newFiles;


  return file;
}


/* =========================================================
   EXPORTS
   ========================================================= */

export {
  TAG_NEEDS_REVIEW,
  TAG_DIVAR_DELETED,
  TAG_NEEDS_REVIEW_GENERAL
};
