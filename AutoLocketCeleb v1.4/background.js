const getInitialState = () => ({
    isRunning: false, isPaused: false, idList: [], currentIndex: 0,
    results: {}, logs: [], activeTabId: null,
    timerSettings: { enabled: false, minutes: 5, countdown: '', nextRefresh: null },
    refreshTimeoutId: null, countdownIntervalId: null
});
let state = getInitialState();

// Tự động khôi phục trạng thái
(async () => {
    const result = await chrome.storage.local.get(null);
    if (Object.keys(result).length > 0) {
        state = result;
        if (state.isRunning) {
            state.isPaused = true;
        }
        clearTimers();
    }
})();

function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    state.logs.push(`[${timestamp}] ${message}`);
    if (state.logs.length > 200) state.logs.shift();
    updateState();
}

function updateState() {
    chrome.runtime.sendMessage({ action: 'updateState', state });
    chrome.storage.local.set(state);
}

async function findOrCreateLocketTab() {
    const targetUrl = 'https://locket.binhake.dev/friends.html';
    let tabs = await chrome.tabs.query({ url: "*://*.locket.binhake.dev/*" });
    if (tabs.length > 0) {
        const tab = tabs[0];
        if (tab.url !== targetUrl) await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
        else await chrome.tabs.update(tab.id, { active: true });
        await new Promise(r => setTimeout(r, 500));
        return tab;
    } else {
        const tab = await chrome.tabs.create({ url: targetUrl, active: true });
        await new Promise(r => setTimeout(r, 1500));
        return tab;
    }
}

async function preScanFriends(ids, tabId) {
    log('Bắt đầu quét sơ bộ danh sách...');
    state.isRunning = true;
    updateState();
    for (const id of ids) {
        const currentState = await chrome.storage.local.get(['isRunning', 'isPaused']);
        if (!currentState.isRunning || currentState.isPaused) {
            log('Quá trình quét bị tạm dừng.');
            return;
        }
        log(`[Quét] Kiểm tra ID: ${id}...`);
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'checkFriendStatus', id: id });
            if (response && response.isFriend) {
                state.results[id] = 'Đã là bạn';
                updateState();
            }
        } catch (error) {
            log(`[Quét] Lỗi khi kiểm tra ${id}: ${error.message}`);
        }
        await new Promise(r => setTimeout(r, 500));
    }
    log('Hoàn tất quét sơ bộ.');
}

async function processNextId() {
    state.currentIndex = state.idList.findIndex((id, index) => index >= state.currentIndex && !state.results[id]);
    
    if (state.currentIndex === -1 || !state.isRunning || state.isPaused) {
        if (state.isRunning) {
            log('Hoàn tất quá trình!');
            state.isRunning = false;
        }
        clearTimers();
        updateState();
        return;
    }
    
    const currentId = state.idList[state.currentIndex];
    log(`Bắt đầu xử lý ID: ${currentId}`);
    updateState();
    
    const tabId = state.activeTabId;
    if (!tabId) {
        log('Lỗi: Không tìm thấy tab làm việc.'); state.isRunning = false; updateState(); return;
    }
    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'processId', id: currentId });
        if (response && response.message) {
            log(`Kết quả cho ID ${currentId}: ${response.message}`);
            state.results[currentId] = response.message;
        } else {
            log(`Lỗi giao tiếp với ID ${currentId}.`);
            state.results[currentId] = 'Lỗi giao tiếp';
        }
    } catch (error) {
        log(`Lỗi khi xử lý ID ${currentId}: ${error.message}`);
        state.results[currentId] = 'Lỗi';
    }
    state.currentIndex++;
    updateState();
    
    setTimeout(processNextId, 2000); 
}

function clearTimers() {
    if (state.refreshTimeoutId) clearTimeout(state.refreshTimeoutId);
    if (state.countdownIntervalId) clearInterval(state.countdownIntervalId);
    state.timerSettings.countdown = '';
    state.timerSettings.nextRefresh = null;
    state.refreshTimeoutId = null;
    state.countdownIntervalId = null;
}

function scheduleRefresh(minutes) {
    clearTimers();
    if (!state.isRunning || state.isPaused || !state.timerSettings.enabled || !minutes || minutes < 1) return;

    log(`Hẹn giờ F5 trang sau ${minutes} phút.`);
    const now = Date.now();
    state.timerSettings.nextRefresh = now + minutes * 60 * 1000;

    state.refreshTimeoutId = setTimeout(() => {
        log('Đến giờ F5, đang tải lại trang...');
        if (state.activeTabId) chrome.tabs.reload(state.activeTabId);
    }, minutes * 60 * 1000);

    state.countdownIntervalId = setInterval(() => {
        const remaining = (state.timerSettings.nextRefresh || 0) - Date.now();
        if (remaining <= 0) {
            clearInterval(state.countdownIntervalId);
            state.timerSettings.countdown = 'F5...';
        } else {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            state.timerSettings.countdown = `F5 sau: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        updateState();
    }, 1000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        switch (message.action) {
            case 'start':
                const startTab = await findOrCreateLocketTab();
                try {
                    await chrome.scripting.executeScript({ target: { tabId: startTab.id }, files: ['content_script.js'] });
                } catch(e) { console.error(e); }
                state = { ...getInitialState(), idList: message.ids, activeTabId: startTab.id, timerSettings: { ...state.timerSettings, ...message.timerSettings } };
                await preScanFriends(message.ids, startTab.id);
                if(state.isRunning && !state.isPaused) {
                    if (state.timerSettings.enabled) {
                        scheduleRefresh(state.timerSettings.minutes);
                    }
                    log('Bắt đầu xử lý các ID còn lại...');
                    processNextId();
                }
                break;
            case 'pause':
                if (state.isRunning) { state.isPaused = true; clearTimers(); log('Đã tạm dừng.'); updateState(); }
                break;
            case 'resume':
                if (state.isRunning && state.isPaused) {
                    state.isPaused = false;
                    if (state.timerSettings.enabled) {
                        scheduleRefresh(state.timerSettings.minutes);
                    }
                    log('Tiếp tục quá trình...'); updateState(); processNextId();
                }
                break;
            case 'stop':
                 if (state.isRunning) { state.isRunning = false; state.isPaused = false; clearTimers(); log('Đã dừng bởi người dùng.'); updateState(); }
                 break;
            case 'reset':
                clearTimers();
                state = getInitialState();
                log('Công cụ đã được reset.');
                chrome.storage.local.clear(() => { updateState(); });
                break;
             case 'prepareTab':
                const tab = await findOrCreateLocketTab();
                try {
                    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content_script.js'] });
                } catch (e) { console.error(e); }
                break;
            case 'logFromContent':
                if (state.idList && state.idList[state.currentIndex]) {
                    log(`[${state.idList[state.currentIndex]}] ${message.message}`);
                } else {
                     log(`[Log] ${message.message}`);
                }
                break;
            case 'getState':
                sendResponse(state);
                break;
        }
    })();
    return true;
});

// *** SỬA LỖI VÀ NÂNG CẤP TẠI ĐÂY ***
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Chỉ thực hiện khi trang đã tải xong hoàn toàn và công cụ đang chạy (không bị tạm dừng)
    if (tabId === state.activeTabId && changeInfo.status === 'complete' && state.isRunning && !state.isPaused) {
        log('Trang đã tải lại xong. Chuẩn bị tiếp tục...');
        
        try {
            // 1. Tiêm lại content script để tái thiết lập kết nối
            await chrome.scripting.executeScript({
                target: { tabId: state.activeTabId },
                files: ['content_script.js']
            });
            log('Đã tiêm lại tập lệnh sau khi F5.');

            // 2. Nếu hẹn giờ đang bật, đặt lại lịch cho lần F5 tiếp theo
            if (state.timerSettings.enabled) {
                scheduleRefresh(state.timerSettings.minutes);
            }

            // 3. Quan trọng nhất: Gọi lại vòng lặp xử lý để tiếp tục công việc
            log('Tiếp tục quá trình xử lý...');
            processNextId();

        } catch (e) {
            log(`Lỗi nghiêm trọng sau khi F5: ${e}. Dừng công cụ.`);
            state.isRunning = false;
            updateState();
        }
    }
});