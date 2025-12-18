
import React, { useEffect, useMemo, useState } from 'react';
import { SceneScript } from '../types';
import { GenerationStatus, GenerationState } from '../../types';

interface ResultGridProps {
  scenes: SceneScript[];
  onRegenerateImage: (sceneId: number) => void;
  onUpdateNarrative: (sceneId: number, newText: string) => void;
  onCreateVideo?: (sceneId: number, imageBase64: string, narrative: string, title: string) => void;
}

export const ResultGrid: React.FC<ResultGridProps> = ({ scenes, onRegenerateImage, onUpdateNarrative, onCreateVideo }) => {
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [videoMap, setVideoMap] = useState<Record<string, GenerationState>>({});

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        const url = detail?.url as string;
        const state = detail?.state as GenerationState;
        if (!url || !state) return;
        setVideoMap(prev => ({ ...prev, [url]: state }));
      } catch {}
    };
    window.addEventListener('inline-video-state', handler as EventListener);
    return () => window.removeEventListener('inline-video-state', handler as EventListener);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="w-full custom-scrollbar">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #f97316;
        }
      `}</style>
      <div className="sticky top-0 bg-gray-50/95 backdrop-blur py-4 z-10 mb-6 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <span className="bg-gradient-to-br from-orange-500 to-amber-500 w-2 h-8 rounded-full shadow-sm"></span>
          Kit UGC Tergenerasi
          <span className="ml-auto text-sm font-normal text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200">
            {scenes.length} Adegan
          </span>
        </h2>
        {scenes.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            {(() => {
              const readyVideoUrls = scenes.map(s => {
                const key = s.generatedImage ? `data:image/png;base64,${s.generatedImage}` : '';
                return key ? videoMap[key]?.videoUrl : undefined;
              }).filter(Boolean) as string[];

              const handleMergeAll = () => {
                try {
                  const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
                  const urls = readyVideoUrls.map((u, i) => `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`ugc-${String(i + 1).padStart(2, '0')}.mp4`)}`);
                  try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
                  window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls } }));
                } catch {}
              };

              const handleDownloadAllImages = () => {
                scenes.forEach(s => {
                  if (!s.generatedImage) return;
                  const a = document.createElement('a');
                  a.href = `data:image/png;base64,${s.generatedImage}`;
                  a.download = `ugc-scene-${s.id}.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                });
              };

              const handleDownloadAllVideos = () => {
                const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
                readyVideoUrls.forEach((u, i) => {
                  const filename = `ugc-video-${String(i + 1).padStart(2, '0')}.mp4`;
                  const proxied = `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(filename)}`;
                  setTimeout(() => {
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = proxied;
                    a.download = filename;
                    a.target = '_self';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
                  }, i * 300);
                });
              };

              return (
                <>
                  <button type="button" onClick={handleMergeAll} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-900">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 6h16v12H4z"/><path d="M9 8h6v8H9z"/></svg>
                    Gabungkan Semua
                  </button>
                  <button type="button" onClick={handleDownloadAllImages} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M5 5h14v14H5z"/><path d="M12 14l-3-3-4 4v2h14v-2l-4-4-3 3z"/></svg>
                    Download Semua Gambar
                  </button>
                  {readyVideoUrls.length > 0 && (
                    <button type="button" onClick={handleDownloadAllVideos} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-veo-primary text-white font-bold hover:bg-veo-primary/90">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 6h16v12H4z"/><path d="M12 14l-3-3-4 4v2h14v-2l-4-4-3 3z"/></svg>
                      Download Semua Video
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 gap-6 pb-20">
        {scenes.map((scene) => (
          <div key={scene.id} className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300">
             <div className="flex flex-col lg:flex-row h-full">
                
                {/* Image Area - Optimized for better layout */}
                <div className="lg:w-2/5 aspect-[4/3] lg:aspect-auto bg-gradient-to-br from-gray-800 to-gray-900 relative group cursor-pointer border-b lg:border-b-0 lg:border-r border-gray-200" onClick={() => scene.generatedImage && setViewingImage(scene.generatedImage)}>
                  {scene.generatedImage ? (
                    <>
                        {(() => {
                          const url = `data:image/png;base64,${scene.generatedImage}`;
                          const vs = videoMap[url];
                          if (vs && vs.status === GenerationStatus.Completed && vs.videoUrl) {
                            return (
                              <div className="w-full h-full">
                                <video
                                  src={vs.videoUrl}
                                  className={`w-full h-full object-contain transition-opacity duration-300 ${scene.isRegenerating ? 'opacity-50' : 'opacity-100'}`}
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  controls
                                />
                                <div className="absolute top-3 right-3 z-10">
                                  <a
                                    href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(vs.videoUrl as string)}&filename=${encodeURIComponent('ugc-video.mp4')}`}
                                    className="p-2 rounded-lg bg-white/90 border border-gray-200 text-gray-700 shadow-sm hover:bg-white"
                                    title="Download Video"
                                    onClick={(e) => e.stopPropagation()}
                                    download={"ugc-video.mp4"}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 16l4-4H13V4h-2v8H8l4 4z"/><path d="M4 18h16v2H4z"/></svg>
                                  </a>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <img
                              src={`data:image/png;base64,${scene.generatedImage}`}
                              alt={scene.title}
                              className={`w-full h-full object-contain transition-opacity duration-300 ${scene.isRegenerating ? 'opacity-50' : 'opacity-100'}`}
                            />
                          );
                        })()}
                        
                        {/* Loading Overlay */}
                        {scene.isRegenerating && (
                          <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="bg-white/90 rounded-full p-3 shadow-lg">
                              <svg className="animate-spin h-8 w-8 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            </div>
                          </div>
                        )}

                        {/* Inline Video Progress Overlay */}
                        {(() => {
                          const url = `data:image/png;base64,${scene.generatedImage}`;
                          const vs = videoMap[url];
                          if (!vs || vs.status === GenerationStatus.Idle || vs.status === GenerationStatus.Completed) return null;
                          const isUploading = vs.status === GenerationStatus.Uploading;
                          return (
                            <div className="absolute inset-0 flex items-center justify-center z-20">
                              <div className="rounded-xl bg-black/75 text-white px-4 py-3 shadow-lg border border-white/10 flex flex-col items-center gap-2">
                                <svg className="animate-spin h-6 w-6 text-orange-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2" />
                                  <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                </svg>
                                <div className="text-xs font-bold">{isUploading ? 'Uploading reference image...' : (vs.message || 'Sedang Membuat...')}</div>
                                <div className="w-40 h-1.5 bg-white/20 rounded-full overflow-hidden">
                                  <div className="h-full bg-orange-400" style={{ width: `${Math.max(0, Math.min(100, vs.progress || 0))}%` }}></div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Overlay Buttons */}
                        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button 
                                className="p-2 bg-white/90 backdrop-blur rounded-lg text-gray-700 hover:bg-orange-100 hover:text-orange-600 transition-colors flex items-center justify-center shadow-sm"
                                title="Lihat Penuh"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                </svg>
                            </button>
                            <a 
                                href={`data:image/png;base64,${scene.generatedImage}`} 
                                download={`ugc-scene-${scene.id}.png`}
                                className="p-2 bg-white/90 backdrop-blur rounded-lg text-gray-700 hover:bg-orange-100 hover:text-orange-600 transition-colors flex items-center justify-center shadow-sm"
                                title="Unduh Gambar"
                                onClick={(e) => e.stopPropagation()}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            </a>
                        </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100 animate-pulse">
                      <div className="flex flex-col items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                        <span className="text-sm font-medium">Merender Adegan...</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12 pointer-events-none lg:hidden">
                    <span className="text-xs font-bold uppercase tracking-wider text-orange-300 bg-orange-900/50 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-orange-500/30 inline-block">
                      Adegan {scene.id}
                    </span>
                  </div>
                  
                  <div className="hidden lg:block absolute top-4 left-4 pointer-events-none">
                     <span className="text-xs font-bold uppercase tracking-wider text-orange-600 bg-white/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-md border border-orange-100">
                        Adegan {scene.id}
                      </span>
                  </div>

                </div>

                {/* Content Area - Adjusted width */}
                <div className="p-6 lg:w-3/5 space-y-4 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl font-bold text-gray-900 leading-tight flex-1">{scene.title}</h3>
                  </div>

                  {/* Narrative Prompt Section (Editable) */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-orange-500">
                          <path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z" />
                          <path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.147 2.839 2.71 2.935.214.013.428.024.642.034.2.009.385.09.518.224l2.35 2.35a.75.75 0 0 0 1.28-.531v-2.07c1.453-.195 2.5-1.463 2.5-2.915V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z" />
                        </svg>
                        Naskah Narasi
                      </label>
                      <button 
                        onClick={() => copyToClipboard(scene.narrativePrompt)}
                        className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-md hover:bg-orange-50 border border-transparent hover:border-orange-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                        </svg>
                        Salin
                      </button>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-1 border border-orange-200 focus-within:ring-2 focus-within:ring-orange-300 focus-within:border-orange-400 transition-all shadow-sm">
                        <textarea
                            value={scene.narrativePrompt}
                            onChange={(e) => onUpdateNarrative(scene.id, e.target.value)}
                            className="w-full bg-white/80 backdrop-blur border-none focus:ring-0 p-4 text-sm text-gray-800 leading-relaxed resize-none h-24 focus:outline-none rounded-lg font-medium"
                            spellCheck={false}
                            placeholder="Tulis naskah narasi di sini..."
                        />
                    </div>
                  </div>

                  {/* Action Buttons Section */}
                  {scene.generatedImage && (
                    <div className="pt-4 border-t border-gray-200 space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => onRegenerateImage(scene.id)}
                                disabled={scene.isRegenerating}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 ${scene.isRegenerating ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                 </svg>
                                 <span className="hidden sm:inline">{scene.isRegenerating ? 'Membuat...' : 'Regenerate'}</span>
                                 <span className="sm:hidden">Ulang</span>
                            </button>
                            
                            {(() => {
                              const url = `data:image/png;base64,${scene.generatedImage}`;
                              const vs = videoMap[url];
                              const isBusy = vs && (vs.status === GenerationStatus.Uploading || vs.status === GenerationStatus.Processing || vs.status === GenerationStatus.Pending);
                              const isDone = vs && vs.status === GenerationStatus.Completed && vs.videoUrl;
                              return (
                                <div className="flex items-stretch gap-2">
                                  <button
                                    onClick={() => {
                                      if (onCreateVideo && scene.generatedImage && !isBusy) {
                                          onCreateVideo(scene.id, scene.generatedImage, scene.narrativePrompt, scene.title);
                                      }
                                    }}
                                    disabled={isBusy}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${isBusy ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-xl hover:shadow-orange-500/30 hover:scale-[1.03] active:scale-[0.98]'}`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                    </svg>
                                    <span className="hidden sm:inline">{isBusy ? 'Sedang Membuat...' : 'Buat Video'}</span>
                                    <span className="sm:hidden">{isBusy ? 'Membuat...' : 'Video'}</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (onCreateVideo && scene.generatedImage && !isBusy) {
                                          onCreateVideo(scene.id, scene.generatedImage, scene.narrativePrompt, scene.title);
                                      }
                                    }}
                                    disabled={isBusy}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${isBusy ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'}`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 6v6l4 2" /><path d="M4 4h16v16H4z"/></svg>
                                    <span className="hidden sm:inline">Generate Ulang Video</span>
                                    <span className="sm:hidden">Ulang Video</span>
                                  </button>
                                  {isDone && null}
                                </div>
                              );
                            })()}
                        </div>
                    </div>
                  )}

                  {/* Visual Prompt Section (Collapsible) */}
                  <div className="pt-2">
                     <details className="group">
                        <summary className="text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-orange-600 transition-colors list-none flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 group-open:rotate-90 transition-transform">
                             <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                           </svg>
                           Prompt Visual (English)
                        </summary>
                        <div className="mt-2 bg-gray-50 p-3 rounded-lg border border-gray-200 relative group/copy">
                            <p className="text-xs text-gray-600 leading-relaxed pr-8">{scene.visualPrompt}</p>
                            <button 
                                onClick={() => copyToClipboard(scene.visualPrompt)}
                                className="absolute top-2 right-2 opacity-0 group-hover/copy:opacity-100 bg-white border border-gray-300 p-1.5 rounded-md text-gray-600 hover:text-orange-600 hover:border-orange-300 text-xs font-medium transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                                </svg>
                            </button>
                        </div>
                     </details>
                  </div>

                </div>
             </div>
          </div>
        ))}
      </div>

      {/* Image Modal / Popup */}
      {viewingImage && (
        <div 
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" 
            onClick={() => setViewingImage(null)}
        >
            <div className="relative max-w-[95vw] max-h-[95vh] w-full h-full flex items-center justify-center">
                <div className="relative pointer-events-auto">
                    <img 
                        src={`data:image/png;base64,${viewingImage}`} 
                        alt="Full Screen View" 
                        className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border-4 border-white/10" 
                    />
                    <button 
                        onClick={() => setViewingImage(null)}
                        className="absolute -top-5 -right-5 p-3 bg-white text-gray-800 rounded-full hover:bg-orange-500 hover:text-white transition-all shadow-2xl border-2 border-gray-200 hover:border-orange-500 hover:scale-110 active:scale-95"
                        title="Tutup (ESC)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <a 
                        href={`data:image/png;base64,${viewingImage}`}
                        download="ugc-scene-fullsize.png"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute -bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full hover:shadow-2xl hover:shadow-orange-500/50 transition-all font-bold text-sm flex items-center gap-2 hover:scale-105 active:scale-95"
                        title="Unduh Gambar"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Unduh Gambar
                    </a>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
