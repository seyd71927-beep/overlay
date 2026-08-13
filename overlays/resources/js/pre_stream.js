class adminPreStreamInterface {
    constructor() {
        // Map Picks & Veto Controls
        this.mapPicksDiv = document.getElementById('map-pick-holder');
        this.seriesBadge = document.getElementById('current-series-badge');
        this.bo1Btn = document.getElementById('set-bo1-btn');
        this.bo3Btn = document.getElementById('set-bo3-btn');
        this.bo5Btn = document.getElementById('set-bo5-btn');

        // MapBan.gg Automated Sync
        this.mapbanInput = document.getElementById('mapban-url-input');
        this.syncMapbanBtn = document.getElementById('sync-mapban-btn');
        this.mapbanAutoSyncSelect = document.getElementById('mapban-autosync-select');
        this.vetoStatusBadge = document.getElementById('veto-status-badge');
        this.vetoLastSyncTime = document.getElementById('veto-last-sync-time');
        this.mapbanTimer = null;

        // Google Sheets Teams Directory
        this.sheetUrlInput = document.getElementById('sheet-url-input');
        this.syncSheetBtn = document.getElementById('sync-sheet-btn');
        this.autoSyncSelect = document.getElementById('auto-sync-select');
        this.syncIntervalSelect = document.getElementById('sync-interval-select');
        this.teamsGridContainer = document.getElementById('teams-grid-container');
        this.teamSearchInput = document.getElementById('team-search-input');
        this.teamsCountBadge = document.getElementById('teams-count-badge');
        this.uploadCsvBtn = document.getElementById('upload-csv-btn');
        this.teamsCsvInput = document.getElementById('teams-csv-input');
        this.addTeamBtn = document.getElementById('add-team-btn');
        this.loadSampleTeamsBtn = document.getElementById('load-sample-teams-btn');

        // Team Add/Edit Modal
        this.teamModal = document.getElementById('team-modal');
        this.modalTitle = document.getElementById('team-modal-title');
        this.modalTeamId = document.getElementById('modal-team-id');
        this.modalTeamName = document.getElementById('modal-team-name');
        this.modalTeamTag = document.getElementById('modal-team-tag');
        this.modalTeamSeed = document.getElementById('modal-team-seed');
        this.modalTeamLogo = document.getElementById('modal-team-logo');
        this.modalTeamRoster = document.getElementById('modal-team-roster');
        this.saveModalTeamBtn = document.getElementById('save-modal-team-btn');

        this.teams = [];
        this.autoSyncTimer = null;
    }

    async init() {
        await this.constructMapPickInterface();
        await this.loadTournamentTeams();

        // Series presets (BO1, BO3, BO5)
        if (this.bo1Btn) this.bo1Btn.addEventListener('click', () => this.setSeriesFormat('bo1'));
        if (this.bo3Btn) this.bo3Btn.addEventListener('click', () => this.setSeriesFormat('bo3'));
        if (this.bo5Btn) this.bo5Btn.addEventListener('click', () => this.setSeriesFormat('bo5'));

        // MapBan Automated Sync
        if (this.syncMapbanBtn) this.syncMapbanBtn.addEventListener('click', () => this.syncMapBan());
        if (this.mapbanInput) {
            this.mapbanInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.syncMapBan();
                }
            });
            this.mapbanInput.addEventListener('paste', () => {
                setTimeout(() => this.syncMapBan(), 300);
            });
        }
        if (this.mapbanAutoSyncSelect) {
            this.mapbanAutoSyncSelect.addEventListener('change', () => this.manageMapbanAutoSync());
            this.manageMapbanAutoSync();
        }

        // Google Sheet Sync
        if (this.syncSheetBtn) {
            this.syncSheetBtn.addEventListener('click', () => this.syncGoogleSheet());
        }
        if (this.sheetUrlInput) {
            this.sheetUrlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.syncGoogleSheet();
                }
            });
        }

        // Auto Sync config changes
        if (this.autoSyncSelect) {
            this.autoSyncSelect.addEventListener('change', () => this.saveSheetConfig());
        }
        if (this.syncIntervalSelect) {
            this.syncIntervalSelect.addEventListener('change', () => this.saveSheetConfig());
        }

        // Search Teams
        if (this.teamSearchInput) {
            this.teamSearchInput.addEventListener('input', (e) => this.filterTeams(e.target.value));
        }

        // CSV File Upload
        if (this.uploadCsvBtn && this.teamsCsvInput) {
            this.uploadCsvBtn.addEventListener('click', () => this.teamsCsvInput.click());
            this.teamsCsvInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.uploadCsvFile(e.target.files[0]);
                }
            });
        }

        // Add Team Modal
        if (this.addTeamBtn) {
            this.addTeamBtn.addEventListener('click', () => this.openTeamModal());
        }
        if (this.saveModalTeamBtn) {
            this.saveModalTeamBtn.addEventListener('click', () => this.saveModalTeam());
        }

        // Load Sample Teams
        if (this.loadSampleTeamsBtn) {
            this.loadSampleTeamsBtn.addEventListener('click', () => this.loadSampleTeams());
        }
    }

    // ==========================================
    // MAPBAN.GG AUTOMATED SYNC ENGINE
    // ==========================================

    manageMapbanAutoSync() {
        if (this.mapbanTimer) {
            clearInterval(this.mapbanTimer);
            this.mapbanTimer = null;
        }

        if (!this.mapbanAutoSyncSelect) return;
        const val = this.mapbanAutoSyncSelect.value;
        const sec = parseInt(val);

        if (!isNaN(sec) && sec > 0) {
            this.mapbanTimer = setInterval(() => {
                if (this.mapbanInput && this.mapbanInput.value.trim()) {
                    this.syncMapBan(true);
                }
            }, sec * 1000);
        }
    }

    async syncMapBan(silent = false) {
        if (!this.mapbanInput) return;
        const val = this.mapbanInput.value.trim();
        if (!val) {
            if (!silent) {
                if (typeof errorAlertLowerBottom === 'function') {
                    errorAlertLowerBottom('Please enter a MapBan.gg URL or Room ID');
                } else {
                    alert('Please enter a MapBan.gg URL or Room ID');
                }
            }
            return;
        }

        const origBtnHtml = this.syncMapbanBtn ? this.syncMapbanBtn.innerHTML : '';
        if (this.syncMapbanBtn && !silent) {
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
                if (this.vetoStatusBadge) {
                    this.vetoStatusBadge.textContent = '🟢 MAPBAN LIVE SYNCED';
                    this.vetoStatusBadge.style.color = '#00e676';
                    this.vetoStatusBadge.style.borderColor = 'rgba(0, 230, 118, 0.3)';
                    this.vetoStatusBadge.style.background = 'rgba(0, 230, 118, 0.15)';
                }
                if (this.vetoLastSyncTime) {
                    const now = new Date();
                    this.vetoLastSyncTime.textContent = `Last Synced: ${now.toLocaleTimeString()}`;
                }
                if (!silent) {
                    if (typeof successAlertLowerBottom === 'function') {
                        successAlertLowerBottom(data.message || 'Synced MapBan.gg!');
                    } else {
                        alert(data.message || 'Synced MapBan.gg!');
                    }
                }
                await this.constructMapPickInterface();
            } else {
                if (!silent) {
                    if (typeof errorAlertLowerBottom === 'function') {
                        errorAlertLowerBottom(data.message || 'Failed to sync from MapBan.gg');
                    } else {
                        alert(data.message || 'Failed to sync from MapBan.gg');
                    }
                }
            }
        } catch (e) {
            console.error('Error syncing mapban:', e);
            if (!silent) {
                if (typeof errorAlertLowerBottom === 'function') {
                    errorAlertLowerBottom('Network error while syncing MapBan.gg');
                }
            }
        } finally {
            if (this.syncMapbanBtn && !silent) {
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

    async constructMapPickInterface() {
        if (!this.mapPicksDiv) return;

        try {
            const res = await fetch('../get_map_picks');
            const json = await res.json();
            if (res.status === 200 && json.picks) {
                const seriesType = (json.series_type || 'bo3').toUpperCase();
                const label = seriesType === 'BO1' ? 'BO1 (1 GAME)' : (seriesType === 'BO5' ? 'BO5 (5 GAMES)' : 'BO3 (3 GAMES)');
                if (this.seriesBadge) this.seriesBadge.textContent = label;

                if (!json.picks || json.picks.length === 0) {
                    this.mapPicksDiv.innerHTML = `
                        <div style="grid-column: 1 / -1; text-align: center; padding: 28px; color: var(--text-muted); font-size: 0.85rem;">
                            <i class="fa-solid fa-cloud-arrow-down" style="font-size: 2rem; color: #b388f5; margin-bottom: 8px; display: block; opacity: 0.6;"></i>
                            Paste your <b>MapBan.gg Viewer Link</b> above to automatically sync and render the live pick/ban veto sequence!
                        </div>
                    `;
                    return;
                }

                let html = '';
                const teams = json.teams || ['TEAM 1', 'TEAM 2'];
                const totalPicks = json.picks.length;

                for (let i = 0; i < totalPicks; i++) {
                    const currentMap = (json.picks[i][0] || 'ascent').toLowerCase();
                    const currentAction = (json.picks[i][1] || 'ban').toLowerCase();
                    const isLast = (i === totalPicks - 1);
                    const teamName = (i % 2 === 0) ? (teams[0] || 'T1') : (teams[1] || 'T2');
                    
                    let actionBadge = '';
                    let borderColor = 'rgba(255, 255, 255, 0.1)';

                    if (currentAction === 'ban') {
                        borderColor = 'rgba(255, 42, 95, 0.4)';
                        actionBadge = `
                            <span style="background: rgba(255, 42, 95, 0.2); color: #ff2a5f; border: 1px solid rgba(255, 42, 95, 0.4); padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">
                                <i class="fa-solid fa-xmark"></i> BANNED (${teamName})
                            </span>`;
                    } else if (isLast) {
                        borderColor = 'rgba(255, 215, 0, 0.5)';
                        actionBadge = `
                            <span style="background: rgba(255, 215, 0, 0.2); color: #ffd700; border: 1px solid rgba(255, 215, 0, 0.4); padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">
                                <i class="fa-solid fa-trophy"></i> DECIDER MAP
                            </span>`;
                    } else if (currentAction === 'attack') {
                        borderColor = 'rgba(0, 230, 118, 0.4)';
                        actionBadge = `
                            <span style="background: rgba(0, 230, 118, 0.2); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.4); padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">
                                <i class="fa-solid fa-crosshairs"></i> ${teamName} (ATK)
                            </span>`;
                    } else if (currentAction === 'defense') {
                        borderColor = 'rgba(0, 242, 254, 0.4)';
                        actionBadge = `
                            <span style="background: rgba(0, 242, 254, 0.2); color: #00f2fe; border: 1px solid rgba(0, 242, 254, 0.4); padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">
                                <i class="fa-solid fa-shield-halved"></i> ${teamName} (DEF)
                            </span>`;
                    } else {
                        borderColor = 'rgba(0, 230, 118, 0.4)';
                        actionBadge = `
                            <span style="background: rgba(0, 230, 118, 0.2); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.4); padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">
                                <i class="fa-solid fa-check"></i> ${teamName} PICK
                            </span>`;
                    }

                    const mapImgUrl = `../visual_assets/map_images/${currentMap}.webp`;

                    html += `
                    <div style="background: rgba(20, 24, 36, 0.95); border: 1px solid ${borderColor}; border-radius: var(--radius-md); overflow: hidden; position: relative; display: flex; flex-direction: column; min-height: 110px;">
                        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${mapImgUrl}'), url('/visual_assets/map_images/${currentMap}.webp'); background-size: cover; background-position: center; opacity: 0.35; z-index: 1;"></div>
                        <div style="position: relative; z-index: 2; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.72rem; font-weight: 800; color: #b388f5; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 4px;">
                                    #${i + 1}
                                </span>
                                <span style="font-size: 0.72rem; color: #fff; font-weight: 700; text-shadow: 0 0 4px #000;">
                                    ${isLast ? 'DECIDER' : `${teamName}`}
                                </span>
                            </div>
                            <div style="margin: 8px 0;">
                                <span style="font-family: var(--font-display); font-size: 1.2rem; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 1px; text-shadow: 0 0 8px rgba(0,0,0,0.8);">
                                    ${currentMap}
                                </span>
                            </div>
                            <div>
                                ${actionBadge}
                            </div>
                        </div>
                    </div>`;
                }
                this.mapPicksDiv.innerHTML = html;
            }
        } catch (err) {
            console.error('Error constructing map pick UI:', err);
        }
    }

    // ==========================================
    // GOOGLE SHEETS & TEAMS DIRECTORY ENGINE
    // ==========================================

    async loadTournamentTeams() {
        try {
            const res = await fetch('/api/tournament/data');
            if (res.status === 200) {
                const data = await res.json();
                this.teams = data.teams || [];
                if (this.sheetUrlInput && data.spreadsheetUrl) {
                    this.sheetUrlInput.value = data.spreadsheetUrl;
                }
                if (this.autoSyncSelect && typeof data.autoSync !== 'undefined') {
                    this.autoSyncSelect.value = data.autoSync ? 'true' : 'false';
                }
                if (this.syncIntervalSelect && data.syncInterval) {
                    this.syncIntervalSelect.value = String(data.syncInterval);
                }

                this.renderTeamsGrid(this.teams);
                this.manageAutoSyncTimer();
            }
        } catch (err) {
            console.error('Error loading tournament teams:', err);
        }
    }

    renderTeamsGrid(teamsList) {
        if (!this.teamsGridContainer) return;

        if (this.teamsCountBadge) {
            this.teamsCountBadge.textContent = `${teamsList.length} TEAMS LOADED`;
        }

        if (!teamsList || teamsList.length === 0) {
            this.teamsGridContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.85rem;">
                    <i class="fa-solid fa-cloud-arrow-down" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5; display: block;"></i>
                    No teams loaded yet. Paste your Google Sheet link above and click <b>"Sync with Google Sheet"</b> or <b>"Load Sample Teams"</b>!
                </div>
            `;
            return;
        }

        let html = '';
        teamsList.forEach((team) => {
            const logoSrc = team.logo || '../visual_assets/blueTeamPlaceholder.jpg';
            const seedBadge = team.seed ? `<span style="background: rgba(0, 242, 254, 0.12); color: #00f2fe; border: 1px solid rgba(0, 242, 254, 0.3); padding: 1px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">${team.seed}</span>` : '';
            const playersList = (team.players && Array.isArray(team.players) && team.players.length > 0)
                ? team.players.slice(0, 5).map(p => `<span style="background: rgba(255,255,255,0.06); padding: 2px 5px; border-radius: 3px; font-size: 0.68rem; color: #d0d7de;">${p}</span>`).join(' ')
                : '<span style="font-size: 0.68rem; color: var(--text-muted); font-style: italic;">No roster listed</span>';

            html += `
            <div class="team-card" data-team-id="${team.id || ''}">
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
                    <img src="${logoSrc}" class="team-logo-preview" alt="${team.name}" onerror="this.src='../visual_assets/blueTeamPlaceholder.jpg'">
                    <div style="flex-grow: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-weight: 800; font-size: 0.95rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${team.name || team.tag}
                            </span>
                            <span style="background: rgba(255, 70, 85, 0.15); color: var(--accent-primary); padding: 1px 5px; border-radius: 3px; font-size: 0.7rem; font-weight: 800;">
                                ${team.tag || 'TEAM'}
                            </span>
                            ${seedBadge}
                        </div>
                        <div style="margin-top: 5px; display: flex; flex-wrap: wrap; gap: 3px;">
                            ${playersList}
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 6px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
                    <button class="btn btn-success set-t1-btn" style="flex: 1; padding: 5px 8px; font-size: 0.72rem; font-weight: 700;" data-tag="${team.tag}">
                        <i class="fa-solid fa-shield"></i> Set Team 1
                    </button>
                    <button class="btn btn-danger set-t2-btn" style="flex: 1; padding: 5px 8px; font-size: 0.72rem; font-weight: 700;" data-tag="${team.tag}">
                        <i class="fa-solid fa-shield"></i> Set Team 2
                    </button>
                    <button class="btn edit-team-btn" style="padding: 5px 8px; font-size: 0.72rem; background: rgba(255,255,255,0.08);" data-id="${team.id}">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn delete-team-btn" style="padding: 5px 8px; font-size: 0.72rem; background: rgba(255, 42, 95, 0.12); color: #ff2a5f;" data-id="${team.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
        });

        this.teamsGridContainer.innerHTML = html;

        // Attach card action listeners
        const setT1Btns = this.teamsGridContainer.getElementsByClassName('set-t1-btn');
        const setT2Btns = this.teamsGridContainer.getElementsByClassName('set-t2-btn');
        const editBtns = this.teamsGridContainer.getElementsByClassName('edit-team-btn');
        const deleteBtns = this.teamsGridContainer.getElementsByClassName('delete-team-btn');

        for (const btn of setT1Btns) {
            btn.addEventListener('click', () => {
                const tag = btn.getAttribute('data-tag');
                this.setActiveTeamSlot('team_1', tag);
            });
        }

        for (const btn of setT2Btns) {
            btn.addEventListener('click', () => {
                const tag = btn.getAttribute('data-tag');
                this.setActiveTeamSlot('team_2', tag);
            });
        }

        for (const btn of editBtns) {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const team = this.teams.find(t => t.id === id);
                if (team) this.openTeamModal(team);
            });
        }

        for (const btn of deleteBtns) {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                this.deleteTeam(id);
            });
        }
    }

    async setActiveTeamSlot(slot, teamTag) {
        const team = this.teams.find(t => 
            (t.tag && t.tag.toUpperCase() === teamTag.toUpperCase()) || 
            (t.name && t.name.toUpperCase() === teamTag.toUpperCase())
        );

        if (!team) return;

        // Call backend to update gameState & player rosters
        const formData = new FormData();
        formData.append('slot', slot);
        formData.append('teamTag', team.tag || team.name);

        try {
            const res = await fetch('/api/tournament/set_active_team', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status) {
                const slotLabel = slot === 'team_1' ? 'Team 1 (Green/Left)' : 'Team 2 (Red/Right)';
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(`Loaded ${team.name || team.tag} as ${slotLabel}!`);
                } else {
                    alert(`Loaded ${team.name || team.tag} as ${slotLabel}!`);
                }
                await this.constructMapPickInterface();
            }
        } catch (err) {
            console.error('Error setting active team:', err);
        }
    }

    filterTeams(query) {
        if (!query || query.trim() === '') {
            this.renderTeamsGrid(this.teams);
            return;
        }
        const q = query.toLowerCase().trim();
        const filtered = this.teams.filter(t => 
            (t.name && t.name.toLowerCase().includes(q)) ||
            (t.tag && t.tag.toLowerCase().includes(q)) ||
            (t.seed && t.seed.toLowerCase().includes(q)) ||
            (t.players && Array.isArray(t.players) && t.players.some(p => p.toLowerCase().includes(q)))
        );
        this.renderTeamsGrid(filtered);
    }

    async syncGoogleSheet() {
        if (!this.sheetUrlInput) return;
        const url = this.sheetUrlInput.value.trim();
        if (!url) {
            if (typeof errorAlertLowerBottom === 'function') {
                errorAlertLowerBottom('Please paste a Google Spreadsheet link');
            } else {
                alert('Please paste a Google Spreadsheet link');
            }
            return;
        }

        const origHtml = this.syncSheetBtn ? this.syncSheetBtn.innerHTML : '';
        if (this.syncSheetBtn) {
            this.syncSheetBtn.disabled = true;
            this.syncSheetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing all sheets...';
        }

        const formData = new FormData();
        formData.append('spreadsheetUrl', url);

        try {
            const res = await fetch('/api/tournament/sync_sheet', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(data.message || 'Google Sheet Synchronized!');
                } else {
                    alert(data.message || 'Google Sheet Synchronized!');
                }
                await this.loadTournamentTeams();
            } else {
                if (typeof errorAlertLowerBottom === 'function') {
                    errorAlertLowerBottom(data.message || 'Failed to sync Google Sheet');
                } else {
                    alert(data.message || 'Failed to sync Google Sheet');
                }
            }
        } catch (err) {
            console.error('Error syncing sheet:', err);
            if (typeof errorAlertLowerBottom === 'function') {
                errorAlertLowerBottom('Network error during Google Sheet sync');
            }
        } finally {
            if (this.syncSheetBtn) {
                this.syncSheetBtn.disabled = false;
                this.syncSheetBtn.innerHTML = origHtml;
            }
        }
    }

    async uploadCsvFile(file) {
        if (!file) return;

        const formData = new FormData();
        formData.append('sheetFile', file);

        try {
            const res = await fetch('/api/tournament/upload_sheet_file', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(data.message || 'CSV file loaded successfully!');
                } else {
                    alert(data.message || 'CSV file loaded successfully!');
                }
                await this.loadTournamentTeams();
            } else {
                if (typeof errorAlertLowerBottom === 'function') {
                    errorAlertLowerBottom(data.message || 'Failed to parse CSV file');
                }
            }
        } catch (err) {
            console.error('Error uploading CSV:', err);
        } finally {
            if (this.teamsCsvInput) this.teamsCsvInput.value = '';
        }
    }

    async loadSampleTeams() {
        try {
            const res = await fetch('/api/tournament/sample_data');
            const data = await res.json();
            if (data && data.teams && data.teams.length > 0) {
                this.teams = data.teams;
                this.renderTeamsGrid(this.teams);
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(`Loaded ${this.teams.length} sample tournament teams!`);
                }
            }
        } catch (err) {
            console.error('Error loading sample teams:', err);
        }
    }

    async saveSheetConfig() {
        const formData = new FormData();
        if (this.sheetUrlInput) formData.append('spreadsheetUrl', this.sheetUrlInput.value.trim());
        if (this.autoSyncSelect) formData.append('autoSync', this.autoSyncSelect.value);
        if (this.syncIntervalSelect) formData.append('syncInterval', this.syncIntervalSelect.value);

        try {
            await fetch('/api/tournament/save_config', {
                method: 'POST',
                body: formData
            });
            this.manageAutoSyncTimer();
        } catch (err) {
            console.error('Error saving sheet config:', err);
        }
    }

    manageAutoSyncTimer() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }

        const isAuto = this.autoSyncSelect ? (this.autoSyncSelect.value === 'true') : false;
        const intervalSec = this.syncIntervalSelect ? parseInt(this.syncIntervalSelect.value) : 60;

        if (isAuto && intervalSec > 0) {
            this.autoSyncTimer = setInterval(() => {
                if (this.sheetUrlInput && this.sheetUrlInput.value.trim()) {
                    this.syncGoogleSheet();
                }
            }, intervalSec * 1000);
        }
    }

    openTeamModal(team = null) {
        if (!this.teamModal) return;
        if (team) {
            if (this.modalTitle) this.modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Team';
            if (this.modalTeamId) this.modalTeamId.value = team.id || '';
            if (this.modalTeamName) this.modalTeamName.value = team.name || '';
            if (this.modalTeamTag) this.modalTeamTag.value = team.tag || '';
            if (this.modalTeamSeed) this.modalTeamSeed.value = team.seed || '';
            if (this.modalTeamLogo) this.modalTeamLogo.value = team.logo || '';
            if (this.modalTeamRoster) this.modalTeamRoster.value = (team.players && Array.isArray(team.players)) ? team.players.join(', ') : '';
        } else {
            if (this.modalTitle) this.modalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Add New Team';
            if (this.modalTeamId) this.modalTeamId.value = '';
            if (this.modalTeamName) this.modalTeamName.value = '';
            if (this.modalTeamTag) this.modalTeamTag.value = '';
            if (this.modalTeamSeed) this.modalTeamSeed.value = '';
            if (this.modalTeamLogo) this.modalTeamLogo.value = '';
            if (this.modalTeamRoster) this.modalTeamRoster.value = '';
        }
        this.teamModal.style.display = 'flex';
    }

    async saveModalTeam() {
        const name = this.modalTeamName ? this.modalTeamName.value.trim() : '';
        const tag = this.modalTeamTag ? this.modalTeamTag.value.trim() : '';
        if (!name || !tag) {
            alert('Team Name and Tag are required');
            return;
        }

        const formData = new FormData();
        if (this.modalTeamId && this.modalTeamId.value) formData.append('id', this.modalTeamId.value);
        formData.append('name', name);
        formData.append('tag', tag);
        if (this.modalTeamSeed) formData.append('seed', this.modalTeamSeed.value.trim());
        if (this.modalTeamLogo) formData.append('logo', this.modalTeamLogo.value.trim());
        if (this.modalTeamRoster) formData.append('players', this.modalTeamRoster.value.trim());

        try {
            const res = await fetch('/api/tournament/save_team', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status) {
                if (this.teamModal) this.teamModal.style.display = 'none';
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(`Saved team ${name}!`);
                }
                await this.loadTournamentTeams();
            }
        } catch (err) {
            console.error('Error saving modal team:', err);
        }
    }

    async deleteTeam(teamId) {
        if (!confirm('Are you sure you want to delete this team?')) return;

        const formData = new FormData();
        formData.append('teamId', teamId);

        try {
            const res = await fetch('/api/tournament/delete_team', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Team deleted');
                }
                await this.loadTournamentTeams();
            }
        } catch (err) {
            console.error('Error deleting team:', err);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const adminPanelLogic = new adminPreStreamInterface();
    adminPanelLogic.init();
});