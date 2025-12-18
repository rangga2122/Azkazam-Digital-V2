import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Storyboard, GenerationState, Scene } from './types';
import { describeCharacter, generateStoryboardText, generateSceneImage } from './services/geminiService';

// Icons
const FilmIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-red-600">
    <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h15a3 3 0 003-3v-9a3 3 0 00-3-3h-15zM6 7.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm0 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm12-6a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm0 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
  </svg>
);
const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);
const CopyIcon = ({ copied }: { copied: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        {copied ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5-.124m7.5 10.375a3 3 0 01-3-3V8.625a3 3 0 013-3h3.375c.621 0 1.125.504 1.125 1.125V11.25a4.5 4.5 0 00-4.5 4.5v.75A3.375 3.375 0 0116.5 15h-1.875a.375.375 0 01-.375-.375V12.375m0-1.5V10.5a.375.375 0 00-.375-.375H13.5m0-1.5h.375c.621 0 1.125.504 1.125 1.125v1.5m0 0V11.25m0 0H12m5.25 5.25H12m0 0V12.375" />
        )}
    </svg>
);
const ImageIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-zinc-600">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
);
const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const SceneCard: React.FC<{ scene: Scene; onImageClick: (url: string) => void }> = ({ scene, onImageClick }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(scene.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 backdrop-blur-sm animate-fade-in-up">
            <div className="aspect-video bg-zinc-950/50 border-b border-zinc-800/50 flex items-center justify-center relative group">
                 {scene.image_generation_status === 'complete' && scene.image_url ? (
                    <>
                        <img 
                            src={scene.image_url} 
                            alt={`Visual for scene ${scene.scene_number}`} 
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => onImageClick(scene.image_url!)}
                        />
                         <a
                            href={scene.image_url}
                            download={`scene_${scene.scene_number}.png`}
                            className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-zinc-300 hover:bg-black hover:text-white transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                            aria-label="Unduh gambar"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <DownloadIcon />
                        </a>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-zinc-500 animate-pulse">
                        <ImageIcon />
                        <span className="text-xs">
                            {scene.image_generation_status === 'generating' ? 'Menghasilkan visual...' : 'Menunggu...'}
                        </span>
                    </div>
                )}
            </div>
            <div className="p-6 space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-widest text-red-500">
                    Adegan {scene.scene_number} <span className="text-zinc-500 font-medium normal-case">/ {scene.duration}</span>
                </h4>
                <div className="space-y-4">
                    <div>
                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Narasi</p>
                        <p className="text-zinc-300 italic">"{scene.narration}"</p>
                    </div>
                    {scene.dialogue_text && (
                        <div>
                            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Dialog</p>
                            <p className="font-mono text-sm text-white bg-zinc-900/80 p-3 rounded-lg">{scene.dialogue_text}</p>
                        </div>
                    )}
                     <div>
                        <div className="flex justify-between items-center mb-1">
                             <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Skrip Prompt Veo</p>
                             <button onClick={handleCopy} className="text-xs flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors">
                                <CopyIcon copied={copied}/>
                                {copied ? 'Disalin!' : 'Salin'}
                             </button>
                        </div>
                        <p className="font-mono text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 p-3 rounded-lg whitespace-pre-wrap break-words">{scene.prompt}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};


function App() {
  const [theme, setTheme] = useState('');
  const [charImage, setCharImage] = useState<File | null>(null);
  const [charPreview, setCharPreview] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [genState, setGenState] = useState<GenerationState>({ status: 'idle' });
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [modalImage, setModalImage] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCharImage(file);
      setCharPreview(URL.createObjectURL(file));
    }
  };
  
  const updateSceneState = (sceneNumber: number, updates: Partial<Scene>) => {
    setStoryboard(prev => {
        if (!prev) return null;
        const newScenes = prev.scenes.map(s => s.scene_number === sceneNumber ? { ...s, ...updates } : s);
        return { ...prev, scenes: newScenes };
    });
  };

  const generateStory = useCallback(async () => {
    if (!theme) return;

    setGenState({ status: 'analyzing_character', message: 'Memulai mesin kreatif...' });
    setStoryboard(null);
    let generatedStory: Storyboard | null = null;
    let charDesc = '';

    try {
      if (charImage) {
        setGenState({ status: 'analyzing_character', message: 'Menganalisis referensi karakter...' });
        charDesc = await describeCharacter(charImage);
      }

      setGenState({ status: 'generating_story', message: 'Menulis skenario dan adegan...' });
      generatedStory = await generateStoryboardText(theme, charDesc);
      
      setStoryboard(generatedStory);
      setGenState({ status: 'generating_images', message: 'Menghasilkan visual adegan...' });

      // Sequentially generate images
      for (const scene of generatedStory.scenes) {
          try {
              updateSceneState(scene.scene_number, { image_generation_status: 'generating' });
              
              // Analyze dialogue to determine the number of characters in the scene
              const speakerMatches = scene.dialogue_text.match(/([A-Z_0-9]+):/g);
              const uniqueSpeakers = speakerMatches ? new Set(speakerMatches) : new Set();
              const speakerCount = uniqueSpeakers.size;

              let imageGenPrompt = scene.visual_description;

              // Add instruction for character count if there's dialogue
              if (speakerCount > 1) {
                  imageGenPrompt = `The scene must feature ${speakerCount} distinct characters interacting, as suggested by the dialogue. ${imageGenPrompt}`;
              } else if (speakerCount === 1 && !charImage) {
                  // Only add this if no main character is defined, to ensure a person is present for the single line of dialogue.
                  imageGenPrompt = `The scene must feature one character. ${imageGenPrompt}`;
              }

              // Add character description with the highest priority to ensure visual consistency.
              if (charDesc) {
                  imageGenPrompt = `HIGHEST PRIORITY: The main character's appearance must be an EXACT visual match to this description: "${charDesc}". Do not change the character's face, hair, or clothing. SCENE: ${imageGenPrompt}`;
              }
              
              const imageBase64 = await generateSceneImage(imageGenPrompt, aspectRatio);
              updateSceneState(scene.scene_number, { 
                  image_generation_status: 'complete',
                  image_url: `data:image/png;base64,${imageBase64}`
              });
          } catch (imgError) {
              console.error(`Failed to generate image for scene ${scene.scene_number}`, imgError);
              updateSceneState(scene.scene_number, { image_generation_status: 'error' });
          }
      }

      setGenState({ status: 'complete' });

    } catch (error: any) {
       setGenState({ status: 'error', message: error.message || 'Terjadi kesalahan selama pembuatan.' });
    }
  }, [theme, charImage, aspectRatio]);

  const isBusy = genState.status === 'analyzing_character' || genState.status === 'generating_story' || genState.status === 'generating_images';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col font-sans selection:bg-red-900 selection:text-white">
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50 supports-[backdrop-filter]:bg-zinc-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <FilmIcon />
             <h1 className="text-xl font-extrabold tracking-tight text-white">CineGen AI</h1>
          </div>
          {genState.status === 'complete' && (
             <button
               onClick={() => {
                   setStoryboard(null);
                   setGenState({status: 'idle'});
                   setTheme('');
                   setCharImage(null);
                   setCharPreview(null);
                   window.scrollTo(0, 0);
               }}
               className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 hover:text-white transition-all rounded-full border border-zinc-700"
             >
               Proyek Baru
             </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {!storyboard && (
          <div className="max-w-3xl mx-auto space-y-10 animate-fade-in">
            <div className="text-center space-y-6">
              <h2 className="text-5xl font-extrabold text-white tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500">
                Sutradarai Skrip AI Anda untuk Veo
              </h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto leading-relaxed">
                Hasilkan papan cerita 1 menit dengan visual & skrip. Setiap adegan dilengkapi dengan skrip prompt yang siap digunakan untuk generator video seperti Veo.
              </p>
            </div>
            
            <div className="bg-zinc-900/50 p-8 rounded-3xl border border-zinc-800/50 space-y-8 shadow-2xl shadow-black/50 backdrop-blur-sm">
                <div className="space-y-3">
                    <label htmlFor="theme" className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                    Premis Film
                    </label>
                    <textarea
                    id="theme"
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-white placeholder-zinc-600 focus:ring-2 focus:ring-red-600/50 focus:border-red-600 outline-none transition-all resize-none text-lg"
                    placeholder="cth., Seorang penjelajah waktu terjebak di masa lalu, mencoba memperbaiki sejarah tanpa menghapus keberadaannya sendiri..."
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    disabled={isBusy}
                    />
                </div>
                <div className="space-y-3">
                    <label className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                    Pemeran Utama (Referensi Opsional)
                    </label>
                    <div className="flex items-start gap-6">
                        <label className={`flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-2xl border-2 border-dashed border-zinc-700 cursor-pointer hover:border-zinc-500 hover:bg-zinc-800/30 transition-all group ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <div className="p-4 bg-zinc-800 rounded-full group-hover:bg-zinc-700 transition-colors">
                                <UploadIcon />
                            </div>
                            <div className="text-center">
                                <span className="text-base font-medium text-zinc-300 group-hover:text-white block">Klik untuk unggah foto</span>
                                <span className="text-xs text-zinc-500 block mt-1">PNG, JPG hingga 5MB</span>
                            </div>
                            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={isBusy} />
                        </label>
                        {charPreview && (
                            <div className="relative h-40 w-40 rounded-2xl overflow-hidden border-2 border-zinc-700 shadow-lg flex-shrink-0">
                                <img src={charPreview} alt="Pratinjau Karakter" className="h-full w-full object-cover" />
                                <button
                                    onClick={() => { setCharImage(null); setCharPreview(null); }}
                                    className="absolute top-2 right-2 bg-black/70 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-red-600 transition-all backdrop-blur-md"
                                    disabled={isBusy}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                 <div className="space-y-3">
                    <label className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                        Rasio Aspek Visual
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => setAspectRatio('16:9')}
                            className={`py-4 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${aspectRatio === '16:9' ? 'bg-red-600 text-white ring-2 ring-red-500' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}
                            disabled={isBusy}
                        >
                            16:9 Landscape
                        </button>
                        <button 
                            onClick={() => setAspectRatio('9:16')}
                            className={`py-4 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${aspectRatio === '9:16' ? 'bg-red-600 text-white ring-2 ring-red-500' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}
                            disabled={isBusy}
                        >
                            9:16 Portrait
                        </button>
                    </div>
                </div>
                <button
                    onClick={generateStory}
                    disabled={!theme || isBusy}
                    className={`w-full py-5 rounded-2xl font-bold text-xl tracking-wider uppercase transition-all transform active:scale-[0.99] ${
                    !theme || isBusy
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 hover:shadow-red-700/40'
                    }`}
                >
                    {isBusy ? (genState.message || 'Membuat...') : 'Hasilkan Papan Cerita'}
                </button>
                {genState.status === 'error' && (
                    <div className="p-4 bg-red-950/50 border border-red-900/50 rounded-xl text-red-300 text-sm flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        {genState.message}
                    </div>
                )}
            </div>
          </div>
        )}
        
        {isBusy && !storyboard && genState.status !== 'error' && (
            <div className="max-w-xl mx-auto mt-20 text-center space-y-8 animate-fade-in">
                 <div className="inline-flex relative items-center justify-center">
                     <div className="w-32 h-32 rounded-full border-4 border-zinc-800"></div>
                     <div className="absolute w-32 h-32 rounded-full border-4 border-t-red-600 border-r-red-600 border-b-transparent border-l-transparent animate-spin"></div>
                     <FilmIcon />
                </div>
                <div className="space-y-4">
                    <h3 className="text-2xl font-bold text-white">{genState.message}</h3>
                </div>
            </div>
        )}

        {storyboard && (
          <div className="space-y-12">
            <div className="text-center space-y-4 animate-fade-in">
              <h2 className="text-4xl font-extrabold text-white tracking-tight">{storyboard.title}</h2>
              <p className="text-zinc-400 max-w-2xl mx-auto">{storyboard.logline}</p>
              {isBusy && genState.status === 'generating_images' && (
                  <div className="inline-flex items-center gap-2 text-sm text-zinc-400">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      {genState.message}
                  </div>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {storyboard.scenes.map((scene) => (
                <SceneCard key={scene.scene_number} scene={scene} onImageClick={setModalImage} />
              ))}
            </div>
          </div>
        )}

      </main>

       {modalImage && (
        <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-lg z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 animate-fade-in" 
            onClick={() => setModalImage(null)}
        >
            <img 
                src={modalImage} 
                alt="Tampilan adegan yang diperbesar" 
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl shadow-black/50" 
                onClick={(e) => e.stopPropagation()} 
            />
            <button 
                onClick={() => setModalImage(null)} 
                className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full hover:bg-black/80 transition-colors"
                aria-label="Tutup pratinjau"
            >
                <CloseIcon />
            </button>
        </div>
      )}
    </div>
  );
}

export default App;
