const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
            // Read players
            const playersData = fs.readFileSync(path.join(this.configDir, 'players.json'), 'utf8');
            const players = JSON.parse(playersData);
            for (const key in players) {
                if (key.startsWith('player_')) {
                    players[key].last_updated = Date.now();
                }
            }
            this.config.players = players;

            // Read Game State
            const gameStateData = fs.readFileSync(path.join(this.configDir, 'gameState.json'), 'utf8');
            this.config.gameState = JSON.parse(gameStateData);

            // Read Map Picks
            const mapPicksData = fs.readFileSync(path.join(this.configDir, 'mapPicks.json'), 'utf8');
            this.config.mapPicks = JSON.parse(mapPicksData);

            // Read Timer
            const timerData = fs.readFileSync(path.join(this.configDir, 'timer.json'), 'utf8');
            this.config.timer = JSON.parse(timerData);

            // Read Admin Password & App Config
            const appConfigData = fs.readFileSync(path.join(this.configDir, 'appConfig.json'), 'utf8');
            const appConfig = JSON.parse(appConfigData);
            this.config.appConfig = appConfig;
            this._adminPassword = appConfig.admin_key || 'password';

            this.isInitialized = true;
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
        return this._adminPassword === userInput;
    }

    updateAdminPassword(newPassword) {
        this._adminPassword = newPassword;
        if (!this.config.appConfig) this.config.appConfig = {};
        this.config.appConfig.admin_key = newPassword;
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
        this.saveStateToFile('gameState.json', this.config.gameState);
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
        if (this.config.players[key]) {
            this.config.players[key].data = {
                ...this.config.players[key].data,
                ...playerData
            };
            this.config.players[key].is_registered = true;
            this.config.players[key].last_updated = Date.now();
            this.saveStateToFile('players.json', this.config.players);
            return true;
        }
        return false;
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
            team_1: this.config.gameState.team_1,
            team_2: this.config.gameState.team_2,
            game_flow: this.config.gameState.game_flow,
            team_1_score: this.config.gameState.team_1_score,
            team_2_score: this.config.gameState.team_2_score,
            round_number: this.config.gameState.round_number,
            spike_down: this.config.gameState.spike_down,
            switch_sides: this.config.gameState.switch_sides || false,
            mapPicks: this.config.mapPicks
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

        // Determine series format if available
        let bo = mapBanData.bo || mapBanData.bestOf || (mapBanData.lobby ? mapBanData.lobby.bo : null);
        if (bo === 1 || bo === '1' || bo === 'bo1') this.config.mapPicks.series_type = 'bo1';
        else if (bo === 5 || bo === '5' || bo === 'bo5') this.config.mapPicks.series_type = 'bo5';
        else this.config.mapPicks.series_type = 'bo3';

        // Extract team names if available
        let teamNames = mapBanData.teamNames || (mapBanData.lobby ? mapBanData.lobby.teamNames : null);
        if (Array.isArray(teamNames) && teamNames.length >= 2) {
            this.config.mapPicks.teams = [teamNames[0], teamNames[1]];
            if (this.config.gameState.team_1) this.config.gameState.team_1.abbreviation = teamNames[0];
            if (this.config.gameState.team_2) this.config.gameState.team_2.abbreviation = teamNames[1];
        }

        // Extract picks and bans from logs or picks array
        let rawLogs = mapBanData.log || mapBanData.logs || mapBanData.picks || mapBanData.events || [];
        if (Array.isArray(rawLogs) && rawLogs.length > 0) {
            let parsedPicks = [];
            for (let i = 0; i < rawLogs.length; i++) {
                const item = rawLogs[i];
                let mapName = 'ascent';
                let action = 'ban';

                if (Array.isArray(item)) {
                    mapName = (item[0] || 'ascent').toLowerCase();
                    action = (item[1] || 'ban').toLowerCase();
                } else if (typeof item === 'object') {
                    mapName = (item.map || item.mapName || item.mapId || 'ascent').toLowerCase();
                    let act = (item.action || item.type || '').toLowerCase();
                    let side = (item.side || item.selectedSide || '').toLowerCase();

                    if (act.includes('ban') || act === 'banned') {
                        action = 'ban';
                    } else if (side.includes('atk') || side.includes('attack') || act.includes('attack')) {
                        action = 'attack';
                    } else if (side.includes('def') || side.includes('defense') || act.includes('defense')) {
                        action = 'defense';
                    } else if (act.includes('pick') || act === 'picked') {
                        action = 'attack';
                    } else {
                        action = 'attack';
                    }
                }
                parsedPicks.push([mapName, action]);
            }
            this.config.mapPicks.picks = parsedPicks;
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

    // Auto kick inactive external clients
    checkForInactivePlayers() {
        let currentDate = Date.now();
        for (const key in this.config.players) {
            if (
                key.startsWith('player_') &&
                this.config.players[key].is_registered &&
                Math.abs(currentDate - this.config.players[key].last_updated) >= 30000
            ) {
                // Don't auto kick if no token set
                if (this.config.players[key].token) {
                    this.config.players[key].last_updated = currentDate;
                    this.config.players[key].is_registered = false;
                    console.log(`User with token: ${this.config.players[key].token} auto kicked due to inactivity`);
                }
            }
        }
    }
}

module.exports = fileLoader;