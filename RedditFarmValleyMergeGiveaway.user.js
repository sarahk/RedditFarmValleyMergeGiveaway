// ==UserScript==
// @name         FarmMergeValley Giveaway Pop-up
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Fetches Reddit giveaway data and displays filtered results in a floating pop-up.
// @author       itamer
// @match        https://sh.reddit.com/r/FarmMergeValley/*
// @match        https://www.reddit.com/r/FarmMergeValley/*
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    // Using the canonical API URL with restrict_sr=1 re-added for proper search context
    //const TARGET_URL = 'https://www.reddit.com/r/FarmMergeValley/search.json?q=flair_name%3A%22%F0%9F%8E%81+Raffles%2FGiveaways%22&restrict_sr=1';
    const TARGET_URL = 'https://www.reddit.com/r/FarmMergeValley/search.json?q=flair_name%3A%22%F0%9F%8E%81+Raffles%2FGiveaways%22&restrict_sr=1&sort=new&t=month';



    const USER_AGENT = 'browser:FarmMergeValley-Sticker-App:v1.4 (by /u/itamer)';
    const GIVEAWAY_PREFIX = '[Sticker Giveaway]';
    const KEYWORD_STORAGE_KEY = 'sticker_giveaway_keywords';
    const LINK_STORAGE_KEY = 'sticker_giveaway_links';
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    // --- End Configuration ---

    // Inject the CSS styles for the floating panel
    GM_addStyle(`
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
     * Fetches data using the GM.xmlHttpRequest API wrapped in a Promise.
     */
    async function fetchGiveawayFeed() {
        // console.log('Attempting to fetch data...'); // Keep this disabled for clean console
        try {
            const responseText = await gmXhrPromise(TARGET_URL);
            return JSON.parse(responseText);
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

    const getLinkStorage = () => {
        try {
            const data = localStorage.getItem(LINK_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error("Error reading link storage:", e);
            return {};
        }
    };

    const saveLinkClicked = (id) => {
        const storage = getLinkStorage();
        storage[id] = true;
        localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(storage));
    };

    const isLinkClicked = (id) => {
        const storage = getLinkStorage();
        return !!storage[id];
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
 * @returns {Object} Grouped data or null.
 */
const fetchAndProcessFeed = async () => {
    try {
        const data = await fetchGiveawayFeed();
        // Group the data: { priority: { keyword: [entries], ... }, ... }
        const groupedData = {};
        const currentTimeMs = Date.now();

        data.data.children.forEach(child => {
            // Destructure the necessary fields, including created_utc
            const {title, url, name: id, created_utc} = child.data;
//console.log([title, url, id, formatUtcToDdMm(created_utc)]);
            // 1. **24-Hour Check**
            // Reddit's created_utc is in seconds, so we multiply by 1000 for milliseconds.
            const postTimeMs = created_utc * 1000;
            const postAgeMs = currentTimeMs - postTimeMs;

            if (postAgeMs > TWENTY_FOUR_HOURS_MS) {
                // Skip the post if it's older than 24 hours
                return;
            }

            const parsed = parseTitle(title);

            if (parsed) {
                const {priority, keyword} = parsed;

                // 2. **Keyword Exclusion Check**
                if (isKeywordExcluded(keyword)) return;

                // 3. **Grouping**
                // Initialize structure if needed
                if (!groupedData[priority]) {
                    groupedData[priority] = {};
                }
                if (!groupedData[priority][keyword]) {
                    groupedData[priority][keyword] = [];
                }

                // Add the valid post
                groupedData[priority][keyword].push({link: url, id});
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
        `;
        document.body.appendChild(popup);

        // Attach close listener
        document.getElementById('fmv-close-btn').addEventListener('click', () => {
            popup.style.display = 'none';
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
     * Populates the pop-up with the fetched and processed data.
     * @param {Object} groupedData - Grouped data by priority and keyword.
     */
    function renderPopupContent(groupedData) {
        const popupBody = injectPopupHtml();
        if (!popupBody) return;

        popupBody.innerHTML = '';

        let totalGiveaways = 0;
        let html = '';
        // Sort from 5 (highest priority) to 1 (lowest)
        const priorities = Object.keys(groupedData).sort((a, b) => b - a);

        priorities.forEach(priority => {
            const keywords = groupedData[priority];

            html += `<h3 style="margin: 5px 0 10px 0; font-size: 1.1em; color: #5a5a8a;">${priority} Star Giveaways</h3><ul style="border-top: 1px solid #ddd; padding-top: 10px;">`;

            Object.keys(keywords).forEach(keyword => {
                const entries = keywords[keyword];
                totalGiveaways += entries.length;

                // Keyword Header and "Got It" button
                html += `<li style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
                            <strong style="flex-grow: 1;">${keyword}</strong>
                            <button class="got-it-btn" data-keyword="${keyword}">Got It!</button>
                        </li>
                        <ul style="list-style: disc; margin-left: 10px;">`;

                // Links for that keyword
                entries.forEach(entry => {
                    const isClicked = isLinkClicked(entry.id);
                    const linkStyle = isClicked ? 'text-decoration: line-through; color: #888;' : '';

                    html += `<li style="margin-bottom: 3px;">
                                <a href="${entry.link}" target="_blank" class="fmv-giveaway-link giveaway-link" data-id="${entry.id}"
                                   style="${linkStyle}">
                                    Link to Giveaway
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
             popupBody.innerHTML = '<p>No active, uncollected giveaways found.</p>';
             header.innerHTML = '<span>Sticker Giveaways (0)</span><button class="fmv-popup-close-btn" id="fmv-close-btn">×</button>';
        } else {
             popupBody.innerHTML = html;
             header.innerHTML = `<span>Sticker Giveaways (${totalGiveaways})</span><button class="fmv-popup-close-btn" id="fmv-close-btn">×</button>`;
             attachEventListeners();
        }

        // Re-attach close listener (since we updated the innerHTML of the header)
        document.getElementById('fmv-close-btn').addEventListener('click', () => {
            popup.style.display = 'none';
        });

        // Show the pop-up once content is ready
        popup.style.display = 'block';
    }


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
