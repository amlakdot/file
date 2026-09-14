/* =========================================================
   CONFIG
========================================================= */

export const CONFIG = {
  owner: "amlakdot",
  repo: "file",
  branch: "main",
  dataPath: "data/files.json",
  githubApi: "https://api.github.com",
  /** فاصله پایه polling وقتی تب فعال است */
  pollInterval: 3 * 60 * 1000,
  /** حداقل فاصله بین دو pull خودکار */
  minPollGap: 60 * 1000,

  /**
   * آدرس پروکسی CORS برای دریافت آگهی دیوار (Cloudflare Worker)
   */
  divarProxy: "https://divar-proxy.xixtelegram.workers.dev"
};
