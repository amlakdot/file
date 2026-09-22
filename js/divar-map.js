/* =========================================================
   DIVAR — MAP to file structure
========================================================= */

import { generateFileId, generateFileCode } from "./helpers.js";
import { state } from "./state.js";
import {
  detectTypeFromCategory,
  detectPropertyType,
  mapAmenity,
  parseDivarResponse
} from "./divar-parse.js";
import { buildDivarUrl } from "./divar-url.js";

export const TAG_NEEDS_REVIEW = "needs-review-from-ad";
export const TAG_DIVAR_DELETED = "divar-deleted";
export const TAG_NEEDS_REVIEW_GENERAL = "needs-review";

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


  /* notes — فقط متن اصلی آگهی، بدون برچسب «دیوار» */
  const notesParts = [];
  if (parsed.description) {
    notesParts.push(String(parsed.description).trim());
  }

  const now =
    new Date().toISOString();

  const displayTitle =
    (parsed.title && String(parsed.title).trim()) || "";

  const file = {

    id: generateFileId(),

    code: generateFileCode(state.files),

    type,

    status: "active",

    followUpDate: null,

    createdAt: now,

    updatedAt: now,

    // نام را خالی می‌گذاریم تا مشاور خودش پر کند؛ عنوان آگهی در divarTitle می‌ماند
    name: "",

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

    notes: "",
    publicNotes: notesParts.join("\n\n"),

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
      displayTitle || "آگهی دیوار",

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


