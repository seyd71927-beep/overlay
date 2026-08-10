
class upcommingMapInterface {
    constructor() {
        this.upcommingMapsDiv = document.getElementById('upcomming-maps');
    }

    async init() {
        await this.render();
        this.initSocket();
    }

    initSocket() {
        if (typeof io !== 'undefined') {
            const socket = io();
            socket.on('configUpdate', () => this.render());
            socket.on('mapPicksUpdate', () => this.render());
            socket.on('stateUpdate', () => this.render());
        }
    }

    async render() {
        try {
            const res = await fetch('../get_game_configuration', { method: 'GET' });
            if (res.status !== 200) return;
            const json = await res.json();
            const team1Icon = json.team_1 ? (json.team_1.icon_link || '../visual_assets/blueTeamPlaceholder.jpg') : '../visual_assets/blueTeamPlaceholder.jpg';
            const team2Icon = json.team_2 ? (json.team_2.icon_link || '../visual_assets/redTeamPlaceholder.jpg') : '../visual_assets/redTeamPlaceholder.jpg';
            
            this.upcommingMapsDiv.innerHTML = '';
            let mapArray = [];

            if (json.game_flow) {
                for (const key in json.game_flow) {
                    const item = json.game_flow[key];
                    const mapName = item.map || 'ascent';
                    switch (item.state) {
                        case 'over':
                            mapArray.push(['over', this.formatMapOverPanel(
                                item.team_1_score || 0,
                                item.team_2_score || 0,
                                mapName,
                                team1Icon,
                                team2Icon
                            )]);
                            break;
                        case 'current':
                            mapArray.push(['current', this.formatMapCurrentPanel(
                                mapName,
                                item.map_pick,
                                team1Icon,
                                team2Icon
                            )]);
                            break;
                        case 'upcomming':
                            mapArray.push(['upcomming', this.formatMapUpcommingPanel(
                                mapName,
                                item.map_pick,
                                team1Icon,
                                team2Icon
                            )]);
                            break;
                        case 'decider':
                            mapArray.push(['decider', this.formatMapDeciderPanel(mapName)]);
                            break;
                        default:
                            mapArray.push(['upcomming', this.formatMapUpcommingPanel(
                                mapName,
                                item.map_pick,
                                team1Icon,
                                team2Icon
                            )]);
                    }
                }
            }

            if (mapArray.length === 0) return;

            // Render maps
            for (let i = 0; i < mapArray.length; i++) {
                this.upcommingMapsDiv.innerHTML += mapArray[i][1];
            }

            // Apply corner clipping styles
            const containers = document.getElementsByClassName('map-select-information-container');
            if (containers.length > 0) {
                containers[0].classList.add('first-map-select');
                containers[containers.length - 1].classList.add('decider-map-select');
            }
        } catch (e) {
            console.error('Error rendering upcoming maps:', e);
        }
    }

    formatMapOverPanel(t1Score, t2Score, map, t1Icon, t2Icon) {
        let scoreString = `<img class="team-select-image" src="${t1Icon}"><span class="information-text">${t1Score}:${t2Score}</span><img class="team-select-image" src="${t2Icon}">`;
        if (t2Score > t1Score) {
            scoreString = `<img class="team-select-image" src="${t2Icon}"><span class="information-text">${t2Score}:${t1Score}</span><img class="team-select-image" src="${t1Icon}">`;
        }
        return `<div class="map-select-information-container">
                    <span class="map-text">${map.toUpperCase()}</span>
                    ${scoreString}
                </div>`;
    }

    formatMapCurrentPanel(map, team_selected, t1Icon, t2Icon) {
        let imageLink = (team_selected === 'team_1') ? t1Icon : (team_selected === 'team_2' ? t2Icon : '');
        return `<div class="map-select-information-container">
                    <span class="information-text">CURRENT:</span>
                    <span class="map-text">${map.toUpperCase()}</span>
                    ${imageLink !== '' ? `<img class="team-select-image" src="${imageLink}">` : ''}
                </div>`;
    }

    formatMapUpcommingPanel(map, team_selected, t1Icon, t2Icon) {
        let imageLink = (team_selected === 'team_1') ? t1Icon : (team_selected === 'team_2' ? t2Icon : '');
        return `<div class="map-select-information-container">
                    <span class="information-text">NEXT:</span>
                    <span class="map-text">${map.toUpperCase()}</span>
                    ${imageLink !== '' ? `<img class="team-select-image" src="${imageLink}">` : ''}
                </div>`;
    }

    formatMapDeciderPanel(map) {
        return `<div class="map-select-information-container">
                    <span class="information-text">DECIDER:</span>
                    <span class="map-text">${map.toUpperCase()}</span>
                </div>`;
    }
}

// Init New Interface
const mapList = new upcommingMapInterface();
mapList.init();