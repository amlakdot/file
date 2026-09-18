/* =========================================================
   CRYPTO - رمزنگاری شماره تلفن
   کلید از GitHub Token مشتق می‌شود
========================================================= */

import { state } from "./state.js";

const SALT = new TextEncoder().encode("dot-real-estate-phone-v1");
const IV_LENGTH = 12;
/** تعداد iteration باید با داده‌های ذخیره‌شده سازگار بماند */
const PBKDF2_ITERATIONS = 100000;

let cachedKey = null;
let cachedToken = null;
let derivePromise = null;

function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    const slice = arr.subarray(i, Math.min(i + chunk, arr.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * مشتق‌سازی کلید AES از GitHub Token (با کش)
 */
async function deriveKey(token) {
  if (cachedKey && cachedToken === token) {
    return cachedKey;
  }

  if (derivePromise && cachedToken === token) {
    return derivePromise;
  }

  cachedToken = token;
  derivePromise = (async () => {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(token),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: SALT,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    cachedKey = key;
    return key;
  })();

  try {
    return await derivePromise;
  } finally {
    derivePromise = null;
  }
}

/** پیش‌گرم کردن کلید هنگام ورود تا رمزگشایی بعدی سریع باشد */
export async function warmCryptoKey(token) {
  if (!token) return;
  try {
    await deriveKey(String(token));
  } catch (e) {
    console.warn("warmCryptoKey failed:", e);
  }
}

/**
 * رمزنگاری یک رشته (مثلاً شماره تلفن)
 * خروجی: رشته base64 که شامل IV + ciphertext است
 */
export async function encryptText(plainText) {
  if (!plainText) return "";

  if (!state.token) {
    throw new Error("توکن برای رمزنگاری موجود نیست.");
  }

  if (isEncrypted(plainText)) {
    return plainText;
  }

  const key = await deriveKey(state.token);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(String(plainText));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return "enc:" + bytesToBase64(combined);
}

/**
 * رمزگشایی
 */
export async function decryptText(encryptedText) {
  if (!encryptedText) return "";

  if (!isEncrypted(encryptedText)) {
    return encryptedText;
  }

  if (!state.token) {
    throw new Error("توکن برای رمزگشایی موجود نیست.");
  }

  try {
    const key = await deriveKey(state.token);
    const raw = encryptedText.slice(4);
    const combined = base64ToBytes(raw);

    const iv = combined.slice(0, IV_LENGTH);
    const data = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    console.warn("رمزگشایی شماره تلفن ناموفق بود.");
    return "[رمز شده]";
  }
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith("enc:");
}

export function clearCryptoCache() {
  cachedKey = null;
  cachedToken = null;
  derivePromise = null;
}

const PHONE_FIELDS = [
  "phone",
  "propertyPhone",
  "buyerPhone",
  "tenantPhone",
  "keyHolderPhone"
];

/**
 * رمزنگاری شماره تلفن داخل یک آبجکت فایل (قبل از ذخیره در GitHub)
 */
export async function encryptFilePhone(file) {
  if (!file || typeof file !== "object") return file;

  const result = { ...file };
  await Promise.all(
    PHONE_FIELDS.map(async (field) => {
      if (result[field]) {
        result[field] = await encryptText(result[field]);
      }
    })
  );
  return result;
}

/**
 * رمزگشایی شماره تلفن داخل یک آبجکت فایل (بعد از خواندن از GitHub)
 */
export async function decryptFilePhone(file) {
  if (!file || typeof file !== "object") return file;

  const result = { ...file };
  await Promise.all(
    PHONE_FIELDS.map(async (field) => {
      if (result[field]) {
        result[field] = await decryptText(result[field]);
      }
    })
  );
  return result;
}

/**
 * رمزگشایی همه فایل‌ها (موازی)
 */
export async function decryptAllFiles(files) {
  if (!Array.isArray(files)) return [];
  // کلید یک‌بار مشتق شود
  if (state.token) {
    await deriveKey(state.token);
  }
  return Promise.all(files.map((f) => decryptFilePhone(f)));
}

/**
 * رمزنگاری همه فایل‌ها (برای ذخیره)
 */
export async function encryptAllFiles(files) {
  if (!Array.isArray(files)) return [];
  if (state.token) {
    await deriveKey(state.token);
  }
  return Promise.all(files.map((f) => encryptFilePhone(f)));
}
