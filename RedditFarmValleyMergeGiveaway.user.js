// ==UserScript==
// @name         FarmMergeValley Giveaway Pop-up (API-Driven)
// @namespace    http://tampermonkey.net/
// @version      2.8
// @updateURL    https://github.com/sarahk/RedditFarmValleyMergeGiveaway/raw/refs/heads/main/RedditFarmValleyMergeGiveaway.user.js
// @downloadURL  https://github.com/sarahk/RedditFarmValleyMergeGiveaway/raw/refs/heads/main/RedditFarmValleyMergeGiveaway.user.js
// @description  Fetches Reddit giveaway data, filters it, and displays results in a floating pop-up using a centralized API.
// @author       itamer
// @match        https://sh.reddit.com/r/FarmMergeValley/*
// @match        https://www.reddit.com/r/FarmMergeValley/*
// @match        https://sh.reddit.com/r/ClubSusan/*
// @match        https://www.reddit.com/r/ClubSusan/*
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const REDDIT_FEED_URL = 'https://www.reddit.com/r/FarmMergeValley/search.json?q=flair_name%3A%22%F0%9F%8E%81+Raffles%2FGiveaways%22&restrict_sr=1&sort=new&t=month';
    const USER_AGENT = 'browser:FarmMergeValley-Sticker-App:v2.4 (by /u/itamer)';
    const GIVEAWAY_PREFIX = '[Sticker Giveaway]';

    // API Configuration
    const API_TARGET_URL = 'https://fvm.itamer.com/api.php';
    const API_SECRET_KEY = 'pum@90Nervous';

    // Storage Key for User ID
    const USER_ID_STORAGE_KEY = 'fmv_user_id';

    const TWENTY_FOUR_HOURS_S = 24 * 60 * 60;

    // Global variable to hold the user ID once validated
    let CURRENT_USER_ID = null;

    // --- Utility Functions (addStyle, gmXhrPromise, etc. remain the same) ---

    function addStyle(css) {
        if (typeof GM_addStyle !== 'undefined') {
            GM_addStyle(css);
            return;
        }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.textContent = css;
        (document.head || document.body || document.documentElement).appendChild(style);
    }

    function gmXhrPromise(url) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/json'
                },
                timeout: 15000,
                onload: function (response) {
                    if (response.status === 200) {
                        resolve(response.responseText);
                    } else {
                        console.error(`Reddit API failed with status ${response.status}`, response);
                        reject(new Error(`Reddit API failed with status ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: function (response) {
                    console.error(`NETWORK ERROR during Reddit API fetch:`, response);
                    reject(new Error(`Network error during GM.xmlHttpRequest: ${response.responseText}`));
                }
            });
        });
    }

    // Renamed and fixed function (must be placed where your original sendFMBApiRequest was)
    function sendFVMApiRequest(what, data = {}, method = 'POST') {
        const isGet = (method.toUpperCase() === 'GET');
        let url = API_TARGET_URL;
        let payload = null;
        let headers = {
            'X-Api-Key': API_SECRET_KEY
        };

        if (isGet) {
            // GET Request (e.g., what=feed)
            const params = new URLSearchParams(data);
            url += `?what=${what}&${params.toString()}`;
            console.log(['get', url])
        } else {
            // POST Request (sends data as standard form data)
            headers['Content-Type'] = 'application/x-www-form-urlencoded';

            const requestObject = {what: what, ...data};
            const params = new URLSearchParams();

            for (const key in requestObject) {
                if (requestObject.hasOwnProperty(key)) {
                    // Ensure complex objects (like the 'post' payload) are stringified
                    let value = requestObject[key];
                    if (typeof value === 'object' && value !== null) {
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
                    console.log(`API_CALL: Received response for '${what}'. Status: ${response.status}`);

                    try {
                        // Even on success, the response must be parsed (e.g., status: success)
                        // Added resilience for empty successful responses
                        let jsonResponse;
                        if (response.responseText && response.responseText.trim() !== "") {
                            jsonResponse = JSON.parse(response.responseText);
                        } else if (response.status >= 200 && response.status < 300) {
                            jsonResponse = {status: 'success', message: 'Empty successful response received.'};
                        } else {
                            throw new Error("Empty or invalid response from API.");
                        }

                        if (response.status >= 200 && response.status < 300) {
                            console.log(`API_CALL: Resolved successfully for '${what}'.`);
                            resolve(jsonResponse); // Resolves the Promise!
                        } else {
                            console.error(`API FAILED (${what}): Status ${response.status}`, jsonResponse);
                            reject(new Error(`API failed (${what}): ${response.status} - ${jsonResponse.error || response.responseText}`)); // Rejects the Promise!
                        }
                    } catch (e) {
                        // This catches the JSON parsing error
                        console.error(payload);
                        console.error(`API RESPONSE PARSE FAILED (${what}):`, e, response.responseText);
                        reject(new Error(`API response parse failed (${what}): ${response.status} - ${response.responseText}`)); // Rejects the Promise!
                    }
                },
                // --- CRITICAL: THE RESTORED ONERROR LOGIC ---
                onerror: function (response) {
                    console.error(`API_CALL: Rejected (Network Error) for '${what}'.`, response);
                    reject(new Error(`Network Error contacting external API (${what}): ${response.error || 'Check Network Tab for details.'}`)); // Rejects the Promise!
                }
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
        const regex = new RegExp(`${GIVEAWAY_PREFIX}.*?(\\d+)\\s*Star(s)?\\s+(.+?)\\s+Sticker`, 'i');
        const match = title.match(regex);

        if (match && match.length >= 4) {
            const stars = parseInt(match[1]);
            const keyword = match[3].trim();
            if (stars >= 1 && stars <= 5 && keyword) {
                return {stars, keyword};
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

            children.forEach(child => {
                const post = child.data;
                const parsed = parseTitle(post.title);

                if (parsed) {
                    minimalPosts.push({
                        id: post.name, // Reddit prefix t3_...
                        url: post.url,
                        title: post.title,
                        keyword: parsed.keyword,
                        stars: parsed.stars,
                        created_utc: post.created_utc
                    });
                }
            });

            console.log(`Processed ${minimalPosts.length} giveaway posts for API ingestion.`);
            return minimalPosts;
        } catch (e) {
            console.error('Failed to process raw Reddit JSON:', e);
            throw new Error('Data processing failed.');
        }
    }


    /**
     * Fetches the raw Reddit JSON feed, processes it, and POSTs the minimal data to the API.
     */
    async function ingestRedditFeed() {
        try {
            console.log('Get Reddit Feed');
            const responseText = await gmXhrPromise(REDDIT_FEED_URL);
            console.log(['Feed received', responseText]);
            // --- CRITICAL CHANGE: Process data before sending ---
            const minimalData = processRawRedditData(responseText);

            console.log("API Ingestion Request Payload:", minimalData);

            // The API expects a 'payload' key containing the array of minimal post data
            sendFVMApiRequest('post', minimalData, 'POST');

        } catch (error) {
            console.error('CRITICAL FAILURE: Reddit or API POST (Ingestion) failed.', error.message);
            throw new Error(`Ingestion failed: ${error.message}`);
        }
    }

    // Remaining functions (fetchUserFeed, fetchAndProcessFeed, sendKeywordGot, sendLinkStatus)
    // remain the same as they correctly call sendFVMApiRequest.

    async function fetchUserFeed() {
        try {
            const response = await sendFVMApiRequest('feed', {user: CURRENT_USER_ID}, 'GET');
            console.log(['fetchUserFeed', response, response.data]);
            //return response.data;
            return response;
        } catch (error) {
            console.error('Error fetching user feed (GET):', error.message);
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
            console.log("F&PF: Ingestion complete. Starting feed fetch (GET request)...");
        } catch (e) {
            console.warn("F&PF: Warning: Reddit ingestion failed. Proceeding with old feed retrieval.", e);
            // ingestionSucceeded remains false
        }

        // 2. Attempt Feed Retrieval (GET request) - This remains critical
        try {
            const groupedData = await fetchUserFeed();
            console.log("F&PF: Feed fetch complete.");

            // Return the data AND the ingestion status flag
            return {
                data: groupedData,
                isUpToDate: ingestionSucceeded // Will be false if ingestRedditFeed failed
            };

        } catch (error) {
            console.error("Failed to fetch user feed (GET request failed):", error);
            // Return null if the final GET request fails, which triggers the critical message
            return null;
        }
    }

    const sendKeywordGot = async (keyword) => {
        try {
            await sendFVMApiRequest('gotit', {user: CURRENT_USER_ID, keyword: keyword}, 'POST');
            console.log(`Keyword '${keyword}' marked as collected via API.`);
        } catch (error) {
            console.error('Error sending gotit status to API:', error.message);
            alert(`Failed to mark keyword as collected: ${keyword}. Check console.`);
        }
    };

    const sendLinkStatus = async (postId, status) => {
        try {
            await sendFVMApiRequest('link', {user: CURRENT_USER_ID, post_id: postId, status: status}, 'POST');
            console.log(`Link ID '${postId}' updated to status '${status}' via API.`);
        } catch (error) {
            console.error('Error sending link status to API:', error.message);
            alert(`Failed to update link status: ${postId}. Check console.`);
        }
    };

    // --- UI Logic (functions handleUsernameSubmit, injectPopupHtml, renderPopupContent, attachEventListeners remain the same) ---

    const attachEventListeners = () => {
        document.querySelectorAll('.got-it-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const keyword = event.target.dataset.keyword;
                if (keyword) {
                    try {
                        // 1. Call the API to mark the keyword as collected
                        await sendKeywordGot(keyword);

                        // 2. Find the current <li> containing the keyword and button
                        const keywordLi = event.target.closest('li');

                        // 3. Find the immediate next sibling, which is the <ul> of links for this keyword
                        const linksUl = keywordLi.nextElementSibling;

                        // 4. Remove the entire keyword group from the DOM
                        if (linksUl && linksUl.tagName === 'UL') {
                            linksUl.remove(); // Remove the list of links
                        }
                        keywordLi.remove(); // Remove the keyword and "Got It!" button

                        // NOTE: If you also want to update the total count in the header,
                        // you would need to recalculate and update the header text here.

                    } catch (error) {
                        // Handle the case where the API call failed (if sendKeywordGot throws)
                        console.error("Failed to mark keyword as collected.", error);
                        alert("Could not mark sticker as collected. Check the console for details.");
                    }
                }
            });
        });

        document.querySelectorAll('.giveaway-link').forEach(link => {
            link.addEventListener('click', async (event) => {
                const id = event.target.dataset.id;
                const currentStatus = event.target.dataset.status;
                const createdUtc = parseInt(event.target.dataset.createdutc);

                if (!id || !createdUtc) return;

                let nextStatus = currentStatus;
                const currentTimeSeconds = Math.floor(Date.now() / 1000);

                if (currentStatus === 'null') {
                    nextStatus = 'active';
                } else if (currentStatus === 'active' && (currentTimeSeconds - createdUtc > TWENTY_FOUR_HOURS_S)) {
                    nextStatus = 'done';
                }

                if (nextStatus !== currentStatus) {
                    await sendLinkStatus(id, nextStatus);
                    event.target.dataset.status = nextStatus;

                    if (nextStatus === 'done') {
                        event.target.style.textDecoration = 'line-through';
                        event.target.style.color = '#888';
                        event.target.textContent = event.target.textContent.replace('(active)', '(done)');
                    } else if (nextStatus === 'active') {
                        event.target.style.color = '#f7a01d';
                        event.target.textContent = event.target.textContent.replace('(null)', '(active)');
                    }
                }
            });
        });
    };

    function handleUsernameSubmit() {
        const inputField = document.getElementById('fmv-username-input');
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
        let popup = document.getElementById('fmv-giveaways-popup');

        if (popup) {
            const inputArea = document.getElementById('fmv-user-input-area');
            if (inputArea) {
                return {
                    popup: popup,
                    inputArea: inputArea,
                    body: document.getElementById('fmv-popup-body'),
                    header: document.getElementById('fmv-popup-header') // <-- ADD THIS LINE
                };
            } else {
                popup.remove();
                popup = null;
            }
        }

        // --- Inject Styles ---
        addStyle(`
        #fmv-giveaways-popup {
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
        #fmv-popup-header {
            background-color: #E2852E;
            color: white;
            padding: 8px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
        }
        #fmv-popup-body {
            padding: 15px 10px;
            max-height: 400px;
            overflow-y: auto;
        }
        #fmv-user-input-area {
            padding: 15px 10px;
            border-bottom: 1px solid #ddd;
        }
        #fmv-user-input-area input[type="text"] {
            width: 60%;
            padding: 5px;
            margin-right: 5px;
            border: 1px solid #ccc;
            border-radius: 4px;
        }
        #fmv-user-input-area button {
            padding: 6px 10px;
            border: none;
            border-radius: 4px;
            background-color: #5cb85c;
            color: white;
            cursor: pointer;
        }
        #fmv-popup-footer {
            border-top: 1px solid #eee;
            padding: 8px 10px;
            text-align: right;
        }
        .fmv-popup-close-btn {
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
        `);

        // --- Create and Inject HTML ---
        popup = document.createElement('div');
        popup.id = 'fmv-giveaways-popup';
        popup.innerHTML = `
        <div id="fmv-popup-header">
            <span>Sticker Giveaways</span>
            <button class="fmv-popup-close-btn" id="fmv-close-btn">×</button>
        </div>

        <div id="fmv-user-input-area">
            <p style="margin-top: 0; font-size: 0.9em; color: #555;">
                Enter a unique username (e.g., Reddit ID) to start tracking:
            </p>
            <input type="text" id="fmv-username-input" placeholder="Your Username" value=""/>
            <button id="fmv-submit-user-btn">Start</button>
        </div>

        <div id="fmv-popup-body">
            <p>Loading giveaways...</p>
        </div>

        <div id="fmv-popup-footer">
            <button id="fmv-reset-btn" title="Clears the locally stored username. Use this if the script is not tracking correctly.">Clear User ID</button>
        </div>
    `;
        document.body.appendChild(popup);

        // --- Attach UI Listeners ---

        document.getElementById('fmv-close-btn').addEventListener('click', () => {
            popup.style.display = 'none';
        });

        document.getElementById('fmv-submit-user-btn').addEventListener('click', handleUsernameSubmit);
        document.getElementById('fmv-username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleUsernameSubmit();
            }
        });

        document.getElementById('fmv-reset-btn').addEventListener('click', () => {
            if (confirm("Are you sure you want to clear your locally stored User ID?")) {
                localStorage.removeItem(USER_ID_STORAGE_KEY);
                location.reload();
            }
        });

        return {
            popup: popup,
            inputArea: document.getElementById('fmv-user-input-area'),
            body: document.getElementById('fmv-popup-body'),
            header: document.getElementById('fmv-popup-header') // <-- ADD THIS LINE
        };
    }

    function renderPopupContent(groupedData, isUpToDate) {
        const uiElements = injectPopupHtml();
        const popupBody = uiElements.body;
        const header = uiElements.header; // <-- Added header reference for later use
        const popup = uiElements.popup;

        popupBody.innerHTML = '';
        console.log(['renderPopupContent', groupedData, isUpToDate]);

        let totalGiveaways = 0;
        let html = '';
        const priorities = Object.keys(groupedData).sort((a, b) => b - a);

        priorities.forEach(priority => {
            const keywords = groupedData[priority];

            html += `<h3 style="margin: 5px 0 10px 0; font-size: 1.1em; color: #5a5a8a;">${priority} Star Giveaways</h3><ul style="border-top: 1px solid #ddd; padding-top: 10px;">`;

            Object.keys(keywords).forEach(keyword => {
                const entries = keywords[keyword];
                if (entries.length === 0) return;

                html += `<li style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
                        <strong style="flex-grow: 1;">${keyword}</strong>
                        <button class="got-it-btn" data-keyword="${keyword}">Got It!</button>
                    </li>
                    <ul style="list-style: disc; margin-left: 10px;">`;

                entries.forEach(entry => {
                    totalGiveaways++;

                    // --- TIME CALCULATION LOGIC ---
                    // TWENTY_FOUR_HOURS_S is defined globally (around line 34)
                    const expirationTime = entry.created_utc + TWENTY_FOUR_HOURS_S;
                    const currentTime = Math.floor(Date.now() / 1000);
                    const timeRemainingSeconds = expirationTime - currentTime;

                    let timeRemainingText;
                    let linkStyle = '';
                    let timeTextStyle = '#333'; // Default text color for time

                    if (timeRemainingSeconds > 0) {
                        // Giveaway is active (time remaining)
                        const hours = Math.floor(timeRemainingSeconds / 3600);
                        const minutes = Math.floor((timeRemainingSeconds % 3600) / 60);

                        if (hours > 0) {
                            timeRemainingText = `${hours}h ${minutes}m`;
                        } else {
                            // If less than an hour, show minutes only, highlight in red if less than 15m
                            if (minutes < 15) {
                                timeTextStyle = '#a00';
                            }
                            timeRemainingText = `${minutes}m remaining`;
                        }

                        // Use linkStyle to indicate "Active" status (if marked by user)
                        if (entry.status === 'active') {
                            linkStyle = 'color: #f7a01d; font-weight: bold;';
                        } else {
                            linkStyle = ''; // Default for unclicked links
                        }

                    } else {
                        // Giveaway is expired
                        timeRemainingText = 'EXPIRED';
                        //linkStyle = 'text-decoration: line-through; color: #888;';
                        timeTextStyle = '#a00'; // Highlight expired status
                    }

                    const linkStatus = entry.status || 'null'; // Keep status for the data-attribute

                    // --- UPDATED HTML GENERATION ---
                    html += `<li style="margin-bottom: 3px; display: flex; align-items: baseline;">
                                <a href="${entry.url}" target="_blank"
                                   class="fmv-giveaway-link giveaway-link"
                                   data-id="${entry.id}"
                                   data-status="${linkStatus}"
                                   data-createdutc="${entry.created_utc}"
                                   style="${linkStyle}">
                                    Link to Giveaway
                                </a>
                                <span style="font-size: 0.9em; margin-left: 10px; color: ${timeTextStyle};">
                                    (${timeRemainingText})
                                </span>
                            </li>`;
                    // --- END UPDATED HTML GENERATION ---
                });
                html += '</ul>';
            });
            html += '</ul>';
        });

        // --- FINAL DOM UPDATE AND STATUS MESSAGE LOGIC (RESTORED/CORRECTED) ---

        if (totalGiveaways === 0) {
            let noGiveawaysMessage = 'No new or active giveaways found.';

            // State 2 (No items found AND ingestion failed) - refine the message
            if (!isUpToDate) {
                noGiveawaysMessage = 'No current sticker giveaways found. (Feed may be out of date.)';
            }

            popupBody.innerHTML = `<p style="text-align: center; margin-top: 20px;">${noGiveawaysMessage}</p>`;
            header.innerHTML = `<span>Sticker Giveaways (0)</span><button class="fmv-popup-close-btn" id="fmv-close-btn">×</button>`;
        } else {
            popupBody.innerHTML = html;

            let headerTitle = `<span>Sticker Giveaways (${totalGiveaways})</span>`;

            // State 2: Show the "may not be shown" warning message
            if (!isUpToDate) {
                headerTitle = `<span style="color: #f7a01d; font-weight: bold; font-size: 1.1em; padding-right: 15px;">Latest Giveaways may not be shown</span>`;
            }

            header.innerHTML = `${headerTitle}<button class="fmv-popup-close-btn" id="fmv-close-btn">×</button>`;
            attachEventListeners();
        }

        popup.style.display = 'block';


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
            uiElements.inputArea.style.display = 'block';
            uiElements.body.innerHTML = '<p>Please enter your username above to view the giveaway feed.</p>';
            uiElements.popup.style.display = 'block';
            return;
        }

        uiElements.inputArea.style.display = 'none';
        uiElements.body.innerHTML = '<p>Loading giveaways...</p>';
        uiElements.popup.style.display = 'block';

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

        } else {
            // State 3: The API GET request failed (feedResult is null). Show the critical error.
            uiElements.body.innerHTML = `<p style="color:red; font-size: 1.2em; text-align: center; padding: 20px;">Latest Giveaways didn't load.</p>`; // <-- CORRECTED MESSAGE
        }
    };

// Initialize on page load
    initApp();

})
();
