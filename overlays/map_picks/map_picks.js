class MapPickVetoOverlay {
    constructor() {
        this.container = document.getElementById('map-pick-adding-div');
        this.seriesBadge = document.getElementById('series-badge-text');
        this.data = null;
    }

    async init() {
        await this.fetchData();
        this.initSocket();
    }

    initSocket() {
        if (typeof io !== 'undefined') {
            const socket = io();
            socket.on('mapPicksUpdate', (data) => {
                this.data = data;
                this.render();
            });
            socket.on('configUpdate', () => {
                this.fetchData();
            });
        }
    }

    async fetchData() {
        try {
            const res = await fetch('../get_map_picks');
            if (res.status === 200) {
                this.data = await res.json();
                this.render();
            }
        } catch (e) {
            console.error('Error fetching map picks:', e);
        }
    }

    render() {
        if (!this.data || !this.data.picks || !this.container) return;

        const seriesType = (this.data.series_type || 'bo3').toUpperCase();
        let seriesLabel = 'BEST OF 3';
        if (seriesType === 'BO1') seriesLabel = 'BEST OF 1 (1 GAME)';
        else if (seriesType === 'BO5') seriesLabel = 'BEST OF 5 (5 GAMES)';
        else seriesLabel = 'BEST OF 3 (3 GAMES)';

        if (this.seriesBadge) {
            this.seriesBadge.textContent = seriesLabel;
        }

        const teams = this.data.teams || ['TEAM 1', 'TEAM 2'];
        const picks = this.data.picks;
        const totalCards = picks.length;

        let html = '<div class="map-pick-container">';

        for (let i = 0; i < totalCards; i++) {
            const mapName = (picks[i][0] || 'ascent').toLowerCase();
            const action = (picks[i][1] || 'ban').toLowerCase();
            const isLast = (i === totalCards - 1);
            const teamName = teams[i % 2] || `TEAM ${(i % 2) + 1}`;

            let cardTypeClass = 'pick-card';
            let headerText = `${teamName} PICK`;
            let sideBadgeHtml = '';

            if (action === 'ban') {
                cardTypeClass = 'ban-card';
                headerText = `${teamName} BAN`;
                sideBadgeHtml = `
                <div class="map-banned-card">
                    <i class="fa-solid fa-xmark"></i>
                    <span>BANNED</span>
                </div>`;
            } else if (isLast) {
                cardTypeClass = 'decider-card';
                headerText = 'DECIDER MAP';
                sideBadgeHtml = `<div class="map-picked-by-side decider-side"><i class="fa-solid fa-trophy" style="margin-right: 6px;"></i> DECIDER</div>`;
            } else if (action === 'attack') {
                cardTypeClass = 'pick-card';
                headerText = `${teamName} PICK`;
                sideBadgeHtml = `<div class="map-picked-by-side attack-side"><i class="fa-solid fa-crosshairs" style="margin-right: 6px;"></i> ${teamName} ATK</div>`;
            } else if (action === 'defense') {
                cardTypeClass = 'pick-card';
                headerText = `${teamName} PICK`;
                sideBadgeHtml = `<div class="map-picked-by-side defense-side"><i class="fa-solid fa-shield-halved" style="margin-right: 6px;"></i> ${teamName} DEF</div>`;
            } else if (action === 'pick' || action === 'picked') {
                cardTypeClass = 'pick-card';
                headerText = `${teamName} PICK`;
                sideBadgeHtml = `<div class="map-picked-by-side"><i class="fa-solid fa-check" style="margin-right: 6px;"></i> PICKED</div>`;
            } else {
                cardTypeClass = 'pending-card';
                headerText = `${teamName} (PENDING)`;
                sideBadgeHtml = `<div class="map-picked-by-side pending-side"><i class="fa-solid fa-clock" style="margin-right: 6px;"></i> PENDING</div>`;
            }

            const mapDisplayName = mapName.charAt(0).toUpperCase() + mapName.slice(1);

            html += `
            <div class="map-pick-card ${cardTypeClass}" style="animation-delay: ${i * 80}ms;">
                <div class="map-pick-side">${headerText}</div>
                <div class="map-pick-image">
                    <div class="map-image map-${mapName}" style="background-image: url('../visual_assets/map_images/${mapName}.webp'), url('/visual_assets/map_images/${mapName}.webp'), url('../visual_assets/map_images/haven.webp'); background-size: cover; background-position: center;"></div>
                    <div class="map-name-label">${mapDisplayName}</div>
                    ${sideBadgeHtml}
                </div>
            </div>`;
        }

        html += '</div>';
        this.container.innerHTML = html;
    }
}

function startOverlay() {
    const vetoOverlay = new MapPickVetoOverlay();
    vetoOverlay.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startOverlay);
} else {
    startOverlay();
}