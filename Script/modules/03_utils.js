
    // --- TIỆN ÍCH ---
    function getTimestamp() {
        const now = new Date();
        const date = [now.getDate().toString().padStart(2, '0'), (now.getMonth() + 1).toString().padStart(2, '0'), now.getFullYear()];
        const time = [now.getHours().toString().padStart(2, '0'), now.getMinutes().toString().padStart(2, '0'), now.getSeconds().toString().padStart(2, '0')];
        return `[${date.join('/')} ${time.join(':')}]`;
    }

    function log(message, type = 'log') {
        const styles = { log: 'color: inherit;', info: 'color: #3b82f6;', success: 'color: #22c55e;', error: 'color: #ef4444; font-weight: bold;', rocket: '', timer: 'color: #f59e0b;', warn: 'color: #f59e0b;' };
        const prefix = type === 'rocket' ? '🚀' : (type === 'success' ? '✅' : (type === 'info' ? 'ℹ️' : (type === 'timer' ? '⏱️' : (type === 'warn' ? '⚠️' : '➡️'))));
        console.log(`%c[Auto Locket Celeb]%c ${prefix} ${message}`, 'color: #8b5cf6; font-weight: bold;', styles[type] || styles.log);
        try {
            const logTextarea = document.getElementById('dashboard-script-log');
            const filteredMessages = ["Thời gian hẹn giờ tối thiểu", "Tăng thời gian hẹn giờ lên", "Giảm thời gian hẹn giờ xuống", "Đã TIẾP TỤC đồng hồ đếm ngược", "Hẹn giờ ĐÃ TẮT", "Hẹn giờ ĐÃ BẬT", 'Bắt đầu theo dõi nhật ký của', 'Tiếp tục xử lý danh sách celeb...', 'Vui lòng nhập username để bắt đầu lặp.'];
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
        if (window.location.href !== CONFIG.TARGET_PAGE) return;
        try {
            const storedLog = sessionStorage.getItem(CONFIG.LOG_STORAGE_KEY);
            const logTextarea = document.getElementById('dashboard-script-log');
            if (logTextarea && storedLog) {
                logTextarea.value = storedLog;
                logTextarea.scrollTop = logTextarea.scrollHeight;
            }
        } catch (e) { console.error('[Auto Locket Celeb] Lỗi tải log: ', e); }
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

    function waitForElementById(elementId, timeout = 180000, interval = 500) {
        return new Promise((resolve, reject) => {
            let elapsedTime = 0;
            const check = () => {
                const element = document.getElementById(elementId);
                if (element) resolve(element);
                else {
                    elapsedTime += interval;
                    if (elapsedTime >= timeout) { log(`Hết thời gian chờ element ID: ${elementId}`, 'error'); reject(new Error(`Timeout waiting for ${elementId}`)); }
                    else setTimeout(check, interval);
                }
            };
            check();
        });
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
    
    function findButtonByText(text) {
        const buttons = document.querySelectorAll('button');
        const searchText = text.trim().toLowerCase();
        for (const button of buttons) {
            if (button.textContent.trim().toLowerCase() === searchText) return button;
        }
        return null;
    }
