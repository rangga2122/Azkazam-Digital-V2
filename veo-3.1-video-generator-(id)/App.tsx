
import React, { useState, useRef, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import { generateVideo } from './services/api';
import { AspectRatio, Resolution, GenerationState, BulkJob } from './types';

const App: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Mode State
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // Single Mode State
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>({
    isGenerating: false,
    progress: 0,
    message: '',
    videoUrl: null,
    error: null,
  });

  // Bulk Mode State
  const [bulkPrompt, setBulkPrompt] = useState('');
  const [bulkImage, setBulkImage] = useState<string | null>(null);
  const [bulkJobs, setBulkJobs] = useState<BulkJob[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  
  // Refs for managing queue execution safely without infinite loops
  const processingRef = useRef(false);
  const shouldStopRef = useRef(false);
  const jobsRef = useRef<BulkJob[]>([]);

  // Sync ref with state whenever jobs change to avoid stale closures in recursive functions
  useEffect(() => {
    jobsRef.current = bulkJobs;
  }, [bulkJobs]);

  // --- Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isBulk = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (endEvent) => {
        if (isBulk) {
          setBulkImage(endEvent.target?.result as string);
        } else {
          setReferenceImage(endEvent.target?.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset value to allow re-uploading same file if needed
    e.target.value = '';
  };

  // Single Generation
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setGenerationState({
      isGenerating: true,
      progress: 0,
      message: 'Menyiapkan...',
      videoUrl: null,
      error: null
    });

    try {
      const url = await generateVideo(
        prompt, 
        aspectRatio, 
        referenceImage, // Pass specific image or null
        (progress, message) => {
          setGenerationState(prev => ({ ...prev, progress, message }));
        }
      );

      setGenerationState(prev => ({ 
        ...prev, 
        isGenerating: false, 
        videoUrl: url, 
        progress: 100, 
        message: 'Selesai!' 
      }));
    } catch (err: any) {
      console.error(err);
      setGenerationState(prev => ({ 
        ...prev, 
        isGenerating: false, 
        error: err.message || 'Terjadi kesalahan saat membuat video.' 
      }));
    }
  };

  // Bulk Generation Logic
  const handleAddToQueue = () => {
    if (!bulkPrompt.trim()) return;

    const newJob: BulkJob = {
      id: Math.random().toString(36).substr(2, 9),
      prompt: bulkPrompt.trim(),
      imageBase64: bulkImage, // Attach the image to the job
      status: 'pending',
      progress: 0
    };

    // Update state and force ref update immediately to ensure processQueue sees it
    setBulkJobs(prev => {
      const updated = [...prev, newJob];
      jobsRef.current = updated;
      return updated;
    });
    
    // Reset Form inputs
    setBulkPrompt('');
    setBulkImage(null);

    // Trigger queue if not running
    if (!processingRef.current) {
      shouldStopRef.current = false;
      processQueue();
    }
  };

  const handleStopQueue = () => {
    shouldStopRef.current = true;
  };

  const processQueue = async () => {
    // Check stop signal
    if (shouldStopRef.current) {
      setIsBulkProcessing(false);
      processingRef.current = false;
      shouldStopRef.current = false; // Reset flag
      return;
    }

    // Find next pending job using REF (latest data)
    const currentJobs = jobsRef.current;
    const jobIndex = currentJobs.findIndex(j => j.status === 'pending');
    
    if (jobIndex === -1) {
      setIsBulkProcessing(false);
      processingRef.current = false;
      return;
    }

    // Lock processing
    processingRef.current = true;
    setIsBulkProcessing(true);

    const job = currentJobs[jobIndex];

    // Update status to processing
    setBulkJobs(prev => {
      const copy = [...prev];
      if (copy[jobIndex]) {
        copy[jobIndex] = { ...copy[jobIndex], status: 'processing', progress: 5 };
      }
      return copy;
    });

    try {
      const url = await generateVideo(
        job.prompt,
        aspectRatio, // Use global aspect ratio setting for the batch
        job.imageBase64 || null, // Use specific image for this job
        (progress, _) => {
          setBulkJobs(prev => {
            const copy = [...prev];
            // Only update if still processing (prevent race conditions)
            if (copy[jobIndex] && copy[jobIndex].status === 'processing') {
              copy[jobIndex].progress = progress;
            }
            return copy;
          });
        }
      );

      // Success
      setBulkJobs(prev => {
        const copy = [...prev];
        if (copy[jobIndex]) {
          copy[jobIndex] = { ...copy[jobIndex], status: 'completed', progress: 100, videoUrl: url };
        }
        return copy;
      });

    } catch (err: any) {
      // Failed
      setBulkJobs(prev => {
        const copy = [...prev];
        if (copy[jobIndex]) {
          copy[jobIndex] = { ...copy[jobIndex], status: 'failed', progress: 0, error: err.message || 'Gagal' };
        }
        return copy;
      });
    } finally {
      // Recursive call to process next item
      // We use setTimeout to allow UI to breathe and stack to clear
      setTimeout(() => {
        processQueue();
      }, 500);
    }
  };

  return (
    <div className="flex h-screen bg-veo-mesh relative font-sans text-veo-fg">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      <Sidebar />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="flex-shrink-0 h-20 md:h-24 px-6 md:px-10 flex items-center justify-between bg-white/70 backdrop-blur-xl border-b border-veo-border z-10">
          <div className="flex flex-col">
            <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-veo-gradient tracking-tight">
              ✨ VEO 3.1 Video Generator
            </h1>
            <p className="text-veo-muted text-sm md:text-base mt-1">
              Ubah ide Anda menjadi video sinematik menakjubkan dengan AI
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-3 rounded-xl border border-veo-border bg-white text-veo-primary hover:bg-veo-primary hover:text-white transition-all shadow-sm"
              title="Pengaturan API"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
            
            {/* Input Panel */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Mode Switcher */}
              <div className="bg-white/50 p-1.5 rounded-xl border border-veo-border flex gap-1">
                <button
                  onClick={() => setMode('single')}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    mode === 'single'
                      ? 'bg-white text-veo-primary shadow-sm ring-1 ring-veo-border'
                      : 'text-veo-muted hover:text-veo-fg hover:bg-white/50'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Mode Single
                </button>
                <button
                  onClick={() => setMode('bulk')}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    mode === 'bulk'
                      ? 'bg-white text-veo-primary shadow-sm ring-1 ring-veo-border'
                      : 'text-veo-muted hover:text-veo-fg hover:bg-white/50'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Mode Massal
                </button>
              </div>

              <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-veo-border p-6 shadow-sm flex flex-col gap-6">
                
                {mode === 'single' ? (
                  /* --- SINGLE MODE FORM --- */
                  <form onSubmit={handleGenerate} className="flex flex-col gap-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold uppercase tracking-wider text-slate-700">
                          Deskripsi Prompt
                        </label>
                        <span className={`text-xs ${prompt.length > 5000 ? 'text-red-500' : 'text-slate-400'}`}>
                          {prompt.length}/6500
                        </span>
                      </div>
                      <textarea 
                        className="w-full h-40 p-4 rounded-xl border-2 border-veo-border bg-white text-slate-800 placeholder-slate-400 focus:border-veo-primary focus:ring-4 focus:ring-veo-primary/10 outline-none transition-all resize-none text-base"
                        placeholder="Contoh: 'Hologram neon seekor kucing mengendarai mobil sport dengan kecepatan tinggi'"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        maxLength={6500}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">
                        Gambar Referensi (Opsional)
                      </label>
                      {!referenceImage ? (
                        <div 
                          className="relative border-2 border-dashed border-veo-border rounded-xl bg-veo-subtle/50 hover:bg-veo-primary/5 hover:border-veo-primary/50 transition-all group cursor-pointer h-36 flex flex-col items-center justify-center text-center p-4"
                          onClick={() => document.getElementById('image-upload')?.click()}
                        >
                          <input 
                            id="image-upload" 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handleImageUpload(e, false)}
                          />
                          <div className="bg-white p-3 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6 text-veo-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-slate-600 group-hover:text-veo-primary transition-colors">
                            Klik untuk upload gambar
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Maks 10 MB</p>
                        </div>
                      ) : (
                        <div className="relative rounded-xl overflow-hidden border border-veo-border bg-slate-50 p-2 flex items-center gap-4">
                          <img src={referenceImage} alt="Reference" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">Gambar terupload</p>
                            <button 
                              type="button" 
                              onClick={() => setReferenceImage(null)}
                              className="text-xs text-red-500 hover:text-red-700 font-medium mt-1"
                            >
                              Hapus Gambar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </form>
                ) : (
                  /* --- BULK MODE FORM (With Image Support) --- */
                  <div className="flex flex-col gap-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold uppercase tracking-wider text-slate-700">
                          Tambah Item ke Antrean
                        </label>
                        <span className="text-xs text-veo-primary font-medium bg-veo-primary/10 px-2 py-1 rounded-full">
                          Job Builder
                        </span>
                      </div>
                      
                      {/* Prompt Input */}
                      <textarea 
                        className="w-full h-32 p-4 mb-4 rounded-xl border-2 border-veo-border bg-white text-slate-800 placeholder-slate-400 focus:border-veo-primary focus:ring-4 focus:ring-veo-primary/10 outline-none transition-all resize-none text-sm"
                        placeholder="Masukkan prompt video..."
                        value={bulkPrompt}
                        onChange={(e) => setBulkPrompt(e.target.value)}
                      />

                      {/* Bulk Image Input */}
                      <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-500 mb-2">
                          Gambar Referensi Item Ini (Opsional)
                        </label>
                        {!bulkImage ? (
                          <div 
                            className="relative border-2 border-dashed border-veo-border rounded-lg bg-slate-50 hover:bg-veo-primary/5 transition-all group cursor-pointer h-20 flex items-center justify-center gap-3 px-4"
                            onClick={() => document.getElementById('bulk-image-upload')?.click()}
                          >
                            <input 
                              id="bulk-image-upload" 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => handleImageUpload(e, true)}
                            />
                            <svg className="w-5 h-5 text-veo-muted group-hover:text-veo-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            <span className="text-sm text-slate-600 group-hover:text-veo-primary font-medium">Upload Gambar</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-slate-100 p-2 rounded-lg border border-veo-border">
                            <div className="flex items-center gap-3">
                              <img src={bulkImage} alt="Bulk Ref" className="w-10 h-10 object-cover rounded-md border border-slate-200" />
                              <span className="text-xs font-medium text-slate-700">Gambar Dipilih</span>
                            </div>
                            <button 
                              onClick={() => setBulkImage(null)}
                              className="p-1 hover:bg-slate-200 rounded-full text-slate-500 hover:text-red-500"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>

                      <button 
                        onClick={handleAddToQueue}
                        disabled={!bulkPrompt.trim()}
                        className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Tambah ke Antrean</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Common Settings (Aspect Ratio & Resolution) */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Rasio Aspek
                    </label>
                    <div className="flex bg-veo-subtle/50 p-1 rounded-lg border border-veo-border">
                      {(['16:9', '9:16'] as AspectRatio[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setAspectRatio(r)}
                          className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                            aspectRatio === r 
                              ? 'bg-veo-gradient text-white shadow-md' 
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Resolusi
                    </label>
                    <div className="flex bg-veo-subtle/50 p-1 rounded-lg border border-veo-border">
                      {(['720p', '1080p'] as Resolution[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setResolution(r)}
                          className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                            resolution === r 
                              ? 'bg-veo-gradient text-white shadow-md' 
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                {mode === 'single' ? (
                  <button 
                    onClick={handleGenerate}
                    disabled={generationState.isGenerating}
                    className="w-full py-4 rounded-xl bg-veo-primary hover:bg-veo-primary-dark disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-lg uppercase tracking-wide shadow-lg shadow-veo-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                  >
                    {generationState.isGenerating ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Memproses...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Buat Video</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="p-4 bg-veo-subtle/50 rounded-xl border border-veo-border">
                    <div className="flex items-center gap-3 text-slate-600">
                      <div className={`w-2 h-2 rounded-full ${isBulkProcessing ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
                      <span className="text-sm font-semibold">
                        {isBulkProcessing ? 'Sedang memproses antrean...' : 'Antrean menunggu'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Output Panel */}
            <div className="lg:col-span-7 h-full min-h-[500px]">
              
              {mode === 'single' ? (
                /* --- SINGLE MODE OUTPUT --- */
                <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-veo-border p-4 md:p-6 shadow-sm h-full flex flex-col relative overflow-hidden">
                  {generationState.isGenerating && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-8">
                      <div className="w-full max-w-md bg-white rounded-2xl p-8 border border-veo-border shadow-xl text-center">
                        <div className="spinner w-16 h-16 border-4 border-veo-primary/20 border-t-veo-primary rounded-full mx-auto mb-6"></div>
                        <h3 className="text-xl font-bold bg-clip-text text-transparent bg-veo-gradient mb-2">
                          Sedang Membuat Video
                        </h3>
                        <p className="text-slate-500 text-sm mb-6 animate-pulse">
                          {generationState.message}
                        </p>
                        <div className="w-full bg-veo-subtle rounded-full h-3 overflow-hidden relative">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]"></div>
                          <div 
                            className="h-full bg-veo-gradient transition-all duration-500 ease-out"
                            style={{ width: `${generationState.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={`flex-1 flex items-center justify-center rounded-xl bg-slate-900 overflow-hidden relative border-2 border-dashed border-veo-border/50 transition-all ${generationState.videoUrl ? 'border-none shadow-2xl' : ''}`}>
                    {generationState.error ? (
                      <div className="text-center p-8">
                        <div className="bg-red-50 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                          <svg className="w-10 h-10 text-veo-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Terjadi Kesalahan</h3>
                        <p className="text-slate-500 max-w-sm mx-auto">{generationState.error}</p>
                        <button 
                          onClick={() => setIsSettingsOpen(true)}
                          className="mt-6 text-veo-primary font-semibold hover:underline"
                        >
                          Periksa Token API
                        </button>
                      </div>
                    ) : generationState.videoUrl ? (
                      <div className={`relative group w-full h-full flex items-center justify-center ${aspectRatio === '9:16' ? 'max-w-[400px]' : ''}`}>
                        <video 
                          src={generationState.videoUrl} 
                          controls 
                          autoPlay 
                          loop 
                          className="w-full h-full object-contain"
                        />
                        <a 
                          href={generationState.videoUrl} 
                          download="generated-video.mp4"
                          className="absolute bottom-6 right-6 bg-white/90 backdrop-blur text-slate-900 px-4 py-2 rounded-lg font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4-4m4 4v12" />
                          </svg>
                          Download
                        </a>
                      </div>
                    ) : (
                      <div className="text-center p-8">
                        <div className="bg-veo-subtle/50 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4 animate-float">
                          <svg className="w-12 h-12 text-veo-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Video Anda akan muncul di sini</h3>
                        <p className="text-slate-500 text-sm">Isi deskripsi dan klik "Buat Video" untuk memulai.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* --- BULK MODE OUTPUT (QUEUE DASHBOARD) --- */
                <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-veo-border p-6 shadow-sm h-full flex flex-col">
                  <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h3 className="text-xl font-extrabold text-slate-800">Antrean Generasi Massal</h3>
                    
                    <div className="flex flex-wrap items-center gap-4">
                      {isBulkProcessing && (
                        <button 
                          onClick={handleStopQueue}
                          className="px-3 py-1.5 rounded-lg bg-red-100 text-red-600 text-xs font-bold hover:bg-red-200 transition-colors flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Hentikan Antrean
                        </button>
                      )}
                      <div className="flex gap-4 text-sm font-semibold">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                          Pending: {bulkJobs.filter(j => j.status === 'pending').length}
                        </span>
                        <span className="flex items-center gap-1.5 text-veo-primary">
                          <span className="w-2.5 h-2.5 rounded-full bg-veo-primary animate-pulse"></span>
                          Proses: {bulkJobs.filter(j => j.status === 'processing').length}
                        </span>
                        <span className="flex items-center gap-1.5 text-veo-success">
                          <span className="w-2.5 h-2.5 rounded-full bg-veo-success"></span>
                          Selesai: {bulkJobs.filter(j => j.status === 'completed').length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {bulkJobs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-veo-border rounded-xl bg-veo-subtle/30">
                      <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-veo-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-bold text-slate-700">Antrean Kosong</h4>
                      <p className="text-slate-500 text-sm mt-1">Tambahkan prompt dan gambar (opsional) di panel kiri.</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
                      {bulkJobs.map((job) => (
                        <div key={job.id} className="bg-white border border-veo-border rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex gap-4 items-start">
                          
                          {/* Status Icon */}
                          <div className="flex-shrink-0 mt-1">
                            {job.status === 'pending' && (
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                            )}
                            {job.status === 'processing' && (
                              <div className="w-8 h-8 rounded-full border-2 border-veo-primary/20 border-t-veo-primary animate-spin"></div>
                            )}
                            {job.status === 'completed' && (
                              <div className="w-8 h-8 rounded-full bg-veo-success/10 flex items-center justify-center text-veo-success">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                            {job.status === 'failed' && (
                              <div className="w-8 h-8 rounded-full bg-veo-danger/10 flex items-center justify-center text-veo-danger">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </div>
                            )}
                          </div>

                          {/* Preview Image (if available) */}
                          {job.imageBase64 && (
                            <div className="flex-shrink-0">
                              <img src={job.imageBase64} alt="Ref" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-semibold text-slate-800 line-clamp-2" title={job.prompt}>
                                {job.prompt}
                              </p>
                              {job.status === 'completed' && job.videoUrl && (
                                <a 
                                  href={job.videoUrl} 
                                  download={`bulk-${job.id}.mp4`}
                                  className="ml-2 text-veo-primary hover:text-veo-primary-dark p-1"
                                  title="Download Video"
                                >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4-4m4 4v12" />
                                  </svg>
                                </a>
                              )}
                            </div>
                            
                            <div className="mt-2">
                              {job.status === 'processing' && (
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div className="h-full bg-veo-primary transition-all duration-500" style={{ width: `${job.progress}%` }}></div>
                                </div>
                              )}
                              <p className="text-xs text-slate-500 mt-1">
                                {job.status === 'pending' && 'Menunggu antrean...'}
                                {job.status === 'processing' && `Sedang memproses... ${job.progress}%`}
                                {job.status === 'completed' && 'Selesai'}
                                {job.status === 'failed' && `Gagal: ${job.error}`}
                              </p>
                            </div>

                            {job.status === 'completed' && job.videoUrl && (
                              <div className="mt-3 relative rounded-lg overflow-hidden bg-black aspect-video max-w-[200px]">
                                <video src={job.videoUrl} controls className="w-full h-full object-cover" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
