import React, { useState } from 'react';
import { AspectRatio, GenerateOptions, GenerationState, GenerationStatus } from '../types';
import { VideoIcon, DownloadIcon, ArrowPathIcon, ArrowRightOnRectangleIcon } from './icons';

interface Props {
    state: GenerationState;
    aspectRatio: AspectRatio;
    options?: GenerateOptions;
    onRegenerate?: (options: GenerateOptions) => void;
    onExtend?: (promptOverride?: string) => void;
    isBusy?: boolean;
}

const VideoDisplay: React.FC<Props> = ({ state, aspectRatio, options, onRegenerate, onExtend, isBusy = false }) => {
    const { status, progress, message, videoUrl, error } = state;
    const isPortrait = aspectRatio === AspectRatio.Portrait;
    const [extendOpen, setExtendOpen] = useState(false);
    const [extendPrompt, setExtendPrompt] = useState('');
    const [regenOpen, setRegenOpen] = useState(false);
    const [regenPrompt, setRegenPrompt] = useState('');
    const canExtend = ((options?.extensionDepth || 0) < 10);
    const currentDepth = options?.extensionDepth || 0;
    const nextDepth = Math.min(10, currentDepth + 1);

    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!videoUrl) return;

        try {
            // Pilih endpoint proxy: dev menggunakan /download (Vite middleware), prod menggunakan /api/download (Vercel)
            const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
            const filename = `veo3-video-${Date.now()}.mp4`;
            const proxied = `${downloadBase}?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = proxied;
            a.download = filename;
            a.target = '_self';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
        } catch (err) {
            console.error("Proxy download gagal, mencoba fetch blob:", err);
            // Fallback: coba fetch blob (berhasil jika CORS mengizinkan)
            try {
                const response = await fetch(videoUrl);
                if (!response.ok) throw new Error('Gagal mengunduh video');
                const blob = await response.blob();
                const localUrl = window.URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = localUrl;
                a.download = `veo3-video-${Date.now()}.mp4`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    window.URL.revokeObjectURL(localUrl);
                    if (a.parentNode) a.parentNode.removeChild(a);
                }, 100);
            } catch (innerErr) {
                console.error('Download error:', innerErr);
            }
        }
    };

    return (
        <div className="flex flex-col gap-4 w-full">
            {/* Main Display Panel */}
            <div className={`glass-panel rounded-3xl overflow-hidden relative flex flex-col
                ${isPortrait ? 'max-w-sm mx-auto w-full aspect-[9/16]' : 'w-full aspect-video'}
                min-h-[300px] sm:min-h-[400px]
                transition-all duration-500 bg-slate-100/50 border-slate-200 shadow-sm
            `}>
                <div className="flex-1 relative flex items-center justify-center p-6">

                    {/* IDLE STATE */}
                    {status === GenerationStatus.Idle && (
                        <div className="text-center space-y-4 md:space-y-6 max-w-lg px-4 animate-fadeIn">
                            <div className="w-16 h-16 md:w-24 md:h-24 mx-auto bg-white rounded-full flex items-center justify-center border-4 border-dashed border-slate-200">
                                <VideoIcon className="w-8 h-8 md:w-10 md:h-10 text-slate-300" />
                            </div>
                            <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Siap Membuat Video</h3>
                            <p className="text-sm md:text-base text-slate-500 leading-relaxed">
                                Masukkan prompt di panel sebelah kiri untuk mulai.
                            </p>
                        </div>
                    )}

                    {/* LOADING STATES */}
                    {(status === GenerationStatus.Uploading || status === GenerationStatus.Pending || status === GenerationStatus.Processing) && (
                        <div className="text-center space-y-6 w-full max-w-md px-4 animate-fadeIn">
                             <div className="relative w-20 h-20 mx-auto">
                                <div className="absolute inset-0 rounded-full border-8 border-slate-200/50"></div>
                                <div className="absolute inset-0 rounded-full border-t-8 border-veo-primary animate-spin"></div>
                             </div>
                             <div>
                                 <h3 className="text-xl md:text-2xl font-black text-slate-800">
                                     {status === GenerationStatus.Pending ? 'Dalam Antrian' : 'Sedang Membuat Video'}
                                 </h3>
                                 <p className="text-slate-500 mt-3 h-6 text-sm md:text-base font-medium animate-pulse">{message}</p>
                             </div>
                             {/* Progress Bar */}
                             <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden p-1">
                                 <div
                                     className="h-full bg-veo-primary rounded-full transition-all duration-1000 ease-out shadow-sm"
                                     style={{ width: `${Math.max(5, progress)}%` }}
                                 ></div>
                             </div>
                        </div>
                    )}

                    {/* ERROR STATE */}
                    {status === GenerationStatus.Failed && (
                        <div className="text-center space-y-4 max-w-lg px-4 animate-fadeIn text-red-500">
                            <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center border-4 border-red-100">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-red-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                            </div>
                            <h3 className="text-lg md:text-xl font-black text-red-600">Gagal Membuat Video</h3>
                            <p className="text-sm text-red-700 bg-red-50 py-3 px-4 rounded-xl border border-red-100 leading-relaxed break-words">
                                {error || 'Terjadi kesalahan.'}
                            </p>
                        </div>
                    )}

                    {/* SUCCESS STATE (VIDEO & DOWNLOAD OVERLAY) */}
                    {status === GenerationStatus.Completed && videoUrl && (
                        <div className="absolute inset-0 w-full h-full bg-black animate-fadeIn group">
                            <video
                                src={videoUrl}
                                controls
                                autoPlay
                                loop
                                playsInline
                                className="w-full h-full object-contain"
                            />
                            {/* DOWNLOAD OVERLAY BUTTON */}
                            <div className="absolute top-4 right-4 z-10 opacity-100 transition-opacity duration-300">
                                <button
                                    onClick={handleDownload}
                                    className="bg-black/50 hover:bg-veo-primary/90 backdrop-blur-md text-white p-3 rounded-full shadow-lg border border-white/10 transition-all transform active:scale-95 flex items-center justify-center"
                                    title="Download Video"
                                >
                                    <DownloadIcon className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ACTION BUTTONS (BELOW VIDEO) */}
            {status === GenerationStatus.Completed && options && (
                <div className={`flex ${isPortrait ? 'max-w-sm mx-auto w-full' : 'w-full'} items-center gap-2`}>
                    {onRegenerate && (
                        <button
                            onClick={() => setRegenOpen(v => !v)}
                            disabled={isBusy}
                            className={`flex-1 py-3 px-6 bg-white border-2 border-veo-primary/20
                            font-bold uppercase tracking-wider text-base rounded-2xl flex items-center justify-center gap-2
                            transition-all duration-300 shadow-sm
                            ${isBusy
                                ? 'opacity-50 cursor-not-allowed text-slate-400 border-slate-200'
                                : 'hover:border-veo-primary text-veo-primary hover:bg-veo-primary/5 hover:shadow-md'
                            }`}
                        >
                            <ArrowPathIcon className={`w-5 h-5 ${isBusy ? 'animate-spin' : ''}`} />
                            <span>{isBusy ? 'Sedang Sibuk...' : 'Regenerate Video'}</span>
                        </button>
                    )}
                    {onExtend && canExtend && (
                        <button
                            onClick={() => setExtendOpen(v => !v)}
                            disabled={isBusy}
                            className={`flex-1 py-3 px-6 bg-white border-2 border-veo-primary/20
                            font-bold uppercase tracking-wider text-base rounded-2xl flex items-center justify-center gap-2
                            transition-all duration-300 shadow-sm
                            ${isBusy
                                ? 'opacity-50 cursor-not-allowed text-slate-400 border-slate-200'
                                : 'hover:border-veo-primary text-veo-primary hover:bg-veo-primary/5 hover:shadow-md'
                            }`}
                        >
                            <ArrowRightOnRectangleIcon className="w-5 h-5" />
                            <span>{isBusy ? 'Sedang Sibuk...' : 'Perpanjang Video'}</span>
                        </button>
                    )}
                    {onExtend && canExtend && (
                        <span className="text-xs font-bold text-slate-600 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">Perpanjang ke-{nextDepth}/10</span>
                    )}
                </div>
            )}

            {status === GenerationStatus.Completed && options && onRegenerate && regenOpen && (
                <div className={`flex ${isPortrait ? 'max-w-sm mx-auto w-full' : 'w-full'} items-center gap-2`}>
                    <input
                        type="text"
                        value={regenPrompt}
                        onChange={(e) => setRegenPrompt(e.target.value)}
                        placeholder="Prompt (opsional) untuk regenerate"
                        className="flex-1 bg-white border border-slate-300 rounded-2xl p-3 text-slate-900"
                    />
                    <button
                        onClick={() => { onRegenerate({ ...options, prompt: (regenPrompt.trim() || options.prompt) }); setRegenOpen(false); setRegenPrompt(''); }}
                        disabled={isBusy}
                        className={`py-3 px-6 bg-veo-primary text-white rounded-2xl font-bold shadow-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-veo-primary/90'}`}
                    >
                        Mulai
                    </button>
                </div>
            )}

            {status === GenerationStatus.Completed && options && onExtend && extendOpen && canExtend && (
                <div className={`flex ${isPortrait ? 'max-w-sm mx-auto w-full' : 'w-full'} items-center gap-2`}>
                    <input
                        type="text"
                        value={extendPrompt}
                        onChange={(e) => setExtendPrompt(e.target.value)}
                        placeholder="Prompt (opsional)"
                        className="flex-1 bg-white border border-slate-300 rounded-2xl p-3 text-slate-900"
                    />
                    <span className="text-xs font-bold text-slate-600 px-2 py-1 rounded-md bg-slate-100 border border-slate-200">Perpanjang ke-{nextDepth}/10</span>
                    <button
                        onClick={() => { onExtend(extendPrompt.trim() || undefined); setExtendOpen(false); setExtendPrompt(''); }}
                        disabled={isBusy}
                        className={`py-3 px-6 bg-veo-primary text-white rounded-2xl font-bold shadow-sm ${isBusy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-veo-primary/90'}`}
                    >
                        Mulai
                    </button>
                </div>
            )}
        </div>
    );
};

export default VideoDisplay;
