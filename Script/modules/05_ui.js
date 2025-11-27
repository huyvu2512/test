
    // --- UI FUNCTIONS ---
    function updateChartDisplay() {
        const bars = document.querySelectorAll('.chart-bar');
        if (bars.length === 0) return;
        const maxVal = Math.max(...runActivityData, 1);
        runActivityData.forEach((value, index) => {
            if (bars[index]) bars[index].style.height = `${(value / maxVal) * 100}%`;
        });
    }

    function rollActivityData() {
        if (!isTabActive) return;
        runActivityData.shift();
        runActivityData.push(0);
        updateChartDisplay();
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            isTabActive = false;
            if (runStartTime && !pauseStartTime) pauseStartTime = Date.now();
        } else {
            isTabActive = true;
            if (runStartTime && pauseStartTime) {
                timePaused += (Date.now() - pauseStartTime);
                pauseStartTime = null;
            }
        }
    }

    function incrementErrorCount() {
        runErrorCount++;
        localStorage.setItem('autoCelebErrorCount', runErrorCount.toString());
        updateStatsDisplay();
    }

    function updateStatsDisplay() {
        const sentEl = document.getElementById('stat-sent');
        const timeEl = document.getElementById('stat-time');
        const errorEl = document.getElementById('stat-error');
        const resetEl = document.getElementById('stat-reset');
        if (sentEl) sentEl.textContent = runSentCount.toString();
        if (errorEl) errorEl.textContent = runErrorCount.toString();
        runResetCount = parseInt(sessionStorage.getItem(CONFIG.CONNECTION_LOST_COUNTER_KEY) || '0', 10);
        if (resetEl) resetEl.textContent = runResetCount.toString();
        updateRunTimer();
    }

    function updateRunTimer() {
        const timeEl = document.getElementById('stat-time');
        if (!timeEl) return;
        if (!runStartTime) { timeEl.textContent = '00:00:00'; return; }
        let currentPauseDuration = 0;
        if (!isTabActive && pauseStartTime) currentPauseDuration = Date.now() - pauseStartTime;
        const totalElapsed = Date.now() - runStartTime;
        const totalPaused = timePaused + currentPauseDuration;
        const activeRunTimeSeconds = Math.floor((totalElapsed - totalPaused) / 1000);
        if (activeRunTimeSeconds >= 0) timeEl.textContent = formatTimeWithHours(activeRunTimeSeconds);
    }

    function showRunningView() {
        const listWrapper = document.getElementById('modal-celeb-list-wrapper');
        if (!listWrapper) return;
        listWrapper.innerHTML = `
            <div id="running-view-wrapper">
                <div id="running-chart-container">
                    <div id="chart-bars-wrapper"><div class="chart-bar"></div><div class="chart-bar"></div><div class="chart-bar"></div><div class="chart-bar"></div><div class="chart-bar"></div><div class="chart-bar"></div><div class="chart-bar"></div></div>
                    <div id="chart-labels-wrapper" style="display: flex; justify-content: space-around; color: #aaa; font-size: 10px; margin-top: 5px;"><span>-6m</span><span>-5m</span><span>-4m</span><span>-3m</span><span>-2m</span><span>-1m</span><span>Now</span></div>
                </div>
                <div id="running-stats-container" style="background: rgba(0,0,0,0.2); border-radius: 12px; padding: 10px; margin-top: 15px;">
                    <p style="display:flex; justify-content:space-between; color:#eee;"><strong>Sent:</strong> <span id="stat-sent" style="color:#f59e0b">0</span></p>
                    <p style="display:flex; justify-content:space-between; color:#eee;"><strong>Time:</strong> <span id="stat-time" style="color:#22c55e">00:00:00</span></p>
                    <p style="display:flex; justify-content:space-between; color:#eee;"><strong>Errors:</strong> <span id="stat-error" style="color:#ef4444">0</span></p>
                    <p style="display:flex; justify-content:space-between; color:#eee;"><strong>Resets:</strong> <span id="stat-reset" style="color:#f59e0b">0</span></p>
                </div>
                <div id="processed-celebs-container" style="margin-top: 15px;"><p style="color:#eee; font-weight:600; margin-bottom:10px;">Processed:</p><div id="processed-celebs-list" style="display:flex; gap:8px; overflow-x:auto;"></div></div>
            </div>
        `;
        updateChartDisplay();
        const logWrapper = document.getElementById('dashboard-log-wrapper');
        if (logWrapper) logWrapper.style.display = 'flex';
        updateProcessedCelebsDisplay();
    }

    function updateProcessedCelebsDisplay() {
        const container = document.getElementById('processed-celebs-list');
        if (!container) return;
        const stored = sessionStorage.getItem(CONFIG.PROCESSED_CELEBS_KEY);
        const list = stored ? JSON.parse(stored) : [];
        container.innerHTML = list.map(c => `<img src="${c.imgSrc}" title="${c.name}" style="width:40px; height:40px; border-radius:50%; border:2px solid #8b5cf6; flex-shrink:0;">`).join('');
    }

    function showCelebPopup(celebName, countText) {
        let container = document.getElementById('auto-celeb-popup-container');
        if (!container) { container = document.createElement('div'); container.id = 'auto-celeb-popup-container'; document.body.appendChild(container); }
        const popup = document.createElement('div');
        popup.className = 'celeb-popup-item';
        popup.innerHTML = `<span class="celeb-count">${countText}</span> Processing: <span class="celeb-name">${celebName}</span>`;
        container.prepend(popup);
        setTimeout(() => { popup.remove(); if(container.children.length === 0) container.remove(); }, 4000);
    }

    function showToastNotification(message, type = 'info', duration = 4000) {
        let container = document.getElementById('auto-celeb-popup-container');
        if (!container) { container = document.createElement('div'); container.id = 'auto-celeb-popup-container'; document.body.appendChild(container); }
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.innerHTML = `<span class="toast-message">${message}</span>`;
        container.prepend(toast);
        setTimeout(() => toast.remove(), duration);
    }
    
    function createMainControlUI() {
        const container = document.createElement('div');
        container.id = 'auto-celeb-main-container';
        container.innerHTML = `<div id="auto-celeb-popup-header"><span id="auto-celeb-popup-title"><img src="${CONFIG.LOGO_URL}" id="auto-celeb-title-icon"> Locket Celebrity ${CONFIG.SCRIPT_VERSION}</span><span id="auto-celeb-collapse-toggle">&#9660;</span></div>`;
        
        const isCelebPage = window.location.href === CONFIG.TARGET_PAGE;
        const isFriendPage = window.location.href === CONFIG.FRIENDS_PAGE;
        const isLoginPage = window.location.href === CONFIG.LOGIN_PAGE;

        if (isCelebPage || isFriendPage) {
            const tabNav = document.createElement('div');
            tabNav.id = 'auto-celeb-tab-nav';
            tabNav.innerHTML = `<a id="tab-celeb-tools" class="nav-tab ${isCelebPage ? 'active' : ''}" href="${CONFIG.TARGET_PAGE}">Celebrity Tools</a><a id="tab-friend-tools" class="nav-tab ${isFriendPage ? 'active' : ''}" href="${CONFIG.FRIENDS_PAGE}">Friends</a>`;
            container.appendChild(tabNav);
        }

        const keyWall = document.createElement('div');
        keyWall.id = 'auto-celeb-key-wall';
        keyWall.innerHTML = `<img id="key-wall-icon" src="${CONFIG.LOGO_URL}"><h3 id="key-wall-title">Activate Script</h3><p id="key-wall-message">Please enter the key.</p><a id="btn-get-key" href="${CONFIG.MESSENGER_LINK}" target="_blank">Get Key</a><input type="text" id="key-input-field" placeholder="Enter key..."><button id="btn-submit-key">Verify Key</button><p id="key-error-message">Invalid key.</p>`;
        container.appendChild(keyWall);

        if (isCelebPage) {
            const openDashboardButton = document.createElement('button');
            openDashboardButton.id = 'auto-celeb-open-dashboard-btn';
            const initialState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
            openDashboardButton.textContent = initialState.isRunning ? 'Close Dashboard' : 'Open Dashboard';
            if(initialState.isRunning) openDashboardButton.classList.add('close-mode');
            container.appendChild(openDashboardButton);
            
            const footerButtons = document.createElement('div');
            footerButtons.id = 'auto-celeb-footer-buttons';
            footerButtons.innerHTML = `<button id="btn-main-update" class="footer-btn">Update</button><button id="btn-main-bug-report" class="footer-btn">Report</button><button id="btn-main-donate" class="footer-btn">Donate</button>`;
            container.appendChild(footerButtons);
        } else if (isFriendPage) {
            const friendTool = document.createElement('div');
            friendTool.id = 'auto-friend-tool-wrapper';
            friendTool.innerHTML = `<h3 id="friend-tool-title">AUTO SEARCH</h3><select id="friend-celeb-select"><option value="" selected disabled>-- Select Celeb --</option></select><button id="auto-friend-start-button">Start Loop</button>`;
            container.appendChild(friendTool);
        } else if (isLoginPage) {
             const loginNotice = document.createElement('div');
             loginNotice.id = 'auto-celeb-login-notice';
             loginNotice.innerHTML = '<h4>Login Required</h4><p>Please login to use.</p>';
             container.appendChild(loginNotice);
        } else {
             const redirectButtons = document.createElement('div');
             redirectButtons.id = 'auto-celeb-redirect-buttons';
             redirectButtons.innerHTML = `<a href="${CONFIG.TARGET_PAGE}" id="redirect-celeb" class="auto-celeb-redirect-button">➡️ Go to Celebrity</a>`;
             container.appendChild(redirectButtons);
        }

        document.body.appendChild(container);

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = `
            <div id="auto-celeb-modal-overlay" style="display: none;"></div>
            <div id="celeb-dashboard-modal" class="auto-celeb-modal" style="display: none;">
                <div id="modal-dashboard-layout">
                    <div id="modal-celeb-list-wrapper">
                        <h3>Locket Celeb List</h3>
                        <div id="celeb-select-all-label"><div id="celeb-select-all-info"><span id="celeb-select-all-text">Select All</span><span id="celeb-selected-count">...</span></div><div class="toggle-switch select-all-toggle"><input type="checkbox" id="celeb-select-all-input" class="toggle-switch-input sr-only" checked><label for="celeb-select-all-input" class="toggle-switch-label"><span class="toggle-switch-handle"></span></label></div></div>
                        <div id="celeb-selection-list"><p style="color:#aaa;">Scanning...</p></div>
                    </div>
                    <div id="modal-celeb-controls-wrapper">
                        <button id="dashboard-control-button">Start Auto Celeb</button>
                        <div id="dashboard-timer-ui">
                            <div id="timer-display-group"><span id="timer-display">00:00</span><div id="timer-adjust-buttons"><span id="timer-plus-btn" class="timer-adjust-btn">+5</span><span id="timer-minus-btn" class="timer-adjust-btn">-5</span></div></div>
                            <div id="timer-toggle-switch" class="toggle-switch"><input type="checkbox" id="timer-toggle-input" class="toggle-switch-input sr-only"><label for="timer-toggle-input" class="toggle-switch-label"><span class="toggle-switch-handle"></span></label></div>
                        </div>
                        <div id="dashboard-log-wrapper"><label>System Log</label><textarea id="dashboard-script-log" rows="10" disabled></textarea></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalContainer);
    }
    
    function updateControlButtonState(state) {
        const modalButton = document.getElementById('dashboard-control-button');
        if (!modalButton) return;
        if (state.isRunning) { modalButton.textContent = 'Stop Auto Celeb'; modalButton.classList.add('running'); }
        else { modalButton.textContent = 'Start Auto Celeb'; modalButton.classList.remove('running'); }
    }
    
    function updateTimerUI(mode, value) {
        const timerUI = document.getElementById('dashboard-timer-ui');
        if (!timerUI) return;
        const display = timerUI.querySelector('#timer-display');
        const toggleInput = timerUI.querySelector('#timer-toggle-input');
        if (!display || !toggleInput) return;
        timerUI.classList.remove('timer-counting');
        if (mode === 'counting') {
            timerUI.classList.add('timer-counting');
            display.textContent = formatTimeWithHours(value);
            toggleInput.checked = true;
        } else {
            display.textContent = `${currentTimerConfig.minutes.toString().padStart(2, '0')}:00`;
            toggleInput.checked = currentTimerConfig.enabled;
        }
    }
    
    function loadTimerConfig() {
        const configStr = localStorage.getItem(CONFIG.TIMER_CONFIG_KEY);
        if (configStr) {
            const savedConfig = JSON.parse(configStr);
            currentTimerConfig.minutes = savedConfig.minutes || 60;
            currentTimerConfig.enabled = savedConfig.enabled || false;
        }
        if (document.getElementById('dashboard-timer-ui')) {
            const activeTimerEndTime = sessionStorage.getItem(CONFIG.TIMER_END_TIME_KEY);
            if (!activeTimerEndTime) updateTimerUI();
        }
    }
    
    function saveTimerConfig() {
        localStorage.setItem(CONFIG.TIMER_CONFIG_KEY, JSON.stringify({ minutes: currentTimerConfig.minutes, enabled: currentTimerConfig.enabled }));
    }

    function generateDonateQR() {
        // ... donate logic ... (simplified for split)
    }

    function setupMainUIControls() {
        const mainContainer = document.getElementById('auto-celeb-main-container');
        const collapseToggle = document.getElementById('auto-celeb-collapse-toggle');
        const popupTitle = document.getElementById('auto-celeb-popup-title');
        const toggleCollapse = () => mainContainer.classList.toggle('collapsed');
        if (collapseToggle) collapseToggle.addEventListener('click', toggleCollapse);
        if (popupTitle) popupTitle.addEventListener('click', toggleCollapse);

        const btnSubmitKey = document.getElementById('btn-submit-key');
        const keyInput = document.getElementById('key-input-field');
        const keyError = document.getElementById('key-error-message');
        const validateKey = () => {
            if (keyInput.value.trim() === CONFIG.SECRET_KEY) {
                localStorage.setItem(CONFIG.KEY_STORAGE_KEY, keyInput.value.trim());
                showToastNotification('Activated! Reloading...', 'success', 3000);
                keyError.style.display = 'none';
                setTimeout(() => location.reload(), 2000);
            } else {
                keyError.style.display = 'block';
                keyInput.classList.add('shake');
                setTimeout(() => keyInput.classList.remove('shake'), 300);
            }
        };
        if(btnSubmitKey) btnSubmitKey.addEventListener('click', validateKey);

        const dashboardModal = document.getElementById('celeb-dashboard-modal');
        if (!dashboardModal) return;

        const plusBtn = dashboardModal.querySelector('#timer-plus-btn');
        const minusBtn = dashboardModal.querySelector('#timer-minus-btn');
        const toggleInput = dashboardModal.querySelector('#timer-toggle-input');
        
        if (plusBtn) plusBtn.addEventListener('click', () => { if (!activeTimerId) { currentTimerConfig.minutes += 5; saveTimerConfig(); updateTimerUI(); } });
        if (minusBtn) minusBtn.addEventListener('click', () => { if (!activeTimerId && currentTimerConfig.minutes > 5) { currentTimerConfig.minutes -= 5; saveTimerConfig(); updateTimerUI(); } });
        if (toggleInput) toggleInput.addEventListener('change', () => { if (!activeTimerId) { currentTimerConfig.enabled = toggleInput.checked; saveTimerConfig(); updateTimerUI(); } });
    }
    
    function syncSelectAllToggle() {
        const selectAllInput = document.getElementById('celeb-select-all-input');
        if (!selectAllInput) return;
        const allCelebToggles = document.querySelectorAll('.celeb-item-toggle-input');
        if (allCelebToggles.length === 0) { selectAllInput.checked = false; return; }
        const checkedCount = Array.from(allCelebToggles).filter(toggle => toggle.checked).length;
        selectAllInput.checked = checkedCount === allCelebToggles.length;
    }
