import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Download, Trash2, Wand2, Plus, Loader2, Music, Video as VideoIcon, Stamp, Type, Image as ImageIcon, Sparkles, Bot, Volume2, VolumeX, RefreshCcw, Captions, Bold, Italic, Palette, ChevronDown, ChevronUp, Scissors } from 'lucide-react';
import { VideoFile, ProcessingState, AI_Voice, TTSConfig, WatermarkConfig, WatermarkType, WatermarkPosition, NarrationStyle, WatermarkTemplate, SubtitleConfig, SubtitleChunk } from './types';
import { GeminiService } from './services/geminiService';
import { VideoProcessor } from './services/videoProcessor';
import { generateSubtitleChunks } from './utils';

const geminiService = new GeminiService();

export default function App() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExtension, setResultExtension] = useState<string>('mp4');
  
  // Video Processing Options
  const [keepOriginalAudio, setKeepOriginalAudio] = useState<boolean>(true);
  const [trimToAudio, setTrimToAudio] = useState<boolean>(true);

  // TTS State
  const [ttsText, setTtsText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<AI_Voice>(AI_Voice.Kore);
  const [generatedAudioBlob, setGeneratedAudioBlob] = useState<Blob | null>(null);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Subtitle State
  const [subtitleChunks, setSubtitleChunks] = useState<SubtitleChunk[]>([]);
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>({
    enabled: false,
    textColor: '#FFD700', // Gold Default
    outlineColor: '#000000',
    isBold: true,
    isItalic: false,
    fontSizeScale: 1.0,
    wordsPerLine: 2,
    positionY: 85 // 85% from top
  });

  // Drag & Drop reorder state
  const dragIndexRef = useRef<number | null>(null);

  // Image to Narration State
  const [productDescription, setProductDescription] = useState<string>('');
  const [narrationStyle, setNarrationStyle] = useState<NarrationStyle>(NarrationStyle.CASUAL);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [scriptLanguage, setScriptLanguage] = useState<string>('Indonesia');

  // Watermark State
  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig>({
    enabled: false,
    type: WatermarkType.TEXT,
    template: WatermarkTemplate.PLAIN,
    text: 'My Video',
    position: WatermarkPosition.BOTTOM_RIGHT,
    opacity: 0.8,
    scale: 1.0
  });

  useEffect(() => {
    let mounted = true;
    const key = 'EDITOR_NARASI_URLS';
    const raw = sessionStorage.getItem(key);
    if (raw) {
      try {
        const urls: string[] = JSON.parse(raw);
        const importUrls = async (list: string[]) => {
          const imported: VideoFile[] = [];
          for (let i = 0; i < list.length; i++) {
            try {
              const resp = await fetch(list[i], { cache: 'no-store' });
              if (!resp.ok) continue;
              const blob = await resp.blob();
              const file = new File([blob], `veo_import_${String(i + 1).padStart(2, '0')}.mp4`, { type: blob.type || 'video/mp4' });
              imported.push({ id: Math.random().toString(36).slice(2), file, previewUrl: URL.createObjectURL(file), duration: 0 });
            } catch {}
          }
          if (mounted && imported.length > 0) {
            setVideos(imported);
          }
        };
        importUrls(urls).then(() => { try { sessionStorage.removeItem(key); } catch {} });
      } catch {}
    }
    const onNavigate = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        const urls = Array.isArray(detail?.urls) ? detail.urls : null;
        if (urls && urls.length > 0) {
          const importUrls = async (list: string[]) => {
            const imported: VideoFile[] = [];
            for (let i = 0; i < list.length; i++) {
              try {
                const resp = await fetch(list[i], { cache: 'no-store' });
                if (!resp.ok) continue;
                const blob = await resp.blob();
                const file = new File([blob], `veo_import_${String(i + 1).padStart(2, '0')}.mp4`, { type: blob.type || 'video/mp4' });
                imported.push({ id: Math.random().toString(36).slice(2), file, previewUrl: URL.createObjectURL(file), duration: 0 });
              } catch {}
            }
            if (mounted && imported.length > 0) {
              setVideos(imported);
            }
          };
          importUrls(urls);
        }
      } catch {}
    };
    window.addEventListener('navigate-editor-narasi', onNavigate as EventListener);
    return () => { mounted = false; };
  }, []);

  // Effect to handle Auto-Play when Audio Blob is generated
  // AND Generate Subtitle Chunks
  useEffect(() => {
    if (generatedAudioBlob && audioRef.current) {
      const url = URL.createObjectURL(generatedAudioBlob);
      audioRef.current.src = url;
      
      // Wait for metadata to get duration for subtitles
      audioRef.current.onloadedmetadata = () => {
         if (audioRef.current) {
            const duration = audioRef.current.duration;
            if (duration > 0 && ttsText) {
               const chunks = generateSubtitleChunks(ttsText, duration, subtitleConfig.wordsPerLine);
               setSubtitleChunks(chunks);
            }
         }
      };

      audioRef.current.play().catch(e => console.warn("Auto-play prevented:", e));

      // Cleanup URL when component unmounts or blob changes
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [generatedAudioBlob]);

  // Re-generate chunks if user changes wordsPerLine preference while audio exists
  useEffect(() => {
    if (generatedAudioBlob && audioRef.current && ttsText) {
       const duration = audioRef.current.duration;
       if (duration && duration > 0) {
          const chunks = generateSubtitleChunks(ttsText, duration, subtitleConfig.wordsPerLine);
          setSubtitleChunks(chunks);
       }
    }
  }, [subtitleConfig.wordsPerLine]);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newVideos: VideoFile[] = Array.from(e.target.files).map((file: File) => ({
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
        duration: 0, // Duration loaded later
      }));
      setVideos((prev) => [...prev, ...newVideos]);
    }
  };

  const removeVideo = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  // Reorder helpers (non-intrusive, preserves existing logic)
  const moveVideo = (fromIndex: number, toIndex: number) => {
    setVideos((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
      return next;
    });
  };
  const moveUp = (index: number) => {
    if (index > 0) moveVideo(index, index - 1);
  };
  const moveDown = (index: number) => {
    if (index < videos.length - 1) moveVideo(index, index + 1);
  };
  const setPosition = (index: number, position1Based: number) => {
    const target = Math.max(1, Math.min(position1Based, videos.length)) - 1;
    if (target !== index) moveVideo(index, target);
  };

  const handleDragStart = (idx: number) => {
    dragIndexRef.current = idx;
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };
  const handleDropOn = (idx: number) => {
    const from = dragIndexRef.current;
    if (from == null) return;
    if (from !== idx) moveVideo(from, idx);
    dragIndexRef.current = null;
  };

  const handleGenerateScriptFromDescription = async () => {
    if (!productDescription.trim()) {
      alert("Mohon isi deskripsi produk terlebih dahulu.");
      return;
    }

    setIsAnalyzingImage(true);
    try {
      const prompt = `Buat naskah narasi video pendek (copywriting) untuk produk berikut: "${productDescription}".
Gaya Bahasa: ${narrationStyle}.
Bahasa: ${scriptLanguage}.
Instruksi: Buat teks narasi yang menarik, persuasif, dan natural untuk dibacakan (TTS). Panjang sekitar 3-5 kalimat. Langsung berikan teks narasinya saja tanpa intro/outro.`;

      const resp = await fetch('/api/chutesChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-V3.1',
          messages: [
            { role: 'system', content: 'You are a professional copywriter. Output only the narration text.' },
            { role: 'user', content: prompt }
          ],
          stream: false,
          max_tokens: 512,
          temperature: 0.7
        })
      });

      if (!resp.ok) throw new Error('API Error');
      const data = await resp.json();
      const script = data?.choices?.[0]?.message?.content?.trim() || '';
      if (!script) throw new Error('Empty response');
      
      setTtsText(script);
    } catch (error) {
      console.error(error);
      alert("Gagal membuat naskah otomatis. Silakan coba lagi.");
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleGenerateTTS = async () => {
    if (!ttsText.trim()) return;
    
    setIsTtsLoading(true);
    // Reset blob first so React knows to re-render if we generate again
    setGeneratedAudioBlob(null); 
    
    // Enable subtitles by default when generating new audio
    setSubtitleConfig(prev => ({...prev, enabled: true}));

    try {
      const audioBlob = await geminiService.generateSpeech({
        text: ttsText,
        voice: selectedVoice
      });
      // Setting this will trigger the useEffect above
      setGeneratedAudioBlob(audioBlob);
    } catch (error) {
      alert("Gagal membuat audio. Pastikan API Key valid.");
    } finally {
      setIsTtsLoading(false);
    }
  };

  const handleWatermarkImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setWatermarkConfig(prev => ({
        ...prev,
        enabled: true,
        type: WatermarkType.IMAGE,
        imageFile: e.target.files![0]
      }));
    }
  };

  const handleMergeVideos = async () => {
    if (videos.length === 0) return;

    setProcessingState(ProcessingState.MERGING_VIDEO);
    setProgressMessage("Inisialisasi penggabungan video...");
    setResultUrl(null);

    try {
      const processor = new VideoProcessor();
      const { blob, extension } = await processor.mergeVideos(
        videos, 
        generatedAudioBlob, 
        watermarkConfig, 
        subtitleConfig,
        subtitleChunks,
        keepOriginalAudio,
        trimToAudio,
        (msg) => {
          setProgressMessage(msg);
        }
      );
      
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultExtension(extension);
      setProcessingState(ProcessingState.COMPLETED);
    } catch (error) {
      console.error(error);
      setProcessingState(ProcessingState.ERROR);
      setProgressMessage("Terjadi kesalahan saat menggabungkan video.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans selection:bg-orange-200 selection:text-orange-900">
      
      <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Inputs */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Video Upload Section */}
          <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                <VideoIcon className="w-5 h-5 text-orange-600" />
                Daftar Video
              </h2>
              <span className="text-xs font-medium bg-gray-200 px-2 py-1 rounded-full text-slate-600">
                {videos.length} Video
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              {videos.map((video, index) => (
                <div
                  key={video.id}
                  className="relative group aspect-video bg-black rounded-xl overflow-hidden border border-gray-200"
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDropOn(index)}
                >
                  <video 
                    src={video.previewUrl} 
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur text-xs px-2 py-0.5 rounded text-white">
                    #{index + 1}
                  </div>
                  <button 
                    onClick={() => removeVideo(video.id)}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => moveUp(index)}
                      className="p-1.5 rounded-md bg-white/80 hover:bg-white shadow-sm border border-gray-200"
                      title="Naikkan urutan"
                    >
                      <ChevronUp className="w-4 h-4 text-slate-700" />
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      className="p-1.5 rounded-md bg-white/80 hover:bg-white shadow-sm border border-gray-200"
                      title="Turunkan urutan"
                    >
                      <ChevronDown className="w-4 h-4 text-slate-700" />
                    </button>
                  </div>
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-all">
                    <select
                      value={index + 1}
                      onChange={(e) => setPosition(index, parseInt(e.target.value))}
                      className="text-xs bg-black/50 text-white rounded-md px-2 py-1 outline-none border border-white/30"
                      title="Set posisi langsung"
                    >
                      {Array.from({ length: videos.length }, (_, i) => i + 1).map((pos) => (
                        <option key={pos} value={pos}>#{pos}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              
              <label className="flex flex-col items-center justify-center aspect-video border-2 border-dashed border-orange-200 hover:border-orange-500 bg-orange-50 hover:bg-orange-100/50 rounded-xl cursor-pointer transition-all group">
                <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-orange-600" />
                </div>
                <span className="mt-2 text-sm text-slate-600 font-medium">Tambah Video</span>
                <input type="file" multiple accept="video/*" onChange={handleVideoUpload} className="hidden" />
              </label>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              * Video hasil akan mengikuti resolusi dan rasio video pertama.
            </p>
          </section>

          <div className="grid md:grid-cols-2 gap-8">
            {/* AI TTS Section */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                  <Wand2 className="w-5 h-5 text-emerald-600" />
                  Narasi Suara
                </h2>
              </div>

              {/* AI Text Generation from Description */}
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">AI Penulis Naskah (Opsional)</span>
                </div>
                
                <div className="space-y-3">
                    <textarea
                        value={productDescription}
                        onChange={(e) => setProductDescription(e.target.value)}
                        placeholder="Deskripsikan produk Anda (cth: Sepatu lari ringan, bahan mesh breathable, warna merah menyala, cocok untuk marathon)..."
                        className="w-full text-xs p-2 rounded-lg border border-emerald-200 focus:ring-1 focus:ring-emerald-500 outline-none resize-none h-16 text-slate-700 bg-white"
                    />
                    <div className="flex gap-2">
                        <select 
                          value={narrationStyle}
                          onChange={(e) => setNarrationStyle(e.target.value as NarrationStyle)}
                          className="flex-1 bg-white border border-emerald-200 rounded-lg text-xs px-2 py-1.5 outline-none text-slate-700 focus:ring-1 focus:ring-emerald-500 shadow-sm"
                        >
                          {Object.values(NarrationStyle).map((style) => (
                            <option key={style} value={style}>{style}</option>
                          ))}
                       </select>
                       <select 
                          value={scriptLanguage}
                          onChange={(e) => setScriptLanguage(e.target.value)}
                          className="flex-1 bg-white border border-emerald-200 rounded-lg text-xs px-2 py-1.5 outline-none text-slate-700 focus:ring-1 focus:ring-emerald-500 shadow-sm"
                        >
                          <option>Indonesia</option>
                          <option>Inggris</option>
                          <option>Malaysia</option>
                          <option>Spanyol</option>
                          <option>Prancis</option>
                          <option>Arab</option>
                          <option>Hindi</option>
                          <option>Jepang</option>
                          <option>Korea</option>
                          <option>Mandarin</option>
                       </select>
                    </div>
                    <button 
                      onClick={handleGenerateScriptFromDescription}
                      disabled={isAnalyzingImage || !productDescription.trim()}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 shadow-sm"
                    >
                       {isAnalyzingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                       {isAnalyzingImage ? 'Sedang Menulis...' : 'Buat Naskah Otomatis'}
                    </button>
                </div>
              </div>

              <div className="space-y-4 flex-1">
                <div>
                  <label className="block text-sm text-slate-600 font-medium mb-2">Teks Narasi</label>
                  <textarea 
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none h-24 transition-all"
                    placeholder="Masukkan teks atau gunakan AI Penulis di atas..."
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                  />
                </div>
                
                <div className="flex flex-col gap-4">
                  <div className="w-full">
                    <label className="block text-sm text-slate-600 font-medium mb-2">Pilih Narator (Orang Indonesia)</label>
                    <div className="relative">
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value as AI_Voice)}
                        className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer text-slate-900"
                      >
                        <option value={AI_Voice.Kore}>Siti (Perempuan - Lembut)</option>
                        <option value={AI_Voice.Zephyr}>Rina (Perempuan - Santai)</option>
                        <option value={AI_Voice.Puck}>Budi (Laki-laki - Ceria)</option>
                        <option value={AI_Voice.Charon}>Joko (Laki-laki - Wibawa)</option>
                        <option value={AI_Voice.Fenrir}>Asep (Laki-laki - Cepat)</option>
                      </select>
                      <div className="absolute right-3 top-3.5 pointer-events-none text-slate-500">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleGenerateTTS}
                    disabled={isTtsLoading || !ttsText}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
                  >
                    {isTtsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
                    Buat Audio
                  </button>
                </div>

                {generatedAudioBlob && (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg mt-2 animate-in fade-in zoom-in duration-300">
                    <div className="p-2 bg-emerald-500 rounded-full text-white">
                      <Music className="w-4 h-4" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs font-bold text-emerald-800 truncate">Audio AI Siap</p>
                      <audio ref={audioRef} controls className="h-6 w-full mt-1" />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Tabs Container: Watermark & Subtitles */}
            <div className="flex flex-col gap-4 h-full">
              
              {/* Watermark Section */}
              <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex-1">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                    <Stamp className="w-5 h-5 text-orange-600" />
                    Watermark
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{watermarkConfig.enabled ? 'Aktif' : 'Nonaktif'}</span>
                    <button 
                      onClick={() => setWatermarkConfig(prev => ({...prev, enabled: !prev.enabled}))}
                      className={`w-10 h-5 rounded-full transition-colors relative ${watermarkConfig.enabled ? 'bg-orange-600' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${watermarkConfig.enabled ? 'left-6' : 'left-1'} shadow-sm`}></div>
                    </button>
                  </div>
                </div>

                <div className={`space-y-4 transition-opacity ${watermarkConfig.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                  
                  {/* Watermark Type Tabs */}
                  <div className="flex p-1 bg-gray-100 rounded-lg border border-gray-200">
                    <button 
                      onClick={() => setWatermarkConfig(prev => ({...prev, type: WatermarkType.TEXT}))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-all ${watermarkConfig.type === WatermarkType.TEXT ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Type className="w-3 h-3" /> Teks
                    </button>
                    <button 
                      onClick={() => setWatermarkConfig(prev => ({...prev, type: WatermarkType.IMAGE}))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-all ${watermarkConfig.type === WatermarkType.IMAGE ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <ImageIcon className="w-3 h-3" /> Gambar
                    </button>
                  </div>

                  {/* Template Selector (Text Only) */}
                  {watermarkConfig.type === WatermarkType.TEXT && (
                    <div>
                      <label className="block text-xs text-slate-600 font-medium mb-2">Template Desain</label>
                      <select
                        value={watermarkConfig.template}
                        onChange={(e) => setWatermarkConfig(prev => ({...prev, template: e.target.value as WatermarkTemplate}))}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 text-slate-900"
                      >
                        <option value={WatermarkTemplate.PLAIN}>Teks Biasa</option>
                        <option value={WatermarkTemplate.CONTACT}>Info Kontak / HP</option>
                        <option value={WatermarkTemplate.SOCIAL}>Username Medsos</option>
                        <option value={WatermarkTemplate.NEWS}>Berita (Breaking News)</option>
                      </select>
                    </div>
                  )}

                  {/* Input based on Type */}
                  {watermarkConfig.type === WatermarkType.TEXT ? (
                    <div>
                        <input 
                          type="text" 
                          value={watermarkConfig.text}
                          onChange={(e) => setWatermarkConfig(prev => ({...prev, text: e.target.value}))}
                          placeholder={
                            watermarkConfig.template === WatermarkTemplate.CONTACT ? "0812-3456-7890" :
                            watermarkConfig.template === WatermarkTemplate.SOCIAL ? "@username" :
                            watermarkConfig.template === WatermarkTemplate.NEWS ? "BREAKING NEWS: Tulis berita di sini..." :
                            "Teks Watermark"
                          }
                          className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none text-slate-900 placeholder-slate-400"
                        />
                    </div>
                  ) : (
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleWatermarkImageUpload}
                        className="hidden" 
                        id="wm-upload"
                      />
                      <label htmlFor="wm-upload" className="w-full flex items-center justify-center gap-2 bg-gray-50 border border-gray-300 border-dashed rounded-lg p-3 cursor-pointer hover:bg-gray-100 text-xs text-slate-500 transition-colors">
                        {watermarkConfig.imageFile ? watermarkConfig.imageFile.name : 'Upload Logo (PNG/JPG)'}
                      </label>
                    </div>
                  )}

                  {/* Dropdown Position (Hidden for News template) */}
                  {watermarkConfig.template !== WatermarkTemplate.NEWS && (
                    <div>
                      <label className="block text-xs text-slate-600 font-medium mb-2">Posisi</label>
                      <select
                        value={watermarkConfig.position}
                        onChange={(e) => setWatermarkConfig(prev => ({...prev, position: e.target.value as WatermarkPosition}))}
                        className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 text-slate-900"
                      >
                        <option value={WatermarkPosition.TOP_LEFT}>Pojok Kiri Atas</option>
                        <option value={WatermarkPosition.TOP_RIGHT}>Pojok Kanan Atas</option>
                        <option value={WatermarkPosition.CENTER}>Tengah</option>
                        <option value={WatermarkPosition.BOTTOM_LEFT}>Pojok Kiri Bawah</option>
                        <option value={WatermarkPosition.BOTTOM_RIGHT}>Pojok Kanan Bawah</option>
                      </select>
                    </div>
                  )}

                  {/* Sliders */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-slate-600 font-medium mb-1">Transparansi</label>
                        <input 
                          type="range" min="0.1" max="1" step="0.1"
                          value={watermarkConfig.opacity}
                          onChange={(e) => setWatermarkConfig(prev => ({...prev, opacity: parseFloat(e.target.value)}))}
                          className="w-full accent-orange-600"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-600 font-medium mb-1">Ukuran</label>
                        <input 
                          type="range" min="0.5" max="2.0" step="0.1"
                          value={watermarkConfig.scale}
                          onChange={(e) => setWatermarkConfig(prev => ({...prev, scale: parseFloat(e.target.value)}))}
                          className="w-full accent-orange-600"
                        />
                    </div>
                  </div>

                </div>
              </section>

              {/* Subtitle Section */}
              <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex-1">
                 <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                      <Captions className="w-5 h-5 text-amber-500" />
                      Subtitle
                    </h2>
                    <div className="flex items-center gap-2">
                       <span className="text-xs text-slate-500">{subtitleConfig.enabled ? 'Aktif' : 'Nonaktif'}</span>
                       <button 
                        onClick={() => setSubtitleConfig(prev => ({...prev, enabled: !prev.enabled}))}
                        className={`w-10 h-5 rounded-full transition-colors relative ${subtitleConfig.enabled ? 'bg-amber-500' : 'bg-gray-300'}`}
                       >
                         <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${subtitleConfig.enabled ? 'left-6' : 'left-1'} shadow-sm`}></div>
                       </button>
                    </div>
                 </div>

                 <div className={`space-y-4 transition-opacity ${subtitleConfig.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                     
                     {/* Subtitle Mode & Style */}
                     <div className="flex gap-2">
                        <button 
                          onClick={() => setSubtitleConfig(prev => ({...prev, wordsPerLine: 1}))}
                          className={`flex-1 py-1.5 text-xs border rounded-md transition-all ${subtitleConfig.wordsPerLine === 1 ? 'bg-amber-50 text-amber-700 border-amber-300 font-medium' : 'bg-gray-50 text-slate-500 border-gray-200'}`}
                        >
                           1 Kata
                        </button>
                        <button 
                          onClick={() => setSubtitleConfig(prev => ({...prev, wordsPerLine: 2}))}
                          className={`flex-1 py-1.5 text-xs border rounded-md transition-all ${subtitleConfig.wordsPerLine === 2 ? 'bg-amber-50 text-amber-700 border-amber-300 font-medium' : 'bg-gray-50 text-slate-500 border-gray-200'}`}
                        >
                           2 Kata
                        </button>
                     </div>

                     {/* Formatting */}
                     <div className="flex gap-3">
                        <div className="flex bg-gray-100 rounded-md overflow-hidden border border-gray-200">
                           <button 
                              onClick={() => setSubtitleConfig(prev => ({...prev, isBold: !prev.isBold}))}
                              className={`p-2 transition-colors ${subtitleConfig.isBold ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                              title="Bold"
                           >
                             <Bold className="w-4 h-4" />
                           </button>
                           <div className="w-px bg-gray-300"></div>
                           <button 
                              onClick={() => setSubtitleConfig(prev => ({...prev, isItalic: !prev.isItalic}))}
                              className={`p-2 transition-colors ${subtitleConfig.isItalic ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                              title="Italic"
                           >
                             <Italic className="w-4 h-4" />
                           </button>
                        </div>
                        
                        {/* Color Pickers */}
                        <div className="flex items-center gap-2 flex-1 justify-end">
                           <div className="relative group cursor-pointer">
                              <input 
                                type="color" 
                                value={subtitleConfig.textColor}
                                onChange={(e) => setSubtitleConfig(prev => ({...prev, textColor: e.target.value}))}
                                className="w-8 h-8 rounded cursor-pointer opacity-0 absolute inset-0 z-10"
                              />
                              <div className="w-8 h-8 rounded border border-gray-300 shadow-sm flex items-center justify-center bg-grid" style={{backgroundColor: subtitleConfig.textColor}}>
                                 <Palette className="w-4 h-4 text-black/50 mix-blend-overlay" />
                              </div>
                           </div>
                           <div className="relative group cursor-pointer">
                              <input 
                                type="color" 
                                value={subtitleConfig.outlineColor}
                                onChange={(e) => setSubtitleConfig(prev => ({...prev, outlineColor: e.target.value}))}
                                className="w-8 h-8 rounded cursor-pointer opacity-0 absolute inset-0 z-10"
                              />
                              <div className="w-8 h-8 rounded border border-gray-300 shadow-sm flex items-center justify-center relative bg-grid" style={{backgroundColor: subtitleConfig.outlineColor}}>
                                 <div className="absolute inset-1 border border-white/40 rounded-sm"></div>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Sliders Y Position */}
                     <div className="space-y-4">
                        <div>
                           <label className="block text-xs text-slate-600 font-medium mb-1 flex justify-between">
                              <span>Posisi Vertikal (Y)</span>
                              <span>{subtitleConfig.positionY}%</span>
                           </label>
                           <input 
                             type="range" min="50" max="95" step="1"
                             value={subtitleConfig.positionY}
                             onChange={(e) => setSubtitleConfig(prev => ({...prev, positionY: parseInt(e.target.value)}))}
                             className="w-full accent-amber-500"
                           />
                        </div>
                        <div>
                           <label className="block text-xs text-slate-600 font-medium mb-1 flex justify-between">
                              <span>Ukuran Teks</span>
                              <span>{subtitleConfig.fontSizeScale}x</span>
                           </label>
                           <input 
                             type="range" min="0.5" max="2.0" step="0.1"
                             value={subtitleConfig.fontSizeScale}
                             onChange={(e) => setSubtitleConfig(prev => ({...prev, fontSizeScale: parseFloat(e.target.value)}))}
                             className="w-full accent-amber-500"
                           />
                        </div>
                     </div>
                 </div>
              </section>

            </div>

          </div>

        </div>

        {/* Right Column: Actions & Preview */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Action Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm sticky top-8">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">Proses</h2>
            
            {/* Control Switches */}
            <div className="mb-6 space-y-3">
              {/* Switch: Original Audio */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                <span className="text-sm text-slate-700 flex items-center gap-2 font-medium">
                   {keepOriginalAudio ? <Volume2 className="w-4 h-4 text-orange-600" /> : <VolumeX className="w-4 h-4 text-red-500" />}
                   Suara Video Asli
                </span>
                <button 
                  onClick={() => setKeepOriginalAudio(!keepOriginalAudio)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${keepOriginalAudio ? 'bg-orange-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${keepOriginalAudio ? 'left-6' : 'left-1'} shadow-sm`}></div>
                </button>
              </div>

              {/* Switch: Trim to Audio */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                <span className="text-sm text-slate-700 flex items-center gap-2 font-medium">
                   <Scissors className="w-4 h-4 text-emerald-600" />
                   Potong Video Sesuai Narasi
                </span>
                <button 
                  onClick={() => setTrimToAudio(!trimToAudio)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${trimToAudio ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${trimToAudio ? 'left-6' : 'left-1'} shadow-sm`}></div>
                </button>
              </div>
            </div>

            <ul className="text-sm text-slate-500 space-y-2 mb-6">
              <li className="flex items-center gap-2">
                <VideoIcon className="w-4 h-4 text-slate-400" /> {videos.length} Video digabungkan
              </li>
              {generatedAudioBlob && (
                <li className="flex items-center gap-2 text-emerald-600 font-medium">
                  <Music className="w-4 h-4" /> Narasi Suara Aktif
                </li>
              )}
              {subtitleConfig.enabled && generatedAudioBlob && (
                <li className="flex items-center gap-2 text-amber-600 font-medium">
                  <Captions className="w-4 h-4" /> Subtitle Aktif ({subtitleChunks.length} bagian)
                </li>
              )}
              {generatedAudioBlob && videos.length > 0 && (
                 <li className="flex items-center gap-2 text-amber-600 text-xs bg-amber-50 p-1 rounded border border-amber-100">
                    <RefreshCcw className="w-3 h-3" /> Video akan diulang menyesuaikan narasi
                 </li>
              )}
              {watermarkConfig.enabled && (
                <li className="flex items-center gap-2 text-orange-600 font-medium">
                  <Stamp className="w-4 h-4" /> Watermark: {watermarkConfig.type === WatermarkType.TEXT ? watermarkConfig.template : 'Gambar'}
                </li>
              )}
            </ul>

            <button 
              onClick={handleMergeVideos}
              disabled={videos.length === 0 || processingState === ProcessingState.MERGING_VIDEO}
              className="w-full py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg shadow-orange-200 hover:shadow-orange-300 transition-all flex items-center justify-center gap-2"
            >
              {processingState === ProcessingState.MERGING_VIDEO ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  Gabungkan Video
                </>
              )}
            </button>

            {processingState === ProcessingState.MERGING_VIDEO && (
               <div className="mt-4 text-center">
                 <p className="text-sm text-orange-600 animate-pulse font-medium">{progressMessage}</p>
               </div>
            )}

            {resultUrl && (
              <div className="mt-6 pt-6 border-t border-gray-200 animate-in fade-in slide-in-from-bottom-4">
                <h3 className="font-bold text-emerald-600 mb-3 flex items-center gap-2">
                   <Sparkles className="w-4 h-4" /> Hasil Penggabungan
                </h3>
                <video 
                  src={resultUrl} 
                  controls 
                  className="w-full rounded-lg shadow-md bg-black aspect-video mb-4 border border-gray-300"
                />
                <a 
                  href={resultUrl} 
                  download={`video-gabungan-ai.${resultExtension}`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Unduh Video (.{resultExtension})
                </a>
              </div>
            )}
          </div>

        </div>
      </main>
      {/* Processing Overlay Warning */}
      {processingState === ProcessingState.MERGING_VIDEO && (
        <div className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center backdrop-blur-sm cursor-wait">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full mx-6 text-center shadow-2xl border-4 border-orange-500 animate-in fade-in zoom-in duration-300 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 via-red-500 to-orange-400 animate-gradient-x"></div>
            
            <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-orange-100 relative">
              <div className="absolute inset-0 rounded-full border-4 border-orange-200 border-t-orange-600 animate-spin"></div>
              <Loader2 className="w-8 h-8 text-orange-600 animate-pulse" />
            </div>
            
            <h3 className="text-2xl font-bold text-slate-900 mb-4">Sedang Memproses Video...</h3>
            
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 text-left">
              <div className="flex gap-3">
                <div className="shrink-0">
                  <div className="w-1.5 h-full bg-orange-500 rounded-full"></div>
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-orange-800 text-sm uppercase tracking-wide">Peringatan Penting:</p>
                  <p className="text-sm text-orange-900 leading-relaxed">
                    Jangan menutup, minimize browser, atau berpindah aplikasi selama proses ini berlangsung.
                  </p>
                  <p className="text-sm font-bold text-red-600 mt-2">
                    ⚠️ Tindakan tersebut dapat menyebabkan proses macet (freeze) atau gagal.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-slate-500 text-sm mb-2 animate-pulse font-medium">Status: {progressMessage}</p>
            
            <p className="text-xs text-slate-400 mt-6">
              Mohon tunggu sebentar, sistem sedang menggabungkan klip dan audio Anda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
