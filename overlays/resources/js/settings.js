class AdminSettingsManager {
    constructor() {
        this.simInterval = null;
        this.hasLoadedInitialValues = false;
    }

    async init() {
        this.bindEvents();
        await this.loadTokens();
        await this.loadAutoFetchStatus(true);
        setInterval(() => this.loadAutoFetchStatus(false), 1200);
    }

    bindEvents() {
        document.getElementById('change-pw-btn')?.addEventListener('click', () => this.changePassword());
        document.getElementById('regen-tokens-btn')?.addEventListener('click', () => this.regenerateTokens());
        document.getElementById('start-sim-btn')?.addEventListener('click', () => this.startDemoSimulation());
        document.getElementById('stop-sim-btn')?.addEventListener('click', () => this.stopDemoSimulation());
        document.getElementById('save-auto-fetch-btn')?.addEventListener('click', () => this.saveAutoFetchConfig());
        document.getElementById('auto-fetch-mode')?.addEventListener('change', (e) => this.onModeChange(e.target.value));
    }

    onModeChange(mode) {
        const cloudGroup = document.getElementById('cloud-riot-group');
        const apiGroup = document.getElementById('cloud-api-key-group');
        const isCloud = (mode === 'cloud');
        if (cloudGroup) cloudGroup.style.opacity = isCloud ? '1' : '0.4';
        if (apiGroup) apiGroup.style.opacity = isCloud ? '1' : '0.4';
    }

    async loadAutoFetchStatus(isInitial = false) {
        try {
            const res = await fetch('../get_auto_fetch_status');
            if (res.status === 200) {
                const data = await res.json();
                const statusEl = document.getElementById('live-sync-status-text');
                const badge = document.getElementById('auto-sync-badge');

                // On first load, synchronize form controls with saved backend config
                if (isInitial && !this.hasLoadedInitialValues) {
                    this.hasLoadedInitialValues = true;
                    const toggleEl = document.getElementById('auto-fetch-toggle');
                    const modeEl = document.getElementById('auto-fetch-mode');
                    const riotIdEl = document.getElementById('cloud-riot-id');
                    const apiKeyEl = document.getElementById('cloud-api-key');

                    if (toggleEl && typeof data.autoFetchEnabled === 'boolean') {
                        toggleEl.value = String(data.autoFetchEnabled);
                    }
                    if (modeEl && data.fetchMode) {
                        modeEl.value = data.fetchMode;
                        this.onModeChange(data.fetchMode);
                    }
                    if (riotIdEl && data.cloudRiotId) {
                        riotIdEl.value = data.cloudRiotId;
                    }
                    if (apiKeyEl && data.cloudApiKey) {
                        apiKeyEl.value = data.cloudApiKey;
                    }
                }

                if (statusEl) {
                    statusEl.textContent = data.statusText || 'Ready';
                }

                if (badge) {
                    if (!data.autoFetchEnabled) {
                        badge.textContent = 'AUTO-FETCH PAUSED';
                        badge.style.background = 'rgba(255, 42, 95, 0.15)';
                        badge.style.color = '#ff2a5f';
                        badge.style.borderColor = 'rgba(255, 42, 95, 0.3)';
                    } else if (data.inGame) {
                        badge.textContent = 'LIVE IN-GAME MATCH';
                        badge.style.background = 'rgba(0, 230, 118, 0.15)';
                        badge.style.color = '#00e676';
                        badge.style.borderColor = 'rgba(0, 230, 118, 0.3)';
                    } else if (data.gameRunning) {
                        badge.textContent = 'VALORANT CLIENT ONLINE';
                        badge.style.background = 'rgba(0, 230, 118, 0.15)';
                        badge.style.color = '#00e676';
                        badge.style.borderColor = 'rgba(0, 230, 118, 0.3)';
                    } else if (data.clientDetected) {
                        badge.textContent = 'RIOT CLIENT ONLINE (GAME CLOSED)';
                        badge.style.background = 'rgba(255, 179, 0, 0.15)';
                        badge.style.color = '#ffb300';
                        badge.style.borderColor = 'rgba(255, 179, 0, 0.3)';
                    } else {
                        badge.textContent = 'SCANNING FOR GAME...';
                        badge.style.background = 'rgba(0, 242, 254, 0.15)';
                        badge.style.color = '#00f2fe';
                        badge.style.borderColor = 'rgba(0, 242, 254, 0.3)';
                    }
                }
            }
        } catch (e) {}
    }

    async saveAutoFetchConfig() {
        const enabled = document.getElementById('auto-fetch-toggle').value;
        const mode = document.getElementById('auto-fetch-mode').value;
        const riotId = document.getElementById('cloud-riot-id').value.trim();
        const apiKey = document.getElementById('cloud-api-key') ? document.getElementById('cloud-api-key').value.trim() : '';

        const formData = new FormData();
        formData.append('enabled', enabled);
        formData.append('mode', mode);
        formData.append('riotId', riotId);
        formData.append('apiKey', apiKey);

        try {
            const res = await fetch('../set_auto_fetch_config', { method: 'POST', body: formData });
            if (res.status === 200) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Auto-Fetch In-Game Settings Saved!');
                } else {
                    alert('Auto-Fetch settings saved!');
                }
                await this.loadAutoFetchStatus(false);
            }
        } catch (e) {
            console.error(e);
        }
    }


    async changePassword() {
        const pw = document.getElementById('new-pw-input').value.trim();
        if (!pw) {
            alert('Please enter a new password!');
            return;
        }

        const formData = new FormData();
        formData.append('newPassword', pw);

        try {
            const res = await fetch('../change_password', { method: 'POST', body: formData });
            if (res.status === 200) {
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Admin Password Changed Successfully!');
                } else {
                    alert('Password changed successfully!');
                }
                document.getElementById('new-pw-input').value = '';
            }
        } catch (e) {
            console.error(e);
        }
    }

    async loadTokens() {
        try {
            const res = await fetch('../print_state');
            if (res.status === 200) {
                const state = await res.json();
                this.renderTokensTable(state.players);
            }
        } catch (e) {
            console.error(e);
        }
    }

    renderTokensTable(players) {
        const tbody = document.getElementById('tokens-table-body');
        if (!tbody || !players) return;

        let html = '';
        for (let i = 0; i < 10; i++) {
            const key = `player_${i}`;
            const p = players[key];
            const isTeam1 = i < 5;

            html += `
            <tr class="${isTeam1 ? 'team-1-row' : 'team-2-row'}">
                <td style="font-weight: 700;">Player Slot #${i + 1}</td>
                <td style="font-weight: 700; color: ${isTeam1 ? 'var(--green-team)' : 'var(--red-team)'}">${isTeam1 ? 'Team 1 (Left)' : 'Team 2 (Right)'}</td>
                <td>
                    <span class="status-badge" style="background: ${p.is_registered ? 'rgba(0,230,118,0.15)' : 'rgba(255,42,95,0.15)'}; color: ${p.is_registered ? '#00e676' : '#ff2a5f'}">
                        ${p.is_registered ? 'REGISTERED & ACTIVE' : 'WAITING CLIENT'}
                    </span>
                </td>
                <td style="font-family: monospace; font-size: 0.95rem; letter-spacing: 1px; color: var(--accent-secondary); font-weight: 700;">
                    ${p.token || 'NO_TOKEN'}
                </td>
                <td>
                    <button class="btn btn-accent" style="padding: 4px 10px; font-size: 0.75rem;" onclick="navigator.clipboard.writeText('${p.token}'); if(typeof successAlertLowerBottom==='function') successAlertLowerBottom('Copied Token to Clipboard!');">
                        <i class="fa-solid fa-copy"></i> Copy Token
                    </button>
                </td>
            </tr>`;
        }
        tbody.innerHTML = html;
    }

    async regenerateTokens() {
        if (!confirm('Regenerate all 10 player tokens? External clients will need the new tokens to reconnect.')) return;
        try {
            const res = await fetch('../regenerate_user_tokens');
            if (res.status === 200) {
                const data = await res.json();
                this.renderTokensTable(data.players);
                if (typeof successAlertLowerBottom === 'function') {
                    successAlertLowerBottom('Player Tokens Regenerated!');
                }
            }
        } catch (e) {}
    }

    startDemoSimulation() {
        if (this.simInterval) clearInterval(this.simInterval);
        if (typeof successAlertLowerBottom === 'function') {
            successAlertLowerBottom('Started Demo Match Simulation Loop!');
        }

        let round = 1;
        let t1Score = 0;
        let t2Score = 0;

        this.simInterval = setInterval(async () => {
            const spikeDown = (Math.random() < 0.4);
            if (Math.random() < 0.2) {
                if (Math.random() < 0.5) t1Score++;
                else t2Score++;
                round++;
            }

            const formData = new FormData();
            formData.append('round_number', round);
            formData.append('team_1_score', t1Score);
            formData.append('team_2_score', t2Score);
            formData.append('spike', spikeDown ? 'down' : 'up');

            await fetch('../change_game_state', { method: 'POST', body: formData });
        }, 3000);
    }

    stopDemoSimulation() {
        if (this.simInterval) {
            clearInterval(this.simInterval);
            this.simInterval = null;
        }
        if (typeof successAlertLowerBottom === 'function') {
            successAlertLowerBottom('Stopped Demo Simulation');
        }
    }
}

function copyAdminUrl() {
    const adminUrl = `${window.location.origin}/admin`;
    navigator.clipboard.writeText(adminUrl);
    if (typeof successAlertLowerBottom === 'function') {
        successAlertLowerBottom('Copied Worldwide Admin URL to Clipboard!');
    } else {
        alert('Copied Admin URL:\n' + adminUrl);
    }
}

function copyBridgeCmd() {
    const origin = window.location.origin;
    const cmd = `node live_valorant_bridge.js ${origin}`;
    navigator.clipboard.writeText(cmd);
    if (typeof successAlertLowerBottom === 'function') {
        successAlertLowerBottom('Copied Streamer Bridge Command to Clipboard!');
    } else {
        alert('Copied command:\n' + cmd);
    }
}

function copyObsScoreboardUrl() {
    const obsUrl = `${window.location.origin}/game_score`;
    navigator.clipboard.writeText(obsUrl);
    if (typeof successAlertLowerBottom === 'function') {
        successAlertLowerBottom('Copied Scoreboard OBS Browser Source Link!');
    } else {
        alert('Copied OBS URL:\n' + obsUrl);
    }
}

function openMobileAdmin() {
    window.open(`${window.location.origin}/admin?page=stream`, '_blank');
}

document.addEventListener('DOMContentLoaded', () => {
    const settingsMgr = new AdminSettingsManager();
    settingsMgr.init();

    const origin = window.location.origin;
    const originEl = document.getElementById('current-server-origin');
    if (originEl) {
        originEl.textContent = origin;
    }

    const qrImg = document.getElementById('mobile-qr-code');
    if (qrImg) {
        const adminUrl = `${origin}/admin`;
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(adminUrl)}`;
    }
});
