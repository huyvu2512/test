
import React from 'react';

function App() {
  const SCRIPT_URL = "https://raw.githubusercontent.com/huyvu2512/locket-celebrity/main/script/tampermonkey.user.js";
  const GITHUB_REPO = "https://github.com/huyvu2512/locket-celebrity";

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
             <a href="#features" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Tính năng</a>
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

      {/* Guide Section */}
      <section className="py-20 px-6 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-8 text-center">Hướng dẫn cài đặt nhanh</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-[#1A1A1F] border border-white/5">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center font-bold text-sm">1</span>
            <div>
              <h4 className="font-bold text-lg mb-1">Cài đặt Extension</h4>
              <p className="text-gray-400 text-sm">Cài đặt <a href="https://www.tampermonkey.net/" target="_blank" className="text-violet-400 hover:underline">Tampermonkey</a> cho trình duyệt của bạn.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl bg-[#1A1A1F] border border-white/5">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center font-bold text-sm">2</span>
            <div>
              <h4 className="font-bold text-lg mb-1">Cài đặt Script</h4>
              <p className="text-gray-400 text-sm">Nhấn vào nút <b>"Cài đặt Script"</b> ở trên. Tampermonkey sẽ tự động mở ra, nhấn <b>Install</b>.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl bg-[#1A1A1F] border border-white/5">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center font-bold text-sm">3</span>
            <div>
              <h4 className="font-bold text-lg mb-1">Sử dụng</h4>
              <p className="text-gray-400 text-sm">Truy cập trang <code className="bg-black/30 px-1 py-0.5 rounded text-violet-300">locket.binhake.dev/celebrity.html</code>. Bảng điều khiển sẽ tự động hiện ra.</p>
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
