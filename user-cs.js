// ==UserScript==
// @name         CS Level Tracker
// @version      2.17
// @description  A userscript to track and update user levels for the Farm Merge Valley subreddit.  Provides a UI to capture the author of a post, fetch their current level from Reddit or the database, and save updates back to the server.  Also includes batch tools to backfill votes and update user levels in bulk.
// @match        *://*.reddit.com/r/FarmMergeValley/comments/*
// @match        *://*.reddit.com/r/FarmMergeValley/*
// @grant        GM_xmlhttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @connect      fvm.itamer.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  "use strict";
  console.log(
    "[CS] script loaded, readyState:",
    document.readyState,
    location.href,
  );

  const API_URL = "https://fvm.itamer.com/api-cs.php";
  const FVM_API_URL = "https://fvm.itamer.com/api.php";
  const API_KEY = "pum@90Nervous";

  const CS_LISTS = [
    { name: "Team A", value: "Club Susan" },
    { name: "Team B", value: "Waiting" },
    { name: "Other", value: "Other" },
  ];

  const CS_ITEMS = {
    crops: [
      "apple",
      "avocado",
      "carrot",
      "coffee",
      "corn",
      "soybeans",
      "sugarcane",
      "sunflower",
      "tomato",
      "wheat",
      "none",
    ],
    animals: [
      "alpaca",
      "chicken",
      "cow",
      "deer",
      "goat",
      "horse",
      "pig",
      "sheep",
      "trufflepig",
      "none",
    ],
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------------------
  // STORAGE
  // ---------------------------------------------------------------------------
  const FVM_Storage = {
    async migrate() {
      const keys = ["fvm_user_id", "fvm_last_hourly", "fvm_view"];
      for (const key of keys) {
        const gmVal = await GM.getValue(key);
        if (!gmVal) {
          const lsVal = localStorage.getItem(key);
          if (lsVal) await GM.setValue(key, lsVal);
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
  // API HELPER
  // ---------------------------------------------------------------------------
  let _cachedUserId = null;

  function apiCall(method, data, baseUrl = API_URL) {
    return new Promise((resolve, reject) => {
      let url = baseUrl;
      let body = null;
      if (method === "GET") {
        url += `?${new URLSearchParams(data).toString()}`;
      } else {
        body = new URLSearchParams(data).toString();
      }
      GM_xmlhttpRequest({
        method,
        url,
        data: body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Api-Key": API_KEY,
        },
        onload: (res) => {
          let parsed;
          try {
            parsed = JSON.parse(res.responseText);
          } catch {
            parsed = res.responseText;
          }
          if (res.status >= 400) {
            reject(parsed);
            return;
          }
          resolve(parsed);
        },
        onerror: reject,
      });
    });
  }

  // ===========================================================================
  // FLAIR HELPERS (DOM — no server call needed)
  // ===========================================================================

  /**
   * Extract the author's flair text from the page DOM.
   *
   * New Reddit (sh.reddit.com / new.reddit.com):
   *   Reads attributes on the <shreddit-post> custom element.
   *
   * Old Reddit (www.reddit.com):
   *   The flair is a <span class="flair"> in the post's .tagline.
   *   Its title looks like ":fmv_level35: Field Worker".
   *   parseLevelFromFlair handles both "Level 35" and "fmv_level35"
   *   because the regex is /level\s*(\d+)/i (zero-width match on "level35").
   */
  function extractFlairFromDom() {
    // ── New Reddit ────────────────────────────────────────────────────────────
    const post = document.querySelector("shreddit-post");
    if (post) {
      const plain = post.getAttribute("author-flair-text");
      if (plain) return plain;

      const rich = post.getAttribute("author-flair-richtext");
      if (rich) {
        try {
          const parts = JSON.parse(rich);
          const text = parts
            .filter((p) => p.e === "text")
            .map((p) => p.t)
            .join(" ")
            .trim();
          if (text) return text;
        } catch {}
      }
    }

    // ── sh.reddit.com — author-flair-event-handler ───────────────────────────
    // shreddit-post attributes are not always populated; the flair is rendered
    // inside a separate <author-flair-event-handler> element.
    // The inner .flair-content div carries an aria-label like:
    //   "Flair: :fmv_level52: Livestock Leader"
    const shFlairEl = document.querySelector(
      "author-flair-event-handler .flair-content[aria-label]",
    );
    if (shFlairEl) {
      const label = shFlairEl.getAttribute("aria-label") || "";
      const text = label.replace(/^Flair:\s*/i, "").trim();
      if (text) return text;
    }

    // ── Old Reddit (www.reddit.com) ───────────────────────────────────────────
    // Target the post's tagline flair, not a comment's flair.
    // Old Reddit wraps the OP in div.thing.link; the flair sits in .tagline.
    const oldFlairEl =
      document.querySelector("div.thing.link .tagline .flair[title]") ||
      document.querySelector(".thing.link .flair[title]");
    if (oldFlairEl) {
      // Prefer the title attribute — it contains the full string including
      // the emoji code, e.g. ":fmv_level35: Field Worker".
      return (
        oldFlairEl.getAttribute("title") ||
        oldFlairEl.textContent.trim() ||
        null
      );
    }

    return null;
  }

  /** Parse a level number out of a flair string, e.g. "Level 42 | Expert". */
  function parseLevelFromFlair(flair) {
    if (!flair) return 0;
    const m = flair.match(/level\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  // ===========================================================================
  // UI
  // ===========================================================================
  const CS_UI = {
    _abortFlag: false,

    init() {
      this.injectStyles();
      this.drawPopup();
    },

    injectStyles() {
      const style = document.createElement("style");
      style.textContent = `
        #cs-popup            { z-index:999999; position:fixed; bottom:20px; left:20px; width:320px; background:#f9f9f9; border:1px solid #ccc; border-radius:8px; box-shadow:0 4px 8px rgba(0,0,0,0.1); font-family:Arial,sans-serif; }
        #cs-header           { background:#5a5a8a; color:white; padding:8px 10px; border-radius:8px 8px 0 0; font-weight:bold; display:flex; justify-content:space-between; align-items:center; }
        #cs-close-btn        { background:none; border:none; color:white; font-size:1.2em; cursor:pointer; line-height:1; padding:0 2px; opacity:0.8; }
        #cs-close-btn:hover  { opacity:1; }
        #cs-reopen-btn       { z-index:999999; position:fixed; bottom:20px; left:20px; background:#5a5a8a; color:white; border:none; border-radius:6px; padding:6px 10px; font-size:0.85em; font-weight:bold; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.2); display:none; }
        #cs-reopen-btn:hover { background:#4a4a7a; }
        #cs-body             { padding:12px; color:#333; }
        .cs-btn              { background:#5a5a8a; color:white; border:none; padding:8px 10px; width:100%; border-radius:4px; cursor:pointer; font-weight:bold; margin-top:6px; font-size:0.9em; text-align:left; display:flex; align-items:center; gap:8px; box-sizing:border-box; }
        .cs-btn:hover        { background:#4a4a7a; }
        .cs-btn:disabled     { opacity:0.5; cursor:not-allowed; }
        .cs-btn-danger       { background:#a03030; }
        .cs-btn-danger:hover { background:#8b0000; }
        .cs-btn-muted        { background:#888; }
        .cs-btn-muted:hover  { background:#666; }
        .cs-input            { width:100%; padding:6px; margin:8px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; }
        label                { font-size:0.85em; font-weight:bold; color:#666; }
        .cs-radio-group      { display:flex; flex-wrap:wrap; gap:5px; margin:8px 0; }
        .cs-radio-item       { display:flex; align-items:center; font-size:0.8em; background:#eee; padding:2px 6px; border-radius:4px; cursor:pointer; }
        .cs-radio-item input { margin-right:4px; }
        .cs-level-group      { display:flex; justify-content:space-between; margin:8px 0; }
        .cs-level-item       { flex:1; text-align:center; background:#eee; margin:0 2px; padding:5px 0; border-radius:4px; cursor:pointer; font-size:0.9em; }
        .cs-level-item input { margin-bottom:4px; }
        .cs-meta             { margin-top:10px; font-size:0.78em; color:#777; line-height:1.7; border-top:1px solid #eee; padding-top:8px; }
        .cs-task-log         { margin-top:8px; height:200px; overflow-y:auto; font-family:monospace; font-size:0.73em; background:#1e1e1e; color:#d4d4d4; border-radius:4px; padding:6px 8px; line-height:1.5; }
        .cs-task-log .log-ok   { color:#6fcf97; }
        .cs-task-log .log-err  { color:#eb5757; }
        .cs-task-log .log-skip { color:#f2994a; }
        .cs-task-log .log-info { color:#56ccf2; }
        .cs-task-log .log-dim  { color:#888; }
        .cs-check-item       { display:flex; align-items:center; font-size:0.85em; font-weight:bold; color:#666; gap:6px; margin:8px 0; cursor:pointer; }
        .cs-check-item input { width:16px; height:16px; cursor:pointer; accent-color:#5a5a8a; }
        .cs-pbar-wrap          { margin-top:6px; background:#ddd; border-radius:4px; height:6px; }
        .cs-pbar               { height:6px; border-radius:4px; background:#5a5a8a; transition:width 0.3s ease; }
        .cs-plabel             { font-size:0.75em; color:#666; margin-top:2px; }
      `;
      document.head.appendChild(style);
    },

    async drawPopup() {
      const div = document.createElement("div");
      div.id = "cs-popup";

      const reopenBtn = document.createElement("button");
      reopenBtn.id = "cs-reopen-btn";
      reopenBtn.textContent = "📋 CS Tracker";
      document.body.appendChild(reopenBtn);
      document.body.appendChild(div);

      div.innerHTML = `
        <div id="cs-header">
          <span>CS Level Tracker</span>
          <button id="cs-close-btn" title="Close">✕</button>
        </div>
        <div id="cs-body">Loading...</div>
      `;

      div.querySelector("#cs-close-btn").onclick = () => {
        div.style.display = "none";
        reopenBtn.style.display = "block";
      };
      reopenBtn.onclick = () => {
        div.style.display = "";
        reopenBtn.style.display = "none";
      };

      await this.showHome();
    },

    // ── HOME SCREEN ───────────────────────────────────────────────────────────

    async showHome() {
      const body = document.getElementById("cs-body");
      if (!body) return;
      this._abortFlag = false;

      // Load info in parallel
      const [userId, botVisit] = await Promise.all([
        this.getCurrentUser(),
        this.getBotVisitDate(),
      ]);

      //<button id="cs-btn-backfill" class="cs-btn">📊 &nbsp;Backfill Votes</button>

      body.innerHTML = `
        <button id="cs-btn-capture"  class="cs-btn">📸 &nbsp;Capture Author</button>
        <button id="cs-btn-update"   class="cs-btn" >🔄 &nbsp;Update User Levels</button>
        <div class="cs-meta">
          Working as: <strong>${userId || "unknown"}</strong><br>
          Last Bot Check: <strong>${botVisit}</strong>
        </div>
      `;

      body.querySelector("#cs-btn-capture").onclick = () =>
        this.handleCapture();
      body.querySelector("#cs-btn-update").onclick = () =>
        window.open("https://fvm.itamer.com/update-levels.php", "_blank");
      //    this.handleUpdateUserLevels();
      body.querySelector("#cs-btn-backfill").onclick = () =>
        this.handleBackfillVotes();
    },

    // ── TASK CHROME ───────────────────────────────────────────────────────────
    // Renders the log + progress bar shell. Returns helper functions.

    renderTaskChrome(title) {
      this._abortFlag = false;
      const body = document.getElementById("cs-body");
      body.innerHTML = `
        <div style="font-weight:bold;margin-bottom:6px;">${title}</div>
        <div class="cs-task-log" id="cs-log"></div>
        <div class="cs-pbar-wrap"><div class="cs-pbar" id="cs-pbar" style="width:0%"></div></div>
        <div class="cs-plabel"   id="cs-plabel"></div>
        <button id="cs-btn-stop" class="cs-btn cs-btn-danger" style="margin-top:8px;">⛔ &nbsp;Stop</button>
        <button id="cs-btn-home" class="cs-btn cs-btn-muted"  style="margin-top:4px;">← &nbsp;Back to Menu</button>
      `;

      const logEl = body.querySelector("#cs-log");
      const pbar = body.querySelector("#cs-pbar");
      const plabel = body.querySelector("#cs-plabel");

      body.querySelector("#cs-btn-stop").onclick = () => {
        this._abortFlag = true;
      };
      body.querySelector("#cs-btn-home").onclick = () => this.showHome();

      const log = (msg, cls = "") => {
        const line = document.createElement("div");
        if (cls) line.className = cls;
        line.textContent = msg;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
      };

      const clearLog = () => {
        logEl.innerHTML = "";
      };

      const setProgress = (done, total) => {
        const pct = total ? Math.round((done / total) * 100) : 0;
        pbar.style.width = `${pct}%`;
        plabel.textContent = `${done} / ${total}  (${pct}%)`;
      };

      const isAborted = () => this._abortFlag;

      return { log, clearLog, setProgress, isAborted };
    },

    // ── BACKFILL VOTES ────────────────────────────────────────────────────────

    async handleBackfillVotes() {
      const { log, clearLog, setProgress, isAborted } =
        this.renderTaskChrome("📊 Backfill Votes");

      // Move reset button into the title bar, right-aligned
      const titleDiv = document.getElementById("cs-body").firstElementChild;
      titleDiv.style.cssText =
        "font-weight:bold;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;";

      const resetBtn = document.createElement("button");
      resetBtn.style.cssText =
        "background:none;border:1px solid #888;border-radius:4px;color:#555;font-size:0.8em;padding:0 7px 2px 7px;cursor:pointer;";
      resetBtn.innerHTML = "🔄 Reset";
      resetBtn.onclick = async () => {
        resetBtn.disabled = true;
        resetBtn.innerHTML = "⏳";
        try {
          const resp = await apiCall(
            "GET",
            { what: "harvest-reset", username: "itamer" },
            FVM_API_URL,
          );
          const msgs = Array.isArray(resp?.message)
            ? resp.message.join(" ")
            : JSON.stringify(resp);
          resetBtn.innerHTML = "✅";
          resetBtn.style.borderColor = "#2d8a4e";
          resetBtn.title = msgs;
        } catch (e) {
          resetBtn.disabled = false;
          resetBtn.innerHTML = "🔄 Reset (failed)";
        }
      };
      titleDiv.appendChild(resetBtn);

      const BATCH_SIZE = 5; // small: each triggers a server-side Reddit fetch with 429-retries
      const LOG_CLEAR = 50; // clear log display every N processed records

      log("Starting backfill — server will fetch Reddit scores...", "log-info");

      let start = 0;
      let total = null;
      let done = false;
      let updated = 0;
      let deleted = 0;
      let skipped = 0;
      let logCount = 0;
      let batchNum = 0;
      let batchErrors = 0;
      const MAX_BATCH_ERRORS = 3;

      while (!done) {
        if (isAborted()) {
          log("Stopped by user.", "log-skip");
          break;
        }

        batchNum++;
        log(`Batch ${batchNum} (offset ${start})...`, "log-dim");

        let resp;
        try {
          resp = await apiCall(
            "GET",
            { what: "backfill-batch", start, size: BATCH_SIZE },
            FVM_API_URL,
          );
          batchErrors = 0;
        } catch (e) {
          const msg = typeof e === "string" ? e : JSON.stringify(e);
          batchErrors++;
          if (batchErrors >= MAX_BATCH_ERRORS) {
            log(
              `Server error (giving up after ${MAX_BATCH_ERRORS} attempts): ${msg}`,
              "log-err",
            );
            break;
          }
          log(
            `Server error (attempt ${batchErrors}/${MAX_BATCH_ERRORS}, retrying in 15s): ${msg}`,
            "log-err",
          );
          await sleep(15000);
          batchNum--; // don't count the failed attempt
          continue;
        }

        if (total === null) {
          total = resp.total ?? 0;
          log(`Total records to process: ${total}`, "log-info");
        }

        for (const item of resp.processed ?? []) {
          logCount++;

          // Clear log every LOG_CLEAR entries
          if (logCount > 1 && (logCount - 1) % LOG_CLEAR === 0) {
            clearLog();
            log(
              `─── continuing (${logCount - 1} processed so far) ───`,
              "log-dim",
            );
          }

          if (item.status === "saved") {
            log(`${item.id}  → score=${item.score} ✓`, "log-ok");
            updated++;
          } else if (item.status === "deleted") {
            log(`${item.id}  → deleted (harvester=3)`, "log-skip");
            deleted++;
          } else {
            log(
              `${item.id}  → ${item.status}: ${item.reason ?? ""}`,
              "log-skip",
            );
            skipped++;
          }
        }

        start = resp.next_start ?? start + BATCH_SIZE;
        done = resp.done ?? true;

        if (total) setProgress(Math.min(start, total), total);

        if (!done && !isAborted()) {
          const skippedInBatch = (resp.processed ?? []).filter(
            (i) => i.status === "skipped",
          );
          const rateLimited = skippedInBatch.some((i) =>
            (i.reason ?? "").includes("429"),
          );
          const delay = skippedInBatch.length > 0 ? 12000 : 3000;
          if (rateLimited) {
            log(
              `Rate limited (429) — waiting 12s before next batch...`,
              "log-skip",
            );
          } else if (skippedInBatch.length > 0) {
            log(
              `${skippedInBatch.length} skipped — waiting 12s before next batch...`,
              "log-skip",
            );
          }
          await sleep(delay);
        }
      }

      log(``, "log-dim");
      log(
        `Done.  Saved: ${updated}   Deleted: ${deleted}   Skipped: ${skipped}`,
        "log-ok",
      );
    },

    // ── UPDATE USER LEVELS ────────────────────────────────────────────────────
    // The userscript no longer hits Reddit — the server fetches each post
    // and inserts a new visits row with visited_by='bot'.  This loop just
    // streams progress.

    async handleUpdateUserLevels() {
      const { log, clearLog, setProgress, isAborted } = this.renderTaskChrome(
        "🔄 Update User Levels",
      );
      // Small batch on purpose: each row triggers a server-side Reddit fetch
      // which can stall on 429-retries.  5 keeps us comfortably under nginx's
      // gateway timeout even in the worst case.
      const BATCH_SIZE = 5;
      const LOG_CLEAR = 50;

      log("Starting — server will fetch Reddit levels...", "log-info");

      let start = 0;
      let total = null;
      let done = false;
      let saved = 0;
      let flagged = 0;
      let skipped = 0;
      let errors = 0;
      let logCount = 0;
      let batchNum = 0;

      while (!done) {
        if (isAborted()) {
          log("Stopped by user.", "log-skip");
          break;
        }

        batchNum++;
        log(`Batch ${batchNum} (offset ${start})...`, "log-dim");

        let resp;
        try {
          resp = await apiCall("GET", {
            what: "update_levels_batch",
            start,
            size: BATCH_SIZE,
          });
        } catch (e) {
          log(`Server error: ${JSON.stringify(e)}`, "log-err");
          break;
        }

        if (total === null) {
          total = resp.total ?? 0;
          log(`Total active users: ${total}`, "log-info");
        }

        for (const item of resp.processed ?? []) {
          logCount++;

          if (logCount > 1 && (logCount - 1) % LOG_CLEAR === 0) {
            clearLog();
            log(
              `─── continuing (${logCount - 1} processed so far) ───`,
              "log-dim",
            );
          }

          if (item.status === "saved") {
            log(
              `${item.author}  → level ${item.level} | ${item.flair ?? ""} ✓`,
              "log-ok",
            );
            saved++;
          } else if (item.status === "flagged") {
            log(
              `${item.author}  → 🚩 flagged: ${item.reason ?? ""}`,
              "log-skip",
            );
            flagged++;
          } else if (item.status === "skipped") {
            log(`${item.author}  → skipped: ${item.reason ?? ""}`, "log-skip");
            skipped++;
          } else {
            log(
              `${item.author}  → ${item.status}: ${item.reason ?? ""}`,
              "log-err",
            );
            errors++;
          }
        }

        start = resp.next_start ?? start + BATCH_SIZE;
        done = resp.done ?? true;

        if (total) setProgress(Math.min(start, total), total);

        if (!done && !isAborted()) await sleep(500);
      }

      log(``, "log-dim");
      log(
        `Done.  Saved: ${saved}   Flagged: ${flagged}   Skipped: ${skipped}   Errors: ${errors}`,
        "log-ok",
      );
    },

    // ── CAPTURE AUTHOR ────────────────────────────────────────────────────────

    async handleCapture() {
      const body = document.getElementById("cs-body");
      const author = this.getAuthor();
      const authorId = this.getAuthorId();
      const currentUser = await this.getCurrentUser();

      const bail = (msg) => {
        body.innerHTML = `<p>${msg}</p><button class="cs-btn cs-btn-muted" id="cs-btn-home">← Back</button>`;
        body.querySelector("#cs-btn-home").onclick = () => this.showHome();
      };

      if (!currentUser) {
        bail("Username required.");
        return;
      }
      if (!author) {
        bail("Could not find author on this page.");
        return;
      }

      body.innerHTML = "Fetching level data...";

      let db = null;
      try {
        db = await apiCall("GET", {
          what: "get_level",
          author,
          visited_by: currentUser,
        });
      } catch {
        // author not in DB
      }

      let level = db?.level ? parseInt(db.level, 10) : 0;

      if (!level) {
        body.innerHTML = "Not in database — reading flair from page...";
        const flair = extractFlairFromDom();
        if (flair) {
          level = parseLevelFromFlair(flair) || 0;
          console.log("[CS] Flair from DOM:", flair, "→ level", level);
        }
      }

      this.renderForm({
        listname: db?.listname || "Other",
        market: db?.market || 0,
        author,
        authorId,
        currentUser,
        url: db?.url || window.location.href,
        level,
        crop: db?.crop || "none",
        animal: db?.animal || "none",
        double_harvest: db?.double_harvest || "1x",
        crop_count: db?.crop_count || 0,
        animal_count: db?.animal_count || 0,
        user_last_level:
          db?.user_last_level !== null && db?.user_last_level !== ""
            ? parseInt(db.user_last_level, 10)
            : null,
        user_last_seen_utc: db?.user_last_seen_utc || null,
        user_has_prior_visit: !!db?.user_has_prior_visit,
      });
    },

    getAuthor() {
      // Shreddit (sh.reddit.com / www.reddit.com)
      const post = document.querySelector("shreddit-post");
      if (post?.getAttribute("author")) return post.getAttribute("author");

      // Old Reddit (old.reddit.com) — .thing.link has data-author
      const thing = document.querySelector(".thing.link[data-author]");
      if (thing) return thing.getAttribute("data-author");

      // Fallback: data-author on any element, or author link text
      const fp = document.querySelector("[data-author]");
      if (fp) return fp.getAttribute("data-author");
      const link = document.querySelector('a[data-testid="post_author_link"]');
      return link ? link.textContent.replace("u/", "").trim() : null;
    },

    getAuthorId() {
      // Shreddit
      const post = document.querySelector("shreddit-post");
      if (post) return post.getAttribute("author-id");

      // Old Reddit — .thing.link has data-author-fullname="t2_xxxx"
      const thing = document.querySelector(".thing.link[data-author-fullname]");
      if (thing) return thing.getAttribute("data-author-fullname");

      return null;
    },

    renderForm(lastData) {
      const body = document.getElementById("cs-body");

      const radioGroup = (name, items, sel) =>
        items
          .map(
            (item) => `
          <label class="cs-radio-item">
            <input type="radio" name="${name}" value="${item}" ${item === sel ? "checked" : ""}>
            ${item.charAt(0).toUpperCase() + item.slice(1)}
          </label>`,
          )
          .join("");

      let levelHtml = "";
      if (!lastData.level || lastData.level === 0) {
        levelHtml = `<input type="text" id="cs-level-text" class="cs-input" placeholder="Enter level (e.g. 42)">`;
      } else {
        levelHtml =
          `<div class="cs-level-group">` +
          Array.from({ length: 5 }, (_, k) => lastData.level + k)
            .map(
              (n) =>
                `<label class="cs-level-item"><input type="radio" name="cs-level" value="${n}" ${n === lastData.level ? "checked" : ""}><div>${n}</div></label>`,
            )
            .join("") +
          `</div>`;
      }

      const listHtml =
        `<div class="cs-level-group">` +
        CS_LISTS.map(
          (l) => `
          <label class="cs-level-item">
            <input type="radio" name="cs-list-choice" value="${l.value}" ${l.value === lastData.listname ? "checked" : ""}>
            <div>${l.name}</div>
          </label>`,
        ).join("") +
        `</div>`;

      const marketChecked = lastData.market ? "checked" : "";

      body.innerHTML = `
        <div style="font-size:0.9em;margin-bottom:8px;">Target: <strong>u/${lastData.author}</strong><br><span style="color:#999;font-size:0.9em">${lastData.authorId || ""}</span></div>
        <label>List Name:</label>${listHtml}
        <label class="cs-check-item"><input type="checkbox" id="cs-market" ${marketChecked}> Also in Marketplace</label>
        <label>Crop:</label>
        <div class="cs-radio-group">${radioGroup("cs-crop", CS_ITEMS.crops, lastData.crop)}</div>
        <label>Animal:</label>
        <div class="cs-radio-group">${radioGroup("cs-animal", CS_ITEMS.animals, lastData.animal)}</div>
        <label>Level:</label>${levelHtml}
        <button id="cs-save-btn" class="cs-btn" style="margin-top:10px;">💾 &nbsp;Save Level Update</button>
        <button id="cs-btn-home" class="cs-btn cs-btn-muted" style="margin-top:4px;">← &nbsp;Back to Menu</button>
      `;

      document.getElementById("cs-save-btn").onclick = () =>
        this.handleSave(lastData);
      document.getElementById("cs-btn-home").onclick = () => this.showHome();
    },

    async handleSave(lastData) {
      const body = document.getElementById("cs-body");
      const textIn = document.getElementById("cs-level-text");
      let level;
      if (textIn) {
        level = textIn.value.trim();
      } else {
        const r = document.querySelector('input[name="cs-level"]:checked');
        level = r ? r.value : null;
      }
      const listname =
        document.querySelector('input[name="cs-list-choice"]:checked')?.value ||
        "Other";
      const market = document.getElementById("cs-market")?.checked ? 1 : 0;
      const crop =
        document.querySelector('input[name="cs-crop"]:checked')?.value || "";
      const animal =
        document.querySelector('input[name="cs-animal"]:checked')?.value || "";

      if (!level) {
        alert("Please enter or select a level.");
        return;
      }

      const newLevel = parseInt(level, 10);
      const previousUserLevel =
        lastData.user_last_level !== null &&
        lastData.user_last_level !== undefined
          ? parseInt(lastData.user_last_level, 10)
          : null;

      try {
        await apiCall("POST", {
          what: "save_level",
          author: lastData.author,
          author_id: lastData.authorId,
          listname,
          market,
          level: newLevel,
          crop,
          animal,
          double_harvest: "1x",
          crop_count: 1,
          animal_count: 1,
          xp: 0,
          visited_by: await this.getCurrentUser(),
          url: lastData.url || window.location.href,
        });

        const levelChanged =
          Number.isFinite(previousUserLevel) && previousUserLevel !== newLevel;
        const delta = levelChanged ? newLevel - previousUserLevel : 0;
        const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;

        body.innerHTML = `
          <div style="color:green;text-align:center;margin-bottom:10px;">✅ Saved Level ${newLevel}</div>
          ${
            levelChanged
              ? `<div style="margin-bottom:10px;padding:10px;border:1px solid #d4a017;background:#fff4cc;color:#6b5300;border-radius:6px;line-height:1.4;">
                <strong>Level change since your last visit 🎉🎉🎉</strong><br>
                Before <strong>${previousUserLevel}</strong> → now: <strong>${newLevel}</strong> <span style="font-weight:bold;">(${deltaLabel})</span>
               </div>`
              : `<div style="margin-bottom:10px;padding:10px;border:1px solid #d9d9d9;background:#f7f7f7;color:#555;border-radius:6px;font-size:0.9em;">
                ${
                  Number.isFinite(previousUserLevel)
                    ? `No level change since your last visit (${previousUserLevel} → ${newLevel}).`
                    : `No previous personal level record found for this user.`
                }
               </div>`
          }
          <button id="cs-capture-again" class="cs-btn">📸 &nbsp;Capture Another</button>
          <button id="cs-btn-home"      class="cs-btn cs-btn-muted" style="margin-top:4px;">← &nbsp;Back to Menu</button>
        `;
        document.getElementById("cs-capture-again").onclick = () =>
          this.handleCapture();
        document.getElementById("cs-btn-home").onclick = () => this.showHome();
      } catch (e) {
        console.error("[CS] Save failed", e);
        alert("Failed to save level.");
      }
    },

    // ── CSDEBUG MODE ─────────────────────────────────────────────────────────
    // Triggered when ?csdebug=1 is in the URL.
    // Extracts the author level from the page DOM, saves it, then closes.

    async runDebugMode() {
      const panel = document.createElement("div");
      panel.id = "cs-debug-panel";
      panel.style.cssText = [
        "position:fixed;top:16px;right:16px;width:380px",
        "background:#1e1e1e;color:#d4d4d4",
        "font-family:monospace;font-size:12px;line-height:1.7",
        "border-radius:8px;padding:14px 16px",
        "z-index:999999;box-shadow:0 4px 24px rgba(0,0,0,0.6)",
      ].join(";");
      document.body.appendChild(panel);

      const log = (msg, color = "#d4d4d4") => {
        const line = document.createElement("div");
        line.style.color = color;
        line.textContent = msg;
        panel.appendChild(line);
        console.log("[CS-debug]", msg);
      };

      const done = (delaySecs = 4) => {
        log(`─`.repeat(44), "#444");
        log(`Closing in ${delaySecs}s…`, "#666");
        setTimeout(() => window.close(), delaySecs * 1000);
      };

      log("🔍 CS Debug — Level Capture", "#56ccf2");
      log(`─`.repeat(44), "#444");

      // 1. Author
      const author = this.getAuthor();
      const authorId = this.getAuthorId();
      log(
        `👤 Author: ${author ? "u/" + author : "(not found)"}`,
        author ? "#d4d4d4" : "#eb5757",
      );
      if (!author) {
        done();
        return;
      }

      // 2. Flair extraction
      const flair = extractFlairFromDom();
      log(
        `🏷  Flair: ${flair ?? "(none found)"}`,
        flair ? "#d4d4d4" : "#f2994a",
      );

      const level = parseLevelFromFlair(flair);
      log(
        `📊 Level: ${level || "(could not parse)"}`,
        level ? "#6fcf97" : "#f2994a",
      );

      if (!level) {
        log("⚠️  No level — nothing to save.", "#f2994a");
        done();
        return;
      }

      // 3. Fetch existing DB record (for listname, crop, animal, etc.)
      log("🗄  Fetching database record…", "#56ccf2");
      let db = null;
      //const currentUser = await this.getCurrentUser();
      try {
        db = await apiCall("GET", {
          what: "get_level",
          author,
          visited_by: "bot",
        });
        log(`   DB level: ${db?.level ?? "(not in DB)"}`, "#888");
      } catch {
        log("   (author not in DB — will create new record)", "#888");
      }

      // 4. Save — use 'bot' so the Last Bot Visit column updates on the
      //    update-levels page.  The human who triggered it ran the page.
      log(`💾 Saving level ${level}…`, "#56ccf2");
      try {
        await apiCall("POST", {
          what: "save_level",
          author,
          author_id: authorId || db?.author_id || "",
          listname: db?.listname || "Other",
          market: db?.market || 0,
          level,
          crop: db?.crop || "none",
          animal: db?.animal || "none",
          double_harvest: "1x",
          crop_count: 1,
          animal_count: 1,
          xp: 0,
          visited_by: "bot",
          url: (() => {
            // Strip ?csdebug=1 so it doesn't accumulate in the DB across runs
            const u = new URL(window.location.href);
            u.searchParams.delete("csdebug");
            return u.toString();
          })(),
        });
        log(`✅ Saved! Level ${level} recorded.`, "#6fcf97");
      } catch (e) {
        log(`❌ Save failed: ${JSON.stringify(e)}`, "#eb5757");
      }

      done(3);
    },

    // ── HELPERS ───────────────────────────────────────────────────────────────

    async getCurrentUser() {
      if (_cachedUserId) return _cachedUserId;
      let stored = (await FVM_Storage.get("fvm_user_id")) || "";
      if (!stored) {
        const entered = prompt("Enter your Reddit username (without u/):");
        if (entered?.trim()) {
          stored = entered.trim().replace(/^u\//, "");
          await FVM_Storage.set("fvm_user_id", stored);
        } else {
          return null;
        }
      }
      _cachedUserId = stored;
      return _cachedUserId;
    },

    async getBotVisitDate() {
      try {
        const response = await apiCall("GET", { what: "get_last_bot_check" });
        const utc = Number(response?.last_bot_check_utc);
        return utc ? this.formatBotVisitDate(utc) : "unknown";
      } catch {
        return "unknown";
      }
    },

    formatBotVisitDate(utcSeconds) {
      const now = new Date();
      const date = new Date(utcSeconds * 1000);
      const ageHours = (now - date) / 3_600_000;

      const statusEmoji = ageHours < 24 ? "🟢" : ageHours < 48 ? "🟠" : "🔴";
      const dayDiff = Math.floor(
        (new Date(now.getFullYear(), now.getMonth(), now.getDate()) -
          new Date(date.getFullYear(), date.getMonth(), date.getDate())) /
          86_400_000,
      );
      const timeText = date
        .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        .toLowerCase()
        .replace(" am", "am")
        .replace(" pm", "pm");

      if (dayDiff <= 0) return `Today ${timeText} ${statusEmoji}`;
      if (dayDiff === 1) return `Yesterday ${timeText} ${statusEmoji}`;
      if (dayDiff < 7) return `${dayDiff} days ago ${statusEmoji}`;
      const weeks = Math.floor(dayDiff / 7);
      return `${weeks === 1 ? "1 week" : `${weeks} weeks`} ago ${statusEmoji}`;
    },
  };

  // ── BOOT ────────────────────────────────────────────────────────────────────
  async function boot() {
    console.log("[CS] boot() called");
    try {
      await FVM_Storage.migrate();
      document.getElementById("cs-popup")?.remove();
      document.getElementById("cs-reopen-btn")?.remove();

      // ?csdebug=1 — extract level from page and save, then auto-close
      if (new URLSearchParams(location.search).has("csdebug")) {
        await CS_UI.runDebugMode();
        return;
      }

      CS_UI.init();
    } catch (e) {
      console.error("[CS] boot() failed:", e);
    }
  }

  // Reddit is a SPA — pushState hooking is unreliable because Reddit's own
  // framework can override it. Poll the URL instead; cost is negligible.
  let _lastUrl = "";
  let _bootTimer = null;
  function watchUrl() {
    setInterval(() => {
      if (location.href !== _lastUrl) {
        _lastUrl = location.href;
        console.log("[CS] URL changed →", _lastUrl);
        clearTimeout(_bootTimer);
        _bootTimer = setTimeout(boot, 500);
      }
    }, 500);
  }

  function start() {
    _lastUrl = location.href;
    boot();
    watchUrl();
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    start();
  } else {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
