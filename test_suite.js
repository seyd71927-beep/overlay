const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 25566; // Separate port for testing
process.env.PORT = PORT;

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.set('io', io);
app.use(express.static(path.join(__dirname, './overlays')));
app.use(express.static(path.join(__dirname, './public')));
app.use('/logo', express.static(path.join(__dirname, './logo')));
app.use('/logos', express.static(path.join(__dirname, './logo')));
app.use('/visual_assets/teams', express.static(path.join(__dirname, './overlays/visual_assets/teams')));
app.use('/visual_assets/teams', express.static(path.join(__dirname, './logo')));

app.set('trust proxy', 1);
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'test-secret-key-1234567890',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: 'auto', maxAge: 24 * 60 * 60000 }
}));

const fileLoader = require('./fileLoader');
const ValorantLiveService = require('./valorantLiveService');

const dataBus = new fileLoader();
dataBus.init('./config');
app.set('dataBus', dataBus);

const liveService = new ValorantLiveService(dataBus, io);
app.set('liveService', liveService);

const routes = require('./routes/routes');
if (routes.setDataBus) routes.setDataBus(dataBus);
app.use('/', routes);

// Test Helper Functions
let sessionCookie = '';

function request(method, path, body = null, isForm = false) {
    return new Promise((resolve, reject) => {
        let headers = {};
        let data = '';

        if (sessionCookie) {
            headers['Cookie'] = sessionCookie;
        }

        if (body) {
            if (isForm) {
                data = new URLSearchParams(body).toString();
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                headers['Content-Length'] = Buffer.byteLength(data);
            } else {
                data = JSON.stringify(body);
                headers['Content-Type'] = 'application/json';
                headers['Content-Length'] = Buffer.byteLength(data);
            }
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: path,
            method: method,
            headers: headers
        }, (res) => {
            if (res.headers['set-cookie']) {
                sessionCookie = res.headers['set-cookie'][0].split(';')[0];
            }

            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                let parsed = resBody;
                try {
                    parsed = JSON.parse(resBody);
                } catch (e) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: resBody });
            });
        });

        req.on('error', err => reject(err));
        if (data) req.write(data);
        req.end();
    });
}

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

function assert(description, condition, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`\x1b[32m  ✓ [PASS]\x1b[0m ${description}`);
    } else {
        failedTests.push({ description, details });
        console.error(`\x1b[31m  ✗ [FAIL]\x1b[0m ${description} - ${details}`);
    }
}

async function runAllTests() {
    console.log('\n======================================================');
    console.log('       STARTING COMPREHENSIVE OVERLAY TEST SUITE       ');
    console.log('======================================================\n');

    await new Promise(r => server.listen(PORT, '127.0.0.1', r));
    console.log(`[Test Server] Running on http://127.0.0.1:${PORT}\n`);

    try {
        // --- 1. HEALTH & CORE STATUS ---
        console.log('\x1b[36m=== 1. Core Health & Public Endpoints ===\x1b[0m');
        const health = await request('GET', '/health');
        assert('GET /health returns 200 and status: ok', health.status === 200 && health.body.status === 'ok');

        const mapPicks = await request('GET', '/get_map_picks');
        assert('GET /get_map_picks returns 200 with picks array', mapPicks.status === 200 && Array.isArray(mapPicks.body.picks));

        const playerStats = await request('GET', '/get_player_stats');
        assert('GET /get_player_stats returns 200 with team_1 & team_2', playerStats.status === 200 && playerStats.body.status === true && playerStats.body.team_1);

        const gameConfig = await request('GET', '/get_game_configuration');
        assert('GET /get_game_configuration returns 200 with team info', gameConfig.status === 200 && gameConfig.body.team_1 && gameConfig.body.team_2);

        const gameState = await request('GET', '/get_game_state');
        assert('GET /get_game_state returns 200 with round_number', gameState.status === 200 && typeof gameState.body.round_number === 'number');

        const timerInfo = await request('GET', '/get_timer_info');
        assert('GET /get_timer_info returns timer state', timerInfo.status === 200 && typeof timerInfo.body.isOn === 'boolean');

        const casters = await request('GET', '/get_casters');
        assert('GET /get_casters returns 200 with casters data', casters.status === 200 && casters.body.caster_1 && casters.body.caster_2);

        const autoFetch = await request('GET', '/get_auto_fetch_status');
        assert('GET /get_auto_fetch_status returns live service status', autoFetch.status === 200 && typeof autoFetch.body.autoFetchEnabled === 'boolean');

        // --- 2. AUTHENTICATION & ADMIN ACCESS ---
        console.log('\n\x1b[36m=== 2. Authentication & Admin Security ===\x1b[0m');
        const unauthAdmin = await request('GET', '/admin');
        assert('Unauthenticated /admin redirects/blocks access', unauthAdmin.status === 401 || unauthAdmin.status === 302 || unauthAdmin.raw.includes('auth'));

        const authFail = await request('POST', '/authenticate', { pw: 'wrong_password_xyz' }, true);
        assert('POST /authenticate with bad password returns 401', authFail.status === 401);

        const authPass = await request('POST', '/authenticate', { pw: 'zenx' }, true);
        assert('POST /authenticate with correct password returns 200', authPass.status === 200);

        const authAdmin = await request('GET', '/admin?page=prestream');
        assert('Authenticated GET /admin?page=prestream returns 200 with Pre-Stream HTML', authAdmin.status === 200 && authAdmin.raw.includes('Pre-Stream'));

        const authTourney = await request('GET', '/admin?page=tournament');
        assert('Authenticated GET /admin?page=tournament returns 200 with Tournament HTML', authTourney.status === 200 && authTourney.raw.includes('Tournament Mode'));

        const authLive = await request('GET', '/admin?page=stream');
        assert('Authenticated GET /admin?page=stream returns 200 with Live Operator HTML', authLive.status === 200 && authLive.raw.includes('Live Match Operator'));

        const authSettings = await request('GET', '/admin?page=settings');
        assert('Authenticated GET /admin?page=settings returns 200 with Settings HTML', authSettings.status === 200 && authSettings.raw.includes('Settings'));

        // --- 3. LIVE MATCH CONTROLS & STATE UPDATES ---
        console.log('\n\x1b[36m=== 3. Match State & Scoreboard Logic ===\x1b[0m');
        const changeState = await request('POST', '/change_game_state', {
            round_number: 5,
            team_1_score: 3,
            team_2_score: 1,
            spike: 'down',
            switch_sides: true,
            tournament_stage: 'VCT GRAND FINALS 2026'
        }, true);
        assert('POST /change_game_state updates round and score correctly', 
            changeState.status === 200 && 
            changeState.body.state.round_number === 5 && 
            changeState.body.state.team_1_score === 3 &&
            changeState.body.state.spike_down === true &&
            changeState.body.state.tournament_stage === 'VCT GRAND FINALS 2026'
        );

        const triggerWin = await request('POST', '/trigger_win_banner', { winningTeam: 'team_1' }, true);
        assert('POST /trigger_win_banner increments score and round', 
            triggerWin.status === 200 && 
            triggerWin.body.state.team_1_score === 4 && 
            triggerWin.body.state.round_number === 6 && 
            triggerWin.body.state.spike_down === false
        );

        const resetMatch = await request('POST', '/reset_match_state', {}, true);
        assert('POST /reset_match_state resets to round 1 and 0-0', 
            resetMatch.status === 200
        );
        const resetCheck = await request('GET', '/get_game_state');
        assert('GET /get_game_state verifies reset state is 0-0', resetCheck.body.team_1_score === 0 && resetCheck.body.team_2_score === 0 && resetCheck.body.round_number === 1);

        // --- 4. TIMER & CASTERS CONTROLS ---
        console.log('\n\x1b[36m=== 4. Timer & Talent Desk Controls ===\x1b[0m');
        const setTimer = await request('POST', '/set_timer', { timeMiliseconds: 300000, description: 'TEST BREAK' }, true);
        assert('POST /set_timer starts timer', setTimer.status === 200 && setTimer.body.status === true);

        const getTimerCheck = await request('GET', '/get_timer_info');
        assert('GET /get_timer_info shows timer is running with description', getTimerCheck.body.isOn === true && getTimerCheck.body.description === 'TEST BREAK');

        const stopTimer = await request('POST', '/stop_timer', {}, true);
        assert('POST /stop_timer stops timer', stopTimer.status === 200 && stopTimer.body.status === true);

        const setCasters = await request('POST', '/set_casters', {
            caster_1: JSON.stringify({ name: 'Shubham', handle: '@shubham_val' }),
            caster_2: JSON.stringify({ name: 'Aryan', handle: '@aryan_casts' }),
            show_lower_third: true,
            duration: 6000,
            auto_loop: false,
            interval: 30000
        }, true);
        assert('POST /set_casters updates talent info', setCasters.status === 200 && setCasters.body.casters.caster_1.name === 'Shubham');

        // --- 5. MAP PICKS, SERIES FORMAT & MAPBAN.GG ---
        console.log('\n\x1b[36m=== 5. Map Picks & Series Format Logic ===\x1b[0m');
        const setBO1 = await request('POST', '/set_series_format', { format: 'bo1' }, true);
        assert('POST /set_series_format sets BO1 with 7 pick sequence', setBO1.status === 200 && setBO1.body.mapPicks.series_type === 'bo1' && setBO1.body.mapPicks.picks.length === 7);

        const setBO5 = await request('POST', '/set_series_format', { format: 'bo5' }, true);
        assert('POST /set_series_format sets BO5 format', setBO5.status === 200 && setBO5.body.mapPicks.series_type === 'bo5');

        const setBO3 = await request('POST', '/set_series_format', { format: 'bo3' }, true);
        assert('POST /set_series_format sets default BO3 format', setBO3.status === 200 && setBO3.body.mapPicks.series_type === 'bo3');

        const updateMapPick = await request('POST', '/set_map_picks', { index: 0, map: 'bind', action: 'ban' }, true);
        assert('POST /set_map_picks updates individual map slot', updateMapPick.status === 200);

        const syncMapbanJson = await request('POST', '/sync_mapban', {
            jsonData: JSON.stringify({
                bo: 3,
                teams: ['FNC', 'SEN'],
                bans: [
                    ['haven', 'ban'],
                    ['ascent', 'ban'],
                    ['lotus', 'attack'],
                    ['breeze', 'defense'],
                    ['split', 'ban'],
                    ['bind', 'ban'],
                    ['sunset', 'attack']
                ]
            })
        }, true);
        assert('POST /sync_mapban imports MapBan JSON payload', syncMapbanJson.status === 200 && syncMapbanJson.body.status === true);

        // --- 6. DYNAMIC ROSTER SCALING (1v1, 2v2, 5v5) & PLAYER STATS ---
        console.log('\n\x1b[36m=== 6. Dynamic Roster Scaling & In-Game Player Stats ===\x1b[0m');
        const setRoster1v1 = await request('POST', '/api/set_team_roster_size', { team_1_count: 1, team_2_count: 1, roster_mode: 'manual' }, true);
        assert('POST /api/set_team_roster_size sets 1v1 custom match', setRoster1v1.status === 200 && setRoster1v1.body.rosterConfig.team_1_count === 1);

        const pStats1v1 = await request('GET', '/get_player_stats');
        assert('GET /get_player_stats returns 1 player per team for 1v1', pStats1v1.body.team_1_list.length === 1 && pStats1v1.body.team_2_list.length === 1);

        const setRoster5v5 = await request('POST', '/api/set_team_roster_size', { team_1_count: 5, team_2_count: 5, roster_mode: 'manual' }, true);
        assert('POST /api/set_team_roster_size restores standard 5v5', setRoster5v5.status === 200 && setRoster5v5.body.rosterConfig.team_1_count === 5);

        const updatePlayerDirect = await request('POST', '/update_player_direct', {
            playerIndex: 0,
            playerData: JSON.stringify({
                name: 'MAD BASHA',
                agent: 'jett',
                health: 100,
                shield: 50,
                weapon: 'operator',
                ult_points: 7,
                ult_max: 7,
                credits: 4900,
                has_spike: true,
                alive: true
            })
        }, true);
        assert('POST /update_player_direct updates player attributes', updatePlayerDirect.status === 200 && updatePlayerDirect.body.status === true);

        const playerDirectCheck = await request('GET', '/get_player_stats');
        assert('GET /get_player_stats reflects updated player stats', 
            playerDirectCheck.body.team_1_list[0].username === 'MAD BASHA' && 
            playerDirectCheck.body.team_1_list[0].agent === 'jett' &&
            playerDirectCheck.body.team_1_list[0].weapon === 'operator' &&
            playerDirectCheck.body.team_1_list[0].has_spike === true
        );

        // --- 7. TOURNAMENT HUB, GOOGLE SHEETS & MATCH LOADER ---
        console.log('\n\x1b[36m=== 7. Tournament Hub & Google Sheets Engine ===\x1b[0m');
        const tourneyData = await request('GET', '/api/tournament/data');
        assert('GET /api/tournament/data returns tournament object with teams & matches', tourneyData.status === 200 && Array.isArray(tourneyData.body.teams) && Array.isArray(tourneyData.body.matches));

        const sampleData = await request('GET', '/api/tournament/sample_data');
        assert('GET /api/tournament/sample_data successfully returns sample preset (Fixed Bug)', sampleData.status === 200 && Array.isArray(sampleData.body.teams));

        const saveTeam = await request('POST', '/api/tournament/save_team', {
            name: 'TEST ESPORTS',
            tag: 'TEST',
            logo: 'https://example.com/logo.png',
            seed: '#1 Seed',
            players: JSON.stringify(['Player1#111', 'Player2#222', 'Player3#333'])
        }, true);
        assert('POST /api/tournament/save_team adds/updates team', saveTeam.status === 200 && saveTeam.body.teams.some(t => t.tag === 'TEST'));

        const saveMatch = await request('POST', '/api/tournament/save_match', {
            stage: 'FINALS',
            team_1_tag: 'TEST',
            team_2_tag: 'S1N',
            format: 'BO3',
            scheduled_time: '20:00 IST',
            status: 'UPCOMING',
            score: '0 - 0'
        }, true);
        assert('POST /api/tournament/save_match creates scheduled match', saveMatch.status === 200 && saveMatch.body.matches.some(m => m.team_1_tag === 'TEST'));

        const matchToLoad = saveMatch.body.matches.find(m => m.team_1_tag === 'TEST');
        const loadMatch = await request('POST', '/api/tournament/load_match', { matchId: matchToLoad.id }, true);
        assert('POST /api/tournament/load_match loads match into active overlay', 
            loadMatch.status === 200 && 
            loadMatch.body.gameState.team_1.abbreviation === 'TEST' && 
            loadMatch.body.gameState.team_2.abbreviation === 'S1N'
        );

        const setActiveTeam = await request('POST', '/api/tournament/set_active_team', { teamTag: 'ACCE', slot: 'team_1' }, true);
        assert('POST /api/tournament/set_active_team switches active team 1 slot', setActiveTeam.status === 200 && setActiveTeam.body.status === true);

        const deleteTeam = await request('POST', '/api/tournament/delete_team', { teamId: 'TEST' }, true);
        assert('POST /api/tournament/delete_team deletes team cleanly', deleteTeam.status === 200);

        const deleteMatch = await request('POST', '/api/tournament/delete_match', { matchId: matchToLoad.id }, true);
        assert('POST /api/tournament/delete_match deletes match cleanly', deleteMatch.status === 200);

        // --- 8. IN-GAME BRIDGE TELEMETRY SYNC ---
        console.log('\n\x1b[36m=== 8. In-Game Remote Bridge Telemetry Sync ===\x1b[0m');
        const bridgeSync = await request('POST', '/api/bridge/sync_match', {
            phase: 'INGAME',
            inGame: true,
            map: 'ascent',
            round_number: 7,
            team_1_score: 4,
            team_2_score: 2,
            spike: 'down',
            team_1: { abbreviation: 'FNC', name: 'FNATIC' },
            team_2: { abbreviation: 'SEN', name: 'SENTINELS' },
            team_1_players: [
                { username: '[FNC] Boaster', agent: 'omen', health: 100, shield: 50, weapon: 'phantom', ult_points_gained: 6, credits: 3900, is_dead: false },
                { username: '[FNC] Derke', agent: 'jett', health: 100, shield: 50, weapon: 'operator', ult_points_gained: 7, credits: 4500, is_dead: false },
                { username: '[FNC] Alfajer', agent: 'killjoy', health: 80, shield: 25, weapon: 'vandal', ult_points_gained: 4, credits: 2800, is_dead: false },
                { username: '[FNC] Chronicle', agent: 'breach', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 5, credits: 3100, is_dead: false },
                { username: '[FNC] Leo', agent: 'sova', health: 0, shield: 0, weapon: 'vandal', ult_points_gained: 2, credits: 1900, is_dead: true }
            ],
            team_2_players: [
                { username: '[SEN] TenZ', agent: 'omen', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 7, credits: 5000, is_dead: false },
                { username: '[SEN] zekken', agent: 'raze', health: 45, shield: 0, weapon: 'phantom', ult_points_gained: 5, credits: 3400, is_dead: false },
                { username: '[SEN] Sacy', agent: 'fade', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 3, credits: 2900, is_dead: false },
                { username: '[SEN] johnqt', agent: 'cypher', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 6, credits: 4100, is_dead: false },
                { username: '[SEN] Zellsis', agent: 'kayo', health: 0, shield: 0, weapon: 'vandal', ult_points_gained: 1, credits: 2100, is_dead: true }
            ]
        });
        assert('POST /api/bridge/sync_match ingests live match telemetry', bridgeSync.status === 200 && bridgeSync.body.status === true);

        const bridgeStatus = await request('GET', '/api/bridge/status');
        assert('GET /api/bridge/status reports bridge connected & online', bridgeStatus.status === 200 && bridgeStatus.body.online === true && bridgeStatus.body.map === 'ascent');

        const bridgeStateCheck = await request('GET', '/get_game_state');
        assert('Live game state reflects synced telemetry (Ascent, Round 7, 4-2)', 
            bridgeStateCheck.body.round_number === 7 && 
            bridgeStateCheck.body.team_1_score === 4 && 
            bridgeStateCheck.body.team_2_score === 2
        );

        const bridgeRosterCheck = await request('GET', '/get_player_stats');
        assert('Player roster HUD reflects live in-game player names & health', 
            bridgeRosterCheck.body.team_1_list[0].username === '[FNC] Boaster' && 
            bridgeRosterCheck.body.team_2_list[0].username === '[SEN] TenZ' && 
            bridgeRosterCheck.body.team_1_list[4].is_dead === true
        );

        // --- 9. STATIC OVERLAY PAGES & ASSET RESOLUTION ---
        console.log('\n\x1b[36m=== 9. Static Overlay Pages & Asset Verification ===\x1b[0m');
        const overlayPortal = await request('GET', '/');
        assert('GET / returns 200 with Overlay Portal HTML', overlayPortal.status === 200 && overlayPortal.raw.includes('ZENX VALORANT TOURNAMENT OVERLAYS'));

        const gameScorePage = await request('GET', '/game_score/');
        assert('GET /game_score/ returns 200 with Scoreboard Overlay HTML', gameScorePage.status === 200 && gameScorePage.raw.includes('tournament-stage'));

        const playerStatsPage = await request('GET', '/player_stats/');
        assert('GET /player_stats/ returns 200 with Player Stats HUD HTML', playerStatsPage.status === 200 && playerStatsPage.raw.includes('team-container'));

        const mapPicksPage = await request('GET', '/map_picks/');
        assert('GET /map_picks/ returns 200 with Map Veto Overlay HTML', mapPicksPage.status === 200 && mapPicksPage.raw.includes('map-pick-adding-div'));

        const timerPage = await request('GET', '/timer/');
        assert('GET /timer/ returns 200 with Intermission Timer HTML', timerPage.status === 200 && timerPage.raw.includes('timer-container'));

        const castersPage = await request('GET', '/caster_desk/');
        assert('GET /caster_desk/ returns 200 with Caster Desk Lower Third HTML', castersPage.status === 200 && castersPage.raw.includes('caster-container'));

        const upcomingMapsPage = await request('GET', '/upcomming_maps/');
        assert('GET /upcomming_maps/ returns 200 with Upcoming Maps Schedule HTML', upcomingMapsPage.status === 200 && upcomingMapsPage.raw.includes('upcomming-maps'));

        // Script files
        const bridgeBat = await request('GET', '/bridge.bat');
        assert('GET /bridge.bat generates downloadable streamer bat script', bridgeBat.status === 200 && bridgeBat.raw.includes('powershell'));

        const bridgePs1 = await request('GET', '/bridge.ps1');
        assert('GET /bridge.ps1 generates executable PowerShell bridge script', bridgePs1.status === 200 && bridgePs1.raw.includes('$OverlayServer'));

        // CSS and JS assets
        const adminCss = await request('GET', '/resources/css/admin.css');
        assert('GET /resources/css/admin.css is accessible', adminCss.status === 200);

        const liveStreamJs = await request('GET', '/resources/js/live_stream.js');
        assert('GET /resources/js/live_stream.js is accessible', liveStreamJs.status === 200);

        const jettIcon = await request('GET', '/visual_assets/agent_icons/jett/jett_icon.webp');
        assert('GET agent icon (Jett) is accessible', jettIcon.status === 200);

        const vandalIcon = await request('GET', '/visual_assets/game_icons/vandal.webp');
        assert('GET weapon icon (Vandal) is accessible', vandalIcon.status === 200);

        const ascentMap = await request('GET', '/visual_assets/map_images/ascent.webp');
        assert('GET map image (Ascent) is accessible', ascentMap.status === 200);

    } catch (err) {
        console.error('\x1b[31m[Test Suite Error]\x1b[0m', err);
    } finally {
        server.close();
        console.log('\n======================================================');
        console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests.length}`);
        if (failedTests.length === 0) {
            console.log('\x1b[32m🎉 ALL TESTS PASSED! 100% WORKING CONFIRMED!\x1b[0m');
        } else {
            console.log('\x1b[31mFAILED TESTS:\x1b[0m', failedTests);
        }
        console.log('======================================================\n');
        process.exit(failedTests.length === 0 ? 0 : 1);
    }
}

runAllTests();
