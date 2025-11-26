// ==UserScript==
// @name         Auto Locket Celeb (v1.3)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Tự động kết bạn với tất cả Celeb, hẹn giờ tùy chỉnh để khởi động lại web.
// @author       Huy Vũ
// @match        https://locket.binhake.dev/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      open.oapi.vn
// @icon         https://i.imgur.com/AM2f24N.png
// ==/UserScript==

(function() {
    'use strict';

    // --- CẤU HÌNH SCRIPT ---
    const CONFIG = {
        STORAGE_KEY: 'autoCelebState_v2',
        LOG_STORAGE_KEY: 'autoCelebScriptLog_v2',
        TIMER_CONFIG_KEY: 'autoCelebTimerConfig_v2.9',
        TIMER_RESTART_KEY: 'autoCelebTimerRestart',
        TIMER_END_TIME_KEY: 'autoCelebTimerEndTime',
        TARGET_PAGE: 'https://locket.binhake.dev/celebrity.html',
        FRIENDS_PAGE: 'https://locket.binhake.dev/friends.html',
        LOGIN_PAGE: 'https://locket.binhake.dev/login.html', // NEW: Trang đăng nhập
        LOGO_URL: 'https://i.imgur.com/AM2f24N.png',

        CELEB_RESTART_KEY: 'autoCelebCelebRestart',
        CONNECTION_LOST_COUNTER_KEY: 'autoCelebConnectionLostCounter',
        CONNECTION_LOST_TRIGGER_STRING: "The connection was suddenly lost. Reconnecting after 5 second...",
        PROCESSED_CELEBS_KEY: 'autoCelebProcessedCelebs_v1', // NEW: Key lưu danh sách celeb đã chạy
        CONNECTION_LOST_MAX_RETRIES: 5,

        SECRET_KEY: '2025',
        KEY_STORAGE_KEY: 'autoCelebKeyValidated_v1',
        MESSENGER_LINK: 'https://www.messenger.com/c/655145337208323/',

        SCRIPT_VERSION: 'v1.3', // <--- CẬP NHẬT VERSION
        UPDATE_URL: 'https://raw.githubusercontent.com/huyvu2512/locket-celebrity/main/script/tampermonkey.user.js'
    };

    const CELEB_LIST = [
        { name: 'Locket HQ 💛', uid: 'locket.hq' },
        { name: 'SZA & MoRuf Backstage Test', uid: 'szamoruf_1' }
    ];

    // --- BIẾN TOÀN CỤC ---
    let activeTimerId = null;
    let currentTimerConfig = { enabled: false, minutes: 60 };
    let currentTimerTotalDuration = 0;
    let webLogObserver = null;
    let isFriendSearchRunning = false;
    let friendSearchLoopId = null;

    // --- BIẾN THỐNG KÊ MỚI ---
    let runStartTime = null;
    let runTimerInterval = null;
    let runErrorCount = 0;
    let runSentCount = 0;
    let runResetCount = 0;
    // --- BIẾN BIỂU ĐỒ & TIMER MỚI ---
    let runActivityData = [0, 0, 0, 0, 0, 0, 0]; // 7 buckets cho biểu đồ
    let runActivityTimer = null; // Timer để "dịch chuyển" (roll) biểu đồ
    const CHART_UPDATE_INTERVAL_MS = 60000; // 1 phút = 1 bucket mới

    let isTabActive = true;
    let timePaused = 0; // Tổng thời gian đã pause (ms)
    let pauseStartTime = null; // Mốc thời gian bắt đầu pause
    let processedCelebs = []; // NEW: Danh sách các celeb đã được xử lý

    let celebScanRetryInterval = null;

    // --- UI & Logging ---

    function getTimestamp() {
        const now = new Date();
        const date = [now.getDate().toString().padStart(2, '0'), (now.getMonth() + 1).toString().padStart(2, '0'), now.getFullYear()];
        const time = [now.getHours().toString().padStart(2, '0'), now.getMinutes().toString().padStart(2, '0'), now.getSeconds().toString().padStart(2, '0')];
        return `[${date.join('/')} ${time.join(':')}]`;
    }

    /**
     * HÀM GHI LOG
     */
    function log(message, type = 'log') {
        const styles = { log: 'color: inherit;', info: 'color: #3b82f6;', success: 'color: #22c55e;', error: 'color: #ef4444; font-weight: bold;', rocket: '', timer: 'color: #f59e0b;', warn: 'color: #f59e0b;' };
        const prefix = type === 'rocket' ?
            '🚀' : (type === 'success' ? '✅' : (type === 'info' ? 'ℹ️' : (type === 'timer' ? '⏱️' : (type === 'warn' ? '⚠️' : '➡️'))));
        console.log(`%c[Auto Locket Celeb]%c ${prefix} ${message}`, 'color: #8b5cf6; font-weight: bold;', styles[type] || styles.log);
        try {
            const logTextarea = document.getElementById('dashboard-script-log');
            const filteredMessages = [
                "Thời gian hẹn giờ tối thiểu", "Tăng thời gian hẹn giờ lên", "Giảm thời gian hẹn giờ xuống",
                "Đã TIẾP TỤC đồng hồ đếm ngược", "Hẹn giờ ĐÃ TẮT", "Hẹn giờ ĐÃ BẬT",
                'Bắt đầu theo dõi nhật ký của', 'Tiếp tục xử lý danh sách celeb...', 'Vui lòng nhập username để bắt đầu lặp.'
            ];

            const isFiltered = filteredMessages.some(filter => message.includes(filter));
            const timestamp = getTimestamp();
            const logMessage = `${timestamp} ${message}\n`;
            if (logTextarea && !isFiltered) {
                logTextarea.value += logMessage;
                logTextarea.scrollTop = logTextarea.scrollHeight;
            }

            // Lưu log vào session storage
            const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
            const needsTimerRestart = localStorage.getItem(CONFIG.TIMER_RESTART_KEY) === 'true';
            if ((state.isRunning || needsTimerRestart) && !isFiltered) {
                let storedLog = sessionStorage.getItem(CONFIG.LOG_STORAGE_KEY) || "";
                storedLog += logMessage;
                sessionStorage.setItem(CONFIG.LOG_STORAGE_KEY, storedLog);
            }

        } catch (e) {
            // Bỏ qua lỗi
        }
    }

    /**
     * TẢI LOG ĐÃ LƯU
     */
    function loadPersistentLog() {
        if (window.location.href !== CONFIG.TARGET_PAGE) return;

        try {
            const storedLog = sessionStorage.getItem(CONFIG.LOG_STORAGE_KEY);
            const logTextarea = document.getElementById('dashboard-script-log');

            if (logTextarea && storedLog) {
                logTextarea.value = storedLog;
                logTextarea.scrollTop = logTextarea.scrollHeight;
            }
        } catch (e) {
            console.error('[Auto Locket Celeb] Lỗi khi tải log đã lưu: ', e);
        }
    }

    /**
     * HÀM MỚI: Cập nhật hiển thị biểu đồ
     */
    function updateChartDisplay() {
        const bars = document.querySelectorAll('.chart-bar');
        if (bars.length === 0) return;

        // Lấy max, tối thiểu là 1 để tránh chia cho 0
        const maxVal = Math.max(...runActivityData, 1);
        runActivityData.forEach((value, index) => {
            if (bars[index]) {
                const percent = (value / maxVal) * 100;
                bars[index].style.height = `${percent}%`;
            }
        });
    }

    /**
     * HÀM MỚI: Dịch chuyển dữ liệu biểu đồ (mỗi phút)
     */
    function rollActivityData() {
        if (!isTabActive) return; // Chỉ dịch chuyển khi tab active
        runActivityData.shift(); // Xóa bucket cũ nhất
        runActivityData.push(0); // Thêm bucket mới
        updateChartDisplay(); // Vẽ lại biểu đồ
    }

    /**
     * HÀM MỚI: Xử lý khi chuyển tab (Pause/Resume timer)
     */
    function handleVisibilityChange() {
        if (document.hidden) {
            // Chuyển tab đi
            isTabActive = false;
            // Nếu script đang chạy, bắt đầu bấm giờ pause
            if (runStartTime && !pauseStartTime) {
                pauseStartTime = Date.now();
            }
        } else {
            // Chuyển tab về
            isTabActive = true;
            // Nếu script đang chạy và đang pause, tính thời gian đã pause
            if (runStartTime && pauseStartTime) {
                timePaused += (Date.now() - pauseStartTime);
                pauseStartTime = null;
            }
        }
    }

    /**
     * HÀM MỚI: Tăng bộ đếm lỗi và lưu trữ
     */
    function incrementErrorCount() {
        runErrorCount++;
        localStorage.setItem('autoCelebErrorCount', runErrorCount.toString());
        updateStatsDisplay();
    }

    /**
     * HÀM MỚI: Cập nhật hiển thị thống kê
     */
    function updateStatsDisplay() {
        const sentEl = document.getElementById('stat-sent');
        const timeEl = document.getElementById('stat-time');
        const errorEl = document.getElementById('stat-error');
        const resetEl = document.getElementById('stat-reset');

        if (sentEl) sentEl.textContent = runSentCount.toString();
        if (errorEl) errorEl.textContent = runErrorCount.toString();

        runResetCount = parseInt(sessionStorage.getItem(CONFIG.CONNECTION_LOST_COUNTER_KEY) || '0', 10);
        if (resetEl) resetEl.textContent = runResetCount.toString();
        // Cập nhật thời gian chạy (đã bao gồm logic pause)
        updateRunTimer();
    }

    /**
     * HÀM CẬP NHẬT ĐỒNG HỒ (ĐÃ SỬA LOGIC PAUSE)
     */
    function updateRunTimer() {
        const timeEl = document.getElementById('stat-time');
        if (!timeEl) return;
        if (!runStartTime) {
            timeEl.textContent = '00:00:00';
            return;
        }

        // Tính toán thời gian chạy thực tế
        let currentPauseDuration = 0;
        // Nếu tab không active VÀ đang trong mốc pause
        if (!isTabActive && pauseStartTime) {
            currentPauseDuration = Date.now() - pauseStartTime;
        }

        const totalElapsed = Date.now() - runStartTime;
        const totalPaused = timePaused + currentPauseDuration;
        const activeRunTimeSeconds = Math.floor((totalElapsed - totalPaused) / 1000);

        if (activeRunTimeSeconds >= 0) {
             timeEl.textContent = formatTimeWithHours(activeRunTimeSeconds);
        }
    }

    /**
     * HÀM MỚI: Hiển thị giao diện đang chạy (thay thế danh sách celeb)
     * ĐÃ CẬP NHẬT: XÓA POPUP CLONE
     */
    function showRunningView() {
        const listWrapper = document.getElementById('modal-celeb-list-wrapper');
        if (!listWrapper) {
            console.error('[Auto Locket Celeb] KHÔNG TÌM THẤY #modal-celeb-list-wrapper');
            return;
        }

        listWrapper.innerHTML = `
            <div id="running-view-wrapper">
                <div id="running-chart-container">
                    <div id="chart-bars-wrapper">
                        <div class="chart-bar"></div>
                        <div class="chart-bar"></div>
                        <div class="chart-bar"></div>
                        <div class="chart-bar"></div>
                        <div class="chart-bar"></div>
                        <div class="chart-bar"></div>
                        <div class="chart-bar"></div>
                    </div>
                    <div id="chart-labels-wrapper">
                        <span>-6m</span>
                        <span>-5m</span>
                        <span>-4m</span>
                        <span>-3m</span>
                        <span>-2m</span>
                        <span>-1m</span>
                        <span>Giờ</span>
                    </div>
                </div>

                <div id="running-stats-container">
                    <p><strong>Số lần gửi kết bạn:</strong> <span id="stat-sent">0</span></p>
                    <p><strong>Thời gian chạy:</strong> <span id="stat-time">00:00:00</span></p>
                    <p><strong>Số lần lỗi:</strong> <span id="stat-error">0</span></p>
                    <p><strong>Số lần reset:</strong> <span id="stat-reset">0</span></p>
                </div>

                <div id="processed-celebs-container">
                    <p><strong>Những Celeb đã chạy:</strong></p>
                    <div id="processed-celebs-list"></div>
                </div>
            </div>
        `;
        // Vẽ biểu đồ lần đầu (toàn số 0)
        updateChartDisplay();
        // Hiển thị nhật ký khi đang chạy
        const logWrapper = document.getElementById('dashboard-log-wrapper');
        if (logWrapper) {
            logWrapper.style.display = 'flex';
        }
        updateProcessedCelebsDisplay(); // NEW: Cập nhật hiển thị celeb đã chạy
    }

    // <-- HÀM cloneRunningPopup() ĐÃ BỊ XÓA HOÀN TOÀN -->

    function showCelebPopup(celebName, countText) {
        let container = document.getElementById('auto-celeb-popup-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'auto-celeb-popup-container';
            document.body.appendChild(container);
        }
        const popup = document.createElement('div');
        popup.className = 'celeb-popup-item';
        popup.innerHTML = `
            <span class="celeb-count">${countText}</span>
            Đang xử lý: <span class="celeb-name">${celebName}</span>
        `;
        container.prepend(popup);
        setTimeout(() => {
            popup.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        }, 4000);
    }

    /**
     * TIÊM CSS (ĐÃ SỬA: XÓA CSS POPUP CLONE)
     */
    function injectNewStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* ... (CSS Chung, Header, Tabs, Key Wall không đổi) ... */
            #auto-celeb-main-container {
                position: fixed;
                z-index: 9999; display: flex; flex-direction: column; gap: 12px;
                width: 350px; font-family: 'Inter', 'Poppins', 'Segoe UI', sans-serif;
                background: rgba(15,15,20,0.85); backdrop-filter: blur(15px);
                border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 30px rgba(0,0,0,0.3);
                border-radius: 16px; padding: 12px; top: 90px; left: 10px; right: auto;
                bottom: auto;
                max-height: 90vh; overflow: hidden;
                transition: max-height 0.3s ease, padding-top 0.3s ease, padding-bottom 0.3s ease;
            }
            #auto-celeb-popup-header {
                display: flex;
                justify-content: space-between; align-items: center;
                color: white; font-size: 18px; font-weight: 700;
                border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px;
                margin-bottom: 4px; cursor: default;
            }
            #auto-celeb-popup-title {
                cursor: pointer; user-select: none; flex-grow: 1; display: flex;
                align-items: center; gap: 8px;
            }
            #auto-celeb-title-icon { width: 22px; height: 22px; border-radius: 5px; }
            #auto-celeb-collapse-toggle {
                font-size: 20px; font-weight: bold; cursor: pointer; padding: 0 5px;
                transition: transform 0.3s ease;
            }
            #auto-celeb-collapse-toggle:hover { opacity: 0.8; }
            #auto-celeb-main-container.collapsed {
                max-height: 48px; padding-top: 12px; padding-bottom: 12px; gap: 0;
            }
            #auto-celeb-main-container.collapsed #auto-celeb-popup-header {
                margin-bottom: 0; border-bottom: none; padding-bottom: 0;
            }
            #auto-celeb-main-container.collapsed #auto-celeb-collapse-toggle { transform: rotate(-90deg); }
            #auto-celeb-main-container.collapsed > *:not(#auto-celeb-popup-header) { display: none; }
            #auto-celeb-tab-nav {
                display: flex; justify-content: space-around; width: 100%;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                margin-bottom: 12px; margin-top: -8px;
            }
            .nav-tab {
                flex: 1; text-align: center; padding: 8px 0; color: #aaa;
                font-weight: 600; font-size: 15px; text-decoration: none; cursor: pointer;
                transition: color 0.2s ease; border-bottom: 3px solid transparent;
                position: relative; top: 1px;
            }
            .nav-tab:not(.active):hover {
                color: #aaa !important; text-decoration: none !important;
                border-bottom-color: transparent !important;
            }
            .nav-tab.active { color: #fff; border-bottom-color: #8b5cf6; }

            #auto-celeb-main-container.locked #auto-celeb-tab-nav,
            #auto-celeb-main-container.locked #auto-celeb-open-dashboard-btn, /* THAY ĐỔI */
            #auto-celeb-main-container.locked #auto-celeb-redirect-buttons,
            #auto-celeb-main-container.locked #auto-friend-tool-wrapper { display: none; }
            #auto-celeb-main-container:not(.locked) #auto-celeb-key-wall { display: none; }
            #auto-celeb-key-wall {
                display: flex; flex-direction: column; align-items: center; gap: 15px; padding: 10px 0;
            }
            #key-wall-icon { width: 64px; height: 64px; opacity: 0.9; border-radius: 12px; }
            #key-wall-title { font-size: 22px; font-weight: 700; color: white; margin: 0; }
            #key-wall-message { font-size: 14px; color: #e0e0e0; text-align: center; line-height: 1.5; margin: 0; }
            #btn-get-key {
                display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 14px;
                border-radius: 14px; border: none; color: white; font-weight: 600; font-size: 16px;
                cursor: pointer; background: linear-gradient(135deg, #00B2FF, #006AFF);
                box-shadow: 0 6px 20px rgba(0, 150, 255, 0.4); transition: all 0.25s ease;
                justify-content: center; text-decoration: none;
            }
            #btn-get-key:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0, 150, 255, 0.55); }
            #key-input-field {
                width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2);
                border-radius: 10px; padding: 12px 15px; font-size: 16px; color: white;
                font-family: 'Inter', sans-serif; box-sizing: border-box;
            }
            #key-input-field::placeholder { color: #888; }
            #btn-submit-key {
                width: 100%; padding: 12px 14px; border-radius: 14px; border: none;
                color: white; font-weight: 600; font-size: 16px; cursor: pointer;
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4); transition: all 0.25s ease;
            }
            #btn-submit-key:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(139, 92, 246, 0.55); }
            #key-error-message {
                font-size: 14px; color: #ef4444; font-weight: 600; margin: -5px 0 0 0; display: none;
            }
            @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
            .shake { animation: shake 0.3s ease; border-color: #ef4444 !important; }

            /* --- Nút Mở Bảng Điều Khiển (UI Chính) --- */
            #auto-celeb-open-dashboard-btn {
                width: 100%; padding: 12px 14px; border-radius: 14px; border: none;
                color: white; font-weight: 600; font-size: 16px; cursor: pointer;
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
                transition: all 0.25s ease;
            }
            #auto-celeb-open-dashboard-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(139, 92, 246, 0.55);
            }
            #auto-celeb-open-dashboard-btn.close-mode {
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
            }
            #auto-celeb-open-dashboard-btn.close-mode:hover {
                box-shadow: 0 8px 25px rgba(239, 68, 68, 0.55);
            }

            /* ... (CSS cho Tool Bạn bè, Nút Redirect không đổi) ... */
            #auto-celeb-redirect-buttons { display: flex;
                flex-direction: column; gap: 10px; padding: 10px 0; }
            .auto-celeb-redirect-button {
                width: 100%; padding: 12px 14px; border-radius: 14px; border: none;
                color: white; font-weight: 600; font-size: 16px; cursor: pointer;
                background: linear-gradient(135deg, #0ea5e9, #0284c7);
                box-shadow: 0 6px 20px rgba(14, 165, 233, 0.4); transition: all 0.25s ease;
                text-decoration: none; text-align: center; display: block; box-sizing: border-box;
            }
            .auto-celeb-redirect-button:hover,
            .auto-celeb-redirect-button:focus {
                transform: translateY(-2px);
                filter: brightness(1.05);
                text-decoration: none;
                color: white;
            }
            #redirect-celeb {
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
            }
            #redirect-celeb:hover {
                box-shadow: 0 8px 25px rgba(139, 92, 246, 0.55);
            }
            #redirect-friends {
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
            }
            #redirect-friends:hover {
                box-shadow: 0 8px 25px rgba(239, 68, 68, 0.55);
            }
            #auto-friend-tool-wrapper { display: flex; flex-direction: column; gap: 0;
            }
            #friend-tool-title { font-size: 28px; font-weight: 700; color: #ef4444;
                text-align: center; margin: 0; margin-bottom: 5px; }
            #friend-tool-note { font-size: 0.9em;
                color: #ccc; text-align: center; margin: 0; margin-bottom: 15px; font-weight: 500;
            }
            #friend-celeb-select {
                width: 100%;
                background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2);
                border-radius: 10px; padding: 10px 12px; font-size: 15px; color: white;
                font-family: 'Inter', sans-serif; box-sizing: border-box;
                margin-bottom: 12px;
            }
            #friend-celeb-select option { background: #333;
                color: white; padding: 5px; }
            #friend-celeb-select:focus { outline: none;
                border-color: #0ea5e9; }
            #auto-friend-start-button {
                width: 100%; padding: 12px 14px; border-radius: 14px; border: none;
                color: white; font-weight: 600; font-size: 16px; cursor: pointer;
                background: linear-gradient(135deg, #0ea5e9, #0284c7);
                box-shadow: 0 6px 20px rgba(14, 165, 233, 0.4); transition: all 0.25s ease;
            }
            #auto-friend-start-button:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(14, 165, 233, 0.55); }
            #auto-friend-start-button.running {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                box-shadow: 0 6px 20px rgba(239,68,68,0.4);
            }

            /* --- Giao diện Modals (Chung) --- */
            #auto-celeb-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); backdrop-filter: blur(5px); z-index: 10001;
            }
            .auto-celeb-modal {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: #2c2c2e; color: white; border-radius: 14px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 10002;
                width: 300px; padding: 20px; padding-top: 40px; text-align: center;
                border: 1px solid rgba(255,255,255,0.15);
            }
            .auto-celeb-modal h3 { margin-top: 0; margin-bottom: 15px; }
            .auto-celeb-modal p { text-align: center; margin-bottom: 15px; }
            .auto-celeb-modal-close {
                position: absolute; top: 10px; right: 15px; font-size: 28px;
                font-weight: bold; color: #aaa; cursor: pointer; line-height: 1;
            }
            .auto-celeb-modal-close:hover { color: white; }
            .modal-button {
                display: inline-block; background-color: #0a84ff; color: white;
                padding: 10px 20px; border-radius: 8px; text-decoration: none;
                font-weight: 600; margin-top: 10px; border: none;
                font-family: inherit; font-size: 1em; cursor: pointer;
            }
            .modal-button:hover { background-color: #38a0ff; }

            /* ... (CSS cho Modal Update, Donate, Bug không đổi) ... */
            #modal-update p.update-text { font-size: 16px; line-height: 1.5; text-align: center; margin-bottom: 0; }
            #modal-update .modal-update-version-display {
                display: flex; align-items: center; justify-content: center; gap: 10px;
                margin-bottom: 15px; padding: 10px 15px; background: rgba(0,0,0,0.25);
                border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
            }
            #modal-update .modal-update-logo { width: 24px; height: 24px; border-radius: 5px; flex-shrink: 0; }
            #modal-update .modal-update-title-text { font-size: 1.15em; font-weight: 700; color: #ef4444; }
            #modal-update .modal-button-group { display: flex; gap: 10px; margin-top: 20px; }
            #modal-update .modal-button-group .modal-button {
                flex: 1; margin-top: 0; text-decoration: none; padding: 10px;
                font-weight: 600; cursor: pointer; transition: all 0.2s ease;
            }
            #btn-go-to-update { background-color: #0a84ff; }
            #btn-go-to-update:hover { background-color: #38a0ff; }
            #btn-copy-update-link { background-color: #555; }
            #btn-copy-update-link:hover { background-color: #777; }
            #btn-copy-update-link.copied { background-color: #22c55e; cursor: default; }
            #modal-donate h3 { margin-bottom: 5px; }
            #modal-donate p.donate-lead { margin-bottom: 15px; }
            #modal-donate p.donate-thankyou { font-size: 0.9em; color: #ccc; margin-top: 0; margin-bottom: 20px; }
            .donate-input-wrapper { position: relative; margin-bottom: 15px; }
            #donate-amount-input {
                width: 100%; padding: 12px; padding-right: 45px; border-radius: 8px;
                border: 1px solid #777; background: #333; color: #3b82f6;
                font-weight: 600; font-size: 16px; box-sizing: border-box; margin-bottom: 0;
            }
            .donate-suffix {
                position: absolute; right: 15px; top: 50%; transform: translateY(-50%);
                color: #aaa; font-weight: 600; pointer-events: none; display: none;
            }
            .donate-input-wrapper input:not(:placeholder-shown) ~ .donate-suffix { display: block; }
            #donate-amount-input::-webkit-outer-spin-button,
            #donate-amount-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            #donate-amount-input { -moz-appearance: textfield; }
            #btn-generate-qr {
                background: linear-gradient(135deg, #22c55e, #16a34a); width: 100%;
                margin-top: 0; font-size: 16px; font-weight: 600; padding: 12px;
                transition: all 0.2s ease;
            }
            #btn-generate-qr:hover { filter: brightness(1.15); }
            #donate-qr-result {
                margin-top: 15px; min-height: 250px; display: none; align-items: center;
                justify-content: center; background: #fff; border-radius: 10px; padding: 10px;
            }
            #donate-qr-image { max-width: 100%; max-height: 250px; display: none; }
            #donate-loading-text { color: #000; font-size: 16px; font-weight: 600; display: none; }
            #donate-error-message { color: #ef4444; font-size: 14px; margin-top: 10px; font-weight: 600; display: none; }


            /* --- CSS CHO BẢNG ĐIỀU KHIỂN (DASHBOARD MODAL v1.9) --- */

            /* CSS chung cho Toggle Switch (giống của Timer) */
            .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
            .toggle-switch { position: relative; display: inline-block; width: 50px; height: 30px; flex-shrink: 0; }
            .toggle-switch-label { display: block; width: 100%; height: 100%; background-color: #8e8e93; border-radius: 15px; cursor: pointer; transition: background-color 0.2s ease; }
            .toggle-switch-handle { position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; background: #fff; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.2s ease; }
            .toggle-switch-input:checked + .toggle-switch-label { background-color: #34c759; }
            .toggle-switch-input:checked + .toggle-switch-label .toggle-switch-handle { transform: translateX(20px); }


            #celeb-dashboard-modal {
                width: 900px; /* <--- THAY ĐỔI: Tăng chiều rộng */
                max-width: 90vw;
                text-align: left;
                background: #232325;
            }

            #modal-dashboard-layout {
                display: flex;
                gap: 20px;
                margin-top: -15px;
            }

            /* Cột trái: Danh sách Celeb */
            #modal-celeb-list-wrapper {
                flex: 1.5;
                border-right: 1px solid #444;
                padding-right: 20px;
                min-height: 450px;
                max-height: 60vh;
                display: flex;
                flex-direction: column;
            }
            #modal-celeb-list-wrapper h3 {
                color: white;
                font-weight: 700;
                margin-bottom: 15px;
                flex-shrink: 0;
            }
            /* Hàng "Chọn tất cả" (v1.9) */
            #celeb-select-all-label { /* Đây là <div> wrapper */
                display: flex;
                align-items: center;
                justify-content: space-between; /* Đẩy text sang trái, toggle sang phải */
                padding: 10px 12px;
                background: rgba(0,0,0,0.25);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                margin-bottom: 10px;
                cursor: pointer;
                user-select: none;
                transition: background-color 0.2s;
                flex-shrink: 0;
            }
            #celeb-select-all-label:hover { background: rgba(0,0,0,0.4); }
            #celeb-select-all-text {
                font-size: 1.1em;
                vertical-align: middle;
                font-weight: 600;
                /* margin-left: 0; (Xóa margin) */
            }

            #celeb-selection-list {
                flex-grow: 1;
                overflow-y: auto;
                padding-right: 5px;
            }

            /* --- CSS CHO DANH SÁCH CELEB (v1.9) --- */
            .celeb-list-item-new {
                display: flex;
                align-items: center;
                padding: 8px 5px;
                border-radius: 8px;
                margin-bottom: 8px;
                cursor: pointer;
                border: 1px solid transparent;
                transition: background-color 0.2s;
            }
            .celeb-list-item-new:hover {
                background-color: rgba(255, 255, 255, 0.05);
            }
            .celeb-list-item-new.selected {
                background-color: rgba(139, 92, 246, 0.1);
                border-color: rgba(139, 92, 246, 0.3);
            }

            /* SỬA LỖI (v1.9.1): Thêm wrapper cho cặp (Ảnh + Info) */
            .celeb-list-item-main {
                display: flex;
                align-items: center;
                flex-grow: 1; /* Cho phép nó chiếm không gian */
                min-width: 0;
                gap: 14px;
                /* Ngăn nó tràn */
            }

            .celeb-item-toggle-wrapper {
                margin-left: 16px;
                flex-shrink: 0;
            }

            .celeb-list-profile-image {
                position: relative;
                margin-right: 12px;
                flex-shrink: 0;
            }
            .celeb-list-profile-image img {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                border: 3px solid #F0B90A;
            }
            .celeb-list-icon {
                position: absolute;
                bottom: 0;
                right: 0;
                background: #F0B90A;
                color: #333;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: bold;
                border: 2px solid #232325; /* Sẽ bị trong suốt nếu #celeb-dashboard-modal trong suốt */
            }

            .celeb-list-profile-info {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0; /* QUAN TRỌNG: Ngăn flex item tràn */
            }
            .celeb-list-profile-name {
                font-size: 16px;
                font-weight: 600;
                color: #fff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                /* QUAN TRỌNG: Ngăn tên dài */
            }

            .celeb-list-progress {
                width: 100%;
                height: 8px;
                background: #555;
                border-radius: 4px;
                overflow: hidden;
            }
            .celeb-list-progress-bar {
                height: 100%;
                border-radius: 4px;
                transition: width 0.3s ease;
            }

            .celeb-list-progress-text {
                font-size: 12px;
                color: #aaa;
                font-weight: 500;
            }
            /* --- HẾT CSS MỚI --- */


            /* Cột phải: Bảng điều khiển */
            #modal-celeb-controls-wrapper {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 12px;
                min-height: 450px;
            }

            /* Nút Bắt đầu */
            #dashboard-control-button {
                width: 100%; padding: 12px 14px; border-radius: 14px; border: none;
                color: white; font-weight: 600; font-size: 16px; cursor: pointer;
                background: linear-gradient(135deg, #22c55e, #16a34a);
                box-shadow: 0 6px 20px rgba(34,197,94,0.4);
                transition: all 0.25s ease;
            }
            #dashboard-control-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(34,197,94,0.55);
                filter: brightness(1.1);
            }
            #dashboard-control-button.running {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                box-shadow: 0 6px 20px rgba(239,68,68,0.4);
            }

            /* UI Hẹn giờ */
            #dashboard-timer-ui {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 15px; border-radius: 14px; color: white; font-weight: 600;
                background: rgba(30,30,30,0.45);
                border: 1px solid rgba(255,255,255,0.15);
                user-select: none; transition: all 0.3s ease; height: 65px;
            }
            #dashboard-timer-ui #timer-display-group { display: flex; align-items: center; gap: 10px; }
            #dashboard-timer-ui #timer-display {
                font-family: 'JetBrains Mono', 'Inter', 'Segoe UI', sans-serif;
                font-size: 32px; font-weight: 500; letter-spacing: -1px; color: #e0e0e0;
                flex-shrink: 0; min-width: 80px; transition: all 0.2s ease; text-align: left;
            }
            #dashboard-timer-ui #timer-adjust-buttons { display: flex; flex-direction: column; gap: 2px; }
            #dashboard-timer-ui .timer-adjust-btn {
                background-color: rgba(255,255,255,0.1); color: #fff; font-size: 13px; font-weight: 700;
                padding: 2px 8px; border-radius: 8px; cursor: pointer;
                transition: background-color 0.2s ease, transform 0.1s ease;
                min-width: 38px; text-align: center;
            }
            #dashboard-timer-ui .timer-adjust-btn:hover { background-color: rgba(255,255,255,0.2); transform: scale(1.05); }
            #dashboard-timer-ui .timer-adjust-btn:active { transform: scale(0.95); }
            #dashboard-timer-ui #timer-progress-ring { width: 40px; height: 40px; transform: rotate(-90deg); flex-shrink: 0; }
            #dashboard-timer-ui .timer-ring-bg, #dashboard-timer-ui .timer-ring-fg { fill: transparent; stroke-width: 4; }
            #dashboard-timer-ui .timer-ring-bg { stroke: rgba(255, 255, 255, 0.15); }
            #dashboard-timer-ui .timer-ring-fg { stroke: #0ea5e9; stroke-linecap: round; transition: stroke-dashoffset 0.5s linear; }

            #dashboard-timer-ui #timer-toggle-switch {
                position: relative; display: inline-block; width: 50px; height: 30px; flex-shrink: 0;
            }

            #dashboard-timer-ui.timer-counting #timer-display-group { flex-grow: 1; justify-content: center; gap: 15px; }
            #dashboard-timer-ui.timer-counting #timer-display { color: #0ea5e9; font-weight: 700; font-size: 38px; text-align: left; flex-grow: 0; }
            #dashboard-timer-ui.timer-counting #timer-adjust-buttons,
            #dashboard-timer-ui.timer-counting #timer-toggle-switch { display: none; }
            #dashboard-timer-ui:not(.timer-counting) #timer-progress-ring { display: none; }
            #dashboard-timer-ui:not(.timer-counting) #timer-display { font-size: 32px; text-align: left; flex-grow: 0; min-width: 90px; }
            #dashboard-timer-ui:not(.timer-counting) #timer-adjust-buttons { display: flex; }
            #dashboard-timer-ui:not(.timer-counting) #timer-toggle-switch { display: inline-block; }

            /* Log Wrapper */
            #dashboard-log-wrapper { display: flex; flex-direction: column; flex-grow: 1; min-height: 150px; }
            #dashboard-log-wrapper label {
                color: white; font-weight: bold; margin-bottom: 5px; display: block; user-select: none;
            }
            #dashboard-script-log {
                width: 100%; resize: none; margin: 0;
                font-family: Consolas, 'Courier New', monospace;
                font-size: 12px; font-weight: bold;
                background-color: #111; color: #eee;
                border: 1px solid #444; border-radius: 8px;
                box-sizing: border-box; padding: 8px;
                flex-grow: 1;
            }

            /* Nút Footer */
            #dashboard-footer-buttons { display: flex; justify-content: space-between; gap: 8px; flex-shrink: 0; }
            #dashboard-footer-buttons .footer-btn {
                flex-grow: 1; padding: 6px; border: none; border-radius: 5px; color: white;
                cursor: pointer; font-weight: bold; transition: all 0.2s ease; font-size: 13px;
            }
            #dashboard-footer-buttons .footer-btn:hover { opacity: 0.8; transform: translateY(-1px); }
            #dashboard-footer-buttons #btn-update { background-color: #0ea5e9; }
            #dashboard-footer-buttons #btn-bug-report { background-color: #f59e0b; }
            #dashboard-footer-buttons #btn-donate { background-color: #22c55e; }

            /* ... (CSS cho Popup, Modal Chờ 10 giây không đổi) ... */
            #auto-celeb-popup-container {
                position: fixed; top: 80px; right: 25px; z-index: 10000;
                display: flex; flex-direction: column; align-items: flex-end;
                gap: 12px; pointer-events: none;
            }
            .celeb-popup-item {
                background: rgba(30,30,30,0.65); backdrop-filter: blur(15px); color: #e5e7eb;
                padding: 12px 18px; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.15); font-size: 15px;
                animation: slideInFadeIn 0.5s forwards, fadeOut 0.5s 3.5s forwards;
                transform: translateX(100%); opacity: 0;
            }
            .celeb-popup-item .celeb-name { font-weight: 700; color: #ffffff; }
            .celeb-popup-item .celeb-count { font-size: 13px; opacity: 0.75; margin-right: 8px; }
            @keyframes slideInFadeIn { to { opacity: 1; transform: translateX(0); } }
            @keyframes fadeOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(50%); } }
            #auto-celeb-pre-run-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); z-index: 20000;
                display: flex; justify-content: center; align-items: center;
            }
            #auto-celeb-pre-run-modal {
                background: #1e1e1e; border: 1px solid rgba(255,255,255,0.2);
                border-radius: 16px; padding: 24px 40px; text-align: center; color: white;
                font-family: 'Inter', sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            }
            #auto-celeb-pre-run-modal h2 { margin-top: 0; color: #f59e0b; }
            #auto-celeb-pre-run-modal p { font-size: 16px; margin-bottom: 10px; }
            #auto-celeb-pre-run-modal #auto-celeb-pre-run-timer {
                font-size: 64px; font-weight: 700; color: #22c55e;
                font-family: 'JetBrains Mono', monospace;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * TẠO UI CHÍNH (ĐÃ CẬP NHẬT v1.9)
     * - Cập nhật HTML cho toggle switch
     */
    function createMainControlUI() {
        const container = document.createElement('div');
        container.id = 'auto-celeb-main-container';

        // 1. Header (Như cũ)
        container.innerHTML = `
            <div id="auto-celeb-popup-header">
                <span id="auto-celeb-popup-title">
                    <img src="${CONFIG.LOGO_URL}" id="auto-celeb-title-icon">
                    Locket Celebrity ${CONFIG.SCRIPT_VERSION}
                </span>
                <span id="auto-celeb-collapse-toggle">&#9660;</span>
            </div>
        `;

        const isCelebPage = window.location.href === CONFIG.TARGET_PAGE;
        const isFriendPage = window.location.href === CONFIG.FRIENDS_PAGE;

        // 2. Tabs (Như cũ)
        const tabNav = document.createElement('div');
        tabNav.id = 'auto-celeb-tab-nav';
        tabNav.innerHTML = `
            <a id="tab-celeb-tools" class="nav-tab ${isCelebPage ? 'active' : ''}" href="${CONFIG.TARGET_PAGE}">Celebrity Tools</a>
            <a id="tab-friend-tools" class="nav-tab ${isFriendPage ? 'active' : ''}" href="${CONFIG.FRIENDS_PAGE}">Friends</a>
        `;
        container.appendChild(tabNav);

        // 3. Key Wall (Như cũ)
        const keyWall = document.createElement('div');
        keyWall.id = 'auto-celeb-key-wall';
        keyWall.innerHTML = `
            <img id="key-wall-icon" src="${CONFIG.LOGO_URL}" alt="Logo">
            <h3 id="key-wall-title">Kích hoạt Script</h3>
            <p id="key-wall-message">Để sử dụng script, vui lòng nhập key kích hoạt.<br>Truy cập kênh chat messenger để nhận key.</p>
            <a id="btn-get-key" href="${CONFIG.MESSENGER_LINK}" target="_blank">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12C2 17.523 6.477 22 12 22C13.245 22 14.453 21.801 15.58 21.434C16.035 21.289 16.538 21.414 16.829 21.78C17.72 22.88 19.347 24 21.362 23.86C21.6 23.836 21.821 23.67 21.93 23.44C22.04 23.21 22.023 22.943 21.884 22.73C20.69 20.82 19.998 18.52 20.002 16.06C20.002 16.03 20 15.998 20 15.967C21.232 14.636 22 12.902 22 11C22 6.029 17.523 2 12 2ZM12.002 12.668C11.383 12.668 10.835 12.92 10.45 13.332L6.151 9.032C6.46 8.711 6.84 8.441 7.27 8.232C7.699 8.022 8.169 7.882 8.66 7.822C9.151 7.761 9.652 7.782 10.133 7.885C10.614 7.989 11.065 8.175 11.464 8.435L12.002 8.788L15.54 10.888C15.3 11.198 15.01 11.478 14.68 11.718C14.349 11.958 13.98 12.158 13.582 12.308C13.183 12.459 12.76 12.56 12.321 12.608C11.882 12.657 11.433 12.653 11 12.597L10.99 12.592L12.002 12.668ZM15.849 13.332C15.54 13.021 15.16 12.751 14.73 12.542C14.301 12.332 13.831 12.192 13.34 12.132C12.849 12.071 12.348 12.092 11.867 12.195C11.386 12.3 10.935 12.485 10.536 12.745L10 13.098L6.46 15.198C6.7 15.508 6.99 15.789 7.32 16.029C7.651 16.269 8.02 16.469 8.418 16.619C8.817 16.769 9.24 16.87 9.679 16.918C10.118 16.967 10.567 16.963 11 16.907L11.01 16.892L17.849 13.332L15.849 13.332Z" fill="white"/></svg>
                Lấy Key tại Messenger
            </a>
            <input type="text" id="key-input-field" placeholder="Nhập key...">
            <button id="btn-submit-key">Xác thực Key</button>
            <p id="key-error-message">Key không hợp lệ. Vui lòng thử lại.</p>
        `;
        container.appendChild(keyWall);

        // 4. Nội dung tùy trang
        if (isCelebPage) {
            // ----- GIAO DIỆN TRANG CELEBRITY -----
            const openDashboardButton = document.createElement('button');
            openDashboardButton.id = 'auto-celeb-open-dashboard-btn';
            // Kiểm tra trạng thái đang chạy để set class và text ngay từ đầu
            const initialState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
            if (initialState.isRunning) {
                openDashboardButton.textContent = 'Đóng Bảng Điều Khiển';
                openDashboardButton.classList.add('close-mode');
            } else {
                openDashboardButton.textContent = 'Mở Bảng Điều Khiển';
            }
            container.appendChild(openDashboardButton);

            // Thêm nút footer vào panel chính
            const footerButtons = document.createElement('div');
            footerButtons.id = 'auto-celeb-footer-buttons';
            footerButtons.innerHTML = `
                <button id="btn-main-update" class="footer-btn">Update</button>
                <button id="btn-main-bug-report" class="footer-btn">Báo lỗi</button>
                <button id="btn-main-donate" class="footer-btn">Donate</button>
            `;
            container.appendChild(footerButtons);
        } else if (isFriendPage) {
            // ----- GIAO DIỆN TRANG FRIENDS -----
            const friendTool = document.createElement('div');
            friendTool.id = 'auto-friend-tool-wrapper';
            friendTool.innerHTML = `
                <h3 id="friend-tool-title">TÌM KIẾM TỰ ĐỘNG</h3>
                <p id="friend-tool-note">Chỉ add được đối với tài khoản Locket Celeb!</p>
                <select id="friend-celeb-select">
                    <option value="" selected disabled>-- Chọn Celeb để chạy --</option>
                </select>
                <button id="auto-friend-start-button">Bắt đầu Lặp</button>
            `;
            container.appendChild(friendTool);

        } else if (isLoginPage) {
            // ----- GIAO DIỆN TRANG LOGIN (MỚI) -----
            const loginNotice = document.createElement('div');
            loginNotice.id = 'auto-celeb-login-notice';
            loginNotice.innerHTML = `
                <svg id="login-notice-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <h4 id="login-notice-title">Yêu cầu Đăng nhập</h4>
                <p id="login-notice-message">Vui lòng đăng nhập trên trang web để có thể sử dụng các tính năng của script.</p>
            `;
            container.appendChild(loginNotice);
        } else {
            // ----- GIAO DIỆN TRANG KHÁC -----
            const redirectButtons = document.createElement('div');
            redirectButtons.id = 'auto-celeb-redirect-buttons';
            redirectButtons.innerHTML = `
                <a href="${CONFIG.TARGET_PAGE}" id="redirect-celeb" class="auto-celeb-redirect-button">➡️ Về trang Celebrity</a>
                <a href="${CONFIG.FRIENDS_PAGE}" id="redirect-friends" class="auto-celeb-redirect-button">➡️ Về trang Friends</a>
            `;
            container.appendChild(redirectButtons);
        }

        // 5. Thêm container vào trang
        document.body.appendChild(container);

        // 6. Thêm HTML cho Modals
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = `
            <div id="auto-celeb-modal-overlay" style="display: none;"></div>

            <div id="celeb-dashboard-modal" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>

                <div id="modal-dashboard-layout">
                    <div id="modal-celeb-list-wrapper">
                        <h3>Danh sách Locket Celeb</h3>
                        <div id="celeb-select-all-label">
                            <div id="celeb-select-all-info">
                                <span id="celeb-select-all-text">Chọn tất cả</span>
                                <span id="celeb-selected-count">Đã chọn …/… Celeb</span>
                            </div>
                            <div class="toggle-switch select-all-toggle">
                                <input type="checkbox" id="celeb-select-all-input" class="toggle-switch-input sr-only" checked>
                                <label for="celeb-select-all-input" class="toggle-switch-label">
                                    <span class="toggle-switch-handle"></span>
                                </label>
                            </div>
                        </div>

                        <div id="celeb-selection-list">
                            <p style="color: #aaa;">Đang quét danh sách celeb...</p>
                        </div>
                    </div>

                    <div id="modal-celeb-controls-wrapper">

                        <button id="dashboard-control-button">Bắt đầu Auto Celeb</button>

                        <div id="dashboard-timer-ui">
                            <div id="timer-display-group">
                                <svg id="timer-progress-ring" viewBox="0 0 40 40">
                                    <circle class="timer-ring-bg" cx="20" cy="20" r="18"></circle>
                                    <circle class="timer-ring-fg" cx="20" cy="20" r="18"></circle>
                                </svg>
                                <span id="timer-display">00:00</span>
                                <div id="timer-adjust-buttons">
                                    <span id="timer-plus-btn" class="timer-adjust-btn">+5</span>
                                    <span id="timer-minus-btn" class="timer-adjust-btn">-5</span>
                                </div>
                            </div>
                            <div id="timer-toggle-switch" class="toggle-switch">
                                <input type="checkbox" id="timer-toggle-input" class="toggle-switch-input sr-only">
                                <label for="timer-toggle-input" class="toggle-switch-label">
                                    <span class="toggle-switch-handle"></span>
                                </label>
                            </div>
                        </div>

                        <div id="dashboard-log-wrapper">
                            <label for="dashboard-script-log">Nhật ký hệ thống (Script)</label>
                            <textarea id="dashboard-script-log" rows="10" disabled=""></textarea>
                        </div>

                        <div id="dashboard-footer-buttons">
                            <button id="btn-update" class="footer-btn">Update</button>
                            <button id="btn-bug-report" class="footer-btn">Báo lỗi</button>
                            <button id="btn-donate" class="footer-btn">Donate</button>
                        </div>

                    </div>
                </div>
            </div>

            <div id="modal-bug-report" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>
                <h3>Báo lỗi</h3>
                <p>Nếu bạn gặp lỗi, vui lòng báo cho tôi qua Messenger:</p>
                <a href="${CONFIG.MESSENGER_LINK}" target="_blank" class="modal-button">Chat trên Messenger</a>
                    </div>
                </div>
            </div>

            <div id="modal-bug-report" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>
                <h3>Báo lỗi</h3>
                <p>Nếu bạn gặp lỗi, vui lòng báo cho tôi qua Messenger:</p>
                <a href="${CONFIG.MESSENGER_LINK}" target="_blank" class="modal-button">Chat trên Messenger</a>
            </div>

            <div id="modal-update" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>
                <h3>Cập nhật phiên bản</h3>
                <div class="modal-update-version-display">
                    <img src="${CONFIG.LOGO_URL}" class="modal-update-logo" alt="Logo">
                    <span class="modal-update-title-text">Locket Celebrity ${CONFIG.SCRIPT_VERSION}</span>
                </div>
                <p class="update-text">Vui lòng cập nhật phiên bản mới.</p>
                <div class="modal-button-group">
                    <a id="btn-go-to-update" href="${CONFIG.UPDATE_URL}" target="_blank" class="modal-button">Cài đặt</a>
                    <button id="btn-copy-update-link" class="modal-button">Copy Link</button>
                </div>
            </div>

            <div id="modal-donate" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>
                <h3>Donate</h3>
                <p class="donate-thankyou">Cảm ơn sự ủng hộ của bạn!</p>
                <p class="donate-lead">Nhập số tiền bạn muốn donate:</p>
                <div class="donate-input-wrapper">
                    <input type="text" id="donate-amount-input" placeholder="Nhập số tiền (VND)" inputmode="numeric">
                    <span class="donate-suffix">VND</span>
                </div>
                <button id="btn-generate-qr" class="modal-button">Tạo mã QR</button>
                <p id="donate-error-message"></p>
                <div id="donate-qr-result">
                    <span id="donate-loading-text">Đang tạo mã QR...</span>
                    <img id="donate-qr-image" src="" alt="QR Code">
                </div>
            </div>
            `;
        document.body.appendChild(modalContainer);
    }

     /**
      * HÀM MỚI (v1.3-mod4): HIỂN THỊ THÔNG BÁO TOAST
      */
     function showToastNotification(message, type = 'info', duration = 4000) {
         let container = document.getElementById('auto-celeb-popup-container');
         if (!container) {
             container = document.createElement('div');
             container.id = 'auto-celeb-popup-container';
             document.body.appendChild(container);
         }

         const toast = document.createElement('div');
         toast.className = `toast-notification toast-${type}`;

         const icons = {
             success: `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
             // Có thể thêm các icon khác cho 'error', 'info' sau này
         };

         toast.innerHTML = `
             ${icons[type] || ''}
             <span class="toast-message">${message}</span>
         `;
         container.prepend(toast);
         setTimeout(() => toast.remove(), duration);
     }

    /**
     * CẬP NHẬT NÚT BẮT ĐẦU/DỪNG
     */
    function updateControlButtonState(state) {
        const modalButton = document.getElementById('dashboard-control-button');
        if (!modalButton) return;

        if (state.isRunning) {
            modalButton.textContent = 'Dừng Auto Celeb';
            modalButton.classList.add('running');
        } else {
            modalButton.textContent = 'Bắt đầu Auto Celeb';
            modalButton.classList.remove('running');
        }
    }

    /**
     * CẬP NHẬT UI TIMER
     */
    function updateTimerUI(mode, value) {
        const timerUI = document.getElementById('dashboard-timer-ui');
        if (!timerUI) return;

        const display = timerUI.querySelector('#timer-display');
        const toggleInput = timerUI.querySelector('#timer-toggle-input');
        const ringFg = timerUI.querySelector('#timer-progress-ring .timer-ring-fg');

        if (!display || !toggleInput || !ringFg) return;

        timerUI.classList.remove('timer-counting');

        const radius = ringFg.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        ringFg.style.strokeDasharray = `${circumference}`;

        if (mode === 'counting') {
            timerUI.classList.add('timer-counting');
            display.textContent = formatTimeWithHours(value);
            toggleInput.checked = true;

            const percentageElapsed = (currentTimerTotalDuration - value) / currentTimerTotalDuration;
            const offset = circumference * (1 - percentageElapsed);

            ringFg.style.strokeDashoffset = offset;

        } else {
            display.textContent = `${currentTimerConfig.minutes.toString().padStart(2, '0')}:00`;
            toggleInput.checked = currentTimerConfig.enabled;
            ringFg.style.strokeDashoffset = circumference;
        }
    }


    // --- (Hàm loadTimerConfig, saveTimerConfig, generateDonateQR không đổi) ---
    function loadTimerConfig() {
        const configStr = localStorage.getItem(CONFIG.TIMER_CONFIG_KEY);
        if (configStr) {
            const savedConfig = JSON.parse(configStr);
            currentTimerConfig.minutes = savedConfig.minutes || 60;
            currentTimerConfig.enabled = savedConfig.enabled || false;
        } else {
            currentTimerConfig.minutes = 60;
            currentTimerConfig.enabled = false;
        }
        if (currentTimerConfig.minutes < 1) { currentTimerConfig.minutes = 1; }
        else if (currentTimerConfig.minutes > 1 && currentTimerConfig.minutes < 5) { currentTimerConfig.minutes = 5; }

        if (document.getElementById('dashboard-timer-ui')) {
            const activeTimerEndTime = sessionStorage.getItem(CONFIG.TIMER_END_TIME_KEY);
            if (!activeTimerEndTime) { updateTimerUI(); }
        }
    }
    function saveTimerConfig() {
        const configToSave = {
            minutes: currentTimerConfig.minutes,
            enabled: currentTimerConfig.enabled
        };
        localStorage.setItem(CONFIG.TIMER_CONFIG_KEY, JSON.stringify(configToSave));
    }
    function generateDonateQR() {
        const amountInput = document.getElementById('donate-amount-input');
        const rawValue = amountInput.value.replace(/,/g, '');
        const amount = parseInt(rawValue, 10);
        const qrResultDiv = document.getElementById('donate-qr-result');
        const qrImage = document.getElementById('donate-qr-image');
        const loadingText = document.getElementById('donate-loading-text');
        const errorText = document.getElementById('donate-error-message');
        if (isNaN(amount) || amount < 1000) {
            errorText.textContent = 'Đã có lỗi xảy ra. Vui lòng thử lại sau';
            errorText.style.display = 'block';
            return;
        }
        errorText.style.display = 'none';
        qrResultDiv.style.display = 'flex';
        qrImage.style.display = 'none';
        loadingText.style.display = 'block';
        const apiData = {
            bin: "970407", accountNo: "25127777777", accountName: "VU QUANG HUY",
            amount: String(amount), content: "Donate Locket Celebrity"
        };
        GM_xmlhttpRequest({
            method: "POST", url: "https://open.oapi.vn/banking/generate-qr",
            headers: { "Content-Type": "application/json" }, data: JSON.stringify(apiData),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data && data.data && data.code === 'success') {
                        qrImage.src = data.data;
                        qrImage.style.display = 'block';
                        loadingText.style.display = 'none';
                    } else { throw new Error(data.message || 'Phản hồi API không hợp lệ.'); }
                } catch (e) {
                    console.error('Lỗi khi parse response:', e, response.responseText);
                    errorText.textContent = `Lỗi xử lý: ${e.message}`;
                    errorText.style.display = 'block';
                    qrResultDiv.style.display = 'none';
                }
            },
            onerror: function(response) {
                console.error('Lỗi GM_xmlhttpRequest:', response);
                errorText.textContent = 'Lỗi mạng. Không thể kết nối tới API.';
                errorText.style.display = 'block';
                qrResultDiv.style.display = 'none';
            }
        });
    }

    /**
     * CÀI ĐẶT ĐIỀU KHIỂN UI
     */
    function setupMainUIControls() {
        // --- Điều khiển chung (Header, Key Wall) ---
        const mainContainer = document.getElementById('auto-celeb-main-container');
        const collapseToggle = document.getElementById('auto-celeb-collapse-toggle');
        const popupTitle = document.getElementById('auto-celeb-popup-title');
        const toggleCollapse = (e) => { mainContainer.classList.toggle('collapsed'); };
        if (collapseToggle && mainContainer) { collapseToggle.addEventListener('click', toggleCollapse); }
        if (popupTitle && mainContainer) { popupTitle.addEventListener('click', toggleCollapse); }

        const btnSubmitKey = document.getElementById('btn-submit-key');
        const keyInput = document.getElementById('key-input-field');
        const keyError = document.getElementById('key-error-message');
        const validateKey = () => {
            const inputVal = keyInput.value.trim();
            if (inputVal === CONFIG.SECRET_KEY) {
                // SỬA (v1.3-mod5): Tải lại trang sau khi kích hoạt thành công
                localStorage.setItem(CONFIG.KEY_STORAGE_KEY, inputVal);
                showToastNotification('Kích hoạt thành công! Đang tải lại trang...', 'success', 3000);
                 keyError.style.display = 'none';
                 setTimeout(() => {
                     location.reload();
                 }, 2000); // Chờ 2 giây để người dùng đọc thông báo rồi tải lại
            } else {
                keyError.style.display = 'block';
                keyInput.classList.add('shake');
                setTimeout(() => keyInput.classList.remove('shake'), 300);
            }
        };
        if(btnSubmitKey && keyInput && keyError) {
            btnSubmitKey.addEventListener('click', validateKey);
            keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { validateKey(); } });
        }

        // --- Gắn listener cho Bảng điều khiển (Dashboard) ---
        const dashboardModal = document.getElementById('celeb-dashboard-modal');
        if (!dashboardModal) return;

        // --- Điều khiển Timer (Bên trong Modal) ---
        const plusBtn = dashboardModal.querySelector('#timer-plus-btn');
        const minusBtn = dashboardModal.querySelector('#timer-minus-btn');
        const toggleInput = dashboardModal.querySelector('#timer-toggle-input');
        const timerUI = dashboardModal.querySelector('#dashboard-timer-ui');
        if (plusBtn && minusBtn && toggleInput && timerUI) {
            plusBtn.addEventListener('click', (event) => {
                event.stopPropagation(); if (activeTimerId) return;
                if (currentTimerConfig.minutes === 1) { currentTimerConfig.minutes = 5; }
                else { currentTimerConfig.minutes += 5; }
                log(`Tăng thời gian hẹn giờ lên: ${currentTimerConfig.minutes} phút.`, 'timer');
                saveTimerConfig(); updateTimerUI();
            });
            minusBtn.addEventListener('click', (event) => {
                event.stopPropagation(); if (activeTimerId) return;
                if (currentTimerConfig.minutes > 5) { currentTimerConfig.minutes -= 5; }
                else if (currentTimerConfig.minutes === 5) { currentTimerConfig.minutes = 1; }
                else { currentTimerConfig.minutes = 1; }
                log(`Giảm thời gian hẹn giờ xuống: ${currentTimerConfig.minutes} phút.`, 'timer');
                saveTimerConfig(); updateTimerUI();
            });
            toggleInput.addEventListener('change', (event) => {
                if (activeTimerId) { toggleInput.checked = true; return; }
                currentTimerConfig.enabled = toggleInput.checked;
                log(`Hẹn giờ ${currentTimerConfig.enabled ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}.`, 'timer');
                saveTimerConfig(); updateTimerUI();
            });
        }

        // --- Điều khiển Nút Footer (Bên trong Modal) ---
        const btnUpdate = dashboardModal.querySelector('#btn-update');
        const btnBugReport = dashboardModal.querySelector('#btn-bug-report');
        const btnDonate = dashboardModal.querySelector('#btn-donate');
        const btnGenerateQR = document.getElementById('btn-generate-qr');

        const modalOverlay = document.getElementById('auto-celeb-modal-overlay');
        const modalBug = document.getElementById('modal-bug-report');
        const modalUpdate = document.getElementById('modal-update');
        const modalDonate = document.getElementById('modal-donate');

        const allModals = document.querySelectorAll('.auto-celeb-modal');
        const allCloseButtons = document.querySelectorAll('.auto-celeb-modal-close');

        // SỬA ĐỔI: Hàm closeAllModals giờ cũng cập nhật nút Dashboard chính
        const closeAllModals = () => {
            if (modalOverlay) modalOverlay.style.display = 'none';
            allModals.forEach(modal => { if (modal) modal.style.display = 'none'; });
            stopCelebScanRetry();

            // THÊM: Cập nhật nút Dashboard chính khi đóng modal
            const openButton = document.getElementById('auto-celeb-open-dashboard-btn');
            if (openButton) {
                openButton.textContent = 'Mở Bảng Điều Khiển';
                openButton.classList.remove('close-mode');
            }
        };

        // NEW: Hàm chỉ đóng popup modals (không đóng dashboard)
        const closeOnlyPopupModals = () => {
            if (modalOverlay) modalOverlay.style.display = 'none';
            // Chỉ đóng popup, không đóng dashboard
            if (modalBug) modalBug.style.display = 'none';
            if (modalUpdate) modalUpdate.style.display = 'none';
            if (modalDonate) modalDonate.style.display = 'none';
        };

        if (btnUpdate && modalUpdate && modalOverlay) {
            btnUpdate.addEventListener('click', (e) => { e.preventDefault(); modalOverlay.style.display = 'block'; modalUpdate.style.display = 'block'; });
        }
        if (btnBugReport && modalBug && modalOverlay) {
            btnBugReport.addEventListener('click', (e) => { e.preventDefault(); modalOverlay.style.display = 'block'; modalBug.style.display = 'block'; });
        }
        if (btnDonate && modalDonate && modalOverlay) {
            btnDonate.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('donate-amount-input').value = '';
                document.getElementById('donate-qr-result').style.display = 'none';
                document.getElementById('donate-error-message').style.display = 'none';
                document.getElementById('donate-qr-image').src = '';
                const suffix = document.querySelector('.donate-suffix');
                if (suffix) suffix.style.display = 'none';
                modalOverlay.style.display = 'block'; modalDonate.style.display = 'block';
            });
        }
        if (btnGenerateQR) { btnGenerateQR.addEventListener('click', (e) => { e.preventDefault(); generateDonateQR(); }); }

        // --- Điều khiển Nút Footer ở Panel Chính (Mới) ---
        const btnMainUpdate = document.getElementById('btn-main-update');
        const btnMainBugReport = document.getElementById('btn-main-bug-report');
        const btnMainDonate = document.getElementById('btn-main-donate');

        if (btnMainUpdate && modalUpdate && modalOverlay) {
            btnMainUpdate.addEventListener('click', (e) => { e.preventDefault(); modalOverlay.style.display = 'block'; modalUpdate.style.display = 'block'; });
        }
        if (btnMainBugReport && modalBug && modalOverlay) {
            btnMainBugReport.addEventListener('click', (e) => { e.preventDefault(); modalOverlay.style.display = 'block'; modalBug.style.display = 'block'; });
        }
        if (btnMainDonate && modalDonate && modalOverlay) {
            btnMainDonate.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('donate-amount-input').value = '';
                document.getElementById('donate-qr-result').style.display = 'none';
                document.getElementById('donate-error-message').style.display = 'none';
                document.getElementById('donate-qr-image').src = '';
                const suffix = document.querySelector('.donate-suffix');
                if (suffix) suffix.style.display = 'none';
                modalOverlay.style.display = 'block'; modalDonate.style.display = 'block';
            });
        }
        if (btnGenerateQR) { btnGenerateQR.addEventListener('click', (e) => { e.preventDefault(); generateDonateQR(); }); }

        const btnCopyUpdateLink = document.getElementById('btn-copy-update-link');
        if (btnCopyUpdateLink) {
            btnCopyUpdateLink.addEventListener('click', (e) => {
                e.preventDefault(); if (btnCopyUpdateLink.classList.contains('copied')) return;
                navigator.clipboard.writeText(CONFIG.UPDATE_URL).then(() => {
                    const originalText = btnCopyUpdateLink.textContent;
                    btnCopyUpdateLink.textContent = 'Đã copy!';
                    btnCopyUpdateLink.classList.add('copied');
                    setTimeout(() => {
                        btnCopyUpdateLink.textContent = originalText;
                        btnCopyUpdateLink.classList.remove('copied');
                    }, 2000);
                }).catch(err => { console.error('[Auto Locket Celeb] Lỗi khi copy link: ', err); alert('Lỗi khi copy. Vui lòng thử lại.'); });
            });
        }
        const donateInput = document.getElementById('donate-amount-input');
        if (donateInput) {
            donateInput.addEventListener('input', (e) => {
                let value = e.target.value.replace(/[^0-9]/g, '');
                if (value.length > 0) {
                    const numValue = BigInt(value);
                    e.target.value = numValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                } else { e.target.value = ''; }
            });
        }

        // Overlay chỉ đóng các modal popup (không đóng dashboard)
        if (modalOverlay) modalOverlay.addEventListener('click', closeOnlyPopupModals);
        // Nút close cũng chỉ đóng popup (không đóng dashboard)
        allCloseButtons.forEach(btn => btn.addEventListener('click', closeOnlyPopupModals));
    }

    /**
     * HÀM MỚI (v1.8): Đồng bộ nút "Chọn tất cả"
     */
    function syncSelectAllToggle() {
        const selectAllInput = document.getElementById('celeb-select-all-input');
        if (!selectAllInput) return;

        const allCelebToggles = document.querySelectorAll('.celeb-item-toggle-input');
        const total = allCelebToggles.length;
        if (total === 0) {
            selectAllInput.checked = false;
            return;
        }

        const checkedCount = Array.from(allCelebToggles).filter(toggle => toggle.checked).length;
        if (checkedCount === total) {
            selectAllInput.checked = true;
        } else {
            selectAllInput.checked = false;
        }
    }


    // --- (formatTimeWithHours, findButtonByText không đổi) ---
    function formatTimeWithHours(totalSeconds) {
        const absSeconds = Math.abs(totalSeconds);
        const hours = Math.floor(absSeconds / 3600);
        const minutes = Math.floor((absSeconds % 3600) / 60);
        const seconds = Math.floor(absSeconds % 60);
        const sign = totalSeconds < 0 ? '-' : '';
        return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    function findButtonByText(text) {
        const buttons = document.querySelectorAll('button');
        const searchText = text.trim().toLowerCase();
        for (const button of buttons) {
            const buttonText = button.textContent.trim().toLowerCase();
            if (buttonText === searchText) { return button; }
        }
        return null;
    }


    // --- CÁC HÀM LOGIC CHÍNH (CELEB) ---

    function startReloadTimer(minutes) {
        currentTimerTotalDuration = minutes * 60;
        if (activeTimerId) clearInterval(activeTimerId);
        let endTimeStr = sessionStorage.getItem(CONFIG.TIMER_END_TIME_KEY);
        let endTime;
        if (!endTimeStr) {
            const durationInSeconds = currentTimerTotalDuration;
            endTime = Date.now() + durationInSeconds * 1000;
            sessionStorage.setItem(CONFIG.TIMER_END_TIME_KEY, endTime.toString());
            log(`Đã BẮT ĐẦU đồng hồ đếm ngược. Reset sau ${minutes} phút.`, 'timer');
        } else {
            endTime = parseInt(endTimeStr, 10);
            const remainingMinutes = ((endTime - Date.now()) / 60000).toFixed(1);
            log(`Đã TIẾP TỤC đồng hồ đếm ngược (còn ${remainingMinutes} phút).`, 'timer');
        }
        function updateCountdown() {
            const now = Date.now();
            const secondsRemaining = (endTime - now) / 1000;
            if (secondsRemaining <= 0) {
                clearInterval(activeTimerId);
                activeTimerId = null;
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
        if (activeTimerId) {
            clearInterval(activeTimerId);
            activeTimerId = null;
            log('Đã hủy đồng hồ đếm ngược.', 'info');
            updateTimerUI(); // Cập nhật UI trong modal
        }
        sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
    }
    function executeTimerReset() {
        if (webLogObserver) clearInterval(webLogObserver);
        log('Hẹn giờ kết thúc. ĐANG ĐẶT CỜ RESTART VÀ TẢI LẠI TRANG...', 'timer');
        localStorage.setItem(CONFIG.TIMER_RESTART_KEY, 'true');
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
        location.reload();
    }
    function showPreRunCountdown(callback) {
        const overlay = document.createElement('div');
        overlay.id = 'auto-celeb-pre-run-overlay';
        overlay.innerHTML = `
            <div id="auto-celeb-pre-run-modal">
                <h2>Tránh Lag (Máy yếu)</h2>
                <p>Script sẽ tự động bắt đầu sau:</p>
                <div id="auto-celeb-pre-run-timer">3</div>
            </div>
        `;
        document.body.appendChild(overlay);
        let countdown = 3;
        const timerElement = document.getElementById('auto-celeb-pre-run-timer');
        const interval = setInterval(() => {
            countdown--;
            if (timerElement) { timerElement.textContent = countdown; }
            if (countdown <= 0) {
                clearInterval(interval);
                if (overlay) { overlay.remove(); }
                callback();
            }
        }, 1000);
    }

    /**
     * HÀM ĐÓNG POPUP (ĐÃ SỬA: XÓA LOG)
     */
    function closeNotificationPopup() {
        try {
            const oldCloseButton = document.querySelector('#notificationPopup .close, #notificationPopup [data-dismiss="modal"]');
            const oldPopup = document.querySelector('#notificationPopup');
            if (oldCloseButton && oldPopup?.style.display !== 'none') {
                oldCloseButton.click();
            }
        } catch (e) { }
        try {
            const allTitles = document.querySelectorAll('h5, h4, strong, div.modal-title');
            let titleElement = null;
            for (const el of allTitles) {
                if (el.textContent.trim() === 'THÔNG BÁO QUAN TRỌNG') {
                    titleElement = el;
                    break;
                }
            }
            if (!titleElement) return;
            const modal = titleElement.closest('.modal, .modal-dialog, .modal-content');
            if (modal && (modal.style.display !== 'none' && !modal.classList.contains('hidden'))) {
                const buttons = modal.querySelectorAll('button, a');
                for (const btn of buttons) {
                    if (btn.textContent.trim() === 'Đóng') {
                        btn.click();
                        return;
                    }
                }
            }
        } catch (e) { }
    }
    function scrollToCelebSection() {
        const section = document.getElementById('usernameSearch');
        if (section) { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function waitForElementById(elementId, timeout = 180000, interval = 500) {
        return new Promise((resolve, reject) => {
            let elapsedTime = 0;
            const check = () => {
                const element = document.getElementById(elementId);
                if (element) {
                    resolve(element);
                } else {
                    elapsedTime += interval;
                    if (elapsedTime >= timeout) {
                        log(`Hết thời gian chờ element ID: ${elementId}`, 'error');
                        reject(new Error(`Timeout waiting for element ID: ${elementId}`));
                    } else {
                        setTimeout(check, interval);
                    }
                }
            };
            check();
        });
    }
    function findLastCelebId() {
        const profileCards = document.querySelectorAll('div.profile');
        let lastCelebId = null;
        profileCards.forEach(card => {
            const addButton = card.querySelector('button.showMoreBtn');
            const idElement = card.querySelector('[id$="_parentElement"]');
            if (addButton && idElement && addButton.textContent.includes('Thêm bạn bè')) {
                lastCelebId = idElement.id.replace('_parentElement', '');
            }
        });
        return lastCelebId;
    }

    /**
     * HÀM QUAN SÁT LOG
     */
    async function startRealtimeLogObserver(celebId) {
        if (webLogObserver) { clearInterval(webLogObserver); webLogObserver = null; }
        const webLogId = celebId + '_log';
        let webLogTextarea;
        try {
            webLogTextarea = await waitForElementById(webLogId, 10000, 250);
        } catch (e) {
            log(`Không tìm thấy nhật ký web (${webLogId}). Không thể đồng bộ real-time.`, 'warn');
            return;
        }

        const scriptLog = document.getElementById('dashboard-script-log');
        if (!scriptLog) return;

        const needsCelebRestart = localStorage.getItem(CONFIG.CELEB_RESTART_KEY) === 'true';
        if (!needsCelebRestart) { sessionStorage.setItem(CONFIG.CONNECTION_LOST_COUNTER_KEY, '0'); }

        log(`Bắt đầu theo dõi nhật ký của ${celebId}...`, 'info');
        let lastLogContent = "";

        webLogObserver = setInterval(() => {
            const currentScriptLog = document.getElementById('dashboard-script-log');
            const currentWebLog = document.getElementById(webLogId);
            if (!currentScriptLog || !currentWebLog) {
                clearInterval(webLogObserver); webLogObserver = null; return;
            }
            const newLogContent = currentWebLog.value;
            let addedText = "";
            if (newLogContent === lastLogContent) { return; }
            if (newLogContent.length > lastLogContent.length) {
                addedText = newLogContent.substring(lastLogContent.length);
            } else if (newLogContent.length < lastLogContent.length) {
                addedText = newLogContent;
            }

            currentScriptLog.value += addedText;

            let storedLog = sessionStorage.getItem(CONFIG.LOG_STORAGE_KEY) || "";
            storedLog += addedText;
            sessionStorage.setItem(CONFIG.LOG_STORAGE_KEY, storedLog);

            lastLogContent = newLogContent;
            currentScriptLog.scrollTop = currentScriptLog.scrollHeight;

            if (addedText.includes(CONFIG.CONNECTION_LOST_TRIGGER_STRING)) {
                let counter = parseInt(sessionStorage.getItem(CONFIG.CONNECTION_LOST_COUNTER_KEY) || '0', 10);
                counter++;
                sessionStorage.setItem(CONFIG.CONNECTION_LOST_COUNTER_KEY, String(counter));
                log(`Phát hiện mất kết nối lần ${counter}/${CONFIG.CONNECTION_LOST_MAX_RETRIES}.`, 'warn');
                if (counter > CONFIG.CONNECTION_LOST_MAX_RETRIES) {
                    log('Mất kết nối quá 5 lần. ĐANG ĐẶT CỜ RESTART (LỖI) VÀ TẢI LẠI TRANG...', 'error');
                    clearInterval(webLogObserver); webLogObserver = null;
                    localStorage.setItem(CONFIG.TIMER_RESTART_KEY, 'true');
                    localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
                    sessionStorage.removeItem(CONFIG.STORAGE_KEY);
                    sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);
                    sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
                    location.reload();
                }
            }
        }, 500);
    }

    /**
     * HÀM XỬ LÝ CELEB
     */
    async function processNextCeleb(celebIds, totalCount) {
        if (webLogObserver) { clearInterval(webLogObserver); webLogObserver = null; }
        const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
        if (!state.isRunning) {
            log('Quá trình đã được dừng lại.', 'info');
            return;
        }
        if (celebIds.length === 0) {
            sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ ...state, finished: true }));
            updateControlButtonState({ isRunning: true });
            log('Đã xử lý xong tất cả celeb trong danh sách.', 'success');
            return;
        }
        const currentId = celebIds.shift();
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [...celebIds], totalCount: totalCount }));
        let parentElement;
        try {
            const elementId = currentId + '_parentElement';
            parentElement = await waitForElementById(elementId, 180000, 500);
        } catch (error) {
            log(`Không tìm thấy container cho celeb ID: ${currentId} (sau 3 phút chờ). Bỏ qua.`, 'error');
            await processNextCeleb(celebIds, totalCount);
            return;
        }
        if (!parentElement) {
            log(`Không tìm thấy container cho celeb ID: ${currentId}. Bỏ qua.`, 'error');
            await processNextCeleb(celebIds, totalCount);
            return;
        }
        const profileDiv = parentElement.closest('.profile');
        const button = profileDiv ? profileDiv.querySelector('button.showMoreBtn') : null;
        const nameElement = profileDiv ? profileDiv.querySelector('.profile-name') : null;
        const celebName = nameElement ? nameElement.textContent.trim() : `ID: ${currentId}`;
        const processedCount = totalCount - celebIds.length;
        const countText = `(${processedCount}/${totalCount})`;

        if (!button || !button.textContent.includes('Thêm bạn bè')) {
            log(`${countText} Bỏ qua ${celebName} (Đã là bạn bè hoặc không tìm thấy nút).`);
            await processNextCeleb(celebIds, totalCount);
            return;
        }
        log(`${countText} Đang xử lý: ${celebName}`);
        showCelebPopup(celebName, countText);
        button.click();
        await sleep(1000);
        const startButton = document.getElementById(currentId + '_startButton');
        if (startButton) {
            startButton.click();
            await sleep(2000);
            if (celebIds.length === 0) {
                log(`Đã xử lý celeb cuối cùng: ${celebName}.`, 'success');
                log(`Bắt đầu theo dõi nhật ký của celeb cuối cùng (${celebName})...`, 'info');
                startRealtimeLogObserver(currentId);
                sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [], totalCount: totalCount, finished: true }));
                updateControlButtonState({ isRunning: true });
                return;
            } else {
                const celebToolsLink = document.querySelector('a.nav-link[href="celebrity.html"]');
                if (celebToolsLink) {
                    celebToolsLink.click();
                } else {
                    log('LỖI: Không tìm thấy link "Celebrity Tools". Dừng script.', 'error');
                    stopProcess(false);
                }
            }
        } else {
            log(`KHÔNG TÌM THẤY nút "Bắt đầu" cho ${celebName}. Bỏ qua.`, 'error');
            if (webLogObserver) clearInterval(webLogObserver);
            await processNextCeleb(celebIds, totalCount);
        }
    }

    /**
     * HÀM QUÉT CELEB (v1.7)
     */
    function scanForCelebs() {
        const celebs = [];
        document.querySelectorAll('#celebrityList div.profile').forEach(card => {
            const addButton = card.querySelector('button.showMoreBtn');
            const idElement = card.querySelector('[id$="_parentElement"]');

            if (addButton && idElement && addButton.textContent.includes('Thêm bạn bè')) {
                const celebId = idElement.id.replace('_parentElement', '');

                const imgEl = card.querySelector('.profile-circle img');
                const nameEl = card.querySelector('.profile-info .profile-name');
                const progressEl = card.querySelector('.profile-info .x-progress');
                const progressTextEl = card.querySelector('.profile-info .x-progress__text');

                const data = {
                    id: celebId,
                    name: nameEl ? nameEl.textContent.trim() : 'Không rõ tên',
                    imgSrc: imgEl ? imgEl.src : '',
                    progressText: progressTextEl ? progressTextEl.textContent.trim() : '0 / 0',
                    current: progressEl ? parseInt(progressEl.dataset.current, 10) : 0,
                    max: progressEl ? parseInt(progressEl.dataset.max, 10) : 1,
                };

                data.percent = (data.current / data.max) * 100;
                if (data.percent > 100) data.percent = 100;
                if (isNaN(data.percent) || data.max === 0) data.percent = 0;

                data.progressColor = (data.current >= data.max) ? 'red' : '#46ce46';

                celebs.push(data);
            }
        });
        return celebs;
    }


    /**
     * HÀM MỞ BẢNG ĐIỀU KHIỂN (ĐÃ SỬA: XÓA POPUP CLONE, XÓA OVERLAY)
     */
    function openDashboardModal() {
        const modal = document.getElementById('celeb-dashboard-modal');
        // const overlay = document.getElementById('auto-celeb-modal-overlay'); // <-- SỬA: KHÔNG CẦN OVERLAY
        const listWrapper = document.getElementById('modal-celeb-list-wrapper');

        // SỬA: Bỏ check overlay
        if (!modal || !listWrapper) {
            alert('Lỗi: Không thể tải Bảng điều khiển. Vui lòng tải lại trang.');
            return;
        }

        // Tải trạng thái
        const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');

        if (state.isRunning) {
            // ===================================================
            // SCRIPT ĐANG CHẠY: HIỂN THỊ GIAO DIỆN "RUNNING"
            // ===================================================
            showRunningView();
            const remainingIds = state.celebIds ? state.celebIds.length : 0;
            runSentCount = state.finished ? state.totalCount : (state.totalCount - remainingIds);
            runErrorCount = parseInt(localStorage.getItem('autoCelebErrorCount') || '0', 10);
            runStartTime = parseInt(sessionStorage.getItem('autoCelebRunStartTime') || Date.now().toString(), 10);

            updateProcessedCelebsDisplay(); // NEW: Cập nhật hiển thị celeb đã chạy khi resume
            updateStatsDisplay();
            updateChartDisplay(); // Cập nhật biểu đồ khi mở modal

            if (runTimerInterval) clearInterval(runTimerInterval);
            runTimerInterval = setInterval(updateRunTimer, 1000);

            // <-- KHỐI if (state.finished) ĐÃ BỊ XÓA VÌ KHÔNG CẦN CLONE POPUP -->

        } else {
            // ===================================================
            // SCRIPT ĐANG DỪNG: HIỂN THỊ GIAO DIỆN CHỌN CELEB
            // ===================================================

            listWrapper.innerHTML = `
                <div class="celeb-list-header">
                    <h3>Danh Sách Locket Celeb</h3>
                    <button id="celeb-refresh-button" class="celeb-refresh-button">
                        <span class="refresh-icon">⟳</span> Làm mới
                    </button>
                </div>
                <div id="celeb-select-all-label">
                    <div id="celeb-select-all-info">
                        <span id="celeb-select-all-text">Chọn tất cả</span>
                        <span id="celeb-selected-count">Đã chọn …/… Celeb</span>
                    </div>
                    <div class="toggle-switch select-all-toggle">
                        <input type="checkbox" id="celeb-select-all-input" class="toggle-switch-input sr-only" checked>
                        <label for="celeb-select-all-input" class="toggle-switch-label">
                            <span class="toggle-switch-handle"></span>
                        </label>
                    </div>
                </div>
                <div id="celeb-selection-list">
                    <p style="color: #aaa;">Đang quét danh sách celeb...</p>
                </div>
            `;
            const listContainer = document.getElementById('celeb-selection-list');
            const selectAllInput = document.getElementById('celeb-select-all-input');
            const selectAllContainer = document.getElementById('celeb-select-all-label');
            const selectedCountElement = document.getElementById('celeb-selected-count');

            if (!listContainer || !selectAllInput) {
                listWrapper.innerHTML = '<p style="color: #f87171;">Lỗi: Không thể tải danh sách celeb.</p>';
                return;
            }

            // Hàm cập nhật số lượng celeb đã chọn
            const updateSelectedCount = () => {
                if (!selectedCountElement) return;
                const allCelebToggles = document.querySelectorAll('.celeb-item-toggle-input');
                const total = allCelebToggles.length;
                const selected = Array.from(allCelebToggles).filter(toggle => toggle.checked).length;
                if (total === 0) {
                    selectedCountElement.textContent = 'Đã chọn …/… Celeb';
                } else {
                    selectedCountElement.textContent = `Đã chọn ${selected}/${total} Celeb`;
                }
            };

            if (selectAllContainer && selectAllInput) {
                selectAllContainer.onclick = (e) => {
                    if (
                        e.target.classList.contains('toggle-switch') ||
                        e.target.closest('.toggle-switch')
                    ) {
                        return;
                    }
                    selectAllInput.checked = !selectAllInput.checked;
                    selectAllInput.dispatchEvent(new Event('change'));
                };
                selectAllInput.onchange = () => {
                    const isChecked = selectAllInput.checked;
                    const allCelebToggles = document.querySelectorAll('.celeb-item-toggle-input');
                    allCelebToggles.forEach(toggle => {
                        if (toggle.checked !== isChecked) {
                            toggle.checked = isChecked;
                            const item = toggle.closest('.celeb-list-item-new');
                            if (item) item.classList.toggle('selected', isChecked);
                        }
                    });
                    updateSelectedCount();
                };
            }

            const renderCelebSelection = (isUserRefresh = false) => {
                const celebs = scanForCelebs();
                if (!Array.isArray(celebs) || celebs.length === 0) {
                    listContainer.innerHTML = isUserRefresh
                        ? '<p style="color: #fbbf24;">Đang quét lại danh sách celeb...</p>'
                        : '<p style="color: #aaa;">Đang đợi danh sách celeb tải...</p>';
                    return false;
                }

                listContainer.innerHTML = '';
                selectAllInput.checked = true;

                celebs.forEach(celeb => {
                    const item = document.createElement('div');
                    item.className = 'celeb-list-item-new selected';
                    item.dataset.celebId = celeb.id;
                    const inputId = `celeb-toggle-${celeb.id}`;

                    item.innerHTML = `
                        <div class="celeb-list-item-main">
                            <div class="celeb-list-profile-image">
                                <img src="${celeb.imgSrc}" alt="${celeb.name}">
                                <div class="celeb-list-icon">✦</div>
                            </div>
                            <div class="celeb-list-profile-info">
                                <div class="celeb-list-profile-name">${celeb.name}</div>
                                <div class="celeb-list-progress">
                                    <div class="celeb-list-progress-bar" style="width: ${celeb.percent}%; background-color: ${celeb.progressColor};"></div>
                                </div>
                                <div class="celeb-list-progress-text">${celeb.progressText}</div>
                            </div>
                        </div>
                        <div class="celeb-item-toggle-wrapper toggle-switch">
                            <input type="checkbox" value="${celeb.id}" id="${inputId}" class="celeb-item-toggle-input toggle-switch-input sr-only" checked>
                            <label for="${inputId}" class="toggle-switch-label">
                                <span class="toggle-switch-handle"></span>
                            </label>
                        </div>
                    `;
                    const toggleInput = item.querySelector('.celeb-item-toggle-input');
                    const toggleSwitch = item.querySelector('.toggle-switch');

                    item.addEventListener('click', (e) => {
                        if (e.target.classList.contains('toggle-switch') || e.target.closest('.toggle-switch')) {
                            return;
                        }
                        toggleInput.checked = !toggleInput.checked;
                        toggleInput.dispatchEvent(new Event('change'));
                    });
                    toggleSwitch.addEventListener('click', (e) => { e.stopPropagation(); });
                    toggleInput.addEventListener('change', () => {
                        item.classList.toggle('selected', toggleInput.checked);
                        syncSelectAllToggle();
                        updateSelectedCount();
                    });
                    listContainer.appendChild(item);
                });

                updateSelectedCount();
                return true;
            };

            const startCelebRetryLoop = (isUserRefresh = false) => {
                stopCelebScanRetry();
                celebScanRetryInterval = setInterval(() => {
                    if (renderCelebSelection(isUserRefresh)) {
                        stopCelebScanRetry();
                    }
                }, 1000);
            };

            const refreshCelebList = () => {
                listContainer.innerHTML = '<p style="color: #fbbf24;">Đang làm mới danh sách celeb...</p>';
                if (selectedCountElement) {
                    selectedCountElement.textContent = 'Đã chọn …/… Celeb';
                }
                startCelebRetryLoop(true);
            };

            const refreshButton = document.getElementById('celeb-refresh-button');
            if (refreshButton) {
                refreshButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    refreshButton.disabled = true;
                    refreshButton.classList.add('refreshing');
                    refreshButton.innerHTML = '<span class="refresh-icon spinning">⟳</span> Đang làm mới...';
                    refreshCelebList();
                    setTimeout(() => {
                        refreshButton.disabled = false;
                        refreshButton.classList.remove('refreshing');
                        refreshButton.innerHTML = '<span class="refresh-icon">⟳</span> Làm mới';
                    }, 1500);
                });
            }

            const hasCelebsImmediately = renderCelebSelection();
            if (!hasCelebsImmediately) {
                startCelebRetryLoop();
            }
        }

        // ===================================================
        // PHẦN CHUNG (Luôn chạy)
        // ===================================================
        const logTextarea = document.getElementById('dashboard-script-log');
        // 3. Cập nhật trạng thái timer
        loadTimerConfig();
        // 4. Tải log (ĐÃ SỬA: XÓA LOG)
        if (logTextarea) {
            if (!state.isRunning) {
                logTextarea.value = ''; // Xóa log cũ khi mở lại
                log('Sẵn sàng chạy. Vui lòng chọn celeb và nhấn "Bắt đầu Auto Celeb".', 'info');
            } else {
                loadPersistentLog();
            }
        }

        // 5. Cập nhật nút
        updateControlButtonState(state);
        // 5. Cập nhật nút
        updateControlButtonState(state);

        // 6. Hiển thị modal
        // overlay.style.display = 'block'; // <-- SỬA: XÓA DÒNG NÀY
        modal.style.display = 'block';
    }


    /**
     * HÀM BẮT ĐẦU TỪ MODAL (ĐÃ SỬA: LỖI LOGIC UI)
     */
    function startProcessFromModal() {
        // 1. QUAN TRỌNG: Lấy danh sách celeb đã chọn TRƯỚC KHI thay đổi giao diện (showRunningView)
        // Nếu để sau, các checkbox sẽ bị xóa khỏi DOM và không lấy được value.
        const selectedToggles = document.querySelectorAll('.celeb-item-toggle-input:checked');
        const celebIds = Array.from(selectedToggles).map(cb => cb.value);

        // Kiểm tra nếu chưa chọn ai thì báo lỗi và dừng ngay
        if (celebIds.length === 0) {
            log('Không tìm thấy celeb nào được chọn. Vui lòng chọn ít nhất một celeb.', 'error');
            // Dừng lại và reset UI nút bấm
            const modalButton = document.getElementById('dashboard-control-button');
            if (modalButton) {
                modalButton.textContent = 'Bắt đầu Auto Celeb';
                modalButton.classList.remove('running');
            }
            // Không gọi showRunningView, giữ nguyên danh sách để người dùng chọn lại
            return;
        }

        // --- THIẾT LẬP STATS VÀ THAY ĐỔI UI ---
        sessionStorage.removeItem(CONFIG.LOG_STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);
        processedCelebs = [];
        runErrorCount = 0;
        runSentCount = 0;
        runResetCount = 0;
        runStartTime = Date.now();
        sessionStorage.setItem('autoCelebRunStartTime', runStartTime.toString());
        localStorage.setItem('autoCelebErrorCount', '0');
        timePaused = 0;
        pauseStartTime = null;
        isTabActive = true;

        if (runTimerInterval) clearInterval(runTimerInterval);
        runTimerInterval = setInterval(updateRunTimer, 1000);

        runActivityData = [0, 0, 0, 0, 0, 0, 0];
        if (runActivityTimer) clearInterval(runActivityTimer);
        runActivityTimer = setInterval(rollActivityData, CHART_UPDATE_INTERVAL_MS);

        // 2. Bây giờ mới được chuyển đổi giao diện sang "Running View"
        showRunningView();
        updateStatsDisplay();

        const logWrapper = document.getElementById('dashboard-log-wrapper');
        if (logWrapper) logWrapper.style.display = 'flex';

        log('Đang bắt đầu quá trình...', 'rocket');
        const totalCount = celebIds.length;
        log(`Đã chọn ${totalCount} celeb để chạy...`, 'info');

        sessionStorage.setItem('autoCelebOriginalList', JSON.stringify([...celebIds]));
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [...celebIds], totalCount: totalCount }));

        updateControlButtonState({ isRunning: true });

        if (currentTimerConfig.enabled && currentTimerConfig.minutes > 0) {
            startReloadTimer(currentTimerConfig.minutes);
        }

        // 3. Bắt đầu xử lý danh sách đã lấy được ở bước 1
        processNextCeleb(celebIds, totalCount);
    }

    /**
     * HÀM DỪNG (ĐÃ SỬA: DỌN DẸP TIMER BIỂU ĐỒ)
     */
    function stopProcess(shouldReload = false) {
        if (webLogObserver) clearInterval(webLogObserver);
        cancelReloadTimer();
        localStorage.removeItem(CONFIG.TIMER_RESTART_KEY);
        localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);
        sessionStorage.removeItem(CONFIG.PROCESSED_CELEBS_KEY);
        sessionStorage.removeItem('autoCelebRunStartTime');
        sessionStorage.removeItem('autoCelebOriginalList');
        localStorage.removeItem('autoCelebErrorCount');

        // Reset các biến thống kê
        processedCelebs = [];
        runStartTime = null;
        timePaused = 0;
        pauseStartTime = null;
        runErrorCount = 0;
        runSentCount = 0;
        runResetCount = 0;

        // Dọn dẹp các timer
        if (runTimerInterval) clearInterval(runTimerInterval);
        runTimerInterval = null;
        if (runActivityTimer) clearInterval(runActivityTimer);
        runActivityTimer = null;

        log('Đã dừng quá trình tự động theo yêu cầu người dùng.', 'info');

        // Cập nhật UI
        const dashboardModal = document.getElementById('celeb-dashboard-modal');
        const openButton = document.getElementById('auto-celeb-open-dashboard-btn');

        // Cập nhật nút chính bên ngoài
        if (openButton) {
            openButton.textContent = 'Mở Bảng Điều Khiển';
            openButton.classList.remove('close-mode');
        }

        // Nếu bảng điều khiển đang mở, vẽ lại nó ở trạng thái "sẵn sàng"
        if (dashboardModal && dashboardModal.style.display !== 'none') {
            log('Đã dừng. Bảng điều khiển đã được làm mới.', 'info');
            openDashboardModal(); // Vẽ lại toàn bộ modal ở trạng thái ban đầu
        }

        // Đảm bảo nút trong modal cũng được cập nhật
        updateControlButtonState({ isRunning: false });
    }

    // --- (Các hàm logic cho trang Friends không đổi) ---
    const FRIEND_SELECTORS = {
        searchInput: '#usernameSearchInput',
        searchButton: '#usernameSearchSubmit',
        profileResultContainer: '#usernameSearchStatus .profile',
        actionButton: '#usernameSearchStatus .profile button',
    };
    function waitForElement(selector, timeout = 3000) {
        return new Promise((resolve, reject) => {
            let interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) {
                    clearInterval(timeoutId); clearInterval(interval);
                    resolve(element);
                }
            }, 100);
            let timeoutId = setTimeout(() => {
                clearInterval(interval);
                reject(new Error(`[Hàm chờ mới] Không tìm thấy element "${selector}" sau ${timeout}ms`));
            }, timeout);
        });
    }
    function setupFriendToolLogic() {
        const startButton = document.getElementById('auto-friend-start-button');
        const celebSelect = document.getElementById('friend-celeb-select');
        if (!startButton || !celebSelect) {
            console.error('[Auto Locket Celeb] Không tìm thấy UI tool bạn bè (nút hoặc select).');
            return;
        }
        const stopFriendSearchLoop = () => {
            if (friendSearchLoopId) { clearInterval(friendSearchLoopId); friendSearchLoopId = null; }
            isFriendSearchRunning = false;
            startButton.textContent = 'Bắt đầu Lặp';
            startButton.classList.remove('running');
            celebSelect.disabled = false;
            console.log('[Auto Locket Celeb] ➡️ Đã dừng lặp tìm kiếm.', 'info');
        };
        const performSearch = async (uid) => {
            try {
                const pageInput = await waitForElement(FRIEND_SELECTORS.searchInput, 5000);
                const pageButton = await waitForElement(FRIEND_SELECTORS.searchButton, 5000);
                const oldResult = document.querySelector(FRIEND_SELECTORS.profileResultContainer);
                if (oldResult) oldResult.remove();
                pageInput.value = uid;
                pageInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                pageButton.click();
                await waitForElement(FRIEND_SELECTORS.profileResultContainer, 5000);
                const actionButton = document.querySelector(FRIEND_SELECTORS.actionButton);
                if (actionButton) {
                    const buttonText = actionButton.textContent.trim();
                    if (buttonText.includes('Bạn bè') || buttonText.includes('Đã yêu cầu')) {
                        stopFriendSearchLoop(); return;
                    } else if (buttonText.includes('Thêm bạn bè')) {
                        actionButton.click();
                        await sleep(1500);
                    }
                }
            } catch (e) { /* Bỏ qua lỗi, tiếp tục lặp */ }
        };
        const startFriendSearchLoop = (uid) => {
            if (isFriendSearchRunning) return;
            isFriendSearchRunning = true;
            startButton.textContent = 'Dừng Lặp';
            startButton.classList.add('running');
            celebSelect.disabled = true;
            performSearch(uid);
            friendSearchLoopId = setInterval(() => performSearch(uid), 3000);
        };
        startButton.addEventListener('click', () => {
            if (isFriendSearchRunning) { stopFriendSearchLoop(); }
            else {
                const selectedUid = celebSelect.value;
                if (!selectedUid || selectedUid === "") { return; }
                startFriendSearchLoop(selectedUid);
            }
        });
    }
    function populateCelebDropdown() {
        const celebSelect = document.getElementById('friend-celeb-select');
        if (!celebSelect) return;
        CELEB_LIST.forEach(celeb => {
            const option = document.createElement('option');
            option.value = celeb.uid;
            option.textContent = celeb.name;
            celebSelect.appendChild(option);
        });
    }


    // --- HÀM CHẠY CHÍNH ---
    // --- HÀM CHẠY CHÍNH (ĐÃ SỬA: THÊM LISTENER CHUYỂN TAB) ---

    (function main() {
        console.log(`[Auto Locket Celeb] ➡️ Userscript đã được kích hoạt (${CONFIG.SCRIPT_VERSION}).`);

        // GẮN LISTENER MỚI
        document.addEventListener("visibilitychange", handleVisibilityChange);

        setInterval(closeNotificationPopup, 1000);

        // 1. Luôn tạo UI
        try {
            injectNewStyles();
            createMainControlUI();
            loadTimerConfig();
            setupMainUIControls();
        } catch (e) {
            console.error('[Auto Locket Celeb] Lỗi khi khởi tạo UI chính: ', e);
            return;
        }

        // 2. Kiểm tra Key (Như cũ)
        const storedKey = localStorage.getItem(CONFIG.KEY_STORAGE_KEY);
        const isKeyValidated = (storedKey === CONFIG.SECRET_KEY);
        const container = document.getElementById('auto-celeb-main-container');
        if (isKeyValidated) {
            container.classList.remove('locked');
        } else {
            container.classList.add('locked');
            localStorage.removeItem(CONFIG.KEY_STORAGE_KEY);
        }

        if (!isKeyValidated) {
             console.log('[Auto Locket Celeb] ➡️ Script bị khóa. Vui lòng nhập key.');
            return;
        }

        // 3. Chạy logic tùy trang
        if (window.location.href === CONFIG.TARGET_PAGE) {
            runCelebLogic();
        } else if (window.location.href === CONFIG.FRIENDS_PAGE) {
            console.log('[Auto Locket Celeb] ➡️ Đang ở trang Friends.');
            const checkPageReady = setInterval(async () => {
                try {
                    await waitForElement(FRIEND_SELECTORS.searchInput, 500);
                    await waitForElement(FRIEND_SELECTORS.searchButton, 500);
                    clearInterval(checkPageReady);
                    populateCelebDropdown();
                    setupFriendToolLogic();
                } catch (e) { /* Vẫn chờ... */ }
            }, 500);
        } else {
            console.log('[Auto Locket Celeb] ➡️ Đang ở trang phụ.');
        }


        /**
         * LOGIC CHÍNH TRANG CELEB
         */
        async function runCelebLogic() {
            try {
                await waitForElementById('usernameSearch', 20000);
                scrollToCelebSection();

                const openDashboardButton = document.getElementById('auto-celeb-open-dashboard-btn');
                if (!openDashboardButton) {
                    console.error('[Auto Locket Celeb] ➡️ Không tìm thấy nút Mở Bảng Điều Khiển.');
                    return;
                }

                // Gắn listener cho nút chính để mở/đóng bảng điều khiển
                openDashboardButton.addEventListener('click', () => {
                    const modalEl = document.getElementById('celeb-dashboard-modal');
                    if (!modalEl) return;

                    const isOpening = modalEl.style.display !== 'block';

                    if (isOpening) {
                        openDashboardModal(); // Hàm này sẽ vẽ lại nội dung và hiển thị modal
                        openDashboardButton.textContent = 'Đóng Bảng Điều Khiển';
                        openDashboardButton.classList.add('close-mode');
                    } else {
                        modalEl.style.display = 'none';
                        openDashboardButton.textContent = 'Mở Bảng Điều Khiển';
                        openDashboardButton.classList.remove('close-mode');
                    }
                });

                // Gắn listener cho nút Bắt đầu/Dừng bên trong modal
                const modalStartButton = document.getElementById('dashboard-control-button');
                if (modalStartButton) {
                    modalStartButton.addEventListener('click', () => {
                        const currentState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                        if (currentState.isRunning) { stopProcess(); } else { startProcessFromModal(); }
                    });
                }

                // --- Xử lý tự động chạy lại (Resume) ---
                let currentState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                const needsTimerRestart = localStorage.getItem(CONFIG.TIMER_RESTART_KEY) === 'true';
                const needsCelebRestart = localStorage.getItem(CONFIG.CELEB_RESTART_KEY) === 'true';

                updateControlButtonState(currentState);

                if (needsTimerRestart) {
                    log('PHÁT HIỆN CỜ RESTART (TIMER). Tự động bắt đầu sau 10 giây...', 'timer');
                    localStorage.removeItem(CONFIG.TIMER_RESTART_KEY);
                    localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
                    showPreRunCountdown(() => {
                         // SỬA: Mở và cập nhật nút
                         openDashboardModal();
                         openDashboardButton.textContent = 'Đóng Bảng Điều Khiển';
                         openDashboardButton.classList.add('close-mode');
                         startProcessFromModal();
                    });
                } else if (needsCelebRestart) {
                    log('PHÁT HIỆN CỜ RESET CELEB. Đang chạy lại celeb cuối...', 'warn');
                    localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
                    const lastCelebId = findLastCelebId();
                    if (lastCelebId && currentState.isRunning) {
                        log(`Tìm thấy celeb cuối: ${lastCelebId}. Chuẩn bị chạy lại...`, 'info');
                        currentState.finished = false;
                        currentState.celebIds = [lastCelebId];
                        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(currentState));
                    } else {
                        log('Không tìm thấy celeb cuối để reset, hoặc script đã dừng.', 'error');
                    }
                }

                // Logic tiếp tục chạy (resume) khi tải lại trang
                if (currentState.isRunning) {
                    log('Tiếp tục xử lý tiến trình đang chạy...', 'info');
                    openDashboardModal(); // Mở modal (sẽ hiển thị giao diện "running")

                    // SỬA: Cập nhật nút
                    openDashboardButton.textContent = 'Đóng Bảng Điều Khiển';
                    openDashboardButton.classList.add('close-mode');

                    if (currentTimerConfig.enabled && currentTimerConfig.minutes > 0) {
                        startReloadTimer(currentTimerConfig.minutes);
                    }

                    if (!currentState.finished && currentState.celebIds && currentState.celebIds.length > 0) {
                        // NEW: Tải lại danh sách celeb đã chạy khi tiếp tục
                        const storedProcessedCelebs = sessionStorage.getItem(CONFIG.PROCESSED_CELEBS_KEY);
                        processedCelebs = storedProcessedCelebs ? JSON.parse(storedProcessedCelebs) : [];

                        processNextCeleb(currentState.celebIds, currentState.totalCount);
                    } else if (currentState.finished) {
                        const lastCelebId = findLastCelebId();
                        if (lastCelebId) {
                            if (!webLogObserver) {
                                log('Đang theo dõi nhật ký của celeb cuối cùng...', 'info');
                                startRealtimeLogObserver(lastCelebId);
                            }
                        }
                    }
                }

                // THÊM: Xử lý mở lại dashboard sau khi reset
                const openAfterReset = sessionStorage.getItem('autoCelebOpenDashboardAfterReset') === 'true';
                if (openAfterReset) {
                    log('Mở lại bảng điều khiển sau khi reset.', 'info');
                    openDashboardModal();
                    sessionStorage.removeItem('autoCelebOpenDashboardAfterReset');
                }

            } catch (error) {
                log('Kiểm tra 20s: HẾT GIỜ. Container (usernameSearch) không tải. Đang reload trang...', 'error');
                const celebToolsLink = document.querySelector('a.nav-link[href="celebrity.html"]');
                if (celebToolsLink) {
                    log('Đang click "Celebrity Tools" để tải lại.');
                    celebToolsLink.click();
                } else {
                    log('LỖI: Không tìm thấy "Celebrity Tools". Dùng location.reload().', 'error');
                    location.reload();
                }
            }
        }

    })();
})();