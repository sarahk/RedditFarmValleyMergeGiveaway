// ==UserScript==
// @name         FarmMergeValley Giveaway Pop-up
// @version      4.12
// @updateURL    https://raw.githubusercontent.com/sarahk/RedditFarmValleyMergeGiveaway/main/RedditFarmValleyMergeGiveaway.user.js
// @downloadURL  https://raw.githubusercontent.com/sarahk/RedditFarmValleyMergeGiveaway/main/RedditFarmValleyMergeGiveaway.user.js
// @match        *://*.reddit.com/r/FarmMergeValley*
// @match        *://*.reddit.com/r/ClubSusan*
// @connect      reddit.com
// @connect      fvm.itamer.com
// @connect      devvit.net
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_info
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @run-at       document-start
// @require      https://fvm.itamer.com/fvm-ui.js?v=1.06
// ==/UserScript==

(function () {
  ("use strict");

  const TWENTY_FOUR_HOURS_S = 86400;
  const FVM_SCRIPT_VERSION = GM_info?.script?.version || "dev";

  // ---------------------------------------------------------------------------
  // 1. STORAGE
  // ---------------------------------------------------------------------------
  const FVM_Storage = {
    async migrate() {
      const keys = ["fvm_user_id", "fvm_last_hourly", "fvm_view"];
      for (const key of keys) {
        const gmVal = await GM.getValue(key);
        if (!gmVal) {
          const lsVal = localStorage.getItem(key);
          if (lsVal) {
            await GM.setValue(key, lsVal);
            console.info(
              `FVM: migrated ${key} from localStorage to GM storage`,
            );
          }
        }
      }
    },
    async get(key) {
      return (await GM.getValue(key)) ?? null;
    },
    async set(key, value) {
      await GM.setValue(key, value);
    },
    async remove(key) {
      await GM.deleteValue(key);
    },
  };

  // ---------------------------------------------------------------------------
  // 2. API
  // ---------------------------------------------------------------------------
  const FVM_API = {
    target: "https://fvm.itamer.com/api.php",
    key: "pum@90Nervous",

    async fetch(options) {
      return new Promise((resolve, reject) => {
        const xhr =
          typeof GM !== "undefined" && GM.xmlHttpRequest
            ? GM.xmlHttpRequest.bind(GM)
            : GM_xmlhttpRequest;

        xhr({
          method: options.method || "GET",
          url: options.url,
          headers: options.headers || {},
          data: options.data || null,
          timeout: 10000,
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              try {
                resolve(JSON.parse(res.responseText));
              } catch {
                resolve(res.responseText);
              }
            } else {
              reject({ status: res.status, text: res.statusText });
            }
          },
          onerror: (err) => reject(err),
          ontimeout: () => reject("Request Timed Out"),
        });
      });
    },

    async sendToServer(action, data = {}, method = "POST") {
      const isGet = method.toUpperCase() === "GET";
      const username = await FVM_Storage.get("fvm_user_id");
      let url = this.target;
      let body = null;
      const headers = { "X-Api-Key": this.key };

      if (isGet) {
        url += `?what=${action}&username=${username}&${new URLSearchParams(data).toString()}`;
      } else {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = new URLSearchParams({
          what: action,
          user: username,
          ...data,
        }).toString();
      }

      return this.fetch({ method, url, headers, data: body });
    },

    async getExternal(url) {
      return this.fetch({
        method: "GET",
        url,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
    },
  };

  // ---------------------------------------------------------------------------
  // 3. IMPORTER
  // ---------------------------------------------------------------------------
  const FVM_Importer = {
    REDDIT_FEED_URL:
      "https://www.reddit.com/r/FarmMergeValley/search.json?q=flair_name%3A%22%F0%9F%8E%81+Raffles%2FGiveaways%22&restrict_sr=1&sort=new&t=month&limit=100",
    REDDIT_SEARCH_URL:
      "https://www.reddit.com/r/FarmMergeValley/search.json?restrict_sr=1&sort=new&t=month&restrict_sr=1&sort=new&limit=50",
    GIVEAWAY_PREFIX: "[Sticker Giveaway]",

    async runInitialImport() {
      console.info("FVM_Importer: Running initial import...");
      await this.getJsonAndSend(this.REDDIT_FEED_URL);
    },

    async runHourlyImport() {
      const lastRun = await FVM_Storage.get("fvm_last_hourly");
      const now = Date.now();
      if (!lastRun || now - parseInt(lastRun) > 3600000) {
        console.info("FVM_Importer: Running hourly keyword import...");
        try {
          const keywords = await FVM_API.sendToServer("keywords", {}, "GET");

          // Backwards compatible: server returns [] or null if another user
          // is already processing (started within last 10 min), or if
          // the global last run was <30 min ago
          if (!Array.isArray(keywords) || keywords.length === 0) {
            console.info(
              "FVM_Importer: No keywords returned (server throttled or in-progress).",
            );
            return;
          }

          for (const kw of keywords) {
            await this.getJsonAndSend(
              this.REDDIT_SEARCH_URL + `&q=${encodeURIComponent(kw)}`,
            );
            console.info(`FVM_Importer: Imported keyword '${kw}'`);
          }

          // Notify server that processing is complete
          await FVM_API.sendToServer(
            "keywords-completed",
            { what: "keywords-completed" },
            "POST",
          );
          console.info("FVM_Importer: Notified server of completion.");

          await FVM_Storage.set("fvm_last_hourly", now.toString());
        } catch (e) {
          console.error("Hourly task failed", e);
        }
      }
    },

    runStaleWinnerCheck() {
      console.info("FVM_Importer: Starting stale winner check...");
      let staleCheckRunning = false;

      setInterval(async () => {
        if (staleCheckRunning) return;
        staleCheckRunning = true;

        try {
          const now = Math.floor(Date.now() / 1000);
          const user = await FVM_Storage.get("fvm_user_id");

          // Collect all eligible post IDs in one pass
          const candidates = [];
          const staleTimers = document.querySelectorAll(
            '.fvm-timer[data-state="expired"][data-checked="false"]',
          );

          for (const el of staleTimers) {
            if (FVM_UI.getRowState(el) === "missed") {
              el.dataset.checked = "true";
              continue;
            }

            // If the user has already visited the post and the save button is showing,
            // they're actively reviewing it — leave it alone
            const row = el.closest(".fvm-raffle-row");
            if (row?.querySelector(".fvm-raffle-ok")) continue;

            const created = parseInt(el.dataset.created);
            const timeSinceExpiry = now - created - TWENTY_FOUR_HOURS_S;
            if (timeSinceExpiry >= 90 && el.dataset.postid) {
              candidates.push({ el, postId: el.dataset.postid });
            }
          }

          if (candidates.length === 0) return;

          // Single batched API call
          const postIds = candidates.map((c) => c.postId);
          console.info(
            "FVM_Importer: Checking stale winners for posts:",
            postIds,
          );
          const results = await FVM_API.sendToServer(
            "winner-checklist",
            {
              what: "winner-checklist",
              post_ids: JSON.stringify(postIds),
            },
            "GET",
          );
          console.info("FVM_Importer: Stale winner check results:", results);
          // results expected as: { [postId]: { winner: "", harvester: N, harvest_tries: N } }
          for (const { el, postId } of candidates) {
            const info = results?.[postId];
            if (!info) continue;

            if (info.winner && info.winner !== "") {
              el.dataset.checked = "true";
              const youWon = info.winner === user;
              FVM_UI.setLinkText(
                el,
                youWon ? `🎉 ${info.winner} 🎉` : `🏆 ${info.winner}`,
              );

              if (!youWon) {
                const row = el.closest(".fvm-raffle-row");
                const link = row?.querySelector(".fvm-raffle-link");
                const btn = FVM_UI.make(
                  "button",
                  {
                    className: "fvm-raffle-ok",
                    dataset: { postid: postId, from: "stale" },
                  },
                  "OK",
                );
                link?.after(btn);
                row?.querySelector("[data-role='notify']")?.remove();
              }
            } else if (
              info &&
              ((info.harvester > 1 && info.harvester < 7) ||
                (info.harvester === 7 && info.harvest_tries >= 3))
            ) {
              el.dataset.checked = "true";
            }
          }
        } catch (err) {
          console.error("[FVM] Stale winner batch check failed:", err);
        } finally {
          staleCheckRunning = false;
        }
      }, 15000);
    },

    async getJsonAndSend(redditUrl) {
      try {
        const json = await FVM_API.getExternal(redditUrl);
        const posts = json?.data?.children || [];
        const minimalData = posts
          .filter((child) => child.data.title?.includes(this.GIVEAWAY_PREFIX))
          .map((child) => {
            const p = child.data;
            const parsed = this.parseTitle(p.title);
            return {
              id: p.name,
              url: p.url,
              title: p.title,
              author: p.author,
              keyword: parsed?.keyword,
              stars: parsed?.stars,
              created_utc: p.created_utc,
              updownvotes: p.score,
            };
          });

        if (minimalData.length > 0) {
          await FVM_API.sendToServer(
            "post",
            { payload: JSON.stringify(minimalData) },
            "POST",
          );
        }
      } catch (e) {
        console.error("getJsonAndSend failed for " + redditUrl, e);
      }
    },

    parseTitle(title) {
      if (!title.startsWith(this.GIVEAWAY_PREFIX)) return null;
      const regex = new RegExp(
        `${this.GIVEAWAY_PREFIX}.*?(\\d+)\\s*Star(s)?\\s+(.+?)\\s+Sticker`,
        "i",
      );
      const match = title.match(regex);
      if (match?.length >= 4) {
        const stars = parseInt(match[1]);
        const keyword = match[3].trim();
        if (stars >= 1 && stars <= 5 && keyword) return { stars, keyword };
      }
      return null;
    },
  };

  // ---------------------------------------------------------------------------
  // 4. EXTRACTOR
  // ---------------------------------------------------------------------------
  const FVM_Extractor = {
    async saveRaffleData(postId = null) {
      const raffleData = await this.fetchRaffleData();
      if (!raffleData?.winner?.name) return "";
      try {
        await FVM_API.sendToServer(
          "winner",
          {
            post_id: this.getPostIdFromUrl(),
            winner: raffleData.winner.name,
            participants: raffleData.participantIds?.length ?? 0,
            owner: raffleData.owner?.name || "",
            sticker_id: raffleData.stickerId,
            end_time: Math.floor((raffleData.stickerbookEndTime ?? 0) / 1000),
          },
          "POST",
        );
        return raffleData.winner.name;
      } catch (e) {
        console.error("FVM_Extractor: Save failed", e);
      }
      return "";
    },

    async fetchRaffleData() {
      const loader = this.findLoader();
      if (!loader) return null;

      const token = loader.getAttribute("webbit-token");
      const template = loader.getAttribute("webviewurltemplate");
      if (!token || !template) return null;

      const origin = new URL(template.split("?")[0]).origin;
      try {
        const data = await FVM_API.fetch({
          method: "GET",
          url: `${origin}/api/posts/getRaffleData`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (data?.winner?.name) return data;

        const claimed = await this.claimRaffle(origin, token);
        if (!claimed?.winnerName) return null;

        const retryData = await FVM_API.fetch({
          method: "GET",
          url: `${origin}/api/posts/getRaffleData`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        return {
          winner: { name: claimed.winnerName },
          owner: retryData?.owner || { name: "" },
          participantIds: retryData?.participantIds || [],
          stickerId: retryData?.stickerId || "",
          stickerbookEndTime: retryData?.stickerbookEndTime || 0,
        };
      } catch (e) {
        console.error("FVM_Extractor: fetchRaffleData failed", e);
        return null;
      }
    },

    async claimRaffle(origin, token) {
      try {
        return await FVM_API.fetch({
          method: "GET",
          url: `${origin}/api/posts/claimRaffle`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } catch (e) {
        console.error("FVM_Extractor: claimRaffle failed", e);
        return null;
      }
    },

    getPostIdFromUrl() {
      const segments = new URL(window.location.href).pathname.split("/");
      return segments[segments.indexOf("comments") + 1];
    },

    findLoader() {
      const selector = "shreddit-devvit-ui-loader";
      const loaders = document.querySelectorAll(selector);
      if (loaders.length > 0) return loaders[loaders.length - 1];

      const containers = document.querySelectorAll("shreddit-post");
      if (containers.length > 0) {
        const lastPost = containers[containers.length - 1];
        if (lastPost.shadowRoot) {
          const found = lastPost.shadowRoot.querySelector(selector);
          if (found) return found;
        }
      }
      return null;
    },
  };

  // ---------------------------------------------------------------------------
  // 5. REDDIT USERNAME HELPER
  // ---------------------------------------------------------------------------
  function getRedditUsername() {
    const oldRedditSpan = document.querySelector(
      'span.user > a[href*="/user/"]',
    );
    if (oldRedditSpan) {
      const name = oldRedditSpan.textContent.trim();
      if (name && name !== "login" && name !== "register") return name;
    }

    const shredditApp = document.querySelector("shreddit-app[user-name]");
    if (shredditApp) {
      const name = shredditApp.getAttribute("user-name");
      if (name) return name;
    }

    const redesignMenu = document.querySelector(
      "#header-user-dropdown-button span:last-child",
    );
    if (redesignMenu) return redesignMenu.textContent.replace("u/", "").trim();

    const userJson = document.getElementById("data");
    if (userJson) {
      try {
        const data = JSON.parse(userJson.textContent);
        if (data.user?.name) return data.user.name;
      } catch (e) {}
    }

    return "";
  }

  // ---------------------------------------------------------------------------
  // 6. FETCH INTERCEPTOR
  // ---------------------------------------------------------------------------
  // function injectInterceptor() {
  //   const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  //   if (win.fvm_interceptor_loaded) return;
  //   win.fvm_interceptor_loaded = true;

  //   const originalFetch = win.fetch;
  //   win.fetch = function (...args) {
  //     const url = args[0] instanceof Request ? args[0].url : String(args[0]);
  //     if (!url.includes("/api/posts/getRaffleData")) {
  //       return originalFetch.apply(this, args); // ← synchronous pass-through, no async wrapper
  //     }
  //     // only your interception path is async
  //     return (async () => {
  //       console.info("[FVM] Intercepting Raffle API...");
  //       const response = await originalFetch.apply(this, args);
  //       response
  //         .clone()
  //         .json()
  //         .then((data) =>
  //           window.dispatchEvent(
  //             new CustomEvent("FVM_API_DATA", { detail: data }),
  //           ),
  //         )
  //         .catch((err) => console.error("[FVM] JSON Parse Error:", err));
  //       return response;
  //     })();
  //   };
  //   console.info("[FVM] Global Fetch Wrapper Active");
  // }

  // ---------------------------------------------------------------------------
  // 7. FVM_UI — loaded from fvm-ui.js via @require
  //    Wire storage, navigation, and API adapter after import
  // ---------------------------------------------------------------------------

  // Override view storage to use GM storage.
  // _getView must be synchronous — we cache the value in localStorage
  // after each set so it's available instantly on next load.
  FVM_UI._getView = () => localStorage.getItem("fvm_view") || "stars";
  FVM_UI._setView = (v) => {
    localStorage.setItem("fvm_view", v); // sync cache for _getView
    FVM_Storage.set("fvm_view", v); // persist to GM storage
  };

  // Override navigation to use Reddit's SPA router
  FVM_UI._navigate = (url) => {
    const routerLink = document.createElement("a");
    routerLink.href = url;
    routerLink.style.display = "none";
    document.body.appendChild(routerLink);
    setTimeout(() => {
      routerLink.click();
      routerLink.remove();
    }, 100);
  };

  // ---------------------------------------------------------------------------
  // 8. BOOTSTRAP
  // ---------------------------------------------------------------------------
  const init = async () => {
    if (!document.body) {
      setTimeout(init, 200);
      return;
    }

    console.info("FVM Startup", FVM_SCRIPT_VERSION);

    await FVM_Storage.migrate();
    //injectInterceptor();

    // Auto-detect Reddit username and store if not already set
    const storedUser = await FVM_Storage.get("fvm_user_id");
    if (!storedUser) {
      const detected = getRedditUsername();
      if (detected) await FVM_Storage.set("fvm_user_id", detected);
    }

    FVM_UI.version = FVM_SCRIPT_VERSION;

    await FVM_UI.init({
      api: {
        sendToServer: (what, params, method) =>
          FVM_API.sendToServer(what, params, method),
        getUser: () => FVM_Storage.get("fvm_user_id"),
        setUser: (val) => FVM_Storage.set("fvm_user_id", val),
        saveRaffleData: (postId) => FVM_Extractor.saveRaffleData(postId),
        fetchRaffleData: (postId) => FVM_Extractor.fetchRaffleData(postId),
      },
      capabilities: {
        liveWinnerCheck: true,
      },
    });

    FVM_Importer.runInitialImport();
    FVM_Importer.runHourlyImport();
    FVM_Importer.runStaleWinnerCheck();
    // track which version is running in case for tracking backwards compatibility or debugging old versions still running in the wild
    void FVM_API.sendToServer(
      "ping-user",
      { what: "ping", script: "userscript", version: FVM_SCRIPT_VERSION },
      "POST",
    );
  };

  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }

  // SPA navigation — refresh popup on route change
  const pushState = history.pushState;
  history.pushState = function () {
    pushState.apply(history, arguments);
    FVM_UI.refreshPopup();
  };
  window.addEventListener("popstate", () => FVM_UI.refreshPopup());
})();
