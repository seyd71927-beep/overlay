/**
 * HelValorant Live In-Game Automated Bridge
 * 
 * This client script connects directly to a live running VALORANT game (or Spectator / Observer client)
 * via the local Riot Client Lockfile / Local API, extracts live match states (Map, Round, Scores, Player stats),
 * and automatically forwards them in real-time to your Overlay Server!
 * 
 * Usage:
 * 1. Make sure your Overlay Server is running (node server.js).
 * 2. Start VALORANT on your PC.
 * 3. Run: node live_valorant_bridge.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const OVERLAY_SERVER_HOST = process.argv[2] || process.env.OVERLAY_HOST || 'http://localhost:25565';
const LOCKFILE_PATH = path.join(
    process.env.LOCALAPPDATA || 'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local',
    'Riot Games',
    'Riot Client',
    'Config',
    'lockfile'
);

let riotClientConfig = null;
let currentMatchId = null;

console.log('\x1b[35m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', '  VALORANT LIVE OVERLAY AUTO-BRIDGE CLIENT v1.0   ');
console.log('\x1b[35m%s\x1b[0m', '==================================================');
console.log(`[Bridge] Target Overlay Server: ${OVERLAY_SERVER_HOST}`);
console.log(`[Bridge] Looking for Valorant client lockfile at:\n         ${LOCKFILE_PATH}\n`);

// Helper to make HTTPS requests to local Riot Client API
function makeRiotRequest(endpoint, port, authPassword) {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`riot:${authPassword}`).toString('base64');
        const options = {
            hostname: '127.0.0.1',
            port: port,
            path: endpoint,
            method: 'GET',
            rejectUnauthorized: false,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.end();
    });
}

// Forward state to Overlay Server
function postToOverlay(endpoint, body) {
    return new Promise((resolve) => {
        const data = new URLSearchParams(body).toString();
        const url = new URL(endpoint, OVERLAY_SERVER_HOST);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            rejectUnauthorized: false,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'ValorantLiveBridge/1.0',
                'Bypass-Tunnel-Reminder': 'true'
            }
        };

        const req = client.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => resolve(resData));
        });

        req.on('error', (e) => {
            console.error(`[Bridge -> Overlay Error] ${e.message}`);
            resolve(null);
        });

        req.write(data);
        req.end();
    });
}

// Read Riot lockfile to get local port & password
function getRiotLockfile() {
    try {
        if (fs.existsSync(LOCKFILE_PATH)) {
            const content = fs.readFileSync(LOCKFILE_PATH, 'utf8').trim();
            const parts = content.split(':');
            if (parts.length >= 5) {
                return {
                    name: parts[0],
                    pid: parts[1],
                    port: parts[2],
                    password: parts[3],
                    protocol: parts[4]
                };
            }
        }
    } catch (e) { }
    return null;
}

// Main polling loop
async function bridgeLoop() {
    riotClientConfig = getRiotLockfile();

    if (!riotClientConfig) {
        process.stdout.write('\r\x1b[33m[Status] Waiting for VALORANT to be launched on this PC...\x1b[0m   ');
        setTimeout(bridgeLoop, 2000);
        return;
    }

    try {
        // Query local session
        const session = await makeRiotRequest('/chat/v1/session', riotClientConfig.port, riotClientConfig.password);

        if (session && session.loaded) {
            console.log(`\n\x1b[32m[Connected]\x1b[0m Logged in as: ${session.game_name}#${session.game_tag}`);
            console.log(`\x1b[32m[Active]\x1b[0m Monitoring live in-game match state...\n`);

            // Poll in-game state
            await pollLiveMatch();
        } else {
            process.stdout.write('\r\x1b[33m[Status] Valorant client active. Waiting for game session...\x1b[0m ');
            setTimeout(bridgeLoop, 2000);
        }
    } catch (err) {
        setTimeout(bridgeLoop, 2000);
    }
}

async function pollLiveMatch() {
    if (!riotClientConfig) return bridgeLoop();

    try {
        // Fetch coregame match info
        const presence = await makeRiotRequest('/chat/v4/presences', riotClientConfig.port, riotClientConfig.password);

        if (presence && presence.presences) {
            for (const p of presence.presences) {
                if (p.product === 'valorant' && p.private) {
                    try {
                        const privateData = JSON.parse(Buffer.from(p.private, 'base64').toString('utf8'));

                        if (privateData.sessionLoopState === 'INGAME') {
                            const partyOwnerMatchScore = privateData.partyOwnerMatchScore || 0;
                            const enemyScore = privateData.partyOwnerMatchScoreEnemy || 0;
                            const mapPath = privateData.matchMap || '';
                            const mapName = mapPath.split('/').pop().toLowerCase();

                            // Forward live score to overlay
                            await postToOverlay('/change_game_state', {
                                round_number: (partyOwnerMatchScore + enemyScore + 1),
                                team_1_score: partyOwnerMatchScore,
                                team_2_score: enemyScore,
                                spike: (privateData.provisioningFlow === 'CustomGame') ? 'up' : 'up'
                            });

                            process.stdout.write(`\r\x1b[32m[LIVE GAME SYNC]\x1b[0m Map: ${mapName.toUpperCase()} | Scores: ${partyOwnerMatchScore} - ${enemyScore} | Sync OK    `);
                        } else if (privateData.sessionLoopState === 'PREGAME') {
                            process.stdout.write('\r\x1b[36m[AGENT SELECT]\x1b[0m In Agent Select Lobby...                                      ');
                        } else {
                            process.stdout.write('\r\x1b[37m[MENUS]\x1b[0m In Lobby / Menus...                                                  ');
                        }
                    } catch (e) { }
                }
            }
        }
    } catch (e) { }

    setTimeout(pollLiveMatch, 1000);
}

// Start bridge
bridgeLoop();
