// ==UserScript==
// @name         FarmMergeValley Giveaway Pop-up
// @version      3.13
// @match        *://*.reddit.com/r/FarmMergeValley*
// @match        *://*.reddit.com/r/ClubSusan*
// @connect      reddit.com
// @connect      fvm.itamer.com
// @connect      devvit.net
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  ("use strict");

  const TWENTY_FOUR_HOURS_S = 86400;
  let countdownTimer = null;

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
  };

  const FVM_Colours = {
    orange: "#f7a01d",
    darkOrange: "#E2852E",
    blue: "#0079d3",
    yellow: "#fff3cd",
  };

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
                console.log([
                  "FVM_API.fetch response parsed as JSON:",
                  res.responseText,
                  options,
                ]);
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
      console.log(["FVM_API.sendToServer:", method, url]);
      console.log(["FVM_API.sendToServer:", body]);

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
      "https://www.reddit.com/r/FarmMergeValley/search.json?q=flair_name%3A%22%F0%9F%8E%81+Raffles%2FGiveaways%22&restrict_sr=1&sort=new&t=month",
    REDDIT_SEARCH_URL:
      "https://www.reddit.com/r/FarmMergeValley/search.json?restrict_sr=1&sort=new&t=month",
    //const USER_AGENT = "browser:FarmMergeValley-Sticker-App:v2.4 (by /u/itamer)";
    GIVEAWAY_PREFIX: "[Sticker Giveaway]",

    async runInitialImport() {
      console.log("FVM_Importer: Running initial 25-post import...");
      await this.getJsonAndSend(this.REDDIT_FEED_URL);
    },

    async runHourlyImport() {
      const lastRun = localStorage.getItem("fvm_last_hourly");
      const now = Date.now();

      if (!lastRun || now - parseInt(lastRun) > 3600000) {
        console.log("FVM_Importer: Running hourly keyword import...");
        try {
          const keywords = await FVM_API.sendToServer("keywords", {}, "GET");
          if (Array.isArray(keywords)) {
            for (const kw of keywords) {
              const searchUrl =
                this.REDDIT_SEARCH_URL +
                `&q=${encodeURIComponent(kw)}&restrict_sr=1&sort=new`;
              await this.getJsonAndSend(searchUrl);
              console.log(`FVM_Importer: Imported keyword '${kw}'`);
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
          console.log("FVM_Extractor: Raffle data retrieved:", raffleData);
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

      console.log("FVM_Extractor getPostIdFromUrl", postId);
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
      console.log("FVM_UI: Initializing...");
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
        #fvm-popup { z-index: 10000; position: fixed; bottom: 20px; right: 20px; width: 300px; background: #f9f9f9; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); font-family: Arial, sans-serif; display:none; }
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
        .fvm-raffle-ok {color:#0079d3;  border-color: #f0f0f0; padding: 0 10px; font-size: smaller;}
        .fvm-gotits-container {display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 20px; padding: 5px; background: #fafafa; border-radius: 4px;}
        #fvm-close {background:none; border:none; color: ${FVM_Colours.darkOrange}; cursor:pointer; font-size:18px;}
        #fvm-footer {padding: 10px; border-top: 1px solid #eee; display: flex; gap: 5px;align-items: center;}
        #fvm-footer a, #fvm-footer span { background-color: transparent !important; line-height: 1; /* Prevents extra vertical space that can cause background bleeding */ display: inline-flex; align-items: center; mix-blend-mode: multiply; }        #fvm-star-level-header {margin: 10px 0 5px 0; font-weight: bold; color: #444; border-left: 4px solid ${FVM_Colours.darkOrange}; padding-left: 8px;}
        .fvm-raffle-container {margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; background: #fff; overflow: hidden;}
        .fvm-raffle-header {display:flex; justify-content:space-between; background:#f8f8f8; padding: 4px 10px; align-items: center; border-bottom: 1px solid #eee;"}
        .fvm-timer {font-size: 0.85em; color: #666; font-family: monospace;}
        #fvm-modal-content {font-family: 'Courier New', Courier, monospace; font-size: 13px; min-width: 250px;}
        .fvm-modal-line { font-family: 'Courier New', Courier, monospace; font-size: 13px;  display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #eee;}
        .fvm-copy-icon {cursor: pointer; font-size: 1.1em; padding: 2px 5px; border-radius: 4px; transition: background 0.2s;}
        .fvm-copy-icon:hover { background: #eee; }
        .fvm-copy-icon:active { transform: scale(0.9); }
    `;

      document.head.appendChild(style);
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
          <button id="fvm-close" title='Close'>×</button>
          </div>
        </div>
        <div id="fvm-body">Loading...</div>
        <div id="fvm-footer">
        <img src="https://fvm.itamer.com/buynzmade.webp" alt="Buy NZ Made" style="height:24px; margin-bottom: 0;" />
          
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
      document.getElementById("fvm-refresh").onclick = () =>
        this.refreshPopup();
      document.getElementById("fvm-jump-expired").onclick = () =>
        this.jumpToRow("fvm-jump-expired", "fvm_expired");
      document.getElementById("fvm-jump-next").onclick = () =>
        this.jumpToRow("fvm-jump-next", "fvm_new");
    },

    // New helper to update timer text live
    updateTimers() {
      const now = Math.floor(Date.now() / 1000);
      document.querySelectorAll(".fvm-timer").forEach((span) => {
        const createdUtc = parseInt(span.dataset.created);
        const expires = createdUtc + TWENTY_FOUR_HOURS_S;
        const diff = expires - now;

        if (diff <= 0) {
          span.innerHTML = "ℹ️ Expired";
          span.style.color = "#777";
          span.classList.add("fvm-info-trigger");
        } else {
          const h = Math.floor(diff / 3600);
          const m = Math.floor((diff % 3600) / 60);
          span.textContent = h > 0 ? `(${h}h ${m}m)` : `(${m}m left)`;
          span.style.color = h === 0 && m < 15 ? "#a00" : "#333";
        }
      });
    },

    // update the time left on a raffle every minute
    startGlobalTimer() {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => this.updateTimers(), 60000); // Update every minute
    },

    async refreshPopup() {
      const user = localStorage.getItem("fvm_user_id");
      const body = document.getElementById("fvm-body");
      if (!user) {
        body.innerHTML = `
          <p>Enter your username:</p>
          <input type="text" id="fvm-user-in" class="fvm-input" placeholder="Reddit Username">
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
            <div class="fvm-raffle-container" >
              <div class="fvm-raffle-header" >
                <strong style="color:${FVM_Colours.darkOrange}; font-size: 0.8em;">${stickerName.toUpperCase()} ${starCount}</strong>
                <button class="got-it-btn" data-keyword="${stickerName}" >Got It!</button>
              </div>
              <div style="padding: 2px 8px;">
          `;

          raffles.forEach((raffle, index) => {
            const now = Math.floor(Date.now() / 1000);
            const expires = parseInt(raffle.created_utc) + 86400;
            const isExpired = now > expires;

            const raffleId = raffle.id || raffle.post_id;

            const isEntered = raffle.status === "active";
            let linkColor = isEntered ? FVM_Colours.orange : FVM_Colours.blue;
            let label = isEntered ? "Entered" : "New Raffle";
            let rowClass = isEntered ? "fvm_entered" : "fvm_new";
            let btn = "";
            if (isExpired) {
              linkColor = FVM_Colours.blue;
              rowClass = "fvm_expired";
              if (raffle.winner.length === 0) {
                label = "Done, did you win?";
              } else {
                if (raffle.winner === user) {
                  label = "🎉 You won! Claim! 🎉";
                  rowClass += " fvm_winner";
                } else {
                  label = `Winner: ${raffle.winner} `;
                  btn = `<button class="fvm-raffle-ok" data-postid="${raffleId}">
                    OK
                  </button>`;
                }
              }
            }

            html += `
                <div class="fvm-raffle-row ${rowClass}">
                  <a href="${raffle.url}" 
                    class="fvm-raffle-link" 
                    data-postid="${raffleId}" 
                    data-status="${raffle.status}"
                    data-winner="${raffle.winner}"
                    data-isexpired="${isExpired}"
                    style="color: ${linkColor};">
                    • ${label}
                  </a>
                  ${btn}
                  <span class="fvm-timer" data-created="${raffle.created_utc}" data-author="${raffle.author}" data-winner="${raffle.winner}" >...</span>
                </div>`;
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
          const author = target.getAttribute("data-author");
          const winner = target.getAttribute("data-winner");
          const created = parseInt(target.getAttribute("data-created"));
          FVM_Modal.showInfo(author, winner, created);
          return;
        }

        // --- NEW: HANDLE RAFFLE LINK CLICK ---
        if (target.classList.contains("fvm-raffle-link")) {
          const postId = target.getAttribute("data-postid");
          const status = target.getAttribute("data-status");
          const winner = target.getAttribute("data-winner");
          const isExpired = target.getAttribute("data-isexpired") === "true";
          const newStatus = isExpired ? "done" : "active";
          if (status === newStatus) return; // No change needed
          try {
            // Replicating your old sendLinkStatus logic
            await FVM_API.sendToServer(
              "link",
              {
                user: user,
                post_id: postId,
                status: newStatus,
              },
              "POST",
            );

            //console.log(`FVM_UI Link ID '${postId}' updated to '${newStatus}'`);
            target.style.color = FVM_Colours.orange; // Change color to indicate entered
            target.innerHTML = isExpired ? "✅ Checked" : "✅ Entered"; // Update label
            // Optional: Refresh data to show the "(Entered)" label immediately
            //this.refreshPopup();
            // 2. Create the separate clickable span

            // clear the classes that indicate new/expired if the user has already clicked on them
            const row = target.closest(".fvm-raffle-row");

            // 2. Remove the fvm_new class if it exists
            if (row && row.classList.contains("fvm_new")) {
              row.classList.remove("fvm_new");
            }
            if (row && row.classList.contains("fvm_expired")) {
              row.classList.remove("fvm_expired");
            }
            // end of clearing classes

            if (newStatus === "done" && winner.length === 0) {
              // because the save button looks at the current url the user can't save unless they're on the page
              const bodyContainer = document.getElementById("fvm-body");
              const existingBtn =
                bodyContainer.querySelector(".fvm-save-winner");

              if (existingBtn) {
                existingBtn.remove();
              }

              const saveBtn = document.createElement("span");
              saveBtn.className = "fvm-save-winner";
              saveBtn.setAttribute("data-postid", postId);
              saveBtn.innerHTML = "💾 Save";

              // 3. Add some style to make it look clickable
              saveBtn.style.cursor = "pointer";
              //saveBtn.style.textDecoration = "underline";
              saveBtn.style.marginLeft = "8px";
              //saveBtn.style.color = "#FF4500"; // Reddit Orange-Red

              // 4. Append it as a new child of the link
              target.after(saveBtn);
            }
          } catch (err) {
            console.error("Error updating link status:", err);
          }
          return; // Let the default anchor behavior open the link
        }

        if (target.classList.contains("fvm-raffle-ok")) {
          const postId = target.getAttribute("data-postid");

          try {
            // Replicating your old sendLinkStatus logic
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
            const row = target.closest(".fvm-raffle-row");
            row.classList.remove("fvm_expired");
          } catch (err) {
            console.error("Error updating raffle as done - ok button:", err);
          }
        }

        if (target.classList.contains("fvm-save-winner")) {
          const postId = target.getAttribute("data-postid");
          const winnerName = await FVM_Extractor.saveRaffleData(postId);
          target.textContent = "Saved!";
          target.classList.remove("fvm-save-winner");

          const infoSpan =
            target.parentElement.querySelector(".fvm-info-trigger");
          if (infoSpan) {
            infoSpan.setAttribute("data-winner", winnerName);
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

    async renderPills(user) {
      const container = document.getElementById("fvm-pills");
      try {
        const data = await FVM_API.sendToServer("gotits", { user }, "GET");
        const list = Array.isArray(data)
          ? data
          : data
            ? Object.values(data).flat()
            : [];
        if (list.length === 0) return;

        container.innerHTML = `<div style="font-size:0.75em; color:#888;">Collected:</div>`;
        list.forEach((kw) => {
          const p = document.createElement("span");
          p.className = "gotit-pill";
          p.textContent = kw;
          p.onclick = async () => {
            //if (confirm(`Reactivate ${kw}?`)) {
            await FVM_API.sendToServer(
              "delete_keyword",
              { user: user, keyword: kw },
              "POST",
            );
            this.refreshPopup();
            //}
          };
          container.appendChild(p);
        });
      } catch (e) {}
    },

    jumpToRow(btnSelector, rowSelector) {
      const nextRow = document.querySelector(`.${rowSelector}`);

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
