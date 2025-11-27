

    // --- CORE LOGIC ---
    function closeNotificationPopup() {
        try {
            const btn = document.querySelector('#notificationPopup .close, #notificationPopup [data-dismiss="modal"]');
            if (btn) btn.click();
        } catch (e) {}
    }

    function scrollToCelebSection() {
        const section = document.getElementById('usernameSearch');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function findLastCelebId() {
        const cards = document.querySelectorAll('div.profile');
        let lastId = null;
        cards.forEach(card => {
            const btn = card.querySelector('button.showMoreBtn');
            const idEl = card.querySelector('[id$="_parentElement"]');
            if (btn && idEl && btn.textContent.includes('Thêm bạn bè')) lastId = idEl.id.replace('_parentElement', '');
        });
        return lastId;
    }

    async function startRealtimeLogObserver(celebId) {
        if (webLogObserver) { clearInterval(webLogObserver); webLogObserver = null; }
        const webLogId = celebId + '_log';
        let webLogTextarea;
        try { webLogTextarea = await waitForElementById(webLogId, 10000, 250); } catch (e) { log(`Web log ${webLogId} not found.`, 'warn'); return; }
        
        log(`Watching log for ${celebId}...`, 'info');
        let lastLogContent = "";
        
        webLogObserver = setInterval(() => {
            const currentScriptLog = document.getElementById('dashboard-script-log');
            const currentWebLog = document.getElementById(webLogId);
            if (!currentScriptLog || !currentWebLog) { clearInterval(webLogObserver); webLogObserver = null; return; }
            const newLogContent = currentWebLog.value;
            if (newLogContent !== lastLogContent) {
                const addedText = newLogContent.substring(lastLogContent.length);
                currentScriptLog.value += addedText;
                lastLogContent = newLogContent;
                if (addedText.includes(CONFIG.CONNECTION_LOST_TRIGGER_STRING)) {
                    let counter = parseInt(sessionStorage.getItem(CONFIG.CONNECTION_LOST_COUNTER_KEY) || '0', 10) + 1;
                    sessionStorage.setItem(CONFIG.CONNECTION_LOST_COUNTER_KEY, String(counter));
                    log(`Connection lost retry ${counter}.`, 'warn');
                    updateStatsDisplay();
                    if (counter > CONFIG.CONNECTION_LOST_MAX_RETRIES) {
                        localStorage.setItem(CONFIG.TIMER_RESTART_KEY, 'true');
                        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
                        location.reload();
                    }
                }
            }
        }, 500);
    }

    async function processNextCeleb(celebIds, totalCount) {
        if (webLogObserver) { clearInterval(webLogObserver); webLogObserver = null; }
        const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
        stopCelebScanRetry();
        if (!state.isRunning) { log('Process stopped.', 'info'); return; }
        
        if (celebIds.length === 0) {
            sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ ...state, finished: true }));
            updateControlButtonState({ isRunning: true });
            log('All celebs processed.', 'success');
            runSentCount = totalCount;
            updateStatsDisplay();
            if (runTimerInterval) clearInterval(runTimerInterval);
            if (runActivityTimer) clearInterval(runActivityTimer);
            return;
        }

        const currentId = celebIds.shift();
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [...celebIds], totalCount: totalCount }));
        runSentCount = totalCount - celebIds.length;
        if(isTabActive) runActivityData[6]++;
        updateChartDisplay();
        updateStatsDisplay();

        let parentElement;
        try { parentElement = await waitForElementById(currentId + '_parentElement', 180000, 500); }
        catch (error) { log(`Container not found for ${currentId}. Skipping.`, 'error'); incrementErrorCount(); await processNextCeleb(celebIds, totalCount); return; }

        const profileDiv = parentElement.closest('.profile');
        const button = profileDiv ? profileDiv.querySelector('button.showMoreBtn') : null;
        const name = profileDiv ? profileDiv.querySelector('.profile-name').textContent.trim() : currentId;
        const imgSrc = profileDiv ? profileDiv.querySelector('.profile-circle img').src : CONFIG.LOGO_URL;
        
        if (!button || !button.textContent.includes('Thêm bạn bè')) {
            log(`Skipping ${name}.`);
            await processNextCeleb(celebIds, totalCount);
            return;
        }

        log(`Processing: ${name}`);
        showCelebPopup(name, `(${runSentCount}/${totalCount})`);
        processedCelebs.push({ id: currentId, name: name, imgSrc: imgSrc });
        sessionStorage.setItem(CONFIG.PROCESSED_CELEBS_KEY, JSON.stringify(processedCelebs));
        updateProcessedCelebsDisplay();

        button.click();
        await sleep(1000);
        const startButton = document.getElementById(currentId + '_startButton');
        if (startButton) {
            startButton.click();
            await sleep(2000);
            if (celebIds.length === 0) {
                log(`Finished last celeb: ${name}.`, 'success');
                startRealtimeLogObserver(currentId);
                sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [], totalCount: totalCount, finished: true }));
                updateControlButtonState({ isRunning: true });
                if (runTimerInterval) clearInterval(runTimerInterval);
                if (runActivityTimer) clearInterval(runActivityTimer);
            } else {
                const toolsLink = document.querySelector('a.nav-link[href="celebrity.html"]');
                if (toolsLink) toolsLink.click();
                else { log('Celeb Tools link not found.', 'error'); stopProcess(false); }
            }
        } else {
            log(`Start button not found for ${name}.`, 'error');
            if (webLogObserver) clearInterval(webLogObserver);
            await processNextCeleb(celebIds, totalCount);
        }
    }

    function stopCelebScanRetry() { if (celebScanRetryInterval) { clearInterval(celebScanRetryInterval); celebScanRetryInterval = null; } }

    function scanForCelebs() {
        const celebs = [];
        document.querySelectorAll('#celebrityList div.profile').forEach(card => {
            const btn = card.querySelector('button.showMoreBtn');
            const idEl = card.querySelector('[id$="_parentElement"]');
            if (btn && idEl && btn.textContent.includes('Thêm bạn bè')) {
                const id = idEl.id.replace('_parentElement', '');
                const img = card.querySelector('.profile-circle img');
                const name = card.querySelector('.profile-info .profile-name');
                const prog = card.querySelector('.profile-info .x-progress');
                const progText = card.querySelector('.profile-info .x-progress__text');
                const current = prog ? parseInt(prog.dataset.current, 10) : 0;
                const max = prog ? parseInt(prog.dataset.max, 10) : 1;
                let percent = (current / max) * 100;
                if (percent > 100) percent = 100;
                if (isNaN(percent) || max === 0) percent = 0;
                celebs.push({
                    id, name: name ? name.textContent.trim() : 'Unknown',
                    imgSrc: img ? img.src : '', progressText: progText ? progText.textContent.trim() : '0/0',
                    current, max, percent, progressColor: current >= max ? 'red' : '#46ce46'
                });
            }
        });
        return celebs;
    }

    function openDashboardModal() {
        const modal = document.getElementById('celeb-dashboard-modal');
        const listWrapper = document.getElementById('modal-celeb-list-wrapper');
        if (!modal || !listWrapper) return;
        
        const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
        if (state.isRunning) {
            showRunningView();
            const remaining = state.celebIds ? state.celebIds.length : 0;
            runSentCount = state.finished ? state.totalCount : (state.totalCount - remaining);
            runErrorCount = parseInt(localStorage.getItem('autoCelebErrorCount') || '0', 10);
            runStartTime = parseInt(sessionStorage.getItem('autoCelebRunStartTime') || Date.now().toString(), 10);
            updateProcessedCelebsDisplay();
            updateStatsDisplay();
            updateChartDisplay();
            if (runTimerInterval) clearInterval(runTimerInterval);
            runTimerInterval = setInterval(updateRunTimer, 1000);
        } else {
            listWrapper.innerHTML = `
                <div class="celeb-list-header"><h3>Celeb List</h3><button id="celeb-refresh-button" class="celeb-refresh-button"><span class="refresh-icon">⟳</span> Refresh</button></div>
                <div id="celeb-select-all-label"><div id="celeb-select-all-info"><span id="celeb-select-all-text">Select All</span><span id="celeb-selected-count">...</span></div><div class="toggle-switch select-all-toggle"><input type="checkbox" id="celeb-select-all-input" class="toggle-switch-input sr-only" checked><label for="celeb-select-all-input" class="toggle-switch-label"><span class="toggle-switch-handle"></span></label></div></div>
                <div id="celeb-selection-list"><p>Scanning...</p></div>
            `;
            const listContainer = document.getElementById('celeb-selection-list');
            const selectAllInput = document.getElementById('celeb-select-all-input');
            const selectAllContainer = document.getElementById('celeb-select-all-label');
            const countEl = document.getElementById('celeb-selected-count');
            
            const updateCount = () => {
                if (!countEl) return;
                const toggles = document.querySelectorAll('.celeb-item-toggle-input');
                const selected = Array.from(toggles).filter(t => t.checked).length;
                countEl.textContent = `Selected ${selected}/${toggles.length}`;
            };

            if (selectAllContainer && selectAllInput) {
                selectAllContainer.onclick = (e) => { if (!e.target.closest('.toggle-switch')) { selectAllInput.checked = !selectAllInput.checked; selectAllInput.dispatchEvent(new Event('change')); } };
                selectAllInput.onchange = () => {
                    const checked = selectAllInput.checked;
                    document.querySelectorAll('.celeb-item-toggle-input').forEach(t => { t.checked = checked; t.closest('.celeb-list-item-new').classList.toggle('selected', checked); });
                    updateCount();
                };
            }

            const renderList = (refresh = false) => {
                const list = scanForCelebs();
                if (!list.length) { listContainer.innerHTML = refresh ? '<p>Rescanning...</p>' : '<p>Waiting...</p>'; return false; }
                listContainer.innerHTML = '';
                selectAllInput.checked = true;
                list.forEach(c => {
                    const item = document.createElement('div');
                    item.className = 'celeb-list-item-new selected';
                    item.innerHTML = `
                        <div class="celeb-list-item-main"><div class="celeb-list-profile-image"><img src="${c.imgSrc}"><div class="celeb-list-icon">✦</div></div><div class="celeb-list-profile-info"><div class="celeb-list-profile-name">${c.name}</div><div class="celeb-list-progress"><div class="celeb-list-progress-bar" style="width:${c.percent}%; background:${c.progressColor}"></div></div><div class="celeb-list-progress-text">${c.progressText}</div></div></div>
                        <div class="celeb-item-toggle-wrapper toggle-switch"><input type="checkbox" value="${c.id}" class="celeb-item-toggle-input toggle-switch-input sr-only" checked><label class="toggle-switch-label"><span class="toggle-switch-handle"></span></label></div>
                    `;
                    const toggle = item.querySelector('input');
                    item.onclick = (e) => { if(!e.target.closest('.toggle-switch')) { toggle.checked = !toggle.checked; toggle.dispatchEvent(new Event('change')); } };
                    toggle.onchange = () => { item.classList.toggle('selected', toggle.checked); syncSelectAllToggle(); updateCount(); };
                    listContainer.appendChild(item);
                });
                updateCount();
                return true;
            };

            const retryLoop = (refresh = false) => {
                stopCelebScanRetry();
                celebScanRetryInterval = setInterval(() => { if (renderList(refresh)) stopCelebScanRetry(); }, 1000);
            };

            const refBtn = document.getElementById('celeb-refresh-button');
            if (refBtn) refBtn.onclick = (e) => { e.preventDefault(); refBtn.disabled = true; listContainer.innerHTML = 'Refreshing...'; retryLoop(true); setTimeout(() => refBtn.disabled = false, 1500); };

            if (!renderList()) retryLoop();
        }
        
        loadTimerConfig();
        updateControlButtonState(state);
        modal.style.display = 'block';
    }

    function startProcessFromModal() {
        const selected = document.querySelectorAll('.celeb-item-toggle-input:checked');
        const ids = Array.from(selected).map(c => c.value);
        if (!ids.length) { log('No celebs selected.', 'error'); return; }
        
        sessionStorage.removeItem(CONFIG.LOG_STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);
        processedCelebs = [];
        runErrorCount = 0; runSentCount = 0; runResetCount = 0;
        runStartTime = Date.now();
        sessionStorage.setItem('autoCelebRunStartTime', runStartTime.toString());
        localStorage.setItem('autoCelebErrorCount', '0');
        timePaused = 0; pauseStartTime = null; isTabActive = true;

        if (runTimerInterval) clearInterval(runTimerInterval);
        runTimerInterval = setInterval(updateRunTimer, 1000);
        runActivityData = [0,0,0,0,0,0,0];
        if (runActivityTimer) clearInterval(runActivityTimer);
        runActivityTimer = setInterval(rollActivityData, CHART_UPDATE_INTERVAL_MS);

        showRunningView();
        updateStatsDisplay();
        log('Starting...', 'rocket');
        
        sessionStorage.setItem('autoCelebOriginalList', JSON.stringify([...ids]));
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [...ids], totalCount: ids.length }));
        updateControlButtonState({ isRunning: true });
        
        if (currentTimerConfig.enabled) startReloadTimer(currentTimerConfig.minutes);
        processNextCeleb(ids, ids.length);
    }

    function stopProcess() {
        if (webLogObserver) clearInterval(webLogObserver);
        cancelReloadTimer();
        localStorage.removeItem(CONFIG.TIMER_RESTART_KEY);
        localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);
        sessionStorage.removeItem(CONFIG.PROCESSED_CELEBS_KEY);
        sessionStorage.removeItem('autoCelebRunStartTime');
        
        if (runTimerInterval) clearInterval(runTimerInterval);
        if (runActivityTimer) clearInterval(runActivityTimer);
        
        log('Stopped by user. Reloading...', 'info');
        location.reload();
    }

    // --- FRIENDS LOGIC ---
    const FRIEND_SELECTORS = {
        searchInput: '#usernameSearchInput',
        searchButton: '#usernameSearchSubmit',
        profileResultContainer: '#usernameSearchStatus .profile',
        actionButton: '#usernameSearchStatus .profile button',
    };

    function setupFriendToolLogic() {
        const startBtn = document.getElementById('auto-friend-start-button');
        const select = document.getElementById('friend-celeb-select');
        if (!startBtn || !select) return;
        
        const stopLoop = () => {
            if (friendSearchLoopId) { clearInterval(friendSearchLoopId); friendSearchLoopId = null; }
            isFriendSearchRunning = false;
            startBtn.textContent = 'Start Loop'; startBtn.classList.remove('running'); select.disabled = false;
        };
        
        const performSearch = async (uid) => {
            try {
                const input = await waitForElement(FRIEND_SELECTORS.searchInput);
                const btn = await waitForElement(FRIEND_SELECTORS.searchButton);
                const old = document.querySelector(FRIEND_SELECTORS.profileResultContainer);
                if (old) old.remove();
                input.value = uid; input.dispatchEvent(new Event('input', { bubbles: true })); btn.click();
                await waitForElement(FRIEND_SELECTORS.profileResultContainer);
                const actionBtn = document.querySelector(FRIEND_SELECTORS.actionButton);
                if (actionBtn) {
                    if (actionBtn.textContent.includes('Thêm bạn bè')) { actionBtn.click(); await sleep(1500); }
                    else stopLoop();
                }
            } catch (e) {}
        };
        
        const startLoop = (uid) => {
            if (isFriendSearchRunning) return;
            isFriendSearchRunning = true;
            startBtn.textContent = 'Stop Loop'; startBtn.classList.add('running'); select.disabled = true;
            performSearch(uid);
            friendSearchLoopId = setInterval(() => performSearch(uid), 3000);
        };
        
        startBtn.onclick = () => {
            if (isFriendSearchRunning) stopLoop();
            else if (select.value) startLoop(select.value);
        };
    }

    function populateCelebDropdown() {
        const select = document.getElementById('friend-celeb-select');
        if (!select) return;
        CELEB_LIST.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.uid; opt.textContent = c.name;
            select.appendChild(opt);
        });
    }