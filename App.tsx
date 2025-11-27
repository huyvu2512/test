
import React, { useState } from 'react';
import { HEADER_PART, WRAPPER_START, CONFIG_PART, STATE_PART, UTILS_PART, STYLES_PART, UI_PART, TIMER_PART, CORE_PART, MAIN_PART, WRAPPER_END } from './src/scriptParts';

function App() {
  const SCRIPT_URL = "https://raw.githubusercontent.com/huyvu2512/locket-celebrity/main/script/tampermonkey.user.js";
  const GITHUB_REPO = "https://github.com/huyvu2512/locket-celebrity";

  const [previewContent] = useState(() => [
      HEADER_PART,
      WRAPPER_START,
      CONFIG_PART,
      STATE_PART,
      UTILS_PART,
      STYLES_PART,
      UI_PART,
      TIMER_PART,
      CORE_PART,
      MAIN_PART,
      WRAPPER_END
    ].join('\n')
  );
  
  const [copySuccess, setCopySuccess] = useState(false);

  const handleDownload = () => {
    const blob = new Blob([previewContent], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auto-locket-celeb-v1.3.user.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
      navigator.clipboard.writeText(previewContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white font-['Inter'] selection:bg-violet-500/30">
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-[#0F0F14]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="https://i.imgur.com/AM2f24N.png" alt="Logo" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-lg tracking-tight">Auto Locket Celeb</span>
          </div>
          <div className="flex gap-4">
             <a href={GITHUB_REPO} target="_blank" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">GitHub</a>
             <a href="#builder" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Builder</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[120px] -z-10"></div>
        
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-4 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-violet-400 text-xs font-bold uppercase tracking-wider">
            Version 1.3 Available Now
          </div>
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent mb-6 tracking-tight">
            Tự động kết bạn <br/> với Locket Celeb.
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Script Tampermonkey mạnh mẽ giúp bạn tự động gửi lời mời kết bạn, quản lý danh sách Celeb và tối ưu hóa trải nghiệm Locket trên web.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a 
              href={SCRIPT_URL}
              target="_blank"
              className="px-8 py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-all transform hover:-translate-y-1 shadow-xl shadow-white/10 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Cài đặt Script
            </a>
            <a 
              href="https://www.tampermonkey.net/"
              target="_blank"
              className="px-8 py-4 bg-[#1A1A1F] text-white border border-white/10 font-bold rounded-xl hover:bg-[#25252A] transition-all flex items-center gap-2"
            >
              <span>Tải Tampermonkey</span>
            </a>
          </div>
          <p className="mt-4 text-xs text-gray-500">Yêu cầu trình duyệt Chrome/Edge/Firefox và Extension Tampermonkey.</p>
        </div>
      </header>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">Tính năng nổi bật</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl bg-[#15151A] border border-white/5 hover:border-violet-500/30 transition-colors group">
              <div className="w-12 h-12 bg-violet-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-violet-500/20 transition-colors">
                <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Tự động hoàn toàn</h3>
              <p className="text-gray-400 leading-relaxed">Tự động quét danh sách, gửi lời mời kết bạn và xử lý các thao tác lặp lại giúp bạn tiết kiệm thời gian.</p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl bg-[#15151A] border border-white/5 hover:border-green-500/30 transition-colors group">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-500/20 transition-colors">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Hẹn giờ thông minh</h3>
              <p className="text-gray-400 leading-relaxed">Tùy chỉnh thời gian tự động tải lại trang và tiếp tục quy trình để tránh bị chặn hoặc treo trình duyệt.</p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl bg-[#15151A] border border-white/5 hover:border-amber-500/30 transition-colors group">
              <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
                <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Thống kê Real-time</h3>
              <p className="text-gray-400 leading-relaxed">Bảng điều khiển trực quan hiển thị số lượng đã gửi, nhật ký hoạt động và trạng thái lỗi ngay trên giao diện web.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Script Builder Section */}
      <section id="builder" className="py-20 px-6 bg-[#1A1A1F] border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Advanced: Script Builder</h2>
            <p className="text-gray-400">View modular structure and access source code directly.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 h-[600px]">
            
            {/* Left Column: Modules & Controls */}
            <div className="flex flex-col h-full gap-6">
                <div className="flex-1 bg-[#0F0F14] border border-white/10 rounded-xl p-4 overflow-y-auto scrollbar-thin">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 sticky top-0 bg-[#0F0F14] py-2 border-b border-white/5">Modules</h3>
                    <div className="flex flex-col gap-2 font-mono text-xs text-gray-400">
                        {[
                            { name: '00_header.js', desc: '// Metadata & info' },
                            { name: '01_config.js', desc: '// Configuration constants' },
                            { name: '02_state.js', desc: '// Global state variables' },
                            { name: '03_utils.js', desc: '// Helper functions' },
                            { name: '04_styles.js', desc: '// CSS Injection' },
                            { name: '05_ui.js', desc: '// UI Construction' },
                            { name: '06_timer.js', desc: '// Timer Logic' },
                            { name: '07_core.js', desc: '// Core Functionality' },
                            { name: '08_main.js', desc: '// Entry Point' }
                        ].map((module, i) => (
                            <div key={i} className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors cursor-default group">
                                <div className="flex items-center gap-3">
                                    <span className="text-violet-400 font-bold">{module.name}</span>
                                </div>
                                <span className="text-gray-600 group-hover:text-gray-500 transition-colors">{module.desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <button 
                        onClick={handleDownload}
                        className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-violet-600/20 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Download Compiled Script (.user.js)
                    </button>
                    <button 
                        onClick={handleCopy}
                        className="w-full py-4 bg-[#25252A] text-gray-300 font-semibold rounded-xl hover:bg-[#2A2A30] transition-colors flex items-center justify-center gap-2 border border-white/5"
                    >
                        {copySuccess ? (
                            <>
                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                <span className="text-green-500">Copied to Clipboard!</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                Copy Source Code
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Right Column: Live Preview */}
            <div className="h-full bg-[#0F0F14] border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl">
                <div className="px-4 py-3 bg-[#15151A] border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Live Preview</span>
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
                    </div>
                </div>
                <div className="flex-1 relative">
                    <textarea 
                        readOnly 
                        value={previewContent} 
                        className="absolute inset-0 w-full h-full bg-[#0F0F14] text-gray-400 font-mono text-[11px] leading-relaxed p-4 resize-none focus:outline-none scrollbar-thin"
                        spellCheck="false"
                    ></textarea>
                </div>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 text-center text-gray-500 border-t border-white/5 bg-[#0F0F14]">
        <p className="mb-2">Developed by <span className="text-white font-medium">Huy Vũ</span></p>
        <p className="text-xs">This tool is for educational purposes only.</p>
      </footer>

    </div>
  );
}

export default App;
