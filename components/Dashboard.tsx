import React, { useState, useEffect, useRef } from 'react';
import { Celeb, TimerConfig } from '../types';

// Mock data generation
const MOCK_CELEBS: Celeb[] = [
  { id: 'locket.hq', name: 'Locket HQ 💛', imgSrc: 'https://i.imgur.com/AM2f24N.png', progressText: '500/1000', percent: 50, progressColor: '#46ce46', selected: true },
  { id: 'szamoruf_1', name: 'SZA & MoRuf Backstage', imgSrc: 'https://ui-avatars.com/api/?name=SZA&background=random', progressText: '10/20', percent: 50, progressColor: '#46ce46', selected: true },
  { id: 'user_001', name: 'David Dobrik', imgSrc: 'https://ui-avatars.com/api/?name=David&background=random', progressText: '90/100', percent: 90, progressColor: '#46ce46', selected: true },
  { id: 'user_002', name: 'Charli D’Amelio', imgSrc: 'https://ui-avatars.com/api/?name=Charli&background=random', progressText: '200/5000', percent: 4, progressColor: '#46ce46', selected: true },
  { id: 'user_003', name: 'MrBeast', imgSrc: 'https://ui-avatars.com/api/?name=MrBeast&background=random', progressText: 'Max', percent: 100, progressColor: 'red', selected: true },
  { id: 'user_004', name: 'Billie Eilish', imgSrc: 'https://ui-avatars.com/api/?name=Billie&background=random', progressText: '0/100', percent: 0, progressColor: '#46ce46', selected: true },
];

export const Dashboard: React.FC = () => {
  // State
  const [celebs, setCelebs] = useState<Celeb[]>(MOCK_CELEBS);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [timerConfig, setTimerConfig] = useState<TimerConfig>({ enabled: false, minutes: 60 });
  const [runTime, setRunTime] = useState(0); // seconds
  const [stats, setStats] = useState({ sent: 0, error: 0, reset: 0 });
  const [chartData, setChartData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  
  // Refs for intervals
  const runIntervalRef = useRef<number | null>(null);
  const simIntervalRef = useRef<number | null>(null);
  const chartIntervalRef = useRef<number | null>(null);
  const logEndRef = useRef<HTMLTextAreaElement>(null);

  // --- Logic ---

  const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'warn' | 'timer' = 'info') => {
    const now = new Date();
    const timeStr = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
    let icon = '➡️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'timer') icon = '⏱️';
    if (type === 'warn') icon = '⚠️';
    
    setLogs(prev => [...prev, `${timeStr} ${icon} ${msg}`]);
  };

  useEffect(() => {
    // Auto scroll logs
    if (logEndRef.current) {
      logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
    }
  }, [logs]);

  const toggleSelectAll = () => {
    const allSelected = celebs.every(c => c.selected);
    setCelebs(celebs.map(c => ({ ...c, selected: !allSelected })));
  };

  const toggleCeleb = (id: string) => {
    setCelebs(celebs.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  };

  const updateTimerMinutes = (delta: number) => {
    setTimerConfig(prev => {
      let newMins = prev.minutes + delta;
      if (newMins < 1) newMins = 1;
      return { ...prev, minutes: newMins };
    });
    addLog(`Timer adjusted to ${timerConfig.minutes + delta} mins`, 'timer');
  };

  // --- Simulation Engine ---

  const startSimulation = () => {
    const selected = celebs.filter(c => c.selected);
    if (selected.length === 0) {
      addLog('No celebs selected!', 'error');
      return;
    }

    setIsRunning(true);
    setRunTime(0);
    setStats({ sent: 0, error: 0, reset: 0 });
    setLogs([]); // Clear logs on start
    addLog('Starting process...', 'info');
    addLog(`Selected ${selected.length} celebs.`, 'info');

    // Start timer counter
    runIntervalRef.current = window.setInterval(() => {
      setRunTime(prev => prev + 1);
    }, 1000);

    // Chart roller
    chartIntervalRef.current = window.setInterval(() => {
        setChartData(prev => {
            const newData = [...prev];
            newData.shift();
            newData.push(Math.floor(Math.random() * 5)); // Simulate activity
            return newData;
        });
    }, 5000); // Update chart every 5s for demo (vs 60s in real script)

    // Celeb processing simulation
    let currentIndex = 0;
    
    const processNext = () => {
      if (currentIndex >= selected.length) {
        addLog('All celebs processed.', 'success');
        // Loop or stop? Script stops or waits. We'll just wait a bit then stop for demo.
        setTimeout(stopSimulation, 2000);
        return;
      }

      const currentCeleb = selected[currentIndex];
      addLog(`(${currentIndex + 1}/${selected.length}) Processing: ${currentCeleb.name}`, 'info');

      // Simulate network delay
      setTimeout(() => {
        if (Math.random() > 0.8) {
           addLog(`Connection glitch for ${currentCeleb.name}, retrying...`, 'warn');
           setStats(prev => ({ ...prev, error: prev.error + 1 }));
        } else {
           setStats(prev => ({ ...prev, sent: prev.sent + 1 }));
           // Update chart current bucket
           setChartData(prev => {
               const newData = [...prev];
               newData[newData.length - 1] += 1;
               return newData;
           });
        }
        currentIndex++;
        simIntervalRef.current = window.setTimeout(processNext, 1500);
      }, 1000);
    };

    processNext();
  };

  const stopSimulation = () => {
    setIsRunning(false);
    addLog('Process stopped by user.', 'info');
    if (runIntervalRef.current) clearInterval(runIntervalRef.current);
    if (simIntervalRef.current) clearTimeout(simIntervalRef.current);
    if (chartIntervalRef.current) clearInterval(chartIntervalRef.current);
  };

  // Helpers
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // --- Render ---

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#111] p-6">
      <div className="w-[900px] max-w-full bg-[#232325] rounded-xl shadow-2xl border border-white/10 overflow-hidden flex flex-col md:flex-row min-h-[500px]">
        
        {/* LEFT COLUMN: CELEB LIST */}
        <div className="flex-1 border-r border-white/10 p-5 flex flex-col bg-[#232325]">
          <h3 className="text-white font-bold text-lg mb-4">Locket Celeb List</h3>

          {!isRunning ? (
            <>
              {/* Select All Header */}
              <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg mb-4 cursor-pointer hover:bg-white/10 transition" onClick={toggleSelectAll}>
                <div className="flex flex-col">
                  <span className="text-white font-semibold">Select All</span>
                  <span className="text-xs text-gray-400">
                    Selected {celebs.filter(c => c.selected).length}/{celebs.length} Celebs
                  </span>
                </div>
                <div className={`w-12 h-7 rounded-full relative transition-colors ${celebs.every(c => c.selected) ? 'bg-green-500' : 'bg-gray-500'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${celebs.every(c => c.selected) ? 'left-6' : 'left-1'}`}></div>
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-2 max-h-[400px]">
                {celebs.map(celeb => (
                  <div 
                    key={celeb.id}
                    onClick={() => toggleCeleb(celeb.id)}
                    className={`flex items-center p-2 rounded-lg cursor-pointer border transition-all ${celeb.selected ? 'bg-violet-500/10 border-violet-500/30' : 'bg-transparent border-transparent hover:bg-white/5'}`}
                  >
                    <div className="relative mr-3 shrink-0">
                        <img src={celeb.imgSrc} alt="" className="w-10 h-10 rounded-full border-2 border-yellow-400" />
                        <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-black text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">✦</div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold truncate text-sm">{celeb.name}</div>
                        <div className="w-full h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${celeb.percent}%`, backgroundColor: celeb.progressColor }}></div>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{celeb.progressText}</div>
                    </div>
                    <div className="ml-3">
                         <div className={`w-10 h-5 rounded-full relative transition-colors ${celeb.selected ? 'bg-green-500' : 'bg-gray-600'}`}>
                            <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-transform ${celeb.selected ? 'left-5' : 'left-1'}`}></div>
                         </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col h-full">
                {/* RUNNING VIEW - CHART & STATS */}
                <div className="h-40 flex items-end justify-between gap-1 mb-6 px-2">
                    {chartData.map((val, i) => {
                        const max = Math.max(...chartData, 1);
                        const h = (val / max) * 100;
                        return (
                            <div key={i} className="flex-1 bg-violet-500/20 rounded-t-sm relative group">
                                <div 
                                    className="absolute bottom-0 left-0 w-full bg-violet-500 transition-all duration-500 rounded-t-sm" 
                                    style={{ height: `${h}%` }}
                                ></div>
                            </div>
                        )
                    })}
                </div>
                <div className="flex text-xs text-gray-400 justify-between px-2 mb-6">
                    <span>-6m</span><span>-5m</span><span>-4m</span><span>-3m</span><span>-2m</span><span>-1m</span><span>Now</span>
                </div>

                <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/5">
                     <div className="flex justify-between">
                        <span className="text-gray-400">Requests Sent:</span>
                        <span className="font-bold text-white">{stats.sent}</span>
                     </div>
                     <div className="flex justify-between">
                        <span className="text-gray-400">Time Elapsed:</span>
                        <span className="font-bold text-white font-mono">{formatTime(runTime)}</span>
                     </div>
                     <div className="flex justify-between">
                        <span className="text-gray-400">Errors:</span>
                        <span className="font-bold text-red-400">{stats.error}</span>
                     </div>
                     <div className="flex justify-between">
                        <span className="text-gray-400">Resets:</span>
                        <span className="font-bold text-yellow-400">{stats.reset}</span>
                     </div>
                </div>

                <div className="mt-6">
                    <p className="text-sm font-bold text-white mb-2">Processed Celebs:</p>
                    <div className="text-xs text-gray-500 h-20 overflow-y-auto">
                        {celebs.filter(c => c.selected).slice(0, stats.sent).map(c => (
                            <span key={c.id} className="inline-block bg-white/10 px-2 py-1 rounded mr-2 mb-2 text-white">{c.name}</span>
                        ))}
                    </div>
                </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <div className="flex-1 p-5 flex flex-col gap-4 bg-[#232325]">
            
            {/* Start Button */}
            <button 
                onClick={isRunning ? stopSimulation : startSimulation}
                className={`w-full py-3 rounded-xl font-bold text-white text-lg transition-all shadow-lg hover:-translate-y-0.5 ${isRunning ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-red-500/20' : 'bg-gradient-to-r from-green-500 to-green-600 shadow-green-500/20'}`}
            >
                {isRunning ? 'Stop Auto Celeb' : 'Start Auto Celeb'}
            </button>

            {/* Timer UI */}
            <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${timerConfig.enabled ? 'bg-gray-800 border-blue-500/50' : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-center gap-4">
                     {/* SVG Ring */}
                     <div className="relative w-10 h-10">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
                            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                            <circle 
                                cx="20" cy="20" r="18" fill="none" stroke={timerConfig.enabled ? "#0ea5e9" : "transparent"} strokeWidth="4" 
                                strokeDasharray={113} strokeDashoffset={0} strokeLinecap="round"
                            />
                        </svg>
                     </div>
                     <div className="flex flex-col">
                        <span className={`text-2xl font-mono font-bold ${timerConfig.enabled ? 'text-blue-400' : 'text-gray-400'}`}>
                             {timerConfig.minutes.toString().padStart(2, '0')}:00
                        </span>
                     </div>
                     {!isRunning && (
                         <div className="flex flex-col gap-1">
                            <button onClick={() => updateTimerMinutes(5)} className="text-[10px] bg-white/10 px-2 rounded hover:bg-white/20">+</button>
                            <button onClick={() => updateTimerMinutes(-5)} className="text-[10px] bg-white/10 px-2 rounded hover:bg-white/20">-</button>
                         </div>
                     )}
                </div>
                
                {/* Toggle Switch */}
                <div 
                    onClick={() => !isRunning && setTimerConfig(p => ({...p, enabled: !p.enabled}))}
                    className={`w-12 h-7 rounded-full relative cursor-pointer transition-colors ${timerConfig.enabled ? 'bg-green-500' : 'bg-gray-600'} ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}
                >
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${timerConfig.enabled ? 'left-6' : 'left-1'}`}></div>
                </div>
            </div>

            {/* Log Area */}
            <div className="flex-1 flex flex-col min-h-[150px]">
                <label className="text-white text-xs font-bold mb-1 uppercase tracking-wider text-gray-400">System Log</label>
                <textarea 
                    ref={logEndRef as any}
                    readOnly 
                    className="flex-1 w-full bg-[#111] border border-[#444] rounded-lg p-3 text-xs font-mono text-gray-300 resize-none focus:outline-none"
                    value={logs.join('\n')}
                ></textarea>
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-2 mt-auto">
                <button className="flex-1 py-1.5 bg-sky-500 text-white text-xs font-bold rounded hover:bg-sky-400 transition">Update</button>
                <button className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-bold rounded hover:bg-amber-400 transition">Report Bug</button>
                <button className="flex-1 py-1.5 bg-green-500 text-white text-xs font-bold rounded hover:bg-green-400 transition">Donate</button>
            </div>

        </div>

      </div>
    </div>
  );
};
