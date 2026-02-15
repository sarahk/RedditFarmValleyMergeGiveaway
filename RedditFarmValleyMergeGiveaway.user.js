// ==UserScript==
// @name         FarmMergeValley Giveaway Pop-up
// @version      3.20
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
// @run-at       document-idle
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
    coral: "#d14d28",
    red: "#c2410c",
    garnet: "#8b0000",
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

      if (isGet) {
        url += `?what=${action}&${new URLSearchParams(data).toString()}`;
      } else {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = new URLSearchParams({ what: action, ...data }).toString();
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
      "https://www.reddit.com/r/FarmMergeValley/search.json?restrict_sr=1&sort=new&t=month&restrict_sr=1&sort=new&limit=100",
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
        .got-it-pill {transition: all 0.2s ease;background: #e0e0e0; color: #666; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; cursor: pointer; border: 1px solid #ccc;}
        .got-it-pill:hover { background-color: #ffcccc !important; border-color: #ff0000 !important; color: #cc0000 !important;}
        .fvm-timer {font-size: 0.85em; margin-left: 8px; font-weight: normal; }
        .fvm_modal {position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border: 2px solid #333; border-radius: .5em; z-index: 10001; /* Higher than popup */ box-shadow: 0 4px 15px rgba(0,0,0,0.3);}
        .fvm-raffle-row { padding: 4px 0; font-size: 0.85em; display: flex; justify-content: space-between; align-items: center;    border-bottom: 1px solid #f0f0f0; }
        .fvm-raffle-row:last-child {border-bottom: none; }
        .fvm-raffle-ok {color: ${FVM_Colours.blue};  border-color: #f0f0f0; padding: 0 10px; font-size: smaller;}
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
      `;

      document.head.appendChild(style);
    },
    labels: {
      youWon: "🎉 You won! Claim! 🎉",
      expired: "• Expired Raffle",
      doneCheck: "• Done, did you win?",
      entered: "• Entered",
      new: "• New Raffle",
      timeExpired: "ℹ️ Expired",
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
        // Mark timer expired

        span.classList.add("fvm-info-trigger");
        const rowState = this.getRowState(span);

        if (rowState === "entered") {
          // User entered but raffle now expired
          this.setLinkText(span, this.labels.doneCheck);
          this.setRowLinkState(span, "expired");
        } else {
          this.setLinkText(span, this.labels.expired);
          this.setRowLinkState(span, "missed");
        }
      }
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
      if (!row) "";

      return row.dataset.state;
    },

    setRowLinkState(obj, state) {
      console.log("setRowLinkState", state);
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
        body.innerHTML = "No active raffles found.";
        return;
      }

      const sortedStars = Object.keys(groupedData).sort((a, b) => b - a);
      let html = "<div>";

      sortedStars.forEach((starLevel) => {
        const stickersInLevel = groupedData[starLevel];
        const starCount = "⭐".repeat(parseInt(starLevel));

        // STAR LEVEL HEADER
        html += `<div id="fvm-star-level-header">
                   ${starLevel} Star Raffles
                 </div>`;

        // 1. Loop through RAFFLES for this star level
        for (const stickerName in stickersInLevel) {
          let raffles = stickersInLevel[stickerName];
          if (!Array.isArray(raffles)) raffles = [raffles];

          html += `
            <div class="fvm-raffle-container fvm-shadow-sm" >
              <div class="fvm-raffle-header" >
                <strong style="color:${FVM_Colours.darkOrange}; font-size: 0.8em;">${stickerName.toUpperCase()} ${starCount}</strong>
                <button class="got-it-btn" data-keyword="${stickerName}" >Got It!</button>
              </div>
              <div style="padding: 2px 8px;">
          `;

          raffles.forEach((raffle, index) => {
            const expires = parseInt(raffle.created_utc) + 86400;
            const timeRemaining = this.getSecondsRemaining(
              parseInt(raffle.created_utc),
            );

            const isExpired = now > expires;

            const raffleId = raffle.id || raffle.post_id;

            // database status is "", active, or done
            // but done isn't sent
            const isEntered = raffle.status === "active";

            let label = isEntered ? this.labels.entered : this.labels.new;
            let newState = isEntered ? "entered" : "new";
            let btn = "";

            if (timeRemaining.state === "expired") {
              newState = "expired";
              if (raffle.winner.length === 0) {
                label = this.labels.doneCheck;
              } else {
                if (raffle.winner === user) {
                  label = this.labels.youWon;
                } else {
                  label = `Winner: ${raffle.winner} `;
                  btn = `<button class="fvm-raffle-ok" data-postid="${raffleId}">
                    OK
                  </button>`;
                }
              }
            }

            const newRow = `
                <div id="fvm-${raffleId}" class="fvm-raffle-row" data-state=${newState}>
                  <a href="${raffle.url}" 
                    class="fvm-raffle-link" 
                    data-postid="${raffleId}" 
                    data-status="${raffle.status}"
                    data-winner="${raffle.winner}"
                    data-state="${newState}"
                    >
                    ${label}
                  </a>
                  ${btn}
                  <span class="fvm-timer ${isExpired ? "fvm-info-trigger" : ""}" data-state="${timeRemaining.state}" data-created="${raffle.created_utc}" data-author="${raffle.author}" data-winner="${raffle.winner}" >${timeRemaining.text}</span>
                </div>`;
            if (raffleId === "t3_1r2ows8") console.log(newRow);
            html += newRow;
          });
          html += `</div></div>`;
        }

        // 2. INSERT PILLS for this star level right here
        if (gotItData && gotItData[starLevel]) {
          html += `<div class="fvm-gotits-container">`;
          html +=
            "<span style='font-size:0.75em; color:#888; width:100%;'>Collected Stickers (click to reactivate):</span>";
          gotItData[starLevel].forEach((pillName) => {
            html += `
              <span class="got-it-pill" data-keyword="${pillName}" data-stars="${starLevel}" >
                ${pillName} ✕
              </span>`;
          });
          html += `<span class="got-it-pill" data-keyword="all" data-stars="${starLevel}" >${FVM_Emojis.zap} All ✕ </span></div>`;
        }
      });

      html += `</div>`;
      body.innerHTML = html;

      this.updateTimers();
      // Note: renderPills is now handled inline above, so you may not need this.renderPills(user) anymore
      this.attachEvents(user);
      document.getElementById("fvm-popup").style.display = "block";
    },

    attachEvents(user) {
      const body = document.getElementById("fvm-body");
      body.onclick = null;

      body.onclick = async (e) => {
        const target = e.target;

        // 1. INFO MODAL TRIGGER
        if (target.classList.contains("fvm-info-trigger")) {
          const author = target.dataset.author;
          const winner = target.dataset.winner;
          const created = parseInt(target.dataset.created);
          FVM_Modal.showInfo(author, winner, created);
          return;
        }

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
          console.log(
            "raffle click",
            state,
            postId,
            winner,
            isExpired,
            newStatus,
            newState,
          );
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

            target.dataset.state = newState; // Change color to indicate entered
            target.innerHTML = isExpired ? "✅ Checked" : "✅ Entered"; // Update label

            this.setRowLinkState(target, newState);

            if (newState === "checked" && winner.length === 0) {
              // because the save button looks at the current url the user can't save unless they're on the page
              this.clearWinnerSaveButtons();

              const saveBtn = document.createElement("span");
              saveBtn.className = "fvm-save-winner";
              saveBtn.setAttribute("data-postid", postId);
              saveBtn.innerHTML = "💾 Save";
              // 3. Add some style to make it look clickable
              saveBtn.style.cursor = "pointer";
              saveBtn.style.marginLeft = "8px";

              // 4. Append it as a new child of the link
              target.after(saveBtn);
            }
          } catch (err) {
            console.error("Error updating link status:", err);
          }

          this.goToDestination(destination);
          return; // Let the default anchor behavior open the link
        }

        if (target.classList.contains("fvm-raffle-ok")) {
          const postId = target.getAttribute("data-postid");

          try {
            // Replicating old sendLinkStatus logic
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
            // const row = target.closest(".fvm-raffle-row");
            // row.dataset.state = "checked";
            // const link = row.querySelector(".fvm-raffle-link");
            // link.dataset.state = "checked";
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

            const infoSpan =
              target.parentElement.querySelector(".fvm-info-trigger");
            if (infoSpan) {
              infoSpan.setAttribute("data-winner", winnerName);
            }
            this.setRowLinkState(target, "checked");
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
            this.refreshPopup(); // Reload UI to move sticker to pills
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
          };
        }
      }

      return best.link;
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
        const originalBg = nextRow.style.backgroundColor;
        nextRow.style.backgroundColor = FVM_Colours.yellow; // Light highlight
        setTimeout(() => {
          nextRow.style.backgroundColor = originalBg;
        }, 2000);

        nextRow.classList.remove(rowSelector);
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
  };

  const FVM_Modal = {
    showInfo(author, winner, createdUtc) {
      // 1. Remove existing modal if one is already open
      const existingModal = document.querySelector(".fvm_modal");
      if (existingModal) existingModal.remove();

      // 2. Calculate "Time Since" minus 24 hours
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const secondsInDay = 86400;
      let diff = nowInSeconds - createdUtc - secondsInDay;
      if (diff < 0) diff = 0;

      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);

      const created = new Date(createdUtc * 1000).toLocaleString();
      const textx = `Author: ${author}
Winner: ${winner}
Created: ${created}
Time since Raffle Closed: ${days}d ${hours}h ${minutes}m`;

      const winnerCopyButton =
        winner && winner !== "" && winner !== "null"
          ? `<span class="fvm-copy-icon" data-copy="${winner}" title="Copy Winner">⧉</span>`
          : "";

      const text = `<div class="fvm-modal-line">
            <span>Author: <strong>${author}</strong></span>
            <span class="fvm-copy-icon" data-copy="${author}" title="Copy Author">⧉</span>
        </div>
        <div class="fvm-modal-line">
            <span>Winner: <strong>${winner}</strong></span>
            ${winnerCopyButton}
        </div>
        <div class="fvm-modal-line" style="border:none;">
            <span>Created: <strong>${created}</strong></span>
        </div>
        <div class="fvm-modal-line" style="border:none;">
            <span>Closed: <strong>${days}d ${hours}h ${minutes}m ago</strong></span>
        </div>`;

      // 3. Create Modal Element
      const modal = document.createElement("div");
      modal.className = "fvm_modal";
      modal.style.fontFamily = "'Courier New', Courier, monospace";

      modal.innerHTML = `
            <div id="fvm-modal-content" style="font-family: inherit;">${text}</div>
            <div style="margin-top:15px; display:flex; gap:10px;font-family: sans-serif;">
                <button id="fvmCloseModal" style="padding: 0 10px; border: 1px solid #f0f0f0; cursor:pointer;">Close</button>
                <button id="fvmGoAuthor" style="background:#E2852E; color:white; border:none; padding:0 10px; cursor:pointer; border-radius:4px;">Go to Author</button>
            </div>
        `;

      document.body.appendChild(modal);

      // 4. Listeners
      document.getElementById("fvmCloseModal").onclick = () => modal.remove();
      document.getElementById("fvmGoAuthor").onclick = () => {
        window.open(`https://www.reddit.com/u/${author}`, "_blank");
        modal.remove();
      };
      // Event Listener for Copy Icons
      modal.querySelectorAll(".fvm-copy-icon").forEach((icon) => {
        icon.onclick = () => {
          const text = icon.getAttribute("data-copy");
          navigator.clipboard.writeText(text).then(() => {
            const originalIcon = icon.textContent;
            icon.textContent = "✅";
            setTimeout(() => {
              icon.textContent = originalIcon;
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
      FVM_UI.init();
      FVM_Importer.runInitialImport();
      FVM_Importer.runHourlyImport();
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
