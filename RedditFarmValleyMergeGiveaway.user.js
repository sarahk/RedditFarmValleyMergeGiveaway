// ==UserScript==
// @name         FarmMergeValley Giveaway Pop-up
// @version      3.29
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
// @run-at       document-start
// ==/UserScript==

(function () {
  ("use strict");

  const TWENTY_FOUR_HOURS_S = 86400;
  let slowTimer = null;
  let fastTimer = null;

  const FVM_Emojis = {
    trophy: "🏆",
    flag: "🏁",
    play: "▶️",
    next: "⏭️",
    one: "1️⃣",
    two: "2️⃣",
    three: "3️⃣",
    four: "4️⃣",
    five: "5️⃣",
    top: "🔝",
    zap: "⚡",
    hourglass: "⌛",
    redflag: "🚩",
  };

  const FVM_Colours = {
    orange: "#f7a01d",
    darkOrange: "#E2852E",
    blue: "#0079d3",
    yellow: "#fff3cd",
    black: "#444444",
    gray: "#666666",
    silver: "#f0f0f0",
    silverDark: "#d8d8d8",
    coral: "#d14d28",
    red: "#c2410c",
    garnet: "#8b0000",
    purple: "#5a5a8a",
  };

  const FVM_SCRIPT_VERSION = GM_info?.script?.version || "dev";

  // --- 1. API MODULE ---
  const FVM_API = {
    target: "https://fvm.itamer.com/api.php",
    key: "pum@90Nervous",

    // This is the ES2017 version of your original gmXhrPromise
    async fetch(options) {
      //console.log("FVM_API.fetch called with options:", options);
      return new Promise((resolve, reject) => {
        // Use the underscore version if available for better compatibility
        const xhr =
          typeof GM_xmlhttpRequest !== "undefined"
            ? GM_xmlhttpRequest
            : GM.xmlHttpRequest;

        //console.log("FVM_API.fetch called with options:", options);

        xhr({
          method: options.method || "GET",
          url: options.url,
          headers: options.headers || {},
          data: options.data || null,
          timeout: 10000, // 10 second timeout
          // Add this inside the onload of FVM_API.fetch
          onload: (res) => {
            //console.log(`Server Response (${res.status}):`, res.responseText); // This will tell you WHY the server rejected it
            if (res.status >= 200 && res.status < 300) {
              try {
                resolve(JSON.parse(res.responseText));
                // console.log([
                //   "FVM_API.fetch response parsed as JSON:",
                //   res.responseText,
                //   options,
                // ]);
              } catch (e) {
                console.warn(
                  "FVM_API.fetch JSON parse error:",
                  e,
                  res.responseText,
                );
                resolve(res.responseText);
              }
            } else {
              console.error("FVM_API.fetch error:", res.status, res.statusText);
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
      let url = this.target;
      let body = null;
      let headers = { "X-Api-Key": this.key };
      const username = localStorage.getItem("fvm_user_id");

      if (isGet) {
        url += `?what=${action}&username=${username}&${new URLSearchParams(data).toString()}`;
      } else {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        //body = new URLSearchParams({ what: action, ...data }).toString();

        body = new URLSearchParams({
          what: action,
          username: username, // Adds the ID
          ...data,
        }).toString();
      }
      //console.log(["FVM_API.sendToServer:", method, url]);
      //console.log(["FVM_API.sendToServer:", body]);

      return this.fetch({ method, url, headers, data: body });
    },

    async getExternal(url) {
      return this.fetch({
        method: "GET",
        url: url,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
    },
  };
  // --- 2. Import MODULE (Requirements 1 & 2) ---
  const FVM_Importer = {
    REDDIT_FEED_URL:
      "https://www.reddit.com/r/FarmMergeValley/search.json?q=flair_name%3A%22%F0%9F%8E%81+Raffles%2FGiveaways%22&restrict_sr=1&sort=new&t=month&limit=100",
    REDDIT_SEARCH_URL:
      "https://www.reddit.com/r/FarmMergeValley/search.json?restrict_sr=1&sort=new&t=month&restrict_sr=1&sort=new&limit=50",
    //const USER_AGENT = "browser:FarmMergeValley-Sticker-App:v2.4 (by /u/itamer)";
    GIVEAWAY_PREFIX: "[Sticker Giveaway]",

    async runInitialImport() {
      console.info("FVM_Importer: Running initial 25-post import...");
      await this.getJsonAndSend(this.REDDIT_FEED_URL);
    },

    async runHourlyImport() {
      const lastRun = localStorage.getItem("fvm_last_hourly");
      const now = Date.now();

      if (!lastRun || now - parseInt(lastRun) > 3600000) {
        console.info("FVM_Importer: Running hourly keyword import...");
        try {
          const keywords = await FVM_API.sendToServer("keywords", {}, "GET");
          if (Array.isArray(keywords)) {
            for (const kw of keywords) {
              const searchUrl =
                this.REDDIT_SEARCH_URL + `&q=${encodeURIComponent(kw)}`;
              await this.getJsonAndSend(searchUrl);
              console.info(`FVM_Importer: Imported keyword '${kw}'`);
            }
          }
          localStorage.setItem("fvm_last_hourly", now.toString());
        } catch (e) {
          console.error("Hourly task failed", e);
        }
      }
    },

    // Add inside FVM_Importer object
    runStaleWinnerCheck() {
      setInterval(async () => {
        const now = Math.floor(Date.now() / 1000);
        // Find all timer elements that are expired by more than 120s and not yet "checked"
        const staleTimers = document.querySelectorAll(
          '.fvm-timer[data-state="expired"][data-checked="false"]',
        );

        for (const el of staleTimers) {
          const created = parseInt(el.dataset.created);

          const rowState = FVM_UI.getRowState(el);

          if (rowState === "missed") {
            el.dataset.checked = "true"; // Mark as checked to avoid future processing
            continue;
          }

          // Check if expired exactly or more than 120 seconds ago
          const timeSinceExpiry = now - created - TWENTY_FOUR_HOURS_S;
          console.log(
            `Checking stale raffle: postId=${el.dataset.postid}, timeSinceExpiry=${timeSinceExpiry}s`,
          );
          if (timeSinceExpiry >= 130) {
            console.log(
              `Raffle expired over 2 minutes ago, checking for winner...`,
              el.dataset,
            );

            const postId = el.dataset.postid;
            if (!postId) continue;

            try {
              // Fetch fresh info for this specific post
              const info = await FVM_API.sendToServer(
                "post",
                { post_id: postId },
                "GET",
              );

              if (info && info.winner && info.winner !== "") {
                console.log(`Winner found for ${postId} on stale check:`, info);
                // Mark as checked so we don't fetch again
                el.dataset.checked = "true";

                // Find the parent cell to update the display
                const youWon =
                  info.winner === localStorage.getItem("fvm_user_id");
                FVM_UI.setLinkText(
                  el,
                  youWon ? FVM_UI.labels.youWon : `Winner: ${info.winner}`,
                );

                const row = el.closest(".fvm-raffle-row");
                if (!youWon) {
                  const link = row?.querySelector(".fvm-raffle-link");
                  const btn = FVM_UI.make(
                    "button",
                    {
                      className: "fvm-raffle-ok",
                      dataset: { postid: postId, from: "stale" },
                    },
                    "OK",
                  );
                  link.after(btn);
                }

                const notify = row.querySelector("[data-role='notify']");
                if (notify) {
                  notify.remove();
                }

                // todo: change the modal to call the post info API rather than loading up the dataset.
              } else {
                if (
                  info &&
                  ((info.harvester > 1 && info.harvester < 7) ||
                    (info.harvester === 7 && info.harvest_tries >= 3))
                ) {
                  //there's a problem, it's not going to be retested, so mark it as checked to avoid wasting time.
                  el.dataset.checked = "true";
                  console.log(
                    `[FVM] Harvest failed for ${postId}, no further retries.`,
                  );
                } else {
                  console.log(
                    `[FVM] No winner yet for ${postId}, will retry next cycle.`,
                  );
                }
              }
            } catch (err) {
              console.error(`[FVM] Stale check failed for ${postId}:`, err);
            }
          }
        }
      }, 15000); // Run every 15 seconds
    },

    async getJsonAndSend(redditUrl) {
      try {
        const json = await FVM_API.getExternal(redditUrl);

        const posts = json?.data?.children || [];
        const minimalData = posts
          .filter((child) => {
            // 1. Only allow posts where the title starts with or contains your prefix
            const title = child.data.title || "";
            return title.includes(this.GIVEAWAY_PREFIX);
          })
          .map((child) => {
            // 2. This only runs for the filtered posts
            const p = child.data;
            const parsed = this.parseTitle(p.title);

            return {
              id: p.name,
              url: p.url,
              title: p.title,
              author: p.author,
              keyword: parsed.keyword,
              stars: parsed.stars,
              created_utc: p.created_utc,
            };
          });

        if (minimalData.length > 0) {
          //console.log(`FVM_Importer: Sending ${minimalData.length} posts to server...`);
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
    /**
     * Parses the title to extract Priority (Stars) and Keyword.
     */
    parseTitle(title) {
      if (!title.startsWith(this.GIVEAWAY_PREFIX)) return null;
      const regex = new RegExp(
        `${this.GIVEAWAY_PREFIX}.*?(\\d+)\\s*Star(s)?\\s+(.+?)\\s+Sticker`,
        "i",
      );
      const match = title.match(regex);

      if (match && match.length >= 4) {
        const stars = parseInt(match[1]);
        const keyword = match[3].trim();
        if (stars >= 1 && stars <= 5 && keyword) {
          return { stars, keyword };
        }
      }
      return null;
    },
  };

  // --- 3. DATA EXTRACTOR (Requirement 3) ---
  const FVM_Extractor = {
    async saveRaffleData(postId = null) {
      console.log("FVM_Extractor: Checking page for raffle data...");
      const loader = this.findLoader();
      if (!loader) return;

      const token = loader.getAttribute("webbit-token");
      const template = loader.getAttribute("webviewurltemplate");
      let raffleData = null;

      if (token && template) {
        try {
          const origin = new URL(template.split("?")[0]).origin;
          raffleData = await FVM_API.fetch({
            method: "GET",
            url: `${origin}/api/posts/getRaffleData`,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          });
          //console.log("FVM_Extractor: Raffle data retrieved:", raffleData);
          if (!raffleData || raffleData.winner.name.length === 0) return "";
        } catch (e) {
          console.error("FVM_Extractor: getRaffleData failed", e);
        }

        try {
          console.log(`FVM_Extractor: Winner found: ${raffleData.winner.name}`);
          await FVM_API.sendToServer(
            "winner",
            {
              post_id: this.getPostIdFromUrl(),
              winner: raffleData.winner.name,
              participants: raffleData.participantIds
                ? raffleData.participantIds.length
                : 0,
              owner: raffleData.owner.name,
            },
            "POST",
          );
          return raffleData.winner.name;
        } catch (e) {
          console.error("FVM_Extractor: Save failed", e);
        }
      }
      return "";
    },

    async fetchRaffleData(postId = null) {
      const loader = this.findLoader();
      if (!loader) return null;

      const token = loader.getAttribute("webbit-token");
      const template = loader.getAttribute("webviewurltemplate");
      if (!token || !template) return null;

      const origin = new URL(template.split("?")[0]).origin;
      const data = await FVM_API.fetch({
        method: "GET",
        url: `${origin}/api/posts/getRaffleData`,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      return data || null;
    },

    getPostIdFromUrl() {
      const currentUrl = window.location.href;
      const url = new URL(currentUrl);
      const segments = url.pathname.split("/");
      // In this specific path, 'comments' is at index 3, and the ID is at index 4
      const postId = segments[segments.indexOf("comments") + 1];

      //console.log("FVM_Extractor getPostIdFromUrl", postId);
      return postId;
    },

    findLoaderx() {
      const loaders = document.querySelectorAll("shreddit-devvit-ui-loader");
      return loaders.length > 0 ? loaders[loaders.length - 1] : null;
    },

    findLoader() {
      // 1. Get all loaders on the page
      const selector = "shreddit-devvit-ui-loader";
      const loaders = document.querySelectorAll(selector);

      if (loaders.length > 0) {
        // 2. Return the LAST one found, as SPAs typically append new
        // content at the end of the container or after previous posts
        return loaders[loaders.length - 1];
      }

      // 3. If not found in main DOM, check Shadow Roots of recent post containers
      const containers = document.querySelectorAll("shreddit-post");
      if (containers.length > 0) {
        // Check the last post container specifically
        const lastPost = containers[containers.length - 1];
        if (lastPost.shadowRoot) {
          const found = lastPost.shadowRoot.querySelector(selector);
          if (found) return found;
        }
      }

      return null;
    },
  };
  // --- 2. UI MODULE ---
  const FVM_UI = {
    init() {
      console.info("FVM_UI: Initializing...");
      this.injectStyles();
      this.drawPopup();
      this.refreshPopup();
      this.startGlobalTimer();
    },

    info_svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 12" width="8" height="12" aria-hidden="true"><rect width="8" height="12" rx="2" fill="currentColor"/><rect x="3" y="2" width="2" height="2" fill="#fff"/><rect x="3" y="5" width="2" height="5" fill="#fff"/></svg>`,

    injectStyles() {
      if (document.getElementById("fvm-style")) return;
      const style = document.createElement("style");
      style.id = "fvm-style";
      style.textContent = `
        #fvm-popup { z-index: 10000; display: block; position: fixed; bottom: 20px; right: 20px; width: 300px; background: #f9f9f9; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); font-family: Arial, sans-serif; display:none; }
        #fvm-header { background: ${FVM_Colours.darkOrange}; color: white; padding: 8px 10px; display: flex; justify-content: space-between; border-radius: 8px 8px 0 0; font-weight: bold; }
        #fvm-body { padding: 10px; max-height: 400px; overflow-y: auto; color: #333; }
        .fvm-input { width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        .fvm-btn-main { background: ${FVM_Colours.darkOrange}; color: white; border: none; padding: 8px; width: 100%; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .got-it-btn { background: #5a5a8a; color: white; border: none; padding: 1px 8px; border-radius: 4px; cursor: pointer; font-size: 0.7em; }
        .got-it-btn:hover { background-color:${FVM_Colours.darkOrange}; color:white ; cursor: pointer;}
        .got-it-pill {transition: all 0.2s ease;background: ${FVM_Colours.silver}; color: #666; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; cursor: pointer; border: 1px solid #ccc;}
        .got-it-pill:hover { background-color: #ffcccc !important; border-color: ${FVM_Colours.red} !important; color:${FVM_Colours.garnet} !important;}
        .fvm-timer {font-size: 0.85em; margin-left: 8px; font-weight: normal; }
        .fvm_modal {position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 2px solid #333; border-radius: .5em; z-index: 10001; /* Higher than popup */ box-shadow: 0 4px 15px rgba(0,0,0,0.3);}
        .fvm-raffle-row { padding: 4px 0; font-size: 0.85em; display: flex; justify-content: space-between; align-items: center;    border-bottom: 1px solid #f0f0f0; }
        .fvm-raffle-row:last-child {border-bottom: none; }
        .fvm-raffle-ok {color: ${FVM_Colours.blue};  border-color: ${FVM_Colours.silver}; padding: 0 10px; font-size: smaller;}
        .fvm-gotits-container {display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 20px; padding: 5px; background: #fafafa; border-radius: 4px;}
        #fvm-close {background:none; border:none; color: ${FVM_Colours.darkOrange}; cursor:pointer; font-size:18px;}
        #fvm-footer {padding: 10px; border-top: 1px solid #eee; display: flex; gap: 8px;align-items: center;}
        #fvm-footer a, #fvm-footer span { background-color: transparent !important; line-height: 1; /* Prevents extra vertical space that can cause background bleeding */ display: inline-flex; align-items: center; mix-blend-mode: multiply; }
        #fvm-star-level-header {margin: 10px 0 5px 0; font-weight: bold; color: #444; border-left: 4px solid ${FVM_Colours.darkOrange}; padding-left: 8px;}
        .fvm-raffle-container {margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; background: #fff; overflow: hidden;}
        .fvm-raffle-header {display:flex; justify-content:space-between; background:#f8f8f8; padding: 4px 10px; align-items: center; border-bottom: 1px solid #eee;}
        .fvm-timer {font-size: 0.85em; color: #666; font-family: monospace;}
        #fvm-modal-content {font-family: 'Courier New', Courier, monospace; font-size: 13px; min-width: 250px;}
        .fvm-modal-line { font-family: 'Courier New', Courier, monospace; font-size: 13px;  display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #eee;}
        .fvm-copy-icon {cursor: pointer; font-size: 1.1em; padding: 2px 5px; border-radius: 4px; transition: background 0.2s;}
        .fvm-copy-icon:hover { background: #eee; }
        .fvm-copy-icon:active { transform: scale(0.9); }
.fvm-raffle-link[data-state="new"]{color: ${FVM_Colours.blue} !important;}
.fvm-raffle-link[data-state="entered"]{color: ${FVM_Colours.darkOrange} !important;}
.fvm-raffle-link[data-state="expired"]{color: ${FVM_Colours.blue} !important;}
.fvm-raffle-link[data-state="missed"]{color: ${FVM_Colours.gray} !important;}
.fvm-raffle-link[data-state="checked"]{color: ${FVM_Colours.gray} !important;}
.fvm-raffle-link{text-decoration: none !important;}
.fvm-timer[data-state="expired"]{color: ${FVM_Colours.gray};}
.fvm-timer[data-state="expiring"]{color: ${FVM_Colours.red};}
.fvm-timer[data-state="ok"]{color: ${FVM_Colours.blue};}
.fvm-shadow-sm { box-shadow: 0 .125rem .25rem rgba(0, 0, 0, .075) !important; }
.fvm-shadow    { box-shadow: 0 .5rem 1rem rgba(0, 0, 0, .15) !important; }
.fvm-shadow-lg { box-shadow: 0 1rem 3rem rgba(0, 0, 0, .175) !important; }
.fvm-highlight { background-color: ${FVM_Colours.yellow} !important; }
span[data-role="info-trigger"][data-state="ok"] { color: ${FVM_Colours.purple}; }
span[data-role="info-trigger"][data-state="flagged"] { color: ${FVM_Colours.red}; }
.pl-5 { padding-left: 5px !important; }
.fvm_modal_overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fvm_modal {
  background: #fff;
  padding: 18px;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.25);
  max-width: 320px;
}

      `;

      document.head.appendChild(style);
    },
    labels: {
      youWon: "🎉 You won! Claim! 🎉",
      expired: "• Expired Raffle",
      doneCheck: "• Done, did you win?",
      entered: "• Entered",
      new: "• New Raffle",
      timeExpired: "Expired",
    },

    drawPopup() {
      if (document.getElementById("fvm-popup")) return;
      const div = document.createElement("div");
      div.id = "fvm-popup";
      div.innerHTML = `
        <div id="fvm-header">
          <span style="padding-top: .5em;">🎁 Find Raffles</span>
          <div style="display: flex; align-items: center; gap: 10px;background-color: #f9f9f9; border-radius: 4px;  padding: 0 5px; font-size: 16px;">
            <span id="fvm-jump-expired">${FVM_Emojis.flag}</span>
            <span id="fvm-jump-next">${FVM_Emojis.play}</span>
            <span id="fvm-jump-oldest">${FVM_Emojis.hourglass}</span>
          <button id="fvm-close" title='Close'>×</button>
          </div>
        </div>
        <div id="fvm-body">Loading...</div>
        <div id="fvm-footer">
          <div style="display: flex; flex-direction: column; align-items: center; line-height: 1;">
            <img src="https://fvm.itamer.com/buynzmade.webp" alt="Buy NZ Made" style="height:24px; margin-bottom: 2px;" />
            <span style="font-size: 8px; color: #999; font-family: sans-serif;">${FVM_SCRIPT_VERSION}</span>
          </div>
          <a href="https://www.reddit.com/chat/user_id/itamer" target="_blank" title="Need Help? Chat with me" style="text-decoration: none; padding: 0 5px; border-radius: 4px; background-color: white;">💬</a>
          <button id="fvm-refresh" style="flex:1; cursor:pointer;">Refresh</button>
          <button id="fvm-clear" style="flex:1; cursor:pointer;">Logout</button>
        </div>
      `;
      document.body.appendChild(div);

      document.getElementById("fvm-close").onclick = () =>
        (div.style.display = "none");
      document.getElementById("fvm-clear").onclick = () => {
        localStorage.removeItem("fvm_user_id");
        this.refreshPopup();
      };
      document.getElementById("fvm-refresh").onclick = () => {
        FVM_Importer.runInitialImport();
        this.refreshPopup();
      };
      document.getElementById("fvm-jump-expired").onclick = () =>
        this.jumpToRow("fvm-jump-expired", "expired");
      document.getElementById("fvm-jump-next").onclick = () =>
        this.jumpToRow("fvm-jump-next", "new");
      document.getElementById("fvm-jump-oldest").onclick = () =>
        this.jumpToRow("fvm-jump-oldest", "new");
    },

    make(tag, props = {}, ...children) {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(props)) {
        if (k === "style") Object.assign(node.style, v);
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
        else node[k] = v;
      }
      for (const child of children) {
        if (child == null) continue;
        node.append(
          typeof child === "string" ? document.createTextNode(child) : child,
        );
      }
      return node;
    },

    getSecondsRemaining(createdUtc) {
      const expirationTime = createdUtc + TWENTY_FOUR_HOURS_S;
      const currentTime = Math.floor(Date.now() / 1000);

      const seconds = expirationTime - currentTime;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);

      let str = this.labels.timeExpired;
      if (seconds > 0) str = this.getTimeLeftText(hours, minutes, seconds);

      const state =
        seconds < 0
          ? "expired"
          : hours === 0 && minutes <= 15
            ? "expiring"
            : "ok";

      return {
        state: state,
        seconds: seconds,
        minutes: minutes,
        hours: hours,
        text: str,
      };
    },
    getSecondsSinceClose(createdUtc) {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const secondsInDay = 86400;
      let diff = nowInSeconds - createdUtc - secondsInDay;
      if (diff < 0) diff = 0;

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      return {
        days: days,
        hours: hours,
        text: `${days}d ${hours}h ${minutes}m`,
      };
    },

    getTimeLeftText(h, m, seconds) {
      return seconds > 99 ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : `${seconds}s`;
    },

    // New helper to update timer text live
    updateTimers(state) {
      document
        .querySelectorAll(`.fvm-timer[data-state="${state}"]`)
        .forEach((span) => {
          this.updateTimerRow(span);
        });
    },

    updateTimerRow(span, now) {
      const createdUtc = parseInt(span.dataset.created);
      if (!Number.isFinite(createdUtc)) return;
      const timeRemaining = this.getSecondsRemaining(createdUtc);

      span.dataset.state = timeRemaining.state;
      span.textContent = timeRemaining.text;
      if (timeRemaining.state === "expired") {
        const currentState = this.getRowState(span);

        if (currentState === "entered") {
          this.setRowLinkState(span, "expired");
          this.setLinkText(span, this.labels.doneCheck);
        } else {
          this.setRowLinkState(span, "missed");
          this.setLinkText(span, this.labels.expired);
        }
      } //missed
    },

    // finds the link for the current row and sets the anchor text
    setLinkText(obj, txt) {
      const row = obj.closest(".fvm-raffle-row");
      if (!row) return;

      const link = row.querySelector(".fvm-raffle-link");
      if (!link) return;
      link.textContent = txt;
    },

    getRowState(obj) {
      const row = obj.closest(".fvm-raffle-row");
      if (!row) return "";

      return row.dataset.state;
    },

    setRowLinkState(obj, state) {
      //console.log("setRowLinkState", state);
      const row = obj.closest(".fvm-raffle-row");
      if (!row) return;

      row.dataset.state = state;

      const link = row.querySelector(".fvm-raffle-link");
      if (!link) return;

      link.dataset.state = state;
    },

    getTimeLeftState(h, m) {
      return h === 0 && m < 15 ? "expiring" : "ok";
    },

    // update the time left on a raffle every minute
    startGlobalTimer() {
      if (slowTimer) clearInterval(slowTimer);
      slowTimer = setInterval(() => this.updateTimers("ok"), 60000); // Update every minute
      if (fastTimer) clearInterval(fastTimer);
      fastTimer = setInterval(() => this.updateTimers("expiring"), 10000); // Update every 10 seconds
    },

    async refreshPopup() {
      const user = localStorage.getItem("fvm_user_id");
      const body = document.getElementById("fvm-body");
      const defaultName = this.getRedditUsername();
      console.log("[FVM] default Name", defaultName);
      if (!user) {
        body.innerHTML = `
          <p>Enter your username:</p>
          <input type="text" id="fvm-user-in" class="fvm-input" placeholder="Reddit Username" value="${defaultName}">
          <button id="fvm-save-btn" class="fvm-btn-main">Save</button>
        `;
        document.getElementById("fvm-popup").style.display = "block";
        document.getElementById("fvm-save-btn").onclick = () => {
          const val = document.getElementById("fvm-user-in").value.trim();
          if (val) {
            localStorage.setItem("fvm_user_id", val);
            this.refreshPopup();
          }
        };
        body.style.display = "block";
        return;
      }
      body.style.display = "block";
      body.innerHTML = "Updating...";
      try {
        const feed = await FVM_API.sendToServer("feed", { user }, "GET");
        const gotIts = await FVM_API.sendToServer("gotits", { user }, "GET");
        this.render(feed, gotIts);
      } catch (e) {
        console.error("Popup Load Failure:", e); // Log the actual error
        body.innerHTML = "Error loading data: " + e.message;
        document.getElementById("fvm-popup").style.display = "block";
      }
    },

    render(groupedData, gotItData) {
      const body = document.getElementById("fvm-body");
      const user = localStorage.getItem("fvm_user_id");
      const now = Math.floor(Date.now() / 1000);

      if (!groupedData || Object.keys(groupedData).length === 0) {
        body.textContent = "No active raffles found.";
        return;
      }

      const sortedStars = Object.keys(groupedData).sort((a, b) => b - a);
      const wrapper = this.make("div", {});

      sortedStars.forEach((starLevel) => {
        const stickersInLevel = groupedData[starLevel];
        const starCount = "⭐".repeat(parseInt(starLevel));

        // STAR LEVEL HEADER
        const header = this.make(
          "div",
          { id: "fvm-star-level-header" },
          `${starLevel} Star Raffles`,
        );
        wrapper.append(header);

        for (const stickerName in stickersInLevel) {
          let raffles = stickersInLevel[stickerName];
          const safeStickerName = stickerName.replace(/[^a-zA-Z0-9\-_.]/g, "");
          if (!Array.isArray(raffles)) raffles = [raffles];

          const gotItBtn = gotItData?.[starLevel]?.includes(stickerName)
            ? null
            : this.make(
                "button",
                { className: "got-it-btn", dataset: { keyword: stickerName } },
                "Got It!",
              );

          const stickerTitle = this.make(
            "strong",
            {
              style: { color: FVM_Colours.darkOrange, fontSize: "0.8em" },
            },
            `${stickerName.toUpperCase()} ${starCount}`,
          );

          const raffleHeader = this.make(
            "div",
            { className: "fvm-raffle-header" },
            stickerTitle,
            gotItBtn,
          );

          const raffleInner = this.make("div", {
            style: { padding: "2px 8px" },
          });

          raffles.forEach((raffle) => {
            const expires = parseInt(raffle.created_utc) + 86400;
            const timeRemaining = this.getSecondsRemaining(
              parseInt(raffle.created_utc),
            );
            const isExpired = now > expires;
            const raffleId = raffle.id || raffle.post_id;
            const flags = raffle.flags || "";
            const isEntered = raffle.status === "active";

            let label = isEntered ? this.labels.entered : this.labels.new;
            let newState = isEntered ? "entered" : "new";
            let btn = null;

            if (timeRemaining.state === "expired") {
              newState = "expired";
              if (raffle.winner.length === 0) {
                label = this.labels.doneCheck;
              } else {
                if (raffle.winner === user) {
                  label = this.labels.youWon;
                } else {
                  label = `Winner: ${raffle.winner} `;
                  btn = this.make(
                    "button",
                    {
                      className: "fvm-raffle-ok",
                      dataset: { postid: raffleId, from: "render" },
                    },
                    "OK",
                  );
                }
              }
            }

            const link = this.make(
              "a",
              {
                href: raffle.url,
                className: "fvm-raffle-link",
                dataset: {
                  postid: raffleId,
                  status: raffle.status,
                  winner: raffle.winner,
                  state: newState,
                },
              },
              label,
            );

            const timer = this.make(
              "span",
              {
                className: "fvm-timer",
                dataset: {
                  postid: raffleId,
                  state: timeRemaining.state,
                  created: raffle.created_utc,
                  checked: raffle.winner > "" ? "true" : "false",
                },
              },
              timeRemaining.text,
            );

            const infoSpan = this.make("span", {
              className: "pl-5",
              dataset: {
                state:
                  flags.length > 0 || raffle.harvester > 2 ? "flagged" : "ok",
                role: "info-trigger",
                postid: raffleId,
                created: raffle.created_utc,
                winner: raffle.winner,
                winner_by: raffle.winner_by || "",
                author: raffle.author,
                flags: flags,
                entrydate: raffle.entry_date_utc,
                harvester: raffle.harvester,
              },
            });
            infoSpan.innerHTML = this.info_svg;

            const innerDiv = this.make("div", {}, timer, infoSpan);
            const newRow = this.make(
              "div",
              {
                id: `fvm-${raffleId}`,
                className: "fvm-raffle-row",
                dataset: { state: newState },
              },
              link,
              btn,
              innerDiv,
            );

            raffleInner.append(newRow);
          });

          const stickerContainer = this.make(
            "div",
            {
              className: "fvm-raffle-container fvm-shadow-sm",
              id: `fvm-sticker-${safeStickerName}`,
            },
            raffleHeader,
            raffleInner,
          );

          wrapper.append(stickerContainer);
        }

        // PILLS for this star level
        if (gotItData?.[starLevel]) {
          const pillsContainer = this.make("div", {
            className: "fvm-gotits-container",
          });

          const label = this.make(
            "span",
            {
              style: { fontSize: "0.75em", color: "#888", width: "100%" },
            },
            "Collected Stickers (click to reactivate):",
          );

          pillsContainer.append(label);

          gotItData[starLevel].forEach((pillName) => {
            const pill = this.make(
              "span",
              {
                className: "got-it-pill",
                dataset: { keyword: pillName, stars: starLevel },
              },
              `${pillName} ✕`,
            );
            pillsContainer.append(pill);
          });

          const allPill = this.make(
            "span",
            {
              className: "got-it-pill",
              dataset: { keyword: "all", stars: starLevel },
            },
            `${FVM_Emojis.zap} All ✕`,
          );

          pillsContainer.append(allPill);
          wrapper.append(pillsContainer);
        }
      });

      body.replaceChildren(wrapper);

      this.updateTimers();
      this.attachEvents(user);
      document.getElementById("fvm-popup").style.display = "block";
    },

    catchInfoButtonClicks(e, user) {
      // 1. INFO MODAL TRIGGER
      const target = e.target.closest('[data-role="info-trigger"]');
      if (!target) return;

      const info = {
        author: target.dataset.author,
        winner: target.dataset.winner,
        winner_by: target.dataset.winner_by || "",
        created: parseInt(target.dataset.created),
        entryDate: parseInt(target.dataset.entrydate),
        postid: target.dataset.postid,
        flags: target.dataset.flags || "",
        harvester: parseInt(target.dataset.harvester || 0),
      };
      console.log("Info Button Clicked:", info);
      FVM_Modal.showInfo(info, target);
      return;
    },

    injectInterceptor() {
      // Use unsafeWindow if available to reach the 'Main World'
      const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

      // Prevent double-injection
      if (win.fvm_interceptor_loaded) return;
      win.fvm_interceptor_loaded = true;

      const originalFetch = win.fetch;

      win.fetch = async (...args) => {
        const url = args[0] instanceof Request ? args[0].url : args[0];

        // Only log if it's our target to avoid console noise
        if (url.includes("/api/posts/getRaffleData")) {
          console.info("[FVM] Intercepting Raffle API...");

          const response = await originalFetch(...args);
          const clone = response.clone();

          clone
            .json()
            .then((data) => {
              console.log("[FVM] Data Caught:", data);
              // Pass data back to the userscript context
              window.dispatchEvent(
                new CustomEvent("FVM_API_DATA", { detail: data }),
              );
            })
            .catch((err) => console.error("[FVM] JSON Parse Error:", err));

          return response;
        }

        return originalFetch(...args);
      };
      console.info("[FVM] Global Fetch Wrapper Active");

      // Listener for your GM_xmlhttpRequest logic
      window.addEventListener("FVM_API_DATA", (event) => {
        const data = event.detail;
        console.log("[FVM Sandbox] Processing synced data:", data);
        // Your logic for api_stats.php goes here
      });
    },

    attachEvents(user) {
      const body = document.getElementById("fvm-body");
      body.onclick = null;

      body.onclick = async (e) => {
        const target = e.target;

        this.catchInfoButtonClicks(e, user);

        // --- NEW: HANDLE RAFFLE LINK CLICK ---
        if (target.classList.contains("fvm-raffle-link")) {
          const destination = target.href;

          e.preventDefault();
          e.stopPropagation();
          const state = target.dataset.state;
          const postId = target.dataset.postid;
          const winner = target.dataset.winner;
          const isExpired = target.dataset.state === "expired";
          const newStatus = isExpired ? "done" : "active";
          const newState = isExpired
            ? state === "new"
              ? "missed"
              : "checked"
            : state === "checked"
              ? "checked"
              : "entered";

          if (state === newState || newState === "missed") {
            this.goToDestination(destination);
            return; // No change needed
          }
          try {
            await FVM_API.sendToServer(
              "link",
              {
                user: user,
                post_id: postId,
                status: newStatus,
              },
              "POST",
            );
          } catch (err) {
            console.error("Error updating raffle status:", err);
            alert("Failed to update raffle status. Please try again.");
            return;
          }

          // Update UI immediately for responsiveness

          target.dataset.state = newState; // Change color to indicate entered
          // todo add a emoji if checked and the user was the winner
          target.innerHTML = isExpired ? "✅ Checked" : "✅ Entered"; // Update label

          this.setRowLinkState(target, newState);

          // tell the modal when the user entered the raffle
          if (newState === "entered") {
            const infoSpan = target.parentElement.querySelector(
              "span[data-role='info-trigger']",
            );
            infoSpan.dataset.entrydate = Math.floor(Date.now() / 1000);
          }

          if (newState === "checked" && winner.length === 0) {
            this.setUpSaveButton(target, postId);
          }

          this.goToDestination(destination);
        }

        if (target.classList.contains("fvm-raffle-ok")) {
          const postId = target.getAttribute("data-postid");

          // regardless of the outcome, we're doing this manually
          // don't let the stale check run
          const timerSpan = target.parentElement.querySelector(".fvm-timer");
          if (timerSpan) {
            timerSpan.dataset.checked = "true";
          }
          try {
            // Replicating old sendLinkStatus logic
            target.innerHTML = this.getSpinner(); // Show loading state
            await FVM_API.sendToServer(
              "link",
              {
                user: user,
                post_id: postId,
                status: "done",
              },
              "POST",
            );
            target.textContent = "✅";
            this.setRowLinkState(target, "checked");
          } catch (err) {
            console.error("Error updating raffle as done - ok button:", err);
          }
        }

        if (target.classList.contains("fvm-save-winner")) {
          const postId = target.getAttribute("data-postid");

          // 1. Start Loading State
          target.style.pointerEvents = "none"; // Prevent double-clicks during lag
          target.innerHTML = `${this.getSpinner()} Saving...</span>`;
          //await new Promise(requestAnimationFrame);

          try {
            // 2. Perform the async save
            const winnerName = await FVM_Extractor.saveRaffleData(postId);

            // 3. Success State
            target.textContent = "✅ Saved!";
            target.classList.remove("fvm-save-winner");
            target.style.pointerEvents = "auto"; // Re-enable (though class is removed)

            const infoSpan = target.parentElement.querySelector(
              "span[data-role='info-trigger']",
            );
            if (infoSpan) {
              infoSpan.dataset.winner = winnerName;
            }
          } catch (error) {
            // 4. Error Handling (Optional but recommended)
            console.error("Save failed:", error);
            target.textContent = "💾 Retry Save";
            target.style.pointerEvents = "auto";
          }
          return;
        }

        // --- RESTORED: GOT IT BUTTON ---
        if (target.classList.contains("got-it-btn")) {
          const keyword = target.getAttribute("data-keyword");
          //if (confirm(`Mark '${keyword}' as collected?`)) {
          try {
            await FVM_API.sendToServer(
              "gotit",
              { user: user, keyword: keyword },
              "POST",
            );
            //this.refreshPopup(); // Reload UI to move sticker to pills
            const safeKeyword = keyword.replace(/[^a-zA-Z0-9\-_.]/g, "");
            console.log("Marking as Got It:", keyword, safeKeyword);
            const container = body.querySelector(`#fvm-sticker-${safeKeyword}`);
            const newRaffles = container.querySelectorAll(
              ".fvm-raffle-row[data-state='new']",
            );
            newRaffles.forEach((row) => {
              row.remove();
            });
            target.remove(); // Remove the Got It button immediately for better UX
          } catch (err) {
            console.error("Error saving 'Got It':", err);
          }
          //}
          return;
        }

        // --- RESTORED: PILL REMOVAL ---
        if (target.classList.contains("got-it-pill")) {
          const keyword = target.getAttribute("data-keyword");
          const what =
            keyword === "all" ? "delete_all_keywords" : "delete_keyword";
          const stars = target.getAttribute("data-stars");

          console.log("Reactivating keyword:", keyword, what);
          //if (confirm(`Reactivate tracking for '${keyword}'?`)) {
          try {
            await FVM_API.sendToServer(
              what,
              { user: user, keyword: keyword, stars: stars },
              "POST",
            );
            this.refreshPopup(); // Reload UI to show raffles again
          } catch (err) {
            console.error("Error deleting keyword:", err);
          }
          //}
          return;
        }
      };
    },

    async setUpSaveButton(target, postId) {
      this.clearWinnerSaveButtons();

      const spinnerBtn = this.make("span", {
        id: "fvm-saving-spinner",
        style: { color: FVM_Colours.silverDark, marginLeft: "8px" },
      });
      spinnerBtn.innerHTML = this.getSpinner();
      target.after(spinnerBtn);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        // --- Retry up to 3 times to find winner data ---
        let raffleData = null;
        const MAX_ATTEMPTS = 5;
        const RETRY_DELAY_MS = 5000;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          console.log(
            `Fetching raffle data, attempt ${attempt}/${MAX_ATTEMPTS}...`,
          );
          raffleData = await FVM_Extractor.fetchRaffleData(postId);
          console.log("Fetched raffle data:", raffleData);

          if (
            raffleData &&
            raffleData.winner &&
            raffleData.winner.name.length > 0
          ) {
            break; // Winner found — stop retrying
          }

          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }

        spinnerBtn.remove();
        // we've waited long enough, time to move on
        if (
          !raffleData ||
          !raffleData.winner ||
          raffleData.winner.name.length === 0
        ) {
          // No winner found after all attempts
          const noWinnerBtn = this.make(
            "span",
            {
              dataset: { role: "notify" },
              style: { color: FVM_Colours.silverDark, marginLeft: "8px" },
            },
            "❓ No winner yet",
          );
          target.after(noWinnerBtn);
        } else {
          // --- Verify owner matches the post author in the page HTML ---
          const postEl =
            document.querySelector(`shreddit-post[id="t3_${postId}"]`) ||
            document.querySelector("shreddit-post");
          const pageAuthor = postEl ? postEl.dataset.author : null;
          const ownerName = raffleData.owner?.name ?? "";
          const authorMatches =
            !pageAuthor || ownerName.toLowerCase() === pageAuthor.toLowerCase();

          console.log(
            `Owner check: raffleData.owner="${ownerName}", page author="${pageAuthor}", match=${authorMatches}`,
          );

          if (!authorMatches) {
            const mismatchBtn = this.make(
              "span",
              {
                dataset: { role: "notify" },
                title: `Raffle owner "${ownerName}" ≠ post author "${pageAuthor}"`,
                style: { color: FVM_Colours.red, marginLeft: "8px" },
              },
              "⚠️ Owner mismatch",
            );
            target.after(mismatchBtn);
          } else {
            // All good — show Save button

            const saveBtn = this.make(
              "span",
              {
                className: "fvm-save-winner",
                dataset: { postid: postId },
                style: { cursor: "pointer", marginLeft: "8px" },
              },
              "💾 Save",
            );
            target.after(saveBtn);
          }
        }
      } catch (err) {
        console.error("Error fetching raffle data for save button:", err);
        spinnerBtn.remove();

        const errorBtn = this.make(
          "span",
          {
            dataset: { postid: postId, role: "notify" },
            style: { color: FVM_Colours.red, marginLeft: "8px" },
          },
          "⚠️ Error",
        );

        target.after(errorBtn);
      }
    },
    clearWinnerSaveButtons() {
      const bodyContainer = document.getElementById("fvm-body");
      //there should only be one
      const existingBtn = bodyContainer.querySelector(".fvm-save-winner");

      if (existingBtn) {
        existingBtn.remove();
      }
    },

    goToDestination(destination) {
      const routerLink = document.createElement("a");
      routerLink.href = destination;
      routerLink.style.display = "none";

      // In Reddit's SPA, we often need to ensure the event isn't
      // cancelled by other listeners, so we dispatch it manually.
      document.body.appendChild(routerLink);

      setTimeout(() => {
        routerLink.click(); // Reddit's SPA router should catch this
        routerLink.remove();
      }, 100);
    },

    findOldestNewRaffle() {
      let best = null;

      const popBody = document.getElementById("fvm-body");
      //const rows = popBody.querySelectorAll(".fvm-raffle-row.fvm_new");
      const rows = popBody.querySelectorAll(
        '.fvm-raffle-row[data-state="new"]',
      );

      for (const row of rows) {
        const timer = row.querySelector(".fvm-timer[data-created]");
        if (!timer) continue;

        const created = Number(timer.dataset.created);
        if (!Number.isFinite(created)) continue;

        if (!best || created < best.created) {
          best = {
            row,
            created,
            link: row.querySelector(".fvm-raffle-link"),
            row: row,
          };
        }
      }

      return best.row;
    },

    jumpToRow(btnSelector, state) {
      const popBody = document.getElementById("fvm-body");
      let nextRow;
      if (btnSelector === "fvm-jump-oldest") {
        nextRow = this.findOldestNewRaffle();
      } else {
        // nextRow = document.querySelector(`.${rowSelector}`);
        nextRow = popBody.querySelector(
          `.fvm-raffle-row[data-state="${state}"]`,
        );
      }

      if (nextRow) {
        // 2. Scroll the element into view smoothly
        // block: "center" helps ensure it's not hidden behind the header/footer
        nextRow.scrollIntoView({ behavior: "smooth", block: "center" });

        // 3. Optional: Brief highlight effect so the user sees which one it is

        nextRow.classList.add("fvm-highlight");
        setTimeout(() => {
          nextRow.classList.remove("fvm-highlight");
        }, 2000);
      } else {
        this.flashButtonOff(btnSelector);
      }
    },
    flashButtonOff(btnSelector) {
      console.log("FVM_UI: No rows found for selector:", btnSelector);
      const btn = document.getElementById(btnSelector);
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = "❌";
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1000);
      }
    },

    getRedditUsername() {
      // 1. Old Reddit / RES (Based on your provided HTML)
      // Targets the <a> inside <span class="user">
      const oldRedditSpan = document.querySelector(
        'span.user > a[href*="/user/"]',
      );
      if (oldRedditSpan) {
        const name = oldRedditSpan.textContent.trim();
        if (name && name !== "login" && name !== "register") return name;
      }

      // 2. sh.reddit.com (Modern Root Attribute)
      const shredditApp = document.querySelector("shreddit-app[user-name]");
      if (shredditApp) {
        const name = shredditApp.getAttribute("user-name");
        if (name) return name;
      }

      // 3. New Reddit Redesign (Account Menu)
      const redesignMenu = document.querySelector(
        "#header-user-dropdown-button span:last-child",
      );
      if (redesignMenu) {
        return redesignMenu.textContent.replace("u/", "").trim();
      }

      // 4. Global JSON-LD fallback (Safe for both)
      const userJson = document.getElementById("data");
      if (userJson) {
        try {
          const data = JSON.parse(userJson.textContent);
          if (data.user && data.user.name) return data.user.name;
        } catch (e) {}
      }

      return "";
    },
    getSpinner() {
      return `<svg width="12" height="12" viewBox="0 0 50 50" style="margin-right:4px;">
        <circle cx="25" cy="25" r="20"
          fill="none"
          stroke="${FVM_Colours.darkOrange}"
          stroke-width="5"
          stroke-linecap="round"
          stroke-dasharray="31.4 31.4">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 25 25"
            to="360 25 25"
            dur="0.8s"
            repeatCount="indefinite" />
        </circle>
      </svg>`;
    },
    formatRecentUnix(seconds) {
      if (!seconds) return "";

      const date = new Date(seconds * 1000);
      const now = new Date();

      // Start of today
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

      // Start of yesterday
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfToday.getDate() - 1);

      const timePart = date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });

      if (date >= startOfToday) {
        return `Today, ${timePart}`;
      }

      if (date >= startOfYesterday) {
        return `Yesterday, ${timePart}`;
      }

      return date.toLocaleString();
    },
  };

  const FVM_Modal = {
    async showInfo(info, triggerElement) {
      console.log("Showing info modal for post:", info.postid);

      const existingModal = document.querySelector(".fvm_modal_overlay");
      if (existingModal) existingModal.remove();

      const overlay = FVM_UI.make("div", { className: "fvm_modal_overlay" });
      overlay._triggerElement = triggerElement;
      document.body.appendChild(overlay);

      const rowState = FVM_UI.getRowState(triggerElement);

      // Show spinner while fetching
      const contentDiv = FVM_UI.make("div", { id: "fvm-modal-content" });
      contentDiv.innerHTML = FVM_UI.getSpinner();

      const modalBox = FVM_UI.make(
        "div",
        {
          className: "fvm_modal",
          style: { fontFamily: "'Courier New', Courier, monospace" },
        },
        contentDiv,
      );

      const footer = FVM_UI.make("div", {
        style: {
          marginTop: "15px",
          display: "flex",
          gap: "10px",
          fontFamily: "sans-serif",
        },
      });
      const closeBtn = FVM_UI.make(
        "button",
        {
          id: "fvmCloseModal",
          style: {
            padding: "0 10px",
            border: `1px solid ${FVM_Colours.silverDark}`,
            cursor: "pointer",
          },
        },
        "Close",
      );
      const authorBtn = FVM_UI.make(
        "button",
        {
          id: "fvmGoAuthor",
          style: {
            background: FVM_Colours.darkOrange,
            color: "white",
            border: "none",
            padding: "0 10px",
            cursor: "pointer",
            borderRadius: "4px",
          },
        },
        "Go to Author",
      );
      footer.append(closeBtn, authorBtn);
      modalBox.append(footer);
      overlay.append(modalBox);

      // Fetch fresh data from server
      let fresh = {};
      try {
        fresh =
          (await FVM_API.sendToServer(
            "post",
            { post_id: info.postid },
            "GET",
          )) || {};
      } catch (e) {
        console.error("FVM_Modal: Failed to fetch post info", e);
      }

      // Merge dataset info with fresh server data (server wins)
      const d = {
        author: fresh.author ?? info.author,
        winner: fresh.winner ?? info.winner ?? "",
        winner_by: fresh.winner_by ?? info.winner_by ?? "",
        created: fresh.created_utc ? parseInt(fresh.created_utc) : info.created,
        entryDate: info.entryDate,
        postid: info.postid,
        flags: fresh.flags ?? info.flags ?? "",
        harvester:
          fresh.harvester != null ? parseInt(fresh.harvester) : info.harvester,
        harvest_tries: fresh.harvest_tries ?? 0,
        participants: fresh.participants ?? "",
      };

      const timeRemaining = FVM_UI.getSecondsRemaining(d.created);
      const timeSince = FVM_UI.getSecondsSinceClose(d.created);
      const created = FVM_UI.formatRecentUnix(d.created);
      const entered =
        d.entryDate === 0 ? "" : FVM_UI.formatRecentUnix(d.entryDate);

      const flagsArray = (d.flags || "").split(",").filter(Boolean);
      const flagCounts = flagsArray.reduce((acc, flag) => {
        const f = flag.trim().toLowerCase();
        acc[f] = (acc[f] || 0) + 1;
        return acc;
      }, {});

      const getHarvesterText = (d) => {
        if (d.harvester === 0) return "Unknown status";
        if (d.harvester === 1)
          return d.winner_by === "harvester" ? "Success" : "Not visited";
        if (d.harvester === 2) return "Deleted by User";
        if (d.harvester === 3) return "Deleted by Reddit";
        if (d.harvester === 4) return "No token found";
        if (d.harvester === 5) return "Network Error";
        if (d.harvester === 6) return "Request timeout";
        if (d.harvester === 7) return `No winner found [${d.harvest_tries}]`;
        return "Unknown status";
      };

      const makeLine = (...children) =>
        FVM_UI.make("div", { className: "fvm-modal-line" }, ...children);
      const makeLabel = (text) => FVM_UI.make("span", {}, text);
      const makeStrong = (text) => {
        const s = FVM_UI.make("strong", {});
        s.textContent = text;
        return s;
      };
      const makeCopy = (value) =>
        FVM_UI.make(
          "span",
          {
            className: "fvm-copy-icon",
            dataset: { copy: value },
            title: "Copy",
          },
          "⧉",
        );

      const content = FVM_UI.make("div", { id: "fvm-modal-content" });

      // Post Id
      const postidLabel = makeLabel("Post Id: ");
      postidLabel.append(makeStrong(d.postid));
      content.append(makeLine(postidLabel, makeCopy(d.postid)));

      // Author
      const authorLabel = makeLabel("Author: ");
      authorLabel.append(makeStrong(d.author));
      content.append(makeLine(authorLabel, makeCopy(d.author)));

      if (timeRemaining.state === "expired") {
        // Winner
        const winnerLabel = makeLabel("Winner: ");
        winnerLabel.append(makeStrong(d.winner || "—"));
        const winnerLine = makeLine(winnerLabel);
        if (d.winner && d.winner !== "" && d.winner !== "null")
          winnerLine.append(makeCopy(d.winner));
        content.append(winnerLine);

        // Participants
        if (d.participants !== "") {
          const partLabel = makeLabel("Participants: ");
          partLabel.append(makeStrong(d.participants));
          content.append(makeLine(partLabel));
        }
      }

      // Created / Entered
      const createdLabel = makeLabel("Created: ");
      createdLabel.append(makeStrong(created));
      content.append(makeLine(createdLabel));

      const enteredLabel = makeLabel("Entered: ");
      enteredLabel.append(makeStrong(entered));
      content.append(makeLine(enteredLabel));

      // Closed / Closes in
      if (timeRemaining.state === "expired") {
        const closedLabel = makeLabel("Closed: ");
        closedLabel.append(makeStrong(`${timeSince.text} ago`));
        content.append(makeLine(closedLabel));
      } else {
        const closesLabel = makeLabel("Closes in: ");
        closesLabel.append(makeStrong(timeRemaining.text));
        content.append(makeLine(closesLabel));
      }

      // Flags
      const flagsLabel = makeLabel(`Flags: Deleted: `);
      flagsLabel.append(
        makeStrong(flagCounts.deleted || 0),
        document.createTextNode(", Incorrect: "),
        makeStrong(flagCounts.incorrect || 0),
      );
      content.append(makeLine(flagsLabel));

      // Flag As buttons
      const flagDeletedBtn = FVM_UI.make(
        "button",
        {
          id: "fvm-flag-deleted",
          dataset: {
            role: "flagproblems",
            postid: d.postid,
            author: d.author,
            flag: "deleted",
          },
          style: {
            padding: "0 10px",
            border: `1px solid ${FVM_Colours.silverDark}`,
            cursor: "pointer",
          },
        },
        "Deleted",
      );
      if (rowState === "new") flagDeletedBtn.disabled = true;

      const flagIncorrectBtn = FVM_UI.make(
        "button",
        {
          id: "fvm-flag-incorrect",
          dataset: {
            role: "flagproblems",
            postid: d.postid,
            author: d.author,
            flag: "incorrect",
          },
          style: {
            padding: "0 10px",
            border: `1px solid ${FVM_Colours.silverDark}`,
            cursor: "pointer",
          },
        },
        "Incorrect",
      );
      if (rowState === "new") flagIncorrectBtn.disabled = true;

      const flagLineLeft = FVM_UI.make("span", {}, "Flag As: ", flagDeletedBtn);
      const flagLineRight = FVM_UI.make("span", {}, " or ", flagIncorrectBtn);
      content.append(makeLine(flagLineLeft, flagLineRight));

      // Harvest status (expired only)
      if (timeRemaining.state === "expired") {
        const harvestLabel = makeLabel("Harvest: ");
        harvestLabel.append(makeStrong(getHarvesterText(d)));
        content.append(makeLine(harvestLabel));
      }

      // Replace spinner with real content
      modalBox.querySelector("#fvm-modal-content").replaceWith(content);

      // --- Event Listeners ---
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });
      modalBox.addEventListener("click", (e) => e.stopPropagation());

      overlay.querySelectorAll("[data-role='flagproblems']").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const postId = e.target.dataset.postid;
          const user = localStorage.getItem("fvm_user_id");
          const flagType = e.target.dataset.flag;
          if (
            confirm(`Are you sure you want to flag this raffle as ${flagType}?`)
          ) {
            try {
              e.target.disabled = true;
              e.target.innerHTML = `${FVM_UI.getSpinner()} Flagging...</span>`;
              await FVM_API.sendToServer("flag_deleted", {
                postid: postId,
                user,
                flag: flagType,
              });
              e.target.textContent = "✅ Flagged!";
              const originTrigger = overlay._triggerElement;
              if (originTrigger) {
                originTrigger.dataset.state = "flagged";
                const flagJoin =
                  originTrigger.dataset.flags.length > 0 ? "," : "";
                originTrigger.dataset.flags += flagJoin + "deleted";
              }
            } catch (error) {
              console.error("Error flagging raffle:", error);
            }
          }
        });
      });

      closeBtn.onclick = () => overlay.remove();
      authorBtn.onclick = () => {
        window.open(`https://www.reddit.com/u/${d.author}`, "_blank");
        overlay.remove();
      };

      overlay.querySelectorAll(".fvm-copy-icon").forEach((icon) => {
        icon.onclick = () => {
          navigator.clipboard
            .writeText(icon.getAttribute("data-copy"))
            .then(() => {
              const orig = icon.textContent;
              icon.textContent = "✅";
              setTimeout(() => {
                icon.textContent = orig;
              }, 2000);
            });
        };
      });
    },
  };
  // Run immediately if document is ready, otherwise wait for load
  // --- 3. EXECUTION ---
  const init = () => {
    if (document.body) {
      console.info("FVM Startup", FVM_SCRIPT_VERSION);
      FVM_UI.injectInterceptor();
      FVM_UI.init();
      FVM_Importer.runInitialImport();
      FVM_Importer.runHourlyImport();
      FVM_Importer.runStaleWinnerCheck();
    } else setTimeout(init, 200);
  };
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }

  // Standard history change listeners
  const pushState = history.pushState;
  history.pushState = function () {
    pushState.apply(history, arguments);
    FVM_UI.refreshPopup();
  };
  window.addEventListener("popstate", () => FVM_UI.refreshPopup());
})();
