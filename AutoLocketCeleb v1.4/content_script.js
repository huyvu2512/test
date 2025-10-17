const SELECTORS = {
    searchInput: '#usernameSearchInput',
    searchButton: '#usernameSearchSubmit',
    profileResultContainer: '#usernameSearchStatus .profile',
    actionButton: '#usernameSearchStatus .profile button',
    friendListProfiles: '#friendsListDiv .profile'
};

function waitForElement(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) {
                clearInterval(timeoutId); clearInterval(interval); resolve(element);
            }
        }, 100);
        const timeoutId = setTimeout(() => {
            clearInterval(interval); reject(new Error(`Không tìm thấy element "${selector}" sau ${timeout}ms`));
        }, timeout);
    });
}

async function checkFriendStatus(id) {
    try {
        const searchInput = await waitForElement(SELECTORS.searchInput);
        const searchButton = await waitForElement(SELECTORS.searchButton);
        searchInput.value = id;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        const oldResult = document.querySelector(SELECTORS.profileResultContainer);
        if (oldResult) oldResult.remove();
        searchButton.click();
        
        await waitForElement(SELECTORS.profileResultContainer, 2000);
        
        const actionButton = document.querySelector(SELECTORS.actionButton);
        if (actionButton) {
            const buttonText = actionButton.textContent.trim();
            if (buttonText.includes('Bạn bè') || buttonText.includes('Đã yêu cầu')) {
                return { isFriend: true };
            }
        }
    } catch (e) {
        return { isFriend: false };
    }
    return { isFriend: false };
}

async function handleIdProcessing(id) {
    try {
        const searchInput = await waitForElement(SELECTORS.searchInput);
        const searchButton = await waitForElement(SELECTORS.searchButton);
        searchInput.value = id;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (searchInput.validity.patternMismatch) {
            return { success: true, message: 'ID không hợp lệ' };
        }
        let resultMessage = 'Đang tìm kiếm...';
        while (true) {
            const storedState = await chrome.storage.local.get(['isRunning', 'isPaused']);
            if (!storedState.isRunning || storedState.isPaused) {
                resultMessage = 'Đã tạm dừng'; break;
            }
            const oldResult = document.querySelector(SELECTORS.profileResultContainer);
            if (oldResult) oldResult.remove();
            searchButton.click();
            try {
                await waitForElement(SELECTORS.profileResultContainer);
                const actionButton = document.querySelector(SELECTORS.actionButton);
                if (actionButton) {
                    const buttonText = actionButton.textContent.trim();
                    chrome.runtime.sendMessage({ action: 'logFromContent', message: `Tìm thấy nút: "${buttonText}"` });
                    if (buttonText.includes('Thêm bạn bè')) {
                        actionButton.click();
                        chrome.runtime.sendMessage({ action: 'logFromContent', message: `Đã nhấn 'Thêm bạn bè', đang xác nhận...` });
                        let isVerified = false;
                        
                        for (let i = 0; i < 5; i++) {
                            await new Promise(r => setTimeout(r, 500));
                            const updatedButton = document.querySelector(SELECTORS.actionButton);
                            if (updatedButton && updatedButton.textContent.trim().includes('Đã yêu cầu')) {
                                resultMessage = 'Đã gửi (Đã xác nhận)'; isVerified = true; break;
                            }
                        }
                        if (isVerified) break;
                        else {
                            chrome.runtime.sendMessage({ action: 'logFromContent', message: `Xác nhận thất bại, thử lại...` });
                            continue;
                        }
                    } else if (buttonText.includes('Đã yêu cầu') || buttonText.includes('Bạn bè') || buttonText.toLowerCase().includes('full')) {
                        resultMessage = `Bỏ qua (${buttonText})`; break;
                    }
                }
            } catch (e) {
                chrome.runtime.sendMessage({ action: 'logFromContent', message: `Không có kết quả, chờ...` });
            }
            
            // *** THAY ĐỔI TẠI ĐÂY ***
            await new Promise(r => setTimeout(r, 2000)); 
        }
        return { success: true, message: resultMessage };
    } catch (error) {
        return { success: false, message: `Lỗi: Không tìm thấy ô input/nút tìm kiếm.` };
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'processId') {
        handleIdProcessing(request.id).then(sendResponse);
        return true;
    }
    if (request.action === 'checkFriendStatus') {
        checkFriendStatus(request.id).then(sendResponse);
        return true;
    }
    if (request.action === 'getFriendUsernames') {
        (async () => {
            try {
                await waitForElement(SELECTORS.friendListProfiles, 7000);
                const friendProfiles = document.querySelectorAll(SELECTORS.friendListProfiles);
                const friendUsernames = Array.from(friendProfiles).map(profile => profile.dataset.username);
                sendResponse(friendUsernames);
            } catch (error) {
                sendResponse([]);
            }
        })();
        return true;
    }
});