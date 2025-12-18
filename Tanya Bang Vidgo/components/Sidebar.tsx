import React from 'react';
import { Plus, MessageSquare } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onNewChat }) => {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-[260px] bg-gray-900 border-r border-gray-800 transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0
        flex flex-col
      `}>
        {/* Header / New Chat */}
        <div className="p-3">
          <button 
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onClose();
            }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors text-sm text-gray-200 text-left"
          >
            <Plus size={16} />
            Chat Baru
          </button>
        </div>

        {/* Chat History List (Mocked for UI) */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          <div className="text-xs font-medium text-gray-500 px-3 py-2">Hari Ini</div>
          <button className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-gray-800/50 transition-colors text-sm text-gray-300 text-left truncate group">
            <MessageSquare size={16} className="text-gray-500 group-hover:text-gray-300" />
            <span className="truncate">Ide Konten TikTok</span>
          </button>
           <button className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-gray-800/50 transition-colors text-sm text-gray-300 text-left truncate group">
            <MessageSquare size={16} className="text-gray-500 group-hover:text-gray-300" />
            <span className="truncate">Caption Jualan Baju</span>
          </button>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800">
           <button className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-gray-800 transition-colors text-sm text-gray-200 text-left">
            <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold">
              C
            </div>
            <div className="flex-1 truncate">
              <div className="font-medium">Creator</div>
              <div className="text-xs text-gray-500">Pro Plan</div>
            </div>
           </button>
        </div>
      </div>
    </>
  );
};