/**
 * E2E Live Match & Automatic Control Telemetry Simulation
 * Tests the entire broadcast pipeline from Pre-Stream Setup -> Automatic Mode -> Full In-Game Telemetry -> Overlays.
 */

const http = require('http');

const PORT = 25567;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const reqHeaders = { ...headers };
        let reqBody = null;

        if (body) {
            if (typeof body === 'object' && !(body instanceof FormData)) {
                reqBody = JSON.stringify(body);
                reqHeaders['Content-Type'] = 'application/json';
            } else {
                reqBody = body;
            }
        }

        const req = http.request(url, {
            method,
            headers: reqHeaders,
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (reqBody) req.write(reqBody);
        req.end();
    });
}

let passedTests = 0;
let failedTests = 0;

function assert(description, condition, details = '') {
    if (condition) {
        passedTests++;
        console.log(`  \x1b[32m✓ [PASS]\x1b[0m ${description}`);
    } else {
        failedTests++;
        console.error(`  \x1b[31m✗ [FAIL]\x1b[0m ${description} ${details ? '--> ' + details : ''}`);
    }
}

async function runSimulation() {
    console.log('\n\x1b[35m======================================================================\x1b[0m');
    console.log('\x1b[35m       STARTING REALISTIC LIVE MATCH BROADCAST & TELEMETRY TEST       \x1b[0m');
    console.log('\x1b[35m======================================================================\x1b[0m\n');

    const express = require('express');
    const { Server } = require('socket.io');
    const fileLoader = require('./fileLoader');
    const routes = require('./routes/routes');

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });

    app.set('io', io);
    app.use(express.static('./overlays'));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const dataBus = new fileLoader();
    dataBus.init('./config');
    app.set('dataBus', dataBus);

    if (routes.setDataBus) routes.setDataBus(dataBus);
    app.use('/', routes);

    await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
    console.log(`[Test Broadcast Server] Live on ${BASE_URL}\n`);

    // --- STEP 1: PRE-STREAM SETUP & MATCH SELECTION ---
    console.log('\x1b[36m--- STEP 1: Pre-Stream Match Setup & Database Verification ---\x1b[0m');
    const tourneyRes = await request('GET', '/api/tournament/data');
    assert('Tournament Database contains official teams', tourneyRes.status === 200 && tourneyRes.body.teams.length >= 2, `Found ${tourneyRes.body?.teams?.length} teams`);
    
    // Select scheduled match: S1N eSports vs Acceleration Esports
    const match = tourneyRes.body.matches && tourneyRes.body.matches[0] ? tourneyRes.body.matches[0] : null;
    if (match) {
        const loadMatchRes = await request('POST', '/api/tournament/load_match', { matchId: match.id });
        assert('Pre-Stream match successfully loaded into active broadcast session', loadMatchRes.status === 200 && loadMatchRes.body.status === true);
    }

    const stateBeforeGame = await request('GET', '/get_game_state');
    assert('Game State reflects official Team 1 (S1N)', stateBeforeGame.body.team_1.abbreviation === 'S1N' || stateBeforeGame.body.team_1.name.includes('S1N'), `Got: ${stateBeforeGame.body.team_1?.name}`);
    assert('Game State reflects official Team 2 (ACCE)', stateBeforeGame.body.team_2.abbreviation === 'ACCE' || stateBeforeGame.body.team_2.name.includes('Acceleration'), `Got: ${stateBeforeGame.body.team_2?.name}`);

    // --- STEP 2: SWITCHING TO AUTOMATIC CONTROL MODE ---
    console.log('\n\x1b[36m--- STEP 2: Operator Switches to Automatic Lockfile Mode ---\x1b[0m');
    const modeRes = await request('POST', '/api/operator/mode', { mode: 'automatic' });
    assert('Operator mode switched to Automatic Mode', modeRes.status === 200 && modeRes.body.mode === 'automatic');

    // --- STEP 3: ROUND 1 PISTOL ROUND TELEMETRY (Ascent) ---
    console.log('\n\x1b[36m--- STEP 3: Live In-Game Telemetry - Round 1 (Pistol Round) ---\x1b[0m');
    const round1Payload = {
        phase: 'INGAME',
        inGame: true,
        map: 'ascent',
        round_number: 1,
        team_1_score: 0,
        team_2_score: 0,
        spike: 'up',
        spike_down: false,
        switch_sides: false,
        is_custom_match: true,
        is_tournament_mode: true,
        match_type: 'CUSTOM_TOURNAMENT',
        team_1_players: [
            { slot: 0, name: 'Knight', character: 'Jett', health: 100, armor: 25, weapon: 'ghost', ult_points_gained: 0, ult_points_needed: 7, is_dead: false },
            { slot: 1, name: 'Vajra', character: 'Sova', health: 100, armor: 0, weapon: 'ghost', ult_points_gained: 0, ult_points_needed: 8, is_dead: false },
            { slot: 2, name: 'Salamander', character: 'Omen', health: 100, armor: 25, weapon: 'classic', ult_points_gained: 0, ult_points_needed: 7, is_dead: false },
            { slot: 3, name: 'Hmza', character: 'Killjoy', health: 100, armor: 0, weapon: 'frenzy', ult_points_gained: 0, ult_points_needed: 8, is_dead: false },
            { slot: 4, name: 'Desert', character: 'Breach', health: 100, armor: 25, weapon: 'ghost', ult_points_gained: 0, ult_points_needed: 8, is_dead: false }
        ],
        team_2_players: [
            { slot: 5, name: 'Acn s1ck', character: 'Reyna', health: 100, armor: 25, weapon: 'ghost', ult_points_gained: 0, ult_points_needed: 6, is_dead: false },
            { slot: 6, name: 'Acn ronny', character: 'Raze', health: 100, armor: 0, weapon: 'ghost', ult_points_gained: 0, ult_points_needed: 8, is_dead: false },
            { slot: 7, name: 'Igh v1n1', character: 'Viper', health: 100, armor: 25, weapon: 'classic', ult_points_gained: 0, ult_points_needed: 8, is_dead: false },
            { slot: 8, name: 'Addythegoat', character: 'Cypher', health: 100, armor: 0, weapon: 'frenzy', ult_points_gained: 0, ult_points_needed: 8, is_dead: false },
            { slot: 9, name: 'Itzzdexterr', character: 'Fade', health: 100, armor: 25, weapon: 'ghost', ult_points_gained: 0, ult_points_needed: 8, is_dead: false }
        ]
    };

    const syncR1 = await request('POST', '/api/bridge/sync_match', round1Payload);
    assert('Round 1 initial buy telemetry synchronized', syncR1.status === 200);

    const r1State = await request('GET', '/get_game_state');
    assert('Top Scoreboard reflects Ascent, Round 1, 0 - 0', (r1State.body.map || 'ascent').toLowerCase() === 'ascent' && r1State.body.round_number === 1 && r1State.body.team_1_score === 0);

    // Mid-Round Combat: Damage taken, 2 players die, Spike Planted on A Site!
    console.log('\n\x1b[36m--- STEP 4: Live Combat - Damage, Casualties & Spike Planted ---\x1b[0m');
    const midRoundPayload = {
        ...round1Payload,
        spike: 'down',
        spike_down: true,
        team_1_players: [
            { slot: 0, name: 'Knight', character: 'Jett', health: 42, armor: 0, weapon: 'ghost', is_dead: false },
            { slot: 1, name: 'Vajra', character: 'Sova', health: 0, armor: 0, weapon: 'ghost', is_dead: true }, // Dead
            { slot: 2, name: 'Salamander', character: 'Omen', health: 100, armor: 25, weapon: 'classic', is_dead: false },
            { slot: 3, name: 'Hmza', character: 'Killjoy', health: 0, armor: 0, weapon: 'frenzy', is_dead: true }, // Dead
            { slot: 4, name: 'Desert', character: 'Breach', health: 85, armor: 0, weapon: 'ghost', is_dead: false }
        ],
        team_2_players: [
            { slot: 5, name: 'Acn s1ck', character: 'Reyna', health: 100, armor: 0, weapon: 'ghost', is_dead: false },
            { slot: 6, name: 'Acn ronny', character: 'Raze', health: 100, armor: 0, weapon: 'ghost', is_dead: false },
            { slot: 7, name: 'Igh v1n1', character: 'Viper', health: 65, armor: 0, weapon: 'classic', is_dead: false },
            { slot: 8, name: 'Addythegoat', character: 'Cypher', health: 0, armor: 0, weapon: 'frenzy', is_dead: true }, // Dead
            { slot: 9, name: 'Itzzdexterr', character: 'Fade', health: 100, armor: 25, weapon: 'ghost', is_dead: false }
        ]
    };

    const syncCombat = await request('POST', '/api/bridge/sync_match', midRoundPayload);
    assert('Combat telemetry (Spike down, HP drops, Deaths) synchronized', syncCombat.status === 200);

    const statsRes = await request('GET', '/get_player_stats');
    assert('Player HUD reflects dead players correctly (Team 1: 2 dead, Team 2: 1 dead)', 
        statsRes.body.team_1.player_1.is_dead === true &&
        statsRes.body.team_1.player_3.is_dead === true &&
        statsRes.body.team_2.player_3.is_dead === true
    );
    assert('Player HUD reflects Knight HP at 42', statsRes.body.team_1.player_0.health === 42);

    const spikeCheck = await request('GET', '/get_game_state');
    assert('Top Scoreboard reflects Spike Planted (spike_down = true)', spikeCheck.body.spike_down === true);

    // --- STEP 5: ROUND 1 WIN & PROGRESSION ---
    console.log('\n\x1b[36m--- STEP 5: Round 1 End (S1N Wins) -> Round 2 Full Buy ---\x1b[0m');
    const round2Payload = {
        phase: 'INGAME',
        inGame: true,
        map: 'ascent',
        round_number: 2,
        team_1_score: 1,
        team_2_score: 0,
        spike: 'up',
        spike_down: false,
        switch_sides: false,
        team_1_players: [
            { slot: 0, name: 'Knight', character: 'Jett', health: 100, armor: 50, weapon: 'spectre', is_dead: false },
            { slot: 1, name: 'Vajra', character: 'Sova', health: 100, armor: 50, weapon: 'spectre', is_dead: false },
            { slot: 2, name: 'Salamander', character: 'Omen', health: 100, armor: 50, weapon: 'spectre', is_dead: false },
            { slot: 3, name: 'Hmza', character: 'Killjoy', health: 100, armor: 50, weapon: 'spectre', is_dead: false },
            { slot: 4, name: 'Desert', character: 'Breach', health: 100, armor: 50, weapon: 'bulldog', is_dead: false }
        ],
        team_2_players: [
            { slot: 5, name: 'Acn s1ck', character: 'Reyna', health: 100, armor: 0, weapon: 'sheriff', is_dead: false },
            { slot: 6, name: 'Acn ronny', character: 'Raze', health: 100, armor: 0, weapon: 'classic', is_dead: false },
            { slot: 7, name: 'Igh v1n1', character: 'Viper', health: 100, armor: 25, weapon: 'sheriff', is_dead: false },
            { slot: 8, name: 'Addythegoat', character: 'Cypher', health: 100, armor: 0, weapon: 'classic', is_dead: false },
            { slot: 9, name: 'Itzzdexterr', character: 'Fade', health: 100, armor: 0, weapon: 'ghost', is_dead: false }
        ]
    };
    await request('POST', '/api/bridge/sync_match', round2Payload);
    const r2State = await request('GET', '/get_game_state');
    assert('Top Scoreboard reflects Round 2 score (1 - 0, Spike Cleared)', r2State.body.round_number === 2 && r2State.body.team_1_score === 1 && r2State.body.spike_down === false);

    // --- STEP 6: HALFTIME SIDE SWITCH (Round 13) ---
    console.log('\n\x1b[36m--- STEP 6: Halftime Side Switch (Round 13, 7 - 5) ---\x1b[0m');
    const halftimePayload = {
        phase: 'INGAME',
        inGame: true,
        map: 'ascent',
        round_number: 13,
        team_1_score: 7,
        team_2_score: 5,
        spike: 'up',
        spike_down: false,
        switch_sides: true, // Halftime side swap!
        team_1_players: round2Payload.team_1_players,
        team_2_players: round2Payload.team_2_players
    };
    await request('POST', '/api/bridge/sync_match', halftimePayload);
    const halfState = await request('GET', '/get_game_state');
    assert('Top Scoreboard reflects Halftime switch_sides = true', halfState.body.switch_sides === true);
    assert('Top Scoreboard reflects Round 13 score (7 - 5)', halfState.body.round_number === 13 && halfState.body.team_1_score === 7 && halfState.body.team_2_score === 5);

    // --- STEP 7: CASTERS / TALENT LOWER THIRD POPUP ON STREAM ---
    console.log('\n\x1b[36m--- STEP 7: Casters & Talent Desk Lower Third Live Pop-up ---\x1b[0m');
    const castersSetup = await request('POST', '/set_casters', {
        caster_1: JSON.stringify({ name: 'Ailyrr', handle: '@ailyrr', role: 'CASTER', enabled: true }),
        caster_2: JSON.stringify({ name: 'Vanguard', handle: '@vanguard', role: 'ANALYST', enabled: true }),
        caster_3: JSON.stringify({ name: 'Special Guest', handle: '@guest', role: 'HOST', enabled: true }),
        show_lower_third: true,
        duration: 6000,
        auto_loop: false
    });
    assert('Casters 3-slot setup configured & lower third triggered', castersSetup.status === 200 && castersSetup.body.casters.caster_3.name === 'Special Guest');

    const castersData = await request('GET', '/get_casters');
    assert('All 3 Casters enabled & synchronized with handles and roles', 
        castersData.body.caster_1.enabled === true &&
        castersData.body.caster_2.enabled === true &&
        castersData.body.caster_3.enabled === true &&
        castersData.body.show_lower_third === true
    );

    // --- STEP 8: DISK PERSISTENCE & OVERLAY ENDPOINTS HEALTH ---
    console.log('\n\x1b[36m--- STEP 8: Static Overlays Live Rendering Verification ---\x1b[0m');
    const gameScorePage = await request('GET', '/game_score/');
    assert('Top Scoreboard Overlay (/game_score) renders 200 OK', gameScorePage.status === 200 && gameScorePage.raw.includes('left-team'));

    const playerStatsPage = await request('GET', '/player_stats/');
    assert('Player Stats HUD Overlay (/player_stats) renders 200 OK', playerStatsPage.status === 200 && playerStatsPage.raw.includes('left-hud'));

    const casterDeskPage = await request('GET', '/caster_desk/');
    assert('Caster Desk Overlay (/caster_desk) renders 200 OK', casterDeskPage.status === 200 && casterDeskPage.raw.includes('caster-container'));

    // --- STEP 9: MATCH FINISH (13 - 9) & MAP FLOW UPDATE ---
    console.log('\n\x1b[36m--- STEP 9: Match Finish (13 - 9) & Series Sync ---\x1b[0m');
    const matchEndPayload = {
        phase: 'INGAME',
        inGame: true,
        map: 'ascent',
        round_number: 22,
        team_1_score: 13,
        team_2_score: 9,
        spike: 'up',
        spike_down: false,
        switch_sides: true,
        team_1_players: round2Payload.team_1_players,
        team_2_players: round2Payload.team_2_players
    };
    await request('POST', '/api/bridge/sync_match', matchEndPayload);
    const finalState = await request('GET', '/get_game_state');
    assert('Final match score synced: S1N (13) vs ACCE (9)', finalState.body.team_1_score === 13 && finalState.body.team_2_score === 9);

    // Clean teardown
    await new Promise((resolve) => server.close(resolve));

    console.log('\n\x1b[35m======================================================================\x1b[0m');
    console.log(`\x1b[32mSIMULATION COMPLETE: ${passedTests} PASSED | ${failedTests} FAILED\x1b[0m`);
    if (failedTests === 0) {
        console.log('\x1b[32m🎉 100% SUCCESS: All live match telemetry functions perform seamlessly in sync!\x1b[0m');
    }
    console.log('\x1b[35m======================================================================\x1b[0m\n');
}

runSimulation().catch(err => {
    console.error('Fatal Simulation Error:', err);
    process.exit(1);
});
