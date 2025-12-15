// ==UserScript==
// @name         FarmMergeValley Giveaway Pop-up
// @namespace    http://tampermonkey.net/
// @version      1.12
// @updateURL    https://github.com/sarahk/RedditFarmValleyMergeGiveaway/raw/refs/heads/main/RedditFarmValleyMergeGiveaway.user.js
// @downloadURL  https://github.com/sarahk/RedditFarmValleyMergeGiveaway/raw/refs/heads/main/RedditFarmValleyMergeGiveaway.user.js
// @description  Fetches Reddit giveaway data and displays filtered results in a floating pop-up.
// @author       itamer
// @match        https://sh.reddit.com/r/FarmMergeValley/*
// @match        https://www.reddit.com/r/FarmMergeValley/*
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const TARGET_URL = 'https://www.reddit.com/r/FarmMergeValley/search.json?q=flair_name%3A%22%F0%9F%8E%81+Raffles%2FGiveaways%22&restrict_sr=1&sort=new&t=month';
    const USER_AGENT = 'browser:FarmMergeValley-Sticker-App:v1.4 (by /u/itamer)';
    const GIVEAWAY_PREFIX = '[Sticker Giveaway]';
    const KEYWORD_STORAGE_KEY = 'sticker_giveaway_keywords';
    const LINK_STORAGE_KEY = 'sticker_giveaway_links';
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    // --- NEW API CONFIGURATION ---
    const API_TARGET_URL = 'https://fmv.itamer.com/api.php';
    // *** IMPORTANT *** This MUST match the API_SECRET_KEY in your config.php file
    const API_SECRET_KEY = 'pum@90Nervous';
    // --- End Configuration ---

    // --- NEW UNIVERSAL STYLING FUNCTION ---
    /**
     * Safely injects CSS styles using GM_addStyle if available,
     * otherwise falls back to standard DOM injection.
     * @param {string} css - The CSS string to inject.
     */
    function addStyle(css) {
        // 1. Try the official GM_addStyle function (should work with the grant)
        if (typeof GM_addStyle !== 'undefined') {
            GM_addStyle(css);
            return;
        }

        // 2. Fallback to standard DOM injection if GM_addStyle is still blocked
        const style = document.createElement('style');
        style.type = 'text/css';
        style.textContent = css;
        (document.head || document.body || document.documentElement).appendChild(style);
    }
    // --- END NEW FUNCTION ---
    // Inject the CSS styles for the floating panel
    addStyle(`
        /* Container for the Pop-up */
        #fmv-giveaways-popup {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 300px;
            max-height: 80vh;
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            overflow: hidden;
            display: none;
            font-size: 14px;
            font-family: inherit;
        }

        /* Header for Pop-up */
        #fmv-popup-header {
            background-color: #E2852E;
            color: white;
            padding: 10px 15px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        }

        /* Body/Content Area */
        #fmv-popup-body {
            padding: 10px 15px;
            overflow-y: auto;
            max-height: calc(80vh - 50px);
        }

        /* Individual giveaway link */
        .fmv-giveaway-link {
            display: inline-block; /* Changed to inline-block for spacing */
            padding: 5px 0;
            color: #0079d3;
            text-decoration: none;
        }
        .fmv-giveaway-link:hover {
            text-decoration: underline;
        }

        /* Close Button */
        .fmv-popup-close-btn {
            background: none;
            border: none;
            color: white;
            font-size: 1.2em;
            cursor: pointer;
            line-height: 1;
        }

        /* Lists formatting */
        #fmv-popup-body ul {
            padding-left: 0;
            margin-top: 5px;
        }
        #fmv-popup-body li {
            list-style: none; /* Remove bullet points for main list */
            margin-bottom: 10px;
        }
        #fmv-popup-body ul ul li {
            list-style: disc; /* Use bullet points for link list */
            margin-left: 20px;
            margin-bottom: 5px;
        }
        .got-it-btn {
            white-space: nowrap;
        }
        /* Footer Area */
        #fmv-popup-footer {
            padding: 5px 15px;
            border-top: 1px solid #ddd;
            text-align: right;
            background-color: #f7f7f7;
        }

        /* Reset Button Style */
        #fmv-reset-btn {
            background-color: #f44336; /* Red */
            color: white;
            border: none;
            padding: 4px 8px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 12px;
            margin: 4px 2px;
            cursor: pointer;
            border-radius: 4px;
        }
        #fmv-reset-btn:hover {
            background-color: #d32f2f;
        }
    `);


    /**
     * Helper function to wrap GM.xmlHttpRequest in a standard Promise.
     */
    function gmXhrPromise(url) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/json'
                },
                onload: function(response) {
                    if (response.status === 200) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error(`API failed with status ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: function(response) {
                    reject(new Error(`Network error during GM.xmlHttpRequest: ${response.responseText}`));
                }
            });
        });
    }

    /**
     * Extracts required fields from the raw Reddit feed and formats them
     * for insertion into the external database.
     * @param {string} rawData - The raw JSON string from the Reddit API.
     * @returns {Array<Object>} An array of post objects containing id, url, title, keyword, and stars.
     */
    function getSaveData(rawData) {
        const data = JSON.parse(rawData);
        const output = [];

        // The data is located in data.data.children
        data.data.children.forEach(child => {
            const { title, url, name: id, created_utc } = child.data;

            // Use the existing parseTitle function to extract priority/stars and keyword
            const parsed = parseTitle(title);

            if (parsed) {
                const { priority, keyword } = parsed;

                // Only save posts that successfully parsed and are valid giveaway entries
                output.push({
                    id: id,
                    url: url,
                    title: title,
                    keyword: keyword,
                    stars: priority, // 'priority' is the same as 'stars'
                    created_utc: created_utc // Can be useful for server-side validation/logging
                });
            }
        });

        return output;
    }

    /**
     * Sends the raw fetched data to the external API endpoint.
     * @param {string} rawData - The raw JSON string from the Reddit API.
     */
    async function sendDataToApi(rawData) {
        // Construct the payload as required: what='post' + the parsed datafeed
        const payload = JSON.stringify({
            what: 'post',
            // Parse the raw JSON string to send the data as an object structure
            payload: getSaveData(rawData)
        });



        GM.xmlHttpRequest({
            method: 'POST',
            url: API_TARGET_URL,
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': API_SECRET_KEY // Required by your apihandler.php
            },
            data: payload,
            onload: function(response) {
                if (response.status === 200 || response.status === 201) {
                    console.log('API Data Upload Success:', response.responseText);
                } else {
                    console.error(`API Data Upload Failed: ${response.status} - ${response.responseText}`);
                }
            },
            onerror: function(response) {
                console.error('Network Error contacting external API:', response.error);
            }
        });
    }


    /**
     * Fetches data using the GM.xmlHttpRequest API wrapped in a Promise.
     * Now returns an object containing both the parsed data and the raw text.
     */
    async function fetchGiveawayFeed() {
        try {
            const responseText = await gmXhrPromise(TARGET_URL);

            return {
                data: JSON.parse(responseText),
                rawData: responseText
            };
        } catch (error) {
            console.error('Error fetching Reddit data:', error.message);
            throw error; // Re-throw to be caught by the main function
        }
    }

    /**
     * Parses the title to extract Priority and Keyword.
     * @param {string} title - The post title.
     * @returns {{priority: number, keyword: string} | null}
     */
    const parseTitle = (title) => {
        if (!title.startsWith(GIVEAWAY_PREFIX)) return null;

        // Regex to capture: (Priority) + " Star(s) " + (Keyword) + " Sticker"
        // The 's' in 'Star(s)' is now optional: (\\s*Star(s)?\\s+)
        const regex = new RegExp(`${GIVEAWAY_PREFIX}.*?(\\d+)\\s*Star(s)?\\s+(.+?)\\s+Sticker`, 'i');
        const match = title.match(regex);

        if (match && match.length >= 4) {
            const priority = parseInt(match[1]); // Group 1: Priority
            const keyword = match[3].trim();     // Group 3: Keyword

            // Validate priority is between 1 and 5
            if (priority >= 1 && priority <= 5 && keyword) {
                return {priority, keyword};
            }
        }
        return null;
    };

    // --- Storage Functions ---

    const getKeywordStorage = () => {
        try {
            const data = localStorage.getItem(KEYWORD_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error("Error reading keyword storage:", e);
            return {};
        }
    };

    const saveKeywordGot = (keyword) => {
        const storage = getKeywordStorage();
        storage[keyword] = new Date().toISOString();
        localStorage.setItem(KEYWORD_STORAGE_KEY, JSON.stringify(storage));
    };

    const isKeywordExcluded = (keyword) => {
        const storage = getKeywordStorage();
        const timestamp = storage[keyword];

        if (!timestamp) return false;

        const timeDifference = Date.now() - new Date(timestamp).getTime();
        return timeDifference < NINETY_DAYS_MS;
    };

    // --- Updated Link Storage Functions ---

// Retrieves clicked link IDs and their timestamps
    const getLinkStorage = () => {
        try {
            // Data structure: { id: timestamp_ms, id2: timestamp_ms, ... }
            const data = localStorage.getItem(LINK_STORAGE_KEY);
            // Clean up old links (optional, but good practice for storage)
            const storage = data ? JSON.parse(data) : {};

            // Clean links older than 90 days to prevent localStorage bloat
            const now = Date.now();
            for (const id in storage) {
                if (now - storage[id] > NINETY_DAYS_MS) {
                    delete storage[id];
                }
            }
            return storage;
        } catch (e) {
            console.error("Error reading link storage:", e);
            return {};
        }
    };

// Saves a clicked link ID with a current timestamp (milliseconds)
    const saveLinkClicked = (id) => {
        const storage = getLinkStorage();
        // Save the current timestamp in milliseconds
        storage[id] = Date.now();
        localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(storage));
    };

// Checks if a link has been clicked and returns the timestamp (or 0 if not clicked)
    const getLinkClickTime = (id) => {
        const storage = getLinkStorage();
        return storage[id] || 0; // Returns timestamp in ms or 0
    };

    /**
     * Converts a Unix timestamp (seconds) to a DD/MM string.
     * @param {number} utcTimestamp - The Unix timestamp in seconds.
     * @returns {string} Formatted date string (DD/MM).
     */
    const formatUtcToDdMm = (utcTimestamp) => {
        // 1. Convert seconds to milliseconds
        const date = new Date(utcTimestamp * 1000);

        // 2. Get Day (add 1 if month is zero-indexed)
        const day = date.getDate().toString().padStart(2, '0');

        // 3. Get Month (add 1 as it is 0-indexed)
        const month = (date.getMonth() + 1).toString().padStart(2, '0');

        return `${day}/${month}`;
    };

    // --- Processing and UI Logic ---

    /**
     * Fetches and processes the Reddit JSON feed.
     * Includes logic to send the raw data to the external API.
     * @returns {Object} Grouped data or null.
     */
    const fetchAndProcessFeed = async () => {
        try {
            const result = await fetchGiveawayFeed(); // result = { data: parsed, rawData: string }
            const data = result.data;
            const rawData = result.rawData;

            // 1. Send data to external API (non-blocking)
            sendDataToApi(rawData);

            // Group the data: { priority: { keyword: [entries], ... }, ... }
            const groupedData = {};
            const currentTimeMs = Date.now();

            data.data.children.forEach(child => {
                const {title, url, name: id, created_utc} = child.data;

                // --- (Your debugging line should go here, using formatUtcToDdMm(created_utc)) ---

                // **24-HOUR FILTER REMOVED HERE**

                const parsed = parseTitle(title);

                if (parsed) {
                    const {priority, keyword} = parsed;

                    // 2. Keyword Exclusion Check
                    if (isKeywordExcluded(keyword)) return;

                    // 3. Grouping
                    // Initialize structure if needed
                    if (!groupedData[priority]) {
                        groupedData[priority] = {};
                    }
                    if (!groupedData[priority][keyword]) {
                        groupedData[priority][keyword] = [];
                    }

                    // ADDED created_utc to the final entry object
                    groupedData[priority][keyword].push({link: url, id, created_utc});
                }
            });

            return groupedData;

        } catch (error) {
            console.error("Failed to fetch or process Reddit feed:", error);
            // Handle error display in the main init function
            return null;
        }
    };


    /**
     * Injects the necessary HTML structure for the pop-up into the Reddit page.
     * @returns {HTMLElement | null} The body element of the pop-up.
     */
    function injectPopupHtml() {
        let popup = document.getElementById('fmv-giveaways-popup');
        if (popup) return document.getElementById('fmv-popup-body');

        popup = document.createElement('div');
        popup.id = 'fmv-giveaways-popup';
        popup.innerHTML = `
        <div id="fmv-popup-header">
            <span>Sticker Giveaways</span>
            <button class="fmv-popup-close-btn" id="fmv-close-btn">×</button>
        </div>
        <div id="fmv-popup-body">
            <p>Loading...</p>
        </div>
        <div id="fmv-popup-footer">
            <button id="fmv-reset-btn" title="Clears all stored 'Got It' keywords and link click history.">Reset Data</button>
        </div>
    `;
        document.body.appendChild(popup);

        // Attach close listener
        document.getElementById('fmv-close-btn').addEventListener('click', () => {
            popup.style.display = 'none';
        });

        // Attach the new Reset listener here
        document.getElementById('fmv-reset-btn').addEventListener('click', () => {
            if (confirm("Are you sure you want to reset ALL Sticker Giveaway data (keywords and link history)?")) {
                clearLocalStorageData();
                initApp(); // Re-initialize to reload with cleared data
            }
        });

        return document.getElementById('fmv-popup-body');
    }

    /**
     * Attaches event listeners to the buttons and links.
     */
    const attachEventListeners = () => {
        // 1. "Got It" button listener
        document.querySelectorAll('.got-it-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const keyword = event.target.dataset.keyword;
                if (keyword) {
                    saveKeywordGot(keyword);
                    initApp(); // Re-run the app to hide the collected keyword
                }
            });
        });

        // 2. Link click listener (strikethrough and tracking)
        document.querySelectorAll('.giveaway-link').forEach(link => {
            link.addEventListener('click', (event) => {
                const id = event.target.dataset.id;
                if (id) {
                    saveLinkClicked(id);
                    // Apply strikethrough instantly
                    event.target.style.textDecoration = 'line-through';
                    event.target.style.color = '#888';
                }
                // Allow the link to open normally
            });
        });
    };

    /**
     * Populates the pop-up with the fetched and processed data,
     * implementing the New/Active/Finished logic and filtering.
     * @param {Object} groupedData - Grouped data by priority and keyword.
     */
    function renderPopupContent(groupedData) {
        const popupBody = injectPopupHtml();
        if (!popupBody) return;

        popupBody.innerHTML = '';

        let totalGiveaways = 0;
        let html = '';
        const priorities = Object.keys(groupedData).sort((a, b) => b - a);
        const currentTimeMs = Date.now();

        priorities.forEach(priority => {
            const keywords = groupedData[priority];

            html += `<h3 style="margin: 5px 0 10px 0; font-size: 1.1em; color: #5a5a8a;">${priority} Star Giveaways</h3><ul style="border-top: 1px solid #ddd; padding-top: 10px;">`;

            Object.keys(keywords).forEach(keyword => {
                const entries = keywords[keyword];

                // Collect entries that should be displayed
                const visibleEntries = [];

                // Links for that keyword
                entries.forEach(entry => {
                    const clickTimeMs = getLinkClickTime(entry.id);
                    const postTimeMs = entry.created_utc * 1000;

                    // Calculate current age of the post
                    const currentPostAgeMs = currentTimeMs - postTimeMs;
                    const isPostOlderThan24h = currentPostAgeMs >= TWENTY_FOUR_HOURS_MS;

                    // CRUCIAL NEW CHECK: Has the link been clicked AFTER it passed the 24-hour mark?
                    // This determines if the user has acknowledged the "Finished" status.
                    const isClickFinishedAck = clickTimeMs > 0 && (clickTimeMs >= postTimeMs + TWENTY_FOUR_HOURS_MS);

                    let linkStatus = 'New';
                    let linkStyle = '';
                    let linkLabel = 'Link to Giveaway';

                    // 1. --- HIDING RULE ---
                    // Hide if it's older than 24h AND the user has clicked it since it passed the 24h mark.
                    if (isPostOlderThan24h && isClickFinishedAck) {
                        return; // DO NOT RENDER (Finished and Acknowledged)
                    }

                    // 2. --- RENDERING RULES ---
                    if (isPostOlderThan24h) {
                        // Post is older than 24h, and not yet acknowledged (click occurred before aging, or no click at all)
                        linkStatus = 'Finished';
                        linkStyle = 'text-decoration: line-through; color: #888;';
                        linkLabel = 'Finished (Older than 24h)';
                    } else if (clickTimeMs > 0) {
                        // Post is within 24h AND has been clicked
                        linkStatus = 'Active';
                        linkStyle = 'color: #f7a01d; font-weight: bold;'; // Amber/Orange color
                    }

                    // If we reached this point, the link is visible
                    visibleEntries.push({ entry, linkStatus, linkStyle, linkLabel });
                }); // End entries.forEach

                // If there are no visible entries for this keyword, skip rendering the keyword block
                if (visibleEntries.length === 0) return;

                // Render the keyword block header
                html += `<li style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
                        <strong style="flex-grow: 1;">${keyword}</strong>
                        <button class="got-it-btn" data-keyword="${keyword}">Got It!</button>
                    </li>
                    <ul style="list-style: disc; margin-left: 10px;">`;

                // Render the visible links
                visibleEntries.forEach(({ entry, linkStatus, linkStyle, linkLabel }) => {
                    totalGiveaways++;

                    html += `<li style="margin-bottom: 3px;">
                            <a href="${entry.link}" target="_blank" class="fmv-giveaway-link giveaway-link" data-id="${entry.id}" 
                               style="${linkStyle}">
                                ${linkLabel} (${linkStatus})
                            </a>
                        </li>`;
                });
                html += '</ul>';
            });
            html += '</ul>';
        });

        const header = document.getElementById('fmv-popup-header');
        const popup = document.getElementById('fmv-giveaways-popup');

        if (totalGiveaways === 0) {
            popupBody.innerHTML = '<p>No new or active giveaways found.</p>';
            header.innerHTML = '<span>Sticker Giveaways (0)</span><button class="fmv-popup-close-btn" id="fmv-close-btn">×</button>';
        } else {
            popupBody.innerHTML = html;
            header.innerHTML = `<span>Sticker Giveaways (${totalGiveaways})</span><button class="fmv-popup-close-btn" id="fmv-close-btn">×</button>`;
            attachEventListeners();
        }

        // Re-attach close listener
        document.getElementById('fmv-close-btn').addEventListener('click', () => {
            popup.style.display = 'none';
        });

        // Show the pop-up once content is ready
        popup.style.display = 'block';
    }

    /**
     * Clears all data stored by the userscript in localStorage.
     */
    const clearLocalStorageData = () => {
        localStorage.removeItem(KEYWORD_STORAGE_KEY);
        localStorage.removeItem(LINK_STORAGE_KEY);
        console.log("Sticker Giveaway userscript data cleared.");
    };

    /**
     * Main function to initialize and run the application.
     */
    const initApp = async () => {
        // Inject the empty popup structure immediately
        injectPopupHtml();

        const groupedData = await fetchAndProcessFeed();

        if (groupedData) {
            renderPopupContent(groupedData);
        } else {
            // Error case handled by fetchAndProcessFeed
            const popupBody = document.getElementById('fmv-popup-body');
            if(popupBody) {
                popupBody.innerHTML = `<p style="color:red;">Error loading feed. Check browser console.</p>`;
                document.getElementById('fmv-giveaways-popup').style.display = 'block';
            }
        }
    };

    // Initialize on page load
    initApp();

})();
