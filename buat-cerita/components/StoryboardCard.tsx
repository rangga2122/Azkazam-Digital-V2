import React, { useState, useEffect } from 'react';
import { Scene, AspectRatio } from '../types';
import { Button } from './Button';
import { Copy, Video, Image as ImageIcon, Loader2, Download, Play, RefreshCw, Edit2 } from 'lucide-react';
import { generateSceneImage } from '../services/geminiService';
import { GenerationState, GenerationStatus } from '../../types';

interface StoryboardCardProps {
  scene: Scene;
  visualStylePrompt: string;
  intonationTag: string;
  aspectRatio: AspectRatio;
  consistentSubject: string;
  onImageGenerated: (sceneId: number, url: string) => void;
  // Video Props
  videoState?: GenerationState;
  isPlaying?: boolean;
  onPlay?: () => void;
  onCreateVideo?: (customPrompt?: string) => void;
}

export const StoryboardCard: React.FC<StoryboardCardProps> = ({ 
  scene, 
  visualStylePrompt, 
  intonationTag, 
  aspectRatio, 
  consistentSubject, 
  onImageGenerated,
  videoState,
  isPlaying,
  onPlay,
  onCreateVideo
}) => {
  // Local state for manual regeneration if needed
  const [manualLoading, setManualLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Prompt Editing State
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [customVideoPrompt, setCustomVideoPrompt] = useState('');

  // Initialize custom prompt with default value
  useEffect(() => {
    setCustomVideoPrompt(`[VOICEOVER ONLY - NO LIP SYNC - NO DIALOGUE] ${intonationTag} ${scene.narration}`);
  }, [intonationTag, scene.narration]);

  const handleGenerate = async () => {
    setManualLoading(true);
    setError('');
    try {
      const finalPrompt = `${consistentSubject}. ${scene.imagePrompt}`;
      const url = await generateSceneImage(finalPrompt, visualStylePrompt, aspectRatio);
      onImageGenerated(scene.id, url);
    } catch (e) {
      setError('Failed to generate image');
    } finally {
      setManualLoading(false);
    }
  };

  const handleDownloadImage = () => {
    if (!scene.generatedImageUrl) return;
    const link = document.createElement('a');
    link.href = scene.generatedImageUrl;
    link.download = `scene-${scene.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Determine if we should show loading state (either from parent auto-generation or manual click)
  const isLoading = scene.isGeneratingImage || manualLoading;

  // Video State Helpers
  const isVideoReady = videoState?.status === GenerationStatus.Completed && !!videoState?.videoUrl;
  const isVideoProcessing = videoState?.status === GenerationStatus.Pending || videoState?.status === GenerationStatus.Processing || videoState?.status === GenerationStatus.Uploading;
  const isVideoFailed = videoState?.status === GenerationStatus.Failed;

  // Determine aspect ratio class
  const getAspectRatioClass = (ratio: AspectRatio) => {
    switch (ratio) {
      case '1:1': return 'aspect-square';
      case '16:9': return 'aspect-video';
      case '9:16': return 'aspect-[9/16]';
      case '4:3': return 'aspect-[4/3]';
      case '3:4': return 'aspect-[3/4]';
      default: return 'aspect-[9/16]';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col h-full group shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="bg-slate-50 px-3 py-2 flex justify-between items-center text-xs font-mono text-slate-500 border-b border-slate-200">
        <span className="font-bold text-orange-600">SCENE {scene.id}</span>
        <span>{scene.timeStart} - {scene.timeEnd}</span>
      </div>

      {/* Image / Video Area */}
      <div className={`${getAspectRatioClass(aspectRatio)} relative bg-slate-100 flex items-center justify-center border-b border-slate-200 overflow-hidden`}>
        
        {/* Video Player Overlay */}
        {isVideoReady && isPlaying ? (
           <div className="absolute inset-0 z-20 bg-black">
             <video 
               src={videoState?.videoUrl} 
               controls 
               autoPlay 
               className="w-full h-full object-contain"
             />
           </div>
        ) : null}

        {/* Generated Image */}
        {scene.generatedImageUrl ? (
          <>
            <img src={scene.generatedImageUrl} alt={`Scene ${scene.id}`} className="w-full h-full object-cover animate-in fade-in duration-700" />
            
            {/* Overlay Controls when Image exists */}
            {!isPlaying && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2 z-10">
                    <button onClick={handleDownloadImage} className="p-2 bg-white/90 rounded-full hover:bg-white text-slate-700 shadow-lg transition-transform hover:scale-110" title="Download Image">
                        <Download size={16} />
                    </button>
                    <button onClick={handleGenerate} className="p-2 bg-white/90 rounded-full hover:bg-white text-orange-600 shadow-lg transition-transform hover:scale-110" title="Regenerate Image">
                        <RefreshCw size={16} />
                    </button>
                </div>
            )}
          </>
        ) : (
          <div className="text-center p-6 w-full">
             {isLoading ? (
                <div className="flex flex-col items-center gap-3 text-orange-600 h-full justify-center">
                  <div className="relative">
                    <Loader2 className="animate-spin" size={32} />
                    <div className="absolute inset-0 bg-orange-500 blur-xl opacity-20"></div>
                  </div>
                  <span className="text-xs font-mono animate-pulse">Generating Visual...</span>
                </div>
             ) : (
                <div className="flex flex-col items-center">
                    <div className="mb-4 flex justify-center text-slate-400">
                        <ImageIcon size={40} strokeWidth={1} />
                    </div>
                    <Button size="sm" variant="ghost" className="bg-white border border-slate-200 text-slate-600 text-xs hover:bg-slate-50" onClick={handleGenerate}>
                    Generate Image
                    </Button>
                    {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
                </div>
             )}
          </div>
        )}

        {/* Video Processing Overlay */}
        {isVideoProcessing && (
            <div className="absolute inset-0 bg-black/60 z-30 flex items-center justify-center backdrop-blur-sm">
                <div className="text-center text-white p-4">
                    <Loader2 className="animate-spin mx-auto mb-2 text-orange-500" size={24} />
                    <p className="text-xs font-mono">{videoState?.message || 'Processing Video...'}</p>
                    <div className="w-24 h-1 bg-white/20 rounded-full mx-auto mt-2 overflow-hidden">
                        <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${videoState?.progress || 0}%` }}></div>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Content Area */}
      <div className="p-3 space-y-4 flex-grow flex flex-col">
        
        {/* Video Actions Row */}
        <div className="flex gap-2">
            {isVideoReady ? (
                <>
                    <Button size="sm" onClick={onPlay} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs h-8 px-2">
                        <Play size={12} className="mr-1.5" /> {isPlaying ? 'Replay' : 'Play'}
                    </Button>
                    <a 
                        href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(videoState!.videoUrl!)}&filename=${encodeURIComponent(`scene-${scene.id}.mp4`)}`}
                        className="flex-1 inline-flex items-center justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/30 px-2 py-1.5 text-xs h-8"
                    >
                        <Download size={12} className="mr-1.5" /> Save
                    </a>
                    <Button 
                        size="sm" 
                        onClick={() => {
                            if (window.confirm('Generate ulang video? Video lama akan hilang.')) {
                                onCreateVideo?.(customVideoPrompt);
                            }
                        }}
                        className="w-8 h-8 px-0 bg-white border border-slate-200 text-orange-600 hover:bg-orange-50 hover:border-orange-200 shrink-0"
                        title="Regenerate Video"
                    >
                        <RefreshCw size={14} />
                    </Button>
                </>
            ) : (
                <Button 
                    size="sm" 
                    onClick={() => onCreateVideo?.(customVideoPrompt)} 
                    disabled={!scene.generatedImageUrl || isVideoProcessing}
                    className={`w-full text-xs h-8 ${isVideoProcessing ? 'bg-slate-100 text-slate-400' : 'bg-orange-600 hover:bg-orange-500 text-white'}`}
                >
                    {isVideoProcessing ? 'Membuat Video...' : (isVideoFailed ? 'Gagal - Coba Lagi' : 'Buat Video')}
                </Button>
            )}
        </div>
        
        {isVideoFailed && <p className="text-[10px] text-red-500 text-center">{videoState?.error || 'Gagal membuat video'}</p>}

        {/* Veo/Audio Prompt Block (Combined) */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            <span className="flex items-center gap-1"><Video size={10} /> Veo Video Prompt</span>
            <div className="flex items-center gap-1">
                <button onClick={() => setIsEditingPrompt(!isEditingPrompt)} className={`hover:text-orange-600 ${isEditingPrompt ? 'text-orange-600' : ''}`} title="Edit Prompt"><Edit2 size={10} /></button>
                <button onClick={() => copyToClipboard(customVideoPrompt)} className="hover:text-orange-600" title="Copy Full Prompt"><Copy size={10} /></button>
            </div>
          </div>
          {isEditingPrompt ? (
              <textarea 
                value={customVideoPrompt}
                onChange={(e) => setCustomVideoPrompt(e.target.value)}
                className="w-full bg-white border border-orange-300 rounded p-2 text-[10px] text-slate-700 font-mono leading-relaxed h-20 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
          ) : (
              <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[10px] text-slate-600 font-mono leading-relaxed h-16 overflow-y-auto custom-scrollbar">
                 {customVideoPrompt}
              </div>
          )}
        </div>

        {/* Image Prompt Block */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
             <span className="flex items-center gap-1"><ImageIcon size={10} /> Image Prompt</span>
             <button onClick={() => copyToClipboard(`${consistentSubject}. ${scene.imagePrompt}`)} className="hover:text-orange-600" title="Copy Full Prompt"><Copy size={10} /></button>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[10px] text-slate-600 font-mono leading-relaxed h-16 overflow-y-auto custom-scrollbar">
             <span className="text-orange-600 font-semibold">Subject:</span> {consistentSubject}
             <br/>
             <span className="text-orange-600 font-semibold">Action:</span> {scene.imagePrompt}
          </div>
        </div>

      </div>
    </div>
  );
};
