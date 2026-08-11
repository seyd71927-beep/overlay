/**
 * HelValorant Live In-Game Automated Bridge Client
 * 
 * Runs on the Streamer's PC (India or anywhere locally running VALORANT).
 * Connects directly to local Riot Client & In-Game VALORANT instance,
 * extracts live custom tournament telemetry (Scores, Map, Round, Dynamic Player Rosters, Agents, Status),
 * and continuously forwards all match states in real-time to your Railway Overlay Server!
 * 
 * Usage:
 *   node live_valorant_bridge.js [OVERLAY_SERVER_URL]
 *   e.g. node live_valorant_bridge.js https://my-app.up.railway.app
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const readline = require('readline');

// Agent GUID to Name Mapping
const AGENT_ID_MAP = {
    "add6443a-41bd-e414-f6ad-e58d267f4e95": "jett",
    "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc": "reyna",
    "a3bfb854-4339-1607-696a-29e3c6588b0f": "reyna",
    "f94c3b30-42be-e959-889c-5aa313dba261": "raze",
    "f94c3b30-42be-e959-889c-5dab3174297d": "raze",
    "707eab51-4836-f488-046a-cda6bf494859": "viper",
    "707eab51-47e6-40e7-a4ff-ff06b04d4760": "viper",
    "8e253930-4c05-31dd-1b6c-968525494517": "omen",
    "9f0d8ba9-4140-b941-57d3-a7ad57c6b417": "brimstone",
    "9f0d8ba9-42c6-b1e3-09c4-fb8d70a39a74": "brimstone",
    "eb93336a-449b-9c1b-0a54-a891f7921d69": "phoenix",
    "320b2a48-4d9b-a075-30f1-1f93a9b638fa": "sova",
    "569fdd95-4d10-43ab-ca70-79becc718b46": "sage",
    "117ed9e3-49f3-6512-3ccf-0cada7e3823b": "cypher",
    "1e58de9c-4950-5125-93e9-a0aee9f98746": "killjoy",
    "5f8d3a7f-467b-97f3-062c-13acf203c006": "breach",
    "5f8d3d21-4a40-4870-49b0-9c892177457f": "breach",
    "6f2a04ca-43e0-be17-7f36-b3908627744d": "skye",
    "6f2a04ca-43e0-be17-7f03-b524940794f2": "skye",
    "7f94d92c-4234-0a36-9646-3a87eb8b5c89": "yoru",
    "41fb69c1-4189-7b37-f117-bcaf1e96f1bf": "astra",
    "41fb69c1-4159-7b64-0fb1-ab73b6328f5c": "astra",
    "601dbbe7-43ce-be57-2a40-4abd24953621": "kayo",
    "601db835-4b3b-004e-d273-818bf614580e": "kayo",
    "22697a3d-45bf-8dd7-4fec-84a9e28c69d7": "chamber",
    "bb2a4828-46eb-8cd1-e765-15848195d751": "neon",
    "dade69b4-4f5a-8528-247b-219e5a1facd6": "fade",
    "95b78ed7-4637-86d9-7e41-71ba8c293152": "harbor",
    "ea308bf8-4f80-8a0a-bbc7-8a927b9c0340": "harbor",
    "e370fa57-4757-3604-3648-499e1f642d3f": "gekko",
    "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235": "deadlock",
    "cc8e01d3-4f9e-9713-2815-4ba1a22f0761": "deadlock",
    "0e38b510-41a8-5780-5e8f-568b2a4f2d6c": "iso",
    "1dbf2edd-4729-0984-3115-daa5eed44993": "clove",
    "1dbf2edd-4729-0984-3115-ffb15092b56b": "clove",
    "efba5359-4016-a1e5-7626-b1ae76895940": "vyse",
    "b444168c-4e35-8076-db47-ef9bf368f384": "tejo",
    "7c8a4701-4de6-9355-b254-e09bc2a34b72": "miks",
    "92eeef5d-43b5-1d4a-8d03-b3927a09034b": "veto",
    "df1cb487-4902-002e-5c17-d28e83e78588": "waylay"
};

// Map URL/Path to Standard Map Name
const MAP_PATH_MAP = {
    "ascent": "ascent",
    "bonsai": "split",
    "canyon": "fracture",
    "duality": "bind",
    "foxtrot": "breeze",
    "triad": "haven",
    "port": "icebox",
    "jam": "lotus",
    "pitt": "pearl",
    "juliett": "sunset",
    "infinity": "abyss",
    "hurm": "district",
    "kasbah": "kasbah",
    "drift": "drift",
    "pia": "glitch"
};

// Pro Team Presets
const PRO_TEAM_REGISTRY = {
    "FNC": { name: "FNATIC", logo: "https://cdn.sanity.io/images/5gii1snx/production/c32c2cb848fd3338ff23a590ec5c0e052b080f27-1000x1000.png" },
    "SEN": { name: "SENTINELS", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Sentinels_logo.svg/1200px-Sentinels_logo.svg.png" },
    "PRX": { name: "PAPER REX", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Paper_Rex_logo.png/600px-Paper_Rex_logo.png" },
    "TL": { name: "TEAM LIQUID", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f4/Team_Liquid_logo.svg/1200px-Team_Liquid_logo.svg.png" },
    "C9": { name: "CLOUD9", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Cloud9_logo.svg/1200px-Cloud9_logo.svg.png" },
    "NRG": { name: "NRG ESPORTS", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/5/53/NRG_Esports_logo.svg/1200px-NRG_Esports_logo.svg.png" },
    "DRX": { name: "DRX", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/DRX_logo.svg/1200px-DRX_logo.svg.png" },
    "GEN": { name: "GEN.G", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Gen.G_logo.svg/1200px-Gen.G_logo.svg.png" },
    "TH": { name: "TEAM HERETICS", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e7/Team_Heretics_logo.svg/1200px-Team_Heretics_logo.svg.png" },
    "KC": { name: "KARMINE CORP", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Karmine_Corp_logo.svg/1200px-Karmine_Corp_logo.svg.png" },
    "G2": { name: "G2 ESPORTS", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/1/12/G2_Esports_logo.svg/1200px-G2_Esports_logo.svg.png" },
    "NAVI": { name: "NAVI", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/a/ac/Natus_Vincere_logo.svg/1200px-Natus_Vincere_logo.svg.png" },
    "T1": { name: "T1", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/T1_logo.svg/1200px-T1_logo.svg.png" },
    "NXR": { name: "NEXAURA", logo: "https://res.cloudinary.com/swmd79za/image/upload/v1786179144/NXR_PNG_-_bijin_das_g5iepg.png" },
    "IDLI": { name: "IDLISAMBAR", logo: "https://res.cloudinary.com/swmd79za/image/upload/v1786179144/IDLISAMBAR_nezidc.png" }
};

const CONFIG_FILE = path.join(__dirname, 'config', 'bridge_config.json');

function getSavedServerHost() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (data && data.server_url) return data.server_url;
        }
    } catch (e) {}
    return null;
}

function saveServerHost(url) {
    try {
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ server_url: url.trim() }, null, 4));
    } catch (e) {}
}

const LOCKFILE_PATH = path.join(
    process.env.LOCALAPPDATA || 'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local',
    'Riot Games',
    'Riot Client',
    'Config',
    'lockfile'
);

let overlayHost = process.argv[2] || process.env.OVERLAY_HOST || getSavedServerHost() || 'http://localhost:25565';
let riotConfig = null;
let cachedSession = null;
let cachedPlayerNames = {};

// Read Riot lockfile
function getRiotLockfile() {
    try {
        if (fs.existsSync(LOCKFILE_PATH)) {
            const content = fs.readFileSync(LOCKFILE_PATH, 'utf8').trim();
            const parts = content.split(':');
            if (parts.length >= 5) {
                return {
                    name: parts[0],
                    pid: parts[1],
                    port: parseInt(parts[2]),
                    password: parts[3],
                    protocol: parts[4]
                };
            }
        }
    } catch (e) {}
    return null;
}

// Make HTTPS request to local Riot Client API
function makeRiotRequest(endpoint, method = 'GET', body = null) {
    return new Promise((resolve) => {
        if (!riotConfig) return resolve(null);

        const auth = Buffer.from(`riot:${riotConfig.password}`).toString('base64');
        const options = {
            hostname: '127.0.0.1',
            port: riotConfig.port,
            path: endpoint,
            method: method,
            rejectUnauthorized: false,
            timeout: 3500,
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
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));

        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

// Transmit state payload to Overlay Server on Railway / local
function postToOverlay(endpoint, payload) {
    return new Promise((resolve) => {
        try {
            const url = new URL(endpoint, overlayHost);
            const isHttps = url.protocol === 'https:';
            const client = isHttps ? https : http;

            const postData = JSON.stringify(payload);

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                rejectUnauthorized: false,
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'HelValorant-LiveBridge/2.0'
                }
            };

            const req = client.request(options, (res) => {
                let resData = '';
                res.on('data', chunk => resData += chunk);
                res.on('end', () => resolve(resData));
            });

            req.on('timeout', () => { req.destroy(); resolve(null); });
            req.on('error', () => resolve(null));

            req.write(postData);
            req.end();
        } catch (e) {
            resolve(null);
        }
    });
}

// Resolve PUUIDs to In-Game Player Names using local Name-Service
async function resolvePlayerNames(puuids = []) {
    if (!puuids || puuids.length === 0) return {};
    const unCached = puuids.filter(p => !cachedPlayerNames[p]);

    if (unCached.length > 0) {
        try {
            const result = await makeRiotRequest('/name-service/v2/players', 'PUT', unCached);
            if (Array.isArray(result)) {
                for (const item of result) {
                    if (item.Subject && item.GameName) {
                        cachedPlayerNames[item.Subject] = {
                            name: item.GameName,
                            tag: item.TagLine || '',
                            fullName: `${item.GameName}#${item.TagLine || ''}`
                        };
                    }
                }
            }
        } catch (e) {}
    }

    return cachedPlayerNames;
}

// Extract Team Tag from IGN (e.g. [NXR] TenZ -> NXR)
function extractTeamTag(ign) {
    if (!ign) return null;
    const match = ign.match(/^\[([A-Za-z0-9]{2,6})\]/i) ||
                  ign.match(/^\(([A-Za-z0-9]{2,6})\)/i) ||
                  ign.match(/^([A-Za-z0-9]{2,4})[_\s]/i);
    return match ? match[1].toUpperCase() : null;
}

// Deduce Team Names from Rosters
function deduceTeamsFromRosters(team1List, team2List) {
    const t1Tags = {};
    const t2Tags = {};

    team1List.forEach(p => {
        const tag = extractTeamTag(p.username);
        if (tag) t1Tags[tag] = (t1Tags[tag] || 0) + 1;
    });

    team2List.forEach(p => {
        const tag = extractTeamTag(p.username);
        if (tag) t2Tags[tag] = (t2Tags[tag] || 0) + 1;
    });

    const t1Tag = Object.keys(t1Tags).sort((a, b) => t1Tags[b] - t1Tags[a])[0];
    const t2Tag = Object.keys(t2Tags).sort((a, b) => t2Tags[b] - t2Tags[a])[0];

    const result = { team_1: null, team_2: null };

    if (t1Tag) {
        result.team_1 = {
            abbreviation: t1Tag,
            name: PRO_TEAM_REGISTRY[t1Tag]?.name || t1Tag,
            icon_link: PRO_TEAM_REGISTRY[t1Tag]?.logo || `https://api.dicebear.com/7.x/identicon/svg?seed=${t1Tag}&backgroundColor=141824`
        };
    }

    if (t2Tag) {
        result.team_2 = {
            abbreviation: t2Tag,
            name: PRO_TEAM_REGISTRY[t2Tag]?.name || t2Tag,
            icon_link: PRO_TEAM_REGISTRY[t2Tag]?.logo || `https://api.dicebear.com/7.x/identicon/svg?seed=${t2Tag}&backgroundColor=141824`
        };
    }

    return result;
}

// Main Polling Loop
async function pollLoop() {
    riotConfig = getRiotLockfile();

    if (!riotConfig) {
        process.stdout.write('\r\x1b[33m[Status] Waiting for VALORANT to be running on this PC...\x1b[0m       ');
        setTimeout(pollLoop, 1500);
        return;
    }

    try {
        // 1. Get Session Info
        if (!cachedSession) {
            const sess = await makeRiotRequest('/chat/v1/session');
            if (sess && sess.loaded && sess.game_name) {
                cachedSession = sess;
                console.log(`\n\x1b[32m[Connected to VALORANT]\x1b[0m Streamer Account: ${sess.game_name}#${sess.game_tag}`);
                console.log(`\x1b[36m[Overlay Sync Target]\x1b[0m ${overlayHost}\n`);
            }
        }

        // 2. Query Presences
        const presence = await makeRiotRequest('/chat/v4/presences');
        let valorantPresence = null;

        if (presence && Array.isArray(presence.presences)) {
            for (const p of presence.presences) {
                if (p.puuid === (cachedSession?.puuid) && p.product === 'valorant' && p.private) {
                    valorantPresence = p;
                    break;
                }
            }
            if (!valorantPresence) {
                for (const p of presence.presences) {
                    if (p.product === 'valorant' && p.private) {
                        valorantPresence = p;
                        break;
                    }
                }
            }
        }

        if (!valorantPresence) {
            process.stdout.write('\r\x1b[33m[Status] Valorant client active. Waiting for game session presence...\x1b[0m ');
            setTimeout(pollLoop, 1200);
            return;
        }

        let priv = {};
        try {
            priv = JSON.parse(Buffer.from(valorantPresence.private, 'base64').toString('utf8'));
        } catch (e) {}

        const loopState = priv.sessionLoopState || 'MENUS';
        const isCustom = (priv.provisioningFlow === 'CustomGame');
        const rawMap = (priv.matchMap || '').toLowerCase();

        let detectedMap = 'sunset';
        for (const k in MAP_PATH_MAP) {
            if (rawMap.includes(k)) {
                detectedMap = MAP_PATH_MAP[k];
                break;
            }
        }

        const t1Score = parseInt(priv.partyOwnerMatchScore) || 0;
        const t2Score = parseInt(priv.partyOwnerMatchScoreEnemy) || 0;
        const roundNum = t1Score + t2Score + 1;

        // 3. Coregame / Pregame Match extraction for exact custom tournament players
        let team1Players = [];
        let team2Players = [];
        let puuidsToResolve = [];

        if (loopState === 'INGAME') {
            // Coregame In-Game
            const puuid = cachedSession?.puuid || valorantPresence.puuid;
            let matchData = null;

            if (puuid) {
                const corePlayer = await makeRiotRequest(`/core-game/v1/players/${puuid}`);
                if (corePlayer && corePlayer.MatchID) {
                    matchData = await makeRiotRequest(`/core-game/v1/matches/${corePlayer.MatchID}`);
                }
            }

            if (matchData && Array.isArray(matchData.Players)) {
                for (const pl of matchData.Players) {
                    if (pl.Subject) puuidsToResolve.push(pl.Subject);
                }

                const namesMap = await resolvePlayerNames(puuidsToResolve);

                for (const pl of matchData.Players) {
                    const agentName = AGENT_ID_MAP[pl.CharacterID] || 'jett';
                    const nameInfo = namesMap[pl.Subject] || { name: `Player`, tag: '' };
                    const isBlue = (pl.TeamID === 'Blue' || pl.TeamID === 'TeamOne');

                    const pObj = {
                        puuid: pl.Subject,
                        username: nameInfo.name || 'Player',
                        tag: nameInfo.tag || '',
                        agent: agentName,
                        health: 100,
                        shield: 50,
                        weapon: 'vandal',
                        credits: 3900,
                        ult_points_gained: 4,
                        ult_points_needed: 7,
                        c_util: true,
                        q_util: true,
                        e_util: true,
                        has_spike: false,
                        is_dead: false
                    };

                    if (isBlue) {
                        team1Players.push(pObj);
                    } else {
                        team2Players.push(pObj);
                    }
                }
            }
        } else if (loopState === 'PREGAME') {
            // Agent Selection
            const puuid = cachedSession?.puuid || valorantPresence.puuid;
            let pregameData = null;

            if (puuid) {
                const prePlayer = await makeRiotRequest(`/pregame/v1/players/${puuid}`);
                if (prePlayer && prePlayer.MatchID) {
                    pregameData = await makeRiotRequest(`/pregame/v1/matches/${prePlayer.MatchID}`);
                }
            }

            if (pregameData && Array.isArray(pregameData.Teams)) {
                for (const t of pregameData.Teams) {
                    if (Array.isArray(t.Players)) {
                        for (const pl of t.Players) {
                            if (pl.Subject) puuidsToResolve.push(pl.Subject);
                        }
                    }
                }

                const namesMap = await resolvePlayerNames(puuidsToResolve);

                for (const t of pregameData.Teams) {
                    const isBlue = (t.TeamID === 'Blue' || t.TeamID === 'TeamOne');
                    if (Array.isArray(t.Players)) {
                        for (const pl of t.Players) {
                            const agentName = AGENT_ID_MAP[pl.CharacterID] || 'jett';
                            const nameInfo = namesMap[pl.Subject] || { name: 'Player', tag: '' };

                            const pObj = {
                                puuid: pl.Subject,
                                username: nameInfo.name || 'Player',
                                tag: nameInfo.tag || '',
                                agent: agentName,
                                health: 100,
                                shield: 50,
                                weapon: 'classic',
                                credits: 800,
                                ult_points_gained: 0,
                                ult_points_needed: 7,
                                c_util: true,
                                q_util: true,
                                e_util: true,
                                has_spike: false,
                                is_dead: false
                            };

                            if (isBlue) team1Players.push(pObj);
                            else team2Players.push(pObj);
                        }
                    }
                }
            }
        }

        // Auto-deduce teams if available
        const deducedTeams = deduceTeamsFromRosters(team1Players, team2Players);

        // Build Payload
        const payload = {
            phase: loopState,
            inGame: (loopState === 'INGAME'),
            isCustom: isCustom,
            map: detectedMap,
            round_number: roundNum,
            team_1_score: t1Score,
            team_2_score: t2Score,
            switch_sides: (roundNum > 12 && roundNum <= 24) || (roundNum > 24 && roundNum % 2 === 0),
            team_1: deducedTeams.team_1,
            team_2: deducedTeams.team_2
        };

        // Only include rosters if we found players
        if (team1Players.length > 0 || team2Players.length > 0) {
            payload.team_1_players = team1Players;
            payload.team_2_players = team2Players;
        }

        // Send live sync to overlay server
        await postToOverlay('/api/bridge/sync_match', payload);

        const playerCountStr = (team1Players.length > 0 || team2Players.length > 0)
            ? ` | Roster: ${team1Players.length}v${team2Players.length}`
            : '';

        if (loopState === 'INGAME') {
            process.stdout.write(`\r\x1b[32m[LIVE GAME SYNC]\x1b[0m Map: ${detectedMap.toUpperCase()} | Score: ${t1Score}-${t2Score} | Rnd: ${roundNum}${playerCountStr} | Sync OK    `);
        } else if (loopState === 'PREGAME') {
            process.stdout.write(`\r\x1b[36m[AGENT SELECT]\x1b[0m Map: ${detectedMap.toUpperCase()} | In Custom Agent Selection Lobby${playerCountStr}               `);
        } else {
            process.stdout.write(`\r\x1b[37m[IN MENUS]\x1b[0m In Valorant Menus / Custom Lobby (Ready)                                        `);
        }

    } catch (err) {
        // Fail silently and retry
    }

    setTimeout(pollLoop, 1000);
}

// Prompt for Railway URL if needed
function startBridge() {
    console.log('\x1b[35m%s\x1b[0m', '=======================================================');
    console.log('\x1b[36m%s\x1b[0m', '   VALORANT LIVE IN-GAME AUTO-BRIDGE CLIENT v2.0       ');
    console.log('\x1b[35m%s\x1b[0m', '=======================================================');

    if (!process.argv[2] && !process.env.OVERLAY_HOST && !getSavedServerHost()) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\x1b[33m[First Time Setup]\x1b[0m Enter your Railway Overlay URL:');
        console.log('Example: https://helvalorant-production.up.railway.app (or press Enter for http://localhost:25565)\n');

        rl.question('Overlay Server URL: ', (answer) => {
            rl.close();
            const chosen = answer.trim() || 'http://localhost:25565';
            overlayHost = chosen;
            saveServerHost(chosen);
            console.log(`\n\x1b[32m[Saved Server URL]\x1b[0m ${chosen}\n`);
            pollLoop();
        });
    } else {
        console.log(`[Bridge] Target Overlay Server: ${overlayHost}`);
        console.log(`[Bridge] Looking for Valorant Client Lockfile at:\n         ${LOCKFILE_PATH}\n`);
        pollLoop();
    }
}

startBridge();
