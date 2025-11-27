
    // --- MAIN EXECUTION ---
    (function main() {
        console.log(`[Auto Locket Celeb] ➡️ Activated (${CONFIG.SCRIPT_VERSION}).`);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        setInterval(closeNotificationPopup, 1000);

        try {
            injectNewStyles();
            createMainControlUI();
            loadTimerConfig();
            setupMainUIControls();
        } catch (e) { console.error('Init error:', e); return; }

        const storedKey = localStorage.getItem(CONFIG.KEY_STORAGE_KEY);
        const isKeyValidated = (storedKey === CONFIG.SECRET_KEY);
        const container = document.getElementById('auto-celeb-main-container');
        
        if (isKeyValidated) container.classList.remove('locked');
        else { container.classList.add('locked'); localStorage.removeItem(CONFIG.KEY_STORAGE_KEY); console.log('Locked. Enter key.'); return; }

        if (window.location.href === CONFIG.TARGET_PAGE) {
            runCelebLogic();
        } else if (window.location.href === CONFIG.FRIENDS_PAGE) {
            const checkReady = setInterval(async () => {
                try {
                    await waitForElement(FRIEND_SELECTORS.searchInput, 500);
                    clearInterval(checkReady);
                    populateCelebDropdown();
                    setupFriendToolLogic();
                } catch (e) {}
            }, 500);
        }

        async function runCelebLogic() {
            try {
                await waitForElementById('usernameSearch', 20000);
                scrollToCelebSection();
                
                const openBtn = document.getElementById('auto-celeb-open-dashboard-btn');
                if (!openBtn) return;
                
                openBtn.onclick = () => {
                    const modal = document.getElementById('celeb-dashboard-modal');
                    if (modal.style.display !== 'block') { openDashboardModal(); openBtn.textContent = 'Close Dashboard'; openBtn.classList.add('close-mode'); }
                    else { modal.style.display = 'none'; openBtn.textContent = 'Open Dashboard'; openBtn.classList.remove('close-mode'); }
                };

                const startBtn = document.getElementById('dashboard-control-button');
                if (startBtn) startBtn.onclick = () => {
                    const s = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                    if (s.isRunning) stopProcess(); else startProcessFromModal();
                };

                let state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                const restartT = localStorage.getItem(CONFIG.TIMER_RESTART_KEY) === 'true';
                const restartC = localStorage.getItem(CONFIG.CELEB_RESTART_KEY) === 'true';
                
                updateControlButtonState(state);

                if (restartT) {
                    log('Timer restart detected.', 'timer');
                    localStorage.removeItem(CONFIG.TIMER_RESTART_KEY); localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
                    showPreRunCountdown(() => { openDashboardModal(); openBtn.textContent = 'Close Dashboard'; openBtn.classList.add('close-mode'); startProcessFromModal(); });
                } else if (restartC) {
                    log('Celeb reset detected.', 'warn');
                    localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
                    const last = findLastCelebId();
                    if (last && state.isRunning) {
                        log(`Retrying last celeb: ${last}`);
                        state.finished = false; state.celebIds = [last];
                        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
                    }
                }

                if (state.isRunning) {
                    log('Resuming...', 'info');
                    openDashboardModal(); openBtn.textContent = 'Close Dashboard'; openBtn.classList.add('close-mode');
                    if (currentTimerConfig.enabled) startReloadTimer(currentTimerConfig.minutes);
                    if (!state.finished && state.celebIds.length > 0) {
                        const storedProc = sessionStorage.getItem(CONFIG.PROCESSED_CELEBS_KEY);
                        processedCelebs = storedProc ? JSON.parse(storedProc) : [];
                        processNextCeleb(state.celebIds, state.totalCount);
                    } else if (state.finished) {
                        const last = findLastCelebId();
                        if (last && !webLogObserver) startRealtimeLogObserver(last);
                    }
                }
            } catch (e) {
                log('Init failed. Reloading...', 'error');
                location.reload();
            }
        }
    })();
