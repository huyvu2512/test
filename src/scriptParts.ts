

export const HEADER_PART = `// ==UserScript==
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
// ==/UserScript==`;

export const WRAPPER_START = `(function() {
    'use strict';`;

export const CONFIG_PART = `
    // --- CẤU HÌNH SCRIPT ---
    const CONFIG = {
        STORAGE_KEY: 'autoCelebState_v2',
        LOG_STORAGE_KEY: 'autoCelebScriptLog_v2',
        CHART_DATA_KEY: 'autoCelebChartData_v3',
        TIMER_CONFIG_KEY: 'autoCelebTimerConfig_v2.9',
        TIMER_RESTART_KEY: 'autoCelebTimerRestart',
        TIMER_END_TIME_KEY: 'autoCelebTimerEndTime',
        TARGET_PAGE: 'https://locket.binhake.dev/celebrity.html',
        FRIENDS_PAGE: 'https://locket.binhake.dev/friends.html',
        LOGIN_PAGE: 'https://locket.binhake.dev/login.html',
        LOGO_URL: 'https://i.imgur.com/AM2f24N.png',

        CELEB_RESTART_KEY: 'autoCelebCelebRestart',
        AUTO_RELOAD_KEY: 'autoCelebAutoReload', // Flag đánh dấu công cụ tự reload
        CONNECTION_LOST_COUNTER_KEY: 'autoCelebConnectionLostCounter',
        CONNECTION_LOST_TRIGGER_STRING: "The connection was suddenly lost. Reconnecting after 5 second...",
        PROCESSED_CELEBS_KEY: 'autoCelebProcessedCelebs_v1',
        CONNECTION_LOST_MAX_RETRIES: 5,

        SECRET_KEY: '2025',
        KEY_STORAGE_KEY: 'autoCelebKeyValidated_v1',
        MESSENGER_LINK: 'https://www.messenger.com/c/655145337208323/',

        SCRIPT_VERSION: 'v1.3',
        UPDATE_URL: 'https://raw.githubusercontent.com/huyvu2512/locket-celebrity/main/script/tampermonkey.user.js'
    };

    const CELEB_LIST = [
        { name: 'Locket HQ 💛', uid: 'locket.hq' },
        { name: 'SZA & MoRuf Backstage Test', uid: 'szamoruf_1' }
    ];`;

export const STATE_PART = `
    // --- BIẾN TOÀN CỤC ---
    let activeTimerId = null;
    let currentTimerConfig = { enabled: false, minutes: 60 };
    let currentTimerTotalDuration = 0;
    let webLogObserver = null;
    let isFriendSearchRunning = false;
    let friendSearchLoopId = null;

    // --- BIẾN THỐNG KÊ ---
    let runStartTime = null;
    let runTimerInterval = null;
    let runConnectionLostCount = 0; // Số lần mất kết nối (Lỗi)
    let runSentCount = 0;
    let runAutoResetCount = 0; // Số lần công cụ tự động reset (Reset)
    
    // --- CHART STATE ---
    let chartDataPoints = new Array(40).fill(2.5); // 40 điểm cho đường mượt hơn, mặc định mức 2.5
    let chartLastLogTime = 0;
    let chartLogHistory = []; 
    let chartCurrentY = 2.5;
    let chartTickInterval = null;
    let chartState = "Waiting...";
    let chartStats = { lastDiff: 0, avgDiff: 0, isStable: false };

    let isTabActive = true;
    let processedCelebs = [];

    let celebScanRetryInterval = null;`;

export const UTILS_PART = `
    // --- UI & Logging ---

    function getTimestamp() {
        const now = new Date();
        const date = [now.getDate().toString().padStart(2, '0'), (now.getMonth() + 1).toString().padStart(2, '0'), now.getFullYear()];
        const time = [now.getHours().toString().padStart(2, '0'), now.getMinutes().toString().padStart(2, '0'), now.getSeconds().toString().padStart(2, '0')];
        return \`[\${date.join('/')} \${time.join(':')}]\`;
    }

    function log(message, type = 'log') {
        const styles = { log: 'color: inherit;', info: 'color: #3b82f6;', success: 'color: #22c55e;', error: 'color: #ef4444; font-weight: bold;', rocket: '', timer: 'color: #f59e0b;', warn: 'color: #f59e0b;' };
        const prefix = type === 'rocket' ?
            '🚀' : (type === 'success' ? '✅' : (type === 'info' ? 'ℹ️' : (type === 'timer' ? '⏱️' : (type === 'warn' ? '⚠️' : '➡️'))));
        console.log(\`%c[Auto Locket Celeb]%c \${prefix} \${message}\`, 'color: #8b5cf6; font-weight: bold;', styles[type] || styles.log);
        try {
            const logTextarea = document.getElementById('dashboard-script-log');
            const filteredMessages = [
                "Thời gian hẹn giờ tối thiểu", "Tăng thời gian hẹn giờ lên", "Giảm thời gian hẹn giờ xuống",
                "Đã TIẾP TỤC đồng hồ đếm ngược", "Hẹn giờ ĐÃ TẮT", "Hẹn giờ ĐÃ BẬT",
                'Bắt đầu theo dõi nhật ký của', 'Tiếp tục xử lý danh sách celeb...', 'Vui lòng nhập username để bắt đầu lặp.'
            ];

            const isFiltered = filteredMessages.some(filter => message.includes(filter));
            const timestamp = getTimestamp();
            const logMessage = \`\${timestamp} \${message}\\n\`;
            if (logTextarea && !isFiltered) {
                logTextarea.value += logMessage;
                logTextarea.scrollTop = logTextarea.scrollHeight;
            }

            const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
            const needsTimerRestart = localStorage.getItem(CONFIG.TIMER_RESTART_KEY) === 'true';
            if ((state.isRunning || needsTimerRestart) && !isFiltered) {
                let storedLog = sessionStorage.getItem(CONFIG.LOG_STORAGE_KEY) || "";
                storedLog += logMessage;
                sessionStorage.setItem(CONFIG.LOG_STORAGE_KEY, storedLog);
            }

        } catch (e) {}
    }

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

    function formatTimeWithHours(totalSeconds) {
        const absSeconds = Math.abs(totalSeconds);
        const hours = Math.floor(absSeconds / 3600);
        const minutes = Math.floor((absSeconds % 3600) / 60);
        const seconds = Math.floor(absSeconds % 60);
        const sign = totalSeconds < 0 ? '-' : '';
        return \`\${sign}\${hours.toString().padStart(2, '0')}:\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
    }

    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    function waitForElementById(elementId, timeout = 180000, interval = 500) {
        return new Promise((resolve, reject) => {
            let elapsedTime = 0;
            const check = () => {
                const element = document.getElementById(elementId);
                if (element) { resolve(element); } else {
                    elapsedTime += interval;
                    if (elapsedTime >= timeout) { log(\`Hết thời gian chờ element ID: \${elementId}\`, 'error'); reject(new Error(\`Timeout waiting for element ID: \${elementId}\`)); }
                    else { setTimeout(check, interval); }
                }
            };
            check();
        });
    }

    function findButtonByText(text) {
        const buttons = document.querySelectorAll('button');
        const searchText = text.trim().toLowerCase();
        for (const button of buttons) {
            if (button.textContent.trim().toLowerCase() === searchText) { return button; }
        }
        return null;
    }

    function waitForElement(selector, timeout = 3000) {
        return new Promise((resolve, reject) => {
            let interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) { clearInterval(timeoutId); clearInterval(interval); resolve(element); }
            }, 100);
            let timeoutId = setTimeout(() => { clearInterval(interval); reject(new Error(\`Timeout waiting for \${selector}\`)); }, timeout);
        });
    }`;

export const STYLES_PART = `
    function injectNewStyles() {
        const style = document.createElement('style');
        style.textContent = \`
            /* ... (CSS Chung) ... */
            
            /* Custom Scrollbar cho toàn bộ công cụ */
            #auto-celeb-main-container *::-webkit-scrollbar,
            #auto-celeb-modal-overlay *::-webkit-scrollbar,
            #celeb-dashboard-modal *::-webkit-scrollbar,
            .auto-celeb-modal *::-webkit-scrollbar { width: 6px; height: 6px; }
            
            #auto-celeb-main-container *::-webkit-scrollbar-track,
            #auto-celeb-modal-overlay *::-webkit-scrollbar-track,
            #celeb-dashboard-modal *::-webkit-scrollbar-track,
            .auto-celeb-modal *::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 3px; }
            
            #auto-celeb-main-container *::-webkit-scrollbar-thumb,
            #auto-celeb-modal-overlay *::-webkit-scrollbar-thumb,
            #celeb-dashboard-modal *::-webkit-scrollbar-thumb,
            .auto-celeb-modal *::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.5); border-radius: 3px; }
            
            #auto-celeb-main-container *::-webkit-scrollbar-thumb:hover,
            #auto-celeb-modal-overlay *::-webkit-scrollbar-thumb:hover,
            #celeb-dashboard-modal *::-webkit-scrollbar-thumb:hover,
            .auto-celeb-modal *::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.8); }
            
            #auto-celeb-main-container *,
            #auto-celeb-modal-overlay *,
            #celeb-dashboard-modal *,
            .auto-celeb-modal * { scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.5) rgba(255,255,255,0.05); }
            
            #auto-celeb-main-container {
                position: fixed; z-index: 9999; display: flex; flex-direction: column; gap: 12px;
                width: 350px; font-family: 'Inter', 'Poppins', 'Segoe UI', sans-serif;
                background: rgba(15,15,20,0.85); backdrop-filter: blur(15px);
                border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 30px rgba(0,0,0,0.3);
                border-radius: 16px; padding: 12px; top: 90px; left: 10px; right: auto; bottom: auto;
                max-height: 90vh; overflow: hidden;
                transition: max-height 0.3s ease, padding-top 0.3s ease, padding-bottom 0.3s ease;
            }
            #auto-celeb-popup-header {
                display: flex; justify-content: space-between; align-items: center;
                color: white; font-size: 18px; font-weight: 700;
                border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px;
                margin-bottom: 4px; cursor: default;
            }
            #auto-celeb-popup-title {
                cursor: pointer; user-select: none; flex-grow: 1; display: flex;
                align-items: center; gap: 8px; justify-content: flex-start;
            }
            #auto-celeb-title-icon { width: 22px; height: 22px; border-radius: 5px; }
            #auto-celeb-collapse-toggle {
                font-size: 20px; font-weight: bold; cursor: pointer; padding: 0 5px;
                transition: transform 0.3s ease; user-select: none;
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
                display: flex; justify-content: space-between; width: 100%;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                margin-bottom: 12px; margin-top: -8px;
            }
            .nav-tab {
                flex: 1; text-align: center; padding: 8px 0; color: #aaa;
                font-weight: 600; font-size: 15px; text-decoration: none; cursor: pointer;
                transition: color 0.2s ease, border-bottom-color 0.2s ease;
                border-bottom: 3px solid transparent; position: relative; top: 1px;
            }
            .nav-tab:hover, .nav-tab:focus { text-decoration: none; }
            .nav-tab:not(.active):hover { color: #e5e7eb; }
            .nav-tab.active { color: #fff; }
            #tab-celeb-tools.active { border-bottom-color: #8b5cf6; }
            #tab-celeb-tools:not(.active):hover { color: #d6bcfa; border-bottom-color: rgba(139,92,246,0.45); }
            #tab-friend-tools.active { border-bottom-color: #ef4444; }
            #tab-friend-tools:not(.active):hover { color: #fca5a5; border-bottom-color: rgba(239,68,68,0.45); }

            #auto-celeb-main-container.locked #auto-celeb-tab-nav,
            #auto-celeb-main-container.locked #auto-celeb-open-dashboard-btn,
            #auto-celeb-main-container.locked #auto-celeb-redirect-buttons,
            #auto-celeb-main-container.locked #auto-friend-tool-wrapper { display: none; }
            #auto-celeb-main-container:not(.locked) #auto-celeb-key-wall { display: none; }
            #auto-celeb-key-wall { display: flex; flex-direction: column; align-items: center; gap: 15px; padding: 10px 0; }
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
            #key-error-message { font-size: 14px; color: #ef4444; font-weight: 600; margin: -5px 0 0 0; display: none; }
            @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
            .shake { animation: shake 0.3s ease; border-color: #ef4444 !important; }

            #auto-celeb-open-dashboard-btn {
                width: 100%; padding: 12px 14px; border-radius: 14px; border: none;
                color: white; font-weight: 600; font-size: 16px; cursor: pointer;
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4); transition: all 0.25s ease;
            }
            #auto-celeb-open-dashboard-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(139, 92, 246, 0.55); }
            #auto-celeb-open-dashboard-btn.close-mode {
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
            }
            #auto-celeb-open-dashboard-btn.close-mode:hover { box-shadow: 0 8px 25px rgba(239, 68, 68, 0.55); }

            #auto-celeb-redirect-buttons { display: flex; flex-direction: column; gap: 10px; padding: 10px 0; }
            .auto-celeb-redirect-button {
                width: 100%; padding: 12px 14px; border-radius: 14px; border: none;
                color: white; font-weight: 600; font-size: 16px; cursor: pointer;
                box-shadow: 0 6px 20px rgba(14, 165, 233, 0.4); transition: all 0.25s ease;
                text-decoration: none; text-align: center; display: block; box-sizing: border-box;
            }
            .auto-celeb-redirect-button:hover, .auto-celeb-redirect-button:focus { transform: translateY(-2px); filter: brightness(1.05); text-decoration: none; color: white; }
            #redirect-celeb {
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
            }
            #redirect-celeb:hover { box-shadow: 0 8px 25px rgba(139, 92, 246, 0.55); }
            #redirect-friends {
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
            }
            #redirect-friends:hover { box-shadow: 0 8px 25px rgba(239, 68, 68, 0.55); }
            #auto-friend-tool-wrapper { display: flex; flex-direction: column; gap: 0; }
            #friend-tool-title { font-size: 28px; font-weight: 700; color: #ef4444; text-align: center; margin: 0; margin-bottom: 5px; }
            #friend-tool-note { font-size: 0.9em; color: #ccc; text-align: center; margin: 0; margin-bottom: 15px; font-weight: 500; }
            #friend-celeb-select {
                width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2);
                border-radius: 10px; padding: 10px 12px; font-size: 15px; color: white;
                font-family: 'Inter', sans-serif; box-sizing: border-box; margin-bottom: 12px;
            }
            #friend-celeb-select option { background: #333; color: white; padding: 5px; }
            #friend-celeb-select:focus { outline: none; border-color: #0ea5e9; }
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

            #running-view-wrapper { display: flex; flex-direction: column; height: 100%; gap: 15px; }
            #running-chart-container {
                width: 100%; height: 150px; background: rgba(0,0,0,0.3);
                border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
                padding: 0; box-sizing: border-box; display: flex; flex-direction: column;
                overflow: hidden; position: relative; cursor: crosshair;
            }
            #activity-chart-svg {
                width: 100%; height: 100%;
                background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
                background-size: 30px 30px;
            }
            #activity-chart-line {
                filter: drop-shadow(0 0 5px #9c4ff9);
            }
            .chart-tooltip {
                position: absolute; background: rgba(0, 0, 0, 0.92);
                border: 1px solid #8b5cf6; padding: 8px 12px;
                border-radius: 8px; color: #fff; font-size: 11px;
                pointer-events: none; display: none; z-index: 10;
                white-space: nowrap; box-shadow: 0 4px 15px rgba(0,0,0,0.6);
                font-family: 'JetBrains Mono', monospace;
                line-height: 1.5; max-width: none;
                left: 8px !important; top: 8px !important;
            }
            #chart-overlay-info { pointer-events: none; }

            #running-stats-container {
                flex-shrink: 0; background: rgba(0,0,0,0.2);
                border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
                padding: 10px 15px; max-height: 150px; overflow-y: auto;
            }
            #running-stats-container p {
                font-size: 14px; color: #eee; margin: 5px 0; display: flex; justify-content: space-between;
            }
            #running-stats-container p strong { color: #aaa; font-weight: 600; }
            #running-stats-container p span {
                font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #f59e0b;
            }
            #running-stats-container p #stat-time { color: #22c55e; }
            #running-stats-container p #stat-error { color: #ef4444; }

            #processed-celebs-container {
                flex-shrink: 0; background: rgba(0,0,0,0.2);
                border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
                padding: 10px 15px; margin-top: 15px;
            }
            #processed-celebs-container p {
                font-size: 14px; color: #eee; margin: 0 0 10px 0; font-weight: 600;
            }
            #processed-celebs-list {
                display: flex; flex-wrap: nowrap; gap: 8px; align-items: center;
                overflow-x: auto; overflow-y: hidden;
                padding-bottom: 5px;
                max-width: calc(8 * 40px + 7 * 8px); /* 8 icons (40px each) + 7 gaps (8px each) = 376px */
                cursor: grab; user-select: none;
            }
            #processed-celebs-list.dragging { cursor: grabbing; scroll-behavior: auto; }
            #processed-celebs-list:not(.dragging) { scroll-behavior: smooth; }
            .processed-celeb-item {
                flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
                object-fit: cover; border: 2px solid #8b5cf6;
            }
            .processed-celeb-more {
                flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
                background: #4b5563; border: 2px solid #6b7280;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: all 0.2s; font-weight: bold; color: white;
            }
            .processed-celeb-more:hover { background: #6b7280; }
            .processed-celeb-more svg { width: 20px; height: 20px; fill: white; }

            /* New Styles for Processed List Modal */
            #modal-processed-list {
                width: 600px; max-width: 90vw; padding-bottom: 30px;
            }
            #processed-list-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                gap: 12px; max-height: 400px; overflow-y: auto; padding-right: 5px;
                margin-top: 15px;
            }
            .processed-grid-item {
                display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05);
                padding: 8px; border-radius: 8px;
            }
            .processed-grid-item img { width: 32px; height: 32px; border-radius: 50%; }
            .processed-grid-item span { font-size: 13px; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }


            .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
            .toggle-switch { position: relative; display: inline-flex; align-items: center; width: 52px; height: 30px; flex-shrink: 0; }
            .toggle-switch-label { position: relative; display: block; width: 100%; height: 100%; background-color: #8e8e93; border-radius: 15px; cursor: pointer; transition: background-color 0.2s ease; }
            .toggle-switch-handle { position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; background: #fff; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.2s ease; }
            .toggle-switch-input:checked + .toggle-switch-label { background-color: #34c759; }
            .toggle-switch-input:checked + .toggle-switch-label .toggle-switch-handle { transform: translateX(20px); }
            .celeb-item-toggle-wrapper.toggle-switch { width: 50px; height: 30px; }
            .celeb-item-toggle-wrapper { position: relative; margin-left: 16px; flex-shrink: 0; }
            .celeb-item-toggle-wrapper .toggle-switch-label { display: block; width: 100%; height: 100%; background-color: #8e8e93; border-radius: 15px; cursor: pointer; transition: background-color 0.2s ease; }
            .celeb-item-toggle-wrapper .toggle-switch-handle { position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; background: #fff; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.2s ease; }
            .celeb-list-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
            .celeb-refresh-button {
                display: flex; align-items: center; gap: 6px; padding: 6px 12px;
                border-radius: 10px; border: 1px solid rgba(255,255,255,0.2);
                background: rgba(59,130,246,0.15); color: #dbeafe; font-size: 13px;
                font-weight: 600; cursor: pointer;
                transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
            }
            .celeb-refresh-button:hover {
                background: rgba(59,130,246,0.25); border-color: rgba(59,130,246,0.4); transform: translateY(-1px);
            }
            .celeb-refresh-button:active { transform: translateY(0); }
            .celeb-refresh-button .refresh-icon { font-size: 14px; line-height: 1; }
            .celeb-refresh-button .refresh-icon.spinning { display: inline-block; animation: celebRefreshSpin 0.8s linear infinite; }
            @keyframes celebRefreshSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .celeb-item-toggle-wrapper .toggle-switch-input:checked + .toggle-switch-label { background-color: #34c759; }
            .celeb-item-toggle-wrapper .toggle-switch-input:checked + .toggle-switch-label .toggle-switch-handle { transform: translateX(20px); }

            #celeb-dashboard-modal {
                width: 1020px; max-width: 95vw; text-align: left; background: #232325;
                top: 90px !important; left: 385px !important; transform: none !important;
                background: rgba(15,15,20,0.85) !important; backdrop-filter: blur(15px);
                border: 1px solid rgba(255,255,255,0.15) !important;
                box-shadow: 0 8px 30px rgba(0,0,0,0.3) !important;
                border-radius: 16px !important; width: 750px; max-width: 90vw;
                padding: 12px !important; padding-top: 40px !important; z-index: 9998;
            }
            #celeb-dashboard-modal .auto-celeb-modal-close { display: none !important; }
            #modal-dashboard-layout { display: flex; gap: 20px; margin-top: -15px; }
            #modal-celeb-list-wrapper {
                flex: 1.5; border-right: 1px solid #444; padding-right: 20px;
                min-height: 450px; max-height: 60vh; display: flex; flex-direction: column;
            }
            #modal-celeb-list-wrapper h3 { color: white; font-weight: 700; margin-bottom: 15px; flex-shrink: 0; font-size: 22px; }
            #celeb-select-all-label {
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 12px; background: rgba(0,0,0,0.25);
                border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
                margin-bottom: 10px; user-select: none; transition: background-color 0.2s; flex-shrink: 0;
            }
            #celeb-select-all-label:hover { background: rgba(0,0,0,0.4); }
            #celeb-select-all-info { display: flex; align-items: center; gap: 10px; }
            #celeb-select-all-text { font-size: 1.1em; font-weight: 600; }
            #celeb-selected-count {
                padding: 4px 12px; border-radius: 999px; border: 1px solid rgba(59,130,246,0.45);
                background: linear-gradient(135deg, rgba(37,99,235,0.9), rgba(59,130,246,0.85));
                color: #f8fafc; font-size: 12px; font-weight: 600; letter-spacing: 0.2px;
                cursor: default; pointer-events: none; box-shadow: 0 4px 10px rgba(37,99,235,0.25);
            }
            .select-all-toggle { margin-left: 16px; }
            #celeb-selection-list { flex-grow: 1; overflow-y: auto; padding-right: 12px; }
            .celeb-list-item-new {
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; cursor: pointer;
                border: 1px solid transparent; transition: background-color 0.2s;
            }
            .celeb-list-item-new:hover { background-color: rgba(255, 255, 255, 0.05); }
            .celeb-list-item-new.selected { background-color: rgba(139, 92, 246, 0.1); border-color: rgba(139, 92, 246, 0.3); }
            .celeb-list-item-main { display: flex; align-items: center; flex-grow: 1; min-width: 0; gap: 14px; }
            .celeb-list-profile-image { position: relative; margin-right: 12px; flex-shrink: 0; }
            .celeb-list-profile-image img { width: 50px; height: 50px; border-radius: 50%; border: 3px solid #F0B90A; }
            .celeb-list-icon {
                position: absolute; bottom: 0; right: 0; background: #F0B90A; color: #333;
                border-radius: 50%; width: 20px; height: 20px; display: flex;
                align-items: center; justify-content: center; font-size: 14px; font-weight: bold;
                border: 2px solid rgba(15,15,20,0.85);
            }
            .celeb-list-profile-info { flex-grow: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
            .celeb-list-profile-name { font-size: 16px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .celeb-list-progress { width: 100%; height: 8px; background: #555; border-radius: 4px; overflow: hidden; }
            .celeb-list-progress-bar { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
            .celeb-list-progress-text { font-size: 12px; color: #aaa; font-weight: 500; }

            #modal-celeb-controls-wrapper { flex: 1; display: flex; flex-direction: column; gap: 12px; min-height: 450px; }
            #dashboard-control-button {
                width: 100%; padding: 12px 14px; border-radius: 14px; border: none;
                color: white; font-weight: 600; font-size: 16px; cursor: pointer;
                background: linear-gradient(135deg, #22c55e, #16a34a);
                box-shadow: 0 6px 20px rgba(34,197,94,0.4); transition: all 0.25s ease;
            }
            #dashboard-control-button:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(34,197,94,0.55); filter: brightness(1.1); }
            #dashboard-control-button.running {
                background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 6px 20px rgba(239,68,68,0.4);
            }
            #dashboard-timer-ui {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 15px; border-radius: 14px; color: white; font-weight: 600;
                background: rgba(30,30,30,0.45); border: 1px solid rgba(255,255,255,0.15);
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
            #dashboard-timer-ui #timer-toggle-switch { position: relative; display: inline-block; width: 50px; height: 30px; flex-shrink: 0; }
            #dashboard-timer-ui.timer-counting #timer-display-group { flex-grow: 1; justify-content: center; gap: 15px; }
            #dashboard-timer-ui.timer-counting #timer-display { color: #0ea5e9; font-weight: 700; font-size: 38px; text-align: left; flex-grow: 0; }
            #dashboard-timer-ui.timer-counting #timer-adjust-buttons, #dashboard-timer-ui.timer-counting #timer-toggle-switch { display: none; }
            #dashboard-timer-ui:not(.timer-counting) #timer-progress-ring { display: none; }
            #dashboard-timer-ui:not(.timer-counting) #timer-display { font-size: 32px; text-align: left; flex-grow: 0; min-width: 90px; }
            #dashboard-timer-ui:not(.timer-counting) #timer-adjust-buttons { display: flex; }
            #dashboard-timer-ui:not(.timer-counting) #timer-toggle-switch { display: inline-block; }

            #dashboard-log-wrapper { display: flex; flex-direction: column; flex-grow: 1; min-height: 150px; margin-top: 12px; }
            #dashboard-log-wrapper label { color: white; font-weight: bold; margin-bottom: 5px; display: block; user-select: none; }
            #dashboard-script-log {
                width: 100%; resize: none; margin: 0; font-family: Consolas, 'Courier New', monospace;
                font-size: 12px; font-weight: bold; background-color: #111; color: #eee;
                border: 1px solid #444; border-radius: 8px; box-sizing: border-box; padding: 8px; flex-grow: 1;
            }
            #dashboard-footer-buttons { display: flex; justify-content: space-between; gap: 8px; flex-shrink: 0; }
            #dashboard-footer-buttons .footer-btn {
                flex-grow: 1; padding: 6px; border: none; border-radius: 5px; color: white;
                cursor: pointer; font-weight: bold; transition: all 0.2s ease; font-size: 13px;
            }
            #dashboard-footer-buttons .footer-btn:hover { opacity: 0.8; transform: translateY(-1px); }
            #dashboard-footer-buttons #btn-update { background-color: #0ea5e9; }
            #dashboard-footer-buttons #btn-bug-report { background-color: #f59e0b; }
            #dashboard-footer-buttons #btn-donate { background-color: #22c55e; }
            #auto-celeb-footer-buttons { display: flex; flex-direction: row; gap: 8px; padding: 8px 0; margin-top: 12px; }
            #auto-celeb-footer-buttons .footer-btn {
                flex: 1; padding: 8px 12px; border: none; border-radius: 8px; color: white;
                cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s ease;
            }
            #auto-celeb-footer-buttons .footer-btn:hover { opacity: 0.9; transform: translateY(-1px); }
            #auto-celeb-footer-buttons #btn-main-update { background-color: #0ea5e9; }
            #auto-celeb-footer-buttons #btn-main-bug-report { background-color: #f59e0b; }
            #auto-celeb-footer-buttons #btn-main-donate { background-color: #22c55e; }

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
            .toast-notification {
                display: flex; align-items: center; gap: 12px; background: rgba(30,30,30,0.65);
                backdrop-filter: blur(15px); color: #e5e7eb; padding: 12px 18px; border-radius: 16px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15);
                font-size: 15px; animation: slideInFadeIn 0.5s forwards, fadeOut 0.5s 3.5s forwards;
                transform: translateX(100%); opacity: 0;
            }
            .toast-notification .toast-icon { flex-shrink: 0; width: 22px; height: 22px; }
            .toast-notification .toast-message { font-weight: 600; }
            .toast-notification.toast-success { border-left: 4px solid #22c55e; }
            .toast-notification.toast-success .toast-icon { color: #22c55e; }

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

            #auto-celeb-login-notice {
                display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px;
                background: linear-gradient(145deg, rgba(30, 30, 35, 0.8), rgba(20, 20, 25, 0.8));
                border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; text-align: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            #login-notice-icon {
                width: 48px; height: 48px; color: #f59e0b; margin-bottom: 5px;
                filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.5));
            }
            #login-notice-title { font-size: 18px; font-weight: 700; margin: 0; color: #f0f0f0; }
            #login-notice-message { font-size: 14px; color: #b0b0b0; line-height: 1.5; margin: 0; max-width: 280px; }
        \`;
        document.head.appendChild(style);
    }`;

export const UI_PART = `
    // --- UI FUNCTIONS ---
    function updateChartDrawing() {
        const svgLine = document.getElementById('activity-chart-line');
        const svgArea = document.getElementById('activity-chart-area');
        if (!svgLine || !svgArea) return;

        const width = 300;
        const height = 100;

        // Map data points to coordinates with better scaling
        const points = chartDataPoints.map((val, i) => {
            const x = (i / (chartDataPoints.length - 1)) * width;
            // Scale: 0-10 maps to full height, with padding
            const normalizedVal = Math.max(0, Math.min(10, val));
            const y = height - 5 - (normalizedVal / 10 * (height - 10)); // 5px padding top/bottom
            return [x, y];
        });

        const line = (pointA, pointB) => {
            const lengthX = pointB[0] - pointA[0];
            const lengthY = pointB[1] - pointA[1];
            return { length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)), angle: Math.atan2(lengthY, lengthX) };
        };
        const controlPoint = (current, previous, next, reverse) => {
            const p = previous || current;
            const n = next || current;
            // Tăng smoothing để đường cong mượt hơn nhưng vẫn giữ đỉnh rõ
            const smoothing = 0.15;
            const o = line(p, n);
            const angle = o.angle + (reverse ? Math.PI : 0);
            const length = o.length * smoothing;
            const x = current[0] + Math.cos(angle) * length;
            const y = current[1] + Math.sin(angle) * length;
            return [x, y];
        };
        const bezierCommand = (point, i, a) => {
            const cps = controlPoint(a[i - 1], a[i - 2], point);
            const cpe = controlPoint(point, a[i - 1], a[i + 1], true);
            return \`C \${cps[0].toFixed(1)},\${cps[1].toFixed(1)} \${cpe[0].toFixed(1)},\${cpe[1].toFixed(1)} \${point[0].toFixed(1)},\${point[1].toFixed(1)}\`;
        };

        const d = points.reduce((acc, point, i, a) => i === 0 ? \`M \${point[0]},\${point[1]}\` : \`\${acc} \${bezierCommand(point, i, a)}\`, '');

        svgLine.setAttribute('d', d);
        svgArea.setAttribute('d', \`\${d} L \${width},\${height} L 0,\${height} Z\`);
    }

    function startChartLoop() {
        if (chartTickInterval) clearInterval(chartTickInterval);
        
        try {
            const stored = sessionStorage.getItem(CONFIG.CHART_DATA_KEY);
            if (stored) chartDataPoints = JSON.parse(stored);
        } catch(e) {}

        chartTickInterval = setInterval(() => {
            const now = Date.now();
            let targetY = 2.5; 
            const timeSinceLastLog = (now - chartLastLogTime) / 1000;

            if (timeSinceLastLog > 15) {
                 // Idle state - gentle wave between 1.5 and 3.5
                 targetY = 2.5 + Math.sin(now / 3000) * 1;
                 chartState = "Waiting...";
            } else if (timeSinceLastLog > 8) {
                 // Cooling down - gradually decrease
                 targetY = 3 + Math.sin(now / 2000) * 0.8;
                 chartState = "Cooling...";
            } else {
                 // Active - keep higher with some variation
                 targetY = chartCurrentY; 
            }

            // Smoother easing - slower transition (0.25 instead of 0.1)
            chartCurrentY = chartCurrentY + (targetY - chartCurrentY) * 0.25;

            chartDataPoints.shift();
            chartDataPoints.push(chartCurrentY);

            sessionStorage.setItem(CONFIG.CHART_DATA_KEY, JSON.stringify(chartDataPoints));
            
            updateChartDrawing();
            updateChartTooltip();
        }, 600); // Slower update: 600ms instead of 100ms
    }

    function stopChartLoop() {
        if (chartTickInterval) clearInterval(chartTickInterval);
    }

    function handleChartLog() {
        const now = Date.now();
        if (chartLastLogTime === 0) {
             chartLastLogTime = now;
             chartCurrentY = 5;
             chartState = "Started";
             return;
        }

        const diff = (now - chartLastLogTime) / 1000;
        chartLastLogTime = now;
        chartStats.lastDiff = diff;

        chartLogHistory.push({ t: now, d: diff });
        chartLogHistory = chartLogHistory.filter(item => (now - item.t) < 30000);

        const validDiffs = chartLogHistory.map(i => i.d);
        const sum = validDiffs.reduce((a, b) => a + b, 0);
        const avg = validDiffs.length ? sum / validDiffs.length : diff;
        chartStats.avgDiff = avg;

        const deviation = Math.abs(diff - avg);
        chartStats.isStable = deviation < 1.5;

        // Create more dramatic spikes with sharper peaks
        if (chartStats.isStable) {
            // Stable: sharp jump to 6-7 range
            chartCurrentY = 6 + Math.random() * 1.5;
            chartState = "Stable Activity";
        } else {
            // Variable activity: dramatic spikes between 5-9
            const intensity = Math.min(deviation / 3, 1); // 0-1 based on deviation
            let spike = 5 + (intensity * 4) + (Math.random() * 1.5);
            spike = Math.min(9.5, Math.max(4, spike));
            chartCurrentY = spike;
            chartState = \`Active (Peak \${spike.toFixed(1)})\`;
        }
    }

    function updateChartTooltip() {
        const tooltip = document.getElementById('chart-tooltip-info');
        if (!tooltip) return;
        
        const timeSince = ((Date.now() - chartLastLogTime) / 1000).toFixed(1);
        tooltip.innerHTML = \`Last: \${chartStats.lastDiff.toFixed(1)}s · Avg: \${chartStats.avgDiff.toFixed(1)}s · Since: \${timeSince}s\`;
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            isTabActive = false;
        } else {
            isTabActive = true;
            // Khi quay lại tab, đảm bảo timer vẫn chạy nếu đang trong trạng thái running
            const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
            if (state.isRunning) {
                // Khôi phục runStartTime nếu cần
                if (!runStartTime) {
                    runStartTime = parseInt(sessionStorage.getItem('autoCelebRunStartTime') || Date.now().toString(), 10);
                }
                // Đảm bảo timer interval đang chạy
                if (!runTimerInterval) {
                    runTimerInterval = setInterval(updateRunTimer, 1000);
                }
                // Cập nhật ngay lập tức
                updateRunTimer();
                updateStatsDisplay();
            }
        }
    }

    function incrementConnectionLostCount() {
        runConnectionLostCount++;
        localStorage.setItem('autoCelebConnectionLostCount', runConnectionLostCount.toString());
        updateStatsDisplay();
    }

    function incrementAutoResetCount() {
        runAutoResetCount++;
        localStorage.setItem('autoCelebAutoResetCount', runAutoResetCount.toString());
        updateStatsDisplay();
    }

    function updateStatsDisplay() {
        const sentEl = document.getElementById('stat-sent');
        const timeEl = document.getElementById('stat-time');
        const errorEl = document.getElementById('stat-error');
        const resetEl = document.getElementById('stat-reset');

        if (sentEl) sentEl.textContent = runSentCount.toString();
        if (errorEl) errorEl.textContent = runConnectionLostCount.toString(); // Lỗi = số lần mất kết nối
        if (resetEl) resetEl.textContent = runAutoResetCount.toString(); // Reset = số lần auto reset
        updateRunTimer();
    }

    function updateRunTimer() {
        const timeEl = document.getElementById('stat-time');
        if (!timeEl) return;
        if (!runStartTime) {
            timeEl.textContent = '00:00:00';
            return;
        }
        const totalElapsed = Date.now() - runStartTime;
        const activeRunTimeSeconds = Math.floor(totalElapsed / 1000);
        if (activeRunTimeSeconds >= 0) {
             timeEl.textContent = formatTimeWithHours(activeRunTimeSeconds);
        }
    }

    function showRunningView() {
        const listWrapper = document.getElementById('modal-celeb-list-wrapper');
        if (!listWrapper) return;

        listWrapper.innerHTML = \`
            <div id="running-view-wrapper">
                <div id="running-chart-container" onmouseenter="document.getElementById('chart-tooltip-info').style.display='block';" onmouseleave="document.getElementById('chart-tooltip-info').style.display='none';">
                    <div id="chart-tooltip-info" class="chart-tooltip"></div>
                    <svg id="activity-chart-svg" viewBox="0 0 300 100" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.6"/>
                                <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.1"/>
                            </linearGradient>
                        </defs>
                        <path id="activity-chart-area" d="" fill="url(#chartGradient)"></path>
                        <path id="activity-chart-line" d="" fill="none" stroke="#9c4ff9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    <div id="chart-overlay-info" style="position:absolute; top:5px; right:10px; font-size:10px; color:#aaa; font-weight:bold; font-family:'Inter'; text-shadow:0 0 5px rgba(0,0,0,0.5);">LIVE ACTIVITY</div>
                </div>

                <div id="running-stats-container">
                    <p><strong>Đã gửi:</strong> <span id="stat-sent">0</span></p>
                    <p><strong>Thời gian:</strong> <span id="stat-time">00:00:00</span></p>
                    <p><strong>Lỗi:</strong> <span id="stat-error">0</span></p>
                    <p><strong>Reset:</strong> <span id="stat-reset">0</span></p>
                </div>

                <div id="processed-celebs-container">
                    <p><strong>Đã xử lý:</strong></p>
                    <div id="processed-celebs-list"></div>
                </div>
            </div>
        \`;
        
        updateChartDrawing();
        
        const logWrapper = document.getElementById('dashboard-log-wrapper');
        if (logWrapper) {
            logWrapper.style.display = 'flex';
        }
        updateProcessedCelebsDisplay();
    }

    function updateProcessedCelebsDisplay() {
        const container = document.getElementById('processed-celebs-list');
        if (!container) return;
        const storedProcessedCelebs = sessionStorage.getItem(CONFIG.PROCESSED_CELEBS_KEY);
        const list = storedProcessedCelebs ? JSON.parse(storedProcessedCelebs) : [];

        // Hiển thị tất cả celeb, cho phép scroll ngang
        const displayHtml = list.map(celeb => \`
            <img src="\${celeb.imgSrc}" alt="\${celeb.name}" title="\${celeb.name}" class="processed-celeb-item" draggable="false">
        \`).join('');
        
        container.innerHTML = displayHtml;
        
        // Tự động scroll đến cuối (celeb mới nhất) khi có celeb mới
        container.scrollLeft = container.scrollWidth;
        
        // Setup drag to scroll
        setupDragToScroll(container);
    }
    
    function setupDragToScroll(container) {
        let isDown = false;
        let startX;
        let scrollLeft;
        
        container.addEventListener('mousedown', (e) => {
            isDown = true;
            container.classList.add('dragging');
            startX = e.pageX - container.offsetLeft;
            scrollLeft = container.scrollLeft;
        });
        
        container.addEventListener('mouseleave', () => {
            isDown = false;
            container.classList.remove('dragging');
        });
        
        container.addEventListener('mouseup', () => {
            isDown = false;
            container.classList.remove('dragging');
        });
        
        container.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - container.offsetLeft;
            const walk = (x - startX) * 1.5; // Tốc độ kéo
            container.scrollLeft = scrollLeft - walk;
        });
    }

    function showProcessedListModal(list) {
         const modalOverlay = document.getElementById('auto-celeb-modal-overlay');
         const modalList = document.getElementById('modal-processed-list');
         const grid = document.getElementById('processed-list-grid');
         if (!modalOverlay || !modalList || !grid) return;

         grid.innerHTML = list.map(celeb => \`
            <div class="processed-grid-item">
                <img src="\${celeb.imgSrc}" loading="lazy">
                <span>\${celeb.name}</span>
            </div>
         \`).join('');

         modalOverlay.style.display = 'block';
         modalList.style.display = 'block';
    }

    function showCelebPopup(celebName, countText) {
        let container = document.getElementById('auto-celeb-popup-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'auto-celeb-popup-container';
            document.body.appendChild(container);
        }
        const popup = document.createElement('div');
        popup.className = 'celeb-popup-item';
        popup.innerHTML = \`
            <span class="celeb-count">\${countText}</span>
            Đang xử lý: <span class="celeb-name">\${celebName}</span>
        \`;
        container.prepend(popup);
        setTimeout(() => {
            popup.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        }, 4000);
    }

    function showToastNotification(message, type = 'info', duration = 4000) {
         let container = document.getElementById('auto-celeb-popup-container');
         if (!container) {
             container = document.createElement('div');
             container.id = 'auto-celeb-popup-container';
             document.body.appendChild(container);
         }
         const toast = document.createElement('div');
         toast.className = \`toast-notification toast-\${type}\`;
         const icons = {
             success: \`<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>\`,
         };
         toast.innerHTML = \`
             \${icons[type] || ''}
             <span class="toast-message">\${message}</span>
         \`;
         container.prepend(toast);
         setTimeout(() => toast.remove(), duration);
     }

    function createMainControlUI() {
        const container = document.createElement('div');
        container.id = 'auto-celeb-main-container';

        container.innerHTML = \`
            <div id="auto-celeb-popup-header">
                <span id="auto-celeb-popup-title">
                    <img src="\${CONFIG.LOGO_URL}" id="auto-celeb-title-icon">
                    Locket Celebrity \${CONFIG.SCRIPT_VERSION}
                </span>
                <span id="auto-celeb-collapse-toggle">&#9660;</span>
            </div>
        \`;

        const isCelebPage = window.location.href === CONFIG.TARGET_PAGE;
        const isFriendPage = window.location.href === CONFIG.FRIENDS_PAGE;
        const isLoginPage = window.location.href === CONFIG.LOGIN_PAGE;

        const tabNav = document.createElement('div');
        tabNav.id = 'auto-celeb-tab-nav';
        if (isCelebPage || isFriendPage) {
            tabNav.innerHTML = \`
                <a id="tab-friend-tools" class="nav-tab \${isFriendPage ? 'active' : ''}" href="\${CONFIG.FRIENDS_PAGE}">Friends</a>
                <a id="tab-celeb-tools" class="nav-tab \${isCelebPage ? 'active' : ''}" href="\${CONFIG.TARGET_PAGE}">Celebrity Tools</a>
            \`;
            container.appendChild(tabNav);
        }

        const keyWall = document.createElement('div');
        keyWall.id = 'auto-celeb-key-wall';
        keyWall.innerHTML = \`
            <img id="key-wall-icon" src="\${CONFIG.LOGO_URL}" alt="Logo">
            <h3 id="key-wall-title">Kích hoạt Script</h3>
            <p id="key-wall-message">Để sử dụng script, vui lòng nhập key kích hoạt.<br>Truy cập kênh chat messenger để nhận key.</p>
            <a id="btn-get-key" href="\${CONFIG.MESSENGER_LINK}" target="_blank">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12C2 17.523 6.477 22 12 22C13.245 22 14.453 21.801 15.58 21.434C16.035 21.289 16.538 21.414 16.829 21.78C17.72 22.88 19.347 24 21.362 23.86C21.6 23.836 21.821 23.67 21.93 23.44C22.04 23.21 22.023 22.943 21.884 22.73C20.69 20.82 19.998 18.52 20.002 16.06C20.002 16.03 20 15.998 20 15.967C21.232 14.636 22 12.902 22 11C22 6.029 17.523 2 12 2ZM12.002 12.668C11.383 12.668 10.835 12.92 10.45 13.332L6.151 9.032C6.46 8.711 6.84 8.441 7.27 8.232C7.699 8.022 8.169 7.882 8.66 7.822C9.151 7.761 9.652 7.782 10.133 7.885C10.614 7.989 11.065 8.175 11.464 8.435L12.002 8.788L15.54 10.888C15.3 11.198 15.01 11.478 14.68 11.718C14.349 11.958 13.98 12.158 13.582 12.308C13.183 12.459 12.76 12.56 12.321 12.608C11.882 12.657 11.433 12.653 11 12.597L10.99 12.592L12.002 12.668ZM15.849 13.332C15.54 13.021 15.16 12.751 14.73 12.542C14.301 12.332 13.831 12.192 13.34 12.132C12.849 12.071 12.348 12.092 11.867 12.195C11.386 12.3 10.935 12.485 10.536 12.745L10 13.098L6.46 15.198C6.7 15.508 6.99 15.789 7.32 16.029C7.651 16.269 8.02 16.469 8.418 16.619C8.817 16.769 9.24 16.87 9.679 16.918C10.118 16.967 10.567 16.963 11 16.907L11.01 16.892L17.849 13.332L15.849 13.332Z" fill="white"/></svg>
                Lấy Key tại Messenger
            </a>
            <input type="text" id="key-input-field" placeholder="Nhập key...">
            <button id="btn-submit-key">Xác thực Key</button>
            <p id="key-error-message">Key không hợp lệ. Vui lòng thử lại.</p>
        \`;
        container.appendChild(keyWall);

        if (isCelebPage) {
            const openDashboardButton = document.createElement('button');
            openDashboardButton.id = 'auto-celeb-open-dashboard-btn';
            const initialState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
            if (initialState.isRunning) {
                openDashboardButton.textContent = 'Đóng Bảng Điều Khiển';
                openDashboardButton.classList.add('close-mode');
            } else {
                openDashboardButton.textContent = 'Mở Bảng Điều Khiển';
            }
            container.appendChild(openDashboardButton);

            const footerButtons = document.createElement('div');
            footerButtons.id = 'auto-celeb-footer-buttons';
            footerButtons.innerHTML = \`
                <button id="btn-main-update" class="footer-btn">Cập nhật</button>
                <button id="btn-main-bug-report" class="footer-btn">Báo lỗi</button>
                <button id="btn-main-donate" class="footer-btn">Donate</button>
            \`;
            container.appendChild(footerButtons);
        } else if (isFriendPage) {
            const friendTool = document.createElement('div');
            friendTool.id = 'auto-friend-tool-wrapper';
            friendTool.innerHTML = \`
                <h3 id="friend-tool-title">TÌM KIẾM TỰ ĐỘNG</h3>
                <p id="friend-tool-note">Chỉ add được đối với tài khoản Locket Celeb!</p>
                <select id="friend-celeb-select">
                    <option value="" selected disabled>-- Chọn Celeb để chạy --</option>
                </select>
                <button id="auto-friend-start-button">Bắt đầu Lặp</button>
            \`;
            container.appendChild(friendTool);

        } else if (isLoginPage) {
            const loginNotice = document.createElement('div');
            loginNotice.id = 'auto-celeb-login-notice';
            loginNotice.innerHTML = \`
                <svg id="login-notice-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <h4 id="login-notice-title">Yêu cầu Đăng nhập</h4>
                <p id="login-notice-message">Vui lòng đăng nhập trên trang web để có thể sử dụng các tính năng của script.</p>
            \`;
            container.appendChild(loginNotice);
        } else {
            const redirectButtons = document.createElement('div');
            redirectButtons.id = 'auto-celeb-redirect-buttons';
            redirectButtons.innerHTML = \`
                <a href="\${CONFIG.TARGET_PAGE}" id="redirect-celeb" class="auto-celeb-redirect-button">➡️ Về trang Celebrity Tools</a>
                <a href="\${CONFIG.FRIENDS_PAGE}" id="redirect-friends" class="auto-celeb-redirect-button">➡️ Về trang Friends</a>
            \`;
            container.appendChild(redirectButtons);
        }

        document.body.appendChild(container);

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = \`
            <div id="auto-celeb-modal-overlay" style="display: none;"></div>

            <div id="celeb-dashboard-modal" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>

                <div id="modal-dashboard-layout">
                    <div id="modal-celeb-list-wrapper">
                        <h3>Danh Sách Locket Celeb</h3>
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
                            <button id="btn-update" class="footer-btn">Cập nhật</button>
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
                <a href="\${CONFIG.MESSENGER_LINK}" target="_blank" class="modal-button">Chat trên Messenger</a>
            </div>

            <div id="modal-update" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>
                <h3>Cập nhật phiên bản</h3>
                <div class="modal-update-version-display">
                    <img src="\${CONFIG.LOGO_URL}" class="modal-update-logo" alt="Logo">
                    <span class="modal-update-title-text">Locket Celebrity \${CONFIG.SCRIPT_VERSION}</span>
                </div>
                <p class="update-text">Vui lòng cập nhật phiên bản mới.</p>
                <div class="modal-button-group">
                    <a id="btn-go-to-update" href="\${CONFIG.UPDATE_URL}" target="_blank" class="modal-button">Cài đặt</a>
                    <button id="btn-copy-update-link" class="modal-button">Copy Link</button>
                </div>
            </div>

            <div id="modal-processed-list" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>
                <h3>Tổng hợp Celeb đã xử lý</h3>
                <div id="processed-list-grid"></div>
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
            \`;
        document.body.appendChild(modalContainer);
    }

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
        ringFg.style.strokeDasharray = \`\${circumference}\`;
        if (mode === 'counting') {
            timerUI.classList.add('timer-counting');
            display.textContent = formatTimeWithHours(value);
            toggleInput.checked = true;
            const percentageElapsed = (currentTimerTotalDuration - value) / currentTimerTotalDuration;
            const offset = circumference * (1 - percentageElapsed);
            ringFg.style.strokeDashoffset = offset;
        } else {
            display.textContent = \`\${currentTimerConfig.minutes.toString().padStart(2, '0')}:00\`;
            toggleInput.checked = currentTimerConfig.enabled;
            ringFg.style.strokeDashoffset = circumference;
        }
    }

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
                    errorText.textContent = \`Lỗi xử lý: \${e.message}\`;
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

    function setupMainUIControls() {
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
                localStorage.setItem(CONFIG.KEY_STORAGE_KEY, inputVal);
                showToastNotification('Kích hoạt thành công! Đang tải lại trang...', 'success', 3000);
                 keyError.style.display = 'none';
                 setTimeout(() => {
                     location.reload();
                 }, 2000);
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

        const openDashboardButton = document.getElementById('auto-celeb-open-dashboard-btn');
        if (openDashboardButton) {
            openDashboardButton.addEventListener('click', () => {
                const modal = document.getElementById('celeb-dashboard-modal');
                if (!modal) return;
                if (modal.style.display !== 'block') {
                     openDashboardModal();
                     openDashboardButton.textContent = 'Đóng Bảng Điều Khiển';
                     openDashboardButton.classList.add('close-mode');
                } else {
                     modal.style.display = 'none';
                     openDashboardButton.textContent = 'Mở Bảng Điều Khiển';
                     openDashboardButton.classList.remove('close-mode');
                }
            });
        }

        const controlBtn = document.getElementById('dashboard-control-button');
        if (controlBtn) {
            controlBtn.addEventListener('click', () => {
                 const s = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                 if (s.isRunning) stopProcess(); else startProcessFromModal();
            });
        }

        const dashboardModal = document.getElementById('celeb-dashboard-modal');
        if (!dashboardModal) return;

        const plusBtn = dashboardModal.querySelector('#timer-plus-btn');
        const minusBtn = dashboardModal.querySelector('#timer-minus-btn');
        const toggleInput = dashboardModal.querySelector('#timer-toggle-input');
        const timerUI = dashboardModal.querySelector('#dashboard-timer-ui');
        if (plusBtn && minusBtn && toggleInput && timerUI) {
            plusBtn.addEventListener('click', (event) => {
                event.stopPropagation(); if (activeTimerId) return;
                if (currentTimerConfig.minutes === 1) { currentTimerConfig.minutes = 5; }
                else { currentTimerConfig.minutes += 5; }
                log(\`Tăng thời gian hẹn giờ lên: \${currentTimerConfig.minutes} phút.\`, 'timer');
                saveTimerConfig(); updateTimerUI();
            });
            minusBtn.addEventListener('click', (event) => {
                event.stopPropagation(); if (activeTimerId) return;
                if (currentTimerConfig.minutes > 5) { currentTimerConfig.minutes -= 5; }
                else if (currentTimerConfig.minutes === 5) { currentTimerConfig.minutes = 1; }
                else { currentTimerConfig.minutes = 1; }
                log(\`Giảm thời gian hẹn giờ xuống: \${currentTimerConfig.minutes} phút.\`, 'timer');
                saveTimerConfig(); updateTimerUI();
            });
            toggleInput.addEventListener('change', (event) => {
                if (activeTimerId) { toggleInput.checked = true; return; }
                currentTimerConfig.enabled = toggleInput.checked;
                log(\`Hẹn giờ \${currentTimerConfig.enabled ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}.\`, 'timer');
                saveTimerConfig(); updateTimerUI();
            });
        }

        const btnUpdate = dashboardModal.querySelector('#btn-update');
        const btnBugReport = dashboardModal.querySelector('#btn-bug-report');
        const btnDonate = dashboardModal.querySelector('#btn-donate');
        const btnGenerateQR = document.getElementById('btn-generate-qr');

        const modalOverlay = document.getElementById('auto-celeb-modal-overlay');
        const modalBug = document.getElementById('modal-bug-report');
        const modalUpdate = document.getElementById('modal-update');
        const modalDonate = document.getElementById('modal-donate');
        const modalProcessed = document.getElementById('modal-processed-list');
        const allCloseButtons = document.querySelectorAll('.auto-celeb-modal-close');

        const closeOnlyPopupModals = () => {
            if (modalOverlay) modalOverlay.style.display = 'none';
            if (modalBug) modalBug.style.display = 'none';
            if (modalUpdate) modalUpdate.style.display = 'none';
            if (modalDonate) modalDonate.style.display = 'none';
            if (modalProcessed) modalProcessed.style.display = 'none';
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
                    e.target.value = numValue.toString().replace(/B(?=(d{3})+(?!d))/g, ',');
                } else { e.target.value = ''; }
            });
        }
        if (modalOverlay) modalOverlay.addEventListener('click', closeOnlyPopupModals);
        allCloseButtons.forEach(btn => btn.addEventListener('click', closeOnlyPopupModals));
    }

    function syncSelectAllToggle() {
        const selectAllInput = document.getElementById('celeb-select-all-input');
        if (!selectAllInput) return;
        const allCelebToggles = document.querySelectorAll('.celeb-item-toggle-input');
        const total = allCelebToggles.length;
        if (total === 0) { selectAllInput.checked = false; return; }
        const checkedCount = Array.from(allCelebToggles).filter(toggle => toggle.checked).length;
        if (checkedCount === total) { selectAllInput.checked = true; } else { selectAllInput.checked = false; }
    }`;

export const TIMER_PART = `
    // --- TIMER LOGIC ---
    function startReloadTimer(minutes) {
        currentTimerTotalDuration = minutes * 60;
        if (activeTimerId) clearInterval(activeTimerId);
        let endTimeStr = sessionStorage.getItem(CONFIG.TIMER_END_TIME_KEY);
        let endTime;
        if (!endTimeStr) {
            endTime = Date.now() + currentTimerTotalDuration * 1000;
            sessionStorage.setItem(CONFIG.TIMER_END_TIME_KEY, endTime.toString());
            log(\`Hẹn giờ bắt đầu. Tải lại sau \${minutes} phút.\`, 'timer');
        } else {
            endTime = parseInt(endTimeStr, 10);
            log('Đã TIẾP TỤC đồng hồ đếm ngược', 'timer');
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
        if (activeTimerId) {
            clearInterval(activeTimerId); activeTimerId = null;
            log('Hẹn giờ đã bị hủy.', 'info');
            updateTimerUI();
        }
        sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
    }

    function executeTimerReset() {
        if (webLogObserver) clearInterval(webLogObserver);
        log('Hết giờ hẹn. Đang tải lại...', 'timer');
        localStorage.setItem(CONFIG.TIMER_RESTART_KEY, 'true');
        localStorage.setItem(CONFIG.AUTO_RELOAD_KEY, 'true');
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
        location.reload();
    }

    function showPreRunCountdown(callback) {
        const overlay = document.createElement('div');
        overlay.id = 'auto-celeb-pre-run-overlay';
        overlay.innerHTML = '<div id="auto-celeb-pre-run-modal"><h2>Tránh Lag</h2><p>Bắt đầu sau:</p><div id="auto-celeb-pre-run-timer">5</div></div>';
        document.body.appendChild(overlay);
        let countdown = 3;
        const interval = setInterval(() => {
            countdown--;
            const timerEl = document.getElementById('auto-celeb-pre-run-timer');
            if (timerEl) timerEl.textContent = countdown.toString();
            if (countdown <= 0) { clearInterval(interval); overlay.remove(); callback(); }
        }, 1000);
    }`;

export const CORE_PART = `
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
        try { webLogTextarea = await waitForElementById(webLogId, 10000, 250); } catch (e) { log(\`Web log \${webLogId} not found.\`, 'warn'); return; }

        log(\`Bắt đầu theo dõi nhật ký của \${celebId}...\`, 'info');
        let lastLogContent = "";

        webLogObserver = setInterval(() => {
            const currentScriptLog = document.getElementById('dashboard-script-log');
            const currentWebLog = document.getElementById(webLogId);
            if (!currentScriptLog || !currentWebLog) { clearInterval(webLogObserver); webLogObserver = null; return; }
            const newLogContent = currentWebLog.value;
            if (newLogContent !== lastLogContent) {
                const addedText = newLogContent.substring(lastLogContent.length);
                currentScriptLog.value += addedText;
                currentScriptLog.scrollTop = currentScriptLog.scrollHeight; // Auto scroll xuống
                lastLogContent = newLogContent;

                if (addedText.includes("Full! Still checking...")) {
                    handleChartLog();
                }

                if (addedText.includes(CONFIG.CONNECTION_LOST_TRIGGER_STRING)) {
                    incrementConnectionLostCount(); // Tăng số lần mất kết nối (Lỗi)
                    let counter = parseInt(sessionStorage.getItem(CONFIG.CONNECTION_LOST_COUNTER_KEY) || '0', 10) + 1;
                    sessionStorage.setItem(CONFIG.CONNECTION_LOST_COUNTER_KEY, String(counter));
                    log(\`Mất kết nối. Thử lại lần \${counter}/\${CONFIG.CONNECTION_LOST_MAX_RETRIES}.\`, 'warn');
                    
                    if (counter >= CONFIG.CONNECTION_LOST_MAX_RETRIES) {
                        incrementAutoResetCount(); // Tăng số lần auto reset (Reset)
                        sessionStorage.setItem(CONFIG.CONNECTION_LOST_COUNTER_KEY, '0'); // Reset counter về 0
                        localStorage.setItem(CONFIG.TIMER_RESTART_KEY, 'true');
                        localStorage.setItem(CONFIG.AUTO_RELOAD_KEY, 'true');
                        log('Mất kết nối quá nhiều. Đang tự động reset...', 'error');
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
        if (!state.isRunning) { log('Đã dừng quy trình.', 'info'); return; }

        if (celebIds.length === 0) {
            sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ ...state, finished: true }));
            updateControlButtonState({ isRunning: true });
            log('Đã xử lý hết danh sách.', 'success');
            runSentCount = totalCount;
            updateStatsDisplay();
            // Timer và Chart tiếp tục chạy cho đến khi người dùng ấn dừng
            return;
        }

        const currentId = celebIds.shift();
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [...celebIds], totalCount: totalCount }));
        runSentCount = totalCount - celebIds.length;
        
        updateChartDrawing();
        updateStatsDisplay();

        let parentElement;
        try { parentElement = await waitForElementById(currentId + '_parentElement', 180000, 500); }
        catch (error) { log(\`Không tìm thấy Container cho \${currentId}. Bỏ qua.\`, 'error'); await processNextCeleb(celebIds, totalCount); return; }

        const profileDiv = parentElement.closest('.profile');
        const button = profileDiv ? profileDiv.querySelector('button.showMoreBtn') : null;
        const name = profileDiv ? profileDiv.querySelector('.profile-name').textContent.trim() : currentId;
        const imgSrc = profileDiv ? profileDiv.querySelector('.profile-circle img').src : CONFIG.LOGO_URL;

        if (!button || !button.textContent.includes('Thêm bạn bè')) {
            log(\`Bỏ qua \${name}.\`);
            await processNextCeleb(celebIds, totalCount);
            return;
        }

        log(\`Đang xử lý: \${name}\`);
        showCelebPopup(name, \`(\${runSentCount}/\${totalCount})\`);
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
                log(\`Đã xong celeb cuối: \${name}.\`, 'success');
                startRealtimeLogObserver(currentId);
                sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [], totalCount: totalCount, finished: true }));
                updateControlButtonState({ isRunning: true });
                // Timer và Chart tiếp tục chạy cho đến khi người dùng ấn dừng
            } else {
                const toolsLink = document.querySelector('a.nav-link[href="celebrity.html"]');
                if (toolsLink) {
                    localStorage.setItem(CONFIG.AUTO_RELOAD_KEY, 'true'); // Đánh dấu công cụ tự chuyển trang
                    toolsLink.click();
                }
                else { log('Celeb Tools link not found.', 'error'); stopProcess(false); }
            }
        } else {
            log(\`Không thấy nút Start cho \${name}.\`, 'error');
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
            runConnectionLostCount = parseInt(localStorage.getItem('autoCelebConnectionLostCount') || '0', 10);
            runAutoResetCount = parseInt(localStorage.getItem('autoCelebAutoResetCount') || '0', 10);
            runStartTime = parseInt(sessionStorage.getItem('autoCelebRunStartTime') || Date.now().toString(), 10);
            updateProcessedCelebsDisplay();
            updateStatsDisplay();
            
            startChartLoop();
            
            if (runTimerInterval) clearInterval(runTimerInterval);
            runTimerInterval = setInterval(updateRunTimer, 1000);
        } else {
            listWrapper.innerHTML = \`
                <div class="celeb-list-header"><h3>Danh Sách Celebrity</h3><button id="celeb-refresh-button" class="celeb-refresh-button"><span class="refresh-icon">⟳</span> Làm mới</button></div>
                <div id="celeb-select-all-label"><div id="celeb-select-all-info"><span id="celeb-select-all-text">Chọn tất cả</span><span id="celeb-selected-count">...</span></div><div class="toggle-switch select-all-toggle"><input type="checkbox" id="celeb-select-all-input" class="toggle-switch-input sr-only" checked><label for="celeb-select-all-input" class="toggle-switch-label"><span class="toggle-switch-handle"></span></label></div></div>
                <div id="celeb-selection-list"><p>Đang quét...</p></div>
            \`;
            const listContainer = document.getElementById('celeb-selection-list');
            const selectAllInput = document.getElementById('celeb-select-all-input');
            const selectAllContainer = document.getElementById('celeb-select-all-label');
            const countEl = document.getElementById('celeb-selected-count');

            const updateCount = () => {
                if (!countEl) return;
                const toggles = document.querySelectorAll('.celeb-item-toggle-input');
                const selected = Array.from(toggles).filter(toggle => toggle.checked).length;
                countEl.textContent = \`Đã chọn \${selected}/\${toggles.length} Celeb\`;
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
                if (!list.length) { listContainer.innerHTML = refresh ? '<p>Đang quét lại...</p>' : '<p>Đang chờ...</p>'; return false; }
                listContainer.innerHTML = '';
                selectAllInput.checked = true;
                list.forEach(c => {
                    const item = document.createElement('div');
                    item.className = 'celeb-list-item-new selected';
                    item.innerHTML = \`
                        <div class="celeb-list-item-main"><div class="celeb-list-profile-image"><img src="\${c.imgSrc}"><div class="celeb-list-icon">✦</div></div><div class="celeb-list-profile-info"><div class="celeb-list-profile-name">\${c.name}</div><div class="celeb-list-progress"><div class="celeb-list-progress-bar" style="width:\${c.percent}%; background:\${c.progressColor}"></div></div><div class="celeb-list-progress-text">\${c.progressText}</div></div></div>
                        <div class="celeb-item-toggle-wrapper toggle-switch"><input type="checkbox" value="\${c.id}" class="celeb-item-toggle-input toggle-switch-input sr-only" checked><label class="toggle-switch-label"><span class="toggle-switch-handle"></span></label></div>
                    \`;
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
            if (refBtn) refBtn.onclick = (e) => { e.preventDefault(); refBtn.disabled = true; listContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;">Đang làm mới...</div>'; retryLoop(true); setTimeout(() => refBtn.disabled = false, 1500); };

            if (!renderList()) retryLoop();
        }

        loadTimerConfig();
        updateControlButtonState(state);
        modal.style.display = 'block';
    }

    function startProcessFromModal() {
        const selected = document.querySelectorAll('.celeb-item-toggle-input:checked');
        const ids = Array.from(selected).map(c => c.value);
        if (!ids.length) { log('Chưa chọn celeb nào.', 'error'); return; }

        sessionStorage.removeItem(CONFIG.LOG_STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);
        
        chartDataPoints = new Array(40).fill(2.5);
        sessionStorage.setItem(CONFIG.CHART_DATA_KEY, JSON.stringify(chartDataPoints));
        
        processedCelebs = [];
        runConnectionLostCount = 0; runSentCount = 0; runAutoResetCount = 0;
        runStartTime = Date.now();
        sessionStorage.setItem('autoCelebRunStartTime', runStartTime.toString());
        localStorage.setItem('autoCelebConnectionLostCount', '0');
        localStorage.setItem('autoCelebAutoResetCount', '0');
        isTabActive = true;

        if (runTimerInterval) clearInterval(runTimerInterval);
        runTimerInterval = setInterval(updateRunTimer, 1000);
        
        startChartLoop();

        showRunningView();
        updateStatsDisplay();
        log('Bắt đầu...', 'rocket');

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
        
        sessionStorage.removeItem(CONFIG.CHART_DATA_KEY);
        stopChartLoop();

        if (runTimerInterval) clearInterval(runTimerInterval);

        log('Người dùng đã dừng. Đang tải lại...', 'info');
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
            startBtn.textContent = 'Bắt đầu Lặp'; startBtn.classList.remove('running'); select.disabled = false;
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
            startBtn.textContent = 'Dừng Lặp'; startBtn.classList.add('running'); select.disabled = true;
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
    }`;

export const MAIN_PART = `
    // --- MAIN EXECUTION ---
    (function main() {
        console.log(\`[Auto Locket Celeb] ➡️ Đã kích hoạt (\${CONFIG.SCRIPT_VERSION}).\`);
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

                let state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                const restartT = localStorage.getItem(CONFIG.TIMER_RESTART_KEY) === 'true';
                const restartC = localStorage.getItem(CONFIG.CELEB_RESTART_KEY) === 'true';
                const autoReload = localStorage.getItem(CONFIG.AUTO_RELOAD_KEY) === 'true';

                // Xóa flag auto reload sau khi đọc
                localStorage.removeItem(CONFIG.AUTO_RELOAD_KEY);

                // Kiểm tra xem có phải F5/reload thực sự không
                const navEntries = performance.getEntriesByType('navigation');
                const isRealReload = navEntries.length > 0 && navEntries[0].type === 'reload';

                // Nếu F5 thủ công (reload thực sự, không phải do timer/celeb restart, không phải auto reload), reset state
                if (state.isRunning && !restartT && !restartC && !autoReload && isRealReload) {
                    log('Phát hiện F5 thủ công. Đang reset công cụ...', 'info');
                    sessionStorage.removeItem(CONFIG.STORAGE_KEY);
                    sessionStorage.removeItem(CONFIG.LOG_STORAGE_KEY);
                    sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);
                    sessionStorage.removeItem(CONFIG.PROCESSED_CELEBS_KEY);
                    sessionStorage.removeItem('autoCelebRunStartTime');
                    sessionStorage.removeItem(CONFIG.CHART_DATA_KEY);
                    sessionStorage.removeItem('autoCelebOriginalList');
                    localStorage.removeItem('autoCelebConnectionLostCount');
                    localStorage.removeItem('autoCelebAutoResetCount');
                    state = {}; // Reset state variable
                }

                updateControlButtonState(state);

                if (state.isRunning && openBtn) {
                     openBtn.textContent = 'Đóng Bảng Điều Khiển';
                     openBtn.classList.add('close-mode');
                }

                if (restartT) {
                    log('Phát hiện khởi động lại do hẹn giờ.', 'timer');
                    localStorage.removeItem(CONFIG.TIMER_RESTART_KEY); localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
                    showPreRunCountdown(() => {
                        openDashboardModal();
                        if (openBtn) { openBtn.textContent = 'Đóng Bảng Điều Khiển'; openBtn.classList.add('close-mode'); }
                        startProcessFromModal();
                    });
                } else if (restartC) {
                    log('Phát hiện reset celeb.', 'warn');
                    localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
                    const last = findLastCelebId();
                    if (last && state.isRunning) {
                        log(\`Thử lại celeb cuối: \${last}\`);
                        state.finished = false; state.celebIds = [last];
                        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
                    }
                }

                if (state.isRunning) {
                    log('Đang khôi phục quy trình...', 'info');
                    openDashboardModal();
                    if (openBtn) { openBtn.textContent = 'Đóng Bảng Điều Khiển'; openBtn.classList.add('close-mode'); }

                    if (currentTimerConfig.enabled) startReloadTimer(currentTimerConfig.minutes);
                    if (!state.finished && state.celebIds.length > 0) {
                        const storedProc = sessionStorage.getItem(CONFIG.PROCESSED_CELEBS_KEY);
                        processedCelebs = storedProc ? JSON.parse(storedProc) : [];
                        processNextCeleb(state.celebIds, state.totalCount);
                    } else if (state.finished) {
                        const last = findLastCelebId();
                        if (last && !webLogObserver) startRealtimeLogObserver(last);
                    }
                    
                    startChartLoop();
                }
            } catch (e) {
                log('Khởi tạo thất bại. Đang tải lại...', 'error');
                localStorage.setItem(CONFIG.AUTO_RELOAD_KEY, 'true');
                location.reload();
            }
        }
    })();`;

export const WRAPPER_END = `})();`;