/* =========================================================
   CONFIG
========================================================= */

export const CONFIG = {
  owner: "amlakdot",
  repo: "file",
  branch: "main",
  dataPath: "data/files.json",
  /** نسخه عمومی بدون نام و تلفن */
  publicDataPath: "data/public-files.json",
  /**
   * آدرس مستقیم داده عمومی (اختیاری)
   * اگر خالی باشد از مسیر نسبی و raw گیت‌هاب امتحان می‌شود
   */
  publicDataUrl: "",
  githubApi: "https://api.github.com",
  /** فاصله پایه polling وقتی تب فعال است */
  pollInterval: 3 * 60 * 1000,
  /** حداقل فاصله بین دو pull خودکار */
  minPollGap: 60 * 1000,

  /**
   * آدرس پروکسی CORS برای دریافت آگهی دیوار (Cloudflare Worker)
   */
  divarProxy: "https://divar-proxy.xixtelegram.workers.dev",

  /** چند روز نشست لاگین روی همین دستگاه نگه داشته شود */
  sessionDays: 7
};
