// ============ 2 Cars – Secure Backend (Self-contained) ============

// ---------- GET /api/game/me ----------
routerAdd("GET", "/api/game/me", (e) => {
    const findPlayer = function(deviceId) {
        try { return $app.findFirstRecordByData("players", "device_id", deviceId); }
        catch (_) { return null; }
    };
    const safeStr = function(rec, name) {
        try { return String(rec.get(name) || ""); } catch (_) { return ""; }
    };
    const safeNum = function(rec, name) {
        try { const v = rec.get(name); const n = Number(v); return Number.isFinite(n) ? n : 0; } catch (_) { return 0; }
    };

    try {
        const info = e.requestInfo();
        const deviceId = String(info.query.deviceId || "").trim();

        if (deviceId.length < 8 || deviceId.length > 64) {
            return e.json(400, { ok: false, error: "invalid deviceId" });
        }

        const player = findPlayer(deviceId);
        if (!player) return e.json(404, { ok: false, error: "player not found" });

        return e.json(200, {
            ok: true,
            player: {
                id: player.id,
                username: safeStr(player, "username"),
                total_score: safeNum(player, "total_score"),
                high_score_classic: safeNum(player, "high_score_classic"),
                high_score_custom: safeNum(player, "high_score_custom"),
                games_classic: safeNum(player, "games_classic"),
                games_custom: safeNum(player, "games_custom"),
                cups: {
                    cup1: safeNum(player, "cup1"),
                    cup2: safeNum(player, "cup2"),
                    cup3: safeNum(player, "cup3"),
                    cup4: safeNum(player, "cup4"),
                    cup5: safeNum(player, "cup5"),
                },
                last_username_change: safeStr(player, "last_username_change"),
                last_played: safeStr(player, "last_played"),
                created: safeStr(player, "created"),
            }
        });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// ---------- GET /api/game/register ----------
routerAdd("GET", "/api/game/register", (e) => {
    const findPlayer = function(deviceId) {
        try { return $app.findFirstRecordByData("players", "device_id", deviceId); }
        catch (_) { return null; }
    };
    const safeStr = function(rec, name) {
        try { return String(rec.get(name) || ""); } catch (_) { return ""; }
    };

    try {
        const info = e.requestInfo();
        const username = String(info.query.username || "player").trim().slice(0, 15);
        const deviceId = String(info.query.deviceId || "").trim();

        if (deviceId.length < 8 || deviceId.length > 64) {
            return e.json(400, { ok: false, error: "invalid deviceId" });
        }

        let player = findPlayer(deviceId);

        if (!player) {
            const coll = $app.findCollectionByNameOrId("players");
            const newRec = new Record(coll);
            newRec.set("username", username);
            newRec.set("device_id", deviceId);
            newRec.set("total_score", 0);
            newRec.set("high_score_classic", 0);
            newRec.set("high_score_custom", 0);
            newRec.set("games_classic", 0);
            newRec.set("games_custom", 0);
            newRec.set("cup1", 0);
            newRec.set("cup2", 0);
            newRec.set("cup3", 0);
            newRec.set("cup4", 0);
            newRec.set("cup5", 0);
            // A newly created default player has not changed their name yet.
            newRec.set("last_username_change", "");
            $app.save(newRec);
            player = findPlayer(deviceId);
        }

        return e.json(200, {
            ok: true,
            id: player.id,
            username: safeStr(player, "username"),
        });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// ---------- GET /api/game/change-name ----------
routerAdd("GET", "/api/game/change-name", (e) => {
    const findPlayer = function(deviceId) {
        try { return $app.findFirstRecordByData("players", "device_id", deviceId); }
        catch (_) { return null; }
    };
    const safeStr = function(rec, name) {
        try { return String(rec.get(name) || ""); } catch (_) { return ""; }
    };
    const NAME_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

    try {
        const info = e.requestInfo();
        const deviceId = String(info.query.deviceId || "").trim();
        const newUsername = String(info.query.username || "").trim().slice(0, 15);

        if (deviceId.length < 8 || deviceId.length > 64) {
            return e.json(400, { ok: false, error: "invalid deviceId" });
        }
        if (newUsername.length < 1) {
            return e.json(400, { ok: false, error: "empty username" });
        }

        const player = findPlayer(deviceId);
        if (!player) return e.json(404, { ok: false, error: "player not found" });

        const lastChange = safeStr(player, "last_username_change");
        const isInitialDefaultName = safeStr(player, "username") === "player";
        const now = Date.now();
        if (lastChange && !isInitialDefaultName) {
            const lastMs = new Date(lastChange).getTime();
            const remaining = NAME_CHANGE_COOLDOWN_MS - (now - lastMs);
            if (remaining > 0) {
                return e.json(429, {
                    ok: false,
                    error: "cooldown",
                    remaining_ms: remaining,
                });
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
    const SUBMIT_COOLDOWN_MS = 3000;
    const findPlayer = function(deviceId) {
        try { return $app.findFirstRecordByData("players", "device_id", deviceId); }
        catch (_) { return null; }
    };
    const safeNum = function(rec, name) {
        try { const v = rec.get(name); const n = Number(v); return Number.isFinite(n) ? n : 0; } catch (_) { return 0; }
    };

    try {
        const info = e.requestInfo();
        const deviceId = String(info.query.deviceId || "").trim();
        const mode = String(info.query.mode || "classic");
        const score = Math.floor(Number(info.query.score));
        const sessionStart = parseInt(info.query.sessionStart || "0", 10);

        if (deviceId.length < 8 || deviceId.length > 64) {
            return e.json(400, { ok: false, error: "invalid deviceId" });
        }
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

        const player = findPlayer(deviceId);
        if (!player) return e.json(404, { ok: false, error: "player not found" });

        const gamesKey = mode === "classic" ? "games_classic" : "games_custom";
        const highKey = mode === "classic" ? "high_score_classic" : "high_score_custom";

        const currentGames = safeNum(player, gamesKey);
        const currentHigh = safeNum(player, highKey);
        const currentTotal = safeNum(player, "total_score");

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
            for (const c of cupThresholds) {
                if (score >= c.threshold) {
                    player.set(c.field, safeNum(player, c.field) + 1);
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
                total_score: safeNum(player, "total_score"),
                high_score_classic: safeNum(player, "high_score_classic"),
                high_score_custom: safeNum(player, "high_score_custom"),
                games_classic: safeNum(player, "games_classic"),
                games_custom: safeNum(player, "games_custom"),
                cups: {
                    cup1: safeNum(player, "cup1"),
                    cup2: safeNum(player, "cup2"),
                    cup3: safeNum(player, "cup3"),
                    cup4: safeNum(player, "cup4"),
                    cup5: safeNum(player, "cup5"),
                },
            },
        });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

// ---------- GET /api/game/top ----------
routerAdd("GET", "/api/game/top", (e) => {
    const safeStr = function(rec, name) {
        try { return String(rec.get(name) || ""); } catch (_) { return ""; }
    };
    const safeNum = function(rec, name) {
        try { const v = rec.get(name); const n = Number(v); return Number.isFinite(n) ? n : 0; } catch (_) { return 0; }
    };

    try {
        const info = e.requestInfo();
        const mode = String(info.query.mode || "classic");
        const limit = Math.min(parseInt(info.query.limit || "10", 10) || 10, 100);

        const field = mode === "custom" ? "high_score_custom" : "high_score_classic";
        const filter = field + " > 0";

        const records = $app.findRecordsByFilter(
            "players",
            filter,
            "-" + field,
            limit,
            0
        );

        const top = records.map((r) => ({
            name: safeStr(r, "username"),
            score: safeNum(r, field),
        }));

        return e.json(200, { ok: true, top: top });
    } catch (err) {
        return e.json(500, { ok: false, error: String(err) });
    }
});

console.log("=== Game hooks loaded (Secure Self-contained) ===");
