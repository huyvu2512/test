// Thêm các phần tử DOM mới
const enableTimerEl = document.getElementById('enable-timer');
const timerMinutesEl = document.getElementById('timer-minutes');
const countdownDisplayEl = document.getElementById('countdown-display');

// Các phần tử DOM cũ
const idListEl = document.getElementById('id-list');
const celebSelectEl = document.getElementById('celeb-select');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const stopBtn = document.getElementById('stop-btn');
const resetBtn = document.getElementById('reset-btn');
const rescanBtn = document.getElementById('rescan-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const progressStatusEl = document.getElementById('progress-status');
const progressTableBodyEl = document.querySelector('#progress-table tbody');
const logAreaEl = document.getElementById('log-area');

// Danh sách "gốc" của tất cả celeb
const allCelebs = [
    { id: 'vucattuongofficial', name: 'Vũ Cát Tường 💛' }, { id: 'emmachamberlain', name: 'Emma Chamberlain' }, { id: 'danmy.btd', name: 'DANMY 🍓' }, { id: 'low.ggg', name: 'Low G' }, { id: 'bigdaddy_official', name: 'Vũ Đẳng Cấp 💛' }, { id: 'nhamphuongnam', name: 'Phương Nam 💛' }, { id: 'tcamnggg', name: 'Cầm 🦭' }, { id: 'gill.thatsune', name: 'Gill thật 🍷' }, { id: 'benazelart', name: 'Ben Azelart' }, { id: 'chauiuneeee', name: 'Châu Bùi 💛' }, { id: 'lyly.singer', name: 'LyLy ✨' }, { id: 'maylily_maylily', name: 'Phương Ly' }, { id: 'jenny.huynhh', name: 'Jenny Huynh' }, { id: 'orange.97', name: 'Orange 🍊' }, { id: 'chixehehe', name: 'Chi Xê' }, { id: 'liu.grace', name: 'Liu Grace' }, { id: 'dfdfdfdf', name: 'duongfynn 🫣' }, { id: 'phaoxinhxinhh', name: 'Pháo Diệu Huyền' }, { id: 'lf.tlinh', name: 'tlinh ✨' }, { id: 'ttthethien', name: 'The Thien' }, { id: 'saweetietest', name: 'Saweetie ✨' }, { id: 'emilynguyen1810', name: 'Emily 💛' }, { id: 'phucdu.arghhh', name: 'Phúc Du 💛' }, { id: 'meiiiichannnnn', name: 'Meichan Ha Trang' }, { id: 'gutdi', name: 'Wxrdie 👹' }, { id: 'withvungne', name: 'Vừng An Le' }, { id: 'jvke', name: 'JVKE 💛' }, { id: 'beachbunnymusic', name: 'Beach Bunny 💛' }, { id: 'enrique.iglesias', name: 'Enrique Iglesias' }, { id: 'mileycyrustest', name: 'Miley Cyrus' }, { id: 'coldzy.clb', name: 'Hải Băng ❄️' }, { id: 'oliviarodrigotest', name: 'Olivia Rodrigo' }, { id: 'karik.koniz', name: 'Karik 💛' }, { id: 'sukiwaterhouse', name: 'Suki Waterhouse' }, { id: 'juky.san', name: 'Juky San 💛' }, { id: 'szamoruf', name: 'SZA & MoRuf Backstage' }, { id: 'phungkhanhlinhhh', name: 'Lắp ráp camera 📸' }, { id: 'ogenusss', name: 'OgeNus 💛' }
];

function updateUI(state) {
    idListEl.disabled = state.isRunning;
    celebSelectEl.disabled = state.isRunning;
    rescanBtn.disabled = state.isRunning;
    selectAllBtn.disabled = state.isRunning;
    enableTimerEl.disabled = state.isRunning;
    timerMinutesEl.disabled = state.isRunning;

    if (state.isRunning) {
        if (state.isPaused) {
            startBtn.disabled = true; pauseBtn.disabled = true;
            resumeBtn.disabled = false; stopBtn.disabled = false; resetBtn.disabled = true;
        } else {
            startBtn.disabled = true; pauseBtn.disabled = false;
            resumeBtn.disabled = true; stopBtn.disabled = false; resetBtn.disabled = true;
        }
    } else {
        startBtn.disabled = false; pauseBtn.disabled = true;
        resumeBtn.disabled = true; stopBtn.disabled = true; resetBtn.disabled = false;
    }
    
    // Cập nhật giao diện hẹn giờ
    if (state.timerSettings && state.timerSettings.enabled && state.isRunning) {
        countdownDisplayEl.textContent = state.timerSettings.countdown || '';
        enableTimerEl.checked = true; // Đảm bảo checkbox được tích
        timerMinutesEl.value = state.timerSettings.minutes || 5; // Cập nhật lại giá trị phút
    } else {
        countdownDisplayEl.textContent = '';
        enableTimerEl.checked = false; // Bỏ tích checkbox
    }

    progressTableBodyEl.innerHTML = '';
    (state.idList || []).forEach((id, index) => {
        const status = (state.results || {})[id] || 'Chưa xử lý';
        const row = document.createElement('tr');
        if (index === state.currentIndex && state.isRunning) row.style.backgroundColor = '#ffff99';
        row.innerHTML = `<td>${id}</td><td>${status}</td>`;
        progressTableBodyEl.appendChild(row);
    });
    logAreaEl.innerHTML = (state.logs || []).join('\n');
    logAreaEl.scrollTop = logAreaEl.scrollHeight;
    if (state.isRunning) {
        if (state.isPaused) {
            progressStatusEl.textContent = `Đã tạm dừng. Sắp xử lý ID: ${(state.idList || [])[state.currentIndex]}`;
        } else {
            progressStatusEl.textContent = `Đang chạy... (${state.currentIndex + 1}/${(state.idList || []).length}) ID: ${(state.idList || [])[state.currentIndex]}`;
        }
    } else if (state.logs && state.logs.length > 0) {
        if (state.logs.length === 1 && state.logs[0].includes('reset')) {
            progressStatusEl.textContent = 'Sẵn sàng để bắt đầu.';
            idListEl.value = '';
        } else {
            progressStatusEl.textContent = 'Đã dừng hoặc hoàn thành.';
        }
    } else {
        progressStatusEl.textContent = 'Sẵn sàng để bắt đầu.';
    }
}

function sendMessage(message) { chrome.runtime.sendMessage(message); }

async function filterAndPopulateCelebList() {
    celebSelectEl.innerHTML = '<option value="" disabled selected>Đang quét danh sách...</option>';
    celebSelectEl.disabled = true;
    rescanBtn.disabled = true;
    selectAllBtn.disabled = true;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url.startsWith("https://locket.binhake.dev/friends.html")) {
            const currentFriends = await chrome.tabs.sendMessage(tab.id, { action: 'getFriendUsernames' });
            celebSelectEl.innerHTML = '<option value="" disabled selected>-- Chọn celeb chưa kết bạn --</option>';
            const notFriends = allCelebs.filter(celeb => !currentFriends.includes(celeb.id));
            if (notFriends.length === 0) {
                 celebSelectEl.innerHTML = '<option value="" disabled selected>-- Đã kết bạn với tất cả --</option>';
            } else {
                notFriends.forEach(celeb => {
                    const option = document.createElement('option');
                    option.value = celeb.id;
                    option.textContent = celeb.name;
                    celebSelectEl.appendChild(option);
                });
            }
        } else {
             celebSelectEl.innerHTML = '<option value="" disabled selected>-- Mở trang Locket để lọc --</option>';
        }
    } catch (error) {
        celebSelectEl.innerHTML = '<option value="" disabled selected>-- Không tìm thấy danh sách --</option>';
    } finally {
         rescanBtn.disabled = false;
         if (celebSelectEl.options.length > 1) {
             celebSelectEl.disabled = false;
             selectAllBtn.disabled = false;
         }
    }
}

startBtn.addEventListener('click', () => {
    const ids = idListEl.value.split('\n').map(id => id.trim()).filter(id => id);
    if (ids.length === 0) {
        alert('Vui lòng nhập ít nhất một ID.');
        return;
    }
    startBtn.disabled = true;
    progressStatusEl.textContent = 'Đang khởi động...';
    
    const timerSettings = {
        enabled: enableTimerEl.checked,
        minutes: parseInt(timerMinutesEl.value, 10)
    };

    sendMessage({ action: 'start', ids, timerSettings });
});

pauseBtn.addEventListener('click', () => sendMessage({ action: 'pause' }));
resumeBtn.addEventListener('click', () => sendMessage({ action: 'resume' }));
stopBtn.addEventListener('click', () => sendMessage({ action: 'stop' }));
rescanBtn.addEventListener('click', filterAndPopulateCelebList);
resetBtn.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn reset toàn bộ công cụ? Mọi tiến trình và log sẽ bị xóa.')) {
        sendMessage({ action: 'reset' });
        idListEl.value = '';
        filterAndPopulateCelebList();
    }
});
celebSelectEl.addEventListener('change', () => {
    const selectedId = celebSelectEl.value;
    const selectedIndex = celebSelectEl.selectedIndex;
    if (selectedId) {
        const existingIds = idListEl.value.split('\n').map(id => id.trim()).filter(id => id);
        if (!existingIds.includes(selectedId)) {
            idListEl.value += (idListEl.value ? '\n' : '') + selectedId;
            const option = celebSelectEl.options[selectedIndex];
            if (option) {
                option.disabled = true;
            }
        }
        celebSelectEl.selectedIndex = 0;
    }
});
selectAllBtn.addEventListener('click', () => {
    const existingIds = idListEl.value.split('\n').map(id => id.trim()).filter(id => id);
    const options = celebSelectEl.options;
    let addedCount = 0;

    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (option.disabled || !option.value) {
            continue;
        }

        if (!existingIds.includes(option.value)) {
            idListEl.value += (idListEl.value ? '\n' : '') + option.value;
            option.disabled = true;
            addedCount++;
        }
    }
    
    if (addedCount > 0) {
        selectAllBtn.disabled = true;
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateState') {
        updateUI(message.state);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    sendMessage({ action: 'prepareTab' });
    sendMessage({ action: 'getState' });
    filterAndPopulateCelebList();
});