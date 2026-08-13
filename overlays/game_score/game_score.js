
class helValorantGameScore {
    constructor(){
        //Value Variables
        this.roundCounter = 0; //Set to -1 at start of round
        this._switchSides = false; //Is set to true for round numbers between 13-24 and every other round after that
        this.spikeDown = false;
        this.roundOver = false; //Checks if a round is over to show the 
        this.leftTeamPoints = 0;
        this.rightTeamPoints = 0;
        this.interval; //Setting the timer variable
        this.leftTeamIcon = ''; //Default icon links are unavailable
        this.rightTeamIcon = '';//Default icon links are unavailable
        this.currentWinPanel = null;

        //Element Variables
        this.tournamentStageElement = document.getElementById('tournament-stage');
        this.roundCounterElement = document.getElementById('round-counter');
        this.leftTeamContainer = document.getElementById('left-team');
        this.rightTeamContainer = document.getElementById('right-team');
        this.leftAttackIndicator = document.getElementsByClassName('attack-indicator')[0];
        this.rightAttackIndicator = document.getElementsByClassName('attack-indicator')[1];
        this.leftTeamGamesWon = document.getElementsByClassName('maps-won-container-sub')[0];
        this.rightTeamGamesWon = document.getElementsByClassName('maps-won-container-sub')[1];
        this.countdownElement = document.getElementById('timer');
        this.spikeElement = document.getElementById('spike');

        //Set Default Values
        this.updateRoundNumer();
        this.leftTeamContainer.innerHTML = this.formatTeamDisplay('BLU', '', '../visual_assets/blueTeamPlaceholder.jpg');
        this.rightTeamContainer.innerHTML = this.formatTeamDisplay('RED', '', '../visual_assets/redTeamPlaceholder.jpg');

        //Animation Variables
        this.spikeInAnimation = [{transform: 'translateY(-80px) scale(1.2)', color: 'red'}];
        this.spikeOutAnimation = [{transform: 'translateY(0px) scale(1)', color: 'white'}];
        this.animationTiming = {duration: 350, fill: 'forwards'};
        this.roundWinPanelAnimation = [{transform: 'translateX(-50%) translateY(-50%)', filter: 'blur(0px)'}, {filter: 'blur(100px)'},{transform: 'translateX(-50%) translateY(calc(540px - 100%))', filter: 'blur(0px)'}];
        // Socket.io real-time connection
        if (typeof io !== 'undefined') {
            const socket = io();
            socket.on('stateUpdate', (state) => {
                if (state.team_1 || state.team_2) {
                    this.init();
                }
                if (state.tournament_stage !== undefined) {
                    this.updateTournamentStage(state.tournament_stage);
                }
                if (state.round_number !== undefined && state.round_number !== this.roundCounter) {
                    this.updateRoundNumer(state.round_number);
                }
                if (state.spike_down !== undefined && state.spike_down !== this.spikeDown) {
                    this.spikeDown = state.spike_down;
                    if (this.spikeDown) {
                        this.startSpikeCountDown(45000);
                    } else {
                        this.resetSpikeAnimation();
                    }
                }
                if (state.team_1_score !== undefined || state.team_2_score !== undefined) {
                    this.updateTeamScores(state.team_1_score ?? this.leftTeamPoints, state.team_2_score ?? this.rightTeamPoints);
                }
                if (state.switch_sides !== undefined) {
                    this._switchSides = state.switch_sides;
                    this.switchSides();
                }
            });

            socket.on('winBannerTrigger', (data) => {
                if (data.winningTeam === 'team_1') {
                    this.showRoundWinPanel('left');
                } else {
                    this.showRoundWinPanel('right');
                }
            });

            socket.on('configUpdate', () => {
                this.init();
            });

            socket.on('mapPicksUpdate', () => {
                this.init();
            });
        }
    }

    async init() {
        try {
            const res = await fetch('../get_game_configuration', { method: 'GET' });
            if (res.status === 200) {
                const json = await res.json();
                this.leftTeamIcon = (!json.team_1 || json.team_1.icon_link === '') ? '../visual_assets/blueTeamPlaceholder.jpg' : json.team_1.icon_link;
                this.rightTeamIcon = (!json.team_2 || json.team_2.icon_link === '') ? '../visual_assets/redTeamPlaceholder.jpg' : json.team_2.icon_link;

                this.leftTeamContainer.innerHTML = this.formatTeamDisplay(json.team_1 ? json.team_1.abbreviation : 'T1', json.team_1 ? json.team_1.team_info : '', this.leftTeamIcon, !!this._switchSides);
                this.rightTeamContainer.innerHTML = this.formatTeamDisplay(json.team_2 ? json.team_2.abbreviation : 'T2', json.team_2 ? json.team_2.team_info : '', this.rightTeamIcon, !this._switchSides);

                this.leftTeamGamesWon.innerHTML = '';
                this.rightTeamGamesWon.innerHTML = '';

                let team1WonGames = 0;
                let team2WonGames = 0;
                let amountToWin = 2; // Default BO3

                if (json.game_flow && Object.keys(json.game_flow).length > 0) {
                    amountToWin = Math.ceil((Object.keys(json.game_flow).length) / 2);
                    for (const map in json.game_flow) {
                        if (json.game_flow[map].state === 'over' && json.game_flow[map].winner === 'team_1') team1WonGames += 1;
                        if (json.game_flow[map].state === 'over' && json.game_flow[map].winner === 'team_2') team2WonGames += 1;
                    }
                }

                for (let i = 1; i <= amountToWin; i++) {
                    this.leftTeamGamesWon.innerHTML += `<div class="map-won-point ${i <= team1WonGames ? 'full-point' : ''}"></div>`;
                    this.rightTeamGamesWon.innerHTML += `<div class="map-won-point ${i <= team2WonGames ? 'full-point' : ''}"></div>`;
                }

                this.leftTeamPoints = json.team_1_score || 0;
                this.rightTeamPoints = json.team_2_score || 0;
                this.updateTeamScores(this.leftTeamPoints, this.rightTeamPoints);
                this.updateRoundNumer(json.round_number || (this.leftTeamPoints + this.rightTeamPoints + 1));
            }
        } catch (e) {
            console.error('Error init gameScore:', e);
        }

        // Fallback polling every 500ms if websockets lag
        if (!this.interval) {
            this.interval = setInterval(() => {
                this.getGameState();
            }, 500);
        }
    }

    async getGameState() {
        try {
            const res = await fetch('../get_game_state', { method: 'GET' });
            if (res.status === 200) {
                const json = await res.json();
                if (json.round_number && json.round_number !== this.roundCounter) {
                    this.updateRoundNumer(json.round_number);
                }
                if (json.spike_down && !this.spikeDown) {
                    this.spikeDown = true;
                    this.startSpikeCountDown(45000);
                } else if (!json.spike_down && this.spikeDown) {
                    this.resetSpikeAnimation();
                }
                if (json.tournament_stage !== undefined) {
                    this.updateTournamentStage(json.tournament_stage);
                }
                if (json.team_1_score !== undefined && json.team_2_score !== undefined) {
                    if (json.team_1_score !== this.leftTeamPoints || json.team_2_score !== this.rightTeamPoints) {
                        this.updateTeamScores(json.team_1_score, json.team_2_score);
                    }
                }
                if (json.switch_sides !== undefined && json.switch_sides !== this._switchSides) {
                    this._switchSides = json.switch_sides;
                    this.switchSides();
                }
            }
        } catch (e) {}
    }

    updateTournamentStage(text) {
        if (!this.tournamentStageElement) this.tournamentStageElement = document.getElementById('tournament-stage');
        if (this.tournamentStageElement) {
            const cleanText = (text || '').trim();
            this.tournamentStageElement.textContent = cleanText;
            this.tournamentStageElement.style.display = cleanText ? 'block' : 'none';
        }
    }

    formatTeamDisplay(teamAbbr, teamInfo, teamImgLink, isAtk) {
        const hasImg = teamImgLink && teamImgLink.trim() !== '';
        const imgTag = hasImg ? `<img class="team-icon" src="${teamImgLink}" alt="${teamAbbr}" onerror="if (!this.dataset.triedProxy && '${teamImgLink}'.startsWith('http')) { this.dataset.triedProxy='true'; this.src='../api/tournament/proxy_image?url=' + encodeURIComponent('${teamImgLink}'); } else { this.onerror=null; this.style.display='none'; }">` : '';
        const sideClass = isAtk ? 'side-atk' : 'side-def';
        const sideText = isAtk ? 'ATK' : 'DEF';
        return `<div class="team-information-container">
                    ${imgTag}
                    <span class="team-name-and-seed">
                        <span class="name">${teamAbbr}</span>
                        <div style="display: flex; gap: 5px; align-items: center;">
                            <span class="seed">${teamInfo}</span>
                            <span class="team-side-indicator ${sideClass}">${sideText}</span>
                        </div>
                    </span>
                </div>
                <div class="color-separator-bar"></div>
                <div class="score-holder">
                    <span class="score-span">0</span>
                </div>`;
    }

    updateTeamScores(leftScore, rightScore) {
        if (leftScore > this.leftTeamPoints) this.showRoundWinPanel('left');
        if (rightScore > this.rightTeamPoints) this.showRoundWinPanel('right');
        this.leftTeamPoints = leftScore;
        this.rightTeamPoints = rightScore;
        const spans = document.getElementsByClassName('score-span');
        if (spans[0]) spans[0].textContent = this.leftTeamPoints.toString();
        if (spans[1]) spans[1].textContent = this.rightTeamPoints.toString();
    }

    showRoundWinPanel(teamName) {
        let teamIcon = (teamName === 'left') ? this.leftTeamIcon : this.rightTeamIcon;
        if (!this.currentWinPanel) {
            this.currentWinPanel = document.createElement('div');
            this.currentWinPanel.classList.add('round-win-panel-container');
            this.currentWinPanel.id = 'round-win-panel';
            this.currentWinPanel.innerHTML = `
                <div class="round-win-panel">
                    <div class="round-win-panel-inner-div" id="win-panel-content">
                        <svg height="200" width="780">
                            <path d="M5 5 L50 5 M725 5 L775 5 L775 50 M775 150 L775 195 L725 195 M50 195 L5 195 L5 150 M5 50 L5 5" fill="none" stroke="white" stroke-width="1"></path> 
                        </svg>
                        <div class="round-win-panel-round-counter">ROUND ${this.roundCounter}</div>
                        <span>ROUND WIN</span>
                        <img src="${teamIcon}" onerror="this.src='../visual_assets/blueTeamPlaceholder.jpg'">
                    </div>
                </div>`;
            document.body.appendChild(this.currentWinPanel);

            setTimeout(() => {
                if (this.currentWinPanel && this.currentWinPanel.parentNode) {
                    document.body.removeChild(this.currentWinPanel);
                }
                this.currentWinPanel = null;
            }, 4500);
        }
    }

    updateRoundNumer(newRoundNumber) {
        if (newRoundNumber) this.roundCounter = newRoundNumber;
        this._switchSides = (this.roundCounter > 12 && this.roundCounter <= 24) || (this.roundCounter > 24 && this.roundCounter % 2 === 0);
        if (this.roundCounterElement) this.roundCounterElement.textContent = `ROUND ${this.roundCounter}`;
        this.switchSides();
    }

    switchSides() {
        const leftIsAtk = !!this._switchSides;
        const rightIsAtk = !this._switchSides;

        if (leftIsAtk) {
            this.leftTeamContainer.classList.remove('green-team');
            this.leftTeamContainer.classList.add('red-team');
            this.rightTeamContainer.classList.remove('red-team');
            this.rightTeamContainer.classList.add('green-team');
        } else {
            this.leftTeamContainer.classList.remove('red-team');
            this.leftTeamContainer.classList.add('green-team');
            this.rightTeamContainer.classList.remove('green-team');
            this.rightTeamContainer.classList.add('red-team');
        }

        const leftSideEl = this.leftTeamContainer.querySelector('.team-side-indicator');
        if (leftSideEl) {
            leftSideEl.className = `team-side-indicator ${leftIsAtk ? 'side-atk' : 'side-def'}`;
            leftSideEl.textContent = leftIsAtk ? 'ATK' : 'DEF';
        }

        const rightSideEl = this.rightTeamContainer.querySelector('.team-side-indicator');
        if (rightSideEl) {
            rightSideEl.className = `team-side-indicator ${rightIsAtk ? 'side-atk' : 'side-def'}`;
            rightSideEl.textContent = rightIsAtk ? 'ATK' : 'DEF';
        }

        if (!this.spikeDown && this.leftAttackIndicator) {
            if (leftIsAtk) this.leftAttackIndicator.classList.remove('hidden');
            else this.leftAttackIndicator.classList.add('hidden');
        }
        if (!this.spikeDown && this.rightAttackIndicator) {
            if (rightIsAtk) this.rightAttackIndicator.classList.remove('hidden');
            else this.rightAttackIndicator.classList.add('hidden');
        }
    }

    startSpikeCountDown(timeMiliseconds) {
        if (this.leftAttackIndicator) this.leftAttackIndicator.classList.add('hidden');
        if (this.rightAttackIndicator) this.rightAttackIndicator.classList.add('hidden');
        if (this.roundCounterElement) this.roundCounterElement.classList.add('hidden');
        if (this.spikeElement) {
            this.spikeElement.animate(this.spikeInAnimation, this.animationTiming);
            this.spikeElement.src = '../visual_assets/spike_red.png';
        }
    }

    resetSpikeAnimation() {
        if (this.roundCounterElement) this.roundCounterElement.classList.remove('hidden');
        if (this.spikeElement) {
            this.spikeElement.animate(this.spikeOutAnimation, this.animationTiming);
            this.spikeElement.src = '../visual_assets/spike_white.png';
        }
        this.spikeDown = false;
        this.switchSides();
    }
}

const gameScoreInterface = new helValorantGameScore();
gameScoreInterface.init();