/**
 * ZENX TOURNAMENT OVERLAY - Tournament Mode & Google Sheets Manager
 */

class TournamentManager {
    constructor() {
        this.tournamentData = {
            spreadsheetUrl: '',
            autoSync: false,
            syncInterval: 60,
            lastSync: null,
            tournamentName: 'ZENX VALORANT TOURNAMENT',
            teams: [],
            matches: []
        };
        this.activeFilter = 'all';
        this.autoSyncTimer = null;
    }

    async init() {
        this.bindEvents();
        await this.loadTournamentData();
        this.setupAutoSync();

        // Listen for live socket updates
        if (typeof io !== 'undefined') {
            try {
                const socket = io();
                socket.on('tournamentUpdate', (data) => {
                    if (data) {
                        this.tournamentData = data;
                        this.renderAll();
                    }
                });
            } catch (e) { }
        }
    }

    bindEvents() {
        document.getElementById('sync-sheet-btn')?.addEventListener('click', () => this.syncGoogleSheet());
        document.getElementById('save-sheet-config-btn')?.addEventListener('click', () => this.saveSheetConfig());
        document.getElementById('load-sample-btn')?.addEventListener('click', () => this.loadSampleData());
        document.getElementById('add-match-btn')?.addEventListener('click', () => this.openMatchModal());
        document.getElementById('add-team-btn')?.addEventListener('click', () => this.openTeamModal());
        document.getElementById('save-match-modal-btn')?.addEventListener('click', () => this.saveMatchFromModal());
        document.getElementById('save-team-modal-btn')?.addEventListener('click', () => this.saveTeamFromModal());
        document.getElementById('sheet-guide-btn')?.addEventListener('click', () => this.openSheetGuideModal());

        // Direct CSV Upload
        const csvBtn = document.getElementById('upload-csv-btn');
        const csvInput = document.getElementById('csv-file-input');
        csvBtn?.addEventListener('click', () => csvInput?.click());
        csvInput?.addEventListener('change', (e) => this.uploadCsvFile(e.target.files[0]));

        // Logo Upload in modal
        document.getElementById('modal-upload-logo-btn')?.addEventListener('click', () => this.uploadModalLogoFile());

        // Filter pills
        document.querySelectorAll('.filter-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.activeFilter = e.target.dataset.filter || 'all';
                this.renderMatches();
            });
        });

        // Search team
        document.getElementById('team-search-input')?.addEventListener('input', (e) => {
            this.renderTeams(e.target.value);
        });
    }

    async uploadCsvFile(file) {
        if (!file) return;
        const formData = new FormData();
        formData.append('sheetFile', file);

        const btn = document.getElementById('upload-csv-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Parsing CSV...';
        }

        try {
            const res = await fetch('../api/tournament/upload_sheet_file', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.status === 200 && data.status) {
                this.tournamentData = data.tournamentData;
                this.renderAll();
                this.updateSyncStatusBadge();
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(data.message);
                } else {
                    alert(data.message);
                }
            } else {
                alert(data.message || 'Failed to upload CSV file');
            }
        } catch (e) {
            alert('Upload error: ' + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-file-arrow-up"></i> Upload CSV File Directly';
            }
        }
    }

    async uploadModalLogoFile() {
        const fileInput = document.getElementById('modal-team-file-input');
        const file = fileInput?.files?.[0];
        const tag = document.getElementById('modal-team-tag')?.value.trim();

        if (!file) {
            alert('Please select an image file to upload first!');
            return;
        }

        const formData = new FormData();
        formData.append('logoFile', file);
        formData.append('teamTag', tag || 'TEAM');

        try {
            const res = await fetch('../api/tournament/upload_team_logo', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.status === 200 && data.status) {
                document.getElementById('modal-team-logo').value = data.logoUrl;
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Logo uploaded successfully!');
                }
            } else {
                alert(data.message || 'Upload failed');
            }
        } catch (e) {
            alert('Error uploading logo: ' + e.message);
        }
    }

    async loadTournamentData() {
        try {
            const res = await fetch('../api/tournament/data');
            if (res.status === 200) {
                this.tournamentData = await res.json();
                this.populateFormFields();
                this.renderAll();
            }
        } catch (e) {
            console.error('Failed to load tournament data:', e);
        }
    }

    populateFormFields() {
        const urlInput = document.getElementById('sheet-url-input');
        const autoSyncSelect = document.getElementById('auto-sync-select');
        const intervalSelect = document.getElementById('sync-interval-select');
        const tourneyNameInput = document.getElementById('tournament-name-input');

        if (urlInput && this.tournamentData.spreadsheetUrl) {
            urlInput.value = this.tournamentData.spreadsheetUrl;
        }
        if (autoSyncSelect && typeof this.tournamentData.autoSync === 'boolean') {
            autoSyncSelect.value = String(this.tournamentData.autoSync);
        }
        if (intervalSelect && this.tournamentData.syncInterval) {
            intervalSelect.value = String(this.tournamentData.syncInterval);
        }
        if (tourneyNameInput && this.tournamentData.tournamentName) {
            tourneyNameInput.value = this.tournamentData.tournamentName;
        }
        this.updateSyncStatusBadge();
    }

    updateSyncStatusBadge() {
        const badge = document.getElementById('last-sync-badge');
        if (badge) {
            if (this.tournamentData.lastSync) {
                const dateStr = new Date(this.tournamentData.lastSync).toLocaleTimeString();
                badge.textContent = `LAST SYNCED: ${dateStr}`;
                badge.style.color = '#00e676';
            } else {
                badge.textContent = 'NEVER SYNCED';
                badge.style.color = '#8a96a8';
            }
        }
    }

    setupAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }

        if (this.tournamentData.autoSync && this.tournamentData.spreadsheetUrl) {
            const intervalSec = (this.tournamentData.syncInterval || 60) * 1000;
            this.autoSyncTimer = setInterval(() => {
                this.syncGoogleSheet(true);
            }, Math.max(15000, intervalSec));
        }
    }

    async saveSheetConfig() {
        const url = document.getElementById('sheet-url-input')?.value.trim() || '';
        const autoSync = document.getElementById('auto-sync-select')?.value === 'true';
        const interval = parseInt(document.getElementById('sync-interval-select')?.value) || 60;
        const name = document.getElementById('tournament-name-input')?.value.trim() || 'ZENX VALORANT TOURNAMENT';

        const formData = new FormData();
        formData.append('spreadsheetUrl', url);
        formData.append('autoSync', autoSync);
        formData.append('syncInterval', interval);
        formData.append('tournamentName', name);

        try {
            const res = await fetch('../api/tournament/save_config', { method: 'POST', body: formData });
            if (res.status === 200) {
                const data = await res.json();
                this.tournamentData = data.tournamentData;
                this.setupAutoSync();
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Tournament & Sheet Settings Saved!');
                } else {
                    alert('Tournament settings saved!');
                }
            }
        } catch (e) {
            alert('Failed to save tournament settings');
        }
    }

    async syncGoogleSheet(isSilent = false) {
        const urlInput = document.getElementById('sheet-url-input');
        const url = urlInput ? urlInput.value.trim() : '';

        if (!url) {
            alert('Please paste your Google Spreadsheet link first!');
            return;
        }

        const syncBtn = document.getElementById('sync-sheet-btn');
        if (syncBtn && !isSilent) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching Sheet...';
        }

        const formData = new FormData();
        formData.append('spreadsheetUrl', url);

        try {
            const res = await fetch('../api/tournament/sync_sheet', { method: 'POST', body: formData });
            const data = await res.json();

            if (res.status === 200 && data.status) {
                this.tournamentData = data.tournamentData;
                this.renderAll();
                this.updateSyncStatusBadge();
                if (!isSilent) {
                    if (typeof successAlertLowerBottom === 'function') {
                        successAlertLowerBottom(`Auto-Fetched ${data.teamsCount} Teams & ${data.matchesCount} Matches!`);
                    } else {
                        alert(data.message);
                    }
                }
            } else {
                if (!isSilent) alert(data.message || 'Failed to sync Google Sheet');
            }
        } catch (e) {
            if (!isSilent) alert('Error connecting to Google Sheet: ' + e.message);
        } finally {
            if (syncBtn && !isSilent) {
                syncBtn.disabled = false;
                syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Sync with Google Sheet';
            }
        }
    }

    renderAll() {
        this.renderMatches();
        this.renderTeams();
        this.populateTeamSelectorsInModal();
    }

    renderMatches() {
        const container = document.getElementById('matches-grid');
        if (!container) return;

        let matches = this.tournamentData.matches || [];
        if (this.activeFilter !== 'all') {
            matches = matches.filter(m => (m.status || '').toLowerCase() === this.activeFilter.toLowerCase());
        }

        if (matches.length === 0) {
            container.innerHTML = `
                <div style="grid-column: span 12; text-align: center; padding: 32px; background: rgba(0,0,0,0.2); border-radius: var(--radius-md); border: 1px dashed var(--panel-border);">
                    <i class="fa-solid fa-calendar-xmark" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 8px;"></i>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">No matches found. Click "Sync with Google Sheet" or "➕ Add Match Manually"!</p>
                </div>`;
            return;
        }

        let html = '';
        matches.forEach(m => {
            const t1 = this.findTeamByTag(m.team_1_tag);
            const t2 = this.findTeamByTag(m.team_2_tag);

            const t1Logo = t1?.logo || '';
            const t2Logo = t2?.logo || '';
            const t1Name = t1?.name || m.team_1_tag || 'Team 1';
            const t2Name = t2?.name || m.team_2_tag || 'Team 2';

            const t1ImgTag = t1Logo ? `<img src="${t1Logo}" alt="${m.team_1_tag}" class="match-team-logo" onerror="if (!this.dataset.triedProxy && '${t1Logo}'.startsWith('http')) { this.dataset.triedProxy='true'; this.src='../api/tournament/proxy_image?url=' + encodeURIComponent('${t1Logo}'); } else { this.onerror=null; this.style.display='none'; }">` : '';
            const t2ImgTag = t2Logo ? `<img src="${t2Logo}" alt="${m.team_2_tag}" class="match-team-logo" onerror="if (!this.dataset.triedProxy && '${t2Logo}'.startsWith('http')) { this.dataset.triedProxy='true'; this.src='../api/tournament/proxy_image?url=' + encodeURIComponent('${t2Logo}'); } else { this.onerror=null; this.style.display='none'; }">` : '';

            const statusClass = (m.status === 'LIVE') ? 'status-live' : (m.status === 'FINISHED') ? 'status-finished' : 'status-upcoming';
            const isLive = m.status === 'LIVE';

            html += `
            <div class="match-card ${isLive ? 'live-border' : ''}">
                <div class="match-card-header">
                    <span class="match-stage-title"><i class="fa-solid fa-trophy"></i> ${m.stage || 'MATCH'}</span>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <span class="format-badge">${m.format || 'BO3'}</span>
                        <span class="status-pill ${statusClass}">${m.status || 'UPCOMING'}</span>
                    </div>
                </div>

                <div class="match-vs-container">
                    <div class="match-team-block left">
                        ${t1ImgTag}
                        <div class="match-team-info">
                            <span class="match-team-tag">${m.team_1_tag}</span>
                            <span class="match-team-name">${t1Name}</span>
                        </div>
                    </div>

                    <div class="match-score-badge">
                        <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 2px;">${m.scheduled_time || 'TIME TBD'}</span>
                        <span class="match-score-text">${m.score || 'VS'}</span>
                    </div>

                    <div class="match-team-block right">
                        <div class="match-team-info right-align">
                            <span class="match-team-tag">${m.team_2_tag}</span>
                            <span class="match-team-name">${t2Name}</span>
                        </div>
                        ${t2ImgTag}
                    </div>
                </div>

                <div class="match-card-actions">
                    <button class="btn btn-primary btn-load-match" onclick="window.tourneyMgr.loadMatchToOverlay('${m.id}')">
                        <i class="fa-solid fa-play"></i> LOAD MATCH INTO LIVE OVERLAY
                    </button>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn" style="padding: 6px 10px; font-size: 0.75rem; background: rgba(255,255,255,0.06);" onclick="window.tourneyMgr.editMatch('${m.id}')">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn btn-danger" style="padding: 6px 10px; font-size: 0.75rem;" onclick="window.tourneyMgr.deleteMatch('${m.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    }

    renderTeams(searchQuery = '') {
        const container = document.getElementById('teams-grid');
        if (!container) return;

        let teams = this.tournamentData.teams || [];
        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase().trim();
            teams = teams.filter(t =>
                (t.name && t.name.toLowerCase().includes(q)) ||
                (t.tag && t.tag.toLowerCase().includes(q)) ||
                (t.seed && t.seed.toLowerCase().includes(q))
            );
        }

        if (teams.length === 0) {
            container.innerHTML = `
                <div style="grid-column: span 12; text-align: center; padding: 32px; background: rgba(0,0,0,0.2); border-radius: var(--radius-md); border: 1px dashed var(--panel-border);">
                    <i class="fa-solid fa-users-slash" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 8px;"></i>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">No teams found. Auto-fetch from Google Sheet, upload CSV, or click "➕ Add Team Manually"!</p>
                </div>`;
            return;
        }

        let html = '';
        teams.forEach(t => {
            const logoUrl = t.logo || '';
            const logoImgTag = logoUrl ? `<img src="${logoUrl}" alt="${t.tag}" class="team-card-logo" onerror="if (!this.dataset.triedProxy && '${logoUrl}'.startsWith('http')) { this.dataset.triedProxy='true'; this.src='../api/tournament/proxy_image?url=' + encodeURIComponent('${logoUrl}'); } else { this.onerror=null; this.style.display='none'; }">` : `<div class="team-card-logo" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.06);font-weight:800;color:var(--text-muted);font-size:0.8rem;">${t.tag || 'T'}</div>`;

            html += `
            <div class="team-card">
                <div class="team-card-header" style="margin-bottom: 12px;">
                    ${logoImgTag}
                    <div style="flex-grow: 1; min-width: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                            <span class="team-card-tag" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.tag}</span>
                            <span class="seed-badge" style="white-space: nowrap;">${t.seed || 'TEAM'}</span>
                        </div>
                        <span class="team-card-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${t.name}</span>
                    </div>
                </div>

                <div class="team-card-footer">
                    <div style="display: flex; gap: 6px; flex-grow: 1;">
                        <button class="btn btn-success" style="padding: 6px 8px; font-size: 0.75rem; flex: 1;" onclick="window.tourneyMgr.setActiveTeamSlot('${t.tag}', 'team_1')">
                            👈 Set Team 1
                        </button>
                        <button class="btn btn-danger" style="padding: 6px 8px; font-size: 0.75rem; flex: 1;" onclick="window.tourneyMgr.setActiveTeamSlot('${t.tag}', 'team_2')">
                            👉 Set Team 2
                        </button>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn" style="padding: 6px 8px; font-size: 0.75rem; background: rgba(0, 242, 254, 0.12); color: #00f2fe;" title="Upload Logo file for this team" onclick="window.tourneyMgr.quickUploadLogo('${t.tag}')">
                            <i class="fa-solid fa-camera"></i>
                        </button>
                        <button class="btn" style="padding: 6px 8px; font-size: 0.75rem; background: rgba(255,255,255,0.06);" onclick="window.tourneyMgr.editTeam('${t.id}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-danger" style="padding: 6px 8px; font-size: 0.75rem;" onclick="window.tourneyMgr.deleteTeam('${t.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    }

    quickUploadLogo(teamTag) {
        let input = document.getElementById('dynamic-quick-logo-input');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.id = 'dynamic-quick-logo-input';
            input.accept = 'image/*';
            input.style.display = 'none';
            document.body.appendChild(input);
        }

        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('logoFile', file);
            formData.append('teamTag', teamTag);

            try {
                const res = await fetch('../api/tournament/upload_team_logo', { method: 'POST', body: formData });
                const data = await res.json();
                if (res.status === 200 && data.status) {
                    await this.loadTournamentData();
                    if (typeof successAlertLowerBottom === 'function') {
                        successAlertLowerBottom(`Logo updated for ${teamTag}!`);
                    }
                } else {
                    alert(data.message || 'Failed to upload logo');
                }
            } catch (err) {
                alert('Upload error: ' + err.message);
            }
        };

        input.click();
    }

    findTeamByTag(tag) {
        if (!tag) return null;
        const upper = tag.toUpperCase().trim();
        return (this.tournamentData.teams || []).find(t =>
            (t.tag && t.tag.toUpperCase() === upper) ||
            (t.name && t.name.toUpperCase() === upper)
        );
    }

    async loadMatchToOverlay(matchId) {
        const formData = new FormData();
        formData.append('matchId', matchId);

        try {
            const res = await fetch('../api/tournament/load_match', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.status === 200 && data.status) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(data.message);
                } else {
                    alert(data.message);
                }
            } else {
                alert(data.message || 'Failed to load match into overlay');
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    async setActiveTeamSlot(teamTag, slot) {
        const formData = new FormData();
        formData.append('teamTag', teamTag);
        formData.append('slot', slot);

        try {
            const res = await fetch('../api/tournament/set_active_team', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.status === 200 && data.status) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom(data.message);
                } else {
                    alert(data.message);
                }
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    populateTeamSelectorsInModal() {
        const t1Select = document.getElementById('modal-match-t1');
        const t2Select = document.getElementById('modal-match-t2');
        if (!t1Select || !t2Select) return;

        let options = '<option value="">-- Select Team --</option>';
        (this.tournamentData.teams || []).forEach(t => {
            options += `<option value="${t.tag}">${t.tag} - ${t.name}</option>`;
        });

        t1Select.innerHTML = options;
        t2Select.innerHTML = options;
    }

    openMatchModal(matchData = null) {
        const modal = document.getElementById('match-modal');
        if (!modal) return;

        this.populateTeamSelectorsInModal();

        document.getElementById('modal-match-id').value = matchData?.id || '';
        document.getElementById('modal-match-stage').value = matchData?.stage || 'UPPER BRACKET ROUND 1';
        document.getElementById('modal-match-t1').value = matchData?.team_1_tag || '';
        document.getElementById('modal-match-t2').value = matchData?.team_2_tag || '';
        document.getElementById('modal-match-format').value = matchData?.format || 'BO3';
        document.getElementById('modal-match-time').value = matchData?.scheduled_time || '18:00 IST';
        document.getElementById('modal-match-status').value = matchData?.status || 'UPCOMING';
        document.getElementById('modal-match-score').value = matchData?.score || '0 - 0';

        modal.style.display = 'flex';
    }

    closeMatchModal() {
        const modal = document.getElementById('match-modal');
        if (modal) modal.style.display = 'none';
    }

    editMatch(matchId) {
        const match = (this.tournamentData.matches || []).find(m => m.id === matchId);
        if (match) this.openMatchModal(match);
    }

    async saveMatchFromModal() {
        const id = document.getElementById('modal-match-id').value;
        const stage = document.getElementById('modal-match-stage').value;
        const t1 = document.getElementById('modal-match-t1').value;
        const t2 = document.getElementById('modal-match-t2').value;
        const format = document.getElementById('modal-match-format').value;
        const time = document.getElementById('modal-match-time').value;
        const status = document.getElementById('modal-match-status').value;
        const score = document.getElementById('modal-match-score').value;

        if (!t1 || !t2) {
            alert('Please select both Team 1 and Team 2!');
            return;
        }

        const formData = new FormData();
        formData.append('id', id);
        formData.append('stage', stage);
        formData.append('team_1_tag', t1);
        formData.append('team_2_tag', t2);
        formData.append('format', format);
        formData.append('scheduled_time', time);
        formData.append('status', status);
        formData.append('score', score);

        try {
            const res = await fetch('../api/tournament/save_match', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.status === 200 && data.status) {
                this.tournamentData.matches = data.matches;
                this.renderMatches();
                this.closeMatchModal();
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Match Saved Successfully!');
                }
            }
        } catch (e) {
            alert('Error saving match');
        }
    }

    async deleteMatch(matchId) {
        if (!confirm('Are you sure you want to delete this match from the schedule?')) return;
        const formData = new FormData();
        formData.append('matchId', matchId);

        try {
            const res = await fetch('../api/tournament/delete_match', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.status === 200 && data.status) {
                this.tournamentData.matches = data.matches;
                this.renderMatches();
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Match Deleted!');
                }
            }
        } catch (e) { }
    }

    openTeamModal(teamData = null) {
        const modal = document.getElementById('team-modal');
        if (!modal) return;

        document.getElementById('modal-team-id').value = teamData?.id || '';
        document.getElementById('modal-team-name').value = teamData?.name || '';
        document.getElementById('modal-team-tag').value = teamData?.tag || '';
        document.getElementById('modal-team-logo').value = teamData?.logo || '';
        document.getElementById('modal-team-seed').value = teamData?.seed || '#1 SEED';

        const players = Array.isArray(teamData?.players) ? teamData.players.join(', ') : '';
        document.getElementById('modal-team-players').value = players;

        modal.style.display = 'flex';
    }

    closeTeamModal() {
        const modal = document.getElementById('team-modal');
        if (modal) modal.style.display = 'none';
    }

    editTeam(teamId) {
        const team = (this.tournamentData.teams || []).find(t => t.id === teamId);
        if (team) this.openTeamModal(team);
    }

    async saveTeamFromModal() {
        const id = document.getElementById('modal-team-id').value;
        const name = document.getElementById('modal-team-name').value.trim();
        const tag = document.getElementById('modal-team-tag').value.trim();
        const logo = document.getElementById('modal-team-logo').value.trim();
        const seed = document.getElementById('modal-team-seed').value.trim();
        const playersStr = document.getElementById('modal-team-players').value.trim();

        if (!name || !tag) {
            alert('Please enter Team Name and Tag!');
            return;
        }

        const formData = new FormData();
        formData.append('id', id);
        formData.append('name', name);
        formData.append('tag', tag);
        formData.append('logo', logo);
        formData.append('seed', seed);
        formData.append('players', playersStr);

        try {
            const res = await fetch('../api/tournament/save_team', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.status === 200 && data.status) {
                this.tournamentData.teams = data.teams;
                this.renderAll();
                this.closeTeamModal();
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Team Saved Successfully!');
                }
            }
        } catch (e) {
            alert('Error saving team');
        }
    }

    async deleteTeam(teamId) {
        if (!confirm('Delete this team from the tournament?')) return;
        const formData = new FormData();
        formData.append('teamId', teamId);

        try {
            const res = await fetch('../api/tournament/delete_team', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.status === 200 && data.status) {
                this.tournamentData.teams = data.teams;
                this.renderAll();
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Team Deleted!');
                }
            }
        } catch (e) { }
    }

    openSheetGuideModal() {
        const modal = document.getElementById('sheet-guide-modal');
        if (modal) modal.style.display = 'flex';
    }

    closeSheetGuideModal() {
        const modal = document.getElementById('sheet-guide-modal');
        if (modal) modal.style.display = 'none';
    }

    async loadSampleData() {
        if (!confirm('Load sample tournament demo data (6 Teams & 3 Playoff Matches)?')) return;
        try {
            const res = await fetch('../config/tournamentData.json');
            if (res.status === 200) {
                const sample = await res.json();
                this.tournamentData = sample;
                this.renderAll();
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Loaded Sample Tournament Demo Data!');
                }
            }
        } catch (e) { }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.tourneyMgr = new TournamentManager();
    window.tourneyMgr.init();
});
