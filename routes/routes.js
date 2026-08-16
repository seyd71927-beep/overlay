const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const multer = require('multer');
const upload = multer();

// Logo upload directory
const uploadLogoDir = path.join(__dirname, '../overlays/visual_assets/teams');
if (!fs.existsSync(uploadLogoDir)) {
    fs.mkdirSync(uploadLogoDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadLogoDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '.png';
        const teamTag = (req.body.teamTag || 'team_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
        cb(null, `${teamTag}_logo${ext}`);
    }
});
const logoUpload = multer({ storage: logoStorage });
const memUpload = multer({ storage: multer.memoryStorage() });

const fileLoader = require('../fileLoader');
let dataBus = new fileLoader();
dataBus.init('./config');

function setDataBus(instance) {
    if (instance) {
        dataBus = instance;
    }
}
router.setDataBus = setDataBus;

// Helper to broadcast socket events safely
function emitEvent(req, eventName, payload) {
    const io = req.app.get('io');
    if (io) {
        io.emit(eventName, payload);
    }
}

// Global Bridge Status for remote monitoring
let bridgeStatus = {
    connected: false,
    lastSync: null,
    inGame: false,
    phase: 'MENUS',
    map: 'sunset',
    round: 1,
    team_1_score: 0,
    team_2_score: 0,
    playerCount: 0,
    source: 'Remote India Bridge'
};

/*
-----------------------------------------
           PUBLIC OVERLAY REST ENDPOINTS
-----------------------------------------
*/

router.get('/health', (req, res) => {
    return res.status(200).json({ status: 'ok', time: Date.now(), bridgeConnected: bridgeStatus.connected });
});

router.get('/get_map_picks', (req, res) => {
    return res.status(200).json(dataBus.config.mapPicks || { teams: ['TEAM 1', 'TEAM 2'], picks: [], series_type: 'bo3' });
});

router.get('/get_player_stats', (req, res) => {
    if (typeof dataBus.getFormattedPlayerStats === 'function') {
        return res.status(200).json(dataBus.getFormattedPlayerStats());
    }

    let responseObject = {
        status: true,
        switch_teams: dataBus.config.gameState.switch_sides || false,
        team_1: {},
        team_2: {}
    };
    for (let i = 0; i < 5; i++) {
        responseObject.team_1[`player_${i}`] = dataBus.config.players[`player_${i}`]['data'];
        responseObject.team_1[`player_${i}`]['is_registered'] = dataBus.config.players[`player_${i}`].is_registered;
    }
    for (let i = 5; i < 10; i++) {
        responseObject.team_2[`player_${i - 5}`] = dataBus.config.players[`player_${i}`]['data'];
        responseObject.team_2[`player_${i - 5}`]['is_registered'] = dataBus.config.players[`player_${i}`].is_registered;
    }
    return res.status(200).send(responseObject);
});

// Bridge Sync Route: Receives live match data from India client bridge
router.post('/api/bridge/sync_match', upload.none(), (req, res) => {
    try {
        let payload = req.body;
        if (payload.jsonPayload) {
            payload = typeof payload.jsonPayload === 'string' ? JSON.parse(payload.jsonPayload) : payload.jsonPayload;
        } else if (typeof payload === 'string') {
            payload = JSON.parse(payload);
        }

        const now = Date.now();
        const inGame = (payload.phase === 'INGAME' || payload.inGame === true);
        const mapName = (payload.map || dataBus.config.gameState?.map || 'ascent').toLowerCase();
        const roundNum = typeof payload.round_number !== 'undefined' ? parseInt(payload.round_number) : (dataBus.config.gameState?.round_number || 1);
        const t1Score = typeof payload.team_1_score !== 'undefined' ? parseInt(payload.team_1_score) : (dataBus.config.gameState?.team_1_score || 0);
        const t2Score = typeof payload.team_2_score !== 'undefined' ? parseInt(payload.team_2_score) : (dataBus.config.gameState?.team_2_score || 0);
        const t1Players = Array.isArray(payload.team_1_players) ? payload.team_1_players : null;
        const t2Players = Array.isArray(payload.team_2_players) ? payload.team_2_players : null;
        const totalPlayers = (t1Players ? t1Players.length : 0) + (t2Players ? t2Players.length : 0);

        const isCustomMatch = (payload.isCustom === true || payload.isCustom === 'true' || payload.is_custom === true || payload.is_custom === 'true' || payload.is_custom_match === true || payload.is_custom_match === 'true');
        const isTournament = (payload.isTournamentMode === true || payload.isTournamentMode === 'true' || payload.is_tournament_mode === true || payload.is_tournament_mode === 'true');
        const matchType = payload.match_type || payload.matchType || (isTournament ? 'CUSTOM_TOURNAMENT' : (isCustomMatch ? 'CUSTOM_MATCH' : 'STANDARD'));

        bridgeStatus = {
            connected: true,
            online: true,
            lastSync: now,
            lastPing: now,
            phase: payload.phase || (inGame ? 'INGAME' : 'MENUS'),
            inGame: inGame,
            isCustom: isCustomMatch,
            is_custom_match: isCustomMatch,
            isTournamentMode: isTournament,
            is_tournament_mode: isTournament,
            matchType: matchType,
            match_type: matchType,
            map: mapName,
            round: roundNum,
            round_number: roundNum,
            team_1_score: t1Score,
            team_2_score: t2Score,
            spike_down: (payload.spike === 'down' || payload.spike === true) || (payload.spike_down === true || payload.spike_down === 'true'),
            playerCount: totalPlayers,
            playersCount: totalPlayers,
            source: 'Remote India Bridge'
        };

        // 1. Update Game State
        let stateChanged = false;
        let configChanged = false;

        if (payload.round_number && dataBus.config.gameState.round_number !== roundNum) {
            dataBus.config.gameState.round_number = roundNum;
            stateChanged = true;
        }
        if (typeof payload.team_1_score !== 'undefined' && dataBus.config.gameState.team_1_score !== t1Score) {
            dataBus.config.gameState.team_1_score = t1Score;
            stateChanged = true;
        }
        if (typeof payload.team_2_score !== 'undefined' && dataBus.config.gameState.team_2_score !== t2Score) {
            dataBus.config.gameState.team_2_score = t2Score;
            stateChanged = true;
        }
        if (typeof payload.spike !== 'undefined' || typeof payload.spike_down !== 'undefined') {
            dataBus.config.gameState.spike_down = (payload.spike === 'down' || payload.spike === true || payload.spike_down === true);
            stateChanged = true;
        }
        if (typeof payload.switch_sides !== 'undefined') {
            dataBus.config.gameState.switch_sides = (payload.switch_sides === true || payload.switch_sides === 'true');
            stateChanged = true;
        }
        if (payload.map) {
            dataBus.config.gameState.map = mapName;
            stateChanged = true;
        }
        if (typeof payload.isCustom !== 'undefined' || typeof payload.is_custom_match !== 'undefined') {
            dataBus.config.gameState.is_custom_match = isCustomMatch;
            dataBus.config.gameState.is_tournament_mode = isTournament;
            dataBus.config.gameState.match_type = matchType;
            stateChanged = true;
        }

        // 2. Update Map Flow (Veto / Upcoming Maps)
        if (payload.map && dataBus.config.gameState.game_flow) {
            for (const mapKey in dataBus.config.gameState.game_flow) {
                const m = dataBus.config.gameState.game_flow[mapKey];
                if (m && m.map && m.map.toLowerCase() === mapName) {
                    if (m.state !== 'current') {
                        m.state = 'current';
                        configChanged = true;
                    }
                    if (payload.team_1_score !== undefined) m.team_1_score = t1Score;
                    if (payload.team_2_score !== undefined) m.team_2_score = t2Score;
                }
            }
        }

        // 3. Update Team Info if provided and not locked
        const liveService = req.app.get('liveService');
        const lockManual = liveService ? liveService.lockManualTeamInfo : false;
        const tournamentTeams = dataBus.getTournamentData()?.teams || [];

        if (!lockManual) {
            if (payload.team_1 && (payload.team_1.abbreviation || payload.team_1.name)) {
                const t1Tag = String(payload.team_1.abbreviation || payload.team_1.name).toUpperCase();
                const tourneyTeam = tournamentTeams.find(t => (t.tag && t.tag.toUpperCase() === t1Tag) || (t.name && t.name.toUpperCase().includes(t1Tag)));
                if (tourneyTeam) {
                    dataBus.config.gameState.team_1.name = tourneyTeam.name;
                    dataBus.config.gameState.team_1.abbreviation = tourneyTeam.tag;
                    dataBus.config.gameState.team_1.team_info = tourneyTeam.seed || 'TEAM 1';
                    if (tourneyTeam.logo) dataBus.config.gameState.team_1.icon_link = tourneyTeam.logo;
                } else {
                    dataBus.config.gameState.team_1.name = payload.team_1.name || payload.team_1.abbreviation;
                    dataBus.config.gameState.team_1.abbreviation = payload.team_1.abbreviation || payload.team_1.name;
                    if (payload.team_1.icon_link) dataBus.config.gameState.team_1.icon_link = payload.team_1.icon_link;
                }
                stateChanged = true;
            }
            if (payload.team_2 && (payload.team_2.abbreviation || payload.team_2.name)) {
                const t2Tag = String(payload.team_2.abbreviation || payload.team_2.name).toUpperCase();
                const tourneyTeam = tournamentTeams.find(t => (t.tag && t.tag.toUpperCase() === t2Tag) || (t.name && t.name.toUpperCase().includes(t2Tag)));
                if (tourneyTeam) {
                    dataBus.config.gameState.team_2.name = tourneyTeam.name;
                    dataBus.config.gameState.team_2.abbreviation = tourneyTeam.tag;
                    dataBus.config.gameState.team_2.team_info = tourneyTeam.seed || 'TEAM 2';
                    if (tourneyTeam.logo) dataBus.config.gameState.team_2.icon_link = tourneyTeam.logo;
                } else {
                    dataBus.config.gameState.team_2.name = payload.team_2.name || payload.team_2.abbreviation;
                    dataBus.config.gameState.team_2.abbreviation = payload.team_2.abbreviation || payload.team_2.name;
                    if (payload.team_2.icon_link) dataBus.config.gameState.team_2.icon_link = payload.team_2.icon_link;
                }
                stateChanged = true;
            }
        }

        // 4. Update Dynamic Team Rosters & Exact Team Size from Lockfile
        if (t1Players && t2Players && (t1Players.length > 0 || t2Players.length > 0)) {
            dataBus.updateDynamicRoster(t1Players, t2Players);
            configChanged = true;
        } else if (typeof payload.team_1_count === 'number' && typeof payload.team_2_count === 'number') {
            dataBus.setRosterConfig(payload.team_1_count, payload.team_2_count, 'auto');
            configChanged = true;
        }

        // 5. Update Tournament Match Schedule
        const tourney = dataBus.getTournamentData();
        const t1Abbr = dataBus.config.gameState.team_1?.abbreviation;
        const t2Abbr = dataBus.config.gameState.team_2?.abbreviation;
        if (tourney && tourney.matches && t1Abbr && t2Abbr) {
            const liveMatch = tourney.matches.find(m =>
            ((m.team_1_tag === t1Abbr && m.team_2_tag === t2Abbr) ||
                (m.team_1_tag === t2Abbr && m.team_2_tag === t1Abbr))
            );
            if (liveMatch) {
                liveMatch.status = 'LIVE';
                liveMatch.score = `${t1Score} - ${t2Score}`;
                dataBus.saveTournamentData(tourney);
                emitEvent(req, 'tournamentUpdate', tourney);
            }
        }

        dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);
        if (configChanged) dataBus.saveStateToFile('gameConfiguration.json', dataBus.config.gameConfiguration);

        // Broadcast real-time updates to all connected browser overlays & Qatar panel
        const formattedStats = dataBus.getFormattedPlayerStats();
        emitEvent(req, 'stateUpdate', dataBus.getGameState());
        emitEvent(req, 'playerUpdate', formattedStats);
        emitEvent(req, 'playerStatsUpdate', formattedStats);
        emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
        emitEvent(req, 'mapPicksUpdate', dataBus.getGameConfiguration());
        emitEvent(req, 'bridgeStatusUpdate', bridgeStatus);
        emitEvent(req, 'bridgeTelemetry', bridgeStatus);

        return res.status(200).json({ status: true, message: 'Live match telemetry synchronized successfully across all overlays', bridgeStatus });
    } catch (err) {
        console.error('[Bridge Sync Error]:', err.message);
        return res.status(400).json({ status: false, message: 'Invalid payload: ' + err.message });
    }
});

router.get('/api/bridge/status', (req, res) => {
    const isOnline = bridgeStatus.lastSync && (Date.now() - bridgeStatus.lastSync < 15000);
    bridgeStatus.online = !!isOnline;
    bridgeStatus.connected = !!isOnline;
    return res.status(200).json({
        ...bridgeStatus,
        online: !!isOnline,
        connected: !!isOnline,
        secondsSincePing: bridgeStatus.lastSync ? Math.round((Date.now() - bridgeStatus.lastSync) / 1000) : null
    });
});

router.post('/api/set_team_roster_size', upload.none(), (req, res) => {
    const { team_1_count, team_2_count, roster_mode } = req.body;
    const t1 = parseInt(team_1_count) || 5;
    const t2 = parseInt(team_2_count) || 5;
    const result = dataBus.setRosterConfig(t1, t2, roster_mode || 'manual');
    emitEvent(req, 'playerUpdate', dataBus.getFormattedPlayerStats());
    emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
    return res.status(200).json({ status: true, rosterConfig: result });
});

router.get('/get_timer_info', upload.none(), (req, res) => {
    return res.status(200).send(dataBus.getTimer());
});

router.post('/set_timer', upload.none(), (req, res) => {
    const { timeMiliseconds, description } = req.body;
    if (!timeMiliseconds || !description) {
        return res.status(406).send({ status: false, message: 'Missing Arguments' });
    }
    dataBus.setTimer(parseInt(timeMiliseconds), description);
    emitEvent(req, 'timerUpdate', dataBus.getTimer());
    return res.status(200).send({ status: true });
});

router.post('/stop_timer', upload.none(), (req, res) => {
    dataBus.stopTimer();
    emitEvent(req, 'timerUpdate', dataBus.getTimer());
    return res.status(200).send({ status: true });
});

router.get('/get_game_configuration', (req, res) => {
    return res.status(200).json(dataBus.getGameConfiguration() || {});
});

router.get('/get_game_state', (req, res) => {
    return res.status(200).json(dataBus.getGameState() || {});
});

router.post('/change_game_state', upload.none(), (req, res) => {
    const { round_number, team_1_score, team_2_score, spike, switch_sides, round_over, tournament_stage } = req.body;

    if (typeof round_number !== 'undefined') dataBus.config.gameState.round_number = parseInt(round_number);
    if (typeof team_1_score !== 'undefined') dataBus.config.gameState.team_1_score = parseInt(team_1_score);
    if (typeof team_2_score !== 'undefined') dataBus.config.gameState.team_2_score = parseInt(team_2_score);
    if (typeof spike !== 'undefined') dataBus.config.gameState.spike_down = (spike === 'down' || spike === 'true' || spike === true);
    if (typeof switch_sides !== 'undefined') dataBus.config.gameState.switch_sides = (switch_sides === 'true' || switch_sides === true);
    if (typeof round_over !== 'undefined') dataBus.config.gameState.round_over = (round_over === 'true' || round_over === true);
    if (typeof tournament_stage !== 'undefined') dataBus.config.gameState.tournament_stage = tournament_stage.trim();

    dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);
    emitEvent(req, 'stateUpdate', dataBus.getGameState());
    return res.status(200).send({ status: true, state: dataBus.getGameState() });
});

router.post('/update_player_state', upload.none(), (req, res) => {
    var { playerData } = req.body;
    try {
        if (typeof playerData === 'string') playerData = JSON.parse(playerData);
        let updateSuccess = dataBus.updatePlayerData(playerData);
        if (!updateSuccess) {
            return res.status(500).send({ status: false });
        }
        const formatted = dataBus.getFormattedPlayerStats();
        emitEvent(req, 'playerUpdate', formatted);
        emitEvent(req, 'playerStatsUpdate', formatted);
        return res.status(200).send({ status: true });
    } catch (e) {
        return res.status(400).send({ status: false, message: 'Invalid JSON' });
    }
});

router.post('/register_external_user', upload.none(), (req, res) => {
    const { playerToken } = req.body;
    if (!playerToken) {
        return res.status(406).send({ status: false, message: 'Missing Arguments!' });
    }
    let playerTokenKey = dataBus.checkGameTokenValidity(playerToken);
    if (playerTokenKey.status) {
        let key = playerTokenKey.key;
        dataBus.config.players[key].is_registered = true;
        dataBus.config.players[key].last_updated = Date.now();
        const formatted = dataBus.getFormattedPlayerStats();
        emitEvent(req, 'playerUpdate', formatted);
        emitEvent(req, 'playerStatsUpdate', formatted);
        return res.status(200).send({ status: true, message: 'User Registered on server!' });
    } else {
        return res.status(400).send({ status: false, message: playerTokenKey.message });
    }
});

router.post('/clear_external_user', upload.none(), (req, res) => {
    const { playerToken } = req.body;
    if (!playerToken) {
        return res.status(406).send({ status: false, message: 'Missing Arguments!' });
    }
    let playerTokenKey = dataBus.findPlayerKeyByToken(playerToken);
    if (playerTokenKey.status) {
        let key = playerTokenKey.key;
        dataBus.config.players[key].is_registered = false;
        const formatted = dataBus.getFormattedPlayerStats();
        emitEvent(req, 'playerUpdate', formatted);
        emitEvent(req, 'playerStatsUpdate', formatted);
        return res.status(200).send({ status: true, message: 'User cleared!' });
    } else {
        return res.status(400).send({ status: false, message: playerTokenKey.message });
    }
});

/*
-----------------------------------------
               ADMIN ROUTES
-----------------------------------------
*/

router.get('/admin', (req, res) => {
    if (req.session.user && req.session.user.loggedIn) {
        const target_page = req.query.page || 'prestream';
        switch (target_page) {
            case 'prestream':
                return res.status(200).sendFile(path.join(__dirname, '../panel/admin_pre_live.html'));
            case 'tournament':
                return res.redirect('/admin?page=prestream');
            case 'stream':
                return res.status(200).sendFile(path.join(__dirname, '../panel/admin_live.html'));
            case 'settings':
                return res.status(200).sendFile(path.join(__dirname, '../panel/admin_settings.html'));
            default:
                return res.status(200).sendFile(path.join(__dirname, '../panel/admin_pre_live.html'));
        }
    } else {
        return res.status(401).send(`<script>location.href = '../auth'</script>`);
    }
});

router.get('/auth', (req, res) => {
    if (req.session && req.session.user && req.session.user.loggedIn) {
        return res.sendFile(path.join(__dirname, '../panel/admin_pre_live.html'));
    } else {
        return res.sendFile(path.join(__dirname, '../panel/auth.html'));
    }
});

router.post('/authenticate', upload.none(), (req, res) => {
    const { pw } = req.body;
    if (!pw || typeof pw !== 'string' || pw.trim() === '') {
        return res.status(400).json({ message: 'Password is required' });
    }
    if (!dataBus.checkPassword(pw)) {
        return res.status(401).json({ message: 'Authentication failed' });
    }
    req.session.user = { loggedIn: true };
    return res.status(200).json({ message: 'Authentication successful' });
});

router.post('/deauthenticate', (req, res) => {
    if (!req.session) {
        return res.status(400).json({ message: 'No active session found' });
    }
    req.session.destroy(error => {
        if (error) return res.status(500).json({ message: 'Failed to log out' });
        res.clearCookie('connect.sid');
        return res.status(200).json({ message: 'Logged out successfully' });
    });
});

router.post('/set_team_info', upload.none(), (req, res) => {
    const { team_1, team_2, lockTeams } = req.body;
    try {
        let t1 = typeof team_1 === 'string' ? JSON.parse(team_1) : team_1;
        let t2 = typeof team_2 === 'string' ? JSON.parse(team_2) : team_2;
        dataBus.updateTeamInfo(t1, t2);

        const liveService = req.app.get('liveService');
        if (liveService && typeof lockTeams !== 'undefined') {
            liveService.lockManualTeamInfo = (lockTeams === 'true' || lockTeams === true);
        }

        const formatted = dataBus.getFormattedPlayerStats();
        emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
        emitEvent(req, 'stateUpdate', dataBus.getGameState());
        emitEvent(req, 'playerUpdate', formatted);
        emitEvent(req, 'playerStatsUpdate', formatted);

        return res.status(200).send({ status: true, players: formatted });
    } catch (e) {
        return res.status(400).send({ status: false, message: 'Invalid team data' });
    }
});


router.post('/set_series_format', upload.none(), (req, res) => {
    const { format } = req.body;
    if (!format) {
        return res.status(400).send({ status: false, message: 'Missing format' });
    }
    const updated = dataBus.setSeriesFormat(format.toLowerCase());
    emitEvent(req, 'mapPicksUpdate', updated);
    emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
    return res.status(200).send({ status: true, mapPicks: updated, gameConfig: dataBus.getGameConfiguration() });
});

async function resolveMapBanData(input) {
    if (!input || typeof input !== 'string') return null;
    input = input.trim();

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'X-Requested-With': 'XMLHttpRequest'
    };

    const tryFetchJson = async (targetUrl) => {
        try {
            const res = await fetch(targetUrl, {
                headers,
                signal: AbortSignal.timeout(6000),
                redirect: 'follow'
            });
            if (res.ok) {
                const text = await res.text();
                try {
                    const parsed = JSON.parse(text);
                    if (parsed && (parsed.bans || parsed.maps || parsed.game)) {
                        return parsed;
                    }
                } catch (e) { }
            }
        } catch (e) { }
        return null;
    };

    const scrapeHtmlForViewId = async (targetUrl) => {
        try {
            const res = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                signal: AbortSignal.timeout(6000),
                redirect: 'follow'
            });
            if (res.ok) {
                const html = await res.text();
                const m = html.match(/viewID\s*=\s*["']([a-zA-Z0-9]+)["']/i) ||
                    html.match(/\/ban\/view\/([a-zA-Z0-9]+)/i) ||
                    html.match(/\/bandata\/([a-zA-Z0-9]+)/i) ||
                    html.match(/id="view"[^>]*>https?:\/\/[^\/]+\/ban\/view\/([a-zA-Z0-9]+)/i);
                if (m) return m[1];
            }
        } catch (e) { }
        return null;
    };

    // 1. Direct regex match
    let match = input.match(/\/ban\/(?:view|log|lobby|team\/\d+|editteam\/\d+)\/([a-zA-Z0-9]+)/i) || input.match(/\/bandata\/([a-zA-Z0-9]+)/i);
    let potentialId = match ? match[1] : (input.match(/^[a-zA-Z0-9]{10,32}$/) ? input : null);

    if (potentialId) {
        // Try directly as bandata
        let json = await tryFetchJson(`https://www.mapban.gg/bandata/${potentialId}`);
        if (json) return { viewId: potentialId, data: json };

        // Try scraping lobby page
        let extractedId = await scrapeHtmlForViewId(`https://www.mapban.gg/en/ban/lobby/${potentialId}`);
        if (extractedId) {
            let json2 = await tryFetchJson(`https://www.mapban.gg/bandata/${extractedId}`);
            if (json2) return { viewId: extractedId, data: json2 };
        }
    }

    // 2. Full URL scrape
    if (input.startsWith('http://') || input.startsWith('https://') || input.includes('mapban.gg')) {
        let fullUrl = input.startsWith('http') ? input : `https://${input}`;
        let extractedId = await scrapeHtmlForViewId(fullUrl);
        if (extractedId) {
            let json = await tryFetchJson(`https://www.mapban.gg/bandata/${extractedId}`);
            if (json) return { viewId: extractedId, data: json };
        }
    }

    return null;
}

router.post('/sync_mapban', upload.none(), async (req, res) => {
    const { urlOrId, jsonData } = req.body;

    if (jsonData) {
        try {
            const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            const updated = dataBus.applyMapBanData(parsed);
            emitEvent(req, 'mapPicksUpdate', updated);
            emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
            return res.status(200).json({
                status: true,
                message: 'Imported MapBan.gg data successfully',
                mapPicks: updated,
                gameConfig: dataBus.getGameConfiguration()
            });
        } catch (e) {
            return res.status(400).json({ status: false, message: 'Invalid JSON data' });
        }
    }

    if (!urlOrId || typeof urlOrId !== 'string' || urlOrId.trim() === '') {
        return res.status(400).json({ status: false, message: 'Please provide a MapBan.gg URL or Room ID' });
    }

    const resolved = await resolveMapBanData(urlOrId);

    if (resolved && resolved.data) {
        const updated = dataBus.applyMapBanData(resolved.data);
        emitEvent(req, 'mapPicksUpdate', updated);
        emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
        return res.status(200).json({
            status: true,
            message: `Synced from MapBan.gg (${resolved.viewId})!`,
            mapPicks: updated,
            gameConfig: dataBus.getGameConfiguration()
        });
    } else {
        return res.status(400).json({
            status: false,
            message: 'MapBan.gg lobby/view ID was not found or has expired. Please copy the "Link for viewers" or "Link for lobby" from an active MapBan room.'
        });
    }
});

router.post('/set_map_picks', upload.none(), (req, res) => {
    const { index, map, action } = req.body;
    if (typeof index === 'undefined' || !map || !action) {
        return res.status(400).send({ status: false, message: "Missing Arguments" });
    }
    dataBus.updateMapPick(index, map, action);
    emitEvent(req, 'mapPicksUpdate', dataBus.config.mapPicks);
    emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
    return res.status(200).send({ status: true });
});

router.post('/update_player_direct', upload.none(), (req, res) => {
    const { playerIndex, playerData } = req.body;
    if (typeof playerIndex === 'undefined' || !playerData) {
        return res.status(400).send({ status: false, message: 'Missing parameters' });
    }
    try {
        let pData = typeof playerData === 'string' ? JSON.parse(playerData) : playerData;
        dataBus.updatePlayerDirect(playerIndex, pData);
        const formatted = dataBus.getFormattedPlayerStats();
        emitEvent(req, 'playerUpdate', formatted);
        emitEvent(req, 'playerStatsUpdate', formatted);
        return res.status(200).send({ status: true });
    } catch (e) {
        return res.status(400).send({ status: false, message: 'Invalid JSON data' });
    }
});

router.post('/trigger_win_banner', upload.none(), (req, res) => {
    const { winningTeam } = req.body; // 'team_1' or 'team_2'
    if (winningTeam === 'team_1') {
        dataBus.config.gameState.team_1_score += 1;
    } else if (winningTeam === 'team_2') {
        dataBus.config.gameState.team_2_score += 1;
    }
    dataBus.config.gameState.round_number += 1;
    dataBus.config.gameState.round_over = true;
    dataBus.config.gameState.spike_down = false;

    dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);

    emitEvent(req, 'winBannerTrigger', {
        winningTeam,
        team_1_score: dataBus.config.gameState.team_1_score,
        team_2_score: dataBus.config.gameState.team_2_score,
        round_number: dataBus.config.gameState.round_number
    });
    emitEvent(req, 'stateUpdate', dataBus.getGameState());
    return res.status(200).send({ status: true, state: dataBus.getGameState() });
});

router.get('/get_casters', (req, res) => {
    return res.status(200).send(dataBus.getCasters());
});

router.post('/set_casters', upload.none(), (req, res) => {
    const { caster_1, caster_2, caster_3, show_lower_third, duration, auto_loop, interval } = req.body;
    try {
        let c1 = typeof caster_1 === 'string' ? JSON.parse(caster_1) : caster_1;
        let c2 = typeof caster_2 === 'string' ? JSON.parse(caster_2) : caster_2;
        let c3 = typeof caster_3 === 'string' ? JSON.parse(caster_3) : caster_3;
        let show = (show_lower_third === 'true' || show_lower_third === true);
        let loop = (auto_loop === 'true' || auto_loop === true);
        const dur = duration ? parseInt(duration) : 6000;
        const intv = interval ? parseInt(interval) : 30000;

        const updated = dataBus.updateCasters(c1, c2, c3, show, loop, dur, intv);
        emitEvent(req, 'castersUpdate', updated);

        if (show && dur > 0 && !loop) {
            setTimeout(() => {
                dataBus.updateCasters(null, null, null, false);
                emitEvent(req, 'castersUpdate', { ...dataBus.getCasters(), duration: 0 });
            }, dur);
        }

        return res.status(200).send({ status: true, casters: updated });
    } catch (e) {
        return res.status(400).send({ status: false, message: 'Invalid JSON' });
    }
});



router.post('/change_password', upload.none(), (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim() === '') {
        return res.status(400).send({ status: false, message: 'Password required' });
    }
    dataBus.updateAdminPassword(newPassword.trim());
    return res.status(200).send({ status: true });
});

router.post('/reset_match_state', upload.none(), (req, res) => {
    dataBus.config.gameState.round_number = 1;
    dataBus.config.gameState.team_1_score = 0;
    dataBus.config.gameState.team_2_score = 0;
    dataBus.config.gameState.spike_down = false;
    dataBus.config.gameState.switch_sides = false;
    dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);

    emitEvent(req, 'stateUpdate', dataBus.getGameState());
    emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
    return res.status(200).send({ status: true });
});

router.get('/get_auto_fetch_status', (req, res) => {
    const liveService = req.app.get('liveService');
    if (liveService) {
        return res.status(200).send(liveService.getStatus());
    }
    return res.status(200).send({
        autoFetchEnabled: false,
        statusText: 'Live service offline',
        clientDetected: false,
        gameRunning: false,
        inGame: false
    });
});

router.post('/set_auto_fetch_config', upload.none(), (req, res) => {
    const { enabled, mode, riotId, apiKey, lockTeams } = req.body;
    const liveService = req.app.get('liveService');
    if (liveService) {
        const isEnabled = (enabled === 'true' || enabled === true);
        const isLock = (typeof lockTeams !== 'undefined') ? (lockTeams === 'true' || lockTeams === true) : undefined;
        const updated = liveService.updateConfig(isEnabled, mode, riotId, apiKey, isLock);
        return res.status(200).send({ status: true, config: updated });
    }
    return res.status(500).send({ status: false, message: 'Live service not initialized' });
});

router.get('/api/operator/mode', (req, res) => {
    const liveService = req.app.get('liveService');
    const liveStatus = liveService ? liveService.getStatus() : null;
    const currentMode = dataBus.getOperatorMode ? dataBus.getOperatorMode() : 'manual';
    return res.status(200).json({
        status: true,
        mode: currentMode,
        isAutomatic: currentMode === 'automatic',
        liveServiceStatus: liveStatus
    });
});

router.post('/api/operator/mode', upload.none(), (req, res) => {
    const { mode } = req.body;
    const newMode = (mode === 'automatic' || mode === 'auto') ? 'automatic' : 'manual';
    if (dataBus.setOperatorMode) {
        dataBus.setOperatorMode(newMode);
    }
    const liveService = req.app.get('liveService');
    if (liveService) {
        liveService.autoFetchEnabled = (newMode === 'automatic');
    }
    emitEvent(req, 'operatorModeUpdate', {
        mode: newMode,
        isAutomatic: newMode === 'automatic'
    });
    return res.status(200).json({
        status: true,
        mode: newMode,
        isAutomatic: newMode === 'automatic',
        message: newMode === 'automatic' ? 'Switched to Automatic Mode (Live Telemetry)' : 'Switched to Manual Mode (Operator Control)'
    });
});

// =========================================
//       TOURNAMENT MODE API ENDPOINTS
// =========================================

router.get('/api/tournament/data', (req, res) => {
    const data = dataBus.syncLocalLogos ? dataBus.syncLocalLogos() : dataBus.getTournamentData();
    return res.status(200).json(data);
});

router.get('/api/tournament/sample_data', (req, res) => {
    try {
        const samplePath = path.join(__dirname, '../config/tournamentData.json');
        if (fs.existsSync(samplePath)) {
            const raw = fs.readFileSync(samplePath, 'utf8');
            const data = JSON.parse(raw);
            return res.status(200).json(data);
        }
    } catch (e) { }
    return res.status(200).json(dataBus.getTournamentData());
});

router.get('/api/tournament/sync_local_logos', (req, res) => {
    const data = dataBus.syncLocalLogos ? dataBus.syncLocalLogos() : dataBus.getTournamentData();
    emitEvent(req, 'tournamentUpdate', data);
    return res.status(200).json({ status: true, message: 'Local logos scanned & updated', tournamentData: data });
});

router.post('/api/tournament/save_config', upload.none(), (req, res) => {
    const { spreadsheetUrl, autoSync, syncInterval, tournamentName } = req.body;
    const current = dataBus.getTournamentData();
    if (typeof spreadsheetUrl !== 'undefined') current.spreadsheetUrl = spreadsheetUrl.trim();
    if (typeof autoSync !== 'undefined') current.autoSync = (autoSync === 'true' || autoSync === true);
    if (typeof syncInterval !== 'undefined') current.syncInterval = parseInt(syncInterval) || 60;
    if (typeof tournamentName !== 'undefined') current.tournamentName = tournamentName.trim();

    dataBus.saveTournamentData(current);
    emitEvent(req, 'tournamentUpdate', current);
    return res.status(200).json({ status: true, tournamentData: current });
});

router.post('/api/tournament/sync_sheet', upload.none(), async (req, res) => {
    const { spreadsheetUrl } = req.body;
    const current = dataBus.getTournamentData();
    const targetUrl = spreadsheetUrl ? spreadsheetUrl.trim() : current.spreadsheetUrl;

    if (!targetUrl) {
        return res.status(400).json({ status: false, message: 'Please provide a Google Spreadsheet URL.' });
    }

    try {
        const result = await dataBus.fetchAndParseGoogleSheet(targetUrl);
        emitEvent(req, 'tournamentUpdate', dataBus.getTournamentData());
        return res.status(200).json(result);
    } catch (err) {
        console.error('[Google Sheet Sync Error]:', err.message);
        return res.status(400).json({ status: false, message: 'Failed to sync Google Sheet: ' + err.message });
    }
});

router.post('/api/tournament/load_match', upload.none(), (req, res) => {
    const { matchId } = req.body;
    if (!matchId) {
        return res.status(400).json({ status: false, message: 'Missing match ID parameter' });
    }

    try {
        const result = dataBus.loadTournamentMatch(matchId);
        emitEvent(req, 'stateUpdate', result.gameState);
        emitEvent(req, 'configUpdate', result.gameConfig);
        emitEvent(req, 'playerUpdate', result.players);
        emitEvent(req, 'tournamentUpdate', dataBus.getTournamentData());
        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).json({ status: false, message: err.message });
    }
});

router.post('/api/tournament/set_active_team', upload.none(), (req, res) => {
    const { teamTag, slot } = req.body; // slot = 'team_1' or 'team_2'
    if (!teamTag || !slot) {
        return res.status(400).json({ status: false, message: 'Missing team tag or slot (team_1/team_2)' });
    }

    const tournament = dataBus.getTournamentData();
    const teamObj = tournament.teams.find(t =>
        (t.tag && t.tag.toUpperCase() === teamTag.toUpperCase()) ||
        (t.name && t.name.toUpperCase() === teamTag.toUpperCase())
    );

    if (slot === 'team_1') {
        dataBus.config.gameState.team_1.abbreviation = teamObj ? (teamObj.tag || teamObj.name) : teamTag.toUpperCase();
        if (teamObj && teamObj.logo) {
            dataBus.config.gameState.team_1.icon_link = dataBus.cleanLogoUrl ? dataBus.cleanLogoUrl(teamObj.logo) : teamObj.logo;
        }
        if (teamObj && teamObj.name) {
            dataBus.config.gameState.team_1.name = teamObj.name;
        }
    } else if (slot === 'team_2') {
        dataBus.config.gameState.team_2.abbreviation = teamObj ? (teamObj.tag || teamObj.name) : teamTag.toUpperCase();
        if (teamObj && teamObj.logo) {
            dataBus.config.gameState.team_2.icon_link = dataBus.cleanLogoUrl ? dataBus.cleanLogoUrl(teamObj.logo) : teamObj.logo;
        }
        if (teamObj && teamObj.name) {
            dataBus.config.gameState.team_2.name = teamObj.name;
        }
    }

    dataBus.syncPlayersFromTournamentTeams();
    dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);
    dataBus.saveStateToFile('players.json', dataBus.config.players);
    if (dataBus.config.mapPicks) {
        dataBus.config.mapPicks.teams = [
            dataBus.config.gameState.team_1.abbreviation,
            dataBus.config.gameState.team_2.abbreviation
        ];
        dataBus.saveStateToFile('mapPicks.json', dataBus.config.mapPicks);
    }

    const formattedStats = dataBus.getFormattedPlayerStats();
    emitEvent(req, 'stateUpdate', dataBus.getGameState());
    emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
    emitEvent(req, 'playerUpdate', formattedStats);
    emitEvent(req, 'playerStatsUpdate', formattedStats);

    return res.status(200).json({ status: true, message: `Set ${teamTag} to ${slot === 'team_1' ? 'Team 1 (Left)' : 'Team 2 (Right)'}`, players: formattedStats });
});

router.post('/api/sync_team_rosters', upload.none(), (req, res) => {
    try {
        dataBus.syncPlayersFromTournamentTeams();
        dataBus.saveStateToFile('players.json', dataBus.config.players);
        dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);
        const formatted = dataBus.getFormattedPlayerStats();
        emitEvent(req, 'playerUpdate', formatted);
        emitEvent(req, 'playerStatsUpdate', formatted);
        emitEvent(req, 'stateUpdate', dataBus.getGameState());
        emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
        return res.status(200).json({ status: true, message: 'Tournament team roster player names synchronized successfully!', players: formatted });
    } catch (err) {
        return res.status(400).json({ status: false, message: err.message });
    }
});

router.post('/api/tournament/save_team', upload.none(), (req, res) => {
    const { id, name, tag, logo, seed, players } = req.body;
    if (!name || !tag) {
        return res.status(400).json({ status: false, message: 'Team Name and Tag are required' });
    }

    let parsedPlayers = [];
    if (Array.isArray(players)) {
        parsedPlayers = players;
    } else if (typeof players === 'string') {
        try {
            parsedPlayers = JSON.parse(players);
        } catch (e) {
            parsedPlayers = players.split(',').map(p => p.trim()).filter(Boolean);
        }
    }

    const teamLogo = (logo && dataBus.cleanLogoUrl) ? dataBus.cleanLogoUrl(logo) : (logo || '').trim();

    const teamData = {
        id: id || `team_${Date.now()}`,
        name: name.trim(),
        tag: tag.trim().toUpperCase(),
        logo: teamLogo,
        seed: seed ? seed.trim() : '',
        players: parsedPlayers
    };

    const updatedTeams = dataBus.addOrUpdateTournamentTeam(teamData);
    emitEvent(req, 'tournamentUpdate', dataBus.getTournamentData());
    return res.status(200).json({ status: true, teams: updatedTeams });
});

router.post('/api/tournament/delete_team', upload.none(), (req, res) => {
    const { teamId } = req.body;
    if (!teamId) {
        return res.status(400).json({ status: false, message: 'Missing team ID' });
    }
    const updated = dataBus.deleteTournamentTeam(teamId);
    emitEvent(req, 'tournamentUpdate', dataBus.getTournamentData());
    return res.status(200).json({ status: true, teams: updated });
});

router.post('/api/tournament/save_match', upload.none(), (req, res) => {
    const { id, stage, team_1_tag, team_2_tag, format, scheduled_time, status, score } = req.body;
    if (!team_1_tag || !team_2_tag) {
        return res.status(400).json({ status: false, message: 'Team 1 and Team 2 are required for a match' });
    }

    const matchData = {
        id: id || `match_${Date.now()}`,
        stage: stage ? stage.trim() : 'TOURNAMENT MATCH',
        team_1_tag: team_1_tag.trim().toUpperCase(),
        team_2_tag: team_2_tag.trim().toUpperCase(),
        format: format ? format.trim().toUpperCase() : 'BO3',
        scheduled_time: scheduled_time ? scheduled_time.trim() : 'TBD',
        status: status ? status.trim().toUpperCase() : 'UPCOMING',
        score: score ? score.trim() : '0 - 0'
    };

    const updatedMatches = dataBus.addOrUpdateTournamentMatch(matchData);
    emitEvent(req, 'tournamentUpdate', dataBus.getTournamentData());
    return res.status(200).json({ status: true, matches: updatedMatches });
});

router.post('/api/tournament/delete_match', upload.none(), (req, res) => {
    const { matchId } = req.body;
    if (!matchId) {
        return res.status(400).json({ status: false, message: 'Missing match ID' });
    }
    const updated = dataBus.deleteTournamentMatch(matchId);
    emitEvent(req, 'tournamentUpdate', dataBus.getTournamentData());
    return res.status(200).json({ status: true, matches: updated });
});

// Image Proxy to stream Google Drive and external images bypassing browser CORS & cookies
router.get('/api/tournament/proxy_image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).send('Missing image url');
    }

    try {
        const { buffer, contentType } = await dataBus.fetchBinaryBuffer(imageUrl);
        res.set('Content-Type', contentType || 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
    } catch (err) {
        return res.status(404).send('Image fetch failed');
    }
});

// Upload Team Logo directly from PC/phone
router.post('/api/tournament/upload_team_logo', logoUpload.single('logoFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: false, message: 'No file uploaded' });
    }

    const { teamTag } = req.body;
    const cleanTag = (teamTag || '').trim().toUpperCase();
    const relativeLogoPath = `../visual_assets/teams/${req.file.filename}`;

    const tournament = dataBus.getTournamentData();
    const teamObj = tournament.teams.find(t =>
        (t.tag && t.tag.toUpperCase() === cleanTag) ||
        (t.name && t.name.toUpperCase() === cleanTag)
    );

    if (teamObj) {
        teamObj.logo = relativeLogoPath;
        dataBus.saveTournamentData(tournament);
    }

    // If active in game state, update live state as well
    if (dataBus.config.gameState.team_1.abbreviation === cleanTag) {
        dataBus.config.gameState.team_1.icon_link = relativeLogoPath;
        dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);
        emitEvent(req, 'stateUpdate', dataBus.getGameState());
    } else if (dataBus.config.gameState.team_2.abbreviation === cleanTag) {
        dataBus.config.gameState.team_2.icon_link = relativeLogoPath;
        dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);
        emitEvent(req, 'stateUpdate', dataBus.getGameState());
    }

    emitEvent(req, 'tournamentUpdate', dataBus.getTournamentData());
    return res.status(200).json({ status: true, logoUrl: relativeLogoPath, message: `Logo uploaded successfully for ${cleanTag}!` });
});

// Direct Spreadsheet CSV File Upload from PC
router.post('/api/tournament/upload_sheet_file', memUpload.single('sheetFile'), (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ status: false, message: 'Please select a CSV file to upload' });
    }

    try {
        const csvContent = req.file.buffer.toString('utf8');
        const rows = dataBus.parseCsvRows(csvContent);
        if (rows.length < 2) {
            return res.status(400).json({ status: false, message: 'File must contain at least 1 header row and 1 data row' });
        }

        const { teams: parsedTeams, matches: parsedMatches } = dataBus.parseRowsToTeamsAndMatches(rows);

        const currentData = dataBus.getTournamentData();
        if (parsedTeams.length > 0) currentData.teams = parsedTeams;
        if (parsedMatches.length > 0) currentData.matches = parsedMatches;
        currentData.lastSync = Date.now();
        dataBus.saveTournamentData(currentData);
        emitEvent(req, 'tournamentUpdate', currentData);

        return res.status(200).json({ status: true, message: `Successfully loaded ${parsedTeams.length} teams from uploaded file!`, teamsCount: parsedTeams.length, tournamentData: currentData });
    } catch (err) {
        return res.status(400).json({ status: false, message: 'Failed to parse file: ' + err.message });
    }
});



router.get('/bridge.bat', (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host');
    const serverUrl = `${proto}://${host}`;
    const batContent = `@echo off
title ZENX TOURNAMENT LIVE BRIDGE (STREAMER PC)
color 0b
echo =======================================================
echo    ZENX TOURNAMENT OVERLAY - IN-GAME AUTO-BRIDGE
echo =======================================================
echo.
echo Target Overlay Server: ${serverUrl}
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm '${serverUrl}/bridge.ps1' | iex"
pause
`;
    res.setHeader('Content-Type', 'application/x-bat');
    res.setHeader('Content-Disposition', 'attachment; filename="zenx_streamer_bridge.bat"');
    res.send(batContent);
});

router.get('/bridge.ps1', (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host');
    const serverUrl = `${proto}://${host}`;

    const templatePath = path.join(__dirname, '../public/bridge.ps1');
    let psScript = '';
    if (fs.existsSync(templatePath)) {
        psScript = fs.readFileSync(templatePath, 'utf8');
        psScript = psScript.replace(/\$OverlayServer\s*=\s*["'][^"']*["']/, `$OverlayServer = "${serverUrl}"`);
    } else {
        psScript = `# Auto-generated Bridge\n$OverlayServer = "${serverUrl}"\n`;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(psScript);
});

router.get('/print_state', (req, res) => {
    return res.status(200).send(dataBus.config);
});

module.exports = router;


