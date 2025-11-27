
    // --- CẤU HÌNH SCRIPT ---
    const CONFIG = {
        STORAGE_KEY: 'autoCelebState_v2',
        LOG_STORAGE_KEY: 'autoCelebScriptLog_v2',
        TIMER_CONFIG_KEY: 'autoCelebTimerConfig_v2.9',
        TIMER_RESTART_KEY: 'autoCelebTimerRestart',
        TIMER_END_TIME_KEY: 'autoCelebTimerEndTime',
        TARGET_PAGE: 'https://locket.binhake.dev/celebrity.html',
        FRIENDS_PAGE: 'https://locket.binhake.dev/friends.html',
        LOGIN_PAGE: 'https://locket.binhake.dev/login.html',
        LOGO_URL: 'https://i.imgur.com/AM2f24N.png',

        CELEB_RESTART_KEY: 'autoCelebCelebRestart',
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
    ];
