
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
    let runErrorCount = 0;
    let runSentCount = 0;
    let runResetCount = 0;
    // --- BIẾN BIỂU ĐỒ & TIMER ---
    let runActivityData = [0, 0, 0, 0, 0, 0, 0];
    let runActivityTimer = null;
    const CHART_UPDATE_INTERVAL_MS = 60000;

    let isTabActive = true;
    let timePaused = 0;
    let pauseStartTime = null;
    let processedCelebs = [];

    let celebScanRetryInterval = null;
