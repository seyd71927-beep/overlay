class adminPreStreamInterface {
    constructor() {
        this.mapPicksDiv = document.getElementById('map-pick-holder');
        this.team1Abbr = document.getElementById('team1-abbr');
        this.team1Info = document.getElementById('team1-info');
        this.team1Icon = document.getElementById('team1-icon');

        this.team2Abbr = document.getElementById('team2-abbr');
        this.team2Info = document.getElementById('team2-info');
        this.team2Icon = document.getElementById('team2-icon');

        this.saveTeamsBtn = document.getElementById('save-teams-btn');
        this.lockTeamsToggle = document.getElementById('lock-manual-teams-toggle');

        this.seriesBadge = document.getElementById('current-series-badge');
        this.bo1Btn = document.getElementById('set-bo1-btn');
        this.bo3Btn = document.getElementById('set-bo3-btn');
        this.bo5Btn = document.getElementById('set-bo5-btn');

        this.mapbanInput = document.getElementById('mapban-url-input');
        this.syncMapbanBtn = document.getElementById('sync-mapban-btn');
    }

    async init() {
        await this.loadTeamConfiguration();
        await this.constructMapPickInterface();

        if (this.saveTeamsBtn) {
            this.saveTeamsBtn.addEventListener('click', () => this.saveTeamConfiguration());
        }

        if (this.bo1Btn) this.bo1Btn.addEventListener('click', () => this.setSeriesFormat('bo1'));
        if (this.bo3Btn) this.bo3Btn.addEventListener('click', () => this.setSeriesFormat('bo3'));
        if (this.bo5Btn) this.bo5Btn.addEventListener('click', () => this.setSeriesFormat('bo5'));
        if (this.syncMapbanBtn) this.syncMapbanBtn.addEventListener('click', () => this.syncMapBan());
        if (this.mapbanInput) {
            this.mapbanInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.syncMapBan();
                }
            });
        }
    }

    async syncMapBan() {
        if (!this.mapbanInput) return;
        const val = this.mapbanInput.value.trim();
        if (!val) {
            if (typeof errorAlertLowerBottom === 'function') {
                errorAlertLowerBottom('Please enter a MapBan.gg URL or ID');
            } else {
                alert('Please enter a MapBan.gg URL or ID');
            }
            return;
        }

        const origBtnHtml = this.syncMapbanBtn ? this.syncMapbanBtn.innerHTML : '';
        if (this.syncMapbanBtn) {
            this.syncMapbanBtn.disabled = true;
            this.syncMapbanBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
        }

        const formData = new FormData();
        formData.append('urlOrId', val);

        try {
            const res = await fetch('../sync_mapban', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(data.message || 'Synced MapBan.gg!');
                } else {
                    alert(data.message || 'Synced MapBan.gg!');
                }
                await this.loadTeamConfiguration();
                await this.constructMapPickInterface();
            } else {
                if (typeof errorAlertLowerBottom === 'function') {
                    errorAlertLowerBottom(data.message || 'Failed to sync from MapBan.gg');
                } else {
                    alert(data.message || 'Failed to sync from MapBan.gg');
                }
            }
        } catch (e) {
            console.error('Error syncing mapban:', e);
            if (typeof errorAlertLowerBottom === 'function') {
                errorAlertLowerBottom('Network error while syncing MapBan.gg');
            }
        } finally {
            if (this.syncMapbanBtn) {
                this.syncMapbanBtn.disabled = false;
                this.syncMapbanBtn.innerHTML = origBtnHtml;
            }
        }
    }

    async setSeriesFormat(format) {
        const formData = new FormData();
        formData.append('format', format);

        try {
            const res = await fetch('../set_series_format', {
                method: 'POST',
                body: formData
            });
            if (res.status === 200) {
                const label = format.toUpperCase() === 'BO1' ? 'BO1 (1 GAME)' : (format.toUpperCase() === 'BO5' ? 'BO5 (5 GAMES)' : 'BO3 (3 GAMES)');
                if (this.seriesBadge) this.seriesBadge.textContent = label;
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(`Match Format set to ${label}!`);
                }
                await this.constructMapPickInterface();
            }
        } catch (e) {
            console.error('Error setting series format:', e);
        }
    }

    async loadTeamConfiguration() {
        try {
            const res = await fetch('../get_game_configuration');
            if (res.status === 200) {
                const data = await res.json();
                if (data.team_1) {
                    if (this.team1Abbr) this.team1Abbr.value = data.team_1.abbreviation || '';
                    if (this.team1Info) this.team1Info.value = data.team_1.team_info || '';
                    if (this.team1Icon) this.team1Icon.value = data.team_1.icon_link || '';
                }
                if (data.team_2) {
                    if (this.team2Abbr) this.team2Abbr.value = data.team_2.abbreviation || '';
                    if (this.team2Info) this.team2Info.value = data.team_2.team_info || '';
                    if (this.team2Icon) this.team2Icon.value = data.team_2.icon_link || '';
                }
            }

            // Check auto-fetch status for lockTeams
            const statusRes = await fetch('../get_auto_fetch_status');
            if (statusRes.status === 200) {
                const statusData = await statusRes.json();
                if (this.lockTeamsToggle) {
                    this.lockTeamsToggle.checked = !!statusData.lockManualTeamInfo;
                }
            }
        } catch (err) {
            console.error('Error loading team config:', err);
        }
    }

    async saveTeamConfiguration() {
        const payload = new FormData();
        const team1 = {
            abbreviation: this.team1Abbr ? this.team1Abbr.value.trim() : 'T1',
            team_info: this.team1Info ? this.team1Info.value.trim() : '',
            icon_link: this.team1Icon ? this.team1Icon.value.trim() : ''
        };
        const team2 = {
            abbreviation: this.team2Abbr ? this.team2Abbr.value.trim() : 'T2',
            team_info: this.team2Info ? this.team2Info.value.trim() : '',
            icon_link: this.team2Icon ? this.team2Icon.value.trim() : ''
        };

        payload.append('team_1', JSON.stringify(team1));
        payload.append('team_2', JSON.stringify(team2));
        if (this.lockTeamsToggle) {
            payload.append('lockTeams', this.lockTeamsToggle.checked);
        }

        try {
            const res = await fetch('../set_team_info', {
                method: 'POST',
                body: payload
            });
            if (res.status === 200) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Team Configuration Saved!');
                } else {
                    alert('Team Configuration Saved!');
                }
                await this.constructMapPickInterface();
            } else {
                if (typeof errorAlertLowerBottom === 'function') {
                    errorAlertLowerBottom('Failed to save team configuration');
                }
            }
        } catch (err) {
            console.error('Error saving team config:', err);
        }
    }

    async updateMapPick(map, action, index) {
        let data = new FormData();
        data.append('index', index);
        data.append('map', map);
        data.append('action', action);

        try {
            const res = await fetch('../set_map_picks', {
                method: 'POST',
                body: data
            });
            if (res.status === 200) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(`Updated Map Pick #${index + 1}`);
                }
            } else {
                if (typeof errorAlertLowerBottom === 'function') {
                    errorAlertLowerBottom('Failed to update map pick');
                }
            }
        } catch (err) {
            console.error('Error updating map pick:', err);
        }
    }

    async constructMapPickInterface() {
        if (!this.mapPicksDiv) return;

        try {
            const res = await fetch('../get_map_picks');
            const json = await res.json();
            if (res.status === 200 && json.picks) {
                const seriesType = (json.series_type || 'bo3').toUpperCase();
                const label = seriesType === 'BO1' ? 'BO1 (1 GAME)' : (seriesType === 'BO5' ? 'BO5 (5 GAMES)' : 'BO3 (3 GAMES)');
                if (this.seriesBadge) this.seriesBadge.textContent = label;

                let html = '';
                const maps = ['abyss', 'ascent', 'bind', 'breeze', 'fracture', 'haven', 'icebox', 'lotus', 'pearl', 'split', 'sunset'];
                const t1 = (this.team1Abbr && this.team1Abbr.value.trim()) ? this.team1Abbr.value.trim() : (json.teams ? json.teams[0] : 'Team 1');
                const t2 = (this.team2Abbr && this.team2Abbr.value.trim()) ? this.team2Abbr.value.trim() : (json.teams ? json.teams[1] : 'Team 2');
                
                for (let i = 0; i < json.picks.length; i++) {
                    const currentMap = json.picks[i][0];
                    const currentAction = json.picks[i][1];
                    const isLast = (i === json.picks.length - 1);
                    const teamName = (i % 2 === 0) ? t1 : t2;
                    const pickerLabel = isLast ? 'Decider Map' : `${teamName} Action`;

                    html += `
                    <div style="display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.3); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--panel-border);">
                        <span style="font-weight: 800; color: var(--accent-primary); width: 24px;">#${i + 1}</span>
                        <div style="flex-grow: 1;">
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Map</label>
                            <select class="map-pick-map-selector input-field" data-index="${i}">
                                ${maps.map(m => `<option ${currentMap === m ? 'selected' : ''} value="${m}">${m.toUpperCase()}</option>`).join('')}
                            </select>
                        </div>
                        <div style="width: 150px;">
                            <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 2px;">${pickerLabel}</label>
                            <select class="map-pick-action-selector input-field" data-index="${i}">
                                <option ${currentAction === 'ban' ? 'selected' : ''} value="ban">❌ BAN</option>
                                <option ${currentAction === 'attack' ? 'selected' : ''} value="attack">🗡️ PICK (ATTACK)</option>
                                <option ${currentAction === 'defense' ? 'selected' : ''} value="defense">🛡️ PICK (DEFENSE)</option>
                            </select>
                        </div>
                    </div>`;
                }
                this.mapPicksDiv.innerHTML = html;

                // Attach listeners
                const mapSelectors = document.getElementsByClassName('map-pick-map-selector');
                const actionSelectors = document.getElementsByClassName('map-pick-action-selector');

                for (let i = 0; i < mapSelectors.length; i++) {
                    mapSelectors[i].addEventListener('change', (e) => {
                        const idx = parseInt(e.target.getAttribute('data-index'));
                        const mapVal = e.target.value;
                        const actionVal = actionSelectors[idx].value;
                        this.updateMapPick(mapVal, actionVal, idx);
                    });

                    actionSelectors[i].addEventListener('change', (e) => {
                        const idx = parseInt(e.target.getAttribute('data-index'));
                        const actionVal = e.target.value;
                        const mapVal = mapSelectors[idx].value;
                        this.updateMapPick(mapVal, actionVal, idx);
                    });
                }
            }
        } catch (err) {
            console.error('Error constructing map pick UI:', err);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const adminPanelLogic = new adminPreStreamInterface();
    adminPanelLogic.init();
});