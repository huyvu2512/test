
    // --- STYLES ---
    function injectNewStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* CSS Tương tự phiên bản React Dark Mode */
            #auto-celeb-main-container {
                position: fixed; z-index: 9999; display: flex; flex-direction: column; gap: 12px;
                width: 350px; font-family: 'Inter', 'Poppins', 'Segoe UI', sans-serif;
                background: rgba(15,15,20,0.85); backdrop-filter: blur(15px);
                border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 30px rgba(0,0,0,0.3);
                border-radius: 16px; padding: 12px; top: 90px; left: 10px;
                transition: max-height 0.3s ease;
            }
            #auto-celeb-popup-header { display: flex; justify-content: space-between; align-items: center; color: white; font-size: 18px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px; margin-bottom: 4px; }
            #auto-celeb-popup-title { cursor: pointer; user-select: none; flex-grow: 1; display: flex; align-items: center; gap: 8px; }
            #auto-celeb-title-icon { width: 22px; height: 22px; border-radius: 5px; }
            #auto-celeb-collapse-toggle { font-size: 20px; font-weight: bold; cursor: pointer; transition: transform 0.3s ease; }
            #auto-celeb-main-container.collapsed { max-height: 48px; padding-top: 12px; padding-bottom: 12px; gap: 0; }
            #auto-celeb-main-container.collapsed > *:not(#auto-celeb-popup-header) { display: none; }
            #auto-celeb-main-container.collapsed #auto-celeb-popup-header { border-bottom: none; margin-bottom: 0; }
            #auto-celeb-main-container.collapsed #auto-celeb-collapse-toggle { transform: rotate(-90deg); }
            
            #auto-celeb-tab-nav { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 12px; }
            .nav-tab { flex: 1; text-align: center; padding: 8px 0; color: #aaa; font-weight: 600; text-decoration: none; border-bottom: 3px solid transparent; }
            .nav-tab.active { color: #fff; border-bottom-color: #8b5cf6; }
            
            #auto-celeb-key-wall { display: flex; flex-direction: column; align-items: center; gap: 15px; }
            #auto-celeb-main-container.locked > *:not(#auto-celeb-key-wall):not(#auto-celeb-popup-header) { display: none; }
            #auto-celeb-main-container:not(.locked) #auto-celeb-key-wall { display: none; }
            #key-input-field { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; padding: 12px; color: white; }
            #btn-submit-key, #btn-get-key { width: 100%; padding: 12px; border-radius: 14px; border: none; font-weight: 600; cursor: pointer; color: white; }
            #btn-submit-key { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
            #btn-get-key { background: linear-gradient(135deg, #00B2FF, #006AFF); text-align: center; text-decoration: none; display: block; }
            
            #auto-celeb-open-dashboard-btn { width: 100%; padding: 12px; border-radius: 14px; border: none; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white; }
            #auto-celeb-open-dashboard-btn.close-mode { background: linear-gradient(135deg, #ef4444, #b91c1c); }
            
            #celeb-dashboard-modal { width: 1020px; max-width: 95vw; background: #232325; position: fixed; top: 90px; left: 385px; z-index: 9998; border-radius: 16px; padding: 12px; padding-top: 40px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 30px rgba(0,0,0,0.3); display: none; }
            #modal-dashboard-layout { display: flex; gap: 20px; }
            #modal-celeb-list-wrapper { flex: 1.5; border-right: 1px solid #444; padding-right: 20px; min-height: 450px; display: flex; flex-direction: column; }
            #modal-celeb-controls-wrapper { flex: 1; display: flex; flex-direction: column; gap: 12px; }
            
            .celeb-list-item-new { display: flex; align-items: center; justify-content: space-between; padding: 10px; border-radius: 8px; margin-bottom: 8px; cursor: pointer; }
            .celeb-list-item-new:hover { background: rgba(255,255,255,0.05); }
            .celeb-list-item-new.selected { background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); }
            .celeb-list-profile-image img { width: 50px; height: 50px; border-radius: 50%; border: 3px solid #F0B90A; }
            
            #dashboard-timer-ui { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-radius: 14px; background: rgba(30,30,30,0.45); border: 1px solid rgba(255,255,255,0.15); height: 65px; }
            #dashboard-script-log { width: 100%; resize: none; background: #111; color: #eee; border: 1px solid #444; border-radius: 8px; padding: 8px; flex-grow: 1; font-family: monospace; }
            
            #running-chart-container { width: 100%; height: 150px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); padding: 10px; display: flex; flex-direction: column; }
            #chart-bars-wrapper { flex-grow: 1; display: flex; justify-content: space-around; align-items: flex-end; border-bottom: 1px solid #666; }
            .chart-bar { width: 10%; background: linear-gradient(to top, #6d28d9, #8b5cf6); border-radius: 4px 4px 0 0; transition: height 0.3s ease; height: 0%; }
            
            .toggle-switch { position: relative; display: inline-flex; width: 52px; height: 30px; }
            .toggle-switch-label { width: 100%; height: 100%; background: #8e8e93; border-radius: 15px; cursor: pointer; transition: 0.2s; }
            .toggle-switch-handle { position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; background: #fff; border-radius: 50%; transition: 0.2s; }
            .toggle-switch-input:checked + .toggle-switch-label { background: #34c759; }
            .toggle-switch-input:checked + .toggle-switch-label .toggle-switch-handle { transform: translateX(20px); }
            .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

            .toast-notification { position: fixed; top: 80px; right: 25px; background: rgba(30,30,30,0.8); backdrop-filter: blur(10px); color: white; padding: 12px 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.15); z-index: 10000; display: flex; gap: 10px; animation: slideIn 0.5s forwards; }
            .toast-notification.toast-success { border-left: 4px solid #22c55e; }
            @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        \`;
        document.head.appendChild(style);
    }
