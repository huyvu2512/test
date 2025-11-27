
    // --- TIMER LOGIC ---
    function startReloadTimer(minutes) {
        currentTimerTotalDuration = minutes * 60;
        if (activeTimerId) clearInterval(activeTimerId);
        let endTimeStr = sessionStorage.getItem(CONFIG.TIMER_END_TIME_KEY);
        let endTime;
        if (!endTimeStr) {
            endTime = Date.now() + currentTimerTotalDuration * 1000;
            sessionStorage.setItem(CONFIG.TIMER_END_TIME_KEY, endTime.toString());
            log(`Timer started. Reset in ${minutes} mins.`, 'timer');
        } else {
            endTime = parseInt(endTimeStr, 10);
            log(`Timer resumed.`, 'timer');
        }
        function updateCountdown() {
            const secondsRemaining = (endTime - Date.now()) / 1000;
            if (secondsRemaining <= 0) {
                clearInterval(activeTimerId); activeTimerId = null;
                sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
                updateTimerUI('counting', 0);
                executeTimerReset();
            } else {
                updateTimerUI('counting', secondsRemaining);
            }
        }
        updateCountdown();
        activeTimerId = setInterval(updateCountdown, 1000);
    }
    
    function cancelReloadTimer() {
        if (webLogObserver) clearInterval(webLogObserver);
        if (activeTimerId) { clearInterval(activeTimerId); activeTimerId = null; log('Timer cancelled.', 'info'); updateTimerUI(); }
        sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
    }
    
    function executeTimerReset() {
        if (webLogObserver) clearInterval(webLogObserver);
        log('Timer finished. Reloading...', 'timer');
        localStorage.setItem(CONFIG.TIMER_RESTART_KEY, 'true');
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
        location.reload();
    }
    
    function showPreRunCountdown(callback) {
        const overlay = document.createElement('div');
        overlay.id = 'auto-celeb-pre-run-overlay';
        overlay.innerHTML = '<div id="auto-celeb-pre-run-modal"><h2>Anti-Lag</h2><p>Starting in:</p><div id="auto-celeb-pre-run-timer">3</div></div>';
        document.body.appendChild(overlay);
        let countdown = 3;
        const interval = setInterval(() => {
            countdown--;
            document.getElementById('auto-celeb-pre-run-timer').textContent = countdown;
            if (countdown <= 0) { clearInterval(interval); overlay.remove(); callback(); }
        }, 1000);
    }
