// ============ 2 Cars – Secure Backend (Self-contained, v3) ============
// v3 fix: every routerAdd handler is now fully self-contained — no
//         helper functions declared outside routerAdd are called from
//         inside a handler (including inside .map()/.filter() callbacks).
//         This works around a PocketBase JSVM quirk where functions
//         declared at file top-level are not always visible from inside
//         router-callback closures (seen as "ReferenceError: X is not
//         defined" at request time even though the file parses fine).
//
// >>> POCKETBASE ADMIN CHANGES (do these BEFORE deploying, if not done) <<<
// 1) Auth collection "users" (built-in email+password, API rules locked).
// 2) players.user -> Relation to "users", Max select 1, not required.
//    Unique index: CREATE UNIQUE INDEX idx_players_user ON players (user)
//                   WHERE user IS NOT NULL AND user != ''
// 3) Unique index on players.device_id (should already exist).
// 4) Deploy this file as pb_hooks/main.pb.js and restart PocketBase.
// ========================================================================

// =================================================================
// AUTH: SIGN UP  ->  POST /api/auth/signup
// body (JSON): { email, password, username, deviceId? }
// =================================================================
routerAdd("POST", "/api/auth/signup", (e) => {
    try {
        const info = e.requestInfo();
        const body = info.body || {};
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const username = String(body.username || "player").trim().slice(0, 15) || "player";
        const deviceId = String(body.deviceId || "").trim();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return e.json(400, { ok: false, error: "invalid email" });
        }
        if (password.length < 8 || password.length > 72) {
            return e.json(400, { ok: false, error: "password must be 8-72 characters" });
        }

        let existing = null;
        try { existing = $app.findAuthRecordByEmail("users", email); } catch (_) {}
        if (existing) {
            return e.json(400, { ok: false, error: "email already registered" });
        }

        const usersCollection = $app.findCollectionByNameOrId("users");
        const userRecord = new Record(usersCollection);
        userRecord.set("email", email);
        userRecord.setPassword(password);
        userRecord.set("verified", true);
        $app.save(userRecord);

        let player = null;
        if (deviceId) {
            try { player = $app.findFirstRecordByData("players", "device_id", deviceId); } catch (_) { player = null; }
        }
        if (player) {
            let alreadyClaimed = "";
            try { alreadyClaimed = String(player.get("user") || ""); } catch (_) {}
            if (alreadyClaimed) player = null;
        }
        if (!player) {
            const coll = $app.findCollectionByNameOrId("players");
            player = new Record(coll);
            player.set("username", username || "player");
            player.set("device_id", deviceId || ("acct_" + userRecord.id));
            player.set("total_score", 0);
            player.set("high_score_classic", 0);
            player.set("high_score_custom", 0);
            player.set("games_classic", 0);
            player.set("games_custom", 0);
            player.set("cup1", 0);
            player.set("cup2", 0);
            player.set("cup3", 0);
            player.set("cup4", 0);
            player.set("cup5", 0);
            player.set("last_username_change", "");
        } else if (username) {
            player.set("username", username);
        }
        player.set("user", userRecord.id);
        $app.save(player);

        const token = userRecord.newAuthToken();
        return e.json(200, {
            ok: true,
            token,
            userId: userRecord.id,
            player: {
                id: player.id,
                username: String(player.get("username") || ""),
                total_score: Number(player.get("total_score")) || 0,
                high_score_classic: Number(player.get("high_score_classic")) || 0,
                high_score_custom: Number(player.get("high_score_custom")) || 0,
                games_classic: Number(player.get("games_classic")) || 0,
                games_custom: Number(player.get("games_custom")) || 0,
                cups: {
                    cup1: Number(player.get("cup1")) || 0,
                    cup2: Number(player.get("cup2")) || 0,
                    cup3: Number(player.get("cup3")) || 0,
                    cup4: Number(player.get("cup4")) || 0,
                    cup5: Number(player.get("cup5")) || 0,
                },
                last_username_change: String(player.get("last_username_change") || ""),
                last_played: String(player.get("last_played") || ""),
                created: String(player.get("created") || ""),
                has_account: Boolean(player.get("user")),
            },
        });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// =================================================================
// AUTH: SIGN IN  ->  POST /api/auth/signin
// body (JSON): { email, password }
// =================================================================
routerAdd("POST", "/api/auth/signin", (e) => {
    try {
        const info = e.requestInfo();
        const body = info.body || {};
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
            return e.json(400, { ok: false, error: "invalid credentials" });
        }

        let userRecord = null;
        try { userRecord = $app.findAuthRecordByEmail("users", email); } catch (_) {}
        if (!userRecord || !userRecord.validatePassword(password)) {
            return e.json(401, { ok: false, error: "invalid email or password" });
        }

        let player = null;
        try { player = $app.findFirstRecordByData("players", "user", userRecord.id); } catch (_) { player = null; }
        if (!player) {
            const coll = $app.findCollectionByNameOrId("players");
            player = new Record(coll);
            player.set("username", "player");
            player.set("device_id", "acct_" + userRecord.id);
            player.set("total_score", 0);
            player.set("high_score_classic", 0);
            player.set("high_score_custom", 0);
            player.set("games_classic", 0);
            player.set("games_custom", 0);
            player.set("cup1", 0);
            player.set("cup2", 0);
            player.set("cup3", 0);
            player.set("cup4", 0);
            player.set("cup5", 0);
            player.set("last_username_change", "");
            player.set("user", userRecord.id);
            $app.save(player);
        }

        const token = userRecord.newAuthToken();
        return e.json(200, {
            ok: true,
            token,
            userId: userRecord.id,
            player: {
                id: player.id,
                username: String(player.get("username") || ""),
                total_score: Number(player.get("total_score")) || 0,
                high_score_classic: Number(player.get("high_score_classic")) || 0,
                high_score_custom: Number(player.get("high_score_custom")) || 0,
                games_classic: Number(player.get("games_classic")) || 0,
                games_custom: Number(player.get("games_custom")) || 0,
                cups: {
                    cup1: Number(player.get("cup1")) || 0,
                    cup2: Number(player.get("cup2")) || 0,
                    cup3: Number(player.get("cup3")) || 0,
                    cup4: Number(player.get("cup4")) || 0,
                    cup5: Number(player.get("cup5")) || 0,
                },
                last_username_change: String(player.get("last_username_change") || ""),
                last_played: String(player.get("last_played") || ""),
                created: String(player.get("created") || ""),
                has_account: Boolean(player.get("user")),
            },
        });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// =================================================================
// AUTH: LINK DEVICE  ->  POST /api/auth/link-device   (requires Authorization)
// body (JSON): { deviceId }
// =================================================================
routerAdd("POST", "/api/auth/link-device", (e) => {
    try {
        let authRecord = null;
        try {
            const header = e.request.header.get("Authorization") || "";
            const m = header.match(/^Bearer\s+(.+)$/i);
            const tok = m ? m[1].trim() : "";
            if (tok) authRecord = $app.findAuthRecordByToken(tok, "auth");
        } catch (_) { authRecord = null; }
        if (!authRecord) return e.json(401, { ok: false, error: "not authenticated" });

        const info = e.requestInfo();
        const body = info.body || {};
        const deviceId = String(body.deviceId || "").trim();
        if (deviceId.length < 8 || deviceId.length > 64) {
            return e.json(400, { ok: false, error: "invalid deviceId" });
        }

        let guestPlayer = null;
        try { guestPlayer = $app.findFirstRecordByData("players", "device_id", deviceId); } catch (_) { guestPlayer = null; }
        let claimedBy = "";
        try { claimedBy = guestPlayer ? String(guestPlayer.get("user") || "") : ""; } catch (_) {}
        if (!guestPlayer || claimedBy) {
            return e.json(404, { ok: false, error: "no unclaimed guest progress on this device" });
        }

        guestPlayer.set("user", authRecord.id);
        $app.save(guestPlayer);
        return e.json(200, {
            ok: true,
            player: {
                id: guestPlayer.id,
                username: String(guestPlayer.get("username") || ""),
                total_score: Number(guestPlayer.get("total_score")) || 0,
                high_score_classic: Number(guestPlayer.get("high_score_classic")) || 0,
                high_score_custom: Number(guestPlayer.get("high_score_custom")) || 0,
                games_classic: Number(guestPlayer.get("games_classic")) || 0,
                games_custom: Number(guestPlayer.get("games_custom")) || 0,
                cups: {
                    cup1: Number(guestPlayer.get("cup1")) || 0,
                    cup2: Number(guestPlayer.get("cup2")) || 0,
                    cup3: Number(guestPlayer.get("cup3")) || 0,
                    cup4: Number(guestPlayer.get("cup4")) || 0,
                    cup5: Number(guestPlayer.get("cup5")) || 0,
                },
                last_username_change: String(guestPlayer.get("last_username_change") || ""),
                last_played: String(guestPlayer.get("last_played") || ""),
                created: String(guestPlayer.get("created") || ""),
                has_account: Boolean(guestPlayer.get("user")),
            },
        });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// ---------- GET /api/game/me ----------
// Works with EITHER "Authorization: Bearer <token>" OR "?deviceId=..."
routerAdd("GET", "/api/game/me", (e) => {
    try {
        let player = null;

        let authRecord = null;
        try {
            const header = e.request.header.get("Authorization") || "";
            const m = header.match(/^Bearer\s+(.+)$/i);
            const tok = m ? m[1].trim() : "";
            if (tok) authRecord = $app.findAuthRecordByToken(tok, "auth");
        } catch (_) { authRecord = null; }

        if (authRecord) {
            try { player = $app.findFirstRecordByData("players", "user", authRecord.id); } catch (_) { player = null; }
        }
        if (!player) {
            const info = e.requestInfo();
            const deviceId = String(info.query.deviceId || "").trim();
            if (deviceId.length >= 8 && deviceId.length <= 64) {
                try { player = $app.findFirstRecordByData("players", "device_id", deviceId); } catch (_) { player = null; }
            }
        }

        if (!player) return e.json(404, { ok: false, error: "player not found" });

        return e.json(200, {
            ok: true,
            player: {
                id: player.id,
                username: String(player.get("username") || ""),
                total_score: Number(player.get("total_score")) || 0,
                high_score_classic: Number(player.get("high_score_classic")) || 0,
                high_score_custom: Number(player.get("high_score_custom")) || 0,
                games_classic: Number(player.get("games_classic")) || 0,
                games_custom: Number(player.get("games_custom")) || 0,
                cups: {
                    cup1: Number(player.get("cup1")) || 0,
                    cup2: Number(player.get("cup2")) || 0,
                    cup3: Number(player.get("cup3")) || 0,
                    cup4: Number(player.get("cup4")) || 0,
                    cup5: Number(player.get("cup5")) || 0,
                },
                last_username_change: String(player.get("last_username_change") || ""),
                last_played: String(player.get("last_played") || ""),
                created: String(player.get("created") || ""),
                has_account: Boolean(player.get("user")),
            },
        });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// ---------- GET /api/game/register (guests only, unchanged) ----------
routerAdd("GET", "/api/game/register", (e) => {
    try {
        const info = e.requestInfo();
        const username = String(info.query.username || "player").trim().slice(0, 15);
        const deviceId = String(info.query.deviceId || "").trim();

        if (deviceId.length < 8 || deviceId.length > 64) {
            return e.json(400, { ok: false, error: "invalid deviceId" });
        }

        let player = null;
        try { player = $app.findFirstRecordByData("players", "device_id", deviceId); } catch (_) { player = null; }
        if (!player) {
            const coll = $app.findCollectionByNameOrId("players");
            player = new Record(coll);
            player.set("username", username || "player");
            player.set("device_id", deviceId);
            player.set("total_score", 0);
            player.set("high_score_classic", 0);
            player.set("high_score_custom", 0);
            player.set("games_classic", 0);
            player.set("games_custom", 0);
            player.set("cup1", 0);
            player.set("cup2", 0);
            player.set("cup3", 0);
            player.set("cup4", 0);
            player.set("cup5", 0);
            player.set("last_username_change", "");
            $app.save(player);
        }

        return e.json(200, { ok: true, id: player.id, username: String(player.get("username") || "") });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// ---------- GET /api/game/change-name ----------
routerAdd("GET", "/api/game/change-name", (e) => {
    const NAME_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
    try {
        const info = e.requestInfo();
        const newUsername = String(info.query.username || "").trim().slice(0, 15);
        if (newUsername.length < 1) {
            return e.json(400, { ok: false, error: "empty username" });
        }

        let player = null;
        let authRecord = null;
        try {
            const header = e.request.header.get("Authorization") || "";
            const m = header.match(/^Bearer\s+(.+)$/i);
            const tok = m ? m[1].trim() : "";
            if (tok) authRecord = $app.findAuthRecordByToken(tok, "auth");
        } catch (_) { authRecord = null; }

        if (authRecord) {
            try { player = $app.findFirstRecordByData("players", "user", authRecord.id); } catch (_) { player = null; }
        }
        if (!player) {
            const deviceId = String(info.query.deviceId || "").trim();
            if (deviceId.length >= 8 && deviceId.length <= 64) {
                try { player = $app.findFirstRecordByData("players", "device_id", deviceId); } catch (_) { player = null; }
            }
        }
        if (!player) return e.json(404, { ok: false, error: "player not found" });

        const lastChange = String(player.get("last_username_change") || "");
        const isInitialDefaultName = String(player.get("username") || "") === "player";
        const now = Date.now();
        if (lastChange && !isInitialDefaultName) {
            const lastMs = new Date(lastChange).getTime();
            const remaining = NAME_CHANGE_COOLDOWN_MS - (now - lastMs);
            if (remaining > 0) {
                return e.json(429, { ok: false, error: "cooldown", remaining_ms: remaining });
            }
        }

        player.set("username", newUsername);
        player.set("last_username_change", new Date().toISOString());
        $app.save(player);

        return e.json(200, { ok: true, username: newUsername });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// ---------- GET /api/game/submit ----------
routerAdd("GET", "/api/game/submit", (e) => {
    const MAX_SCORE = 10000;
    try {
        const info = e.requestInfo();
        const mode = String(info.query.mode || "classic");
        const score = Math.floor(Number(info.query.score));
        const sessionStart = parseInt(info.query.sessionStart || "0", 10);

        if (mode !== "classic" && mode !== "custom") {
            return e.json(400, { ok: false, error: "invalid mode" });
        }
        if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
            return e.json(400, { ok: false, error: "invalid score" });
        }

        const now = Date.now();
        const sessionDurationSec = sessionStart > 0 ? (now - sessionStart) / 1000 : 0;
        if (score > 50 && sessionDurationSec < 5) {
            return e.json(400, { ok: false, error: "suspicious session" });
        }

        let player = null;
        let authRecord = null;
        try {
            const header = e.request.header.get("Authorization") || "";
            const m = header.match(/^Bearer\s+(.+)$/i);
            const tok = m ? m[1].trim() : "";
            if (tok) authRecord = $app.findAuthRecordByToken(tok, "auth");
        } catch (_) { authRecord = null; }

        if (authRecord) {
            try { player = $app.findFirstRecordByData("players", "user", authRecord.id); } catch (_) { player = null; }
        }
        if (!player) {
            const deviceId = String(info.query.deviceId || "").trim();
            if (deviceId.length >= 8 && deviceId.length <= 64) {
                try { player = $app.findFirstRecordByData("players", "device_id", deviceId); } catch (_) { player = null; }
            }
        }
        if (!player) return e.json(404, { ok: false, error: "player not found" });

        const gamesKey = mode === "classic" ? "games_classic" : "games_custom";
        const highKey = mode === "classic" ? "high_score_classic" : "high_score_custom";
        const currentGames = Number(player.get(gamesKey)) || 0;
        const currentHigh = Number(player.get(highKey)) || 0;
        const currentTotal = Number(player.get("total_score")) || 0;

        player.set(gamesKey, currentGames + 1);
        player.set("total_score", currentTotal + score);

        let newHigh = false;
        if (score > currentHigh) {
            player.set(highKey, score);
            newHigh = true;
        }

        const cupsAwarded = [];
        if (mode === "classic") {
            const cupThresholds = [
                { field: "cup1", threshold: 100 },
                { field: "cup2", threshold: 250 },
                { field: "cup3", threshold: 400 },
                { field: "cup4", threshold: 700 },
                { field: "cup5", threshold: 1000 },
            ];
            for (let i = 0; i < cupThresholds.length; i++) {
                const c = cupThresholds[i];
                if (score >= c.threshold) {
                    const cur = Number(player.get(c.field)) || 0;
                    player.set(c.field, cur + 1);
                    cupsAwarded.push(c.field);
                }
            }
        }

        $app.save(player);

        return e.json(200, {
            ok: true,
            newHigh: newHigh,
            cupsAwarded: cupsAwarded,
            stats: {
                total_score: Number(player.get("total_score")) || 0,
                high_score_classic: Number(player.get("high_score_classic")) || 0,
                high_score_custom: Number(player.get("high_score_custom")) || 0,
                games_classic: Number(player.get("games_classic")) || 0,
                games_custom: Number(player.get("games_custom")) || 0,
                cups: {
                    cup1: Number(player.get("cup1")) || 0,
                    cup2: Number(player.get("cup2")) || 0,
                    cup3: Number(player.get("cup3")) || 0,
                    cup4: Number(player.get("cup4")) || 0,
                    cup5: Number(player.get("cup5")) || 0,
                },
            },
        });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// ---------- GET /api/game/top ----------
routerAdd("GET", "/api/game/top", (e) => {
    try {
        const info = e.requestInfo();
        const mode = String(info.query.mode || "classic");
        const limit = Math.min(parseInt(info.query.limit || "10", 10) || 10, 100);

        const field = mode === "custom" ? "high_score_custom" : "high_score_classic";
        const filter = field + " > 0";

        const records = $app.findRecordsByFilter("players", filter, "-" + field, limit, 0);

        const top = [];
        for (let i = 0; i < records.length; i++) {
            const r = records[i];
            let name = "player";
            let score = 0;
            try { name = String(r.get("username") || "player"); } catch (_) {}
            try { const n = Number(r.get(field)); score = Number.isFinite(n) ? n : 0; } catch (_) {}
            top.push({ name: name, score: score });
        }

        return e.json(200, { ok: true, top: top });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

console.log("=== Game hooks loaded (Secure Self-contained + Auth, v3) ===");
