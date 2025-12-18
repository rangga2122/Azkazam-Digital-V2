
import React, { useState } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { StyleSelector } from './components/StyleSelector';
import { ResultGrid } from './components/ResultGrid';
import { analyzeAndScriptScenes, generateSceneImage } from './services/geminiService';
import { AppState, FileData, SceneScript, SceneStyle, AspectRatio, SceneCount, VoiceGender, Language } from './types';

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<SceneStyle>(SceneStyle.MINIMALIST);
  const [customBackground, setCustomBackground] = useState<FileData | null>(null);
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>("9:16");
  const [sceneCount, setSceneCount] = useState<SceneCount>(4);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('Wanita');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('Indonesia');
  const [scenes, setScenes] = useState<SceneScript[]>([]);
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [productDescription, setProductDescription] = useState<string>('');

  const handleGenerate = async () => {
    if (!selectedFile) return;
    if (selectedStyle === SceneStyle.CUSTOM && !customBackground) {
        alert("Silakan unggah gambar background terlebih dahulu.");
        return;
    }

    if (!productDescription.trim()) {
      alert('Mohon isi deskripsi produk terlebih dahulu.');
      return;
    }

    setAppState(AppState.ANALYZING);
    setProgressMessage("Menulis naskah...");
    setScenes([]);

    try {
      // Step 1: Analyze and create script
      const generatedScripts = await analyzeAndScriptScenes(
        productDescription,
        selectedStyle,
        sceneCount,
        voiceGender,
        selectedLanguage
      );

      setScenes(generatedScripts);
      setAppState(AppState.GENERATING_IMAGES);

      const updatedScenes = [...generatedScripts];
      const PARALLEL = 4;
      for (let i = 0; i < updatedScenes.length; i += PARALLEL) {
        const batchSize = Math.min(PARALLEL, updatedScenes.length - i);
        const currentBatch = Math.floor(i / PARALLEL) + 1;
        const totalBatches = Math.ceil(updatedScenes.length / PARALLEL);
        setProgressMessage(`Merender ${batchSize} adegan sekaligus (${currentBatch}/${totalBatches})...`);

        const bgBase64 = selectedStyle === SceneStyle.CUSTOM ? customBackground?.base64 : undefined;
        const bgMime = selectedStyle === SceneStyle.CUSTOM ? customBackground?.mimeType : undefined;

        const promises: Promise<string>[] = [];
        for (let j = 0; j < batchSize; j++) {
          const idx = i + j;
          promises.push(
            generateSceneImage(
              selectedFile.base64,
              selectedFile.mimeType,
              updatedScenes[idx].visualPrompt,
              selectedStyle,
              selectedRatio,
              bgBase64,
              bgMime
            )
          );
        }

        const results = await Promise.allSettled(promises);
        for (let j = 0; j < batchSize; j++) {
          const idx = i + j;
          const res = results[j];
          if (res.status === 'fulfilled') {
            updatedScenes[idx] = { ...updatedScenes[idx], generatedImage: res.value };
          }
          setScenes([...updatedScenes]);
        }
      }

      setAppState(AppState.COMPLETE);
      setProgressMessage("");

    } catch (error) {
      console.error("Generation failed", error);
      setAppState(AppState.ERROR);
      setProgressMessage("Terjadi kesalahan. Silakan coba lagi.");
    }
  };

  const handleRegenerateImage = async (sceneId: number) => {
    if (!selectedFile) return;

    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) return;

    // Set specific scene to regenerating state
    const updatedScenes = [...scenes];
    updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], isRegenerating: true };
    setScenes(updatedScenes);

    try {
        const bgBase64 = selectedStyle === SceneStyle.CUSTOM ? customBackground?.base64 : undefined;
        const bgMime = selectedStyle === SceneStyle.CUSTOM ? customBackground?.mimeType : undefined;

        // Regenerate using the same visual prompt
        const newImage = await generateSceneImage(
            selectedFile.base64,
            selectedFile.mimeType,
            updatedScenes[sceneIndex].visualPrompt,
            selectedStyle,
            selectedRatio,
            bgBase64,
            bgMime
        );

        updatedScenes[sceneIndex] = { 
            ...updatedScenes[sceneIndex], 
            generatedImage: newImage,
            isRegenerating: false 
        };
        setScenes([...updatedScenes]);
    } catch (error) {
        console.error("Failed to regenerate image", error);
        updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], isRegenerating: false };
        setScenes([...updatedScenes]);
        alert("Gagal membuat ulang gambar. Silakan coba lagi.");
    }
  };

  const handleUpdateNarrative = (sceneId: number, newText: string) => {
    setScenes(prevScenes => prevScenes.map(scene => 
      scene.id === sceneId ? { ...scene, narrativePrompt: newText } : scene
    ));
  };

  const handleCreateVideo = (sceneId: number, imageBase64: string, narrative: string, title: string) => {
    // Trigger event to navigate to video generation with this scene data
    const event = new CustomEvent('create-ugc-video', {
      detail: {
        imageBase64,
        narrative,
        sceneId,
        title
      }
    });
    window.dispatchEvent(event);
  };

  const isProcessing = appState === AppState.ANALYZING || appState === AppState.GENERATING_IMAGES;

  return (
    <div className="flex h-screen w-full bg-gray-50 font-sans overflow-hidden text-gray-900 selection:bg-orange-200 selection:text-orange-900">
      
      {/* Sidebar Control Panel */}
      <aside className="w-full md:w-[450px] bg-white border-r border-gray-200 h-full flex flex-col shrink-0 shadow-xl z-20">
         <div className="p-6 border-b border-gray-100 flex-shrink-0 bg-white/50 backdrop-blur z-10">
            <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                    </svg>
                 </div>
                 <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none">Studio Model <br/><span className="text-orange-600">Tangan UGC</span></h1>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
               <ImageUpload 
                 onFileSelect={setSelectedFile} 
                 selectedFile={selectedFile} 
               />
               
               <StyleSelector 
                 selectedStyle={selectedStyle} 
                 onSelectStyle={setSelectedStyle} 
                 selectedRatio={selectedRatio}
                 onSelectRatio={setSelectedRatio}
                 selectedSceneCount={sceneCount}
                 onSelectSceneCount={setSceneCount}
                 selectedVoice={voiceGender}
                 onSelectVoice={setVoiceGender}
                 selectedLanguage={selectedLanguage}
                 onSelectLanguage={setSelectedLanguage}
                 customBackground={customBackground}
                 onSelectCustomBackground={setCustomBackground}
                 productDescription={productDescription}
                 onUpdateProductDescription={setProductDescription}
               />
         </div>

         <div className="p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
             <button
                   onClick={handleGenerate}
                   disabled={!selectedFile || isProcessing}
                   className={`
                     w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2
                     ${!selectedFile || isProcessing 
                       ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                       : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-orange-500/25 hover:scale-[1.02] active:scale-[0.98]'
                     }
                   `}
                 >
                   {isProcessing ? (
                     <>
                       <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                       </svg>
                       Memproses...
                     </>
                   ) : (
                     <>
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 19.75l-6.513-6.512 5.693-5.516.896 3.842 3.842.896 5.516-5.693 6.513 6.513-3.846.9m-3.846 9V9" />
                        </svg>
                       Buat Aset UGC
                     </>
                   )}
             </button>
             {isProcessing && (
                <p className="text-center text-xs text-orange-600 mt-3 animate-pulse font-medium">{progressMessage}</p>
             )}
             {appState === AppState.ERROR && (
                <p className="text-center text-xs text-red-500 mt-3 font-medium">{progressMessage}</p>
             )}
         </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-gray-50 h-full overflow-y-auto custom-scrollbar relative">
         <div className="w-full max-w-5xl mx-auto px-6 py-8">
             {appState === AppState.IDLE && (
                <div className="h-[80vh] flex flex-col items-center justify-center text-center opacity-60">
                    <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mb-6 animate-pulse">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 text-gray-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">Area Preview Hasil</h3>
                    <p className="text-gray-500 max-w-md">Hasil generasi gambar dan naskah storyboard akan muncul di sini. Silakan mulai dari panel kontrol di sebelah kiri.</p>
                </div>
             )}

             {(appState === AppState.ANALYZING || appState === AppState.GENERATING_IMAGES || appState === AppState.COMPLETE) && (
               <ResultGrid 
                 scenes={scenes} 
                 onRegenerateImage={handleRegenerateImage} 
                 onUpdateNarrative={handleUpdateNarrative}
                 onCreateVideo={handleCreateVideo}
               />
             )}
         </div>
      </main>

    </div>
  );
}
