// ==UserScript==
// @name         Auto Locket Celeb (v1.4)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Tự động kết bạn với tất cả Celeb, thống kê tài khoản.
// @author       Huy Vũ
// @match        https://locket.binhake.dev/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      open.oapi.vn
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @icon         https://i.imgur.com/AM2f24N.png
// ==/UserScript==
(function() {
    'use strict';

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
        CONNECTION_LOST_COUNTER_KEY: 'autoCelebConnectionLostCounter',
        CONNECTION_LOST_TRIGGER_STRING: "The connection was suddenly lost. Reconnecting after 5 second...",

        CELEB_RESTART_KEY: 'autoCelebCelebRestart',
        AUTO_RELOAD_KEY: 'autoCelebAutoReload', // Flag đánh dấu công cụ tự reload
        PROCESSED_CELEBS_KEY: 'autoCelebProcessedCelebs_v1',

        KEY_STORAGE_KEY: 'autoCelebKeyValidated_v1',
        COLLAPSE_STATE_KEY: 'autoCelebCollapseState_v1',
        RUN_STATS_KEY: 'autoCelebRunStats_v1',
        CONNECTION_LOST_MAX_RETRIES: 5,
        MESSENGER_LINK: 'https://www.messenger.com/c/655145337208323/', // Link Messenger hỗ trợ

        SCRIPT_VERSION: 'v1.4',
        API_URL: 'https://script.google.com/macros/s/AKfycbyKuzSQkkCn4J92u4OSvE-LiMTWBEbWxsUj_aETIg_dLZbkR0bQjeRPKE7xr5oX7ePZYQ/exec?sheet=quanly',
        API_CELEB_URL: 'https://script.google.com/macros/s/AKfycbyKuzSQkkCn4J92u4OSvE-LiMTWBEbWxsUj_aETIg_dLZbkR0bQjeRPKE7xr5oX7ePZYQ/exec?sheet=celeb',
        API_CACHE_DURATION_MS: 5 * 60 * 1000, // 5 phút
        get DISPLAY_VERSION() { return `Premium v${this.SCRIPT_VERSION.replace('v', '')}`; }, // Version hiển thị trên Badge
        UPDATE_URL: 'https://raw.githubusercontent.com/huyvu2512/locket-celebrity/main/script/tampermonkey.user.js'
    };

    const CELEB_LIST = [
        { name: 'SZA & MoRuf', uid: 'szamoruf_1', imgSrc: 'https://storage.googleapis.com/locket-public/celebrity/szamoruf_1/preview_1.jpg' },
        { name: 'Locket HQ 💛', uid: 'locket.hq', imgSrc: 'https://storage.googleapis.com/locket-public/celebrity/locket.hq/preview_1.jpg' }
    ];

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
    let runSuccessCount = 0; // Số lượng thành công
    let successfulCelebIds = new Set(); // Set lưu ID các celeb đã thành công
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

    let backgroundApiCheckInterval = null;
    let celebScanRetryInterval = null;
    let infoPanelScanInterval = null;
    let knownCelebStatuses = {}; // Cache để lưu trạng thái của celeb, chống lại việc UI bị re-render

// --- BIẾN CACHE CHO BẢNG THỐNG KÊ KHI CHẠY AUTO ---
let cachedPendingCelebs = null;
let cachedOtherCelebsData = null; // Cache for the "Others" tab data

    // --- UI & Logging ---

    function getTimestamp() {
        const now = new Date();
        const date = [now.getDate().toString().padStart(2, '0'), (now.getMonth() + 1).toString().padStart(2, '0'), now.getFullYear()];
        const time = [now.getHours().toString().padStart(2, '0'), now.getMinutes().toString().padStart(2, '0'), now.getSeconds().toString().padStart(2, '0')];
        return `[${date.join('/')} ${time.join(':')}]`;
    }

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
                'Bắt đầu theo dõi nhật ký của', 'Tiếp tục xử lý danh sách celeb...', 'Vui lòng nhập username để bắt đầu lặp.',
                'Phát hiện F5 thủ công. Đang reset công cụ...',
                'Đang khôi phục quy trình...',
                'Đã mở rộng toàn bộ danh sách celeb.',
                // Lọc các log chi tiết của quá trình auto celeb
                'Bắt đầu...',
                'Bắt đầu quy trình Full-Auto cho',
                'Giai đoạn 1: Mở rộng tất cả các thẻ',
                'Mở rộng thẻ cho:',
                'Hoàn tất Giai đoạn 1.',
                'Giai đoạn 2: Bắt đầu gửi yêu cầu',
                'Đang xử lý:',
                'Click "Bắt đầu" cho',
                'Hoàn tất Giai đoạn 2.',
                'Sử dụng dữ liệu từ cache',
                'Hệ thống đã tạm dừng (phát hiện ngầm). Đang khóa công cụ...',
                'Đã lưu trạng thái "Hàng chờ" trước khi chạy.',
                'Đã xóa cache trạng thái "Hàng chờ".',
                'Người dùng đã dừng. Đang tải lại...',
                'Chưa chọn celeb nào.'
            ];

            const isFiltered = filteredMessages.some(filter => message.includes(filter));
            const timestamp = getTimestamp();
            const logMessage = `${timestamp} ${message}\n`;
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
        if (!window.location.href.startsWith(CONFIG.TARGET_PAGE)) return;
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

    function saveRunStats() {
        const stats = {
            sent: runSentCount,
            success: runSuccessCount,
            connectionLost: runConnectionLostCount,
            reset: runAutoResetCount,
            startTime: runStartTime,
            successfulIds: Array.from(successfulCelebIds) // Convert Set to Array for JSON
        };
        localStorage.setItem(CONFIG.RUN_STATS_KEY, JSON.stringify(stats));
    }

    function loadRunStats() {
        const statsStr = localStorage.getItem(CONFIG.RUN_STATS_KEY);
        if (statsStr) {
            const stats = JSON.parse(statsStr);
            runSentCount = stats.sent || 0;
            runSuccessCount = stats.success || 0;
            runConnectionLostCount = stats.connectionLost || 0;
            runAutoResetCount = stats.reset || 0;
            runStartTime = stats.startTime || Date.now();
            successfulCelebIds = new Set(stats.successfulIds || []);
            return true;
        }
        return false;
    }

    function clearRunStats() {
        localStorage.removeItem(CONFIG.RUN_STATS_KEY);
    }

    function formatTimeWithHours(totalSeconds) {
        const absSeconds = Math.abs(totalSeconds);
        const hours = Math.floor(absSeconds / 3600);
        const minutes = Math.floor((absSeconds % 3600) / 60);
        const seconds = Math.floor(absSeconds % 60);
        const sign = totalSeconds < 0 ? '-' : '';
        return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    function compareVersions(v1, v2) {
        const parts1 = (v1 || '0').replace('v', '').split('.').map(p => parseInt(p.match(/\d+/)?.[0] || '0', 10));
        const parts2 = (v2 || '0').replace('v', '').split('.').map(p => parseInt(p.match(/\d+/)?.[0] || '0', 10));
        const len = Math.max(parts1.length, parts2.length);
        for (let i = 0; i < len; i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    function fetchUrl(url, cacheKey, isBackgroundRefresh = false, forceRefresh = false) {
        return new Promise((resolve, reject) => {
            if (!forceRefresh) {
                try {
                    const cachedItem = sessionStorage.getItem(cacheKey);
                    if (cachedItem) {
                        const { timestamp, data } = JSON.parse(cachedItem);
                        if (Date.now() - timestamp < CONFIG.API_CACHE_DURATION_MS) {
                            if (!isBackgroundRefresh) {
                                log(`Sử dụng dữ liệu từ cache (${cacheKey}).`, 'info');
                            }
                            return resolve(data);
                        }
                    }
                } catch (e) {
                    console.error(`[Auto Locket Celeb] Lỗi khi đọc cache ${cacheKey}:`, e);
                    sessionStorage.removeItem(cacheKey); // Xóa cache bị lỗi
                }
            }

            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                anonymous: true,
                timeout: 15000, // Thêm timeout 15 giây để tránh treo
                onload: function(response) {
                    try {
                        // Kiểm tra xem phản hồi có phải là trang đăng nhập của Google không
                        if (response.responseText && !response.responseText.includes('<title>Google Accounts</title>')) {
                            const responseData = JSON.parse(response.responseText);
                            let dataPayload;

                            if (responseData && typeof responseData === 'object' && !Array.isArray(responseData) && responseData.success === true) {
                                dataPayload = responseData.data;
                            } else if (Array.isArray(responseData)) {
                                dataPayload = responseData;
                            } else {
                                console.error('[Auto Locket Celeb] API response format not recognized. Response:', response.responseText);
                                reject(new Error(responseData.error || 'Định dạng phản hồi API không nhận dạng được.'));
                                return;
                            }

                            if (!Array.isArray(dataPayload)) {
                                console.error('[Auto Locket Celeb] API data payload is not an array. Payload:', dataPayload);
                                reject(new Error('Dữ liệu API trả về không phải là một mảng.'));
                                return;
                            }

                            const dataToCache = { timestamp: Date.now(), data: dataPayload };
                                sessionStorage.setItem(cacheKey, JSON.stringify(dataToCache));
                                if (isBackgroundRefresh) {
                                    if (forceRefresh) {
                                         console.log(`[Auto Locket Celeb] Cache ${cacheKey} refreshed by background check.`);
                                    } else {
                                         console.log(`[Auto Locket Celeb] Cache ${cacheKey} đã được làm mới trong nền.`);
                                    }
                                }
                            resolve(dataPayload);
                        } else {
                            // Google đã trả về trang đăng nhập hoặc lỗi HTML khác
                            console.error('[Auto Locket Celeb] API did not return JSON. It might be a Google redirect. Response Text:', response.responseText);
                            reject(new Error('Lỗi API: Bị chuyển hướng tới trang đăng nhập Google. Hãy thử đăng nhập lại tài khoản Google chính trên trình duyệt.'));
                        }
                    } catch (e) {
                        console.error('[Auto Locket Celeb] Failed to parse API response. Error:', e, 'Response Text:', response.responseText);
                        reject(new Error(`Lỗi phân tích phản hồi API: ${e.message}. Vui lòng kiểm tra console để xem chi tiết.`));
                    }
                },
                onerror: function(response) {
                    console.error('[Auto Locket Celeb] Network error during API fetch.', response);
                    reject(new Error('Lỗi mạng khi gọi API. Vui lòng kiểm tra kết nối internet.'));
                },
                ontimeout: function() {
                    console.error('[Auto Locket Celeb] API request timed out.');
                    reject(new Error('Yêu cầu API quá hạn. Vui lòng thử lại.'));
                }
            });
        });
    }

    function fetchApiData(isBackgroundRefresh = false, forceRefresh = false) {
        return fetchUrl(CONFIG.API_URL, 'autoCelebApiCache_v1', isBackgroundRefresh, forceRefresh);
    }

    function fetchCelebData(forceRefresh = false) {
        return fetchUrl(CONFIG.API_CELEB_URL, 'autoCelebOtherCelebsCache_v1', false, forceRefresh);
    }


    function waitForElementById(elementId, timeout = 180000, interval = 500) {
        return new Promise((resolve, reject) => {
            let elapsedTime = 0;
            const check = () => {
                const element = document.getElementById(elementId);
                if (element) { resolve(element); } else {
                    elapsedTime += interval;
                    if (elapsedTime >= timeout) { log(`Hết thời gian chờ element ID: ${elementId}`, 'error'); reject(new Error(`Timeout waiting for element ID: ${elementId}`)); }
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
            let timeoutId = setTimeout(() => { clearInterval(interval); reject(new Error(`Timeout waiting for ${selector}`)); }, timeout);
        });
    }


    function injectNewStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* ... (CSS Chung) ... */

            /* Tắt viền focus (viền trắng) mặc định của trình duyệt cho toàn bộ script */
            #auto-celeb-main-container *:focus,
            #auto-celeb-modal-overlay *:focus,
            #celeb-dashboard-modal *:focus,
            .auto-celeb-modal *:focus {
                outline: none;
                -webkit-tap-highlight-color: transparent; /* Tắt highlight khi chạm trên mobile */
            }

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
            .auto-celeb-modal *::-webkit-scrollbar-thumb { background: rgba(244, 114, 182, 0.6); border-radius: 3px; }

            #auto-celeb-main-container *::-webkit-scrollbar-thumb:hover,
            #auto-celeb-modal-overlay *::-webkit-scrollbar-thumb:hover,
            #celeb-dashboard-modal *::-webkit-scrollbar-thumb:hover,
            .auto-celeb-modal *::-webkit-scrollbar-thumb:hover { background: rgba(244, 114, 182, 0.9); }

            #auto-celeb-main-container *,
            #auto-celeb-modal-overlay *,
            #celeb-dashboard-modal *,
            .auto-celeb-modal * { scrollbar-width: thin; scrollbar-color: rgba(244, 114, 182, 0.6) rgba(255,255,255,0.05); }

            #auto-celeb-main-container {
                position: fixed; z-index: 9999; display: flex; flex-direction: column; gap: 16px;
                width: min(350px, calc(100vw - 32px));
                max-width: calc(100vw - 32px);
                min-width: 280px;
                font-family: 'Inter', 'Poppins', 'Segoe UI', sans-serif;
                background: rgba(5,5,5,0.92); backdrop-filter: blur(30px);
                border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 25px 80px rgba(0,0,0,0.55);
                border-radius: 36px; padding: 22px 24px 26px; top: 80px; left: 20px; right: auto; bottom: auto;
                max-height: 90vh; overflow: visible;
                transition: max-height 0.3s ease, padding-top 0.3s ease, padding-bottom 0.3s ease, box-shadow 0.3s, left 0.3s ease;
            }
            #auto-celeb-main-container::before,
            #auto-celeb-main-container::after {
                content: '';
                position: absolute;
                z-index: 0;
                filter: blur(80px);
                opacity: 0.4;
                pointer-events: none;
            }
            #auto-celeb-main-container::before {
                width: 280px; height: 280px;
                top: -120px; left: -120px;
                background: radial-gradient(circle at center, rgba(236,72,153,0.55), transparent 70%);
            }
            #auto-celeb-main-container::after {
                width: 240px; height: 240px;
                bottom: -100px; right: -60px;
                background: radial-gradient(circle at center, rgba(59,130,246,0.45), transparent 70%);
            }
            .lc-ambient-glow {
                position: absolute;
                pointer-events: none;
                filter: blur(100px);
                opacity: 0.35;
                z-index: 0;
            }
            .lc-ambient-glow.glow-top {
                width: 220px; height: 220px;
                top: -80px; left: -60px;
                background: radial-gradient(circle, rgba(244,114,182,0.5), transparent 70%);
            }
            .lc-ambient-glow.glow-bottom {
                width: 200px; height: 200px;
                bottom: -70px; right: -40px;
                background: radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%);
            }
            #auto-celeb-main-container > *:not(.lc-ambient-glow) {
                position: relative;
                z-index: 1;
            }

            /* --- UPDATED HEADER STYLES --- */
            #auto-celeb-popup-header {
                display: flex; align-items: center;
                border-bottom: none; padding: 12px 18px;
                margin-bottom: 6px; cursor: pointer; position: relative;
                background: linear-gradient(135deg, rgba(9,9,11,0.95), rgba(24,24,27,0.95));
                border-radius: 999px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.4);
                gap: 16px;
                width: 100%;
            }
            #auto-celeb-header-content {
                display: flex; align-items: center; gap: 16px; flex-grow: 1;
            }
            #auto-celeb-title-icon {
                width: 52px; height: 52px; border-radius: 20px;
                position: relative; display: flex; align-items: center; justify-content: center;
                box-shadow: 0 12px 30px rgba(0,0,0,0.6); border: none;
                overflow: hidden;
                padding: 0;
            }
            #auto-celeb-logo-image {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 20px;
            }
            #auto-celeb-title-icon::before {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, rgba(236,72,153,0.4), transparent);
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            #auto-celeb-header-content:hover #auto-celeb-title-icon::before { opacity: 1; }
            #auto-celeb-title-icon svg {
                width: 26px; height: 26px;
                color: #fb7185;
                filter: drop-shadow(0 0 8px rgba(251,113,133,0.4));
            }
            #auto-celeb-title-info {
                display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 4px;
            }
            .lc-name-row {
                display: flex; align-items: center; gap: 6px;
            }
            #auto-celeb-app-name {
                font-size: 19px; font-weight: 800; color: white; line-height: 1.1;
                letter-spacing: -0.4px; font-family: 'Inter', sans-serif;
                background: linear-gradient(90deg, #fff, #ffe4f1, #cbd5f5);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .lc-name-row svg {
                width: 16px; height: 16px;
                color: #71717a;
                transition: color 0.3s;
            }
            #auto-celeb-header-content:hover .lc-name-row svg { color: #f472b6; }
            #auto-celeb-version-badge {
                display: inline-flex; align-items: center; gap: 6px;
                font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
                text-transform: uppercase; padding: 2px 10px;
                border-radius: 999px; color: #f9a8d4;
                background: linear-gradient(to right, rgba(244, 63, 94, 0.1), rgba(236, 72, 153, 0.1));
                border: 1px solid rgba(244, 63, 94, 0.2);
            }
            .lc-premium-icon {
                width: 12px; height: 12px; color: #f9a8d4;
            }
            #auto-celeb-main-container.collapsed {
                max-height: 70px;
                padding: 12px 18px;
                gap: 0;
                background: transparent;
                border: none;
                box-shadow: none;
                backdrop-filter: none;
            }
            #auto-celeb-main-container.collapsed #auto-celeb-popup-header {
                margin: 0;
                width: 100%;
                max-width: 330px;
                padding: 10px 18px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 20px rgba(0,0,0,0.35);
            }
            #auto-celeb-main-container.collapsed #auto-celeb-header-content { flex-grow: 1; }
            #auto-celeb-main-container.collapsed > *:not(#auto-celeb-popup-header) { display: none !important; }
            #auto-celeb-main-container.collapsed .lc-ambient-glow { display: none; }
            #auto-celeb-main-container.collapsed::before,
            #auto-celeb-main-container.collapsed::after { display: none; }

            /* Modern Segmented Control Style */
            #auto-celeb-tab-nav {
                display: flex;
                position: relative;
                background: #09090b; /* Very dark container */
                padding: 4px;
                border-radius: 999px;
                margin-bottom: 12px;
                margin-top: 0;
                border: 1px solid rgba(255,255,255,0.08);
                gap: 0;
                overflow: hidden;
            }
            .nav-tab {
                flex: 1;
                position: relative;
                z-index: 2;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 9px 0;
                color: #8e8e93;
                font-weight: 600;
                font-size: 14px;
                text-decoration: none;
                cursor: pointer;
                border-radius: 999px;
                transition: color 0.4s ease;
                background: transparent;
                border: none;
            }
            .nav-tab:hover { text-decoration: none; color: #ffffff; }
            .nav-tab.active { color: #ffffff; }
            .nav-tab-icon {
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: inherit;
            }

            #nav-glider {
                position: absolute;
                top: 4px; bottom: 4px; left: 4px;
                width: calc(50% - 4px);
                background: linear-gradient(135deg, #27272a, #1c1c1f);
                border-radius: 999px;
                z-index: 1;
                transition: transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            }
            #nav-glider.pos-left { transform: translateX(0%); }
            #nav-glider.pos-right { transform: translateX(100%); }
            #tab-friend-tools:hover ~ #nav-glider { transform: translateX(0%) !important; }
            #tab-celeb-tools:hover ~ #nav-glider { transform: translateX(100%) !important; }

            #auto-celeb-main-container.locked #auto-celeb-tab-nav,
            #auto-celeb-main-container.locked #auto-celeb-actions-wrapper,
            #auto-celeb-main-container.locked #auto-friend-tool-wrapper,
            #auto-celeb-main-container.locked #auto-celeb-redirect-notice,
            #auto-celeb-main-container.locked #auto-celeb-login-notice { display: none; }
            #auto-celeb-main-container.locked #auto-celeb-footer-buttons { display: none; }
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

            /* --- IOS SETTINGS LIST STYLE BUTTONS (UPDATED) --- */
            #auto-celeb-actions-wrapper {
                display: flex;
                flex-direction: column;
                gap: 14px;
                margin-top: 6px;
            }

            .auto-celeb-action-btn {
                width: 100%;
                padding: 16px 18px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(17, 17, 20, 0.85);
                display: flex;
                align-items: center;
                text-decoration: none;
                margin: 0;
                border-radius: 22px;
                justify-content: space-between;
                cursor: pointer;
                position: relative;
                overflow: hidden;
                min-height: 74px;
                transition: transform 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease, background 0.35s ease;
            }
            .auto-celeb-action-btn::before {
                content: '';
                position: absolute;
                inset: 0;
                opacity: 0;
                transition: opacity 0.4s ease;
                background: linear-gradient(120deg, rgba(255,255,255,0.08), transparent);
            }
            .auto-celeb-action-btn:hover::before { opacity: 1; }
            .auto-celeb-action-btn:hover {
                transform: translateY(-2px) scale(1.01);
                border-color: rgba(255,255,255,0.12);
                box-shadow: 0 20px 45px rgba(0,0,0,0.4);
            }
            .auto-celeb-action-btn.close-mode {
                border-color: rgba(236,72,153,0.6);
                box-shadow: 0 0 25px rgba(236,72,153,0.25), inset 0 0 15px rgba(236,72,153,0.15);
                background:
                    radial-gradient(circle at top left, rgba(236,72,153,0.25), transparent 55%),
                    radial-gradient(circle at top right, rgba(244,114,182,0.25), transparent 55%),
                    radial-gradient(circle at bottom left, rgba(147,51,234,0.25), transparent 55%),
                    radial-gradient(circle at bottom right, rgba(139,92,246,0.25), transparent 55%),
                    rgba(26, 9, 23, 0.7);
                animation: pulse-close 1.6s ease-in-out infinite;
            }
            .auto-celeb-action-btn.close-mode .action-btn-chevron-circle {
                background: rgba(236,72,153,0.25);
                border-color: rgba(236,72,153,0.6);
                color: #f472b6;
            }
            .auto-celeb-action-btn.close-mode .action-btn-label {
                color: #fbcfe8;
            }
            .auto-celeb-action-btn.close-mode .action-btn-subtitle {
                color: #f8a9d4;
            }
            @keyframes pulse-close {
                0%, 100% { box-shadow: 0 0 25px rgba(236,72,153,0.25); }
                50% { box-shadow: 0 0 40px rgba(236,72,153,0.45); }
            }
            .auto-celeb-action-btn.card-indigo {
                background: rgba(99,102,241,0.08);
            }
            .auto-celeb-action-btn.card-rose {
                background: rgba(244,63,94,0.08);
            }

            .action-btn-icon-wrapper {
                width: 44px;
                height: 44px;
                border-radius: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 16px;
                flex-shrink: 0;
                position: relative;
                overflow: hidden;
                transition: transform 0.3s ease;
                overflow: hidden;
                /* Áp dụng viền gradient giống bảng thống kê - Đã sửa lại */
                border: 2px solid transparent;
                background-clip: padding-box;
                padding: 2px;
                width: 52px; /* Đồng bộ kích thước */
                height: 52px; /* Đồng bộ kích thước */
            }
            .auto-celeb-action-btn:hover .action-btn-icon-wrapper { transform: scale(1.08); }

            .icon-dashboard-bg {
                background: linear-gradient(#141216, #141216) padding-box, linear-gradient(135deg, #f472b6, #8b5cf6) border-box;
                border-radius: 16px; /* Thêm border-radius cho background */
            }
            .icon-stats-bg {
                background: linear-gradient(#141216, #141216) padding-box, linear-gradient(135deg, #f472b6, #8b5cf6) border-box;
                border-radius: 16px; /* Thêm border-radius cho background */
            }
            .action-btn-icon-wrapper::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(180deg, rgba(255,255,255,0.3), transparent);
                opacity: 0.6;
            }
            .action-btn-icon-wrapper svg {
                width: 24px; height: 24px; color: white;
                position: relative; z-index: 1; /* Đảm bảo icon SVG nằm trên nền */
            }

            .action-btn-content {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: flex-start;
                text-align: left;
                min-width: 0;
            }
            .action-btn-main {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .action-btn-label {
                font-size: 14px;
                color: white;
                font-weight: 700;
                margin-bottom: 2px;
                display: block;
                letter-spacing: 0.05px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                width: 100%;
            }

            .action-btn-subtitle {
                font-size: 11px;
                color: #a1a1aa;
                font-weight: 500;
                display: block;
            }

            .action-btn-chevron-circle {
                width: 34px;
                height: 34px;
                border-radius: 50%;
                background: rgba(15,15,15,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                margin-left: 10px;
                flex-shrink: 0;
                border: 1px solid rgba(255, 255, 255, 0.06);
                transition: background-color 0.3s, color 0.3s, transform 0.3s;
            }
            .auto-celeb-action-btn:hover .action-btn-chevron-circle {
                background: rgba(255,255,255,0.08);
                border-color: rgba(255,255,255,0.2);
                transform: translateX(4px);
            }

            .action-btn-chevron {
                width: 20px; height: 20px; color: #a1a1aa; transition: transform 0.3s;
            }
            .auto-celeb-action-btn:hover .action-btn-chevron { transform: translateX(4px); color: #fff; }
            /* --- END IOS STYLE --- */

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
            #auto-friend-tool-wrapper .celeb-list-item-new {
                transition: opacity 0.3s ease, transform 0.3s ease;
            }
            /* Khi di chuột vào một mục, nó sẽ sáng lên và phóng to nhẹ */
            #auto-friend-tool-wrapper .celeb-list-item-new:hover {
                background: rgba(24,24,27,0.95);
                transform: scale(1.02);
            }
            .friend-tool-start-btn {
                flex-shrink: 0; width: 44px; height: 44px; border-radius: 14px;
                border: 1px solid rgba(255,255,255,0.1); cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255,255,255,0.05);
                transition: all 0.25s ease;
            }
            .friend-tool-start-btn:hover {
                background: rgba(255,255,255,0.1);
                border-color: #8b5cf6;
                transform: scale(1.1);
            }
            .friend-tool-start-btn svg { width: 20px; height: 20px; color: #a7a7a7; transition: color 0.25s ease; }
            .friend-tool-start-btn:hover svg { color: #c4b5fd; }
            .friend-tool-start-btn.running {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                border-color: transparent;
                box-shadow: 0 6px 20px rgba(239,68,68,0.4);
                animation: pulse-close 1.6s ease-in-out infinite;
            }
            .friend-tool-start-btn.running svg { color: white; }
            .friend-tool-start-btn.disabled {
                background: #3f3f46;
                border-color: #52525b;
                cursor: not-allowed;
            }
            .celeb-list-item-new.disabled { opacity: 0.4; pointer-events: none; filter: saturate(0); }
            .celeb-list-item-new.running-celeb { border-color: rgba(239,68,68,0.5); }

            #auto-celeb-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); backdrop-filter: blur(5px); z-index: 10003;
            }
            .auto-celeb-modal {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) !important;
                background: #2c2c2e; color: white; border-radius: 14px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 10004;
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
                filter: drop-shadow(0 0 5px #f472b6);
            }
            .chart-tooltip {
                position: absolute; background: rgba(0, 0, 0, 0.92);
                border: 1px solid #f472b6; padding: 8px 12px;
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
                padding: 10px 15px;
            }
            #running-stats-container p {
                font-size: 14px; color: #eee; margin: 5px 0; display: flex; justify-content: space-between;
            }
            #running-stats-container p strong { color: #aaa; font-weight: 600; }
            #running-stats-container p span {
                font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #f59e0b;
            }
            #running-stats-container p #stat-sent { color: #f9a8d4; }
            #running-stats-container p #stat-time { color: #22c55e; }
            #running-stats-container p #stat-error { color: #ef4444; }

            #processed-celebs-container, #success-celebs-container {
                flex-shrink: 0; background: rgba(0,0,0,0.2);
                border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
                padding: 10px 15px;
                display: flex; flex-direction: column;
                overflow: hidden; /* Ngăn container bị kéo dài bởi nội dung, buộc list bên trong phải scroll */
            }
            #processed-celebs-container p, #success-celebs-container p {
                font-size: 14px; color: #eee; margin: 0 0 10px 0; font-weight: 600;
            }
            #processed-celebs-list, #success-celebs-list {
                display: flex; flex-wrap: nowrap; gap: 4px; align-items: center;
                overflow-x: auto; overflow-y: hidden;
                padding-bottom: 5px;
                cursor: grab; user-select: none;
            }
            #processed-celebs-list.dragging, #success-celebs-list.dragging { cursor: grabbing; }
            .processed-celeb-item {
                flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
                object-fit: cover; border: 2px solid #f472b6;
            }
            /* Xóa style khung cho các mục đã xử lý */
            .processed-item {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
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
                background: rgba(15,15,20,0.85) !important; backdrop-filter: blur(15px) !important;
                border: 1px solid rgba(255,255,255,0.15) !important;
                box-shadow: 0 8px 30px rgba(0,0,0,0.3) !important;
                border-radius: 16px !important; width: 750px; max-width: 90vw; transition: left 0.3s ease;
                padding: 12px !important; padding-top: 40px !important; z-index: 10000;
            }
            #celeb-dashboard-modal .auto-celeb-modal-close { display: none !important; }
            #modal-information {
                display: none;
                width: 750px; max-width: 90vw; text-align: left;
                top: 90px !important; left: 385px !important; transform: none !important;
                background: rgba(15,15,20,0.85) !important; backdrop-filter: blur(15px) !important;
                border: 1px solid rgba(255,255,255,0.15) !important;
                box-shadow: 0 8px 30px rgba(0,0,0,0.3) !important;
                border-radius: 16px !important; display: flex; flex-direction: column; transition: left 0.3s ease;
                min-height: 480px; max-height: calc(60vh + 90px);
                padding: 20px !important; padding-top: 40px !important; z-index: 10002;
            }
            #modal-information .auto-celeb-modal-close { display: none; }
            #info-panel-content { display: flex; flex-direction: column; height: 100%; margin-top: -25px; }
            #info-panel-tabs {
                display: flex;
                gap: 6px;
                border-bottom: 1px solid rgba(255,255,255,0.08);
                margin-bottom: 18px;
                flex-shrink: 0;
                padding-bottom: 6px;
            }
            .info-tab-button {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                border: none;
                background: rgba(255,255,255,0.02);
                color: #b3b3b8;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
                border-radius: 999px;
                position: relative;
                transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
            }
            .info-tab-button:hover { color: #fff; background: rgba(255,255,255,0.05); }
            .info-tab-button.active {
                color: #f9a8d4;
                background: linear-gradient(120deg, rgba(244,114,182,0.25), rgba(139,92,246,0.25));
                box-shadow: 0 6px 18px rgba(244,114,182,0.25);
            }
            .info-tab-button svg {
                width: 16px; height: 16px; transition: transform 0.2s ease;
                transform: scale(1);
            }
            .info-tab-button.active svg { transform: scale(1.1); }
            #info-panel-list {
                flex-grow: 1; overflow-y: auto; padding-right: 10px; max-height: 330px;
            }
            .info-celeb-item {
                display: flex; align-items: center; gap: 16px;
                padding: 16px; border-radius: 18px; margin-bottom: 12px;
                background: rgba(17,17,20,0.75);
                border: 1px solid rgba(244,114,182,0.12);
                box-shadow: 0 12px 30px rgba(0,0,0,0.25);
                position: relative;
                overflow: hidden;
            }
            .info-celeb-item::after {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: 18px;
                border: 1px solid rgba(255,255,255,0.02);
                pointer-events: none;
            }
            .info-celeb-avatar-wrapper { position: relative; flex-shrink: 0; }
            .info-celeb-avatar-wrapper img {
                width: 52px; height: 52px; border-radius: 16px;
                border: 2px solid transparent;
                background:
                    linear-gradient(#141216, #141216) padding-box,
                    linear-gradient(135deg, #f472b6, #8b5cf6) border-box;
                padding: 2px;
            }
            .info-celeb-avatar-icon {
                position: absolute; bottom: -4px; right: -4px; background: #f472b6; color: #fff;
                border-radius: 50%; width: 22px; height: 22px; display: flex;
                align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
                border: 2px solid rgba(15,15,20,0.9);
                box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            }
            /* Căn chỉnh lại icon trái tim cho cân đối */
            .info-celeb-avatar-icon .heart-icon {
                position: relative;
                top: 1px;
            }

            .info-celeb-details { flex-grow: 1; min-width: 0; }
            .info-celeb-details .name { font-weight: 700; color: #fff; font-size: 15px; }
            .info-celeb-details .uid { font-size: 13px; color: #c4c4cc; }
            .info-celeb-progress-bar {
                width: 100%; height: 6px; background: rgba(255,255,255,0.08);
                border-radius: 999px; overflow: hidden; margin-top: 8px;
            }
            .info-celeb-progress-bar div {
                height: 100%;
                border-radius: 999px;
                background: linear-gradient(90deg, #f472b6, #a855f7);
            }
            .info-celeb-progress-text {
                font-size: 12px; color: #f9a8d4; font-weight: 600;
                margin-top: 6px;
            }
            .info-celeb-status-btn {
                display: flex; align-items: center; gap: 6px;
                padding: 6px 12px; border-radius: 8px; border: none;
                font-size: 13px; font-weight: 600; white-space: nowrap;
            }
            .info-celeb-status-btn.friend { background: linear-gradient(135deg, #34d399, #10b981); color: #f0fff4; }
            .info-celeb-status-btn.pending { background: linear-gradient(135deg, #60a5fa, #2563eb); color: #e0f2fe; }
            .info-celeb-status-btn.add { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #fff7ed; }
            .info-celeb-status-btn.full { background: linear-gradient(135deg, #f87171, #ef4444); color: #fff1f2; }
            .info-celeb-status-btn.external { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #fff7ed; }
            .info-celeb-status-btn.clickable-add {
                cursor: pointer;
                transition: transform 0.2s ease, filter 0.2s ease;
            }
            .info-celeb-status-btn.clickable-add:hover {
                transform: scale(1.05);
                filter: brightness(1.15);
            }
            .info-celeb-status-btn svg { width: 12px; height: 12px; fill: currentColor; }

            /* Grid layout for 'Others' tab */
            #info-panel-list.info-grid-layout {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }
            #info-panel-list.info-grid-layout .info-celeb-item {
                margin-bottom: 0; /* Use gap instead of margin */
            }


            #modal-dashboard-layout { display: flex; gap: 20px; margin-top: -15px; }
            #modal-celeb-list-wrapper {
                flex: 1.5; border-right: 1px solid #444; padding-right: 20px;
                overflow: visible; /* Fix cho item bị cắt khi hover */
                min-height: 450px; max-height: 60vh; display: flex; flex-direction: column; min-width: 0;
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
            #celeb-selection-list { flex-grow: 1; overflow-y: auto; padding-right: 16px; }
            .celeb-list-item-new {
                display: flex; align-items: center; justify-content: space-between;
                padding: 12px 16px; border-radius: 18px; margin-bottom: 12px; cursor: pointer;
                background: rgba(17,17,20,0.75);
                border: 1px solid rgba(244,114,182,0.12);
                box-shadow: 0 12px 30px rgba(0,0,0,0.25);
                transition: opacity 0.3s ease, transform 0.3s ease; /* Thêm transition cho hiệu ứng mượt mà */
            }
            /* Khi di chuột vào một mục, nó sẽ phóng to nhẹ */
            .celeb-list-item-new:hover {
                transform: scale(1.02);
            }
            .celeb-list-item-new.selected { background: rgba(24,24,27,0.95); border-color: rgba(139, 92, 246, 0.4); opacity: 1; filter: saturate(1); }
            /* Khi di chuột vào vùng chứa, tất cả các mục sẽ mờ đi */
            #auto-friend-tool-wrapper:hover > .celeb-list-item-new { opacity: 0.5; }
            /* Mục đang được di chuột sẽ sáng trở lại */
            #auto-friend-tool-wrapper > .celeb-list-item-new:hover { opacity: 1; }
            .celeb-list-item-main { display: flex; align-items: center; flex-grow: 1; min-width: 0; gap: 14px; }
            .celeb-list-profile-image { position: relative; flex-shrink: 0; }
            .celeb-list-profile-image img {
                width: 52px; height: 52px; border-radius: 16px; border: 2px solid transparent;
                background: linear-gradient(#141216, #141216) padding-box, linear-gradient(135deg, #f472b6, #8b5cf6) border-box;
                padding: 2px;
            }
            .celeb-list-icon { position: absolute; bottom: -4px; right: -4px; background: #f472b6; color: #fff; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; border: 2px solid rgba(15,15,20,0.9); box-shadow: 0 4px 10px rgba(0,0,0,0.35); }
            .celeb-list-profile-info { flex-grow: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
            .celeb-list-profile-name { font-size: 16px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .celeb-list-progress { width: 100%; height: 8px; background: #555; border-radius: 4px; overflow: hidden; }
            .celeb-list-progress-bar { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
            .celeb-list-progress-text { font-size: 12px; color: #f9a8d4; font-weight: 600; }

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
            #dashboard-timer-ui.disabled {
                opacity: 0.4;
                pointer-events: none;
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
            #auto-celeb-footer-buttons {
                display: flex;
                gap: 8px;
                padding: 8px 0;
                margin-top: 6px;
                flex-wrap: nowrap;
            }
            #auto-celeb-footer-buttons .footer-btn {
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 14px;
                color: #a1a1aa;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                transition: all 0.25s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 12px;
                position: relative;
                overflow: hidden;
                flex: 1;
                background: rgba(255, 255, 255, 0.05);
            }
            #auto-celeb-footer-buttons .footer-btn > * { position: relative; z-index: 1; }
            #auto-celeb-footer-buttons .footer-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(0,0,0,0.25);
                color: white;
            }
            .footer-btn-icon {
                width: 20px; height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .footer-btn-icon svg { width: 100%; height: 100%; }
            #auto-celeb-footer-buttons #btn-main-bug-report:hover { background: #f97316; border-color: #fb923c; }
            #auto-celeb-footer-buttons #btn-main-donate:hover { background: #10b981; border-color: #34d399; }

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
            .toast-notification.toast-processing { border-left: 4px solid #8b5cf6; }
            .toast-notification.toast-processing .toast-icon { color: #8b5cf6; }

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

            /* Conditional shift when running */
            body.auto-celeb-running #auto-celeb-main-container {
                left: 15px; /* Original 20px -> Shift left by 5px */
            }
            body.auto-celeb-running #celeb-dashboard-modal,
            body.auto-celeb-running #modal-information {
                left: 377px !important; /* Original 385px -> Shift left by 8px */
            }
            #login-notice-title { font-size: 18px; font-weight: 700; margin: 0; color: #f0f0f0; }
            #login-notice-message { font-size: 14px; color: #b0b0b0; line-height: 1.5; margin: 0; max-width: 280px; }
        `;
        style.textContent += `
            #auto-celeb-redirect-notice {
                display: flex; flex-direction: column; align-items: center; gap: 15px; padding: 20px;
                background: linear-gradient(145deg, rgba(30, 30, 35, 0.8), rgba(20, 20, 25, 0.8));
                border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; text-align: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            #redirect-notice-icon {
                width: 48px; height: 48px; color: #8b5cf6; margin-bottom: 5px;
                filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.5));
            }
            #redirect-notice-header {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
            }
            #redirect-notice-title { font-size: 18px; font-weight: 700; margin: 0; color: #f0f0f0; }
            #redirect-notice-message { font-size: 14px; color: #b0b0b0; line-height: 1.5; margin: 0; max-width: 280px; }
            #redirect-notice-buttons { display: flex; gap: 12px; width: 100%; margin-top: 10px; }
            .redirect-notice-button {
                flex: 1; text-decoration: none; color: white; font-weight: 600; font-size: 14px;
                padding: 12px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
                background: rgba(255,255,255,0.05); transition: all 0.2s ease;
            }
            .redirect-notice-button:hover {
                background: rgba(255,255,255,0.1); border-color: rgba(139, 92, 246, 0.5); color: #c4b5fd;
            }
            /* Loading Spinner */
            #auto-celeb-loader {
                display: none; /* Hidden by default */
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 20px;
                gap: 15px;
            }
            .loader-spinner {
                width: 48px;
                height: 48px;
                border: 5px solid rgba(255, 255, 255, 0.2);
                border-bottom-color: #f472b6;
                border-radius: 50%;
                display: inline-block;
                box-sizing: border-box;
                animation: rotation 1s linear infinite;
            }
            #auto-celeb-loader p {
                color: #a1a1aa;
                font-weight: 600;
                font-size: 14px;
                margin: 0;
            }
            @keyframes rotation {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            /* INLINE UPDATE NOTICE */
            #auto-celeb-update-notice {
                display: none; /* Hidden by default */
                flex-direction: column; align-items: center; gap: 15px; padding: 20px;
                background: linear-gradient(145deg, rgba(30, 30, 35, 0.8), rgba(20, 20, 25, 0.8));
                border: 1px solid rgba(236, 72, 153, 0.6); border-radius: 12px; text-align: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            #update-notice-icon {
                width: 48px; height: 48px; color: #f472b6; margin-bottom: 5px;
                filter: drop-shadow(0 0 8px rgba(236, 72, 153, 0.5));
            }
            #update-notice-title { font-size: 18px; font-weight: 700; margin: 0; color: #f0f0f0; }
            #update-notice-message { font-size: 14px; color: #b0b0b0; line-height: 1.5; margin: 0; max-width: 280px; }
            #update-notice-message strong { color: #f9a8d4; font-weight: 700; }
            #update-notice-buttons { display: flex; gap: 12px; width: 100%; margin-top: 10px; }
            .update-notice-button {
                flex: 1; text-decoration: none; color: white; font-weight: 600; font-size: 14px;
                padding: 12px 10px; border-radius: 12px; transition: all 0.2s ease;
                cursor: pointer;
            }
            #update-notice-install-btn {
                border: 1px solid rgba(236,72,153,0.6);
                box-shadow: 0 0 25px rgba(236,72,153,0.25), inset 0 0 15px rgba(236,72,153,0.15);
                background: radial-gradient(circle at top left, rgba(236,72,153,0.25), transparent 55%), radial-gradient(circle at top right, rgba(244,114,182,0.25), transparent 55%), rgba(26, 9, 23, 0.7);
                animation: pulse-close 1.6s ease-in-out infinite;
                color: #fbcfe8;
            }
            #update-notice-install-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 35px rgba(236, 72, 153, 0.5);
                filter: brightness(1.15);
                text-decoration: none; /* Đảm bảo không có gạch chân khi di chuột */
            }
            #update-notice-copy-btn { border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); }
            #update-notice-copy-btn:hover { background: rgba(255,255,255,0.2); }
            .update-notice-button.copied { background-color: #22c55e; border-color: #16a34a; color: white; cursor: default; }
            .update-notice-button.copied:hover { background-color: #22c55e; border-color: #16a34a; color: white; }

            /* --- MOBILE RESPONSIVE & LAYOUT FIXES --- */
            @media (max-width: 768px) {
                #auto-celeb-main-container:not(.collapsed) {
                    width: min(340px, 92vw) !important;
                    max-width: none !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    right: auto !important;
                    top: 15px !important;
                    padding: 14px !important;
                    gap: 10px !important;
                }
                
                /* Collapsed State: Circular Floating Logo */
                #auto-celeb-main-container.collapsed {
                    width: 48px !important;
                    height: 48px !important;
                    border-radius: 50% !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                    background: rgba(20, 20, 20, 0.9) !important;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4) !important;
                    /* Allow dragging position */
                    top: auto;
                }
                #auto-celeb-main-container.collapsed #auto-celeb-popup-header {
                    padding: 0 !important; width: 100% !important; height: 100% !important;
                    justify-content: center !important; background: transparent !important;
                    box-shadow: none !important;
                }
                #auto-celeb-main-container.collapsed #auto-celeb-title-icon {
                    width: 100% !important; height: 100% !important; border-radius: 50% !important;
                    box-shadow: none !important; margin: 0 !important;
                }
                #auto-celeb-main-container.collapsed #auto-celeb-title-info,
                #auto-celeb-main-container.collapsed .lc-ambient-glow { display: none !important; }

                /* Horizontal Tools Layout */
                #auto-celeb-actions-wrapper {
                    flex-direction: row !important;
                    overflow-x: auto;
                    padding-bottom: 5px;
                }
                .auto-celeb-action-btn {
                    min-width: 160px;
                    flex: 0 0 auto; /* Prevent shrinking */
                }
                
                /* Modals will be positioned via JS or fixed bottom/below */
            }
        `;
        document.head.appendChild(style);
    }

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
            return `C ${cps[0].toFixed(1)},${cps[1].toFixed(1)} ${cpe[0].toFixed(1)},${cpe[1].toFixed(1)} ${point[0].toFixed(1)},${point[1].toFixed(1)}`;
        };

        const d = points.reduce((acc, point, i, a) => i === 0 ? `M ${point[0]},${point[1]}` : `${acc} ${bezierCommand(point, i, a)}`, '');

        svgLine.setAttribute('d', d);
        svgArea.setAttribute('d', `${d} L ${width},${height} L 0,${height} Z`);
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
            chartState = `Active (Peak ${spike.toFixed(1)})`;
        }
    }

    function updateChartTooltip() {
        const tooltip = document.getElementById('chart-tooltip-info');
        if (!tooltip) return;

        const timeSince = ((Date.now() - chartLastLogTime) / 1000).toFixed(1);
        tooltip.innerHTML = `Last: ${chartStats.lastDiff.toFixed(1)}s · Avg: ${chartStats.avgDiff.toFixed(1)}s · Since: ${timeSince}s`;
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

    function checkSuccessStatus() {
        if (!processedCelebs || !processedCelebs.length) return;

        let changed = false;
        processedCelebs.forEach(celeb => {
            if (successfulCelebIds.has(celeb.id)) return;

            const parentEl = document.getElementById(celeb.id + '_parentElement');
            if (!parentEl) return;

            const profileCard = parentEl.closest('.profile');
            if (!profileCard) return;

            const btn = profileCard.querySelector('button.showMoreBtn');
            if (btn) {
                const text = btn.textContent.trim();
                // Check for success states: "Đã gửi lời mời" (Request sent) or "Bạn bè" (Friend)
                if (text.includes('Đã gửi lời mời') || text.includes('Bạn bè') || text.includes('Request sent') || text.includes('Friends')) {
                    successfulCelebIds.add(celeb.id);
                    runSuccessCount++;
                    changed = true;
                }
            }
        });

        if (changed) {
            updateStatsDisplay();
            updateSuccessCelebsDisplay();
            saveRunStats();
        }
    }

    function incrementConnectionLostCount() {
        runConnectionLostCount++;
        saveRunStats();
        updateStatsDisplay();
    }

    function incrementAutoResetCount() {
        runAutoResetCount++;
        saveRunStats();
        updateStatsDisplay();
    }

    function updateStatsDisplay() {
        const sentEl = document.getElementById('stat-sent');
        const successEl = document.getElementById('stat-success');
        const timeEl = document.getElementById('stat-time');
        const errorEl = document.getElementById('stat-error');
        const resetEl = document.getElementById('stat-reset');

        if (sentEl) sentEl.textContent = runSentCount.toString();
        if (successEl) successEl.textContent = runSuccessCount.toString();
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

        listWrapper.style.overflow = 'hidden'; // Ngăn vỡ layout khi chạy
        listWrapper.innerHTML = `
            <div id="running-view-wrapper">
                <div id="running-chart-container" onmouseenter="document.getElementById('chart-tooltip-info').style.display='block';" onmouseleave="document.getElementById('chart-tooltip-info').style.display='none';">
                    <div id="chart-tooltip-info" class="chart-tooltip"></div>
                    <svg id="activity-chart-svg" viewBox="0 0 300 100" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stop-color="#f472b6" stop-opacity="0.6"/>
                                <stop offset="100%" stop-color="#f472b6" stop-opacity="0.1"/>
                            </linearGradient>
                        </defs>
                        <path id="activity-chart-area" d="" fill="url(#chartGradient)"></path>
                        <path id="activity-chart-line" d="" fill="none" stroke="#f9a8d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    <div id="chart-overlay-info" style="position:absolute; top:5px; right:10px; font-size:10px; color:#aaa; font-weight:bold; font-family:'Inter'; text-shadow:0 0 5px rgba(0,0,0,0.5);">LIVE ACTIVITY</div>
                </div>

                <div id="running-stats-container">
                    <p><strong>Đã gửi:</strong> <span id="stat-sent">0</span></p>
                    <p><strong>Thành công:</strong> <span id="stat-success" style="color: #34d399;">0</span></p>
                    <p><strong>Thời gian:</strong> <span id="stat-time">00:00:00</span></p>
                    <p><strong>Mất kết nối:</strong> <span id="stat-error">0</span></p>
                    <p><strong>Reset:</strong> <span id="stat-reset">0</span></p>
                </div>

                <div id="running-lists-container" style="display: flex; gap: 10px; margin-top: 15px;">
                    <div id="processed-celebs-container" style="flex: 1.8; min-width: 0; max-width: 240px;">
                        <p><strong>Đã xử lý:</strong></p>
                        <div id="processed-celebs-list"></div>
                    </div>
                    <div id="success-celebs-container" style="flex: 1; min-width: 0; max-width: 160px;">
                        <p><strong>Thành công:</strong></p>
                        <div id="success-celebs-list"></div>
                    </div>
                </div>
            </div>
        `;

        updateChartDrawing();

        const logWrapper = document.getElementById('dashboard-log-wrapper');
        if (logWrapper) {
            logWrapper.style.display = 'flex';
        }
        updateProcessedCelebsDisplay();
        updateSuccessCelebsDisplay();
    }

    function updateProcessedCelebsDisplay() {
        const container = document.getElementById('processed-celebs-list');
        if (!container) return;
        const storedProcessedCelebs = sessionStorage.getItem(CONFIG.PROCESSED_CELEBS_KEY);
        const list = storedProcessedCelebs ? JSON.parse(storedProcessedCelebs) : [];

        // Hiển thị tất cả celeb, cho phép scroll ngang, với style giống danh sách chọn
        const displayHtml = list.map(celeb => `
            <img src="${celeb.imgSrc}" alt="${celeb.name}" title="${celeb.name}" class="processed-celeb-item" draggable="false">
        `).join('');

        container.innerHTML = displayHtml;

        // Tự động scroll đến cuối (celeb mới nhất) khi có celeb mới
        container.scrollLeft = container.scrollWidth;

        // Setup drag to scroll
        setupDragToScroll(container);
    }

    function updateSuccessCelebsDisplay() {
        const container = document.getElementById('success-celebs-list');
        if (!container) return;

        const list = processedCelebs.filter(c => successfulCelebIds.has(c.id));

        const displayHtml = list.map(celeb => `
            <img src="${celeb.imgSrc}" alt="${celeb.name}" title="${celeb.name}" class="processed-celeb-item" draggable="false" style="border-color: #34d399;">
        `).join('');

        container.innerHTML = displayHtml;
        container.scrollLeft = container.scrollWidth;
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

         grid.innerHTML = list.map(celeb => `
            <div class="processed-grid-item">
                <img src="${celeb.imgSrc}" loading="lazy">
                <span>${celeb.name}</span>
            </div>
         `).join('');

         modalOverlay.style.display = 'block';
         modalList.style.display = 'block';
    }

    function showCelebPopup(celebName, countText) {
        const message = `<span class="celeb-count">${countText}</span> Đang xử lý: <span class="celeb-name">${celebName}</span>`;
        showToastNotification(message, 'processing', 4000);
    }

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
             processing: `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M21.75 12h-2.25m-1.666 5.834L16.5 16.5M4.5 12H2.25m1.666-5.834L5.25 7.5M12 21.75V19.5" /></svg>`,
         };
         toast.innerHTML = `
             ${icons[type] || ''}
             <span class="toast-message">${message}</span>
         `;
         container.prepend(toast);
         setTimeout(() => toast.remove(), duration);
         // Thêm class để style riêng cho toast processing
         if (type === 'processing') {
             toast.querySelector('.toast-message').classList.add('processing-message');
         }
     }

    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = document.getElementById('auto-celeb-popup-header');
        
        if (header) {
            header.onmousedown = dragMouseDown;
            header.ontouchstart = dragTouchStart;
        }

        function dragMouseDown(e) {
            // Only allow dragging if collapsed or on desktop if desired, but user requested for phone collapsed
            if (!element.classList.contains('collapsed') && window.innerWidth <= 768) return;
            
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = 'auto'; // Clear right to allow movement
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            document.ontouchend = null;
            document.ontouchmove = null;
        }

        function dragTouchStart(e) {
            if (!element.classList.contains('collapsed') && window.innerWidth <= 768) return;
            const touch = e.touches[0];
            pos3 = touch.clientX;
            pos4 = touch.clientY;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementTouchDrag;
        }

        function elementTouchDrag(e) {
            // e.preventDefault(); // Commented to allow scrolling if needed, but for drag usually we prevent
            const touch = e.touches[0];
            pos1 = pos3 - touch.clientX;
            pos2 = pos4 - touch.clientY;
            pos3 = touch.clientX;
            pos4 = touch.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = 'auto';
        }
    }

    function createMainControlUI() {
        const container = document.createElement('div');
        container.id = 'auto-celeb-main-container';

        if (localStorage.getItem(CONFIG.COLLAPSE_STATE_KEY) === 'true') {
            container.classList.add('collapsed');
        }

        container.innerHTML = `
            <span class="lc-ambient-glow glow-top"></span>
            <span class="lc-ambient-glow glow-bottom"></span>
            <div id="auto-celeb-popup-header">
                <div id="auto-celeb-header-content">
                    <div id="auto-celeb-title-icon">
                        <img src="${CONFIG.LOGO_URL}" alt="Locket Celebrity Logo" id="auto-celeb-logo-image">
                    </div>
                    <div id="auto-celeb-title-info">
                        <div class="lc-name-row">
                            <span id="auto-celeb-app-name">Locket Celebrity</span>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                        <div id="auto-celeb-version-badge">
                            <svg class="lc-premium-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/>
                            </svg>
                            <span>${CONFIG.DISPLAY_VERSION}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const isCelebPage = window.location.href.startsWith(CONFIG.TARGET_PAGE);
        const isFriendPage = window.location.href.startsWith(CONFIG.FRIENDS_PAGE);
        const isLoginPage = window.location.href.startsWith(CONFIG.LOGIN_PAGE);

        const tabNav = document.createElement('div');
        tabNav.id = 'auto-celeb-tab-nav';
        if (isCelebPage || isFriendPage || (!isLoginPage && !isCelebPage && !isFriendPage)) {
            const gliderClass = isFriendPage ? 'pos-left' : 'pos-right';
            tabNav.innerHTML = `
                <a id="tab-friend-tools" class="nav-tab ${isFriendPage ? 'active' : ''}" href="${CONFIG.FRIENDS_PAGE}">
                    <span class="nav-tab-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="3"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                    </span>
                    <span>Friends</span>
                </a>
                <a id="tab-celeb-tools" class="nav-tab ${isCelebPage ? 'active' : ''}" href="${CONFIG.TARGET_PAGE}">
                    <span class="nav-tab-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </span>
                    <span>Celebrity Tools</span>
                </a>
                <div id="nav-glider" class="${gliderClass}"></div>
            `;
            container.appendChild(tabNav);
        }

        const keyWall = document.createElement('div');
        keyWall.id = 'auto-celeb-key-wall';
        keyWall.innerHTML = `
            <img id="key-wall-icon" src="${CONFIG.LOGO_URL}" alt="Logo">
            <h3 id="key-wall-title">Kích hoạt Script</h3>
            <p id="key-wall-message">Để sử dụng script, vui lòng nhập key kích hoạt.<br>Truy cập kênh chat messenger để nhận key.</p>
            <a id="btn-get-key" href="${CONFIG.MESSENGER_LINK}" target="_blank">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;"><path d="M3.5 11.5a3.5 3.5 0 1 1 3.163-5H14L15.5 8 14 9.5l-1-1-1 1-1-1-1 1-1-1-1 1H6.663a3.5 3.5 0 0 1-3.163 2zM2.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>
                Lấy Key tại Messenger
            </a>
            <input type="text" id="key-input-field" placeholder="Nhập key...">
            <button id="btn-submit-key">Xác thực Key</button>
            <p id="key-error-message">Key không hợp lệ. Vui lòng thử lại.</p>
        `;
        container.appendChild(keyWall);

        const loader = document.createElement('div');
        loader.id = 'auto-celeb-loader';
        loader.innerHTML = `
            <div class="loader-spinner"></div>
            <p>Đang kiểm tra phiên bản...</p>
        `;
        container.appendChild(loader);

        const updateNotice = document.createElement('div');
        updateNotice.id = 'auto-celeb-update-notice';
        updateNotice.style.display = 'none';
        updateNotice.innerHTML = `
            <div id="update-notice-header">
                <svg id="update-notice-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <h4 id="update-notice-title">Có phiên bản mới!</h4>
            </div>
            <p id="update-notice-message"></p>
            <div id="update-notice-buttons">
                <a id="update-notice-install-btn" href="${CONFIG.UPDATE_URL}" target="_blank" class="update-notice-button">Cài đặt ngay</a>
                <button id="update-notice-copy-btn" class="update-notice-button">Copy Link</button>
            </div>
        `;
        container.appendChild(updateNotice);

        if (isCelebPage) {
            const actionsWrapper = document.createElement('div');
            actionsWrapper.id = 'auto-celeb-actions-wrapper';

            // iOS Settings List Style HTML Structure
            actionsWrapper.innerHTML = `
                <button id="auto-celeb-open-dashboard-btn" class="auto-celeb-action-btn card-indigo">
                    <div class="action-btn-main">
                        <div class="action-btn-icon-wrapper icon-dashboard-bg">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="2"/><rect width="7" height="7" x="14" y="3" rx="2"/><rect width="7" height="7" x="14" y="14" rx="2"/><rect width="7" height="7" x="3" y="14" rx="2"/></svg>
                        </div>
                        <div class="action-btn-content">
                            <span class="action-btn-label">Mở Bảng Điều Khiển</span>
                            <span class="action-btn-subtitle">Tùy chỉnh & Cài đặt</span>
                        </div>
                    </div>
                    <div class="action-btn-chevron-circle">
                        <svg class="action-btn-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </button>
                <button id="auto-celeb-info-btn" class="auto-celeb-action-btn card-indigo">
                    <div class="action-btn-main">
                        <div class="action-btn-icon-wrapper icon-stats-bg">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 4 4 5-5"/></svg>
                        </div>
                        <div class="action-btn-content">
                            <span class="action-btn-label">Mở Bảng Thống Kê</span>
                            <span class="action-btn-subtitle">Biểu đồ & Phân tích</span>
                        </div>
                    </div>
                    <div class="action-btn-chevron-circle">
                        <svg class="action-btn-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </button>
            `;
            container.appendChild(actionsWrapper);

            const footerButtons = document.createElement('div');
            footerButtons.id = 'auto-celeb-footer-buttons';
            footerButtons.innerHTML = `
                <button id="btn-main-bug-report" class="footer-btn">
                    <span class="footer-btn-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                    </span>
                    <span>Báo lỗi</span>
                </button>
                <button id="btn-main-donate" class="footer-btn">
                    <span class="footer-btn-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                    </span>
                    <span>Donate</span>
                </button>
            `;
            container.appendChild(footerButtons);
        } else if (isFriendPage) {
            const friendTool = document.createElement('div');
            friendTool.id = 'auto-friend-tool-wrapper';
            friendTool.style.gap = '8px'; // Giảm khoảng cách giữa các celeb
            container.appendChild(friendTool);

            const footerButtons = document.createElement('div');
            footerButtons.id = 'auto-celeb-footer-buttons';
            footerButtons.innerHTML = `
                <button id="btn-main-bug-report" class="footer-btn">
                    <span class="footer-btn-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                    </span>
                    <span>Báo lỗi</span>
                </button>
                <button id="btn-main-donate" class="footer-btn">
                    <span class="footer-btn-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                    </span>
                    <span>Donate</span>
                </button>
            `;
            container.appendChild(footerButtons);
        } else if (isLoginPage) {
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
            const redirectNotice = document.createElement('div');
            redirectNotice.id = 'auto-celeb-redirect-notice';
            redirectNotice.innerHTML = `
                 <div id="redirect-notice-header">
                     <h4 id="redirect-notice-title">Không có công cụ</h4>
                     <svg id="redirect-notice-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                         <path stroke-linecap="round" stroke-linejoin="round" d="M12.75 15l3-3m0 0l-3-3m3 3h-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                     </svg>
                </div>
                <p id="redirect-notice-message">Trang hiện tại không được hỗ trợ. Vui lòng sử dụng thanh điều hướng ở trên để chuyển đến trang có công cụ.</p>
            `;
            container.appendChild(redirectNotice);
        }

        document.body.appendChild(container);

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = `
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

                    </div>
                </div>
            </div>

            <div id="modal-information" class="auto-celeb-modal" style="display: none;">
                <span class="auto-celeb-modal-close">&times;</span>
                <div id="info-panel-content">
                    <div class="celeb-list-header" style="margin-bottom: 5px;">
                        <h3>Thống kê Locket Celebrity</h3>
                        <button id="info-panel-refresh-button" class="celeb-refresh-button"><span class="refresh-icon">⟳</span> Làm mới</button>
                    </div>
                    <div id="info-panel-tabs">
                        <button class="info-tab-button" data-tab="friends"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Bạn bè (0)</span></button>
                        <button class="info-tab-button" data-tab="pending">Hàng chờ (0)</button>
                        <button class="info-tab-button" data-tab="available">Còn slot (0)</button>
                        <button class="info-tab-button" data-tab="full">Hết slot (0)</button>
                        <button class="info-tab-button" data-tab="others">Khác (0)</button>
                    </div>
                    <div id="info-panel-list">
                        <div style="text-align:center; padding: 50px; color: #777;">
                            <p>Đang tải dữ liệu...</p>
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
            `;
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

    function setupMainUIControls() {
        const mainContainer = document.getElementById('auto-celeb-main-container');
        const headerContent = document.getElementById('auto-celeb-header-content');
        const toggleCollapse = (e) => {
            mainContainer.classList.toggle('collapsed');
            const isCollapsed = mainContainer.classList.contains('collapsed');
            localStorage.setItem(CONFIG.COLLAPSE_STATE_KEY, isCollapsed);
            
            // Reset position if expanding on mobile to ensure it goes to top
            if (!isCollapsed && window.innerWidth <= 768) {
                // CSS !important rules will handle positioning for expanded state
            }

            // Nếu thu nhỏ, đóng tất cả các bảng điều khiển đang mở
            if (isCollapsed) {
                const dashboardModal = document.getElementById('celeb-dashboard-modal');
                const infoModal = document.getElementById('modal-information');
                const openDashboardButton = document.getElementById('auto-celeb-open-dashboard-btn');
                const infoButton = document.getElementById('auto-celeb-info-btn');

                // Đóng Bảng Điều Khiển nếu đang mở
                if (dashboardModal && dashboardModal.style.display !== 'none') {
                    dashboardModal.style.display = 'none';
                    if (openDashboardButton) {
                        const label = openDashboardButton.querySelector('.action-btn-label');
                        if(label) label.textContent = 'Mở Bảng Điều Khiển';
                        openDashboardButton.classList.remove('close-mode');
                        const chevron = openDashboardButton.querySelector('.action-btn-chevron');
                        if (chevron) chevron.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // >
                    }
                }

                // Đóng Bảng Thống Kê nếu đang mở
                if (infoModal && infoModal.style.display !== 'none') {
                    infoModal.style.display = 'none';
                    if (infoButton) {
                        const label = infoButton.querySelector('.action-btn-label');
                        if(label) label.textContent = 'Mở Bảng Thống Kê';
                        infoButton.classList.remove('close-mode');
                        infoButton.classList.add('card-indigo');
                        const chevron = infoButton.querySelector('.action-btn-chevron');
                        if (chevron) chevron.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // >
                        if (infoPanelScanInterval) { clearInterval(infoPanelScanInterval); infoPanelScanInterval = null; }
                    }
                }
            }
        };
        if (headerContent && mainContainer) { headerContent.addEventListener('click', toggleCollapse); }

        const btnSubmitKey = document.getElementById('btn-submit-key');
        const keyInput = document.getElementById('key-input-field');
        const keyError = document.getElementById('key-error-message');
        const validateKey = async () => {
            const inputVal = keyInput.value.trim();
            if (!inputVal) {
                keyError.textContent = 'Vui lòng nhập key.';
                keyError.style.display = 'block';
                return;
            }

            btnSubmitKey.disabled = true;
            btnSubmitKey.textContent = 'Đang xác thực...';

            try {
                const apiData = await fetchApiData();
                if (!apiData || apiData.length === 0) {
                    throw new Error('Không nhận được dữ liệu hợp lệ từ API.');
                }
    
                // Lọc ra tất cả các phiên bản đang "Mở"
                const openVersions = apiData.filter(entry => entry.status === 'Mở');

                // Nếu không có phiên bản nào đang mở, thông báo tạm dừng
                if (openVersions.length === 0) {
                    throw new Error('Công cụ đang tạm dừng hoạt động. Vui lòng quay lại sau.');
                }

                // Tìm phiên bản mới nhất trong số các phiên bản đang mở
                const latestActiveEntry = openVersions.sort((a, b) => b.stt - a.stt)[0];

                if (inputVal === String(latestActiveEntry.key)) {
                    localStorage.setItem(CONFIG.KEY_STORAGE_KEY, inputVal);
                    showToastNotification('Kích hoạt thành công! Đang tải lại trang...', 'success', 3000);
                    keyError.style.display = 'none';
                    setTimeout(() => location.reload(), 2000);
                } else {
                    throw new Error('Key không hợp lệ. Vui lòng thử lại.');
                }
            } catch (error) {
                keyError.textContent = error.message;
                keyError.style.display = 'block';
                keyInput.classList.add('shake');
                setTimeout(() => keyInput.classList.remove('shake'), 300);
                btnSubmitKey.disabled = false;
                btnSubmitKey.textContent = 'Xác thực Key';
            }
        };
        if(btnSubmitKey && keyInput && keyError) {
            btnSubmitKey.addEventListener('click', validateKey);
            keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { validateKey(); } });
        }

        // Event listener for the new inline update copy button
        const btnCopyUpdateInline = document.getElementById('update-notice-copy-btn');
        if (btnCopyUpdateInline) {
            btnCopyUpdateInline.addEventListener('click', (e) => {
                e.preventDefault();
                if (btnCopyUpdateInline.classList.contains('copied')) return;
                navigator.clipboard.writeText(CONFIG.UPDATE_URL).then(() => {
                    const originalText = btnCopyUpdateInline.textContent;
                    btnCopyUpdateInline.textContent = 'Đã copy!';
                    btnCopyUpdateInline.classList.add('copied');
                    setTimeout(() => {
                        btnCopyUpdateInline.textContent = originalText;
                        btnCopyUpdateInline.classList.remove('copied');
                    }, 2000);
                }).catch(err => {
                    console.error('[Auto Locket Celeb] Lỗi khi copy link: ', err);
                    alert('Lỗi khi copy. Vui lòng thử lại.');
                });
            });
        }

        // Ngăn chặn việc tải lại trang khi nhấp vào tab đang active
        const navTabs = document.querySelectorAll('.nav-tab');
        navTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (tab.classList.contains('active')) {
                    e.preventDefault();
                }
            });
        });

        const dashboardModal = document.getElementById('celeb-dashboard-modal');
        const infoModal = document.getElementById('modal-information');
        const openDashboardButton = document.getElementById('auto-celeb-open-dashboard-btn');
        const infoButton = document.getElementById('auto-celeb-info-btn');

        if (openDashboardButton && dashboardModal) {
            openDashboardButton.addEventListener('click', () => {
                if (dashboardModal.style.display !== 'block') {
                     if (infoModal) { infoModal.style.display = 'none'; }
                     if (infoButton) {
                         const label = infoButton.querySelector('.action-btn-label');
                         if(label) label.textContent = 'Mở Bảng Thống Kê';
                         infoButton.classList.remove('close-mode');
                    const infoChevron = infoButton.querySelector('.action-btn-chevron');
                    if (infoChevron) infoChevron.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // >
                     }
                     openDashboardModal();
                     const label = openDashboardButton.querySelector('.action-btn-label');
                     if(label) label.textContent = 'Đóng Bảng Điều Khiển';
                     openDashboardButton.classList.add('close-mode');
                     openDashboardButton.classList.remove('card-indigo'); // Xóa màu nền mặc định
                const chevron = openDashboardButton.querySelector('.action-btn-chevron');
                if (chevron) chevron.innerHTML = `<path d="M15 6L9 12l6 6"/>`; // <
                } else {
                     dashboardModal.style.display = 'none';
                     const label = openDashboardButton.querySelector('.action-btn-label');
                     if(label) label.textContent = 'Mở Bảng Điều Khiển';
                     openDashboardButton.classList.remove('close-mode');
                const chevron = openDashboardButton.querySelector('.action-btn-chevron');
                if (chevron) chevron.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // >
                }
            });
        }

        if (infoButton && infoModal) {
            infoButton.addEventListener('click', (e) => {
                e.preventDefault();
                toggleInfoModal(infoModal.style.display !== 'block');
            });
        }

        const controlBtn = document.getElementById('dashboard-control-button');
        if (controlBtn) {
            controlBtn.addEventListener('click', () => {
                 const s = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                 if (s.isRunning) stopProcess(); else startProcessFromModal();
            });
        }

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
                const s = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                // Không cho phép thay đổi khi đang chạy hoặc timer đang đếm ngược
                if (activeTimerId || s.isRunning) { toggleInput.checked = currentTimerConfig.enabled; return; }
                currentTimerConfig.enabled = toggleInput.checked;
                log(`Hẹn giờ ${currentTimerConfig.enabled ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}.`, 'timer');
                saveTimerConfig(); updateTimerUI();
            });
        }

        const modalOverlay = document.getElementById('auto-celeb-modal-overlay');
        const modalBug = document.getElementById('modal-bug-report');
        const modalDonate = document.getElementById('modal-donate');
        const modalProcessed = document.getElementById('modal-processed-list');
        const allCloseButtons = document.querySelectorAll('.auto-celeb-modal-close');

        const closeOnlyPopupModals = () => {
            if (modalOverlay) modalOverlay.style.display = 'none';
            if (modalBug) modalBug.style.display = 'none';
            // Không cần đóng modalInfo ở đây vì nó được quản lý riêng
            if (modalDonate) modalDonate.style.display = 'none';
            if (modalProcessed) modalProcessed.style.display = 'none';
        };

        const btnGenerateQR = document.getElementById('btn-generate-qr');
        const btnMainBugReport = document.getElementById('btn-main-bug-report');
        const btnMainDonate = document.getElementById('btn-main-donate');

        const toggleInfoModal = (show) => {
            // Đóng bảng điều khiển nếu đang mở
            if (dashboardModal && dashboardModal.style.display === 'block') {
                dashboardModal.style.display = 'none';
                if (openDashboardButton) {
                    const label = openDashboardButton.querySelector('.action-btn-label');
                    if(label) label.textContent = 'Mở Bảng Điều Khiển';
                    openDashboardButton.classList.remove('close-mode');
                    const chevron = openDashboardButton.querySelector('.action-btn-chevron');
                    if (chevron) chevron.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // >
                }
            }

            if (show) {
                infoModal.style.display = 'block';
                
                // Mobile positioning logic
                if (window.innerWidth <= 768) {
                    const container = document.getElementById('auto-celeb-main-container');
                    const rect = container.getBoundingClientRect();
                    const topPos = rect.bottom + 10;
                    infoModal.style.top = `${topPos}px`;
                    infoModal.style.left = '50%';
                    infoModal.style.setProperty('transform', 'translateX(-50%)', 'important');
                    infoModal.style.width = 'min(340px, 92vw)';
                    infoModal.style.maxHeight = `calc(100vh - ${topPos}px - 20px)`;
                }

                const label = infoButton.querySelector('.action-btn-label');
                if(label) label.textContent = 'Đóng Bảng Thống Kê';
                infoButton.classList.add('close-mode');
                infoButton.classList.remove('card-indigo'); // Xóa màu nền mặc định
                const chevron = infoButton.querySelector('.action-btn-chevron');
                if (chevron) chevron.innerHTML = `<path d="M15 6L9 12l6 6"/>`; // <
                initializeInfoPanel(true); // Chỉ quét một lần khi mở
            } else {
                infoModal.style.display = 'none';
                const label = infoButton.querySelector('.action-btn-label');
                if(label) label.textContent = 'Mở Bảng Thống Kê';
                infoButton.classList.remove('close-mode');
                infoButton.classList.add('card-indigo'); // Thêm lại màu nền mặc định
                const chevron = infoButton.querySelector('.action-btn-chevron');
                if (chevron) chevron.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // >
                // Dừng vòng lặp (nếu có) khi đóng
                if (infoPanelScanInterval) {
                    clearInterval(infoPanelScanInterval);
                    infoPanelScanInterval = null;
                }
            }
        }

        const closeAllModalsExcept = (exception) => {
            // Hàm này không còn cần thiết nữa vì z-index đã được điều chỉnh
        };

        if (btnMainBugReport && modalBug && modalOverlay) {
            btnMainBugReport.addEventListener('click', (e) => { e.preventDefault(); closeAllModalsExcept(modalBug); modalOverlay.style.display = 'block'; modalBug.style.display = 'block'; });
        }
        if (btnMainDonate && modalDonate && modalOverlay) {
            btnMainDonate.addEventListener('click', (e) => {
                e.preventDefault();
                closeAllModalsExcept(modalDonate);
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
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) closeOnlyPopupModals();
            });
        }
        allCloseButtons.forEach(btn => btn.addEventListener('click', closeOnlyPopupModals));
        
        // Enable dragging
        makeDraggable(mainContainer);
    }

    function scanCelebsForInfoPanel() {
        const allCelebs = [];
        document.querySelectorAll('#celebrityList div.profile').forEach(card => {
            const idEl = card.querySelector('[id$="_parentElement"]');
            if (!idEl) return;

            const id = idEl.id.replace('_parentElement', '');
            const name = card.querySelector('.profile-info .profile-name')?.textContent.trim() || 'Unknown';
            const imgSrc = card.querySelector('.profile-circle img')?.src || '';
            const prog = card.querySelector('.profile-info .x-progress');
            const current = prog ? parseInt(prog.dataset.current, 10) : 0;
            const max = prog ? parseInt(prog.dataset.max, 10) : 1;
            const percent = max > 0 ? Math.min(100, (current / max) * 100) : 0;

            const btn = card.querySelector('button.showMoreBtn');
            let status, statusText;

            if (btn) {
                const btnText = btn.textContent.trim();
                if (btnText.includes('Bạn bè')) {
                    status = 'friend';
                    statusText = 'Bạn bè';
                    knownCelebStatuses[id] = 'friend'; // Cập nhật cache
                } else if (btnText.includes('Đã gửi lời mời')) {
                    status = 'pending';
                    statusText = 'Đã gửi lời mời';
                    knownCelebStatuses[id] = 'pending'; // Cập nhật cache
                } else { // Nút là 'Thêm bạn bè'
                    status = 'add';
                    statusText = 'Thêm bạn bè';
                    // Nếu trạng thái đã biết trước đó là friend/pending, xóa nó đi vì đã có sự thay đổi
                    if (knownCelebStatuses[id]) {
                        delete knownCelebStatuses[id];
                    }
                }
            } else {
                // Khi nút biến mất (thường do auto-celeb đang chạy), tin tưởng vào cache
                if (knownCelebStatuses[id] === 'friend') {
                    status = 'friend';
                    statusText = 'Bạn bè';
                } else if (knownCelebStatuses[id] === 'pending') {
                    status = 'pending';
                    statusText = 'Đã gửi lời mời';
                } else {
                    // Nếu không có trong cache, mặc định là 'add'
                    status = 'add';
                    statusText = 'Thêm bạn bè';
                }
            }

            allCelebs.push({ id, name, imgSrc, current, max, percent, status, statusText });
        });
        return allCelebs;
    }

    const STATUS_ICONS = {
        add: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z"/></svg>',
        friend: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>',
        pending: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>', // Giống icon Bạn bè
        full: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>',
        external: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z"/></svg>',
    };

    function renderInfoList(celebs, container, emptyMessage = 'Không có celeb nào trong danh mục này.') {
        if (!celebs.length) {
            container.innerHTML = `<p style="grid-column: 1 / -1; text-align:center; color:#888; padding: 20px;">${emptyMessage}</p>`;
            return;
        }
        container.innerHTML = celebs.map(c => {
            const isExternal = c.status === 'external';
            const icon = isExternal ? '<span class="heart-icon">❤︎</span>' : '✦';
            // Đối với celeb ở tab "Khác", chúng ta không hiển thị thanh tiến trình
            const progressHtml = isExternal ? '' : `
                <div class="info-celeb-progress-bar"><div style="width: ${c.percent}%;"></div></div>
                <div class="info-celeb-progress-text">${c.current.toLocaleString()} / ${c.max.toLocaleString()}</div>
            `;

            // Nút ở tab "Khác" luôn có thể click được
            const clickableClass = (c.status === 'add' && c.current < c.max) || isExternal ? 'clickable-add' : '';
            const statusClass = c.status === 'add' && c.current >= c.max ? 'full' : c.status;

            return `
            <div class="info-celeb-item">
                <div class="info-celeb-avatar-wrapper">
                    <img src="${c.imgSrc}" alt="${c.name}" loading="lazy">
                    <div class="info-celeb-avatar-icon">${icon}</div>
                </div>
                <div class="info-celeb-details">
                    <div class="name">${c.name}</div>
                    <div class="uid">@${c.id}</div>
                    ${progressHtml}
                </div>
                <button class="info-celeb-status-btn ${statusClass} ${clickableClass}" data-uid="${c.id}">
                    ${c.status === 'add' && c.current >= c.max ? STATUS_ICONS.full : (STATUS_ICONS[c.status] || '')}
                    ${c.status === 'add' && c.current >= c.max ? 'Đã đầy' : c.statusText}
                </button>
            </div>
        `}).join('');
    }

    function updateInfoListOptimized(celebs, container) {
        celebs.forEach(c => {
            let itemEl = container.querySelector(`.info-celeb-item[data-uid="${c.id}"]`);
            if (!itemEl) {
                // Nếu celeb chưa có trong danh sách, tạo mới và thêm vào
                const newItem = document.createElement('div');
                newItem.className = 'info-celeb-item';
                newItem.dataset.uid = c.id;
                newItem.innerHTML = `
                    <div class="info-celeb-avatar-wrapper">
                        <img src="${c.imgSrc}" alt="${c.name}" loading="lazy">
                        <div class="info-celeb-avatar-icon">✦</div>
                    </div>
                    <div class="info-celeb-details">
                        <div class="name">${c.name}</div>
                        <div class="uid">@${c.id}</div>
                        <div class="info-celeb-progress-bar"><div style="width: ${c.percent}%; background: ${c.current >= c.max ? '#dc2626' : '#34c759'};"></div></div>
                        <div class="info-celeb-progress-text">${c.current.toLocaleString()} / ${c.max.toLocaleString()}</div>
                    </div>
                    <button class="info-celeb-status-btn ${c.status === 'add' && c.current >= c.max ? 'full' : c.status} ${c.status === 'add' && c.current < c.max ? 'clickable-add' : ''}" data-uid="${c.id}">
                        ${c.status === 'add' && c.current >= c.max ? STATUS_ICONS.full : (STATUS_ICONS[c.status] || '')}
                        ${c.status === 'add' && c.current >= c.max ? 'Đã đầy' : c.statusText}
                    </button>
                `;
                container.appendChild(newItem);
            } else {
                // Nếu celeb đã có, chỉ cập nhật các phần tử đã thay đổi
                const progressBar = itemEl.querySelector('.info-celeb-progress-bar div');
                const progressText = itemEl.querySelector('.info-celeb-progress-text');
                const statusBtn = itemEl.querySelector('.info-celeb-status-btn');

                if (progressBar && progressBar.style.width !== `${c.percent}%`) progressBar.style.width = `${c.percent}%`;
                const newProgressText = `${c.current.toLocaleString()} / ${c.max.toLocaleString()}`;
                if (progressText && progressText.textContent !== newProgressText) progressText.textContent = newProgressText;
                const newStatusClass = c.status === 'add' && c.current >= c.max ? 'full' : c.status;
                const newStatusText = (c.status === 'add' && c.current >= c.max) ? 'Đã đầy' : c.statusText;
                if (statusBtn && (statusBtn.textContent.trim() !== newStatusText || !statusBtn.classList.contains(newStatusClass))) {
                    statusBtn.className = `info-celeb-status-btn ${newStatusClass}`;
                    statusBtn.innerHTML = `${c.status === 'add' && c.current >= c.max ? STATUS_ICONS.full : (STATUS_ICONS[c.status] || '')} ${newStatusText}`;
                }
            }
        });
    }

    function addClickHandlersToInfoPanel(container) {
        container.addEventListener('click', async (e) => {
            const externalBtn = e.target.closest('.info-celeb-status-btn.external');
            if (externalBtn) {
                const uid = externalBtn.dataset.uid;
                window.open(`https://locket.cam/${uid}`, '_blank');
                return;
            }

            const clickedButton = e.target.closest('.info-celeb-status-btn.clickable-add');
            if (!clickedButton) return;

            // Vô hiệu hóa nút để tránh click nhiều lần
            clickedButton.disabled = true;
            clickedButton.textContent = 'Đang xử lý...';
            clickedButton.classList.remove('clickable-add');

            const uid = clickedButton.dataset.uid;
            if (!uid) return;

            const celebCard = document.querySelector(`#${uid}_parentElement`);
            if (!celebCard) {
                log(`Không tìm thấy thẻ celeb cho ${uid} trên trang.`, 'error');
                clickedButton.disabled = false; // Kích hoạt lại nút nếu có lỗi
                return;
            }

            const mainAddButton = celebCard.closest('.profile')?.querySelector('button.showMoreBtn');
            if (mainAddButton && mainAddButton.textContent.includes('Thêm bạn bè')) {
                mainAddButton.click();
                await sleep(1000); // Chờ card mở rộng

                const startButton = document.getElementById(uid + '_startButton');
                if (startButton) {
                    startButton.click();
                    log(`Đã gửi yêu cầu kết bạn cho ${uid}. Đang chờ xác nhận trạng thái...`, 'info');

                    // Vòng lặp kiểm tra trạng thái
                    const checkInterval = setInterval(() => {
                        const updatedCard = document.querySelector(`#${uid}_parentElement`);
                        const updatedButton = updatedCard?.closest('.profile')?.querySelector('button.showMoreBtn');
                        if (updatedButton && (updatedButton.textContent.includes('Đã gửi lời mời') || updatedButton.textContent.includes('Bạn bè'))) {
                            clearInterval(checkInterval);
                            log(`Thành công! Trạng thái của ${uid} đã được cập nhật. Đang tải lại trang...`, 'success');
                            location.reload();
                        }
                    }, 1000); // Kiểm tra mỗi giây
                } else {
                    log(`Không tìm thấy nút 'Bắt đầu' cho ${uid}.`, 'error');
                    clickedButton.disabled = false; // Kích hoạt lại nút nếu có lỗi
                }
            }
        });
    }
    async function initializeInfoPanel(isInitialLoad = false, isManualRefresh = false) {
        const tabsContainer = document.getElementById('info-panel-tabs');
        const listContainer = document.getElementById('info-panel-list');
        const refreshBtn = document.getElementById('info-panel-refresh-button');
        const refreshIcon = refreshBtn?.querySelector('.refresh-icon');

        const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');

        if (!tabsContainer || !listContainer) {
            if (infoPanelScanInterval) clearInterval(infoPanelScanInterval);
            return;
        }

        // Bắt đầu vòng lặp quét liên tục nếu đây là lần tải đầu tiên
        if (isInitialLoad && !infoPanelScanInterval) {
            infoPanelScanInterval = setInterval(() => {
                initializeInfoPanel(false, false).catch(console.error);
            }, 1500); // Quét lại mỗi 1.5 giây để cập nhật các tab DOM
        }

        if (isInitialLoad || isManualRefresh) {
            listContainer.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; padding: 50px; color: #777;"><p>Đang tải dữ liệu...</p></div>';
        }

        // Quét DOM để lấy dữ liệu cho các tab nội bộ (luôn cập nhật)
        const allCelebs = scanCelebsForInfoPanel();

        // Chỉ tải dữ liệu API cho tab "Khác" khi cần thiết
        let otherCelebs = [];
        if (isInitialLoad || isManualRefresh || cachedOtherCelebsData === null) {
            try {
                const apiData = await fetchCelebData(isManualRefresh);
                cachedOtherCelebsData = Array.isArray(apiData) ? apiData : [];
            } catch (e) {
                console.error('Lỗi khi tải danh sách celeb khác:', e);
                if (cachedOtherCelebsData === null) cachedOtherCelebsData = []; // Tránh fetch lại liên tục nếu lỗi
            }
        }

        if (cachedOtherCelebsData) {
            otherCelebs = cachedOtherCelebsData.map(c => {
                    const existing = allCelebs.find(domC => domC.id === c.uid);
                    const base = existing || {
                        id: c.uid,
                        name: c.name,
                        imgSrc: c.avatar,
                        current: 0, max: 0, percent: 0
                    };
                    return {
                        ...base,
                        status: 'external',
                        statusText: 'Thêm bạn bè'
                    };
                });
        }

        const currentActiveTab = tabsContainer.querySelector('.info-tab-button.active')?.dataset.tab || 'friends';
        let pendingList;
        if (state.isRunning && cachedPendingCelebs !== null) {
            // Khi đang chạy, kết hợp danh sách chờ đã cache với danh sách chờ quét trực tiếp từ DOM
            const livePending = allCelebs.filter(c => c.status === 'pending');
            const combinedPendingMap = new Map();
            cachedPendingCelebs.forEach(c => combinedPendingMap.set(c.id, c));
            livePending.forEach(c => combinedPendingMap.set(c.id, c)); // Ghi đè với dữ liệu mới nhất
            pendingList = Array.from(combinedPendingMap.values());
        } else {
            // Khi không chạy, chỉ sử dụng dữ liệu quét từ DOM
            pendingList = allCelebs.filter(c => c.status === 'pending');
        }
        const pendingIds = new Set(pendingList.map(c => c.id));

        const filters = {
            friends: allCelebs.filter(c => c.status === 'friend'),
            pending: pendingList,
            available: allCelebs.filter(c => c.current < c.max).map(c => {
                if (pendingIds.has(c.id)) {
                    return { ...c, status: 'pending', statusText: 'Đã gửi lời mời' };
                }
                return c;
            }),
            full: allCelebs.filter(c => c.current >= c.max && c.status === 'add'),
            others: otherCelebs
        };

        const updateTabCounts = () => {
            document.querySelector('.info-tab-button[data-tab="friends"] span').textContent = `Bạn bè (${filters.friends.length})`;
            document.querySelector('.info-tab-button[data-tab="pending"]').textContent = `Hàng chờ (${filters.pending.length})`;
            document.querySelector('.info-tab-button[data-tab="available"]').textContent = `Còn slot (${filters.available.length})`;
            document.querySelector('.info-tab-button[data-tab="full"]').textContent = `Hết slot (${filters.full.length})`;
            document.querySelector('.info-tab-button[data-tab="others"]').textContent = `Khác (${filters.others.length})`;
        };

        const setActiveTab = (tabName) => {
            tabsContainer.querySelectorAll('.info-tab-button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });
            // Add/remove grid class for 'others' tab
            listContainer.classList.toggle('info-grid-layout', tabName === 'others');

            // Luôn xóa sạch list trước khi render lại để tránh lỗi hiển thị đè lên nhau
            listContainer.innerHTML = '';

            let emptyMsg = 'Không có celeb nào trong danh mục này.';
            if (allCelebs.length === 0 && tabName !== 'others') {
                emptyMsg = 'Đang tải dữ liệu...';
            }

            renderInfoList(filters[tabName], listContainer, emptyMsg);

        };

        if (refreshBtn && !refreshBtn.onclick) { // Chỉ gán sự kiện lần đầu
            refreshBtn.onclick = (e) => {
                e.preventDefault();
                if (refreshIcon) refreshIcon.classList.add('spinning');
                setTimeout(() => {
                    initializeInfoPanel(true, true).catch(console.error); // Chạy lại với isInitialLoad và isManualRefresh
                    if (refreshIcon) setTimeout(() => refreshIcon.classList.remove('spinning'), 500);
                }, 100);
            };
        }

        tabsContainer.querySelectorAll('.info-tab-button').forEach(btn => {
            btn.onclick = () => setActiveTab(btn.dataset.tab);
        });

        updateTabCounts();
        if (isInitialLoad) { addClickHandlersToInfoPanel(listContainer); }
        setActiveTab(currentActiveTab);
    }

    function syncSelectAllToggle() {
        const selectAllInput = document.getElementById('celeb-select-all-input');
        if (!selectAllInput) return;
        const allCelebToggles = document.querySelectorAll('.celeb-item-toggle-input');
        const total = allCelebToggles.length;
        if (total === 0) { selectAllInput.checked = false; return; }
        const checkedCount = Array.from(allCelebToggles).filter(toggle => toggle.checked).length;
        if (checkedCount === total) { selectAllInput.checked = true; } else { selectAllInput.checked = false; }
    }

    // --- TIMER LOGIC ---
    function startReloadTimer(minutes) {
        currentTimerTotalDuration = minutes * 60;
        if (activeTimerId) clearInterval(activeTimerId);
        let endTimeStr = sessionStorage.getItem(CONFIG.TIMER_END_TIME_KEY);
        let endTime;
        if (!endTimeStr) {
            endTime = Date.now() + currentTimerTotalDuration * 1000;
            sessionStorage.setItem(CONFIG.TIMER_END_TIME_KEY, endTime.toString());
            log(`Hẹn giờ bắt đầu. Tải lại sau ${minutes} phút.`, 'timer');
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
        if (webLogObserver) clearInterval(webLogObserver); // Dừng theo dõi log khi hủy hẹn giờ
        if (activeTimerId) { // Nếu có hẹn giờ đang chạy
            clearInterval(activeTimerId); activeTimerId = null;
            log('Hẹn giờ đã bị hủy.', 'info');
            updateTimerUI();
        }
        sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
    }
    function executeTimerReset() {
        log('Hết giờ hẹn. Đang tải lại...', 'timer');
        incrementAutoResetCount(); // Tăng số lần auto reset (Reset) do hẹn giờ
        localStorage.setItem(CONFIG.TIMER_RESTART_KEY, 'true');
        localStorage.setItem(CONFIG.AUTO_RELOAD_KEY, 'true');
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
        location.reload();
    }

    function showPreRunCountdown(callback) {
        const overlay = document.createElement('div');
        overlay.id = 'auto-celeb-pre-run-overlay';
        overlay.innerHTML = '<div id="auto-celeb-pre-run-modal"><h2>Anti-Lag</h2><p>Bắt đầu sau:</p><div id="auto-celeb-pre-run-timer">3</div></div>';
        document.body.appendChild(overlay);
        let countdown = 3;
        const interval = setInterval(() => {
            countdown--;
            const timerEl = document.getElementById('auto-celeb-pre-run-timer');
            if (timerEl) timerEl.textContent = countdown.toString();
            if (countdown <= 0) { clearInterval(interval); overlay.remove(); callback(); }
        }, 1000);
    }

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
        try {
            webLogTextarea = await waitForElementById(webLogId, 10000, 250);
            // Khi log của celeb cuối cùng xuất hiện, modal của nó đã mở.
            // Ta cần xóa class 'modal-open' và backdrop để tránh lỗi layout và cho phép cuộn.
            document.body.classList.remove('modal-open');
            const backdrops = document.querySelectorAll('.modal-backdrop.show');
            backdrops.forEach(backdrop => backdrop.remove());
        } catch (e) {
            log(`Web log ${webLogId} not found.`, 'warn'); return;
        }

        log(`Bắt đầu theo dõi nhật ký của ${celebId}...`, 'info');
        let lastLogContent = "";

        // Xóa log cũ của script và bắt đầu hiển thị log của trang web
        const scriptLogTextarea = document.getElementById('dashboard-script-log');
        if (scriptLogTextarea) {
            scriptLogTextarea.value = ''; // Xóa sạch log cũ
            lastLogContent = webLogTextarea.value; // Lấy nội dung log hiện tại của web
            scriptLogTextarea.value = lastLogContent; // Hiển thị ngay lập tức
            scriptLogTextarea.scrollTop = scriptLogTextarea.scrollHeight;
        }

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
                    log(`Mất kết nối. Thử lại lần ${counter}/${CONFIG.CONNECTION_LOST_MAX_RETRIES}.`, 'warn');

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

    async function runFullAutoProcess(celebIds, totalCount) {
        log(`Bắt đầu quy trình Full-Auto cho ${totalCount} celeb...`, 'rocket');

        // Giai đoạn 1: Click "Thêm bạn bè" trên tất cả các celeb đã chọn để mở rộng thẻ của họ.
        // Việc này được thực hiện trước để tránh việc các nút biến mất sau khi click "Bắt đầu" ở celeb đầu tiên.
        log('Giai đoạn 1: Mở rộng tất cả các thẻ celeb đã chọn...', 'info');
        for (const currentId of celebIds) {
            const currentState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
            if (!currentState.isRunning) {
                log('Người dùng đã dừng quy trình giữa chừng (giai đoạn 1).', 'info');
                return; // Thoát hoàn toàn nếu người dùng dừng
            }

            const parentElement = document.getElementById(currentId + '_parentElement');
            const profileDiv = parentElement?.closest('.profile');
            const button = profileDiv?.querySelector('button.showMoreBtn');

            if (button && button.textContent.includes('Thêm bạn bè')) {
                button.click();
                // Ngay sau khi click, tìm và xóa lớp nền đen có thể xuất hiện
                await sleep(50); // Chờ một chút để DOM cập nhật
                const backdrops = document.querySelectorAll('.modal-backdrop.show');
                backdrops.forEach(backdrop => backdrop.remove());
                await sleep(100); // Thêm một khoảng dừng nhỏ giữa các lần click
            }
        }
        await sleep(1000); // Chờ 1 giây để đảm bảo tất cả các nút "Bắt đầu" đã xuất hiện

        // Giai đoạn 2: Lặp lại danh sách và click "Bắt đầu" cho từng celeb.
        for (let i = 0; i < celebIds.length; i++) {
            const currentId = celebIds[i];

            if (!document.body.classList.contains('auto-celeb-running')) {
                document.body.classList.add('auto-celeb-running');
            }

            const currentState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
            if (!currentState.isRunning) {
                log('Người dùng đã dừng quy trình (giai đoạn 2).', 'info');
                break; // Thoát khỏi vòng lặp nếu người dùng dừng
            }

            const remainingIds = celebIds.slice(i + 1);
            sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ ...currentState, celebIds: remainingIds }));

            runSentCount = totalCount - remainingIds.length;
            saveRunStats(); // Lưu lại số liệu thống kê sau mỗi lần gửi
            updateStatsDisplay();

            // Lấy lại thông tin để hiển thị popup
            const profileDiv = document.getElementById(currentId + '_parentElement')?.closest('.profile');
            const name = profileDiv?.querySelector('.profile-name')?.textContent.trim() || currentId;
            const imgSrc = profileDiv?.querySelector('.profile-circle img')?.src || CONFIG.LOGO_URL;

            showCelebPopup(name, `(${runSentCount}/${totalCount})`);
            processedCelebs.push({ id: currentId, name: name, imgSrc: imgSrc });
            sessionStorage.setItem(CONFIG.PROCESSED_CELEBS_KEY, JSON.stringify(processedCelebs));
            updateProcessedCelebsDisplay();

            const startButton = document.getElementById(currentId + '_startButton');
            if (startButton) {
                startButton.click();
                handleChartLog();
                await sleep(250);

                // Xóa lớp phủ màu đen (modal-backdrop) để các popup có thể hiển thị chồng lên nhau.
                const backdrops = document.querySelectorAll('.modal-backdrop.show');
                backdrops.forEach(backdrop => backdrop.remove());

                // Xóa class 'modal-open' khỏi body để có thể cuộn trang nếu cần.
                document.body.classList.remove('modal-open');

                await sleep(150); // Thêm một khoảng dừng ngắn trước khi xử lý celeb tiếp theo.
            } else {
                log(`Không tìm thấy nút "Bắt đầu" cho ${name} sau khi đã mở rộng. Bỏ qua.`, 'error');
            }
        }

        const finalState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
        if (finalState.isRunning) {
            sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ ...finalState, celebIds: [], finished: true }));
            updateControlButtonState({ isRunning: true });
            log('Auto Celeb hoàn tất!', 'success');
            runSentCount = totalCount;
            updateStatsDisplay();

            // Bắt đầu theo dõi log của celeb cuối cùng sau khi hoàn tất
            if (celebIds.length > 0) {
                const lastCelebId = celebIds[celebIds.length - 1];
                startRealtimeLogObserver(lastCelebId);
            }
        }
    }

    function stopCelebScanRetry() { if (celebScanRetryInterval) { clearInterval(celebScanRetryInterval); celebScanRetryInterval = null; } }

    function scanForCelebs() {
        const celebs = [];
        document.querySelectorAll('#celebrityList div.profile').forEach(card => {
            const btn = card.querySelector('button.showMoreBtn');
            const idEl = card.querySelector('[id$="_parentElement"]');

            if (!idEl) return; // Bỏ qua nếu không có ID

            // Chỉ xử lý celeb nếu họ chưa phải là bạn bè hoặc đang trong hàng chờ.
            // Điều này ngăn các celeb đã xử lý (pending/friend) xuất hiện lại trong danh sách auto-add.
            if (btn) {
                const btnText = btn.textContent.trim();
                if (btnText.includes('Bạn bè') || btnText.includes('Đã gửi lời mời')) {
                    return; // Bỏ qua celeb này
                }
            }

            // Nếu không có nút (khi đang chạy auto) hoặc nút là 'Thêm bạn bè', thì celeb này hợp lệ để xử lý.
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
                current, max, percent, progressColor: current >= max ? '#dc2626' : '#34c759'
            });
        });
        return celebs;
    }

    function openDashboardModal() {
        const modal = document.getElementById('celeb-dashboard-modal');
        const listWrapper = document.getElementById('modal-celeb-list-wrapper');
        if (!modal || !listWrapper) return;

        // Hiển thị modal trước để các tính toán scroll (scrollWidth) hoạt động chính xác
        modal.style.display = 'block';
        
        // Mobile positioning logic for Dashboard
        if (window.innerWidth <= 768) {
            const container = document.getElementById('auto-celeb-main-container');
            const rect = container.getBoundingClientRect();
            const topPos = rect.bottom + 10;
            modal.style.top = `${topPos}px`;
            modal.style.left = '50%';
            modal.style.setProperty('transform', 'translateX(-50%)', 'important');
            modal.style.width = 'min(340px, 92vw)';
            modal.style.maxHeight = `calc(100vh - ${topPos}px - 20px)`;
            modal.style.overflowY = 'auto';
        }

        const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
        if (state.isRunning) {
            document.body.classList.add('auto-celeb-running');
            showRunningView();
            loadRunStats();
            
            // Load processed celebs if not already loaded (for success checking)
            const storedProcessed = sessionStorage.getItem(CONFIG.PROCESSED_CELEBS_KEY);
            if (processedCelebs.length === 0 && storedProcessed) {
                 processedCelebs = JSON.parse(storedProcessed);
            }

            updateProcessedCelebsDisplay();
            updateSuccessCelebsDisplay();
            updateStatsDisplay();

            startChartLoop();

            if (runTimerInterval) clearInterval(runTimerInterval);
            runTimerInterval = setInterval(() => {
                updateRunTimer();
                checkSuccessStatus();
            }, 1000);
        } else {
            document.body.classList.remove('auto-celeb-running');
            listWrapper.style.overflow = 'visible'; // Cho phép hiệu ứng hover ở danh sách chọn
            listWrapper.innerHTML = `
                <div class="celeb-list-header"><h3>Danh Sách Celebrity</h3><button id="celeb-refresh-button" class="celeb-refresh-button"><span class="refresh-icon">⟳</span> Làm mới</button></div>
                <div id="celeb-select-all-label"><div id="celeb-select-all-info"><span id="celeb-select-all-text">Chọn tất cả</span><span id="celeb-selected-count">...</span></div><div class="toggle-switch select-all-toggle"><input type="checkbox" id="celeb-select-all-input" class="toggle-switch-input sr-only" checked><label for="celeb-select-all-input" class="toggle-switch-label"><span class="toggle-switch-handle"></span></label></div></div>
                <div id="celeb-selection-list"><p>Đang quét...</p></div>
            `;
            const listContainer = document.getElementById('celeb-selection-list');
            const selectAllInput = document.getElementById('celeb-select-all-input');
            const selectAllContainer = document.getElementById('celeb-select-all-label');
            const countEl = document.getElementById('celeb-selected-count');

            const updateCount = () => {
                if (!countEl) return;
                const toggles = document.querySelectorAll('.celeb-item-toggle-input');
                const selected = Array.from(toggles).filter(toggle => toggle.checked).length;
                countEl.textContent = `Đã chọn ${selected}/${toggles.length} Celeb`;
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
                    const item = document.createElement('label'); // Sử dụng <label> làm phần tử gốc
                    item.className = 'celeb-list-item-new selected'; // Giữ nguyên class để không ảnh hưởng giao diện
                    item.htmlFor = `celeb-toggle-${c.id}`; // Liên kết label với checkbox
                    item.innerHTML = `
                        <div class="celeb-list-item-main">
                            <div class="celeb-list-profile-image"><img src="${c.imgSrc}"><div class="celeb-list-icon">✦</div></div>
                            <div class="celeb-list-profile-info"><div class="celeb-list-profile-name">${c.name}</div><div class="celeb-list-progress"><div class="celeb-list-progress-bar" style="width:${c.percent}%; background:${c.progressColor}"></div></div><div class="celeb-list-progress-text">${c.progressText}</div></div>
                        </div>
                        <div class="celeb-item-toggle-wrapper toggle-switch">
                            <input type="checkbox" value="${c.id}" id="celeb-toggle-${c.id}" class="celeb-item-toggle-input toggle-switch-input sr-only" checked>
                            <div class="toggle-switch-label"><span class="toggle-switch-handle"></span></div>
                        </div>
                    `;
                    const toggle = item.querySelector('input[type="checkbox"]');
                    toggle.addEventListener('change', () => {
                        item.classList.toggle('selected', toggle.checked);
                        syncSelectAllToggle();
                        updateCount();
                    });
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
            if (refBtn) refBtn.onclick = (e) => {
                e.preventDefault();
                refBtn.disabled = true;
                if (countEl) countEl.textContent = 'Đã chọn .../... Celeb';
                listContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;">Đang làm mới...</div>';
                retryLoop(true); setTimeout(() => refBtn.disabled = false, 1500);
            };

            if (!renderList()) retryLoop();
        }

        loadTimerConfig();
        updateControlButtonState(state);
    }

    function startProcessFromModal() {
        const selected = document.querySelectorAll('.celeb-item-toggle-input:checked');
        const ids = Array.from(selected).map(c => c.value);
        if (!ids.length) { log('Chưa chọn celeb nào.', 'error'); return; }

        // Cache lại trạng thái của bảng thống kê trước khi chạy
        const allCelebsBeforeStart = scanCelebsForInfoPanel();
        cachedPendingCelebs = allCelebsBeforeStart.filter(c => c.status === 'pending');
        log('Đã lưu trạng thái "Hàng chờ" trước khi chạy.', 'info');

        sessionStorage.removeItem(CONFIG.LOG_STORAGE_KEY);
        clearRunStats(); // Xóa số liệu thống kê của lần chạy trước

        chartDataPoints = new Array(40).fill(2.5);
        sessionStorage.setItem(CONFIG.CHART_DATA_KEY, JSON.stringify(chartDataPoints));

        processedCelebs = [];
        runSentCount = 0; runSuccessCount = 0; runAutoResetCount = 0;
        successfulCelebIds = new Set();
        runStartTime = Date.now();
        isTabActive = true;

        saveRunStats(); // Lưu trạng thái ban đầu (đã reset)

        if (runTimerInterval) clearInterval(runTimerInterval);
        runTimerInterval = setInterval(() => {
            updateRunTimer();
            checkSuccessStatus();
        }, 1000);

        startChartLoop();

        showRunningView();
        updateStatsDisplay();
        log('Bắt đầu...', 'rocket');

        sessionStorage.setItem('autoCelebOriginalList', JSON.stringify([...ids]));
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [...ids], totalCount: ids.length }));
        updateControlButtonState({ isRunning: true });

        const timerUI = document.getElementById('dashboard-timer-ui');
        if (currentTimerConfig.enabled) {
            startReloadTimer(currentTimerConfig.minutes);
        } else if (timerUI) {
            timerUI.classList.add('disabled');
        }
        runFullAutoProcess(ids, ids.length);
    }

    function stopProcess() {
        cancelReloadTimer();
        localStorage.removeItem(CONFIG.TIMER_RESTART_KEY);
        localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.PROCESSED_CELEBS_KEY);

        sessionStorage.removeItem(CONFIG.CHART_DATA_KEY);
        stopChartLoop();

        clearRunStats(); // Xóa tất cả số liệu thống kê khi dừng thủ công
        // Xóa cache trạng thái thống kê
        cachedPendingCelebs = null;
        log('Đã xóa cache trạng thái "Hàng chờ".', 'info');

        if (runTimerInterval) clearInterval(runTimerInterval);

        log('Người dùng đã dừng. Đang tải lại...', 'info');
        location.reload();
    }

    function startProcessFromSavedList() {
        const originalListStr = sessionStorage.getItem('autoCelebOriginalList');
        if (!originalListStr) {
            log('Không tìm thấy danh sách celeb đã lưu để khởi động lại.', 'error');
            return;
        }
        const ids = JSON.parse(originalListStr);

        sessionStorage.removeItem(CONFIG.LOG_STORAGE_KEY);
        sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);

        chartDataPoints = new Array(40).fill(2.5);
        sessionStorage.setItem(CONFIG.CHART_DATA_KEY, JSON.stringify(chartDataPoints));

        // Load processed celebs from storage to resume counting
        const storedProcessed = sessionStorage.getItem(CONFIG.PROCESSED_CELEBS_KEY);
        processedCelebs = storedProcessed ? JSON.parse(storedProcessed) : [];

        // Tải lại số liệu thống kê từ lần chạy trước thay vì reset
        if (!loadRunStats()) {
            // Fallback nếu không có dữ liệu, khởi tạo lại
            runConnectionLostCount = 0; runSentCount = 0; runSuccessCount = 0; runAutoResetCount = 0;
            successfulCelebIds = new Set();
            runStartTime = Date.now();
            saveRunStats();
        }

        isTabActive = true;

        if (runTimerInterval) clearInterval(runTimerInterval);
        runTimerInterval = setInterval(() => {
            updateRunTimer();
            checkSuccessStatus();
        }, 1000);

        startChartLoop();
        showRunningView();
        updateStatsDisplay();
        log('Khởi động lại từ danh sách đã lưu...', 'rocket');
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ isRunning: true, celebIds: [...ids], totalCount: ids.length }));
        updateControlButtonState({ isRunning: true });
        runFullAutoProcess(ids, ids.length);
    }

    // --- FRIENDS LOGIC ---
    const FRIEND_SELECTORS = {
        searchInput: '#usernameSearchInput',
        searchButton: '#usernameSearchSubmit',
        profileResultContainer: '#usernameSearchStatus .profile',
        actionButton: '#usernameSearchStatus .profile button',
    };

    function populateFriendToolUI() {
        const wrapper = document.getElementById('auto-friend-tool-wrapper');
        if (!wrapper) return;

        let currentLoopId = null;

        const performSearch = async (uid) => {
            try {
                showToastNotification(`Đang tìm kiếm <strong>@${uid}</strong>`, 'processing', 2000);
                const input = await waitForElement(FRIEND_SELECTORS.searchInput, 1000);
                const btn = await waitForElement(FRIEND_SELECTORS.searchButton, 1000);
                const old = document.querySelector(FRIEND_SELECTORS.profileResultContainer);
                if (old) old.remove();
                input.value = uid; input.dispatchEvent(new Event('input', { bubbles: true })); btn.click();
                await waitForElement(FRIEND_SELECTORS.profileResultContainer, 5000);
                const actionBtn = document.querySelector(FRIEND_SELECTORS.actionButton);
                if (actionBtn) {
                    const btnText = actionBtn.textContent;
                    if (btnText.includes('Thêm bạn bè')) {
                        log(`Đã tìm thấy nút "Thêm bạn bè" cho @${uid}. Đang gửi yêu cầu...`, 'info');
                        actionBtn.click();
                        await sleep(1500); // Chờ một chút để yêu cầu được xử lý
                        return 'CLICKED_ADD';
                    } else if (btnText.includes('Bạn bè')) {
                        return 'IS_FRIEND';
                    } else if (btnText.includes('Đã yêu cầu') || btnText.includes('Hủy')) {
                        return 'WAITING'; // Trạng thái đang chờ, không cần làm gì
                    }
                }
                return 'NO_ACTION'; // Không tìm thấy nút hoặc trạng thái không xác định
            } catch (e) { log(`Lỗi khi tìm kiếm ${uid}: ${e.message}`, 'error'); return 'ERROR'; }
        };

        const stopAllLoops = () => {
            if (currentLoopId && typeof currentLoopId.stop === 'function') {
                currentLoopId.stop(); // Gọi hàm để dừng vòng lặp while
            }
            currentLoopId = null;
            document.querySelectorAll('.friend-tool-start-btn.running').forEach(btn => {
                btn.classList.remove('running');
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5.536 21.886a1.004 1.004 0 0 0 1.033-.064l13-9a1 1 0 0 0 0-1.644l-13-9A1 1 0 0 0 5 3v18a1 1 0 0 0 .536.886z"></path></svg>`;
                btn.title = "Bắt đầu lặp";
            });
            document.querySelectorAll('.celeb-list-item-new').forEach(card => {
                card.classList.remove('disabled', 'running-celeb');
            });
        };

        CELEB_LIST.forEach(c => {
            const card = document.createElement('div');
            const isLocketHq = c.uid === 'locket.hq';
            const buttonHtml = isLocketHq
                ? `<button class="friend-tool-start-btn disabled" title="Không thể tìm kiếm" disabled>
                       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
                   </button>`
                : `<button class="friend-tool-start-btn" data-uid="${c.uid}" title="Bắt đầu lặp">
                       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5.536 21.886a1.004 1.004 0 0 0 1.033-.064l13-9a1 1 0 0 0 0-1.644l-13-9A1 1 0 0 0 5 3v18a1 1 0 0 0 .536.886z"></path></svg>
                   </button>`;

            card.className = 'celeb-list-item-new';
            card.innerHTML = `
                <div class="celeb-list-item-main">
                    <div class="celeb-list-profile-image">
                        <img src="${c.imgSrc}" alt="${c.name}">
                        <div class="celeb-list-icon">✦</div>
                    </div>
                    <div class="celeb-list-profile-info">
                        <div class="celeb-list-profile-name">${c.name}</div>
                        <div class="celeb-list-progress-text" style="color: #888;">@${c.uid}</div>
                    </div>
                </div>
                ${buttonHtml}
            `;
            const mainPart = card.querySelector('.celeb-list-item-main');
            if (mainPart) {
                mainPart.style.cursor = 'pointer';
                mainPart.title = 'Click để sao chép ID';
                mainPart.onclick = () => {
                    navigator.clipboard.writeText(c.uid).then(() => {
                        showToastNotification(`Đã sao chép ID: <strong>@${c.uid}</strong>`, 'success', 2000);
                    }).catch(err => log(`Lỗi khi sao chép ID: ${err}`, 'error'));
                };
            }
            if (!isLocketHq) {
                const startBtn = card.querySelector('.friend-tool-start-btn');
                startBtn.onclick = () => {
                    if (startBtn.classList.contains('running')) {
                        stopAllLoops();
                        location.reload(); // Tải lại trang khi người dùng nhấn dừng
                    }
                    else {
                        stopAllLoops();
                        startBtn.classList.add('running');
                        card.classList.add('running-celeb');
                        startBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`; // Pause icon
                        startBtn.title = "Dừng lặp";
                        document.querySelectorAll('.celeb-list-item-new').forEach(el => { if (el !== card) el.classList.add('disabled'); });

                        // --- CƠ CHẾ LẶP MỚI ---
                        let keepRunning = true;
                        let isFirstRun = true;
                        currentLoopId = { stop: () => { keepRunning = false; } }; // Tạo một object để điều khiển vòng lặp

                        const loop = async () => {
                            while (keepRunning) {
                                const status = await performSearch(c.uid);

                                if (status === 'IS_FRIEND') {
                                    if (isFirstRun) {
                                        showToastNotification(`Bạn đã là bạn bè với <strong>@${c.uid}</strong>.`, 'success', 3000);
                                    } else {
                                        showToastNotification(`Kết bạn thành công với <strong>@${c.uid}</strong>!`, 'success', 4000);
                                    }
                                    stopAllLoops();
                                    break; // Thoát khỏi vòng lặp while
                                }

                                isFirstRun = false;

                                // Chờ 2.5 giây trước khi lặp lại
                                await sleep(2500);
                            }
                        };

                        loop(); // Bắt đầu vòng lặp
                    }
                }
            }
            wrapper.appendChild(card);
        });
    }

    /**
     * Bắt đầu một vòng lặp kiểm tra API trong nền để phát hiện các thay đổi (key, phiên bản, trạng thái)
     * và phản ứng ngay lập tức mà không cần người dùng tải lại trang.
     */
    function startBackgroundApiCheck() {
        if (backgroundApiCheckInterval) clearInterval(backgroundApiCheckInterval);

        const CHECK_INTERVAL_MS = 10 * 1000; // Kiểm tra mỗi 10 giây

        backgroundApiCheckInterval = setInterval(async () => {
            try {
                // Lấy dữ liệu mới nhất từ API, bỏ qua cache
                const freshApiData = await fetchApiData(true, true); // (isBackgroundRefresh, forceRefresh)

                if (!freshApiData || freshApiData.length === 0) {
                    // Không làm gì nếu API tạm thời lỗi, chỉ log để debug
                    console.warn('[Auto Locket Celeb] Kiểm tra API ngầm: Không nhận được dữ liệu.');
                    return;
                }

                const openVersions = freshApiData.filter(entry => entry.status === 'Mở');
                const newActiveEntry = openVersions.length > 0 ? openVersions.sort((a, b) => b.stt - a.stt)[0] : null;

                const container = document.getElementById('auto-celeb-main-container');
                const keyWallTitle = document.querySelector('#key-wall-title');
                // Xác định xem có phải đang bị khóa do bảo trì không
                const isMaintenanceLocked = container.classList.contains('locked') && keyWallTitle && keyWallTitle.textContent === 'Thông báo';

                // Kịch bản 0: Hệ thống vừa được mở lại sau khi tạm dừng
                if (newActiveEntry && isMaintenanceLocked) {
                    log('Hệ thống đã hoạt động trở lại. Đang tải lại công cụ...', 'success');
                    showToastNotification('Hệ thống đã hoạt động trở lại!', 'success', 3000);
                    // Dừng interval để tránh lặp lại trước khi reload
                    if (backgroundApiCheckInterval) clearInterval(backgroundApiCheckInterval);
                    setTimeout(() => location.reload(), 2000);
                    return; // Dừng kiểm tra ở đây để chờ trang tải lại
                }

                // Kịch bản 1: Công cụ bị tạm dừng
                if (!newActiveEntry) {
                    if (isMaintenanceLocked) return; // Đã ở trạng thái khóa bảo trì, không cần làm gì thêm.

                    log('Hệ thống đã tạm dừng (phát hiện ngầm). Đang khóa công cụ...', 'error');

                    const dashboardModal = document.getElementById('celeb-dashboard-modal');
                    const infoModal = document.getElementById('modal-information');
                    const openDashboardButton = document.getElementById('auto-celeb-open-dashboard-btn');
                    const infoButton = document.getElementById('auto-celeb-info-btn');

                    if (dashboardModal) dashboardModal.style.display = 'none';
                    if (infoModal) infoModal.style.display = 'none';

                    if (openDashboardButton) {
                        const label = openDashboardButton.querySelector('.action-btn-label');
                        if(label) label.textContent = 'Mở Bảng Điều Khiển';
                        openDashboardButton.classList.remove('close-mode');
                        const chevron = openDashboardButton.querySelector('.action-btn-chevron');
                        if (chevron) chevron.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // >
                    }
                    if (infoButton) {
                        const label = infoButton.querySelector('.action-btn-label');
                        if(label) label.textContent = 'Mở Bảng Thống Kê';
                        infoButton.classList.remove('close-mode');
                        infoButton.classList.add('card-indigo');
                        const chevron = infoButton.querySelector('.action-btn-chevron');
                        if (chevron) chevron.innerHTML = `<path d="m9 18 6-6-6-6"/>`; // >
                    }

                    const keyWall = document.getElementById('auto-celeb-key-wall');
                    container.classList.add('locked');
                    if (keyWall) {
                        keyWall.style.display = 'flex';
                        keyWall.innerHTML = `
                        <img id="key-wall-icon" src="${CONFIG.LOGO_URL}" alt="Logo">
                        <h3 id="key-wall-title" style="color: #ef4444;">Thông báo</h3>
                        <p id="key-wall-message">Công cụ đang tạm dừng hoạt động để bảo trì hoặc cập nhật.<br>Vui lòng quay lại sau.</p>
                        <div style="margin-top: 10px;">
                            <a href="${CONFIG.MESSENGER_LINK}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 600;">Theo dõi thông tin tại Messenger</a>
                        </div>
                    `;
                    }
                    // Dừng quy trình auto nếu đang chạy
                    const state = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
                    if (state.isRunning) {
                        stopProcess(); // Hàm này sẽ tải lại trang
                    }
                    return;
                }

                // Kịch bản 2: Key đã thay đổi
                const storedKey = localStorage.getItem(CONFIG.KEY_STORAGE_KEY);
                if (storedKey !== String(newActiveEntry.key)) {
                    log('Key đã thay đổi (phát hiện ngầm). Yêu cầu kích hoạt lại.', 'error');
                    localStorage.removeItem(CONFIG.KEY_STORAGE_KEY);
                    location.reload();
                    return;
                }

                // Kịch bản 3: Có phiên bản mới
                if (window.location.href.startsWith(CONFIG.TARGET_PAGE) && compareVersions(newActiveEntry.version, CONFIG.SCRIPT_VERSION) > 0) {
                    const updateNotice = document.getElementById('auto-celeb-update-notice');
                    if (updateNotice && updateNotice.style.display !== 'flex') {
                        log(`Phát hiện phiên bản mới ngầm: ${newActiveEntry.version}. Hiển thị thông báo.`, 'warn');
                        const messageEl = updateNotice.querySelector('#update-notice-message');
                        if (messageEl) {
                            messageEl.innerHTML = `Phiên bản của bạn là <strong>${CONFIG.SCRIPT_VERSION}</strong>. Đã có phiên bản mới <strong>${newActiveEntry.version}</strong>. Vui lòng cập nhật để tiếp tục sử dụng.`;
                        }
                        updateNotice.style.display = 'flex';
                        const actionsWrapper = document.getElementById('auto-celeb-actions-wrapper');
                        const footerButtons = document.getElementById('auto-celeb-footer-buttons');
                        if (actionsWrapper) actionsWrapper.style.display = 'none';
                        if (footerButtons) footerButtons.style.display = 'none';
                    }
                }

            } catch (error) {
                log(`Lỗi trong quá trình kiểm tra API ngầm: ${error.message}`, 'error');
            }
        }, CHECK_INTERVAL_MS);
    }

    // --- MAIN EXECUTION ---
    (async function main() {
        console.log(`[Auto Locket Celeb] ➡️ Đang khởi tạo (${CONFIG.SCRIPT_VERSION})...`);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        setInterval(closeNotificationPopup, 1000);

        // Kiểm tra nếu đang chạy mà người dùng chuyển sang trang khác (không phải celebrity.html) thì dừng auto
        const currentState = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '{}');
        if (currentState.isRunning && !window.location.href.startsWith(CONFIG.TARGET_PAGE)) {
            console.log('[Auto Locket Celeb] ➡️ Phát hiện rời khỏi trang Celebrity. Đang dừng Auto Celeb...');
            sessionStorage.removeItem(CONFIG.STORAGE_KEY);
            sessionStorage.removeItem(CONFIG.PROCESSED_CELEBS_KEY);
            sessionStorage.removeItem(CONFIG.CHART_DATA_KEY);
            sessionStorage.removeItem(CONFIG.LOG_STORAGE_KEY);
            sessionStorage.removeItem(CONFIG.TIMER_END_TIME_KEY);
            localStorage.removeItem(CONFIG.TIMER_RESTART_KEY);
            localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
            clearRunStats();
        }

        // Dọn dẹp lớp phủ đếm ngược có thể còn sót lại từ lần tải trước
        const preRunOverlay = document.getElementById('auto-celeb-pre-run-overlay');
        if (preRunOverlay) {
            preRunOverlay.remove();
        }

        try {
            injectNewStyles();
            createMainControlUI();
            loadTimerConfig();
            setupMainUIControls();
        } catch (e) { console.error('Init error:', e); return; }

        const container = document.getElementById('auto-celeb-main-container');
        const storedKey = localStorage.getItem(CONFIG.KEY_STORAGE_KEY);

        if (!storedKey) {
            container.classList.add('locked');
            console.log('[Auto Locket Celeb] ➡️ Yêu cầu key kích hoạt.');
            return;
        }

        // Key is present, show loader and start validation
        const loader = document.getElementById('auto-celeb-loader');
        const keyWall = document.getElementById('auto-celeb-key-wall');
        if (keyWall) keyWall.style.display = 'none';
        if (loader) loader.style.display = 'flex';
        container.classList.add('locked'); // Keep it locked during check

        try {
            const apiData = await fetchApiData();
            if (!apiData || apiData.length === 0) throw new Error('Không nhận được dữ liệu hợp lệ từ API.');

            // Lọc ra tất cả các phiên bản đang "Mở"
            const openVersions = apiData.filter(entry => entry.status === 'Mở');

            // Nếu không có phiên bản nào đang mở, hiển thị thông báo tạm dừng
            if (openVersions.length === 0) {
                console.log('[Auto Locket Celeb] ➡️ Hệ thống đang bảo trì/tạm dừng.');
                if (loader) loader.style.display = 'none';
                
                // Hiển thị giao diện thông báo tạm dừng
                container.classList.add('locked');
                if (keyWall) {
                    keyWall.style.display = 'flex';
                    keyWall.innerHTML = `
                        <img id="key-wall-icon" src="${CONFIG.LOGO_URL}" alt="Logo">
                        <h3 id="key-wall-title" style="color: #ef4444;">Thông báo</h3>
                        <p id="key-wall-message">Công cụ đang tạm dừng hoạt động để bảo trì hoặc cập nhật.<br>Vui lòng quay lại sau.</p>
                        <div style="margin-top: 10px;">
                            <a href="${CONFIG.MESSENGER_LINK}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 600;">Theo dõi thông tin tại Messenger</a>
                        </div>
                    `;
                }
                return;
            }

            // Tìm phiên bản mới nhất trong số các phiên bản đang mở
            const activeEntry = openVersions.sort((a, b) => b.stt - a.stt)[0];

            // 1. Kiểm tra cập nhật
        if (window.location.href.startsWith(CONFIG.TARGET_PAGE) && compareVersions(activeEntry.version, CONFIG.SCRIPT_VERSION) > 0) {
                log(`Có phiên bản mới: ${activeEntry.version}. Vui lòng cập nhật.`, 'warn');
                const updateNotice = document.getElementById('auto-celeb-update-notice');
                if (updateNotice) {
                    const messageEl = updateNotice.querySelector('#update-notice-message');
                    if (messageEl) {
                        messageEl.innerHTML = `Phiên bản của bạn là <strong>${CONFIG.SCRIPT_VERSION}</strong>. Đã có phiên bản mới <strong>${activeEntry.version}</strong>. Vui lòng cập nhật để tiếp tục sử dụng.`;
                    }
                    updateNotice.style.display = 'flex';
                }
                if (loader) loader.style.display = 'none';
                return;
            }

            // 2. Xác thực lại key đã lưu
            if (storedKey !== String(activeEntry.key)) {
                 log('Key không hợp lệ hoặc đã thay đổi. Vui lòng kích hoạt lại.', 'error');
                 localStorage.removeItem(CONFIG.KEY_STORAGE_KEY);
                 location.reload(); // Reload to show the key input screen
                 return;
            }

            // Nếu key hợp lệ và phiên bản là mới nhất
            if (loader) loader.style.display = 'none';
            console.log(`[Auto Locket Celeb] ➡️ Kích hoạt thành công (${CONFIG.SCRIPT_VERSION}).`);
            container.classList.remove('locked');

            // Bắt đầu kiểm tra API ngầm liên tục
            startBackgroundApiCheck();

            // Chạy logic riêng cho từng trang
            if (window.location.href.startsWith(CONFIG.FRIENDS_PAGE)) {
                populateFriendToolUI();
            } else if (window.location.href.startsWith(CONFIG.TARGET_PAGE)) {
                runCelebLogic();
            }
        } catch (error) {
            if (loader) loader.style.display = 'none';
            log(`Lỗi xác thực hoặc kiểm tra phiên bản: ${error.message}`, 'error');
            showToastNotification(`Lỗi API: ${error.message}`, 'error', 5000);
            // Giữ UI bị khóa và hiển thị thông báo lỗi
            const errorNotice = document.createElement('div');
            errorNotice.style.cssText = 'padding: 20px; text-align: center; color: #ef4444; font-weight: 600;';
            errorNotice.innerHTML = `Không thể kết nối đến máy chủ để xác thực.<br>Vui lòng thử tải lại trang.`;
            container.appendChild(errorNotice);
            return;
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
                if (state.isRunning && !restartT && !autoReload && isRealReload) {
                    log('Phát hiện F5 thủ công. Đang reset công cụ...', 'info');
                    sessionStorage.removeItem(CONFIG.STORAGE_KEY);
                    sessionStorage.removeItem(CONFIG.LOG_STORAGE_KEY);
                    sessionStorage.removeItem(CONFIG.PROCESSED_CELEBS_KEY);
                    sessionStorage.removeItem('autoCelebRunStartTime');
                    sessionStorage.removeItem(CONFIG.CONNECTION_LOST_COUNTER_KEY);
                    sessionStorage.removeItem(CONFIG.CHART_DATA_KEY);
                    sessionStorage.removeItem('autoCelebOriginalList');
                    localStorage.removeItem('autoCelebAutoResetCount');
                    state = {}; // Reset state variable

                    // Cập nhật lại nút mở dashboard về trạng thái ban đầu
                    if (openBtn) {
                        const label = openBtn.querySelector('.action-btn-label');
                        if(label) label.textContent = 'Mở Bảng Điều Khiển';
                        openBtn.classList.remove('close-mode');
                    }
                    // Cập nhật lại nút thông tin về trạng thái ban đầu
                    const infoBtn = document.getElementById('auto-celeb-info-btn');
                    if (infoBtn) {
                        const label = infoBtn.querySelector('.action-btn-label');
                        if(label) label.textContent = 'Mở Bảng Thống Kê';
                        infoBtn.classList.remove('close-mode');
                    }
                    const infoModal = document.getElementById('modal-information');
                    if (infoModal) {
                        infoModal.style.display = 'none';
                    }
                }

                updateControlButtonState(state);

                if (restartT) {
                    log('Phát hiện khởi động lại do hẹn giờ.', 'timer');
                    localStorage.removeItem(CONFIG.TIMER_RESTART_KEY); localStorage.removeItem(CONFIG.CELEB_RESTART_KEY);
                    showPreRunCountdown(() => {
                        openDashboardModal();
                        if (openBtn) {
                            const label = openBtn.querySelector('.action-btn-label');
                            if(label) label.textContent = 'Đóng Bảng Điều Khiển';
                            openBtn.classList.add('close-mode');
                            const chevron = openBtn.querySelector('.action-btn-chevron');
                            if (chevron) {
                                chevron.innerHTML = `<path d="M15 6L9 12l6 6"/>`; // <
                            }
                        }
                        startProcessFromSavedList(); // Sử dụng hàm mới để chạy lại từ danh sách đã lưu
                    });
                }
            } catch (e) {
                log('Khởi tạo thất bại. Đang tải lại...', 'error');
                localStorage.setItem(CONFIG.AUTO_RELOAD_KEY, 'true');
                location.reload();
            }
        }
    })();
})();
