/* =========================================================
   CRYPTO - رمزنگاری شماره تلفن
   کلید از GitHub Token مشتق می‌شود
========================================================= */

import { state } from "./state.js";

const SALT = new TextEncoder().encode("dot-real-estate-phone-v1");
const IV_LENGTH = 12;

let cachedKey = null;
let cachedToken = null;

/**
 * مشتق‌سازی کلید AES از GitHub Token
 */
async function deriveKey(token) {
  if (cachedKey && cachedToken === token) {
    return cachedKey;
  }

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
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  cachedKey = key;
  cachedToken = token;
  return key;
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

  // اگر از قبل رمز شده باشد دوباره رمز نکن
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

  // ترکیب IV + ciphertext و تبدیل به base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return "enc:" + btoa(String.fromCharCode(...combined));
}

/**
 * رمزگشایی
 */
export async function decryptText(encryptedText) {
  if (!encryptedText) return "";

  // اگر رمز نشده باشد همان را برگردان (سازگاری با داده قدیمی)
  if (!isEncrypted(encryptedText)) {
    return encryptedText;
  }

  if (!state.token) {
    throw new Error("توکن برای رمزگشایی موجود نیست.");
  }

  try {
    const key = await deriveKey(state.token);
    const raw = encryptedText.slice(4); // حذف "enc:"
    const combined = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));

    const iv = combined.slice(0, IV_LENGTH);
    const data = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // اگر با این توکن قابل دیکد نبود، رشته رمزشده را برگردان
    // (مثلاً با توکن دیگری رمز شده)
    console.warn("رمزگشایی شماره تلفن ناموفق بود.");
    return "[رمز شده]";
  }
}

/**
 * تشخیص اینکه مقدار از قبل رمز شده یا نه
 */
export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith("enc:");
}

/**
 * پاک کردن کش کلید (موقع logout)
 */
export function clearCryptoCache() {
  cachedKey = null;
  cachedToken = null;
}

/**
 * رمزنگاری شماره تلفن داخل یک آبجکت فایل (قبل از ذخیره در GitHub)
 */
export async function encryptFilePhone(file) {
  if (!file || typeof file !== "object") return file;

  const result = { ...file };

  if (result.phone) {
    result.phone = await encryptText(result.phone);
  }

  // فیلدهای قدیمی احتمالی
  if (result.propertyPhone) {
    result.propertyPhone = await encryptText(result.propertyPhone);
  }
  if (result.buyerPhone) {
    result.buyerPhone = await encryptText(result.buyerPhone);
  }
  if (result.tenantPhone) {
    result.tenantPhone = await encryptText(result.tenantPhone);
  }

  return result;
}

/**
 * رمزگشایی شماره تلفن داخل یک آبجکت فایل (بعد از خواندن از GitHub)
 */
export async function decryptFilePhone(file) {
  if (!file || typeof file !== "object") return file;

  const result = { ...file };

  if (result.phone) {
    result.phone = await decryptText(result.phone);
  }
  if (result.propertyPhone) {
    result.propertyPhone = await decryptText(result.propertyPhone);
  }
  if (result.buyerPhone) {
    result.buyerPhone = await decryptText(result.buyerPhone);
  }
  if (result.tenantPhone) {
    result.tenantPhone = await decryptText(result.tenantPhone);
  }

  return result;
}

/**
 * رمزگشایی همه فایل‌ها
 */
export async function decryptAllFiles(files) {
  if (!Array.isArray(files)) return [];
  return Promise.all(files.map((f) => decryptFilePhone(f)));
}

/**
 * رمزنگاری همه فایل‌ها (برای ذخیره)
 */
export async function encryptAllFiles(files) {
  if (!Array.isArray(files)) return [];
  return Promise.all(files.map((f) => encryptFilePhone(f)));
}
