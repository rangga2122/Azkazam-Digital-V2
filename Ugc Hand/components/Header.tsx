import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="w-full py-6 px-8 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 19.75l-6.513-6.512 5.693-5.516.896 3.842 3.842.896 5.516-5.693 6.513 6.513-3.846.9m-3.846 9V9" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Studio Model Tangan UGC
            </h1>
            <p className="text-xs text-slate-500">Ditenagai oleh Gemini 2.5 Flash Image</p>
          </div>
        </div>
        
        <a href="https://ai.google.dev/" target="_blank" rel="noreferrer" className="text-sm text-slate-400 hover:text-indigo-400 transition-colors">
          Dokumentasi
        </a>
      </div>
    </header>
  );
};