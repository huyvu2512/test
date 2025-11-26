import React, { useState } from 'react';

interface KeyWallProps {
  onUnlock: () => void;
}

const SECRET_KEY = '2025';

export const KeyWall: React.FC<KeyWallProps> = ({ onUnlock }) => {
  const [inputKey, setInputKey] = useState('');
  const [error, setError] = useState(false);
  const [isShake, setIsShake] = useState(false);

  const handleSubmit = () => {
    if (inputKey.trim() === SECRET_KEY) {
      setError(false);
      onUnlock();
    } else {
      setError(true);
      setIsShake(true);
      setTimeout(() => setIsShake(false), 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="w-full max-w-md bg-gray-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-6">
        <img 
          src="https://i.imgur.com/AM2f24N.png" 
          alt="Logo" 
          className="w-16 h-16 rounded-xl shadow-lg"
        />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Activate Script</h2>
          <p className="text-gray-400 text-sm">
            To use the Auto Locket Celeb simulation,<br/>please enter the activation key.
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <a 
            href="https://www.messenger.com/c/655145337208323/" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-xl hover:translate-y-[-2px] transition-all shadow-lg shadow-blue-500/30"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="shrink-0">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12C2 17.523 6.477 22 12 22C13.245 22 14.453 21.801 15.58 21.434C16.035 21.289 16.538 21.414 16.829 21.78C17.72 22.88 19.347 24 21.362 23.86C21.6 23.836 21.821 23.67 21.93 23.44C22.04 23.21 22.023 22.943 21.884 22.73C20.69 20.82 19.998 18.52 20.002 16.06C20.002 16.03 20 15.998 20 15.967C21.232 14.636 22 12.902 22 11C22 6.029 17.523 2 12 2ZM12.002 12.668C11.383 12.668 10.835 12.92 10.45 13.332L6.151 9.032C6.46 8.711 6.84 8.441 7.27 8.232C7.699 8.022 8.169 7.882 8.66 7.822C9.151 7.761 9.652 7.782 10.133 7.885C10.614 7.989 11.065 8.175 11.464 8.435L12.002 8.788L15.54 10.888C15.3 11.198 15.01 11.478 14.68 11.718C14.349 11.958 13.98 12.158 13.582 12.308C13.183 12.459 12.76 12.56 12.321 12.608C11.882 12.657 11.433 12.653 11 12.597L10.99 12.592L12.002 12.668ZM15.849 13.332C15.54 13.021 15.16 12.751 14.73 12.542C14.301 12.332 13.831 12.192 13.34 12.132C12.849 12.071 12.348 12.092 11.867 12.195C11.386 12.3 10.935 12.485 10.536 12.745L10 13.098L6.46 15.198C6.7 15.508 6.99 15.789 7.32 16.029C7.651 16.269 8.02 16.469 8.418 16.619C8.817 16.769 9.24 16.87 9.679 16.918C10.118 16.967 10.567 16.963 11 16.907L11.01 16.892L17.849 13.332L15.849 13.332Z"/>
            </svg>
            Get Key on Messenger
          </a>

          <div className="relative">
            <input 
              type="text" 
              placeholder="Enter key..." 
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`w-full bg-black/30 border ${error ? 'border-red-500' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors ${isShake ? 'shake' : ''}`}
            />
            {error && (
              <p className="text-red-500 text-xs font-semibold mt-1 ml-1 absolute -bottom-5">
                Invalid key. Please try again.
              </p>
            )}
          </div>

          <button 
            onClick={handleSubmit}
            className="w-full py-3 mt-2 bg-gradient-to-r from-violet-600 to-violet-700 text-white font-semibold rounded-xl hover:translate-y-[-2px] transition-all shadow-lg shadow-violet-600/30"
          >
            Verify Key
          </button>
        </div>
      </div>
    </div>
  );
};
