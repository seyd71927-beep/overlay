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

/*
-----------------------------------------
           PUBLIC OVERLAY REST ENDPOINTS
-----------------------------------------
*/

router.get('/get_map_picks', (req, res) => {
    return res.status(200).send(dataBus.config.mapPicks);
});

router.get('/get_player_stats', (req, res) => {
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

router.get('/print_state', (req, res) => {
    return res.status(200).send(dataBus.config);
});

module.exports = router;


