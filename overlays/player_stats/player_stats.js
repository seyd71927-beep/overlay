/**
 * 10-Player Stats Overlay Controller - Official VCT In-Game HUD Edition
 * Accurately matches the official Riot VALORANT broadcast player stat card HUD.
 */

const AGENT_ABILITY_DATA = {
    "jett": { c: 2, q: 2, e: 1, ult: 7 },
    "reyna": { c: 2, q: 2, e: 2, ult: 6 },
    "raze": { c: 1, q: 2, e: 1, ult: 8 },
    "viper": { c: 2, q: 1, e: 1, ult: 8 },
    "omen": { c: 1, q: 1, e: 2, ult: 7 },
    "brimstone": { c: 1, q: 1, e: 3, ult: 7 },
    "phoenix": { c: 1, q: 2, e: 1, ult: 6 },
    "sova": { c: 1, q: 2, e: 1, ult: 8 },
    "sage": { c: 1, q: 2, e: 1, ult: 8 },
    "cypher": { c: 2, q: 2, e: 1, ult: 6 },
    "killjoy": { c: 2, q: 1, e: 1, ult: 8 },
    "breach": { c: 1, q: 2, e: 1, ult: 8 },
    "skye": { c: 1, q: 1, e: 2, ult: 7 },
    "yoru": { c: 1, q: 2, e: 1, ult: 7 },
    "astra": { c: 1, q: 1, e: 1, ult: 7 },
    "kayo": { c: 1, q: 2, e: 1, ult: 8 },
    "chamber": { c: 1, q: 1, e: 1, ult: 8 },
    "neon": { c: 1, q: 2, e: 1, ult: 7 },
    "fade": { c: 1, q: 2, e: 1, ult: 8 },
    "harbor": { c: 1, q: 1, e: 2, ult: 7 },
    "gekko": { c: 1, q: 1, e: 1, ult: 7 },
    "deadlock": { c: 1, q: 1, e: 1, ult: 7 },
    "iso": { c: 1, q: 2, e: 1, ult: 7 },
    "clove": { c: 1, q: 1, e: 2, ult: 7 },
    "vyse": { c: 1, q: 2, e: 1, ult: 8 },
    "tejo": { c: 1, q: 1, e: 1, ult: 8 },
    "miks": { c: 1, q: 1, e: 1, ult: 7 },
    "veto": { c: 1, q: 1, e: 1, ult: 8 },
    "waylay": { c: 1, q: 1, e: 1, ult: 7 }
};

async function fetch_player_status_information() {
    try {
        let res;
        try {
            res = await fetch('/get_player_stats');
        } catch (e) {
            res = null;
        }
        if (!res || !res.ok) {
            res = await fetch('../get_player_stats');
        }
        const json = await res.json();
        if (json && json.status) {
            renderPlayerHUD(json);
        }
    } catch (e) {
        console.error('Error fetching player stats:', e);
    }
}

function renderPlayerHUD(json) {
    const leftContainer = document.getElementById('left-team-container');
    const rightContainer = document.getElementById('right-team-container');
    if (!leftContainer || !rightContainer) return;

    const switchTeams = !!json.switch_teams;

    // Extract dynamic Team 1 players
    let team1Players = [];
    if (Array.isArray(json.team_1_list) && json.team_1_list.length > 0) {
        team1Players = json.team_1_list.filter(p => !!p);
    } else if (json.team_1 && typeof json.team_1 === 'object') {
        const keys = Object.keys(json.team_1);
        for (const k of keys) {
            const p = json.team_1[k];
            if (p) team1Players.push(p);
        }
    }

    // Extract dynamic Team 2 players
    let team2Players = [];
    if (Array.isArray(json.team_2_list) && json.team_2_list.length > 0) {
        team2Players = json.team_2_list.filter(p => !!p);
    } else if (json.team_2 && typeof json.team_2 === 'object') {
        const keys = Object.keys(json.team_2);
        for (const k of keys) {
            const p = json.team_2[k];
            if (p) team2Players.push(p);
        }
    }

    // Default 5-player fallback if either team is empty
    if (team1Players.length === 0) {
        team1Players = [
            { username: 'Player 1', agent: 'jett', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 5, ult_points_needed: 7, credits: 4200, is_dead: false, has_spike: true },
            { username: 'Player 2', agent: 'sova', health: 85, shield: 25, weapon: 'phantom', ult_points_gained: 4, ult_points_needed: 7, credits: 3100, is_dead: false },
            { username: 'Player 3', agent: 'cypher', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 3, ult_points_needed: 6, credits: 2900, is_dead: false },
            { username: 'Player 4', agent: 'phoenix', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 5, ult_points_needed: 6, credits: 4700, is_dead: false },
            { username: 'Player 5', agent: 'omen', health: 59, shield: 50, weapon: 'operator', ult_points_gained: 1, ult_points_needed: 7, credits: 4900, is_dead: false }
        ];
    }
    if (team2Players.length === 0) {
        team2Players = [
            { username: 'Player 6', agent: 'omen', health: 100, shield: 50, weapon: 'phantom', ult_points_gained: 6, ult_points_needed: 7, credits: 4500, is_dead: false },
            { username: 'Player 7', agent: 'raze', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 7, ult_points_needed: 8, credits: 3900, is_dead: false },
            { username: 'Player 8', agent: 'viper', health: 40, shield: 0, weapon: 'spectre', ult_points_gained: 3, ult_points_needed: 8, credits: 2400, is_dead: false },
            { username: 'Player 9', agent: 'killjoy', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 5, ult_points_needed: 8, credits: 3200, is_dead: false },
            { username: 'Player 10', agent: 'fade', health: 100, shield: 50, weapon: 'vandal', ult_points_gained: 7, ult_points_needed: 8, credits: 5800, is_dead: false }
        ];
    }

    // Render Team 1 (Left HUD)
    const t1IsAtk = !switchTeams;
    let leftHTML = `<div class="team-column ${t1IsAtk ? 'team-red' : 'team-green'}">`;
    for (let i = 0; i < team1Players.length; i++) {
        leftHTML += buildVCTPlayerCard(team1Players[i], false);
    }
    leftHTML += `</div>`;

    // Render Team 2 (Right HUD)
    const t2IsAtk = switchTeams;
    let rightHTML = `<div class="team-column ${t2IsAtk ? 'team-red' : 'team-green'}">`;
    for (let i = 0; i < team2Players.length; i++) {
        rightHTML += buildVCTPlayerCard(team2Players[i], true);
    }
    rightHTML += `</div>`;

    leftContainer.innerHTML = leftHTML;
    rightContainer.innerHTML = rightHTML;
}

// Generate circular segmented SVG ultimate ring
function renderUltimateBadge(agentKey, ultGained, ultNeeded) {
    const needed = ultNeeded || 7;
    const gained = Math.max(0, ultGained || 0);
    const isReady = gained >= needed && needed > 0;

    const r = 14;
    const cx = 17;
    const cy = 17;

    let segmentsHTML = '';
    const gapDeg = needed > 6 ? 4 : 5;
    const segmentAngle = 360 / needed;

    for (let i = 0; i < needed; i++) {
        const startAngle = (i * segmentAngle) - 90 + (gapDeg / 2);
        const endAngle = ((i + 1) * segmentAngle) - 90 - (gapDeg / 2);

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);

        const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
        const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;

        const isFilled = isReady || (i < gained);
        segmentsHTML += `<path d="${d}" class="ult-seg ${isFilled ? 'seg-filled' : 'seg-unfilled'}" />`;
    }

    return `
    <div class="vct-ult-dial ${isReady ? 'ult-ready' : 'ult-charging'}" title="Ultimate: ${gained}/${needed}">
        <svg class="ult-dial-svg" viewBox="0 0 34 34">
            ${segmentsHTML}
        </svg>
        <div class="ult-icon-wrapper">
            <img class="ult-icon-img" src="../visual_assets/agent_icons/${agentKey}/ability_x.webp" alt="ULT" onerror="this.style.opacity=0.3">
        </div>
    </div>`;
}

// Render individual ability with dash markers
function renderAbilitySlot(agentKey, abilityKey, utilVal) {
    const agentCfg = AGENT_ABILITY_DATA[agentKey] || { c: 1, q: 1, e: 1 };
    const maxCharges = agentCfg[abilityKey] || 1;

    let charges = 0;
    if (typeof utilVal === 'number') {
        charges = Math.max(0, Math.min(maxCharges, utilVal));
    } else if (utilVal === true || utilVal === 'true') {
        charges = maxCharges;
    } else if (utilVal === false || utilVal === 'false') {
        charges = 0;
    } else {
        charges = maxCharges;
    }

    const isAvailable = charges > 0;

    let dashesHTML = '';
    for (let d = 0; d < maxCharges; d++) {
        const isLit = d < charges;
        dashesHTML += `<span class="ability-dash ${isLit ? 'dash-lit' : 'dash-dim'}"></span>`;
    }

    return `
    <div class="vct-ability-slot ${isAvailable ? 'ability-ready' : 'ability-spent'}">
        <img class="vct-ability-icon" src="../visual_assets/agent_icons/${agentKey}/ability_${abilityKey}.webp" alt="${abilityKey}" onerror="this.style.opacity=0.2">
        <div class="ability-dash-container">
            ${dashesHTML}
        </div>
    </div>`;
}

// Build individual Player Card exactly matching the reference HUD
function buildVCTPlayerCard(p, isRightTeam) {
    const isDead = (p.health === 0 || p.is_dead);
    const agent = (p.agent || 'jett').toLowerCase();
    const weapon = (p.weapon || 'classic').toLowerCase();
    const weaponFile = weapon === 'marshal' ? 'marshall' : weapon;
    const hp = isDead ? 0 : Math.max(0, Math.min(100, (p.health ?? 100)));
    const shield = isDead ? 0 : Math.max(0, (p.shield ?? 0));
    const credits = p.credits ?? 800;
    const username = p.name || p.username || 'PLAYER';
    const hasSpike = !!p.has_spike;
    const isSpectated = !!p.is_spectated;

    // Ability slots
    const slotC = renderAbilitySlot(agent, 'c', p.c_util);
    const slotQ = renderAbilitySlot(agent, 'q', p.q_util);
    const slotE = renderAbilitySlot(agent, 'e', p.e_util);
    const ultBadge = renderUltimateBadge(agent, p.ult_points_gained, p.ult_points_needed);

    // Abilities layout
    const abilitiesHTML = isRightTeam
        ? `<div class="abilities-group right-abilities">${slotC}${slotQ}${slotE}${ultBadge}</div>`
        : `<div class="abilities-group left-abilities">${ultBadge}${slotC}${slotQ}${slotE}</div>`;

    // Weapon silhouette & Creds
    const weaponHTML = `
        <div class="weapon-silhouette-box">
            <img class="vct-weapon-img" src="../visual_assets/game_icons/${weaponFile}.webp" alt="${weapon}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
            <span class="weapon-fallback-text" style="display:none;">${weapon.toUpperCase()}</span>
        </div>`;

    const credsHTML = `
        <div class="vct-creds-box">
            <span class="creds-symbol">¤</span><span class="creds-num">${Number(credits).toLocaleString()}</span>
        </div>`;

    // Weapon & Economy Block
    const weaponCredsHTML = `
        <div class="weapon-creds-block ${isRightTeam ? 'wc-right' : 'wc-left'}">
            ${weaponHTML}
            ${credsHTML}
        </div>`;

    // Agent Avatar (Large face portrait filling top row)
    const avatarHTML = `
        <div class="vct-avatar-frame">
            <img class="vct-avatar-img" src="../visual_assets/agent_icons/${agent}/${agent}_icon.webp" alt="${agent}" onerror="this.style.opacity=0.3">
        </div>`;

    // Angular Shield Badge matching Valorant HUD
    const shieldBadgeHTML = shield > 0 ? `
        <div class="vct-shield-badge">
            <svg class="shield-svg" viewBox="0 0 24 24" fill="none">
                <path d="M4 3.5 L8 1.5 L16 1.5 L20 3.5 L20.5 11.5 C20.5 16.8 16.5 21.5 12 23 C7.5 21.5 3.5 16.8 3.5 11.5 Z" stroke="rgba(255, 255, 255, 0.85)" stroke-width="1.8" stroke-linejoin="round" fill="rgba(10, 18, 26, 0.7)"/>
            </svg>
            <span class="shield-val">${shield}</span>
        </div>` : '';

    const spikeHTML = hasSpike ? `
        <div class="vct-spike-carrier" title="Spike Carrier">
            <img src="../visual_assets/spike_white.png" alt="Spike">
        </div>` : '';

    if (isDead) {
        let kdaText = '';
        if (p.kda) {
            kdaText = p.kda;
        } else if (typeof p.kills !== 'undefined' || typeof p.deaths !== 'undefined' || typeof p.assists !== 'undefined') {
            const k = p.kills ?? 0;
            const d = p.deaths ?? 0;
            const a = p.assists ?? 0;
            kdaText = `${k}/${d}/${a}`;
        } else {
            const k = p.k ?? (p.credits ? ((p.credits % 11) + 2) : 7);
            const d = p.d ?? (p.credits ? ((p.credits % 6) + 1) : 4);
            const a = p.a ?? (p.credits ? ((p.credits % 4) + 1) : 2);
            kdaText = `${k}/${d}/${a}`;
        }

        return `
        <div class="vct-player-card card-dead ${isRightTeam ? 'vct-right' : 'vct-left'}">
            <!-- Top Section: Avatar + Name (Grayscale) -->
            <div class="vct-card-top">
                ${isRightTeam ? `
                    <div class="vct-dead-placeholder"></div>
                    <div class="vct-identity right-identity">
                        ${spikeHTML}
                        <span class="vct-player-name dead-name">${username}</span>
                        ${avatarHTML}
                    </div>
                ` : `
                    <div class="vct-identity left-identity">
                        ${avatarHTML}
                        <span class="vct-player-name dead-name">${username}</span>
                        ${spikeHTML}
                    </div>
                    <div class="vct-dead-placeholder"></div>
                `}
            </div>

            <!-- Health Bar (0%) -->
            <div class="vct-health-track">
                <div class="vct-health-fill" style="width: 0%;"></div>
            </div>

            <!-- Bottom Section: Ult Dial + KDA Stat (7/4/2) + Creds (¤ 4,900) -->
            <div class="vct-card-bottom dead-bottom">
                ${isRightTeam ? `
                    <div class="vct-creds-box">
                        <span class="creds-symbol">¤</span><span class="creds-num">${Number(credits).toLocaleString()}</span>
                    </div>
                    <div class="dead-right-group">
                        <span class="vct-kda-text">${kdaText}</span>
                        ${ultBadge}
                    </div>
                ` : `
                    <div class="dead-left-group">
                        ${ultBadge}
                        <span class="vct-kda-text">${kdaText}</span>
                    </div>
                    <div class="vct-creds-box">
                        <span class="creds-symbol">¤</span><span class="creds-num">${Number(credits).toLocaleString()}</span>
                    </div>
                `}
            </div>
        </div>`;
    }

    return `
    <div class="vct-player-card ${isRightTeam ? 'vct-right' : 'vct-left'} ${isSpectated ? 'spectated-active' : ''}">
        <!-- Top Section: Avatar + Name + Shield Badge + HP -->
        <div class="vct-card-top">
            ${isRightTeam ? `
                <div class="combat-group left-combat">
                    <span class="vct-hp-val">${hp}</span>
                    ${shieldBadgeHTML}
                </div>
                <div class="vct-identity right-identity">
                    ${spikeHTML}
                    <span class="vct-player-name">${username}</span>
                    ${avatarHTML}
                </div>
            ` : `
                <div class="vct-identity left-identity">
                    ${avatarHTML}
                    <span class="vct-player-name">${username}</span>
                    ${spikeHTML}
                </div>
                <div class="combat-group right-combat">
                    ${shieldBadgeHTML}
                    <span class="vct-hp-val">${hp}</span>
                </div>
            `}
        </div>

        <!-- Health Bar Line Divider -->
        <div class="vct-health-track">
            <div class="vct-health-fill" style="width: ${hp}%;"></div>
        </div>

        <!-- Bottom Section: Ultimate + Abilities + Weapon + Creds -->
        <div class="vct-card-bottom">
            ${isRightTeam ? `
                ${weaponCredsHTML}
                ${abilitiesHTML}
            ` : `
                ${abilitiesHTML}
                ${weaponCredsHTML}
            `}
        </div>
    </div>`;
}

// Socket.io Realtime Sync
if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('playerUpdate', (data) => {
        if (data && data.team_1_list) renderPlayerHUD(data);
        else fetch_player_status_information();
    });
    socket.on('playerStatsUpdate', (data) => {
        if (data && data.team_1_list) renderPlayerHUD(data);
        else fetch_player_status_information();
    });
    socket.on('stateUpdate', () => {
        fetch_player_status_information();
    });
    socket.on('configUpdate', () => {
        fetch_player_status_information();
    });
    socket.on('bridgeTelemetry', () => {
        fetch_player_status_information();
    });
    socket.on('bridgeStatusUpdate', () => {
        fetch_player_status_information();
    });
}

// Initial fetch & fallback interval
fetch_player_status_information();
setInterval(fetch_player_status_information, 1000);
