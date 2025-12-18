import React from 'react';

const Sidebar: React.FC = () => {
  return (
    <aside className="hidden lg:flex flex-col w-64 h-full bg-white border-r border-veo-border overflow-y-auto z-20">
      <div className="h-16 flex items-center px-6 border-b border-veo-border">
        <span className="text-xl font-extrabold tracking-tight text-veo-fg">
          Vidgo <span className="text-veo-primary">Max</span> Backup
        </span>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-6">
        <div>
          <div className="text-xs font-semibold text-veo-primary uppercase tracking-wider mb-2 px-2">
            Video Generator
          </div>
          <a href="#" className="flex items-center gap-3 px-2 py-2 text-sm font-bold text-veo-primary rounded-lg bg-orange-50">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Generate VEO 3.1
          </a>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;