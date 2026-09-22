/* =========================================================
   DIVAR IMPORT — orchestration + public API
========================================================= */

import { showToast, appLog } from "./helpers.js";
import { state } from "./state.js";
import { commitFiles } from "./github.js";
import { getFileName, getFilePhone, isDeleted } from "./files.js";

import { extractDivarToken, buildDivarUrl, normalizeDivarUrl } from "./divar-url.js";
import { fetchDivarPost } from "./divar-fetch.js";
import {
  mapDivarPostToFile,
  createStubDivarFile,
  TAG_NEEDS_REVIEW,
  TAG_DIVAR_DELETED,
  TAG_NEEDS_REVIEW_GENERAL
} from "./divar-map.js";

export {
  extractDivarToken,
  buildDivarUrl,
  normalizeDivarUrl
} from "./divar-url.js";

export { fetchDivarPost } from "./divar-fetch.js";

export {
  mapDivarPostToFile,
  createStubDivarFile,
  TAG_NEEDS_REVIEW,
  TAG_DIVAR_DELETED,
  TAG_NEEDS_REVIEW_GENERAL
} from "./divar-map.js";

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

  // لینک موبایل مثل ?ref=android را به فرم تمیز تبدیل کن
  const token = extractDivarToken(url);
  const cleanUrl = normalizeDivarUrl(url);


  if (!token || !cleanUrl) {

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
        cleanUrl
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
        cleanUrl,
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
     ERROR — هیچ کارتی اضافه نشود
     ======================================================= */

  else {
    throw new Error(
      result.error ||
      "دریافت آگهی از دیوار ناموفق بود. دوباره تلاش کنید."
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

