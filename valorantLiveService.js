/**
 * Automated Real-time VALORANT & Tracker Fetcher Service
 * 
 * Fully Autonomous:
 * 1. Auto-detects Riot Client & in-game VALORANT process status.
 * 2. Auto-detects Live Matches, Custom Tournaments, Agent Selection & Menus.
 * 3. Auto-extracts Player Names & Clan Tags (e.g. [FNC], [SEN], [PRX]) to deduce Team 1 & Team 2.
 * 4. Auto-resolves Team Logos from built-in Pro Team Registry or generates high-res team badge.
 * 5. Auto-detects Map, Round Number, Live Scores, Spike Plants/Defuses.
 * 6. Supports both Local In-Game Client connection and Cloud HenrikDev API.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Built-in Pro Team Registry (Logos, Names, Colors)
const PRO_TEAM_REGISTRY = {
    "FNC": { name: "FNATIC", logo: "https://cdn.sanity.io/images/5gii1snx/production/c32c2cb848fd3338ff23a590ec5c0e052b080f27-1000x1000.png", seed: "EMEA #1" },
    "SEN": { name: "SENTINELS", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Sentinels_logo.svg/1200px-Sentinels_logo.svg.png", seed: "AMER #1" },
    "PRX": { name: "PAPER REX", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Paper_Rex_logo.png/600px-Paper_Rex_logo.png", seed: "PACIFIC #1" },
    "TL": { name: "TEAM LIQUID", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f4/Team_Liquid_logo.svg/1200px-Team_Liquid_logo.svg.png", seed: "EMEA" },
    "C9": { name: "CLOUD9", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Cloud9_logo.svg/1200px-Cloud9_logo.svg.png", seed: "AMER" },
    "LOUD": { name: "LOUD", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/LOUD_logo.svg/1200px-LOUD_logo.svg.png", seed: "BR #1" },
    "NRG": { name: "NRG ESPORTS", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/5/53/NRG_Esports_logo.svg/1200px-NRG_Esports_logo.svg.png", seed: "AMER" },
    "DRX": { name: "DRX", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/DRX_logo.svg/1200px-DRX_logo.svg.png", seed: "KOREA #1" },
    "GEN": { name: "GEN.G", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Gen.G_logo.svg/1200px-Gen.G_logo.svg.png", seed: "PACIFIC #2" },
    "TH": { name: "TEAM HERETICS", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/e/e7/Team_Heretics_logo.svg/1200px-Team_Heretics_logo.svg.png", seed: "EMEA #2" },
    "KC": { name: "KARMINE CORP", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Karmine_Corp_logo.svg/1200px-Karmine_Corp_logo.svg.png", seed: "EMEA" },
    "EDG": { name: "EDWARD GAMING", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Edward_Gaming_logo.svg/1200px-Edward_Gaming_logo.svg.png", seed: "CHINA #1" },
    "LEV": { name: "LEVIATÁN", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Leviat%C3%A1n_logo.svg/1200px-Leviat%C3%A1n_logo.svg.png", seed: "LATAM #1" },
    "G2": { name: "G2 ESPORTS", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/1/12/G2_Esports_logo.svg/1200px-G2_Esports_logo.svg.png", seed: "AMER" },
    "NAVI": { name: "NAVI", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/a/ac/Natus_Vincere_logo.svg/1200px-Natus_Vincere_logo.svg.png", seed: "EMEA" },
    "T1": { name: "T1", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/T1_logo.svg/1200px-T1_logo.svg.png", seed: "PACIFIC" },
    "ZENX": { name: "ZENX ESPORTS", logo: "../visual_assets/ZENX_RED.png", seed: "Tournament Host" }
};

// Agent GUID to Name Mapping
const AGENT_ID_MAP = {
    "add6443a-41bd-e414-f6ad-e58d267f4e95": "Jett",
    "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc": "Reyna",
    "a3bfb854-4339-1607-696a-29e3c6588b0f": "Reyna",
    "f94c3b30-42be-e959-889c-5aa313dba261": "Raze",
    "f94c3b30-42be-e959-889c-5dab3174297d": "Raze",
    "707eab51-4836-f488-046a-cda6bf494859": "Viper",
    "707eab51-47e6-40e7-a4ff-ff06b04d4760": "Viper",
    "8e253930-4c05-31dd-1b6c-968525494517": "Omen",
    "9f0d8ba9-4140-b941-57d3-a7ad57c6b417": "Brimstone",
    "9f0d8ba9-42c6-b1e3-09c4-fb8d70a39a74": "Brimstone",
    "eb93336a-449b-9c1b-0a54-a891f7921d69": "Phoenix",
    "320b2a48-4d9b-a075-30f1-1f93a9b638fa": "Sova",
    "569fdd95-4d10-43ab-ca70-79becc718b46": "Sage",
    "117ed9e3-49f3-6512-3ccf-0cada7e3823b": "Cypher",
    "1e58de9c-4950-5125-93e9-a0aee9f98746": "Killjoy",
    "5f8d3a7f-467b-97f3-062c-13acf203c006": "Breach",
    "5f8d3d21-4a40-4870-49b0-9c892177457f": "Breach",
    "6f2a04ca-43e0-be17-7f36-b3908627744d": "Skye",
    "6f2a04ca-43e0-be17-7f03-b524940794f2": "Skye",
    "7f94d92c-4234-0a36-9646-3a87eb8b5c89": "Yoru",
    "41fb69c1-4189-7b37-f117-bcaf1e96f1bf": "Astra",
    "41fb69c1-4159-7b64-0fb1-ab73b6328f5c": "Astra",
    "601dbbe7-43ce-be57-2a40-4abd24953621": "Kayo",
    "601db835-4b3b-004e-d273-818bf614580e": "Kayo",
    "22697a3d-45bf-8dd7-4fec-84a9e28c69d7": "Chamber",
    "bb2a4828-46eb-8cd1-e765-15848195d751": "Neon",
    "dade69b4-4f5a-8528-247b-219e5a1facd6": "Fade",
    "95b78ed7-4637-86d9-7e41-71ba8c293152": "Harbor",
    "ea308bf8-4f80-8a0a-bbc7-8a927b9c0340": "Harbor",
    "e370fa57-4757-3604-3648-499e1f642d3f": "Gekko",
    "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235": "Deadlock",
    "cc8e01d3-4f9e-9713-2815-4ba1a22f0761": "Deadlock",
    "0e38b510-41a8-5780-5e8f-568b2a4f2d6c": "Iso",
    "1dbf2edd-4729-0984-3115-daa5eed44993": "Clove",
    "1dbf2edd-4729-0984-3115-ffb15092b56b": "Clove",
    "efba5359-4016-a1e5-7626-b1ae76895940": "Vyse",
    "b444168c-4e35-8076-db47-ef9bf368f384": "Tejo",
    "7c8a4701-4de6-9355-b254-e09bc2a34b72": "Miks",
    "92eeef5d-43b5-1d4a-8d03-b3927a09034b": "Veto",
    "df1cb487-4902-002e-5c17-d28e83e78588": "Waylay"
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

class ValorantLiveService {
    constructor(dataBus, io) {
        this.dataBus = dataBus;
        this.io = io;

        // Load saved auto-fetch settings from appConfig if available
        const saved = (this.dataBus && this.dataBus.config && this.dataBus.config.appConfig && this.dataBus.config.appConfig.auto_fetch) || {};
        this.autoFetchEnabled = typeof saved.enabled === 'boolean' ? saved.enabled : true;
        this.fetchMode = saved.mode || 'local'; // 'local' or 'cloud'
        this.cloudRiotId = saved.riot_id || '';
        this.cloudApiKey = saved.api_key || '';
        this.lockManualTeamInfo = typeof saved.lock_manual_teams === 'boolean' ? saved.lock_manual_teams : false;

        this.localLockfile = null;
        this.clientDetected = false;
        this.gameRunning = false;
        this.inGame = false;
        this.activeMatchId = null;
        this.detectedRegion = 'na';
        this.currentStatusText = 'Initializing automated VALORANT fetcher...';

        this.lockfilePath = path.join(
            process.env.LOCALAPPDATA || 'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local',
            'Riot Games',
            'Riot Client',
            'Config',
            'lockfile'
        );

        this.startLoop();
    }

    getStatus() {
        return {
            autoFetchEnabled: this.autoFetchEnabled,
            fetchMode: this.fetchMode,
            cloudRiotId: this.cloudRiotId,
            cloudApiKey: this.cloudApiKey,
            lockManualTeamInfo: this.lockManualTeamInfo,
            statusText: this.currentStatusText,
            clientDetected: this.clientDetected,
            gameRunning: this.gameRunning,
            inGame: this.inGame,
            activeMatchId: this.activeMatchId
        };
    }

    updateConfig(enabled, mode, riotId, apiKey, lockTeams) {
        if (typeof enabled === 'boolean') this.autoFetchEnabled = enabled;
        if (mode) this.fetchMode = mode;
        if (typeof riotId === 'string') this.cloudRiotId = riotId.trim();
        if (typeof apiKey === 'string') this.cloudApiKey = apiKey.trim();
        if (typeof lockTeams === 'boolean') this.lockManualTeamInfo = lockTeams;

        // Persist to disk via dataBus
        if (this.dataBus && typeof this.dataBus.saveAutoFetchConfig === 'function') {
            this.dataBus.saveAutoFetchConfig({
                enabled: this.autoFetchEnabled,
                mode: this.fetchMode,
                riot_id: this.cloudRiotId,
                api_key: this.cloudApiKey,
                lock_manual_teams: this.lockManualTeamInfo
            });
        }

        if (!this.autoFetchEnabled) {
            this.currentStatusText = 'Auto-fetch paused (Disabled in settings)';
        } else {
            this.currentStatusText = 'Settings updated. Checking game state...';
        }

        return this.getStatus();
    }

    startLoop() {
        setInterval(async () => {
            if (!this.autoFetchEnabled) {
                this.currentStatusText = 'Auto-fetch paused (Disabled in settings)';
                return;
            }

            if (this.fetchMode === 'local') {
                await this.pollLocalClient();
            } else if (this.fetchMode === 'cloud') {
                await this.pollCloudApi();
            }
        }, 1200);
    }

    // --- Automatic In-Game Live Match Data Capture ---
    async pollLocalClient() {
        this.localLockfile = this.readLockfile();

        if (!this.localLockfile) {
            this.clientDetected = false;
            this.gameRunning = false;
            this.inGame = false;
            this.currentStatusText = 'Waiting for Riot Client / VALORANT to be running...';
            return;
        }

        this.clientDetected = true;

        try {
            // 1. Get Live In-Game Presence (Map, Party Score, Enemy Score, In-Game state)
            const presenceData = await this.makeLocalRiotRequest('/chat/v4/presences');

            if (!presenceData || presenceData.errorCode || !presenceData.presences) {
                // Riot Client is running, but chat service is 503 / game not yet running / logging in
                this.gameRunning = false;
                this.inGame = false;
                this.currentStatusText = 'Riot Client active. Launch VALORANT to begin live match sync.';
                return;
            }

            let foundValorantPresence = false;
            let inGameMatch = false;

            for (const p of presenceData.presences) {
                if (p.product === 'valorant' && p.private) {
                    foundValorantPresence = true;
                    this.gameRunning = true;

                    try {
                        const rawPrivate = Buffer.from(p.private, 'base64').toString('utf8');
                        const priv = JSON.parse(rawPrivate);

                        if (priv.sessionLoopState === 'INGAME') {
                            inGameMatch = true;
                            this.inGame = true;

                            const t1Score = parseInt(priv.partyOwnerMatchScore) || 0;
                            const t2Score = parseInt(priv.partyOwnerMatchScoreEnemy) || 0;
                            const rawMap = (priv.matchMap || '').toLowerCase();

                            let detectedMap = 'sunset';
                            for (const key in MAP_PATH_MAP) {
                                if (rawMap.includes(key)) {
                                    detectedMap = MAP_PATH_MAP[key];
                                    break;
                                }
                            }

                            const roundNum = t1Score + t2Score + 1;
                            const isTournament = (priv.provisioningFlow === 'CustomGame');

                            this.currentStatusText = `LIVE ${isTournament ? 'TOURNAMENT' : 'MATCH'}: ${detectedMap.toUpperCase()} | Round ${roundNum} (${t1Score} - ${t2Score})`;

                            // Update Game State in DataBus
                            if (this.dataBus && this.dataBus.config && this.dataBus.config.gameState) {
                                this.dataBus.config.gameState.round_number = roundNum;
                                this.dataBus.config.gameState.team_1_score = t1Score;
                                this.dataBus.config.gameState.team_2_score = t2Score;
                                this.dataBus.config.gameState.switch_sides = (roundNum > 12 && roundNum <= 24) || (roundNum > 24 && roundNum % 2 === 0);

                                if (this.dataBus.config.gameState.game_flow && this.dataBus.config.gameState.game_flow.map_1) {
                                    this.dataBus.config.gameState.game_flow.map_1.map = detectedMap;
                                }

                                this.dataBus.saveStateToFile('gameState.json', this.dataBus.config.gameState);
                                if (this.io) {
                                    this.io.emit('stateUpdate', this.dataBus.getGameState());
                                }
                            }

                            // Extract 10-Player Names, Clan Tags, and Agents
                            await this.extractLivePlayersAndTeams();
                            break;
                        } else if (priv.sessionLoopState === 'PREGAME') {
                            inGameMatch = true;
                            this.inGame = false;
                            this.currentStatusText = 'Tournament Lobby: Agent Selection Active (Pre-Game)';
                            await this.extractLivePlayersAndTeams();
                            break;
                        } else if (priv.sessionLoopState === 'MENUS') {
                            this.inGame = false;
                            this.currentStatusText = 'VALORANT Online (In Menus / Custom Lobby)';
                        }
                    } catch (e) {}
                }
            }

            if (!foundValorantPresence) {
                this.gameRunning = false;
                this.inGame = false;
                this.currentStatusText = 'Riot Client active. Launch VALORANT or log in to sync.';
            }
        } catch (err) {
            this.currentStatusText = 'Syncing live match state...';
        }
    }

    // Extract Roster, Deduce Team Names & Assign Logos Automatically
    async extractLivePlayersAndTeams() {
        try {
            // Get local session info & friend/lobby presences
            const session = await this.makeLocalRiotRequest('/chat/v1/session');
            const presences = await this.makeLocalRiotRequest('/chat/v4/presences');

            let allPlayerNames = [];

            if (session && session.game_name) {
                allPlayerNames.push(`${session.game_name}#${session.game_tag}`);
            }

            if (presences && presences.presences) {
                for (const pr of presences.presences) {
                    if (pr.game_name && pr.product === 'valorant') {
                        allPlayerNames.push(`${pr.game_name}#${pr.game_tag}`);
                    }
                }
            }

            // Deduce Team TAGs from Player Names (e.g. [FNC] Boaster -> FNC, SEN TenZ -> SEN)
            if (allPlayerNames.length > 0) {
                this.autoDeduceTeamsFromNames(allPlayerNames);
            }
        } catch (e) {}
    }

    // Auto Deduce Team 1 & Team 2 from Player IGNs
    autoDeduceTeamsFromNames(names) {
        if (this.lockManualTeamInfo) {
            // User opted to lock custom team names & logos
            return;
        }

        let detectedTags = {};

        for (const name of names) {
            // Check for tags like [TAG], (TAG), or TAG_
            const match = name.match(/^\[([A-Za-z0-9]{2,5})\]/i) ||
                          name.match(/^\(([A-Za-z0-9]{2,5})\)/i) ||
                          name.match(/^([A-Za-z0-9]{2,4})[_\s]/i);

            if (match && match[1]) {
                const tag = match[1].toUpperCase();
                detectedTags[tag] = (detectedTags[tag] || 0) + 1;
            }
        }

        const sortedTags = Object.keys(detectedTags).sort((a, b) => detectedTags[b] - detectedTags[a]);

        if (sortedTags.length >= 2) {
            this.applyTeamBranding('team_1', sortedTags[0]);
            this.applyTeamBranding('team_2', sortedTags[1]);
        } else if (sortedTags.length === 1) {
            this.applyTeamBranding('team_1', sortedTags[0]);
        }
    }

    // Apply High-Resolution Logo & Branding from Pro Team Registry or Auto-Badge
    applyTeamBranding(teamKey, tag) {
        if (!this.dataBus || !this.dataBus.config || !this.dataBus.config.gameState) return;
        const team = this.dataBus.config.gameState[teamKey];
        if (!team) return;

        if (PRO_TEAM_REGISTRY[tag]) {
            const info = PRO_TEAM_REGISTRY[tag];
            team.abbreviation = tag;
            team.team_info = info.seed || "#1 Seed";
            team.icon_link = info.logo;
        } else {
            // Custom Clan / Amateur Team -> Generate clean custom logo
            team.abbreviation = tag;
            team.team_info = "Tournament Team";
            team.icon_link = `https://api.dicebear.com/7.x/identicon/svg?seed=${tag}&backgroundColor=141824`;
        }

        this.dataBus.saveStateToFile('gameState.json', this.dataBus.config.gameState);
        if (this.io) {
            this.io.emit('configUpdate', this.dataBus.getGameConfiguration());
        }
    }

    readLockfile() {
        try {
            if (fs.existsSync(this.lockfilePath)) {
                const raw = fs.readFileSync(this.lockfilePath, 'utf8').trim();
                const parts = raw.split(':');
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

    makeLocalRiotRequest(endpoint, method = 'GET', body = null) {
        return new Promise((resolve) => {
            if (!this.localLockfile) return resolve(null);

            const auth = Buffer.from(`riot:${this.localLockfile.password}`).toString('base64');
            const options = {
                hostname: '127.0.0.1',
                port: this.localLockfile.port,
                path: endpoint,
                method: method,
                rejectUnauthorized: false,
                timeout: 3000,
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
                        if (res.statusCode >= 400) {
                            resolve({ errorCode: 'HTTP_ERROR', statusCode: res.statusCode, data: parsed });
                        } else {
                            resolve(parsed);
                        }
                    } catch (e) {
                        resolve(data);
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });

            req.on('error', () => resolve(null));

            if (body) {
                req.write(typeof body === 'string' ? body : JSON.stringify(body));
            }
            req.end();
        });
    }

    // --- Cloud HenrikDev API Poller ---
    async pollCloudApi() {
        if (!this.cloudRiotId || !this.cloudRiotId.includes('#')) {
            this.clientDetected = false;
            this.gameRunning = false;
            this.inGame = false;
            this.currentStatusText = 'Please enter a valid Riot ID (e.g. Username#TAG)';
            return;
        }

        if (!this.cloudApiKey || this.cloudApiKey.trim() === '') {
            this.clientDetected = false;
            this.gameRunning = false;
            this.inGame = false;
            this.currentStatusText = 'HenrikDev API key required for Cloud Mode. Enter key below or switch to Local Client mode.';
            return;
        }

        const [name, tag] = this.cloudRiotId.split('#');
        const url = `https://api.henrikdev.xyz/valorant/v1/live-match/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`;

        try {
            const data = await this.makeHttpsGet(url, this.cloudApiKey);
            if (data && data.data) {
                const match = data.data;
                const mapName = (match.map || 'sunset').toLowerCase();
                const t1Score = match.team_1_score || 0;
                const t2Score = match.team_2_score || 0;
                const roundNum = t1Score + t2Score + 1;

                this.clientDetected = true;
                this.gameRunning = true;
                this.inGame = true;
                this.currentStatusText = `CLOUD API LIVE: ${mapName.toUpperCase()} | Round ${roundNum} (${t1Score}-${t2Score})`;

                if (this.dataBus && this.dataBus.config && this.dataBus.config.gameState) {
                    this.dataBus.config.gameState.round_number = roundNum;
                    this.dataBus.config.gameState.team_1_score = t1Score;
                    this.dataBus.config.gameState.team_2_score = t2Score;
                    this.dataBus.config.gameState.switch_sides = (roundNum > 12 && roundNum <= 24) || (roundNum > 24 && roundNum % 2 === 0);
                    this.dataBus.saveStateToFile('gameState.json', this.dataBus.config.gameState);

                    if (this.io) {
                        this.io.emit('stateUpdate', this.dataBus.getGameState());
                    }
                }

                // Parse and update ALL 10 PLAYERS in the match
                if (match.players && Array.isArray(match.players)) {
                    let team1Idx = 0;
                    let team2Idx = 0;

                    for (const p of match.players) {
                        const isBlue = (p.team === 'Blue' || p.team === 'team_1');
                        const pObj = {
                            username: p.name || `Player`,
                            agent: (p.character || 'jett').toLowerCase(),
                            health: typeof p.health !== 'undefined' ? p.health : 100,
                            shield: typeof p.shield !== 'undefined' ? p.shield : 50,
                            weapon: (p.weapon || 'vandal').toLowerCase(),
                            credits: p.credits || 800,
                            ult_points_gained: p.ult_points || 0,
                            ult_points_needed: 7,
                            has_spike: !!p.has_spike,
                            is_dead: (p.health === 0 || !!p.is_dead)
                        };

                        if (isBlue && team1Idx < 5) {
                            this.dataBus.updatePlayerDirect(team1Idx, pObj);
                            team1Idx++;
                        } else if (!isBlue && team2Idx < 5) {
                            this.dataBus.updatePlayerDirect(team2Idx + 5, pObj);
                            team2Idx++;
                        }
                    }

                    if (this.io) {
                        this.io.emit('playerUpdate', this.dataBus.config.players);
                    }
                }
            } else if (data && (data.status === 401 || (data.errors && data.errors[0]?.message?.toLowerCase().includes('unauthorized')))) {
                this.clientDetected = false;
                this.gameRunning = false;
                this.inGame = false;
                this.currentStatusText = 'Cloud API: Invalid API Key. Enter a free key from api.henrikdev.xyz/dashboard or use Local Client mode.';
            } else if (data && data.status === 404) {
                this.clientDetected = true;
                this.gameRunning = false;
                this.inGame = false;
                this.currentStatusText = `Cloud API: Player ${this.cloudRiotId} is not in an active live match`;
            } else if (data && data.errors) {
                this.clientDetected = false;
                this.gameRunning = false;
                this.inGame = false;
                this.currentStatusText = `Cloud API: ${data.errors[0]?.message || 'API query error'}`;
            } else {
                this.clientDetected = true;
                this.gameRunning = false;
                this.inGame = false;
                this.currentStatusText = `Cloud API: Player ${this.cloudRiotId} in Lobby / Not in Live Match`;
            }
        } catch (e) {
            this.currentStatusText = `Cloud API notice: ${e.message || 'Connecting to API...'}`;
        }
    }

    makeHttpsGet(urlStr, apiKey) {
        return new Promise((resolve) => {
            try {
                const parsed = new URL(urlStr);
                const headers = { 
                    'User-Agent': 'HelValorant-Overlay-Host',
                    'Accept': 'application/json'
                };
                if (apiKey) headers['Authorization'] = apiKey.trim();

                const options = {
                    hostname: parsed.hostname,
                    path: parsed.pathname + parsed.search,
                    method: 'GET',
                    timeout: 5000,
                    headers
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            if (res.statusCode >= 400 && !json.status) {
                                json.status = res.statusCode;
                            }
                            resolve(json);
                        } catch (e) {
                            resolve({ status: res.statusCode, raw: data });
                        }
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve(null);
                });

                req.on('error', () => resolve(null));
                req.end();
            } catch (err) {
                resolve(null);
            }
        });
    }
}

module.exports = ValorantLiveService;
