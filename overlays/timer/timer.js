class Timer {
    constructor(start_time, timer_target, timer_target_label, timer_container) {
        this.milliseconds = start_time || 0;
        this.timer_display = timer_target;
        this.label = timer_target_label;
        this.container = timer_container;
        this.timerRunning = false;
        this.timerInterval = null;

        if (typeof io !== 'undefined') {
            const socket = io();
            socket.on('timerUpdate', (data) => {
                this.handleTimerData(data);
            });
        }
    }

    async get_data() {
        try {
            const res = await fetch('../get_timer_info', { method: 'GET' });
            const json = await res.json();
            this.handleTimerData(json);
        } catch (e) {
            console.error(e);
        }
    }

    handleTimerData(json) {
        if (json.isOn) {
            const labelEl = document.getElementById(this.label);
            if (labelEl) labelEl.innerText = json.description || 'MATCH BREAK';

            let remaining = json.time;
            if (json.startTime) {
                const elapsed = Date.now() - json.startTime;
                remaining = Math.max(0, json.time - elapsed);
            }

            this.milliseconds = remaining;
            this.animate_timer_in();
            this.start_timer();
        } else {
            this.stop_timer();
            this.animate_timer_out();
        }
    }

    animate_timer_in() {
        const el = document.getElementById(this.container);
        if (el) {
            el.style.transform = 'translateX(0px)';
            el.style.transition = 'transform 0.4s ease-out';
        }
    }

    animate_timer_out() {
        const el = document.getElementById(this.container);
        if (el) {
            el.style.transform = 'translateX(-650px)';
            el.style.transition = 'transform 0.4s ease-in';
        }
    }

    stop_timer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.timerRunning = false;
    }

    start_timer() {
        if (this.timerRunning) return;
        this.timerRunning = true;

        this.timerInterval = setInterval(() => {
            this.milliseconds -= 100;
            if (this.milliseconds <= 0) {
                this.milliseconds = 0;
                this.renderTime(0);
                this.stop_timer();
                this.animate_timer_out();
                return;
            }
            this.renderTime(this.milliseconds);
        }, 100);
    }

    renderTime(ms) {
        let milliseconds = Math.floor((ms % 1000) / 10);
        let seconds = Math.floor((ms / 1000) % 60);
        let minutes = Math.floor((ms / (1000 * 60)) % 60);

        minutes = minutes < 10 ? `0${minutes}` : minutes;
        seconds = seconds < 10 ? `0${seconds}` : seconds;
        milliseconds = milliseconds < 10 ? `0${milliseconds}` : milliseconds;

        const displayEl = document.getElementById(this.timer_display);
        if (displayEl) {
            displayEl.textContent = `${minutes}:${seconds}:${milliseconds}`;
        }
    }
}

const timerInstance = new Timer(0, 'timer', 'timer-label', 'timer-container');
timerInstance.get_data();