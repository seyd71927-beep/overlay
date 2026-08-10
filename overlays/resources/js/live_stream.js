class LiveStreamOperator {
    constructor() {
        this.socket = null;
        this.gameState = {
            round_number: 1,
            team_1_score: 0,
            team_2_score: 0,
            spike_down: false,
            switch_sides: false
        };
        this.team1Data = { abbreviation: 'T1' };
        this.team2Data = { abbreviation: 'T2' };
        this.playersData = {};

        this.agentsList = [
            'Jett', 'Reyna', 'Raze', 'Viper', 'Omen', 'Brimstone', 'Phoenix', 'Sova',
            'Sage', 'Cypher', 'Killjoy', 'Breach', 'Skye', 'Yoru', 'Astra', 'Kayo',
            'Chamber', 'Neon', 'Fade', 'Harbor', 'Gekko', 'Deadlock', 'Iso', 'Clove',
            'Vyse', 'Tejo', 'Miks', 'Veto', 'Waylay'
        ];

        this.weaponsList = [
            'vandal', 'phantom', 'operator', 'spectre', 'sheriff', 'ghost', 'classic', 'odin', 'marshal', 'outlaw', 'guardian', 'judge', 'bucky', 'bulldog', 'ares', 'stinger', 'frenzy', 'shorty', 'knife'
        ];
    }

    async init() {
        this.initSocket();
        this.bindEvents();
        await this.fetchInitialState();
        await this.fetchCasters();
    }

    initSocket() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            this.socket.on('connect', () => {
                const badge = document.getElementById('socket-status-badge');
                if (badge) {
                    badge.textContent = 'CONNECTED (WEBSOCKET LIVE)';
                    badge.style.background = 'rgba(0, 230, 118, 0.15)';
                    badge.style.color = '#00e676';
                }
            });

            this.socket.on('disconnect', () => {
                const badge = document.getElementById('socket-status-badge');
                if (badge) {
                    badge.textContent = 'DISCONNECTED (RECONNECTING)';
                    badge.style.background = 'rgba(255, 42, 95, 0.15)';
                    badge.style.color = '#ff2a5f';
                }
            });

            this.socket.on('stateUpdate', (state) => {
                this.updateLocalGameState(state);
            });

            this.socket.on('playerUpdate', (players) => {
                this.playersData = players;
                this.renderPlayerTable();
            });

            this.socket.on('configUpdate', (config) => {
                if (config.team_1) this.team1Data = config.team_1;
                if (config.team_2) this.team2Data = config.team_2;
                this.renderScoreboardDisplay();
            });
        }
    }

    async fetchInitialState() {
        try {
            const configRes = await fetch('../get_game_configuration');
            if (configRes.status === 200) {
                const config = await configRes.json();
                this.team1Data = config.team_1 || { abbreviation: 'T1' };
                this.team2Data = config.team_2 || { abbreviation: 'T2' };
            }

            const stateRes = await fetch('../get_game_state');
            if (stateRes.status === 200) {
                const state = await stateRes.json();
                this.updateLocalGameState(state);
            }

            const playersRes = await fetch('../get_player_stats');
            if (playersRes.status === 200) {
                const pData = await playersRes.json();
                this.loadPlayersFromResponse(pData);
            }
        } catch (err) {
            console.error('Error fetching initial live state:', err);
        }
    }

    async fetchCasters() {
        try {
            const res = await fetch('../get_casters');
            if (res.status === 200) {
                const casters = await res.json();
                if (casters.caster_1) {
                    document.getElementById('caster1-name').value = casters.caster_1.name || '';
                    document.getElementById('caster1-handle').value = casters.caster_1.handle || '';
                }
                if (casters.caster_2) {
                    document.getElementById('caster2-name').value = casters.caster_2.name || '';
                    document.getElementById('caster2-handle').value = casters.caster_2.handle || '';
                }
                if (casters.duration && document.getElementById('caster-duration-select')) {
                    document.getElementById('caster-duration-select').value = casters.duration;
                }
                if (casters.interval && document.getElementById('caster-interval-select')) {
                    document.getElementById('caster-interval-select').value = casters.interval;
                }
                this.casterAutoLoop = !!casters.auto_loop;
                this.updateCasterLoopButton();
            }
        } catch (e) {}
    }

    loadPlayersFromResponse(pData) {
        let playersObj = {};
        for (let i = 0; i < 5; i++) {
            if (pData.team_1 && pData.team_1[`player_${i}`]) {
                playersObj[`player_${i}`] = {
                    is_registered: true,
                    data: pData.team_1[`player_${i}`]
                };
            }
        }
        for (let i = 5; i < 10; i++) {
            if (pData.team_2 && pData.team_2[`player_${i - 5}`]) {
                playersObj[`player_${i}`] = {
                    is_registered: true,
                    data: pData.team_2[`player_${i - 5}`]
                };
            }
        }
        this.playersData = playersObj;
        this.renderPlayerTable();
    }

    updateLocalGameState(state) {
        this.gameState = { ...this.gameState, ...state };
        if (state.tournament_stage && document.getElementById('tournament-stage-input')) {
            document.getElementById('tournament-stage-input').value = state.tournament_stage;
        }
        this.renderScoreboardDisplay();
    }

    renderScoreboardDisplay() {
        const t1Name = document.getElementById('display-team1-name');
        const t2Name = document.getElementById('display-team2-name');
        const t1Score = document.getElementById('display-team1-score');
        const t2Score = document.getElementById('display-team2-score');
        const roundNum = document.getElementById('display-round-num');

        if (t1Name) t1Name.textContent = (this.team1Data.abbreviation || 'TEAM 1').toUpperCase();
        if (t2Name) t2Name.textContent = (this.team2Data.abbreviation || 'TEAM 2').toUpperCase();
        if (t1Score) t1Score.textContent = this.gameState.team_1_score;
        if (t2Score) t2Score.textContent = this.gameState.team_2_score;
        if (roundNum) roundNum.textContent = `ROUND ${this.gameState.round_number || 1}`;
    }

    bindEvents() {
        // Tournament Header save
        const saveStageHeader = async () => {
            const title = document.getElementById('tournament-stage-input')?.value.trim() || '';
            const formData = new FormData();
            formData.append('tournament_stage', title);
            await fetch('../change_game_state', { method: 'POST', body: formData });
            if (typeof successAlertLowerBottom === 'function') {
                successAlertLowerBottom(title ? `Header Updated: "${title}"` : `Header Cleared!`);
            }
        };

        document.getElementById('save-tournament-stage-btn')?.addEventListener('click', saveStageHeader);
        document.getElementById('tournament-stage-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveStageHeader();
        });

        // Score adjustments
        document.getElementById('t1-score-plus')?.addEventListener('click', () => this.adjustScore('team_1', 1));
        document.getElementById('t1-score-minus')?.addEventListener('click', () => this.adjustScore('team_1', -1));
        document.getElementById('t2-score-plus')?.addEventListener('click', () => this.adjustScore('team_2', 1));
        document.getElementById('t2-score-minus')?.addEventListener('click', () => this.adjustScore('team_2', -1));

        document.getElementById('round-plus')?.addEventListener('click', () => this.adjustRound(1));
        document.getElementById('round-minus')?.addEventListener('click', () => this.adjustRound(-1));

        document.getElementById('toggle-sides-btn')?.addEventListener('click', () => this.toggleSides());
        document.getElementById('reset-match-btn')?.addEventListener('click', () => this.resetMatch());

        // Round Win triggers
        document.getElementById('win-team1-btn')?.addEventListener('click', () => this.triggerWinBanner('team_1'));
        document.getElementById('win-team2-btn')?.addEventListener('click', () => this.triggerWinBanner('team_2'));

        // Spike
        document.getElementById('plant-spike-btn')?.addEventListener('click', () => this.setSpike(true));
        document.getElementById('defuse-spike-btn')?.addEventListener('click', () => this.setSpike(false));

        // Timer
        document.getElementById('start-timer-btn')?.addEventListener('click', () => this.startTimer());
        document.getElementById('stop-timer-btn')?.addEventListener('click', () => this.stopTimer());

        // Casters
        document.getElementById('loop-casters-btn')?.addEventListener('click', () => this.toggleCasterLoop());
        document.getElementById('popup-casters-btn')?.addEventListener('click', () => this.popupCasters());
        document.getElementById('save-casters-btn')?.addEventListener('click', () => this.saveCasters(false));
        document.getElementById('toggle-lower-third-btn')?.addEventListener('click', () => this.saveCasters(true));
        
        document.getElementById('caster-duration-select')?.addEventListener('change', (e) => {
            const btn = document.getElementById('popup-casters-btn');
            if (btn) {
                const sec = Math.round(parseInt(e.target.value) / 1000);
                btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Popup (${sec}s)`;
            }
        });

        // Simulation
        document.getElementById('quick-sim-btn')?.addEventListener('click', () => this.runQuickSimulation());
    }

    async adjustScore(team, delta) {
        if (team === 'team_1') {
            this.gameState.team_1_score = Math.max(0, this.gameState.team_1_score + delta);
        } else {
            this.gameState.team_2_score = Math.max(0, this.gameState.team_2_score + delta);
        }
        await this.postGameState();
    }

    async adjustRound(delta) {
        this.gameState.round_number = Math.max(1, (this.gameState.round_number || 1) + delta);
        await this.postGameState();
    }

    async toggleSides() {
        this.gameState.switch_sides = !this.gameState.switch_sides;
        await this.postGameState();
    }

    async setSpike(isDown) {
        this.gameState.spike_down = isDown;
        await this.postGameState();
        if (typeof successAlertLowerBottom === 'function') {
            successAlertLowerBottom(isDown ? 'Spike Planted! (45s Timer)' : 'Spike Cleared / Defused');
        }
    }

    async triggerWinBanner(winningTeam) {
        const formData = new FormData();
        formData.append('winningTeam', winningTeam);

        try {
            const res = await fetch('../trigger_win_banner', {
                method: 'POST',
                body: formData
            });
            if (res.status === 200) {
                if (typeof successAlertLowerBottom === 'function') {
                    const teamName = winningTeam === 'team_1' ? (this.team1Data.abbreviation || 'Team 1') : (this.team2Data.abbreviation || 'Team 2');
                    successAlertLowerBottom(`Triggered Round Win for ${teamName}!`);
                }
            }
        } catch (e) {
            console.error('Error triggering win banner:', e);
        }
    }

    async resetMatch() {
        if (!confirm('Are you sure you want to reset match scores to 0-0 and round to 1?')) return;
        try {
            await fetch('../reset_match_state', { method: 'POST' });
            if (typeof successAlertLowerBottom === 'function') {
                successAlertLowerBottom('Match Reset to 0 - 0!');
            }
        } catch (e) {}
    }

    async postGameState() {
        const formData = new FormData();
        formData.append('round_number', this.gameState.round_number);
        formData.append('team_1_score', this.gameState.team_1_score);
        formData.append('team_2_score', this.gameState.team_2_score);
        formData.append('spike', this.gameState.spike_down ? 'down' : 'up');
        formData.append('switch_sides', this.gameState.switch_sides);

        try {
            await fetch('../change_game_state', {
                method: 'POST',
                body: formData
            });
        } catch (e) {
            console.error('Error posting game state:', e);
        }
    }

    async startTimer() {
        const desc = document.getElementById('timer-desc-input').value.trim() || 'MATCH BREAK';
        const mins = parseInt(document.getElementById('timer-mins-input').value) || 5;
        const ms = mins * 60 * 1000;

        const formData = new FormData();
        formData.append('timeMiliseconds', ms);
        formData.append('description', desc);

        try {
            await fetch('../set_timer', { method: 'POST', body: formData });
            if (typeof successAlertLowerBottom === 'function') {
                successAlertLowerBottom(`Timer Started: ${mins} Mins - ${desc}`);
            }
        } catch (e) {}
    }

    async stopTimer() {
        try {
            await fetch('../stop_timer', { method: 'POST' });
            if (typeof successAlertLowerBottom === 'function') {
                successAlertLowerBottom('Timer Stopped');
            }
        } catch (e) {}
    }

    async toggleCasterLoop() {
        this.casterAutoLoop = !this.casterAutoLoop;
        const c1Name = document.getElementById('caster1-name').value.trim();
        const c1Handle = document.getElementById('caster1-handle').value.trim();
        const c2Name = document.getElementById('caster2-name').value.trim();
        const c2Handle = document.getElementById('caster2-handle').value.trim();
        const durSelect = document.getElementById('caster-duration-select');
        const dur = durSelect ? parseInt(durSelect.value) : 6000;
        const intvSelect = document.getElementById('caster-interval-select');
        const intv = intvSelect ? parseInt(intvSelect.value) : 30000;

        const durSec = Math.round(dur / 1000);
        const intvSec = Math.round(intv / 1000);

        const formData = new FormData();
        formData.append('caster_1', JSON.stringify({ name: c1Name, handle: c1Handle }));
        formData.append('caster_2', JSON.stringify({ name: c2Name, handle: c2Handle }));
        formData.append('show_lower_third', this.casterAutoLoop);
        formData.append('auto_loop', this.casterAutoLoop);
        formData.append('duration', dur);
        formData.append('interval', intv);

        try {
            await fetch('../set_casters', { method: 'POST', body: formData });
            this.updateCasterLoopButton();
            if (typeof successAlertLowerBottom === 'function') {
                successAlertLowerBottom(this.casterAutoLoop ? `Auto-Loop Started (${durSec}s every ${intvSec}s)!` : 'Auto-Loop Stopped');
            }
        } catch (e) {
            console.error('Error toggling caster loop:', e);
        }
    }

    updateCasterLoopButton() {
        const btn = document.getElementById('loop-casters-btn');
        if (!btn) return;
        if (this.casterAutoLoop) {
            btn.innerHTML = `<i class="fa-solid fa-repeat"></i> Loop: ON`;
            btn.style.background = 'rgba(0, 230, 118, 0.2)';
            btn.style.color = '#00e676';
            btn.style.borderColor = 'rgba(0, 230, 118, 0.5)';
        } else {
            btn.innerHTML = `<i class="fa-solid fa-repeat"></i> Loop: OFF`;
            btn.style.background = 'rgba(0, 242, 254, 0.15)';
            btn.style.color = '#00f2fe';
            btn.style.borderColor = 'rgba(0, 242, 254, 0.3)';
        }
    }

    async popupCasters() {
        const c1Name = document.getElementById('caster1-name').value.trim();
        const c1Handle = document.getElementById('caster1-handle').value.trim();
        const c2Name = document.getElementById('caster2-name').value.trim();
        const c2Handle = document.getElementById('caster2-handle').value.trim();
        const durSelect = document.getElementById('caster-duration-select');
        const dur = durSelect ? parseInt(durSelect.value) : 6000;
        const durSec = Math.round(dur / 1000);

        const formData = new FormData();
        formData.append('caster_1', JSON.stringify({ name: c1Name, handle: c1Handle }));
        formData.append('caster_2', JSON.stringify({ name: c2Name, handle: c2Handle }));
        formData.append('show_lower_third', true);
        formData.append('auto_loop', false);
        formData.append('duration', dur);

        this.casterAutoLoop = false;
        this.updateCasterLoopButton();

        try {
            await fetch('../set_casters', { method: 'POST', body: formData });
            this.showLowerThirdState = false;
            if (typeof successAlertLowerBottom === 'function') {
                successAlertLowerBottom(`Casters Pop-up Triggered (${durSec}s Auto-Hide)!`);
            }
        } catch (e) {
            console.error('Error triggering casters popup:', e);
        }
    }

    async saveCasters(toggleLowerThird) {
        const c1Name = document.getElementById('caster1-name').value.trim();
        const c1Handle = document.getElementById('caster1-handle').value.trim();
        const c2Name = document.getElementById('caster2-name').value.trim();
        const c2Handle = document.getElementById('caster2-handle').value.trim();

        let showLowerThird = false;
        if (toggleLowerThird) {
            this.showLowerThirdState = !this.showLowerThirdState;
            showLowerThird = this.showLowerThirdState;
        }

        const formData = new FormData();
        formData.append('caster_1', JSON.stringify({ name: c1Name, handle: c1Handle }));
        formData.append('caster_2', JSON.stringify({ name: c2Name, handle: c2Handle }));
        formData.append('show_lower_third', showLowerThird);

        try {
            await fetch('../set_casters', { method: 'POST', body: formData });
            if (typeof successAlertLowerBottom === 'function') {
                successAlertLowerBottom(toggleLowerThird ? `Caster Desk Overlay: ${showLowerThird ? 'SHOWN' : 'HIDDEN'}` : 'Casters Updated!');
            }
        } catch (e) {}
    }

    renderPlayerTable() {
        const tbody = document.getElementById('player-table-body');
        if (!tbody) return;

        let html = '';
        for (let i = 0; i < 10; i++) {
            const key = `player_${i}`;
            const isTeam1 = i < 5;
            const teamLabel = isTeam1 ? (this.team1Data.abbreviation || 'T1') : (this.team2Data.abbreviation || 'T2');
            const rowClass = isTeam1 ? 'team-1-row' : 'team-2-row';

            const pData = (this.playersData[key] && this.playersData[key].data) ? this.playersData[key].data : {
                username: `Player ${i + 1}`,
                agent: isTeam1 ? ['Jett', 'Reyna', 'Sova', 'Omen', 'Killjoy'][i] : ['Raze', 'Viper', 'Fade', 'Cypher', 'Brimstone'][i - 5],
                health: 100,
                shield: 50,
                weapon: 'vandal',
                ult_points_gained: 4,
                ult_points_needed: 7,
                credits: 3200,
                has_spike: (i === 0),
                is_dead: false
            };

            html += `
            <tr class="${rowClass}">
                <td style="font-weight: 700;">${i + 1}</td>
                <td><span style="color: ${isTeam1 ? 'var(--green-team)' : 'var(--red-team)'}; font-weight: 700;">${teamLabel}</span></td>
                <td><input type="text" class="input-field" style="padding: 4px 8px; font-size: 0.8rem;" value="${pData.username || ''}" id="p-name-${i}"></td>
                <td>
                    <select class="input-field" style="padding: 4px 6px; font-size: 0.8rem;" id="p-agent-${i}">
                        ${this.agentsList.map(a => `<option ${(pData.agent || '').toLowerCase() === a.toLowerCase() ? 'selected' : ''} value="${a}">${a}</option>`).join('')}
                    </select>
                </td>
                <td><input type="number" min="0" max="100" class="input-field health-bar-input" value="${pData.health ?? 100}" id="p-hp-${i}"></td>
                <td><input type="number" min="0" max="50" class="input-field health-bar-input" value="${pData.shield ?? 50}" id="p-shield-${i}"></td>
                <td>
                    <select class="input-field" style="padding: 4px 6px; font-size: 0.8rem;" id="p-weapon-${i}">
                        ${this.weaponsList.map(w => `<option ${(pData.weapon || '').toLowerCase() === w.toLowerCase() ? 'selected' : ''} value="${w}">${w.toUpperCase()}</option>`).join('')}
                    </select>
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <label style="font-size: 0.72rem; color: #94a3b8; margin-right: 5px; cursor: pointer;">C:<input type="checkbox" ${pData.c_util !== false ? 'checked' : ''} id="p-c-${i}" style="margin-left: 2px;"></label>
                    <label style="font-size: 0.72rem; color: #94a3b8; margin-right: 5px; cursor: pointer;">Q:<input type="checkbox" ${pData.q_util !== false ? 'checked' : ''} id="p-q-${i}" style="margin-left: 2px;"></label>
                    <label style="font-size: 0.72rem; color: #94a3b8; cursor: pointer;">E:<input type="checkbox" ${pData.e_util !== false ? 'checked' : ''} id="p-e-${i}" style="margin-left: 2px;"></label>
                </td>
                <td><input type="number" min="0" max="12" class="input-field" style="width: 45px;" value="${pData.ult_points_gained ?? 0}" id="p-ult-${i}"></td>
                <td><input type="number" min="0" max="9000" class="input-field" style="width: 65px;" value="${pData.credits ?? 800}" id="p-credits-${i}"></td>
                <td style="text-align: center;">
                    <input type="checkbox" ${pData.has_spike ? 'checked' : ''} id="p-spike-${i}">
                </td>
                <td style="text-align: center;">
                    <button class="btn ${pData.is_dead ? 'btn-danger' : 'btn-success'}" style="padding: 2px 8px; font-size: 0.75rem;" onclick="liveOperator.togglePlayerDead(${i})">
                        ${pData.is_dead ? 'DEAD' : 'ALIVE'}
                    </button>
                </td>
                <td>
                    <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="liveOperator.saveSinglePlayer(${i})">
                        Save
                    </button>
                </td>
            </tr>`;
        }

        tbody.innerHTML = html;
    }

    async saveSinglePlayer(index) {
        const name = document.getElementById(`p-name-${index}`).value.trim();
        const agent = document.getElementById(`p-agent-${index}`).value;
        const hp = parseInt(document.getElementById(`p-hp-${index}`).value) || 0;
        const shield = parseInt(document.getElementById(`p-shield-${index}`).value) || 0;
        const weapon = document.getElementById(`p-weapon-${index}`).value;
        const ult = parseInt(document.getElementById(`p-ult-${index}`).value) || 0;
        const credits = parseInt(document.getElementById(`p-credits-${index}`).value) || 0;
        const hasSpike = document.getElementById(`p-spike-${index}`).checked;
        const cUtil = document.getElementById(`p-c-${index}`) ? document.getElementById(`p-c-${index}`).checked : true;
        const qUtil = document.getElementById(`p-q-${index}`) ? document.getElementById(`p-q-${index}`).checked : true;
        const eUtil = document.getElementById(`p-e-${index}`) ? document.getElementById(`p-e-${index}`).checked : true;

        const key = `player_${index}`;
        const currentDead = (this.playersData[key] && this.playersData[key].data) ? this.playersData[key].data.is_dead : false;

        const playerData = {
            username: name,
            agent: agent,
            health: hp,
            shield: shield,
            weapon: weapon,
            ult_points_needed: 7,
            ult_points_gained: ult,
            credits: credits,
            has_spike: hasSpike,
            is_dead: (hp <= 0) ? true : currentDead,
            c_util: cUtil,
            q_util: qUtil,
            e_util: eUtil,
            x_util: (ult >= 7)
        };

        const formData = new FormData();
        formData.append('playerIndex', index);
        formData.append('playerData', JSON.stringify(playerData));

        try {
            await fetch('../update_player_direct', { method: 'POST', body: formData });
            if (typeof successAlertLowerBottom === 'function') {
                successAlertLowerBottom(`Updated Player #${index + 1} (${name})`);
            }
        } catch (e) {}
    }

    async togglePlayerDead(index) {
        const key = `player_${index}`;
        const pData = (this.playersData[key] && this.playersData[key].data) ? this.playersData[key].data : {};
        const newDead = !pData.is_dead;
        pData.is_dead = newDead;
        if (newDead) pData.health = 0;
        else if (pData.health === 0) pData.health = 100;

        const formData = new FormData();
        formData.append('playerIndex', index);
        formData.append('playerData', JSON.stringify(pData));

        try {
            await fetch('../update_player_direct', { method: 'POST', body: formData });
        } catch (e) {}
    }

    async runQuickSimulation() {
        for (let i = 0; i < 10; i++) {
            const isDead = Math.random() < 0.25;
            const hp = isDead ? 0 : Math.floor(Math.random() * 85) + 15;
            const shield = isDead ? 0 : (Math.random() < 0.5 ? 50 : 25);
            const ult = Math.floor(Math.random() * 8);

            const pData = {
                username: `Player ${i + 1}`,
                agent: this.agentsList[i % this.agentsList.length],
                health: hp,
                shield: shield,
                weapon: this.weaponsList[Math.floor(Math.random() * 4)],
                ult_points_needed: 7,
                ult_points_gained: ult,
                credits: Math.floor(Math.random() * 60) * 100,
                has_spike: (i === 0),
                is_dead: isDead,
                c_util: Math.random() > 0.3,
                q_util: Math.random() > 0.3,
                e_util: Math.random() > 0.3,
                x_util: ult >= 7
            };

            const formData = new FormData();
            formData.append('playerIndex', i);
            formData.append('playerData', JSON.stringify(pData));
            await fetch('../update_player_direct', { method: 'POST', body: formData });
        }

        if (typeof successAlertLowerBottom === 'function') {
            successAlertLowerBottom('Simulated Combat Round Stats across 10 Players!');
        }
    }
}

let liveOperator;
document.addEventListener('DOMContentLoaded', () => {
    liveOperator = new LiveStreamOperator();
    liveOperator.init();
});
