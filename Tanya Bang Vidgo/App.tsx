import React, { useState, useRef, useEffect } from 'react';
import { MessageItem } from './components/MessageItem';
import { InputArea } from './components/InputArea';
import { Message } from './types';
import { streamChatCompletion } from './services/api';
import { Zap, PenTool, Hash, FileText, Video, Plus, Clapperboard, Clock, Trash, Maximize, Minimize } from 'lucide-react';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updated_at?: string; created_at?: string }>>([]);
  const [instantRender, setInstantRender] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new content
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    const loadInitial = async () => {
      if (supabase && isSupabaseEnabled) {
        try {
          const { data } = await supabase.auth.getUser();
          const uid = data?.user?.id || null;
          setUserId(uid);
          userIdRef.current = uid;
          if (uid) {
            const { data: sessionRow } = await supabase
              .from('chat_sessions')
              .select('id,messages')
              .eq('user_id', uid)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (sessionRow && Array.isArray(sessionRow.messages)) {
              setCurrentSessionId(sessionRow.id);
              sessionIdRef.current = sessionRow.id;
              setMessages(sessionRow.messages as Message[]);
              setInstantRender(true);
              return;
            }
          }
        } catch {
        }
      }
      try {
        const stored = localStorage.getItem('bangVidgo_chat_messages');
        if (stored) {
          const parsed = JSON.parse(stored) as Message[];
          if (Array.isArray(parsed)) {
            setMessages(parsed);
            setInstantRender(true);
          }
        }
      } catch {
      }
    };
    loadInitial();
  }, []);

  const buildChatTitle = (msgs: Message[]) => {
    const firstUser = msgs.find((m) => m.role === 'user');
    if (!firstUser) return 'Percakapan Bang Vidgo';
    const cleaned = firstUser.content.replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'Percakapan Bang Vidgo';
    return cleaned.length > 50 ? `${cleaned.slice(0, 47)}...` : cleaned;
  };

  const persistMessages = async (allMessages: Message[]) => {
    try {
      localStorage.setItem('bangVidgo_chat_messages', JSON.stringify(allMessages));
    } catch {
    }
    if (!supabase || !isSupabaseEnabled || !userIdRef.current) return;
    const title = buildChatTitle(allMessages);
    const uid = userIdRef.current;
    const existingId = sessionIdRef.current;
    if (!uid) return;
    if (!existingId) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: uid,
          title,
          messages: allMessages,
        })
        .select('id')
        .single();
      if (!error && data) {
        setCurrentSessionId(data.id);
        sessionIdRef.current = data.id;
      }
    } else {
      await supabase
        .from('chat_sessions')
        .update({
          title,
          messages: allMessages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId);
    }
  };

  const loadSessions = async () => {
    if (supabase && isSupabaseEnabled && userIdRef.current) {
      setHistoryLoading(true);
      const { data } = await supabase
        .from('chat_sessions')
        .select('id,title,updated_at,created_at')
        .eq('user_id', userIdRef.current)
        .order('updated_at', { ascending: false })
        .limit(20);
      setSessions(data || []);
      setHistoryLoading(false);
      return;
    }
    const stored = localStorage.getItem('bangVidgo_chat_messages');
    if (stored) {
      const title = buildChatTitle(JSON.parse(stored));
      setSessions([{ id: 'local', title, updated_at: new Date().toISOString() }]);
    } else {
      setSessions([]);
    }
  };

  const openSession = async (id: string) => {
    setShowHistory(false);
    if (id === 'local') {
      const stored = localStorage.getItem('bangVidgo_chat_messages');
      if (stored) {
        const msgs = JSON.parse(stored) as Message[];
        setMessages(Array.isArray(msgs) ? msgs : []);
      }
      setCurrentSessionId(null);
      sessionIdRef.current = null;
      setInstantRender(true);
      return;
    }
    if (!supabase || !isSupabaseEnabled) return;
    const { data } = await supabase
      .from('chat_sessions')
      .select('id,messages')
      .eq('id', id)
      .maybeSingle();
    if (data && Array.isArray(data.messages)) {
      setMessages(data.messages as Message[]);
      setCurrentSessionId(data.id);
      sessionIdRef.current = data.id;
      try {
        localStorage.setItem('bangVidgo_chat_messages', JSON.stringify(data.messages));
      } catch {}
      setInstantRender(true);
    }
  };
  
  const deleteSession = async (id: string) => {
    if (id === 'local') {
      try {
        localStorage.removeItem('bangVidgo_chat_messages');
      } catch {}
      setSessions((prev) => prev.filter((s) => s.id !== 'local'));
      if (!currentSessionId) {
        setMessages([]);
      }
      return;
    }
    if (!supabase || !isSupabaseEnabled || !userIdRef.current) return;
    await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', userIdRef.current);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      setMessages([]);
      setCurrentSessionId(null);
      sessionIdRef.current = null;
      try {
        localStorage.removeItem('bangVidgo_chat_messages');
      } catch {}
    }
  };

  const handleSend = async (content: string, images?: string[]) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      images: images && images.length ? images : undefined,
    };

    const newMessages = [...messages, userMessage];
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessagePlaceholder: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '', // Start empty for streaming
      timestamp: Date.now(),
    };
    const uiMessages = [...newMessages, assistantMessagePlaceholder];
    setMessages(uiMessages);
    setIsLoading(true);
    setInstantRender(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    await persistMessages(uiMessages);

    await streamChatCompletion(
      newMessages,
      (chunk) => {
        setMessages((prev) => {
          const updated = [...prev];
          const lastMsgIndex = updated.length - 1;
          // Create a shallow copy of the last message to avoid direct mutation
          // which causes duplication in React.StrictMode
          const lastMsg = { ...updated[lastMsgIndex] };
          
          if (lastMsg.role === 'assistant') {
            lastMsg.content += chunk;
            updated[lastMsgIndex] = lastMsg;
          }
          return updated;
        });
      },
      (error) => {
         setMessages((prev) => {
          const updated = [...prev];
          const lastMsgIndex = updated.length - 1;
          const lastMsg = { ...updated[lastMsgIndex] };
          
          if (lastMsg.role === 'assistant') {
            // Provide a user-friendly error message block instead of raw error
            const errorBlock = `\n\n> ⚠️ **Kendala Teknis**\n> Maaf, permintaan tidak dapat diproses saat ini.\n> *Detail: ${error}*`;
            lastMsg.content += errorBlock;
            updated[lastMsgIndex] = lastMsg;
          }
          return updated;
        });
      },
      () => {
        setIsLoading(false);
        abortControllerRef.current = null;
        setMessages((prev) => {
          const updated = [...prev];
          persistMessages(updated);
          return updated;
        });
      },
      controller.signal
    );
  };

  const handleNewChat = () => {
    setMessages([]);
    setIsLoading(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    try {
      localStorage.removeItem('bangVidgo_chat_messages');
    } catch {
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-screen bg-black font-sans text-gray-100">
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 bg-black/95 backdrop-blur z-10 relative">
        <div className="flex items-center gap-2 select-none">
          <span className="font-semibold text-lg text-gray-200 flex items-center gap-2">
            Bang Vidgo <Zap size={16} className="text-orange-500" fill="currentColor" />
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleFullScreen}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors shadow-sm"
            title={isFullScreen ? "Keluar Full Screen" : "Full Screen"}
          >
            {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
            <span className="hidden sm:inline">{isFullScreen ? "Close Full Screen" : "Full Screen"}</span>
          </button>
          <button 
            onClick={() => { setShowHistory((v) => !v); if (!showHistory) loadSessions(); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors shadow-sm"
            title="History"
          >
            <Clock size={16} />
            <span>History</span>
          </button>
          <button 
            onClick={handleNewChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium transition-colors shadow-sm"
          >
            <span>Chat Baru</span>
          </button>
        </div>

        {showHistory && (
          <>
            <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setShowHistory(false)} />
            <div className="absolute right-4 top-14 z-30 w-80 max-w-[90vw] rounded-xl border border-gray-700 bg-black shadow-xl">
              <div className="px-3 py-2 border-b border-gray-800 text-sm text-gray-300">Riwayat Chat</div>
              <div className="max-h-[50vh] overflow-y-auto">
                {historyLoading ? (
                  <div className="p-4 text-sm text-gray-400">Memuat…</div>
                ) : sessions.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">Belum ada riwayat.</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between px-3 py-2 hover:bg-gray-800/60 transition-colors"
            >
              <button
                onClick={() => openSession(s.id)}
                className="flex-1 text-left min-w-0"
              >
                <div className="text-sm text-gray-200 truncate">
                  {(() => {
                    const t = (s.title || 'Tanpa Judul').replace(/\s+/g, ' ').trim();
                    return t.length > 36 ? `${t.slice(0, 33)}...` : t;
                  })()}
                </div>
                <div className="text-[11px] text-gray-500">
                  {new Date(s.updated_at || s.created_at || Date.now()).toLocaleString()}
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                className="ml-2 p-1.5 rounded-md hover:bg-gray-700/60 text-gray-400 hover:text-red-400"
                title="Hapus"
              >
                <Trash size={14} />
              </button>
            </div>
          ))
        )}
              </div>
            </div>
          </>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-w-0 bg-black overflow-hidden">
        
        {/* Chat Scroll Area */}
        <div className="h-full overflow-y-auto scrollbar-hide pb-48">
          {messages.length === 0 ? (
            <div className="min-h-full flex flex-col items-center justify-center text-center p-8 space-y-8 pb-32">
              <div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center mb-2 shadow-sm">
                 <Zap size={32} className="text-gray-200" />
              </div>
              <h1 className="text-2xl font-semibold text-white">Mau bikin konten apa hari ini?</h1>
              
              {/* UGC Suggestion Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full px-4">
                
                {/* Card 1: Caption */}
                <button 
                  onClick={() => handleSend("Buatkan caption Instagram yang estetik untuk foto senja di pantai, gunakan bahasa santai.")}
                  className="p-4 rounded-xl border border-gray-700 bg-transparent hover:bg-gray-700/50 text-left transition-all group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <PenTool size={18} className="text-orange-400" />
                    <span className="font-medium text-gray-200 text-sm">Caption Instagram</span>
                  </div>
                  <span className="block text-xs text-gray-400 group-hover:text-gray-300">
                    Buat caption estetik untuk postingan feed atau story
                  </span>
                </button>

                {/* Card 2: Narasi/Script */}
                <button 
                  onClick={() => handleSend("Tuliskan naskah video pendek (reels/tiktok) durasi 30 detik tentang tips produktivitas di pagi hari. Sertakan hook di awal.")}
                  className="p-4 rounded-xl border border-gray-700 bg-transparent hover:bg-gray-700/50 text-left transition-all group"
                >
                   <div className="flex items-center gap-3 mb-2">
                    <Video size={18} className="text-purple-400" />
                    <span className="font-medium text-gray-200 text-sm">Naskah Video/Reels</span>
                  </div>
                   <span className="block text-xs text-gray-400 group-hover:text-gray-300">
                    Script narasi dengan hook kuat untuk TikTok/Shorts
                   </span>
                </button>

                {/* Card 3: Copywriting */}
                <button 
                  onClick={() => handleSend("Buatkan copywriting hard selling untuk produk sepatu lari diskon 50%, target audiens anak muda.")}
                  className="p-4 rounded-xl border border-gray-700 bg-transparent hover:bg-gray-700/50 text-left transition-all group"
                >
                   <div className="flex items-center gap-3 mb-2">
                    <FileText size={18} className="text-yellow-400" />
                    <span className="font-medium text-gray-200 text-sm">Copywriting Jualan</span>
                  </div>
                   <span className="block text-xs text-gray-400 group-hover:text-gray-300">
                    Teks promosi yang persuasif untuk iklan
                   </span>
                </button>

                {/* Card 4: Hashtag */}
                <button 
                  onClick={() => handleSend("Riset kumpulan hashtag yang sedang trending dan relevan untuk niche kuliner pedas di Indonesia.")}
                  className="p-4 rounded-xl border border-gray-700 bg-transparent hover:bg-gray-700/50 text-left transition-all group"
                >
                   <div className="flex items-center gap-3 mb-2">
                    <Hash size={18} className="text-blue-400" />
                    <span className="font-medium text-gray-200 text-sm">Riset Hashtag</span>
                  </div>
                   <span className="block text-xs text-gray-400 group-hover:text-gray-300">
                    Cari tagar potensial untuk jangkauan lebih luas
                   </span>
                </button>

                {/* Card 5: Prompt Video AI (New) */}
                <button 
                  onClick={() => handleSend("Buatkan prompt text-to-video yang sangat detail, sinematik, dan realistis untuk tool AI Video tentang adegan: Kota futuristik cyberpunk dengan hujan neon.")}
                  className="p-4 rounded-xl border border-gray-700 bg-transparent hover:bg-gray-700/50 text-left transition-all group md:col-span-2"
                >
                   <div className="flex items-center gap-3 mb-2">
                    <Clapperboard size={18} className="text-green-400" />
                    <span className="font-medium text-gray-200 text-sm">Prompt Video AI</span>
                  </div>
                   <span className="block text-xs text-gray-400 group-hover:text-gray-300">
                    Rancang prompt visual detail untuk generate video AI sinematik
                   </span>
                </button>

              </div>
            </div>
          ) : (
            <div className="flex flex-col w-full">
              {messages.map((msg) => (
                <MessageItem key={msg.id} message={msg} instant={instantRender} />
              ))}
              <div ref={messagesEndRef} className="h-2" />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 w-full bg-black/95 backdrop-blur z-20">
          <InputArea 
            onSend={handleSend} 
            isLoading={isLoading} 
            onStop={handleStop}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
