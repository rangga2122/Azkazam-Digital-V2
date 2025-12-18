import React, { useState, useEffect } from 'react';
import { Clapperboard, Sparkles, MessageSquare, ArrowRight, RefreshCw, Copy, Youtube, Instagram, Share2, ChevronLeft, Lightbulb, Users, Baby, RectangleVertical, RectangleHorizontal, Square, MonitorPlay, Play, Download, Video as VideoIcon } from 'lucide-react';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { StoryboardCard } from './components/StoryboardCard';
import { AppStep, ContentConcept, FullContent, ContentTone, Scene, TargetAudience, AspectRatio } from './types';
import { VISUAL_STYLES, NARRATORS, LANGUAGES } from './constants';
import { generateContentConcepts, generateFullContentData, generateSceneImage } from './services/geminiService';
import { GenerationStatus, GenerationState } from '../types';

const App: React.FC = () => {
  // State
  const [step, setStep] = useState<AppStep>(AppStep.INPUT);
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [concepts, setConcepts] = useState<ContentConcept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<ContentConcept | null>(null);
  const [fullContent, setFullContent] = useState<FullContent | null>(null);
  
  // Video Generation State
  const [inlineMap, setInlineMap] = useState<Record<string, GenerationState>>({});
  const [playingMap, setPlayingMap] = useState<Record<string, boolean>>({});

  // Copy State
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Audience State
  const [targetAudience, setTargetAudience] = useState<TargetAudience>('KIDS');
  // Aspect Ratio State
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  // Language State
  const [selectedLanguage, setSelectedLanguage] = useState<string>('id');

  // Filter styles based on audience
  const availableStyles = VISUAL_STYLES.filter(s => s.audiences.includes(targetAudience));
  
  // Initialize selection when available styles change
  const [selectedStyleId, setSelectedStyleId] = useState<string>('');
  const [selectedNarratorId, setSelectedNarratorId] = useState<string>('');

  // Effect to reset selection when audience changes
  useEffect(() => {
    if (availableStyles.length > 0) {
      if (targetAudience === 'ADULT') {
        const preferred = availableStyles.find(s => s.id === 'photo-real') || availableStyles[0];
        setSelectedStyleId(preferred.id);
      } else {
        setSelectedStyleId(availableStyles[0].id);
      }
    }
    // Set default narrator based on audience
    if (targetAudience === 'KIDS') {
      const kidNarrator = NARRATORS.find(n => n.id === 'kids_story') || NARRATORS[0];
      setSelectedNarratorId(kidNarrator.id);
    } else {
      const adultNarrator = NARRATORS.find(n => n.id === 'docu') || NARRATORS[0];
      setSelectedNarratorId(adultNarrator.id);
    }
  }, [targetAudience]);

  // Listen for video generation updates
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as any;
      const url = typeof detail?.url === 'string' ? detail.url : '';
      const state = detail?.state as GenerationState | undefined;
      if (!url || !state) return;
      setInlineMap(prev => ({ ...prev, [url]: state }));
    };
    window.addEventListener('inline-video-state', handler as EventListener);
    return () => window.removeEventListener('inline-video-state', handler as EventListener);
  }, []);


  // Helper to get visual modifier
  const currentStylePrompt = VISUAL_STYLES.find(s => s.id === selectedStyleId)?.promptModifier || '';
  
  // Helper to construct dynamic intonation tag with language
  const getLanguageNameForPrompt = (langId: string) => {
    const map: Record<string, string> = {
      'id': 'Indonesia',
      'en': 'Inggris',
      'ms': 'Melayu',
      'ja': 'Jepang',
      'ko': 'Korea',
      'zh': 'Mandarin',
      'ar': 'Arab',
      'es': 'Spanyol'
    };
    return map[langId] || 'Indonesia';
  };

  const baseIntonationTag = NARRATORS.find(n => n.id === selectedNarratorId)?.intonationTag || '';
  let currentIntonationTag = baseIntonationTag;
  
  if (baseIntonationTag) {
    const langName = getLanguageNameForPrompt(selectedLanguage);
    const insertPosition = baseIntonationTag.indexOf('Intonasi');
    
    if (insertPosition !== -1) {
      // Insert before "Intonasi"
      currentIntonationTag = baseIntonationTag.slice(0, insertPosition) + `Pakai Bahasa ${langName} ` + baseIntonationTag.slice(insertPosition);
    } else {
      // Fallback for tags without "Intonasi" (like kids_story)
      if (baseIntonationTag.includes('Suara Wanita')) {
        currentIntonationTag = baseIntonationTag.replace('Suara Wanita', `Suara Wanita Pakai Bahasa ${langName}`);
      } else if (baseIntonationTag.includes('Suara Pria')) {
        currentIntonationTag = baseIntonationTag.replace('Suara Pria', `Suara Pria Pakai Bahasa ${langName}`);
      }
    }
  }

  // Copy Handlers
  const handleCopyTitle = () => {
    if (fullContent?.socialPack.youtubeTitle) {
      navigator.clipboard.writeText(fullContent.socialPack.youtubeTitle);
      setCopiedTitle(true);
      setTimeout(() => setCopiedTitle(false), 2000);
    }
  };

  const handleCopyCaption = () => {
    if (fullContent?.socialPack.instagramCaption) {
      const caption = `${fullContent.socialPack.instagramCaption}\n\n${fullContent.socialPack.hashtags.map(h => `#${h}`).join(' ')}`;
      navigator.clipboard.writeText(caption);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  };

  // Handlers
  const handleGenerateConcepts = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const languageName = LANGUAGES.find(l => l.id === selectedLanguage)?.name || 'Indonesian (Bahasa Indonesia)';
      const results = await generateContentConcepts(topic, targetAudience, languageName);
      setConcepts(results);
      setStep(AppStep.SELECTION);
    } catch (error) {
      alert("Error generating concepts. Please check your API Key or try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConcept = async (concept: ContentConcept) => {
    setSelectedConcept(concept);
    setLoading(true); // Loading for script generation
    
    try {
      // 1. Generate Text Content
      const languageName = LANGUAGES.find(l => l.id === selectedLanguage)?.name || 'Indonesian (Bahasa Indonesia)';
      const result = await generateFullContentData(concept, targetAudience, languageName);
      
      // Enforce exactly 6 scenes
      let fixedScenes = (result.scenes || []).slice(0, 6);
      if (fixedScenes.length < 6) {
        const base = fixedScenes[fixedScenes.length - 1] || result.scenes[0];
        for (let i = fixedScenes.length + 1; i <= 6; i++) {
          fixedScenes.push({
            id: i,
            timeStart: base?.timeStart || '',
            timeEnd: base?.timeEnd || '',
            description: base?.description || '',
            imagePrompt: (base?.imagePrompt || '') + ' slight angle change',
            motionPrompt: base?.motionPrompt || '',
            narration: base?.narration || ''
          });
        }
      }

      // 2. Prepare scenes with initial loading state for images
      const scenesWithLoadingState = fixedScenes.map(s => ({
        ...s,
        isGeneratingImage: true // Set flag to true immediately
      }));

      const masterSeed = Math.floor(Math.random() * 2147483647);
      const contentWithLoading = { ...result, scenes: scenesWithLoadingState, seed: masterSeed };
      setFullContent(contentWithLoading);
      setStep(AppStep.RESULT);
      setLoading(false); // Stop main loading, switch to image loading

      // 3. Trigger Parallel Image Generation (Nano Banana / Flash Image)
      // Pass the consistentSubject to the generation trigger
      scenesWithLoadingState.forEach(scene => {
         triggerImageGeneration(scene.id, scene.imagePrompt, currentStylePrompt, result.consistentSubject, aspectRatio, masterSeed);
      });

    } catch (error) {
      console.error(error);
      alert("Error generating content details.");
      setLoading(false);
    }
  };

  const triggerImageGeneration = async (sceneId: number, sceneActionPrompt: string, style: string, consistentSubject: string, ratio: AspectRatio, seed?: number) => {
    try {
      // Combine: Subject Description + Scene Action
      const finalPrompt = `${consistentSubject}. ${sceneActionPrompt}`;
      const url = await generateSceneImage(finalPrompt, style, ratio, seed);
      
      setFullContent(prev => {
        if (!prev) return null;
        return {
          ...prev,
          scenes: prev.scenes.map(s => 
            s.id === sceneId 
              ? { ...s, generatedImageUrl: url, isGeneratingImage: false } 
              : s
          )
        };
      });
    } catch (error) {
      console.error(`Failed to generate image for scene ${sceneId}`, error);
      // Turn off loading state even on error so user can retry
      setFullContent(prev => {
        if (!prev) return null;
        return {
          ...prev,
          scenes: prev.scenes.map(s => 
            s.id === sceneId 
              ? { ...s, isGeneratingImage: false } 
              : s
          )
        };
      });
    }
  };

  const handleRegenerateAllImages = () => {
    if (!fullContent) return;

    // Generate new seed for the whole batch to keep them consistent with each other
    const newSeed = Math.floor(Math.random() * 2147483647);

    // Set all scenes to loading
    setFullContent(prev => {
      if (!prev) return null;
      return {
        ...prev,
        seed: newSeed,
        scenes: prev.scenes.map(s => ({ ...s, isGeneratingImage: true }))
      };
    });

    // Retrigger generation with CURRENT style and ratio
    fullContent.scenes.forEach(scene => {
      triggerImageGeneration(
        scene.id, 
        scene.imagePrompt, 
        currentStylePrompt, 
        fullContent.consistentSubject, 
        aspectRatio,
        newSeed
      );
    });
  };

  const handleManualUpdateSceneImage = (sceneId: number, url: string) => {
    if (!fullContent) return;
    const updatedScenes = fullContent.scenes.map(s => 
      s.id === sceneId ? { ...s, generatedImageUrl: url, isGeneratingImage: false } : s
    );
    setFullContent({ ...fullContent, scenes: updatedScenes });
  };

  const handleCreateVideo = (imageUrl: string, prompt: string) => {
      try {
          const detail = { imageUrl, prompt } as any;
          window.dispatchEvent(new CustomEvent('create-veo-video', { detail }));
      } catch {}
  };

  const handleDownloadAllImages = async () => {
      if (!fullContent) return;
      for (const scene of fullContent.scenes) {
          if (scene.generatedImageUrl) {
              const link = document.createElement('a');
              link.href = scene.generatedImageUrl;
              link.download = `konten-cerita-scene-${scene.id}.png`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              await new Promise(r => setTimeout(r, 500));
          }
      }
  };

  const handleDownloadAllVideos = () => {
      if (!fullContent) return;
      const readyUrls = fullContent.scenes
          .map(s => (s.generatedImageUrl ? inlineMap[s.generatedImageUrl]?.videoUrl : undefined))
          .filter(Boolean) as string[];
      
      if (readyUrls.length === 0) { alert('Belum ada video selesai untuk diunduh.'); return; }
      
      const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
      readyUrls.forEach((url, idx) => {
          const filename = `konten-cerita-video-${idx + 1}.mp4`;
          const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
          setTimeout(() => {
              const a = document.createElement('a');
              a.style.display = 'none';
              a.href = proxied;
              a.download = filename;
              a.target = '_self';
              document.body.appendChild(a);
              a.click();
              setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
          }, idx * 300);
      });
  };

  const handleMergeAllVideos = () => {
      if (!fullContent) return;
      const readyUrls = fullContent.scenes
          .map(s => (s.generatedImageUrl ? inlineMap[s.generatedImageUrl]?.videoUrl : undefined))
          .filter(Boolean) as string[];
      
      if (readyUrls.length === 0) { alert('Belum ada video selesai.'); return; }
      
      const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
      const urls = readyUrls.map((u, i) => `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`konten-cerita-${String(i + 1).padStart(2, '0')}.mp4`)}`);
      
      try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
      try { window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls } })); } catch {}
  };

  // --- Render Steps ---

  // 1. Input Screen
  const renderInput = () => (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 animate-in fade-in duration-700">
      <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-orange-500/20">
        <Lightbulb size={32} className="text-white" />
      </div>
      <h1 className="text-4xl md:text-6xl font-bold text-center mb-4 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-500">
        Buat Cerita
      </h1>
      <p className="text-slate-500 text-center mb-6 text-lg max-w-lg">
        Visual trivia & knowledge shorts.
      </p>

      {/* Language Selector */}
      <div className="mb-6 w-full max-w-xs relative">
         <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">Bahasa Narasi</label>
         <div className="relative">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full appearance-none bg-white border border-slate-200 text-slate-700 py-3 px-4 pr-8 rounded-xl leading-tight focus:outline-none focus:bg-white focus:border-orange-500 text-sm font-medium shadow-sm cursor-pointer hover:border-orange-300 transition-colors"
            >
              {LANGUAGES.map(lang => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
         </div>
      </div>

      {/* Settings Row: Audience & Ratio */}
      <div className="flex flex-wrap items-center justify-center gap-4 mb-8 w-full max-w-3xl">
        
        {/* Audience Toggle */}
        <div className="flex p-1 bg-slate-100 rounded-full border border-slate-200">
          <button
            onClick={() => setTargetAudience('KIDS')}
            className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
              targetAudience === 'KIDS' 
              ? 'bg-gradient-to-r from-orange-400 to-orange-600 text-white shadow-lg' 
              : 'text-slate-500 hover:text-orange-600'
            }`}
          >
            <Baby size={16} /> Mode Anak
          </button>
          <button
            onClick={() => setTargetAudience('ADULT')}
            className={`px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${
              targetAudience === 'ADULT' 
              ? 'bg-gradient-to-r from-slate-700 to-slate-900 text-white shadow-lg' 
              : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users size={16} /> Mode Umum
          </button>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="flex p-1 bg-slate-100 rounded-lg border border-slate-200">
          {[
            { id: '9:16', label: 'Shorts', icon: RectangleVertical },
            { id: '16:9', label: 'Wide', icon: RectangleHorizontal },
            { id: '1:1', label: 'Square', icon: Square }
          ].map((ratio) => (
             <button
              key={ratio.id}
              onClick={() => setAspectRatio(ratio.id as AspectRatio)}
              title={ratio.label}
              className={`p-2 rounded-md transition-all ${
                aspectRatio === ratio.id 
                ? 'bg-white text-orange-600 shadow border border-slate-200' 
                : 'text-slate-400 hover:text-orange-600 hover:bg-slate-50'
              }`}
            >
              <ratio.icon size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-lg relative mb-8">
        <input 
          type="text" 
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={targetAudience === 'KIDS' ? "Topik: Dinosaurus, Tata Surya, Kucing..." : "Topik: Mekanika Kuantum, Sejarah Kopi..."}
          className="w-full bg-white border border-slate-200 text-slate-900 px-6 py-4 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:outline-none text-lg placeholder:text-slate-400 shadow-xl shadow-slate-200/50"
          onKeyDown={(e) => e.key === 'Enter' && handleGenerateConcepts()}
        />
        <div className="absolute right-2 top-2 bottom-2">
          <Button 
            onClick={handleGenerateConcepts} 
            isLoading={loading}
            disabled={!topic}
            className="h-full rounded-xl bg-orange-600 hover:bg-orange-500 text-white border-none"
          >
            {loading ? 'Riset...' : <ArrowRight />}
          </Button>
        </div>
      </div>

      {/* Options Selection at Input Step */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-5 duration-700 delay-100">
        
        {/* Style Selector */}
        <Card className="bg-slate-900/40 backdrop-blur-sm border-slate-800">
           <div className="flex items-center gap-2 mb-3 text-green-400">
             <Sparkles size={18} />
             <h3 className="font-bold text-sm uppercase tracking-wider">
               Gaya Visual ({targetAudience === 'KIDS' ? 'Ceria & Lucu' : 'Realistis & Detail'})
             </h3>
           </div>
           <div className="space-y-2">
             <select
               value={selectedStyleId}
               onChange={(e) => setSelectedStyleId(e.target.value)}
               className="w-full bg-slate-800/70 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
             >
               {availableStyles.map(style => (
                 <option key={style.id} value={style.id}>{style.name}</option>
               ))}
             </select>
             <div className="text-[10px] text-slate-500">
               {VISUAL_STYLES.find(s => s.id === selectedStyleId)?.description}
             </div>
           </div>
        </Card>

        {/* Narrator Selector */}
        <Card className="bg-slate-900/40 backdrop-blur-sm border-slate-800">
            <div className="flex items-center gap-2 mb-3 text-cyan-400">
              <MessageSquare size={18} />
              <h3 className="font-bold text-sm uppercase tracking-wider">Pilih Intonasi</h3>
            </div>
            <div className="space-y-2">
              <select
                value={selectedNarratorId}
                onChange={(e) => setSelectedNarratorId(e.target.value)}
                className="w-full bg-slate-800/70 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {NARRATORS.map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
              <div className="text-[10px] text-slate-500">
                {NARRATORS.find(n => n.id === selectedNarratorId)?.desc}
              </div>
            </div>
        </Card>

      </div>
    </div>
  );

  // 2. Selection Screen
  const renderSelection = () => (
    <div className="max-w-4xl mx-auto py-10 px-4 animate-in slide-in-from-bottom-10 duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={() => setStep(AppStep.INPUT)} className="text-slate-500 hover:text-orange-600 flex items-center gap-2 text-sm mb-2">
            <ChevronLeft size={16} /> Kembali
          </button>
          <h2 className="text-2xl font-bold text-slate-900">Pilih Konsep Cerita ({targetAudience === 'KIDS' ? 'Anak' : 'Dewasa'})</h2>
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerateConcepts} isLoading={loading}>
          <RefreshCw size={14} className="mr-2" /> Cari Ide Lain
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {concepts.map((concept, idx) => (
          <Card key={idx} className="flex flex-col h-full hover:-translate-y-1 transition-transform">
            <div className="flex justify-between items-start mb-4">
              <span className={`
                text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded
                ${concept.tone === ContentTone.MIND_BLOWING ? 'bg-purple-100 text-purple-700' : 
                  concept.tone === ContentTone.FUN ? 'bg-yellow-100 text-yellow-700' :
                  concept.tone === ContentTone.HISTORICAL ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'}
              `}>
                {concept.tone}
              </span>
            </div>
            
            <h3 className="text-lg font-bold mb-3 leading-snug text-slate-900">{concept.title}</h3>
            
            <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-bold block mb-1">HOOK (0-8S)</span>
              <p className="text-sm italic text-slate-700">"{concept.hook}"</p>
            </div>

            <p className="text-sm text-slate-500 mb-6 flex-grow">{concept.summary}</p>

            <Button 
              className="w-full mt-auto group" 
              onClick={() => handleSelectConcept(concept)}
              isLoading={loading && selectedConcept === concept}
              disabled={loading}
            >
              Buat Konten Ini <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );

  // 3. Result Screen (Script + Storyboard)
  const renderResult = () => {
    if (!fullContent) return null;

    return (
      <div className="max-w-6xl mx-auto py-8 px-4 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
             <button onClick={() => setStep(AppStep.SELECTION)} className="text-slate-500 hover:text-orange-600 flex items-center gap-2 text-sm mb-2">
              <ChevronLeft size={16} /> Pilih Angle Lain
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{fullContent.socialPack.youtubeTitle}</h1>
            <p className="text-slate-500 text-sm mt-1">Topik: {topic} • {aspectRatio}</p>
          </div>
          <Button variant="outline" onClick={() => handleSelectConcept(selectedConcept!)}>
            <RefreshCw size={14} className="mr-2" /> Ulangi
          </Button>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          
          {/* LEFT COLUMN: Controls & Social */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Style Selector (Read Only / Quick Switch) */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-orange-600">
                  <Sparkles size={18} />
                  <h3 className="font-bold">Gaya Visual</h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedStyleId}
                  onChange={(e) => setSelectedStyleId(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 text-slate-900 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {availableStyles.map(style => (
                    <option key={style.id} value={style.id}>{style.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleRegenerateAllImages}
                  title="Terapkan gaya & buat ulang semua gambar"
                  className="w-8 h-8 flex items-center justify-center rounded-md bg-orange-600 hover:bg-orange-500 text-white"
                >
                  <RefreshCw size={12} className={fullContent.scenes.some(s => s.isGeneratingImage) ? "animate-spin" : ""} />
                </button>
              </div>
            </Card>

            {/* Narrator Selection */}
            <Card className="p-0 overflow-hidden">
               <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                 <MessageSquare size={16} className="text-orange-600" />
                 <h3 className="font-semibold text-sm text-slate-900">Intonasi Terpilih</h3>
               </div>
               <div className="p-4">
                 <select
                   value={selectedNarratorId}
                   onChange={(e) => setSelectedNarratorId(e.target.value)}
                   className="w-full bg-white border border-slate-200 text-slate-900 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                 >
                   {NARRATORS.map(n => (
                     <option key={n.id} value={n.id}>{n.name}</option>
                   ))}
                 </select>
                 <div className="text-xs text-orange-600 font-mono mt-2 opacity-75 truncate">
                   {NARRATORS.find(n => n.id === selectedNarratorId)?.intonationTag}
                 </div>
               </div>
            </Card>

            {/* Social Pack */}
            <Card>
              <div className="flex items-center gap-2 mb-4 text-orange-600">
                <Share2 size={18} />
                <h3 className="font-bold">Paket Media Sosial</h3>
              </div>
              
              <div className="space-y-4">
                <div className="bg-slate-50 rounded p-3 border border-slate-200">
                  <div className="flex items-center gap-2 text-red-500 text-xs font-bold mb-2 uppercase">
                    <Youtube size={12} /> Youtube Shorts
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-2">{fullContent.socialPack.youtubeTitle}</p>
                  <Button size="sm" variant="outline" onClick={handleCopyTitle} className="w-full text-xs h-8 border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all duration-200">
                    {copiedTitle ? <span className="text-green-600 font-bold flex items-center justify-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full"></div>Tercopy!</span> : <><Copy size={12} className="mr-2"/> Copy Judul</>}
                  </Button>
                </div>

                <div className="bg-slate-50 rounded p-3 border border-slate-200">
                  <div className="flex items-center gap-2 text-pink-500 text-xs font-bold mb-2 uppercase">
                    <Instagram size={12} /> Reels & Tiktok
                  </div>
                  <p className="text-xs text-slate-600 mb-3 line-clamp-4">
                    {fullContent.socialPack.instagramCaption}
                    <br/><br/>
                    {fullContent.socialPack.hashtags.map(h => `#${h}`).join(' ')}
                  </p>
                   <Button size="sm" variant="outline" onClick={handleCopyCaption} className="w-full text-xs h-8 border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all duration-200">
                    {copiedCaption ? <span className="text-green-600 font-bold flex items-center justify-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full"></div>Tercopy!</span> : <><Copy size={12} className="mr-2"/> Copy Caption</>}
                  </Button>
                </div>
              </div>
            </Card>

          </div>

          {/* RIGHT COLUMN: Storyboard */}
          <div className="lg:col-span-3">
            <div className="flex flex-col gap-4 mb-4">
               {/* Header Row */}
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <Clapperboard className="text-orange-600" />
                   <div>
                     <h2 className="text-xl font-bold text-slate-900">Visual Storyboard (Fakta)</h2>
                     <p className="text-xs text-slate-500">{fullContent.scenes.length} Scenes • {VISUAL_STYLES.find(s=>s.id === selectedStyleId)?.name}</p>
                   </div>
                 </div>
                 <div className="flex gap-2">
                   <span className="text-[10px] bg-white px-2 py-1 rounded text-slate-500 border border-slate-200 flex items-center gap-1 shadow-sm">
                     <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                      Auto-Generate Active
                   </span>
                 </div>
               </div>

               {/* Bulk Actions Row */}
               <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <button onClick={handleRegenerateAllImages} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-orange-600 text-xs font-bold transition-colors shadow-sm">
                        <RefreshCw size={14} className={fullContent.scenes.some(s => s.isGeneratingImage) ? "animate-spin" : ""} />
                        Regenerate Images
                    </button>
                    
                    <div className="w-px h-6 bg-slate-300 mx-1"></div>

                    <button onClick={handleDownloadAllImages} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 text-xs font-bold transition-colors shadow-sm">
                        <Download size={14} />
                        Download Gambar
                    </button>

                    <button onClick={handleDownloadAllVideos} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-xs font-bold transition-colors shadow-sm">
                        <Download size={14} />
                        Download Video
                    </button>

                    <button onClick={handleMergeAllVideos} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 text-xs font-bold transition-colors shadow-sm ml-auto">
                        <MonitorPlay size={14} />
                        Gabungkan Video
                    </button>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fullContent.scenes.map((scene) => (
                <div key={scene.id} className="h-full">
                  <StoryboardCard 
                    scene={scene} 
                    visualStylePrompt={currentStylePrompt}
                    intonationTag={currentIntonationTag}
                    aspectRatio={aspectRatio}
                    consistentSubject={fullContent.consistentSubject}
                    onImageGenerated={handleManualUpdateSceneImage}
                    videoState={scene.generatedImageUrl ? inlineMap[scene.generatedImageUrl] : undefined}
                    isPlaying={scene.generatedImageUrl ? playingMap[scene.generatedImageUrl] : false}
                    onPlay={() => scene.generatedImageUrl && setPlayingMap(prev => ({ ...prev, [scene.generatedImageUrl!]: !prev[scene.generatedImageUrl!] }))}
                    onCreateVideo={(customPrompt) => {
                        if (scene.generatedImageUrl) {
                            const veoPrompt = customPrompt || `[VOICEOVER ONLY - NO LIP SYNC - NO DIALOGUE] ${currentIntonationTag} ${scene.narration}`;
                            handleCreateVideo(scene.generatedImageUrl, veoPrompt);
                        }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-orange-500/30">

      {/* Main Content */}
      <main>
        {step === AppStep.INPUT && renderInput()}
        {step === AppStep.SELECTION && renderSelection()}
        {step === AppStep.RESULT && renderResult()}
      </main>
    </div>
  );
};

export default App;
