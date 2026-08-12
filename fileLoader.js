const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

class fileLoader {
    constructor() {
        this.isInitialized = false;
        this.mapsAreLocked = false;
        this._adminPassword = null;
        this.configDir = null;

        this.config = {
            players: null,
            gameState: null,
            mapPicks: null,
            timer: null,
            tournament: null,
            casters: {
                caster_1: { name: "Ailyrr", handle: "@ailyrr", role: "Caster" },
                caster_2: { name: "Vanguard", handle: "@vanguard_val", role: "Analyst" },
                show_lower_third: false
            }
        };
    }

    init(configFilesLocation) {
        this.configDir = path.isAbsolute(configFilesLocation) 
            ? configFilesLocation 
            : path.join(__dirname, configFilesLocation);

        let errors = [];
        if (this.isInitialized) {
            console.log('fileLoader() | Files are already loaded into memory');
            return false;
        }

        try {
            // Helper to safely read JSON with default fallback
            const safeReadJson = (filename, defaultVal) => {
                const fullPath = path.join(this.configDir, filename);
                try {
                    if (fs.existsSync(fullPath)) {
                        const raw = fs.readFileSync(fullPath, 'utf8').trim();
                        if (raw) return JSON.parse(raw);
                    }
                } catch (e) {
                    console.warn(`[fileLoader] Warning loading ${filename}, using default:`, e.message);
                }
                this.saveStateToFile(filename, defaultVal);
                return defaultVal;
            };

            // Read players
            const defaultPlayers = {
                team_1: { name: "TEAM 1", tag: "T1", score: 0, logo: "../visual_assets/blueTeamPlaceholder.jpg" },
                team_2: { name: "TEAM 2", tag: "T2", score: 0, logo: "../visual_assets/redTeamPlaceholder.jpg" }
            };
            const players = safeReadJson('players.json', defaultPlayers);
            for (const key in players) {
                if (key.startsWith('player_')) {
                    players[key].last_updated = Date.now();
                }
            }
            this.config.players = players;

            // Read Game State
            this.config.gameState = safeReadJson('gameState.json', {
                tournament_stage: "Grand Finals",
                team_1: {
                    name: "TEAM 1",
                    abbreviation: "T1",
                    team_info: "#1 Seed",
                    icon_link: "../visual_assets/blueTeamPlaceholder.jpg"
                },
                team_2: {
                    name: "TEAM 2",
                    abbreviation: "T2",
                    team_info: "#2 Seed",
                    icon_link: "../visual_assets/redTeamPlaceholder.jpg"
                },
                team_1_score: 0,
                team_2_score: 0,
                round_number: 1,
                spike_down: false,
                switch_sides: false,
                round_over: false,
                game_flow: {}
            });

            if (!this.config.gameState.team_1) {
                this.config.gameState.team_1 = {
                    name: "TEAM 1",
                    abbreviation: "T1",
                    team_info: "#1 Seed",
                    icon_link: "../visual_assets/blueTeamPlaceholder.jpg"
                };
            }
            if (!this.config.gameState.team_2) {
                this.config.gameState.team_2 = {
                    name: "TEAM 2",
                    abbreviation: "T2",
                    team_info: "#2 Seed",
                    icon_link: "../visual_assets/redTeamPlaceholder.jpg"
                };
            }

            // Read Map Picks
            this.config.mapPicks = safeReadJson('mapPicks.json', {
                teams: ["TEAM 1", "TEAM 2"],
                picks: [
                    ["ascent", "ban"],
                    ["bind", "ban"],
                    ["haven", "attack"],
                    ["split", "attack"],
                    ["breeze", "ban"],
                    ["lotus", "ban"],
                    ["sunset", "attack"]
                ],
                series_type: "bo3"
            });

            // Read Timer
            this.config.timer = safeReadJson('timer.json', {
                timerRunning: false,
                current_time: 0,
                target_time: 0
            });

            // Read Tournament Data
            this.config.tournament = safeReadJson('tournamentData.json', {
                spreadsheetUrl: '',
                autoSync: false,
                syncInterval: 60,
                lastSync: null,
                tournamentName: 'ZENX VALORANT TOURNAMENT',
                teams: [],
                matches: []
            });

            // Read Admin Password & App Config
            const appConfig = safeReadJson('appConfig.json', {
                admin_key: "zenx",
                auto_fetch: {
                    enabled: true,
                    mode: "cloud",
                    riot_id: "MAD BASHA#BOSS",
                    api_key: "",
                    lock_manual_teams: false
                }
            });
            this.config.appConfig = appConfig;
            this._adminPassword = process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || appConfig.admin_key || 'zenx';

            this.isInitialized = true;
            this.syncPlayersFromTournamentTeams();
            console.info('fileLoader() | All Config Files Loaded into Memory Successfully!');
        } catch (err) {
            console.error('fileLoader() | Error loading config files:', err.message);
        }

        // Auto check for inactive external players
        setInterval(() => {
            this.checkForInactivePlayers();
        }, 15000);
    }

    saveStateToFile(filename, data) {
        if (!this.configDir) return;
        const filePath = path.join(this.configDir, filename);
        fs.writeFile(filePath, JSON.stringify(data, null, 4), (err) => {
            if (err) console.error(`Failed to save ${filename}:`, err);
        });
    }

    checkPassword(userInput) {
        if (!userInput || typeof userInput !== 'string') return false;
        const expected = String(this._adminPassword || 'zenx').trim();
        return expected === userInput.trim();
    }

    updateAdminPassword(newPassword) {
        this._adminPassword = newPassword.trim();
        if (!this.config.appConfig) this.config.appConfig = {};
        this.config.appConfig.admin_key = newPassword.trim();
        this.saveStateToFile('appConfig.json', this.config.appConfig);
        return true;
    }

    saveAutoFetchConfig(autoFetchConfig) {
        if (!this.config.appConfig) this.config.appConfig = {};
        this.config.appConfig.auto_fetch = {
            ...(this.config.appConfig.auto_fetch || {}),
            ...autoFetchConfig
        };
        this.saveStateToFile('appConfig.json', this.config.appConfig);
    }

    generateRandomUserToken() {
        return crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    }

    // --- Timer Logic ---
    setTimer(timeMiliseconds, description) {
        this.config.timer.time = timeMiliseconds;
        this.config.timer.description = description;
        this.config.timer.isOn = true;
        this.config.timer.startTime = Date.now();
        this.saveStateToFile('timer.json', this.config.timer);
    }

    stopTimer() {
        this.config.timer.isOn = false;
        this.saveStateToFile('timer.json', this.config.timer);
    }

    getTimer() {
        return {
            isOn: this.config.timer.isOn,
            time: this.config.timer.time,
            description: this.config.timer.description,
            startTime: this.config.timer.startTime || Date.now()
        };
    }

    // --- Team Setup Logic ---
    updateTeamInfo(team1Data, team2Data) {
        if (team1Data) {
            this.config.gameState.team_1 = {
                ...this.config.gameState.team_1,
                ...team1Data
            };
        }
        if (team2Data) {
            this.config.gameState.team_2 = {
                ...this.config.gameState.team_2,
                ...team2Data
            };
        }
        if (this.config.mapPicks) {
            this.config.mapPicks.teams = [
                this.config.gameState.team_1.abbreviation || 'T1',
                this.config.gameState.team_2.abbreviation || 'T2'
            ];
            this.saveStateToFile('mapPicks.json', this.config.mapPicks);
        }
        this.syncPlayersFromTournamentTeams();
        this.saveStateToFile('gameState.json', this.config.gameState);
        this.saveStateToFile('players.json', this.config.players);
    }

    getFormattedPlayerStats() {
        if (!this.config.players) return { status: false, team_1: { players: [] }, team_2: { players: [] } };
        const switchSides = this.config.gameState?.switch_sides || false;

        let res = {
            status: true,
            switch_teams: switchSides,
            team_1: {
                name: this.config.gameState?.team_1?.name || "TEAM 1",
                abbreviation: this.config.gameState?.team_1?.abbreviation || "T1",
                icon: this.config.gameState?.team_1?.icon_link || "../visual_assets/blueTeamPlaceholder.jpg",
                players: []
            },
            team_2: {
                name: this.config.gameState?.team_2?.name || "TEAM 2",
                abbreviation: this.config.gameState?.team_2?.abbreviation || "T2",
                icon: this.config.gameState?.team_2?.icon_link || "../visual_assets/redTeamPlaceholder.jpg",
                players: []
            }
        };

        for (let i = 0; i < 5; i++) {
            const key = `player_${i}`;
            const p = this.config.players[key] || {};
            const d = p.data || {};
            const playerObj = {
                index: i,
                name: d.name || d.username || `Player ${i + 1}`,
                username: d.username || d.name || `Player ${i + 1}`,
                agent: (d.agent || 'jett').toLowerCase(),
                health: typeof d.health !== 'undefined' ? d.health : 100,
                shield: typeof d.shield !== 'undefined' ? d.shield : 50,
                weapon: (d.weapon || 'vandal').toLowerCase(),
                credits: typeof d.credits !== 'undefined' ? d.credits : 800,
                kills: typeof d.kills !== 'undefined' ? d.kills : 0,
                deaths: typeof d.deaths !== 'undefined' ? d.deaths : 0,
                assists: typeof d.assists !== 'undefined' ? d.assists : 0,
                score: typeof d.score !== 'undefined' ? d.score : 0,
                alive: d.is_dead === false || d.alive === true,
                has_spike: !!d.has_spike,
                ult_points: typeof d.ult_points_gained !== 'undefined' ? d.ult_points_gained : (d.ult_points || 0),
                ult_max: typeof d.ult_points_needed !== 'undefined' ? d.ult_points_needed : (d.ult_max || 7),
                is_registered: !!p.is_registered
            };
            res.team_1.players.push(playerObj);
            res.team_1[`player_${i}`] = playerObj;
        }

        for (let i = 5; i < 10; i++) {
            const key = `player_${i}`;
            const p = this.config.players[key] || {};
            const d = p.data || {};
            const playerObj = {
                index: i,
                name: d.name || d.username || `Player ${i - 4}`,
                username: d.username || d.name || `Player ${i - 4}`,
                agent: (d.agent || 'sova').toLowerCase(),
                health: typeof d.health !== 'undefined' ? d.health : 100,
                shield: typeof d.shield !== 'undefined' ? d.shield : 50,
                weapon: (d.weapon || 'phantom').toLowerCase(),
                credits: typeof d.credits !== 'undefined' ? d.credits : 800,
                kills: typeof d.kills !== 'undefined' ? d.kills : 0,
                deaths: typeof d.deaths !== 'undefined' ? d.deaths : 0,
                assists: typeof d.assists !== 'undefined' ? d.assists : 0,
                score: typeof d.score !== 'undefined' ? d.score : 0,
                alive: d.is_dead === false || d.alive === true,
                has_spike: !!d.has_spike,
                ult_points: typeof d.ult_points_gained !== 'undefined' ? d.ult_points_gained : (d.ult_points || 0),
                ult_max: typeof d.ult_points_needed !== 'undefined' ? d.ult_points_needed : (d.ult_max || 7),
                is_registered: !!p.is_registered
            };
            res.team_2.players.push(playerObj);
            res.team_2[`player_${i - 5}`] = playerObj;
        }

        return res;
    }

    updatePlayerDirect(playerIndex, playerData) {
        const key = `player_${playerIndex}`;
        if (!this.config.players[key]) {
            this.config.players[key] = { is_registered: true, data: {} };
        }
        this.config.players[key].data = {
            ...this.config.players[key].data,
            ...playerData
        };
        if (typeof playerData.name !== 'undefined') this.config.players[key].data.username = playerData.name;
        if (typeof playerData.ult_points !== 'undefined') this.config.players[key].data.ult_points_gained = playerData.ult_points;
        if (typeof playerData.ult_max !== 'undefined') this.config.players[key].data.ult_points_needed = playerData.ult_max;
        if (typeof playerData.alive !== 'undefined') this.config.players[key].data.is_dead = !playerData.alive;

        this.config.players[key].last_updated = Date.now();
        this.saveStateToFile('players.json', this.config.players);
        return true;
    }

    syncPlayersFromTournamentTeams() {
        const tournament = this.getTournamentData();
        if (!tournament || !Array.isArray(tournament.teams) || tournament.teams.length === 0) return;

        const findTeam = (abbrOrName) => {
            if (!abbrOrName) return null;
            const clean = String(abbrOrName).trim().toUpperCase();
            return tournament.teams.find(t => 
                (t.tag && t.tag.toUpperCase() === clean) || 
                (t.name && t.name.toUpperCase() === clean) ||
                (t.name && t.name.toUpperCase().includes(clean)) ||
                (t.tag && clean.includes(t.tag.toUpperCase()))
            );
        };

        const t1Abbr = this.config.gameState?.team_1?.abbreviation || this.config.gameState?.team_1?.name;
        const t2Abbr = this.config.gameState?.team_2?.abbreviation || this.config.gameState?.team_2?.name;

        const team1Obj = findTeam(t1Abbr);
        const team2Obj = findTeam(t2Abbr);

        if (team1Obj) {
            if (team1Obj.logo && team1Obj.logo.trim() !== '') {
                this.config.gameState.team_1.icon_link = this.cleanLogoUrl(team1Obj.logo);
            }
            if (team1Obj.name) {
                this.config.gameState.team_1.name = team1Obj.name;
            }
            if (Array.isArray(team1Obj.players) && team1Obj.players.length > 0) {
                for (let i = 0; i < Math.min(5, team1Obj.players.length); i++) {
                    const key = `player_${i}`;
                    const rawPlayer = String(team1Obj.players[i]).trim();
                    const ign = rawPlayer.includes('#') ? rawPlayer.split('#')[0].trim() : rawPlayer;
                    const tag = rawPlayer.includes('#') ? rawPlayer.split('#')[1].trim() : '';
                    if (!this.config.players[key]) {
                        this.config.players[key] = {
                            token: this.generateRandomUserToken(),
                            is_registered: true,
                            last_updated: Date.now(),
                            data: {}
                        };
                    }
                    this.config.players[key].is_registered = true;
                    this.config.players[key].data = {
                        ...this.config.players[key].data,
                        username: ign,
                        name: ign,
                        tag: tag,
                        riot_id: rawPlayer,
                        is_registered: true
                    };
                }
            }
        }

        if (team2Obj) {
            if (team2Obj.logo && team2Obj.logo.trim() !== '') {
                this.config.gameState.team_2.icon_link = this.cleanLogoUrl(team2Obj.logo);
            }
            if (team2Obj.name) {
                this.config.gameState.team_2.name = team2Obj.name;
            }
            if (Array.isArray(team2Obj.players) && team2Obj.players.length > 0) {
                for (let i = 0; i < Math.min(5, team2Obj.players.length); i++) {
                    const key = `player_${i + 5}`;
                    const rawPlayer = String(team2Obj.players[i]).trim();
                    const ign = rawPlayer.includes('#') ? rawPlayer.split('#')[0].trim() : rawPlayer;
                    const tag = rawPlayer.includes('#') ? rawPlayer.split('#')[1].trim() : '';
                    if (!this.config.players[key]) {
                        this.config.players[key] = {
                            token: this.generateRandomUserToken(),
                            is_registered: true,
                            last_updated: Date.now(),
                            data: {}
                        };
                    }
                    this.config.players[key].is_registered = true;
                    this.config.players[key].data = {
                        ...this.config.players[key].data,
                        username: ign,
                        name: ign,
                        tag: tag,
                        riot_id: rawPlayer,
                        is_registered: true
                    };
                }
            }
        }
    }

    // --- Caster Lower Third Logic ---
    updateCasters(caster1, caster2, showLowerThird, autoLoop, duration, interval) {
        if (!this.config.casters) {
            this.config.casters = {
                caster_1: { name: 'Ailyrr', handle: '@ailyrr' },
                caster_2: { name: 'Vanguard', handle: '@vanguard_val' },
                show_lower_third: false,
                auto_loop: false,
                duration: 6000,
                interval: 30000
            };
        }
        if (caster1) this.config.casters.caster_1 = { ...this.config.casters.caster_1, ...caster1 };
        if (caster2) this.config.casters.caster_2 = { ...this.config.casters.caster_2, ...caster2 };
        if (typeof showLowerThird === 'boolean') this.config.casters.show_lower_third = showLowerThird;
        if (typeof autoLoop === 'boolean') this.config.casters.auto_loop = autoLoop;
        if (typeof duration === 'number') this.config.casters.duration = duration;
        if (typeof interval === 'number') this.config.casters.interval = interval;
        return this.config.casters;
    }

    getCasters() {
        return this.config.casters;
    }

    // --- Player Logic ---
    setRosterConfig(team1Size, team2Size, rosterMode = 'auto') {
        if (!this.config.gameState) this.config.gameState = {};
        if (typeof team1Size === 'number') this.config.gameState.team_1_count = Math.max(1, Math.min(5, team1Size));
        if (typeof team2Size === 'number') this.config.gameState.team_2_count = Math.max(1, Math.min(5, team2Size));
        if (rosterMode) this.config.gameState.roster_mode = rosterMode;
        this.saveStateToFile('gameState.json', this.config.gameState);
        return {
            team_1_count: this.config.gameState.team_1_count || 5,
            team_2_count: this.config.gameState.team_2_count || 5,
            roster_mode: this.config.gameState.roster_mode || 'auto'
        };
    }

    updateDynamicRoster(team1Players = [], team2Players = []) {
        const t1Count = team1Players.length;
        const t2Count = team2Players.length;

        if (!this.config.gameState) this.config.gameState = {};
        this.config.gameState.team_1_count = t1Count;
        this.config.gameState.team_2_count = t2Count;
        this.config.gameState.team_1_roster = team1Players;
        this.config.gameState.team_2_roster = team2Players;

        // Update Team 1 (Slots 0 to 4)
        for (let i = 0; i < 5; i++) {
            const key = `player_${i}`;
            if (!this.config.players[key]) {
                this.config.players[key] = {
                    token: this.generateRandomUserToken(),
                    is_registered: false,
                    last_updated: Date.now(),
                    data: {}
                };
            }
            if (i < t1Count) {
                this.config.players[key].data = {
                    ...this.config.players[key].data,
                    ...team1Players[i],
                    is_registered: true
                };
                this.config.players[key].is_registered = true;
                this.config.players[key].last_updated = Date.now();
            } else {
                this.config.players[key].is_registered = false;
            }
        }

        // Update Team 2 (Slots 5 to 9)
        for (let i = 0; i < 5; i++) {
            const key = `player_${i + 5}`;
            if (!this.config.players[key]) {
                this.config.players[key] = {
                    token: this.generateRandomUserToken(),
                    is_registered: false,
                    last_updated: Date.now(),
                    data: {}
                };
            }
            if (i < t2Count) {
                this.config.players[key].data = {
                    ...this.config.players[key].data,
                    ...team2Players[i],
                    is_registered: true
                };
                this.config.players[key].is_registered = true;
                this.config.players[key].last_updated = Date.now();
            } else {
                this.config.players[key].is_registered = false;
            }
        }

        this.saveStateToFile('players.json', this.config.players);
        this.saveStateToFile('gameState.json', this.config.gameState);
        return this.getFormattedPlayerStats();
    }

    getFormattedPlayerStats() {
        const switchTeams = (this.config.gameState && this.config.gameState.switch_sides) || false;
        const t1Count = (this.config.gameState && typeof this.config.gameState.team_1_count === 'number' && this.config.gameState.team_1_count > 0) 
            ? this.config.gameState.team_1_count 
            : 5;
        const t2Count = (this.config.gameState && typeof this.config.gameState.team_2_count === 'number' && this.config.gameState.team_2_count > 0) 
            ? this.config.gameState.team_2_count 
            : 5;

        const tournament = this.getTournamentData();
        const findTourneyTeam = (abbrOrName) => {
            if (!abbrOrName || !tournament || !Array.isArray(tournament.teams)) return null;
            const clean = String(abbrOrName).trim().toUpperCase();
            return tournament.teams.find(t => 
                (t.tag && t.tag.toUpperCase() === clean) || 
                (t.name && t.name.toUpperCase() === clean) ||
                (t.name && t.name.toUpperCase().includes(clean)) ||
                (t.tag && clean.includes(t.tag.toUpperCase()))
            );
        };

        const t1Obj = findTourneyTeam(this.config.gameState?.team_1?.abbreviation || this.config.gameState?.team_1?.name);
        const t2Obj = findTourneyTeam(this.config.gameState?.team_2?.abbreviation || this.config.gameState?.team_2?.name);

        const responseObj = {
            status: true,
            switch_teams: switchTeams,
            team_1_count: t1Count,
            team_2_count: t2Count,
            team_1: {},
            team_2: {},
            team_1_list: [],
            team_2_list: []
        };

        const defaultAgents1 = ['jett', 'sova', 'cypher', 'phoenix', 'omen'];
        const defaultAgents2 = ['omen', 'raze', 'viper', 'killjoy', 'fade'];

        for (let i = 0; i < t1Count; i++) {
            const key = `player_${i}`;
            const p = this.config.players[key] || {};
            const pDataRaw = p.data || p;

            let pName = pDataRaw.name || pDataRaw.username || '';
            let pTag = pDataRaw.tag || '';
            let pRiotId = pDataRaw.riot_id || '';

            // Auto-fetch from tournament roster if name is generic or missing
            if ((!pName || pName.match(/^Player\s*\d+$/i) || pName.match(/^T1\s*Player/i)) && t1Obj && Array.isArray(t1Obj.players) && t1Obj.players[i]) {
                const rawP = String(t1Obj.players[i]).trim();
                pName = rawP.includes('#') ? rawP.split('#')[0].trim() : rawP;
                pTag = rawP.includes('#') ? rawP.split('#')[1].trim() : '';
                pRiotId = rawP;
            }
            if (!pName) pName = `Player ${i + 1}`;

            const pData = {
                username: pName,
                name: pName,
                tag: pTag,
                riot_id: pRiotId,
                agent: (pDataRaw.agent || defaultAgents1[i % defaultAgents1.length]).toLowerCase(),
                health: typeof pDataRaw.health !== 'undefined' ? Number(pDataRaw.health) : 100,
                shield: typeof pDataRaw.shield !== 'undefined' ? Number(pDataRaw.shield) : 50,
                weapon: (pDataRaw.weapon || 'vandal').toLowerCase(),
                credits: typeof pDataRaw.credits !== 'undefined' ? Number(pDataRaw.credits) : 3900,
                ult_points_gained: typeof pDataRaw.ult_points_gained !== 'undefined' ? Number(pDataRaw.ult_points_gained) : 4,
                ult_points_needed: typeof pDataRaw.ult_points_needed !== 'undefined' ? Number(pDataRaw.ult_points_needed) : 7,
                c_util: pDataRaw.c_util !== false,
                q_util: pDataRaw.q_util !== false,
                e_util: pDataRaw.e_util !== false,
                x_util: !!pDataRaw.x_util,
                has_spike: !!pDataRaw.has_spike,
                is_dead: !!pDataRaw.is_dead || (typeof pDataRaw.health !== 'undefined' && Number(pDataRaw.health) <= 0),
                is_registered: true,
                puuid: pDataRaw.puuid || `p${i + 1}`,
                kills: typeof pDataRaw.kills !== 'undefined' ? Number(pDataRaw.kills) : undefined,
                deaths: typeof pDataRaw.deaths !== 'undefined' ? Number(pDataRaw.deaths) : undefined,
                assists: typeof pDataRaw.assists !== 'undefined' ? Number(pDataRaw.assists) : undefined,
                kda: pDataRaw.kda || (typeof pDataRaw.kills !== 'undefined' ? `${pDataRaw.kills || 0}/${pDataRaw.deaths || 0}/${pDataRaw.assists || 0}` : undefined),
                is_spectated: !!pDataRaw.is_spectated
            };
            responseObj.team_1[key] = pData;
            responseObj.team_1_list.push(pData);
        }

        for (let i = 0; i < t2Count; i++) {
            const key = `player_${i + 5}`;
            const subKey = `player_${i}`;
            const p = this.config.players[key] || {};
            const pDataRaw = p.data || p;

            let pName = pDataRaw.name || pDataRaw.username || '';
            let pTag = pDataRaw.tag || '';
            let pRiotId = pDataRaw.riot_id || '';

            // Auto-fetch from tournament roster if name is generic or missing
            if ((!pName || pName.match(/^Player\s*\d+$/i) || pName.match(/^T2\s*Player/i)) && t2Obj && Array.isArray(t2Obj.players) && t2Obj.players[i]) {
                const rawP = String(t2Obj.players[i]).trim();
                pName = rawP.includes('#') ? rawP.split('#')[0].trim() : rawP;
                pTag = rawP.includes('#') ? rawP.split('#')[1].trim() : '';
                pRiotId = rawP;
            }
            if (!pName) pName = `Player ${i + 6}`;

            const pData = {
                username: pName,
                name: pName,
                tag: pTag,
                riot_id: pRiotId,
                agent: (pDataRaw.agent || defaultAgents2[i % defaultAgents2.length]).toLowerCase(),
                health: typeof pDataRaw.health !== 'undefined' ? Number(pDataRaw.health) : 100,
                shield: typeof pDataRaw.shield !== 'undefined' ? Number(pDataRaw.shield) : 50,
                weapon: (pDataRaw.weapon || 'vandal').toLowerCase(),
                credits: typeof pDataRaw.credits !== 'undefined' ? Number(pDataRaw.credits) : 3900,
                ult_points_gained: typeof pDataRaw.ult_points_gained !== 'undefined' ? Number(pDataRaw.ult_points_gained) : 4,
                ult_points_needed: typeof pDataRaw.ult_points_needed !== 'undefined' ? Number(pDataRaw.ult_points_needed) : 7,
                c_util: pDataRaw.c_util !== false,
                q_util: pDataRaw.q_util !== false,
                e_util: pDataRaw.e_util !== false,
                x_util: !!pDataRaw.x_util,
                has_spike: !!pDataRaw.has_spike,
                is_dead: !!pDataRaw.is_dead || (typeof pDataRaw.health !== 'undefined' && Number(pDataRaw.health) <= 0),
                is_registered: true,
                puuid: pDataRaw.puuid || `p${i + 6}`,
                kills: typeof pDataRaw.kills !== 'undefined' ? Number(pDataRaw.kills) : undefined,
                deaths: typeof pDataRaw.deaths !== 'undefined' ? Number(pDataRaw.deaths) : undefined,
                assists: typeof pDataRaw.assists !== 'undefined' ? Number(pDataRaw.assists) : undefined,
                kda: pDataRaw.kda || (typeof pDataRaw.kills !== 'undefined' ? `${pDataRaw.kills || 0}/${pDataRaw.deaths || 0}/${pDataRaw.assists || 0}` : undefined),
                is_spectated: !!pDataRaw.is_spectated
            };
            responseObj.team_2[subKey] = pData;
            responseObj.team_2_list.push(pData);
        }

        return responseObj;
    }

    checkGameTokenValidity(gameToken) {
        for (const key in this.config.players) {
            if (key.startsWith("player_") && this.config.players[key].token == gameToken) {
                if (!this.config.players[key].is_registered) {
                    return { status: true, key: key };
                } else {
                    return { status: false, message: 'Token is already registered!' };
                }
            }
        }
        return { status: false, message: 'Token does not exist!' };
    }

    findPlayerKeyByToken(gameToken) {
        for (const key in this.config.players) {
            if (key.startsWith('player_') && this.config.players[key].token == gameToken) {
                return { status: true, key: key };
            }
        }
        return { status: false, message: 'Token does not exist!' };
    }

    updatePlayerData(playerDataObject) {
        let playerKey = this.findPlayerKeyByToken(playerDataObject.token);
        if (playerKey.status) {
            playerKey = playerKey.key;
            if (this.config.players[playerKey].is_registered) {
                this.config.players[playerKey].data = {
                    ...this.config.players[playerKey].data,
                    ...playerDataObject
                };
                this.config.players[playerKey].last_updated = Date.now();
                return true;
            }
        }
        return false;
    }

    updatePlayerDirect(playerIndex, playerData) {
        const key = `player_${playerIndex}`;
        if (!this.config.players[key]) {
            this.config.players[key] = {
                token: this.generateRandomUserToken(),
                is_registered: true,
                last_updated: Date.now(),
                data: {}
            };
        }
        this.config.players[key].data = {
            ...this.config.players[key].data,
            ...playerData
        };
        this.config.players[key].is_registered = true;
        this.config.players[key].last_updated = Date.now();
        this.saveStateToFile('players.json', this.config.players);
        return true;
    }

    regeneratePlayerTokens() {
        for (const key in this.config.players) {
            if (key.startsWith('player_')) {
                this.config.players[key].token = this.generateRandomUserToken();
            }
        }
        this.saveStateToFile('players.json', this.config.players);
        console.log('Regenerated all player tokens');
        return this.config.players;
    }

    // --- Game Logic ---
    getGameConfiguration() {
        return {
            tournament_stage: this.config.gameState.tournament_stage || "2026 AMERICAS STAGE 2 : WEEK 4",
            team_1: this.config.gameState.team_1 || {
                name: (this.config.mapPicks?.teams && this.config.mapPicks.teams[0]) || "TEAM 1",
                abbreviation: (this.config.mapPicks?.teams && this.config.mapPicks.teams[0]) || "T1",
                team_info: "#1 Seed",
                icon_link: "../visual_assets/blueTeamPlaceholder.jpg"
            },
            team_2: this.config.gameState.team_2 || {
                name: (this.config.mapPicks?.teams && this.config.mapPicks.teams[1]) || "TEAM 2",
                abbreviation: (this.config.mapPicks?.teams && this.config.mapPicks.teams[1]) || "T2",
                team_info: "#2 Seed",
                icon_link: "../visual_assets/redTeamPlaceholder.jpg"
            },
            game_flow: this.config.gameState.game_flow,
            team_1_score: this.config.gameState.team_1_score,
            team_2_score: this.config.gameState.team_2_score,
            round_number: this.config.gameState.round_number,
            spike_down: this.config.gameState.spike_down,
            switch_sides: this.config.gameState.switch_sides || false,
            mapPicks: this.config.mapPicks,
            team_1_count: this.config.gameState.team_1_count || 5,
            team_2_count: this.config.gameState.team_2_count || 5,
            roster_mode: this.config.gameState.roster_mode || 'auto'
        };
    }

    getGameState() {
        let roundOver = false;
        if (this.config.gameState.round_over) {
            roundOver = true;
            this.config.gameState.round_over = false;
        }
        return {
            tournament_stage: this.config.gameState.tournament_stage || "2026 AMERICAS STAGE 2 : WEEK 4",
            round_number: this.config.gameState.round_number,
            spike_down: this.config.gameState.spike_down,
            round_over: roundOver,
            team_1_score: this.config.gameState.team_1_score,
            team_2_score: this.config.gameState.team_2_score,
            team_1: this.config.gameState.team_1,
            team_2: this.config.gameState.team_2,
            switch_sides: this.config.gameState.switch_sides || false,
            game_flow: this.config.gameState.game_flow
        };
    }

    // --- Map Pick & Series Format Logic ---
    setSeriesFormat(format) {
        if (!this.config.mapPicks) {
            this.config.mapPicks = { teams: ['TEAM 1', 'TEAM 2'], picks: [], series_type: 'bo3' };
        }
        
        const t1 = (this.config.gameState.team_1 && this.config.gameState.team_1.abbreviation) ? this.config.gameState.team_1.abbreviation : 'T1';
        const t2 = (this.config.gameState.team_2 && this.config.gameState.team_2.abbreviation) ? this.config.gameState.team_2.abbreviation : 'T2';
        this.config.mapPicks.teams = [t1, t2];
        this.config.mapPicks.series_type = format;

        if (format === 'bo1') {
            // Best of 1: 6 bans + 1 decider game (Total 1 Game)
            this.config.mapPicks.picks = [
                ['ascent', 'ban'],
                ['bind', 'ban'],
                ['haven', 'ban'],
                ['split', 'ban'],
                ['breeze', 'ban'],
                ['lotus', 'ban'],
                ['sunset', 'attack']
            ];
        } else if (format === 'bo5') {
            // Best of 5: 2 bans + 4 picks + 1 decider (Total 5 Games)
            this.config.mapPicks.picks = [
                ['bind', 'ban'],
                ['ascent', 'ban'],
                ['breeze', 'attack'],
                ['haven', 'defense'],
                ['split', 'attack'],
                ['pearl', 'defense'],
                ['sunset', 'attack']
            ];
        } else {
            // Default Best of 3: 4 bans + 2 picks + 1 decider (Total 3 Games)
            this.config.mapPicks.series_type = 'bo3';
            this.config.mapPicks.picks = [
                ['bind', 'ban'],
                ['ascent', 'ban'],
                ['breeze', 'attack'],
                ['haven', 'defense'],
                ['split', 'ban'],
                ['lotus', 'ban'],
                ['sunset', 'attack']
            ];
        }

        this.reCalculateMapFlow();
        this.saveStateToFile('mapPicks.json', this.config.mapPicks);
        return this.config.mapPicks;
    }

    applyMapBanData(mapBanData) {
        if (!mapBanData) return false;

        if (!this.config.mapPicks) {
            this.config.mapPicks = { teams: ['TEAM 1', 'TEAM 2'], picks: [], series_type: 'bo3' };
        }

        // Determine series format if available
        let bo = mapBanData.bo || mapBanData.bestOf || (mapBanData.lobby ? mapBanData.lobby.bo : null);
        if (bo === 1 || bo === '1' || bo === 'bo1') this.config.mapPicks.series_type = 'bo1';
        else if (bo === 5 || bo === '5' || bo === 'bo5') this.config.mapPicks.series_type = 'bo5';
        else this.config.mapPicks.series_type = 'bo3';

        // Extract team names if available
        let teamNames = [];
        if (Array.isArray(mapBanData.teams) && mapBanData.teams.length >= 2) {
            const t1 = typeof mapBanData.teams[0] === 'object' ? mapBanData.teams[0]?.name : mapBanData.teams[0];
            const t2 = typeof mapBanData.teams[1] === 'object' ? mapBanData.teams[1]?.name : mapBanData.teams[1];
            if (t1 && String(t1).trim()) teamNames[0] = String(t1).trim();
            if (t2 && String(t2).trim()) teamNames[1] = String(t2).trim();
        } else if (Array.isArray(mapBanData.teamNames) && mapBanData.teamNames.length >= 2) {
            if (mapBanData.teamNames[0]) teamNames[0] = String(mapBanData.teamNames[0]).trim();
            if (mapBanData.teamNames[1]) teamNames[1] = String(mapBanData.teamNames[1]).trim();
        } else if (mapBanData.lobby && Array.isArray(mapBanData.lobby.teamNames) && mapBanData.lobby.teamNames.length >= 2) {
            if (mapBanData.lobby.teamNames[0]) teamNames[0] = String(mapBanData.lobby.teamNames[0]).trim();
            if (mapBanData.lobby.teamNames[1]) teamNames[1] = String(mapBanData.lobby.teamNames[1]).trim();
        }

        if (teamNames[0] || teamNames[1]) {
            const currentTeams = this.config.mapPicks.teams || ['TEAM 1', 'TEAM 2'];
            this.config.mapPicks.teams = [
                teamNames[0] || currentTeams[0] || 'TEAM 1',
                teamNames[1] || currentTeams[1] || 'TEAM 2'
            ];
            if (this.config.gameState && this.config.gameState.team_1 && teamNames[0]) {
                this.config.gameState.team_1.abbreviation = teamNames[0];
            }
            if (this.config.gameState && this.config.gameState.team_2 && teamNames[1]) {
                this.config.gameState.team_2.abbreviation = teamNames[1];
            }
        }

        // Extract picks and bans from bans array, logs, or picks array
        let rawItems = [];
        if (Array.isArray(mapBanData.bans) && mapBanData.bans.length > 0) {
            rawItems = mapBanData.bans;
        } else if (Array.isArray(mapBanData.log) && mapBanData.log.length > 0) {
            rawItems = mapBanData.log;
        } else if (Array.isArray(mapBanData.logs) && mapBanData.logs.length > 0) {
            rawItems = mapBanData.logs;
        } else if (Array.isArray(mapBanData.picks) && mapBanData.picks.length > 0) {
            rawItems = mapBanData.picks;
        } else if (Array.isArray(mapBanData.events) && mapBanData.events.length > 0) {
            rawItems = mapBanData.events;
        }

        if (rawItems.length > 0) {
            let parsedPicks = [];
            for (let i = 0; i < rawItems.length; i++) {
                const item = rawItems[i];
                if (!item) continue;

                let mapName = '';
                let action = 'ban';

                if (Array.isArray(item)) {
                    mapName = (item[0] || 'ascent').toLowerCase();
                    action = (item[1] || 'ban').toLowerCase();
                } else if (typeof item === 'object') {
                    mapName = (item.map || item.mapName || item.mapId || item.name || '').toLowerCase();

                    let votetype = (item.votetype || item.type || item.action || '').toLowerCase();
                    let status = Number(item.status);
                    let side = (item.side || item.selectedSide || '').toLowerCase();
                    let teamPickedSide = item.teamPickedSide;
                    let teamSides = item.teamSides;

                    // If map is not yet selected in MapBan, fallback to existing slot or default
                    if (!mapName) {
                        if (this.config.mapPicks.picks && this.config.mapPicks.picks[i] && this.config.mapPicks.picks[i][0]) {
                            mapName = this.config.mapPicks.picks[i][0].toLowerCase();
                        } else {
                            const defaultMaps = ['ascent', 'bind', 'haven', 'split', 'breeze', 'lotus', 'sunset'];
                            mapName = defaultMaps[i % defaultMaps.length];
                        }
                    }

                    if (votetype.includes('ban') || status === 1 || status === 2 || status === 20) {
                        action = 'ban';
                    } else if (votetype.includes('pick') || votetype.includes('decider') || status === 3 || status === 4 || status === 5) {
                        if (side.includes('def') || side.includes('defense')) {
                            action = 'defense';
                        } else if (side.includes('atk') || side.includes('attack')) {
                            action = 'attack';
                        } else if (teamPickedSide !== null && teamPickedSide !== undefined && Array.isArray(teamSides)) {
                            action = teamSides[teamPickedSide] === 1 ? 'defense' : 'attack';
                        } else if (teamPickedSide === 1) {
                            action = 'defense';
                        } else {
                            action = 'attack';
                        }
                    } else {
                        action = 'ban';
                    }
                }

                if (mapName) {
                    parsedPicks.push([mapName, action]);
                }
            }

            if (parsedPicks.length > 0) {
                this.config.mapPicks.picks = parsedPicks;
            }
        }

        this.reCalculateMapFlow();
        this.saveStateToFile('mapPicks.json', this.config.mapPicks);
        this.saveStateToFile('gameState.json', this.config.gameState);
        return this.config.mapPicks;
    }

    updateMapPick(targetIndex, map, action) {
        if (!this.config.mapPicks.picks[targetIndex]) {
            this.config.mapPicks.picks[targetIndex] = [];
        }
        this.config.mapPicks.picks[targetIndex] = [map, action];
        this.reCalculateMapFlow();
        this.saveStateToFile('mapPicks.json', this.config.mapPicks);
    }

    reCalculateMapFlow() {
        let chosenMaps = [];
        const picks = this.config.mapPicks.picks || [];
        for (let i = 0; i < picks.length; i++) {
            const item = picks[i];
            if (item && item[1] !== 'ban') {
                let mapChosenByTeam = (i % 2 === 0) ? 'team_1' : 'team_2';
                // If it's the last pick in the veto sequence, it's typically the Decider map
                if (i === picks.length - 1) {
                    mapChosenByTeam = '';
                }
                chosenMaps.push([item[0], item[1], mapChosenByTeam, 'upcomming']);
            }
        }

        this.config.gameState.game_flow = {};
        for (let i = 0; i < chosenMaps.length; i++) {
            this.config.gameState.game_flow[`map_${i + 1}`] = {
                state: i === 0 ? 'current' : 'upcomming',
                winner: '',
                team_1_score: 0,
                team_2_score: 0,
                map_pick: chosenMaps[i][2],
                map: chosenMaps[i][0]
            };
        }
        this.saveStateToFile('gameState.json', this.config.gameState);
    }

    // Auto check inactive external clients
    checkForInactivePlayers() {
        let currentDate = Date.now();
        for (const key in this.config.players) {
            if (
                key.startsWith('player_') &&
                this.config.players[key].is_external_client &&
                Math.abs(currentDate - (this.config.players[key].last_updated || 0)) >= 60000
            ) {
                this.config.players[key].is_external_client = false;
            }
        }
    }

    // =========================================
    //       TOURNAMENT MODE & SPREADSHEET
    // =========================================

    // Automatically match team logo from local 'logo/' or 'overlays/visual_assets/teams/' folder
    findLocalTeamLogo(teamName, teamTag) {
        const dirs = [
            path.join(__dirname, './logo'),
            path.join(__dirname, './overlays/visual_assets/teams'),
            path.join(__dirname, './overlays/visual_assets')
        ];

        const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];
        const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const cleanName = normalize(teamName);
        const cleanTag = normalize(teamTag);

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;

            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const ext = path.extname(file).toLowerCase();
                    if (!validExtensions.includes(ext)) continue;

                    const baseName = normalize(path.basename(file, ext));

                    // Exact tag match (e.g. "S1N.png" for tag "S1N")
                    if (cleanTag && baseName === cleanTag) {
                        return `/logo/${file}`;
                    }

                    // Exact team name match (e.g. "S1N eSports.png" for "S1N eSports")
                    if (cleanName && baseName === cleanName) {
                        return `/logo/${file}`;
                    }

                    // Starts with tag (e.g. "S1N_Logo.png")
                    if (cleanTag && cleanTag.length >= 2 && (baseName.startsWith(cleanTag) || cleanTag.startsWith(baseName))) {
                        return `/logo/${file}`;
                    }

                    // Team name match partial
                    if (cleanName && cleanName.length >= 3 && (baseName.includes(cleanName) || cleanName.includes(baseName))) {
                        return `/logo/${file}`;
                    }
                }
            } catch (err) {
                // Ignore folder read errors
            }
        }
        return null;
    }

    // Auto-detect and sync local team logos across all tournament teams
    syncLocalLogos() {
        const data = this.getTournamentData();
        let updated = false;

        if (Array.isArray(data.teams)) {
            data.teams.forEach(team => {
                const localLogo = this.findLocalTeamLogo(team.name, team.tag);
                if (localLogo) {
                    if (team.logo !== localLogo) {
                        team.logo = localLogo;
                        updated = true;
                    }
                }
            });
        }

        if (updated) {
            this.saveTournamentData(data);
        }
        return data;
    }

    getTournamentData() {
        if (!this.config.tournament) {
            this.config.tournament = {
                spreadsheetUrl: '',
                autoSync: false,
                syncInterval: 60,
                lastSync: null,
                tournamentName: 'ZENX VALORANT TOURNAMENT',
                teams: [],
                matches: []
            };
        }
        // Auto-resolve any local logos from /logo folder if available
        if (Array.isArray(this.config.tournament.teams)) {
            this.config.tournament.teams.forEach(team => {
                const localLogo = this.findLocalTeamLogo(team.name, team.tag);
                if (localLogo && (!team.logo || team.logo.startsWith('/logo/') || team.logo.includes('drive.google.com') || team.logo.trim() === '')) {
                    team.logo = localLogo;
                }
            });
        }
        return this.config.tournament;
    }

    saveTournamentData(data) {
        if (data) {
            this.config.tournament = {
                ...this.getTournamentData(),
                ...data
            };
        }
        this.saveStateToFile('tournamentData.json', this.config.tournament);
        return this.config.tournament;
    }

    // Follows HTTP/HTTPS redirects to download Google Sheets CSV
    fetchUrlWithRedirects(targetUrl, maxRedirects = 5) {
        return new Promise((resolve, reject) => {
            if (maxRedirects <= 0) {
                return reject(new Error('Too many HTTP redirects'));
            }

            try {
                const parsedUrl = new URL(targetUrl);
                const protocol = parsedUrl.protocol === 'https:' ? https : http;

                const req = protocol.get(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/csv,text/plain,application/json,*/*'
                    },
                    timeout: 10000
                }, (res) => {
                    // Handle HTTP 3xx Redirects
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        let redirectUrl = res.headers.location;
                        if (!redirectUrl.startsWith('http')) {
                            redirectUrl = new URL(redirectUrl, targetUrl).href;
                        }
                        return resolve(this.fetchUrlWithRedirects(redirectUrl, maxRedirects - 1));
                    }

                    if (res.statusCode !== 200) {
                        return reject(new Error(`Server returned HTTP status ${res.statusCode}`));
                    }

                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(body));
                });

                req.on('error', err => reject(err));
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Connection timed out while fetching sheet'));
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    // Helper to fetch binary image buffer with redirects
    fetchBinaryBuffer(targetUrl, maxRedirects = 10) {
        return new Promise((resolve, reject) => {
            if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

            try {
                const parsedUrl = new URL(targetUrl);
                const protocol = parsedUrl.protocol === 'https:' ? https : http;

                const req = protocol.get(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                    },
                    timeout: 10000
                }, (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        let redirectUrl = res.headers.location;
                        if (!redirectUrl.startsWith('http')) {
                            redirectUrl = new URL(redirectUrl, targetUrl).href;
                        }
                        return resolve(this.fetchBinaryBuffer(redirectUrl, maxRedirects - 1));
                    }

                    if (res.statusCode !== 200) {
                        return reject(new Error(`Server returned HTTP status ${res.statusCode}`));
                    }

                    const contentType = res.headers['content-type'] || '';
                    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
                        return reject(new Error('Returned HTML/text instead of an image (file may be private or restricted)'));
                    }

                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => {
                        const buffer = Buffer.concat(chunks);
                        resolve({ buffer, contentType: contentType || 'image/png' });
                    });
                });

                req.on('error', err => reject(err));
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Image fetch timeout'));
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    // Robust CSV parser supporting quotes, commas, and multiline values
    parseCsvRows(csvText) {
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (inQuotes) {
                if (char === '"' && nextChar === '"') {
                    currentField += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    currentField += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    currentRow.push(currentField.trim());
                    currentField = '';
                } else if (char === '\n') {
                    currentRow.push(currentField.trim());
                    if (currentRow.some(val => val.length > 0)) {
                        rows.push(currentRow);
                    }
                    currentRow = [];
                    currentField = '';
                } else {
                    currentField += char;
                }
            }
        }

        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.some(val => val.length > 0)) {
                rows.push(currentRow);
            }
        }

        return rows;
    }

    // Parse HTML table from Google Sheets (extracting text and embedded cell images)
    parseHtmlTable(htmlText) {
        const rows = [];
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch;

        while ((trMatch = trRegex.exec(htmlText)) !== null) {
            const row = [];
            const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
            let tdMatch;

            while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
                const cellHtml = tdMatch[1];
                const imgMatch = cellHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
                if (imgMatch) {
                    row.push(imgMatch[1].trim());
                } else {
                    const text = cellHtml
                        .replace(/<[^>]+>/g, '')
                        .replace(/&amp;/g, '&')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'")
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&nbsp;/g, ' ')
                        .trim();
                    row.push(text);
                }
            }
            if (row.some(c => c.length > 0)) {
                rows.push(row);
            }
        }
        return rows;
    }

    // Clean player username (handling social links, filtering NIL/empty)
    cleanPlayerName(raw) {
        if (!raw || typeof raw !== 'string') return '';
        let name = raw.trim();
        if (['NIL', 'NA', 'N/A', 'NONE', 'NULL', '-', 'TBD', 'EMPTY', '0', ''].includes(name.toUpperCase())) {
            return '';
        }
        // Extract handle from YouTube / Twitch / Twitter URLs
        const socialMatch = name.match(/(?:youtube\.com|twitch\.tv|twitter\.com|x\.com)\/@?([a-zA-Z0-9_.-]+)/i);
        if (socialMatch) {
            name = socialMatch[1];
        }
        return name;
    }

    // Clean and normalize logo URLs (supporting formulas, Google Drive links, Dropbox, etc.)
    cleanLogoUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return '';
        let str = rawUrl.trim();

        // 0. If local path or static asset, return immediately
        if (str.startsWith('/logo/') || str.startsWith('../logo/') || str.startsWith('./logo/') || str.startsWith('logo/') || str.startsWith('/visual_assets/') || str.startsWith('../visual_assets/')) {
            return str.startsWith('logo/') ? `/${str}` : str;
        }

        // 1. If multiple links or comma-separated, take the first valid link
        if (str.includes(',') || str.includes('\n')) {
            const parts = str.split(/[\n,]/).map(p => p.trim()).filter(Boolean);
            if (parts.length > 0) str = parts[0];
        }

        // 2. Extract URL if inside =IMAGE(...) or =HYPERLINK(...) formula
        if (str.toUpperCase().includes('IMAGE') || str.toUpperCase().includes('HYPERLINK')) {
            const urlMatch = str.match(/https?:\/\/[^\s"',)]+/i);
            if (urlMatch) {
                str = urlMatch[0].trim();
            }
        }

        // 3. Extract standard http/https URL if wrapped in other text or quotes
        const directUrlMatch = str.match(/(https?:\/\/[^\s"',)]+)/i);
        if (directUrlMatch) {
            str = directUrlMatch[1].trim();
        }

        // 4. Remove wrapping quotes and trailing characters
        str = str.replace(/^["']+|["',)]+$/g, '').trim();

        // 5. Convert Google Drive file view / open links to direct high-res thumbnail CDN links
        const driveMatch = str.match(/(?:drive\.google\.com\/(?:file\/u\/\d+\/d\/|file\/d\/|open\?id=|uc\?id=|uc\?export=[^&]+&id=|thumbnail\?id=)|lh3\.googleusercontent\.com\/d\/)([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
            const fileId = driveMatch[1];
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
        }

        // 6. Convert Dropbox links to direct image
        if (str.includes('dropbox.com')) {
            str = str.replace('?dl=0', '?raw=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
        }

        return str;
    }

    // Google Spreadsheet Auto-Fetcher and Parser
    async fetchAndParseGoogleSheet(rawInputUrl) {
        if (!rawInputUrl || typeof rawInputUrl !== 'string' || rawInputUrl.trim() === '') {
            throw new Error('Please provide a valid Google Spreadsheet URL or CSV link');
        }

        let input = rawInputUrl.trim();
        let candidateUrls = [];

        // Detect Google Sheet ID and GID
        const sheetIdMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        const gidMatch = input.match(/[#&?]gid=([0-9]+)/);

        if (sheetIdMatch) {
            const docId = sheetIdMatch[1];
            const gid = gidMatch ? gidMatch[1] : '';

            // 1. Google Visualization HTML export (Contains cell images & <img src="..."> tags!)
            if (gid) {
                candidateUrls.push({ url: `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:html&gid=${gid}`, type: 'html' });
            }
            candidateUrls.push({ url: `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:html`, type: 'html' });

            // 2. Google Visualization CSV export
            if (gid) {
                candidateUrls.push({ url: `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${gid}`, type: 'csv' });
            }
            candidateUrls.push({ url: `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv`, type: 'csv' });

            // 3. Standard Google Export endpoint fallbacks
            if (gid) {
                candidateUrls.push({ url: `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid}`, type: 'csv' });
            }
            candidateUrls.push({ url: `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`, type: 'csv' });
        } else if (input.includes('/pubhtml')) {
            candidateUrls.push({ url: input, type: 'html' });
            candidateUrls.push({ url: input.replace('/pubhtml', '/pub?output=csv'), type: 'csv' });
        } else {
            candidateUrls.push({ url: input, type: 'csv' });
        }

        let rawContent = null;
        let responseType = 'csv';
        let lastError = null;

        for (const candidate of candidateUrls) {
            try {
                const fetched = await this.fetchUrlWithRedirects(candidate.url);
                if (fetched && fetched.trim().length > 0) {
                    // Check if Google returned an HTML login page instead of data
                    if (fetched.includes('accounts.google.com') && (fetched.includes('ServiceLogin') || fetched.includes('Sign in'))) {
                        throw new Error('Google Sheet is set to Private. Please open your Google Sheet, click "Share" (top-right), and change "General access" to "Anyone with the link can view" (Viewer)!');
                    }
                    rawContent = fetched;
                    responseType = candidate.type;
                    if (fetched.includes('<table') || fetched.includes('<tr')) {
                        responseType = 'html';
                    }
                    break;
                }
            } catch (err) {
                lastError = err;
                if (err.message.includes('Private')) throw err;
            }
        }

        if (!rawContent || rawContent.trim().length === 0) {
            throw new Error(lastError ? lastError.message : 'Could not fetch Google Sheet. Please make sure the sheet is shared as "Anyone with the link can view".');
        }

        // Parse content based on format (HTML table or CSV)
        let rows = [];
        if (responseType === 'html' || rawContent.includes('<table') || rawContent.includes('<tr')) {
            rows = this.parseHtmlTable(rawContent);
        }
        
        if (rows.length < 2) {
            rows = this.parseCsvRows(rawContent);
        }

        if (rows.length < 2) {
            throw new Error('Spreadsheet must contain at least 1 header row and 1 data row');
        }

        // Detect the true header row (in case row 0 is a title or empty)
        let headerRowIdx = 0;
        let maxHeaderScore = -1;
        const keyTerms = ['team', 'name', 'tag', 'logo', 'icon', 'image', 'seed', 'player', 'roster', 'match', 'stage', 'format', 'upload', 'file', 'link', 'photo', 'avatar'];

        for (let r = 0; r < Math.min(10, rows.length); r++) {
            const rowCells = rows[r].map(h => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
            let score = 0;
            rowCells.forEach(cell => {
                if (keyTerms.some(k => cell.includes(k))) score++;
            });
            if (score > maxHeaderScore) {
                maxHeaderScore = score;
                headerRowIdx = r;
            }
        }

        const headers = rows[headerRowIdx].map(h => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
        const findCol = (...keys) => {
            return headers.findIndex(h => keys.some(k => h.includes(k)));
        };

        // Determine if Sheet is Teams, Schedule, or Hybrid
        const hasTeamCol = findCol('team', 'name', 'org', 'tag', 'abbr') !== -1;
        const hasMatchCol = findCol('match', 'stage', 'team1', 'team2', 'vs', 'format', 'bo') !== -1;

        let parsedTeams = [];
        let parsedMatches = [];

        // Parse Teams
        const teamNameIdx = findCol('teamname', 'team', 'name', 'org');
        const tagIdx = findCol('teamshorttag', 'tag', 'abbr', 'abbreviation', 'code', 'short');
        const logoIdx = findCol('logo', 'teamlogo', 'logourl', 'icon', 'teamicon', 'image', 'teamimage', 'avatar', 'pic', 'picture', 'photo', 'badge', 'emblem', 'banner', 'crest', 'symbol', 'img', 'upload', 'file', 'attachment', 'drive', 'link');
        const seedIdx = findCol('currentrank', 'rank', 'seed', 'group', 'division', 'pool', 'tier', 'peakrank');
        const p1Idx = findCol('player1', 'p1', 'roster1');
        const p2Idx = findCol('player2', 'p2', 'roster2');
        const p3Idx = findCol('player3', 'p3', 'roster3');
        const p4Idx = findCol('player4', 'p4', 'roster4');
        const p5Idx = findCol('player5', 'p5', 'roster5');
        const rosterIdx = findCol('roster', 'players', 'lineup', 'member');

        // Dynamic player Riot ID columns detector (for Google Forms with multiple Riot ID columns)
        const playerCols = [];
        headers.forEach((h, idx) => {
            if (h.includes('riotid') || h.includes('ign') || h.includes('ingamename') || h.includes('playername') || (h.includes('player') && !h.includes('yt') && !h.includes('channel') && !h.includes('channelurl'))) {
                playerCols.push(idx);
            }
        });

        // Parse Matches
        const matchIdIdx = findCol('matchid', 'match', 'game', 'id');
        const stageIdx = findCol('stage', 'round', 'tournamentstage', 'bracket', 'title');
        const t1Idx = findCol('team1', 'teama', 't1', 'home');
        const t2Idx = findCol('team2', 'teamb', 't2', 'away');
        const formatIdx = findCol('format', 'series', 'bo', 'bestof');
        const timeIdx = findCol('time', 'date', 'scheduled', 'schedule', 'start');
        const statusIdx = findCol('status', 'state', 'live');
        const scoreIdx = findCol('score', 'result');

        for (let r = headerRowIdx + 1; r < rows.length; r++) {
            const row = rows[r];

            // 1. Extract Team if row contains team data
            if (teamNameIdx !== -1 && row[teamNameIdx] && String(row[teamNameIdx]).trim() !== '') {
                const teamName = String(row[teamNameIdx]).trim();
                let teamTag = '';
                if (tagIdx !== -1 && row[tagIdx] && String(row[tagIdx]).trim() !== '') {
                    teamTag = String(row[tagIdx]).trim();
                } else {
                    const tagMatch = teamName.match(/^[A-Z0-9]{2,4}\b/);
                    teamTag = tagMatch ? tagMatch[0] : teamName.slice(0, 4).toUpperCase();
                }
                
                // Extract and clean Team Logo URL
                let teamLogo = '';
                if (logoIdx !== -1 && row[logoIdx]) {
                    teamLogo = this.cleanLogoUrl(String(row[logoIdx]));
                }

                // If no logo found from logo column, scan other cells for an image or drive URL
                if (!teamLogo) {
                    for (let c = 0; c < row.length; c++) {
                        if (c !== teamNameIdx && c !== tagIdx && c !== seedIdx && row[c]) {
                            const val = String(row[c]).trim();
                            if (val.startsWith('http') || val.includes('drive.google.com') || val.includes('googleusercontent.com') || val.includes('discordapp.com') || val.includes('=IMAGE(') || /\.(png|jpg|jpeg|webp|svg)/i.test(val)) {
                                teamLogo = this.cleanLogoUrl(val);
                                if (teamLogo) break;
                            }
                        }
                    }
                }

                let teamSeed = seedIdx !== -1 && row[seedIdx] ? String(row[seedIdx]).trim() : '';

                let players = [];
                if (playerCols.length > 0) {
                    playerCols.forEach(idx => {
                        if (row[idx]) {
                            const p = this.cleanPlayerName(row[idx]);
                            if (p && !players.includes(p)) players.push(p);
                        }
                    });
                } else {
                    [p1Idx, p2Idx, p3Idx, p4Idx, p5Idx].forEach(idx => {
                        if (idx !== -1 && row[idx]) {
                            const p = this.cleanPlayerName(row[idx]);
                            if (p && !players.includes(p)) players.push(p);
                        }
                    });
                    if (players.length === 0 && rosterIdx !== -1 && row[rosterIdx]) {
                        players = row[rosterIdx].split(/[,;\n/]/).map(p => this.cleanPlayerName(p)).filter(Boolean);
                    }
                }

                parsedTeams.push({
                    id: `team_${parsedTeams.length + 1}_${Date.now()}`,
                    name: teamName,
                    tag: teamTag.toUpperCase(),
                    logo: teamLogo,
                    seed: teamSeed,
                    players: players
                });
            }

            // 2. Extract Match if row contains match schedule data
            if (t1Idx !== -1 && t2Idx !== -1 && row[t1Idx] && row[t2Idx]) {
                const mStage = stageIdx !== -1 && row[stageIdx] ? row[stageIdx].trim() : `Match ${parsedMatches.length + 1}`;
                const t1 = row[t1Idx].trim();
                const t2 = row[t2Idx].trim();
                const mFormat = formatIdx !== -1 && row[formatIdx] ? row[formatIdx].trim().toUpperCase() : 'BO3';
                const mTime = timeIdx !== -1 && row[timeIdx] ? row[timeIdx].trim() : 'TBD';
                const mStatus = statusIdx !== -1 && row[statusIdx] ? row[statusIdx].trim().toUpperCase() : 'UPCOMING';
                const mScore = scoreIdx !== -1 && row[scoreIdx] ? row[scoreIdx].trim() : '0 - 0';
                const mId = matchIdIdx !== -1 && row[matchIdIdx] ? row[matchIdIdx].trim() : `match_${parsedMatches.length + 1}`;

                parsedMatches.push({
                    id: mId,
                    stage: mStage,
                    team_1_tag: t1,
                    team_2_tag: t2,
                    format: mFormat,
                    scheduled_time: mTime,
                    status: mStatus,
                    score: mScore
                });
            }
        }

        // Save imported results
        const currentData = this.getTournamentData();
        if (parsedTeams.length > 0) currentData.teams = parsedTeams;
        if (parsedMatches.length > 0) currentData.matches = parsedMatches;
        currentData.spreadsheetUrl = input;
        currentData.lastSync = Date.now();

        this.saveTournamentData(currentData);

        return {
            status: true,
            message: `Successfully synchronized from Google Sheet! Loaded ${parsedTeams.length} Teams and ${parsedMatches.length} Scheduled Matches.`,
            teamsCount: parsedTeams.length,
            matchesCount: parsedMatches.length,
            tournamentData: currentData
        };
    }

    // 1-Click Load Match into Active Game State & Overlay
    loadTournamentMatch(matchIdOrIndex) {
        const tournament = this.getTournamentData();
        let match = null;

        if (typeof matchIdOrIndex === 'object') {
            match = matchIdOrIndex;
        } else {
            match = tournament.matches.find(m => m.id === matchIdOrIndex || String(m.id) === String(matchIdOrIndex))
                 || tournament.matches[parseInt(matchIdOrIndex)];
        }

        if (!match) {
            throw new Error(`Match '${matchIdOrIndex}' not found in tournament schedule`);
        }

        // Find Team 1 & Team 2 objects from tournament teams
        const t1Tag = (match.team_1_tag || match.team_1 || '').toUpperCase();
        const t2Tag = (match.team_2_tag || match.team_2 || '').toUpperCase();

        const findTeam = (tag) => {
            if (!tag) return null;
            return tournament.teams.find(t => 
                (t.tag && t.tag.toUpperCase() === tag) || 
                (t.name && t.name.toUpperCase() === tag)
            );
        };

        const team1Obj = findTeam(t1Tag);
        const team2Obj = findTeam(t2Tag);

        // Update Game State Team 1
        if (team1Obj) {
            this.config.gameState.team_1.abbreviation = team1Obj.tag || team1Obj.name;
            if (team1Obj.logo) this.config.gameState.team_1.icon_link = this.cleanLogoUrl(team1Obj.logo);
        } else if (t1Tag) {
            this.config.gameState.team_1.abbreviation = t1Tag;
        }

        // Update Game State Team 2
        if (team2Obj) {
            this.config.gameState.team_2.abbreviation = team2Obj.tag || team2Obj.name;
            if (team2Obj.logo) this.config.gameState.team_2.icon_link = this.cleanLogoUrl(team2Obj.logo);
        } else if (t2Tag) {
            this.config.gameState.team_2.abbreviation = t2Tag;
        }

        // Update Tournament Stage Header & Format
        const matchFormat = (match.format || 'BO3').toUpperCase();
        const stageName = match.stage || 'TOURNAMENT MATCH';
        this.config.gameState.tournament_stage = `${stageName} (${matchFormat})`;

        // Set series format
        if (this.setSeriesFormat) {
            this.setSeriesFormat(matchFormat.toLowerCase());
        }

        // If teams have rosters, populate player slots
        this.syncPlayersFromTournamentTeams();

        // Save states
        this.saveStateToFile('gameState.json', this.config.gameState);
        this.saveStateToFile('players.json', this.config.players);
        if (this.config.mapPicks) {
            this.config.mapPicks.teams = [
                this.config.gameState.team_1.abbreviation,
                this.config.gameState.team_2.abbreviation
            ];
            this.saveStateToFile('mapPicks.json', this.config.mapPicks);
        }

        return {
            status: true,
            message: `Loaded ${t1Tag} vs ${t2Tag} (${match.stage}) into live overlay!`,
            gameState: this.getGameState(),
            gameConfig: this.getGameConfiguration(),
            players: this.config.players
        };
    }

    addOrUpdateTournamentTeam(teamData) {
        const tournament = this.getTournamentData();
        if (!teamData.id) {
            teamData.id = `team_${Date.now()}`;
        }

        const existingIdx = tournament.teams.findIndex(t => t.id === teamData.id || (t.tag && t.tag.toUpperCase() === teamData.tag?.toUpperCase()));
        if (existingIdx !== -1) {
            tournament.teams[existingIdx] = { ...tournament.teams[existingIdx], ...teamData };
        } else {
            tournament.teams.push(teamData);
        }

        this.saveTournamentData(tournament);
        return tournament.teams;
    }

    deleteTournamentTeam(teamId) {
        const tournament = this.getTournamentData();
        tournament.teams = tournament.teams.filter(t => t.id !== teamId && t.tag !== teamId);
        this.saveTournamentData(tournament);
        return tournament.teams;
    }

    addOrUpdateTournamentMatch(matchData) {
        const tournament = this.getTournamentData();
        if (!matchData.id) {
            matchData.id = `match_${Date.now()}`;
        }

        const existingIdx = tournament.matches.findIndex(m => m.id === matchData.id);
        if (existingIdx !== -1) {
            tournament.matches[existingIdx] = { ...tournament.matches[existingIdx], ...matchData };
        } else {
            tournament.matches.push(matchData);
        }

        this.saveTournamentData(tournament);
        return tournament.matches;
    }

    deleteTournamentMatch(matchId) {
        const tournament = this.getTournamentData();
        tournament.matches = tournament.matches.filter(m => m.id !== matchId);
        this.saveTournamentData(tournament);
        return tournament.matches;
    }
}

module.exports = fileLoader;