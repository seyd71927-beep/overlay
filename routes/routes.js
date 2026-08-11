const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const multer = require('multer');
const upload = multer();
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
    return res.status(200).send(dataBus.config.mapPicks);
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
        bridgeStatus.connected = true;
        bridgeStatus.lastSync = now;
        bridgeStatus.phase = payload.phase || (payload.inGame ? 'INGAME' : 'MENUS');
        bridgeStatus.inGame = (bridgeStatus.phase === 'INGAME');
        bridgeStatus.map = payload.map || bridgeStatus.map;
        bridgeStatus.round = payload.round_number || bridgeStatus.round;
        bridgeStatus.team_1_score = typeof payload.team_1_score !== 'undefined' ? payload.team_1_score : bridgeStatus.team_1_score;
        bridgeStatus.team_2_score = typeof payload.team_2_score !== 'undefined' ? payload.team_2_score : bridgeStatus.team_2_score;

        // 1. Update Game State
        if (typeof payload.round_number !== 'undefined') dataBus.config.gameState.round_number = parseInt(payload.round_number);
        if (typeof payload.team_1_score !== 'undefined') dataBus.config.gameState.team_1_score = parseInt(payload.team_1_score);
        if (typeof payload.team_2_score !== 'undefined') dataBus.config.gameState.team_2_score = parseInt(payload.team_2_score);
        if (typeof payload.spike !== 'undefined') dataBus.config.gameState.spike_down = (payload.spike === 'down' || payload.spike === true);
        if (typeof payload.switch_sides !== 'undefined') dataBus.config.gameState.switch_sides = (payload.switch_sides === true || payload.switch_sides === 'true');
        
        if (payload.map && dataBus.config.gameState.game_flow && dataBus.config.gameState.game_flow.map_1) {
            dataBus.config.gameState.game_flow.map_1.map = payload.map.toLowerCase();
        }

        // 2. Update Dynamic Team Rosters if provided
        const t1Players = Array.isArray(payload.team_1_players) ? payload.team_1_players : null;
        const t2Players = Array.isArray(payload.team_2_players) ? payload.team_2_players : null;

        if (t1Players && t2Players) {
            bridgeStatus.playerCount = t1Players.length + t2Players.length;
            dataBus.updateDynamicRoster(t1Players, t2Players);
        }

        // 3. Update Team Info if provided and not locked
        const liveService = req.app.get('liveService');
        const lockManual = liveService ? liveService.lockManualTeamInfo : false;

        if (!lockManual) {
            if (payload.team_1 && (payload.team_1.abbreviation || payload.team_1.name)) {
                dataBus.config.gameState.team_1.abbreviation = payload.team_1.abbreviation || payload.team_1.name;
                if (payload.team_1.icon_link) dataBus.config.gameState.team_1.icon_link = payload.team_1.icon_link;
            }
            if (payload.team_2 && (payload.team_2.abbreviation || payload.team_2.name)) {
                dataBus.config.gameState.team_2.abbreviation = payload.team_2.abbreviation || payload.team_2.name;
                if (payload.team_2.icon_link) dataBus.config.gameState.team_2.icon_link = payload.team_2.icon_link;
            }
        }

        dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);

        // Broadcast real-time updates to all connected browser overlays & Qatar panel
        emitEvent(req, 'stateUpdate', dataBus.getGameState());
        emitEvent(req, 'playerUpdate', dataBus.getFormattedPlayerStats());
        emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
        emitEvent(req, 'bridgeStatusUpdate', bridgeStatus);

        return res.status(200).json({ status: true, message: 'Live match sync successful', bridgeStatus });
    } catch (err) {
        console.error('[Bridge Sync Error]:', err.message);
        return res.status(400).json({ status: false, message: 'Invalid payload: ' + err.message });
    }
});

router.get('/api/bridge/status', (req, res) => {
    // If no sync received in last 12 seconds, flag disconnected
    if (bridgeStatus.lastSync && (Date.now() - bridgeStatus.lastSync > 12000)) {
        bridgeStatus.connected = false;
    }
    return res.status(200).json(bridgeStatus);
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
    return res.status(200).send(dataBus.getGameConfiguration());
});

router.get('/get_game_state', (req, res) => {
    return res.status(200).send(dataBus.getGameState());
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
        emitEvent(req, 'playerUpdate', dataBus.config.players);
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
        emitEvent(req, 'playerUpdate', dataBus.config.players);
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
        emitEvent(req, 'playerUpdate', dataBus.config.players);
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
                return res.status(200).sendFile(path.join(__dirname, '../panel/admin_tournament.html'));
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

        emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
        return res.status(200).send({ status: true });
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

router.post('/sync_mapban', upload.none(), async (req, res) => {
    const { urlOrId, jsonData } = req.body;

    if (jsonData) {
        try {
            const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            const updated = dataBus.applyMapBanData(parsed);
            emitEvent(req, 'mapPicksUpdate', updated);
            emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
            return res.status(200).send({ status: true, message: 'Imported MapBan.gg data successfully', mapPicks: updated });
        } catch (e) {
            return res.status(400).send({ status: false, message: 'Invalid JSON data' });
        }
    }

    if (!urlOrId || typeof urlOrId !== 'string' || urlOrId.trim() === '') {
        return res.status(400).send({ status: false, message: 'Please provide a MapBan.gg URL or Room ID' });
    }

    let input = urlOrId.trim();
    let match = input.match(/([a-zA-Z0-9]{10,32})/);
    let viewId = match ? match[1] : input;

    const tryUrls = [
        `https://api.mapban.gg/v1/ban/log/${viewId}`,
        `https://api.mapban.gg/v1/ban/view/${viewId}`
    ];

    const https = require('https');
    let fetchedData = null;

    for (const targetUrl of tryUrls) {
        try {
            const result = await new Promise((resolve) => {
                const reqHttps = https.get(targetUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' },
                    timeout: 4000
                }, (response) => {
                    let body = '';
                    response.on('data', chunk => body += chunk);
                    response.on('end', () => {
                        try {
                            const parsed = JSON.parse(body);
                            resolve(parsed);
                        } catch (e) {
                            resolve(null);
                        }
                    });
                });
                reqHttps.on('error', () => resolve(null));
                reqHttps.on('timeout', () => { reqHttps.destroy(); resolve(null); });
            });

            if (result && (result.log || result.lobby || result.picks || result.teamNames)) {
                fetchedData = result;
                break;
            }
        } catch (e) {}
    }

    if (fetchedData) {
        const updated = dataBus.applyMapBanData(fetchedData);
        emitEvent(req, 'mapPicksUpdate', updated);
        emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
        return res.status(200).send({ status: true, message: `Synced from MapBan.gg (${viewId})!`, mapPicks: updated });
    } else {
        return res.status(200).send({ 
            status: true, 
            warning: true, 
            viewId: viewId,
            message: `MapBan.gg linked: ID ${viewId}. You can also use Browser Source URL https://www.mapban.gg/ban/view/${viewId} in OBS!` 
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
        emitEvent(req, 'playerUpdate', dataBus.config.players);
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
    const { caster_1, caster_2, show_lower_third, duration, auto_loop, interval } = req.body;
    try {
        let c1 = typeof caster_1 === 'string' ? JSON.parse(caster_1) : caster_1;
        let c2 = typeof caster_2 === 'string' ? JSON.parse(caster_2) : caster_2;
        let show = (show_lower_third === 'true' || show_lower_third === true);
        let loop = (auto_loop === 'true' || auto_loop === true);
        const dur = duration ? parseInt(duration) : 6000;
        const intv = interval ? parseInt(interval) : 30000;

        const updated = dataBus.updateCasters(c1, c2, show, loop, dur, intv);
        emitEvent(req, 'castersUpdate', updated);

        if (show && dur > 0 && !loop) {
            setTimeout(() => {
                dataBus.updateCasters(null, null, false);
                emitEvent(req, 'castersUpdate', { ...dataBus.getCasters(), duration: 0 });
            }, dur);
        }

        return res.status(200).send({ status: true, casters: updated });
    } catch (e) {
        return res.status(400).send({ status: false, message: 'Invalid JSON' });
    }
});

router.get('/regenerate_user_tokens', (req, res) => {
    const updated = dataBus.regeneratePlayerTokens();
    emitEvent(req, 'playerUpdate', updated);
    return res.status(200).send({ status: true, players: updated });
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

// =========================================
//       TOURNAMENT MODE API ENDPOINTS
// =========================================

router.get('/api/tournament/data', (req, res) => {
    return res.status(200).json(dataBus.getTournamentData());
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

        if (teamObj && Array.isArray(teamObj.players)) {
            for (let i = 0; i < Math.min(5, teamObj.players.length); i++) {
                const key = `player_${i}`;
                if (dataBus.config.players[key] && dataBus.config.players[key].data) {
                    dataBus.config.players[key].data.name = teamObj.players[i];
                }
            }
        }
    } else if (slot === 'team_2') {
        dataBus.config.gameState.team_2.abbreviation = teamObj ? (teamObj.tag || teamObj.name) : teamTag.toUpperCase();
        if (teamObj && teamObj.logo) {
            dataBus.config.gameState.team_2.icon_link = dataBus.cleanLogoUrl ? dataBus.cleanLogoUrl(teamObj.logo) : teamObj.logo;
        }

        if (teamObj && Array.isArray(teamObj.players)) {
            for (let i = 0; i < Math.min(5, teamObj.players.length); i++) {
                const key = `player_${i + 5}`;
                if (dataBus.config.players[key] && dataBus.config.players[key].data) {
                    dataBus.config.players[key].data.name = teamObj.players[i];
                }
            }
        }
    }

    dataBus.saveStateToFile('gameState.json', dataBus.config.gameState);
    dataBus.saveStateToFile('players.json', dataBus.config.players);
    if (dataBus.config.mapPicks) {
        dataBus.config.mapPicks.teams = [
            dataBus.config.gameState.team_1.abbreviation,
            dataBus.config.gameState.team_2.abbreviation
        ];
        dataBus.saveStateToFile('mapPicks.json', dataBus.config.mapPicks);
    }

    emitEvent(req, 'stateUpdate', dataBus.getGameState());
    emitEvent(req, 'configUpdate', dataBus.getGameConfiguration());
    emitEvent(req, 'playerUpdate', dataBus.config.players);

    return res.status(200).json({ status: true, message: `Set ${teamTag} to ${slot === 'team_1' ? 'Team 1 (Left)' : 'Team 2 (Right)'}` });
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

router.get('/print_state', (req, res) => {
    return res.status(200).send(dataBus.config);
});

module.exports = router;


