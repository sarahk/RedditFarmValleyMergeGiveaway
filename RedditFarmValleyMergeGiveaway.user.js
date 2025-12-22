// ==UserScript==
// @name         FarmMergeValley Giveaway Pop-up
// @namespace    http://tampermonkey.net/
// @version      2.30
// @updateURL    https://github.com/sarahk/RedditFarmValleyMergeGiveaway/raw/refs/heads/main/RedditFarmValleyMergeGiveaway.user.js
// @downloadURL  https://github.com/sarahk/RedditFarmValleyMergeGiveaway/raw/refs/heads/main/RedditFarmValleyMergeGiveaway.user.js
// @description  Fetches Reddit giveaway/raffle data, filters it, and displays results in a floating pop-up using a centralized API.
// @author       itamer
// @match        https://sh.reddit.com/r/FarmMergeValley/*
// @match        https://www.reddit.com/r/FarmMergeValley/*
// @match        https://sh.reddit.com/r/ClubSusan/*
// @match        https://www.reddit.com/r/ClubSusan/*
// @connect      reddit.com
// @connect      www.reddit.com
// @connect      sh.reddit.com
// @connect      fvm.itamer.com
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-idle
// @sandbox      js
// ==/UserScript==

(function () {
  ("use strict");
  console.log(window.IITC);

  // --- Configuration ---
  const REDDIT_FEED_URL =
    "https://www.reddit.com/r/FarmMergeValley/search.json?q=flair_name%3A%22%F0%9F%8E%81+Raffles%2FGiveaways%22&restrict_sr=1&sort=new&t=month";
  const REDDIT_SEARCH_URL =
    "https://www.reddit.com/r/FarmMergeValley/search.json/?q=flannels";
  const USER_AGENT = "browser:FarmMergeValley-Sticker-App:v2.4 (by /u/itamer)";
  const GIVEAWAY_PREFIX = "[Sticker Giveaway]";

  // API Configuration
  const API_TARGET_URL = "https://fvm.itamer.com/api.php";
  const API_SECRET_KEY = "pum@90Nervous";

  // Storage Key for User ID
  const USER_ID_STORAGE_KEY = "fvm_user_id";

  const TWENTY_FOUR_HOURS_S = 24 * 60 * 60;

  // Global variable to hold the user ID once validated
  let CURRENT_USER_ID = null;

  // --- Utility Functions (addStyle, gmXhrPromise, etc. remain the same) ---

  function addStyle(css) {
    if (typeof GM_addStyle !== "undefined") {
      GM_addStyle(css);
      return;
    }
    const style = document.createElement("style");
    style.type = "text/css";
    style.textContent = css;
    (document.head || document.body || document.documentElement).appendChild(
      style
    );
  }

  function gmXhrPromise(url) {
    return new Promise((resolve, reject) => {
      console.log(`[XHR] Initializing request to: ${url}`);

      // We use the underscore version for better compatibility with older headers
      const xhr =
        typeof GM_xmlhttpRequest !== "undefined"
          ? GM_xmlhttpRequest
          : GM.xmlHttpRequest;

      xhr({
        method: "GET",
        url: url,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        timeout: 10000,

        // This will tell us if the request actually leaves the browser
        onprogress: (res) =>
          console.log(`[XHR] Progress: ${res.loaded} bytes received`),

        onload: function (response) {
          console.log(`[XHR] Status Code: ${response.status}`);
          if (response.status === 200) {
            resolve(response.responseText);
          } else if (response.status === 301 || response.status === 302) {
            console.error(
              "[XHR] Redirect detected. Reddit is trying to move the URL."
            );
            reject(new Error("Redirect Blocked"));
          } else {
            reject(new Error(`Reddit API Error: ${response.status}`));
          }
        },

        onerror: function (response) {
          console.error(
            "[XHR] Network-level error. This usually means a CORS or CSP block."
          );
          reject(response);
        },

        ontimeout: function () {
          console.error("[XHR] Request timed out at the extension level.");
          reject(new Error("Timeout"));
        },
      });
    });
  }

  // Renamed and fixed function (must be placed where your original sendFMBApiRequest was)
  function sendFVMApiRequest(what, data = {}, method = "POST") {
    const isGet = method.toUpperCase() === "GET";
    let url = API_TARGET_URL;
    let payload = null;
    let headers = {
      "X-Api-Key": API_SECRET_KEY,
    };

    if (isGet) {
      // GET Request (e.g., what=feed)
      const params = new URLSearchParams(data);
      url += `?what=${what}&${params.toString()}`;
      console.log(["get", url]);
    } else {
      // POST Request (sends data as standard form data)
      headers["Content-Type"] = "application/x-www-form-urlencoded";

      const requestObject = { what: what, ...data };
      const params = new URLSearchParams();

      for (const key in requestObject) {
        if (requestObject.hasOwnProperty(key)) {
          // Ensure complex objects (like the 'post' payload) are stringified
          let value = requestObject[key];
          if (typeof value === "object" && value !== null) {
            value = JSON.stringify(value);
          }
          params.append(key, value);
        }
      }
      payload = params.toString();
    }
    console.log(url);
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: method,
        url: url,
        headers: headers,
        data: payload,

        // --- CRITICAL: THE RESTORED ONLOAD LOGIC ---
        onload: function (response) {
          console.log(
            `API_CALL: Received response for '${what}'. Status: ${response.status}`
          );

          try {
            // Even on success, the response must be parsed (e.g., status: success)
            // Added resilience for empty successful responses
            let jsonResponse;
            if (response.responseText && response.responseText.trim() !== "") {
              jsonResponse = JSON.parse(response.responseText);
            } else if (response.status >= 200 && response.status < 300) {
              jsonResponse = {
                status: "success",
                message: "Empty successful response received.",
              };
            } else {
              throw new Error("Empty or invalid response from API.");
            }

            if (response.status >= 200 && response.status < 300) {
              console.log(`API_CALL: Resolved successfully for '${what}'.`);
              resolve(jsonResponse); // Resolves the Promise!
            } else {
              console.error(
                `API FAILED (${what}): Status ${response.status}`,
                jsonResponse
              );
              reject(
                new Error(
                  `API failed (${what}): ${response.status} - ${
                    jsonResponse.error || response.responseText
                  }`
                )
              ); // Rejects the Promise!
            }
          } catch (e) {
            // This catches the JSON parsing error
            console.error(payload);
            console.error(
              `API RESPONSE PARSE FAILED (${what}):`,
              e,
              response.responseText
            );
            reject(
              new Error(
                `API response parse failed (${what}): ${response.status} - ${response.responseText}`
              )
            ); // Rejects the Promise!
          }
        },
        // --- CRITICAL: THE RESTORED ONERROR LOGIC ---
        onerror: function (response) {
          console.error(
            `API_CALL: Rejected (Network Error) for '${what}'.`,
            response
          );
          reject(
            new Error(
              `Network Error contacting external API (${what}): ${
                response.error || "Check Network Tab for details."
              }`
            )
          ); // Rejects the Promise!
        },
      });
    });
  }

  // --- Logic Functions ---

  const getStoredUserId = () => {
    let userId = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (userId) {
      CURRENT_USER_ID = userId.trim();
      return CURRENT_USER_ID;
    }
    return null;
  };

  /**
   * Parses the title to extract Priority (Stars) and Keyword.
   */
  const parseTitle = (title) => {
    if (!title.startsWith(GIVEAWAY_PREFIX)) return null;
    const regex = new RegExp(
      `${GIVEAWAY_PREFIX}.*?(\\d+)\\s*Star(s)?\\s+(.+?)\\s+Sticker`,
      "i"
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
  };

  /**
   * NEW: Parses the raw Reddit JSON feed and cuts down the data to only essentials.
   */
  function processRawRedditData(jsonText) {
    try {
      const rawFeed = JSON.parse(jsonText);
      const children = rawFeed?.data?.children || [];
      const minimalPosts = [];

      children.forEach((child) => {
        const post = child.data;
        const parsed = parseTitle(post.title);

        if (parsed) {
          minimalPosts.push({
            id: post.name, // Reddit prefix t3_...
            url: post.url,
            title: post.title,
            keyword: parsed.keyword,
            stars: parsed.stars,
            created_utc: post.created_utc,
          });
        }
      });

      console.log(
        `Processed ${minimalPosts.length} raffle posts for API ingestion.`
      );
      return minimalPosts;
    } catch (e) {
      console.error("Failed to process raw Reddit JSON:", e);
      throw new Error("Data processing failed.");
    }
  }

  /**
   * Fetches the raw Reddit JSON feed, processes it, and POSTs the minimal data to the API.
   */
  async function ingestRedditFeed() {
    await getRedditFeed(REDDIT_FEED_URL);
  }

  // 2. Update getRedditFeed to await the API save
  async function getRedditFeed(reddit_url) {
    try {
      console.log("Fetching Reddit Feed:", reddit_url);
      const responseText = await gmXhrPromise(reddit_url);
      const minimalData = processRawRedditData(responseText);

      if (minimalData.length > 0) {
        const savedFeed = { payload: minimalData };
        // Await this so the loop knows when processing is truly done
        await sendFVMApiRequest("post", savedFeed, "POST");
        console.log(`Saved ${minimalData.length} posts to API.`);
      }
    } catch (error) {
      console.error(
        "Background task failed for URL:",
        reddit_url,
        error.message
      );
    }
  }

  // 3. Update runBackgroundTasks with a proper for...of loop

  async function runBackgroundTasks() {
    const LAST_RUN_KEY = "fvm_last_background_run";
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    const lastRun = localStorage.getItem(LAST_RUN_KEY);

    // Only run if there's no timestamp OR if current time is > 1 hour since last run
    if (!lastRun || now - parseInt(lastRun) > ONE_HOUR_MS) {
      try {
        console.log("Background Tasks: Starting scheduled hourly update...");

        const response = await sendFVMApiRequest("keywords", {}, "GET");
        const keywords = Array.isArray(response)
          ? response
          : response.data || [];

        if (keywords.length > 0) {
          for (const keyword of keywords) {
            let safeKeyword = encodeURIComponent(keyword.trim());
            const searchUrl = `https://www.reddit.com/r/FarmMergeValley/search.json?q=${safeKeyword}&restrict_sr=1&sort=new&t=month`;
            await getRedditFeed(searchUrl);
          }

          // Save the current timestamp AFTER successful completion
          localStorage.setItem(LAST_RUN_KEY, now.toString());
          console.log("Background Tasks: Update complete. Timestamp saved.");
        }

        const refreshBtn = document.getElementById("fmv-refresh-btn");
        if (refreshBtn) {
          refreshBtn.classList.remove("hidden");
        }
      } catch (error) {
        console.error("Error running backgroundTasks:", error.message);
      }
    } else {
      const minutesRemaining = Math.round(
        (ONE_HOUR_MS - (now - parseInt(lastRun))) / 60000
      );
      console.log(
        `Background Tasks: Skipping. Next update available in ${minutesRemaining} minutes.`
      );

      // Still unhide the button so the user can manual refresh if they want
      const refreshBtn = document.getElementById("fmv-refresh-btn");
      if (refreshBtn) {
        refreshBtn.classList.remove("hidden");
      }
    }
  }

  // Remaining functions (fetchUserFeed, fetchAndProcessFeed, sendKeywordGot, sendLinkStatus)
  // remain the same as they correctly call sendFVMApiRequest.

  async function fetchUserFeed() {
    try {
      const response = await sendFVMApiRequest(
        "feed",
        { user: CURRENT_USER_ID },
        "GET"
      );
      console.log(["fetchUserFeed", response, response.data]);
      //return response.data;
      return response;
    } catch (error) {
      console.error("Error fetching user feed (GET):", error.message);
      throw error;
    }
  }

  const fetchAndProcessFeed = async () => {
    let ingestionSucceeded = false;

    // 1. Attempt Ingestion (POST request) - Make this non-critical
    try {
      console.log("F&PF: Starting ingestion...");
      await ingestRedditFeed();
      ingestionSucceeded = true;
      console.log(
        "F&PF: Ingestion complete. Starting feed fetch (GET request)..."
      );
    } catch (e) {
      console.warn(
        "F&PF: Warning: Reddit ingestion failed. Proceeding with old feed retrieval.",
        e
      );
      // ingestionSucceeded remains false
    }

    // 2. Attempt Feed Retrieval (GET request) - This remains critical
    try {
      const groupedData = await fetchUserFeed();
      console.log("F&PF: Feed fetch complete.");

      // Return the data AND the ingestion status flag
      return {
        data: groupedData,
        isUpToDate: ingestionSucceeded, // Will be false if ingestRedditFeed failed
      };
    } catch (error) {
      console.error("Failed to fetch user feed (GET request failed):", error);
      // Return null if the final GET request fails, which triggers the critical message
      return null;
    }
  };

  const sendKeywordGot = async (keyword) => {
    try {
      await sendFVMApiRequest(
        "gotit",
        { user: CURRENT_USER_ID, keyword: keyword },
        "POST"
      );
      console.log(`Keyword '${keyword}' marked as collected via API.`);
    } catch (error) {
      console.error("Error sending gotit status to API:", error.message);
      alert(`Failed to mark keyword as collected: ${keyword}. Check console.`);
    }
  };

  const sendLinkStatus = async (postId, status) => {
    try {
      await sendFVMApiRequest(
        "link",
        { user: CURRENT_USER_ID, post_id: postId, status: status },
        "POST"
      );
      console.log(`Link ID '${postId}' updated to status '${status}' via API.`);
    } catch (error) {
      console.error("Error sending link status to API:", error.message);
      alert(`Failed to update link status: ${postId}. Check console.`);
    }
  };

  // --- UI Logic (functions handleUsernameSubmit, injectPopupHtml, renderPopupContent, attachEventListeners remain the same) ---

  const attachEventListeners = () => {
    console.log("function: attachEventListeners");
    document.querySelectorAll(".got-it-btn").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const keyword = event.target.dataset.keyword;
        if (keyword) {
          try {
            // 1. Call the API to mark the keyword as collected
            await sendKeywordGot(keyword);

            // 2. Find the current <li> containing the keyword and button
            const keywordLi = event.target.closest("li");

            // 3. Find the immediate next sibling, which is the <ul> of links for this keyword
            const linksUl = keywordLi.nextElementSibling;

            // 4. Remove the entire keyword group from the DOM
            if (linksUl && linksUl.tagName === "UL") {
              linksUl.remove(); // Remove the list of links
            }
            keywordLi.remove(); // Remove the keyword and "Got It!" button

            // NOTE: If you also want to update the total count in the header,
            // you would need to recalculate and update the header text here.
          } catch (error) {
            // Handle the case where the API call failed (if sendKeywordGot throws)
            console.error("Failed to mark keyword as collected.", error);
            alert(
              "Could not mark sticker as collected. Check the console for details."
            );
          }
        }
      });
    });

    document.querySelectorAll(".giveaway-link").forEach((link) => {
      link.addEventListener("click", async (event) => {
        const id = event.target.dataset.id;
        const currentStatus = event.target.dataset.status;
        const createdUtc = parseInt(event.target.dataset.createdutc);

        if (!id || !createdUtc) return;

        let nextStatus = currentStatus;
        const currentTimeSeconds = Math.floor(Date.now() / 1000);

        if (currentStatus === "null") {
          nextStatus = "active";
        } else if (
          currentStatus === "active" &&
          currentTimeSeconds - createdUtc > TWENTY_FOUR_HOURS_S
        ) {
          nextStatus = "done";
        }

        if (nextStatus !== currentStatus) {
          await sendLinkStatus(id, nextStatus);
          event.target.dataset.status = nextStatus;

          if (nextStatus === "done") {
            event.target.style.textDecoration = "line-through";
            event.target.style.color = "#888";
            event.target.textContent = event.target.textContent.replace(
              "(active)",
              "(done)"
            );
          } else if (nextStatus === "active") {
            event.target.style.color = "#f7a01d";
            event.target.textContent = event.target.textContent.replace(
              "(null)",
              "(active)"
            );
          }
        }
      });
    });
  };

  function handleUsernameSubmit() {
    const inputField = document.getElementById("fvm-username-input");
    const username = inputField.value.trim();

    if (username.length > 2) {
      localStorage.setItem(USER_ID_STORAGE_KEY, username);
      CURRENT_USER_ID = username;
      initApp(true);
    } else {
      alert("Please enter a username with at least 3 characters.");
    }
  }

  function injectPopupHtml() {
    let popup = document.getElementById("fvm-giveaways-popup");

    if (popup) {
      const inputArea = document.getElementById("fvm-user-input-area");
      if (inputArea) {
        return {
          popup: popup,
          inputArea: inputArea,
          body: document.getElementById("fvm-popup-body"),
          header: document.getElementById("fvm-popup-header"), // <-- ADD THIS LINE
        };
      } else {
        popup.remove();
        popup = null;
      }
    }

    // --- Inject Styles ---
    addStyle(`
        #fvm-giveaways-popup {
            z-index: 10000;
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 300px;
            background: #f9f9f9;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            font-family: Arial, sans-serif;
            font-size: 14px;
            display: none;
        }
        #fvm-popup-header {
            background-color: #E2852E;
            color: white;
            padding: 8px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
        }
        #fvm-popup-body {
            padding: 15px 10px;
            max-height: 400px;
            overflow-y: auto;
        }
        #fvm-user-input-area {
            padding: 15px 10px;
            border-bottom: 1px solid #ddd;
        }
        #fvm-user-input-area input[type="text"] {
            width: 60%;
            padding: 5px;
            margin-right: 5px;
            border: 1px solid #ccc;
            border-radius: 4px;
        }
        #fvm-user-input-area button {
            padding: 6px 10px;
            border: none;
            border-radius: 4px;
            background-color: #5cb85c;
            color: white;
            cursor: pointer;
        }
        #fvm-popup-footer {
            border-top: 1px solid #eee;
            padding: 8px 10px;
            text-align: right;
        }
        .fvm-popup-close-btn {
            background: none;
            border: none;
            color: white;
            font-size: 1.2em;
            cursor: pointer;
            line-height: 1;
        }
        .got-it-btn {
            background-color: #5a5a8a;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.8em;
        }
            .gotit-pill {
              display: inline-block;
              background-color: #F5C857;
              color: #333;
              padding: 2px 8px;
              margin: 2px;
              border-radius: 12px;
              font-size: 0.75em;
              cursor: pointer;
              border: 1px solid #d4a017;
          }
          .gotit-pill:hover {
              background-color: #e2b43d;
              text-decoration: line-through;
          }
        .hidden { display: none !important; }
        `);

    // --- Create and Inject HTML ---
    popup = document.createElement("div");
    popup.id = "fvm-giveaways-popup";
    popup.innerHTML = `
        <div id="fvm-popup-header">
            <span>Sticker Giveaways</span>
            <button class="fvm-popup-close-btn" id="fvm-close-btn">×</button>
        </div>

        <div id="fvm-user-input-area">
            <p style="margin-top: 0; font-size: 0.9em; color: #555;">
                Enter a unique username (e.g., Reddit ID) to start tracking:
            </p>
            <input type="text" id="fvm-username-input" placeholder="Your Username" value=""/>
            <button id="fvm-submit-user-btn">Start</button>
        </div>

        <div id="fvm-popup-body">
            <p>Loading raffles...</p>
        </div>

        <div id="fvm-popup-footer">
        <button id="fvm-refresh-btn" title="Refreshes the raffle list." class='hidden'>Refresh</button>
            <button id="fvm-reset-btn" title="Clears the locally stored username. Use this if the script is not tracking correctly.">Clear User ID</button>
        </div>
    `;
    document.body.appendChild(popup);

    attachUIListeners();

    return {
      popup: popup,
      inputArea: document.getElementById("fvm-user-input-area"),
      body: document.getElementById("fvm-popup-body"),
      header: document.getElementById("fvm-popup-header"), // <-- ADD THIS LINE
    };
  }

  function attachUIListeners() {
    // --- Attach UI Listeners ---
    console.log("function attachUIListeners");
    //console.log(document.getElementById('fvm-close-btn'));
    document.getElementById("fvm-close-btn").addEventListener("click", () => {
      console.log("closing popup");
      document.getElementById("fvm-giveaways-popup").style.display = "none";
    });

    document
      .getElementById("fvm-submit-user-btn")
      .addEventListener("click", handleUsernameSubmit);
    document
      .getElementById("fvm-username-input")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          handleUsernameSubmit();
        }
      });

    document.getElementById("fvm-reset-btn").addEventListener("click", () => {
      if (
        confirm("Are you sure you want to clear your locally stored User ID?")
      ) {
        localStorage.removeItem(USER_ID_STORAGE_KEY);
        location.reload();
      }
    });

    document
      .getElementById("fvm-refresh-btn")
      .addEventListener("click", async (e) => {
        const btn = e.target;

        // 1. Disable the button and show a loading state so the user doesn't double-click
        btn.disabled = true;
        btn.textContent = "Refreshing...";
        btn.classList.add("loading-spinner"); // If you have a spinner style

        // 2. Run the tasks and WAIT for completion
        // Note: You must update runBackgroundTasks to be properly 'awaitable'
        // using a for...of loop as discussed previously.
        await runBackgroundTasks();

        // 3. Re-render the UI with the fresh data
        const feedResult = await fetchAndProcessFeed();
        renderPopupContent(feedResult.data, feedResult.isUpToDate);

        // 4. Restore the button
        btn.disabled = false;
        btn.textContent = "Refresh";
      });
  }

  function getEntryVariables(createdUtc, entryStatus) {
    let timeTextStyle = "#333"; // Default text color for time

    // TWENTY_FOUR_HOURS_S is defined globally (around line 34)
    const expirationTime = createdUtc + TWENTY_FOUR_HOURS_S;
    const currentTime = Math.floor(Date.now() / 1000);
    const timeRemainingSeconds = expirationTime - currentTime;

    //let timeRemainingText;
    let linkStyle = "";
    let linkLabel = "New Raffle";
    let timeRemainingText = "default";

    if (timeRemainingSeconds > 0) {
      // Giveaway is active (time remaining)
      const hours = Math.floor(timeRemainingSeconds / 3600);
      const minutes = Math.floor((timeRemainingSeconds % 3600) / 60);

      if (hours > 0) {
        timeRemainingText = `${hours}h ${minutes}m`;
      } else {
        // If less than an hour, show minutes only, highlight in red if less than 15m
        if (minutes < 15) {
          timeTextStyle = "#a00";
        }
        timeRemainingText = `${minutes}m remaining`;
      }

      // Use linkStyle to indicate "Active" status (if marked by user)
      if (entryStatus === "active") {
        linkStyle = "color: #f7a01d; font-weight: bold;";
        linkLabel = "Raffle (you're in)";
      } else {
        linkStyle = ""; // Default for unclicked links
      }
    } else {
      // Giveaway is expired
      timeRemainingText = "EXPIRED";
      //linkStyle = 'text-decoration: line-through; color: #888;';
      timeTextStyle = "#a00"; // Highlight expired status
      linkLabel = "Done, did you win?";
    }
    return [timeRemainingText, timeTextStyle, linkLabel, linkStyle];
  }

  const fetchGotIts = async () => {
    try {
      return await sendFVMApiRequest(
        "gotits",
        { user: CURRENT_USER_ID },
        "GET"
      );
    } catch (e) {
      console.error("Failed to fetch GotIts:", e);
      return null;
    }
  };

  const deleteKeywordGot = async (keyword) => {
    try {
      await sendFVMApiRequest(
        "delete_keyword",
        {
          user: CURRENT_USER_ID,
          keyword: keyword,
        },
        "POST"
      );
      initApp(true); // Reload the UI
    } catch (e) {
      alert("Failed to delete keyword.");
    }
  };

  const renderGotItPills = async () => {
    const gotItsData = await fetchGotIts();
    if (!gotItsData) return;

    Object.keys(gotItsData).forEach((priority) => {
      const container = document.getElementById(`fvm-gotits${priority}`);
      if (container && gotItsData[priority].length > 0) {
        container.innerHTML = `<div style="margin-top: 5px; font-size: 0.8em; color: #777;">Collected:</div>`;
        gotItsData[priority].forEach((keyword) => {
          const pill = document.createElement("span");
          pill.className = "gotit-pill";
          pill.textContent = keyword;
          pill.onclick = () => {
            if (confirm(`Remove "${keyword}" from collected list?`)) {
              deleteKeywordGot(keyword);
            }
          };
          container.appendChild(pill);
        });
      }
    });
  };

  function renderPopupContent(groupedData, isUpToDate) {
    const uiElements = injectPopupHtml();
    const popupBody = uiElements.body;
    const header = uiElements.header; // <-- Added header reference for later use
    const popup = uiElements.popup;

    popupBody.innerHTML = "";
    console.log(["renderPopupContent", groupedData, isUpToDate]);

    let totalGiveaways = 0;
    let html = "";
    const priorities = Object.keys(groupedData).sort((a, b) => b - a);

    priorities.forEach((priority) => {
      const keywords = groupedData[priority];

      html += `<h3 style="margin: 5px 0 10px 0; font-size: 1.1em; color: #5a5a8a;">${priority} Star Raffles</h3><ul style="border-top: 1px solid #ddd; padding-top: 10px;">`;

      Object.keys(keywords).forEach((keyword) => {
        const entries = keywords[keyword];
        if (entries.length === 0) return;

        html += `<li style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
                        <strong style="flex-grow: 1;">${keyword}</strong>
                        <button class="got-it-btn" data-keyword="${keyword}">Got It!</button>
                    </li>
                    <ul style="list-style: disc; margin-left: 10px;">`;

        entries.forEach((entry) => {
          totalGiveaways++;

          // --- TIME CALCULATION LOGIC ---
          const [timeRemainingText, timeTextStyle, linkLabel, linkStyle] =
            getEntryVariables(entry.created_utc, entry.status);

          const linkStatus = entry.status || "null"; // Keep status for the data-attribute

          // --- UPDATED HTML GENERATION ---
          html += `<li style="margin-bottom: 3px; display: flex; align-items: baseline;">
                                <a href="${entry.url}" 
                                   class="fvm-giveaway-link giveaway-link"
                                   data-id="${entry.id}"
                                   data-status="${linkStatus}"
                                   data-createdutc="${entry.created_utc}"
                                   style="${linkStyle}">
                                    ${linkLabel}
                                </a>
                                <span style="font-size: 0.9em; margin-left: 10px; color: ${timeTextStyle};">
                                    (${timeRemainingText})
                                </span>
                            </li>`;
          // --- END UPDATED HTML GENERATION ---
        });
        html += "</ul>";
      });
      html +=
        "</ul><div id='fvm-gotits${priority}' style='margin-bottom: 15px; padding-left: 10px;'></div>";
    });

    // --- FINAL DOM UPDATE AND STATUS MESSAGE LOGIC (RESTORED/CORRECTED) ---

    if (totalGiveaways === 0) {
      let noGiveawaysMessage = "No new or active raffles found.";

      // State 2 (No items found AND ingestion failed) - refine the message
      if (!isUpToDate) {
        noGiveawaysMessage =
          "No current sticker raffles found. (Feed may be out of date.)";
      }

      popupBody.innerHTML = `<p style="text-align: center; margin-top: 20px;">${noGiveawaysMessage}</p>`;
      header.innerHTML = `<span>Sticker Raffles (0)</span><button class="fvm-popup-close-btn" id="fvm-close-btn">×</button>`;
    } else {
      popupBody.innerHTML = html;

      let headerTitle = `<span>Sticker Raffles (${totalGiveaways})</span>`;

      // State 2: Show the "may not be shown" warning message
      if (!isUpToDate) {
        headerTitle = `<span style="color: #f7a01d; font-weight: bold; font-size: 1.1em; padding-right: 15px;">Latest Raffles may not be shown</span>`;
      }

      header.innerHTML = `${headerTitle}<button class="fvm-popup-close-btn" id="fvm-close-btn">×</button>`;
      attachEventListeners();
      attachUIListeners();
    }

    popup.style.display = "block";
  }

  /**
   * Main function to initialize and run the application.
   */
  const initApp = async (skipUserIdCheck = false) => {
    const uiElements = injectPopupHtml();

    if (!uiElements || !uiElements.body) {
      console.error("Failed to inject or retrieve UI elements.");
      return;
    }

    if (!skipUserIdCheck && !getStoredUserId()) {
      uiElements.inputArea.style.display = "block";
      uiElements.body.innerHTML =
        "<p>Please enter your username above to view the Raffles feed.</p>";
      uiElements.popup.style.display = "block";
      return;
    }

    uiElements.inputArea.style.display = "none";
    uiElements.body.innerHTML = "<p>Loading Raffles...</p>";
    uiElements.popup.style.display = "block";

    //const groupedData = await fetchAndProcessFeed();
    //console.log(groupedData);

    // if (groupedData) {
    //     renderPopupContent(groupedData);
    // } else {
    //     uiElements.body.innerHTML = `<p style="color:red;">Error loading feed. Check browser console.</p>`;
    // }

    const feedResult = await fetchAndProcessFeed();

    if (feedResult && feedResult.data) {
      // State 1 & 2: API Feed is available. Always render the data.
      // The renderPopupContent handles the "may not be shown" warning based on isUpToDate.
      renderPopupContent(feedResult.data, feedResult.isUpToDate);
      renderGotItPills();
      runBackgroundTasks();
    } else {
      // State 3: The API GET request failed (feedResult is null). Show the critical error.
      uiElements.body.innerHTML = `<p style="color:red; font-size: 1.2em; text-align: center; padding: 20px;">Latest Giveaways didn't load.</p>`; // <-- CORRECTED MESSAGE
    }
  };

  // Initialize on page load
  initApp();
})();
