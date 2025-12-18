import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { AspectRatio, GenerationStatus } from '../types';
import { Storyboard, GenerationState, Scene } from '../cinegen-ai/types';
import { generateImage, generateImagePromptOnly, generateImageWithReference } from '../services/imageSandboxApi';
import { composeVideoWithOverlays } from '../Normal Edit/services/videoService';
import { XMarkIcon } from './icons';

const getLocalToken = (): string => {
  return (localStorage.getItem('VEO_BEARER_TOKEN') || '').trim();
};

const getCentralizedToken = async (): Promise<string> => {
  const local = getLocalToken();
  if (local) return local;
  try {
    const resp = await fetch(`/api/globalSettings?key=VEO_BEARER_TOKEN&t=${Date.now()}`);
    if (resp.ok) {
      const json = await resp.json();
      const token = (json?.value || '').trim();
      if (token) return token;
    }
  } catch {}
  return '';
};

// Ikon kecil yang diperlukan oleh UI
const callChutesJson = async (messages: any[]): Promise<any> => {
  const resp = await fetch('/api/chutesChat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V3.1',
      messages,
      stream: false,
      max_tokens: 4096,
      temperature: 0.7
    })
  });
  if (!resp.ok) {
    let m = `HTTP ${resp.status}`; try { m = (await resp.json())?.error?.message || m; } catch {}
    throw new Error(m);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || '';
  if (!text) throw new Error('Respons AI kosong');
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(cleaned);
};

const FilmIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-red-600">
    <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h15a3 3 0 003-3v-9a3 3 0 00-3-3h-15zM6 7.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm0 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm12-6a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm0 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
  </svg>
);
const UploadIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);
const CopyIcon: React.FC<{ copied: boolean }> = ({ copied }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    {copied ? (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5-.124m7.5 10.375a3 3 0 01-3-3V8.625a3 3 0 013-3h3.375c.621 0 1.125.504 1.125 1.125V11.25a4.5 4.5 0 00-4.5 4.5v.75A3.375 3.375 0 0116.5 15h-1.875a.375.375 0 01-.375-.375V12.375m0-1.5V10.5a.375.375 0 00-.375-.375H13.5m0-1.5h.375c.621 0 1.125.504 1.125 1.125v1.5m0 0V11.25m0 0H12m5.25 5.25H12m0 0V12.375" />
    )}
  </svg>
);
const ImageIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-zinc-600">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);
const DownloadIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);
const CloseIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

type InlineVideoEntry = { state: import('../types').GenerationState; aspect?: AspectRatio };
type InlineVideoMap = Record<string, InlineVideoEntry>;

const SceneCard: React.FC<{
  scene: Scene;
  onImageClick: (url: string) => void;
  inlineMap?: InlineVideoMap;
  onCreateVideo?: (url: string, promptOverride?: string) => void;
  onRegenerateImage?: (sceneNumber: number) => void;
  onUpdatePrompt?: (sceneNumber: number, newPrompt: string) => void;
}> = ({ scene, onImageClick, inlineMap, onCreateVideo, onRegenerateImage, onUpdatePrompt }) => {
  const [copied, setCopied] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState(scene.prompt || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(scene.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Inline video status untuk URL gambar adegan ini
  const inline = scene.image_url ? inlineMap?.[scene.image_url] : undefined;
  const st = inline?.state.status;
  const videoUrl = inline?.state.videoUrl;
  const isVideoReady = st === GenerationStatus.Completed && !!videoUrl;
  const isLoading = st === GenerationStatus.Uploading || st === GenerationStatus.Pending || st === GenerationStatus.Processing;
  const aspectCls = inline?.aspect === AspectRatio.Portrait
    ? 'aspect-[9/16]'
    : inline?.aspect === AspectRatio.Square
      ? 'aspect-square'
      : 'aspect-video';

  const handleStartVideo = () => {
    if (scene.image_url && onCreateVideo) {
      onCreateVideo(scene.image_url, (scene.prompt || '').trim());
    }
  };

  const handleRegenerate = () => {
    if (typeof onRegenerateImage === 'function') {
      onRegenerateImage(scene.scene_number);
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 backdrop-blur-sm animate-fade-in-up">
      <div className={`bg-zinc-950/50 border-b border-zinc-800/50 flex items-center justify-center relative group ${aspectCls}`}>
        {scene.image_generation_status === 'complete' && scene.image_url ? (
          <>
            {/* SUCCESS: tampilkan video jika tersedia */}
            {isVideoReady ? (
              <div className="absolute inset-0">
                <video
                  src={videoUrl as string}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-3 right-3 z-10">
                  <a
                    href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(videoUrl as string)}&filename=${encodeURIComponent('veo3-video.mp4')}`}
                    className="p-2 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors backdrop-blur-md border border-white/10"
                    aria-label="Unduh video"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DownloadIcon />
                  </a>
                </div>
              </div>
            ) : (
              <>
                {/* IDLE: tampilkan gambar jika belum membuat video */}
                {!inline || st === GenerationStatus.Idle || st === undefined ? (
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
                ) : null}

                {/* LOADING overlay */}
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="space-y-3 w-full max-w-xs text-center">
                      <div className="relative w-14 h-14 mx-auto">
                        <div className="absolute inset-0 rounded-full border-8 border-zinc-700/40"></div>
                        <div className="absolute inset-0 rounded-full border-t-8 border-red-600 animate-spin"></div>
                      </div>
                      <p className="text-xs font-medium text-zinc-200">{inline?.state.message || 'Membuat video...'}</p>
                      <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-red-600 rounded-full transition-all duration-700" style={{ width: `${Math.max(5, inline?.state.progress || 0)}%` }}></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ERROR overlay */}
                {st === GenerationStatus.Failed && (
                  <div className="absolute inset-0 flex items-center justify-center p-4 bg-red-950/50">
                    <div className="text-center space-y-2">
                      <p className="text-xs text-red-400 font-semibold">{inline?.state.error || 'Gagal membuat video.'}</p>
                      <button
                        type="button"
                        onClick={handleStartVideo}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700"
                      >
                        Coba Lagi
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
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
              <div className="flex items-center gap-2">
                <button onClick={() => setIsEditingPrompt(true)} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Edit</button>
                <button onClick={handleCopy} className="text-xs flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors">
                  <CopyIcon copied={copied} />
                  {copied ? 'Disalin!' : 'Salin'}
                </button>
              </div>
            </div>
            {!isEditingPrompt ? (
              <p className="font-mono text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 p-3 rounded-lg whitespace-pre-wrap break-words">{scene.prompt}</p>
            ) : (
              <div className="space-y-2">
                <textarea
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs"
                  rows={3}
                  value={promptDraft}
                  onChange={e => setPromptDraft(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsEditingPrompt(false); setPromptDraft(scene.prompt || ''); }}
                    className="text-xs px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  >Batal</button>
                  <button
                    type="button"
                    onClick={() => { setIsEditingPrompt(false); if (typeof onUpdatePrompt === 'function') onUpdatePrompt(scene.scene_number, promptDraft.trim()); }}
                    className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                  >Simpan</button>
                </div>
              </div>
            )}
            <div className="mt-3">
              <button
                type="button"
                disabled={!scene.image_url || isLoading}
                onClick={handleStartVideo}
                className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-zinc-700 text-zinc-300 cursor-not-allowed' : isVideoReady ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
              >
                {isVideoReady ? (isLoading ? 'Sedang Membuat…' : 'Generate Ulang') : (isLoading ? 'Sedang Membuat…' : 'Buat Video')}
              </button>
              <div className="mt-2">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleRegenerate}
                  className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-zinc-700 text-zinc-300 cursor-not-allowed' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                >
                  Regenerate Gambar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CinemaAIProps {
  inlineVideoMap?: InlineVideoMap;
  onCreateInlineVideo?: (url: string, promptOverride?: string) => void;
}

const CinemaAI: React.FC<CinemaAIProps> = ({ inlineVideoMap, onCreateInlineVideo }) => {
  const [theme, setTheme] = useState('');
  const [language, setLanguage] = useState<string>('Indonesia');
  const [charImage, setCharImage] = useState<File | null>(null);
  const [charPreview, setCharPreview] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [genState, setGenState] = useState<GenerationState>({ status: 'idle' });
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>(AspectRatio.Landscape);
  const [modalImage, setModalImage] = useState<string | null>(null);
  const abortControllers = useRef<AbortController[]>([]);
  const cancelRef = useRef<boolean>(false);
  useEffect(() => {
    if (modalImage) {
      try { window.dispatchEvent(new Event('global-modal-open')); } catch {}
    } else {
      try { window.dispatchEvent(new Event('global-modal-close')); } catch {}
    }
  }, [modalImage]);

  const isBusy = useMemo(() => genState.status === 'analyzing_character' || genState.status === 'generating_story' || genState.status === 'generating_images', [genState.status]);

  // --- Gabungkan Semua (sesuai Riwayat) ---
  const [mergeAudioFile, setMergeAudioFile] = useState<File | null>(null);
  const [useOriginalAudio, setUseOriginalAudio] = useState<boolean>(true);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [mergeProgress, setMergeProgress] = useState<number>(0);
  const [mergeStatus, setMergeStatus] = useState<string>('');
  const [isMerging, setIsMerging] = useState<boolean>(false);

  const videoUrlToFileOrderedCinema = async (url: string, idx: number): Promise<File> => {
    const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
    const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`cinema-${String(idx + 1).padStart(2, '0')}.mp4`)}`;
    let blob: Blob;
    try {
      const resp = await fetch(proxied);
      if (!resp.ok) throw new Error('Proxy fetch failed');
      blob = await resp.blob();
    } catch {
      const resp2 = await fetch(url);
      if (!resp2.ok) throw new Error('Gagal mengambil video sumber');
      blob = await resp2.blob();
    }
    const name = `cinema_${String(idx + 1).padStart(2, '0')}.mp4`;
    return new File([blob], name, { type: blob.type || 'video/mp4' });
  };

  const handleNavigateEditorNarasi = useCallback(async () => {
    if (!storyboard) { setMergeStatus('Belum ada storyboard.'); return; }
    const urls = storyboard.scenes
      .map(s => s.image_url ? inlineVideoMap?.[s.image_url]?.state.videoUrl : null)
      .filter(Boolean) as string[];
    if (urls.length === 0) { setMergeStatus('Belum ada video selesai.'); return; }
    const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
    const proxied = urls.map((u, i) => `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`cinema-${String(i + 1).padStart(2, '0')}.mp4`)}`);
    try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(proxied)); } catch {}
    try { window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls: proxied } })); } catch {}
  }, [storyboard, inlineVideoMap]);

  const downloadMergedVideo = useCallback(() => {
    if (!mergedVideoUrl) return;
    const a = document.createElement('a');
    a.href = mergedVideoUrl;
    a.download = 'gabungan-cinema.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [mergedVideoUrl]);

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

  // Konversi URL/dataURL gambar menjadi File agar bisa dijadikan referensi
  const urlToFile = async (url: string, filename: string): Promise<File | null> => {
    try {
      if (!url) return null;
      // Jika berupa dataURL base64
      if (url.startsWith('data:')) {
        const arr = url.split(',');
        const mimeMatch = arr[0].match(/data:(.*?);/);
        const mime = mimeMatch?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], filename, { type: mime });
      }
      // Jika berupa URL HTTP(S)
      const resp = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (!resp.ok) throw new Error('Failed to fetch image');
      const blob = await resp.blob();
      const type = blob.type || 'image/png';
      return new File([blob], filename, { type });
    } catch (e) {
      console.warn('Gagal mengonversi URL ke File, gunakan fallback tanpa referensi:', e);
      return null;
    }
  };

  // Helper untuk menyamakan generator gambar dengan fitur lain
  const generateSceneImageUnified = useCallback(async (instruction: string, ar: '16:9' | '9:16', subjectImage?: File | null, referenceImage?: File | null, onProgress?: (progress: number, msg: string) => void, signal?: AbortSignal): Promise<string> => {
    const token = await getCentralizedToken();
    if (!token) {
      throw new Error('Token VEO3 belum diatur. Minta admin mengisi token di menu Admin (Token VEO3).');
    }
    const arEnum = ar === '9:16' ? AspectRatio.Portrait : AspectRatio.Landscape;
    const cb = onProgress || (() => {});
    // Jika ada referensi dan ada subjek (misal gambar karakter dari user), gunakan dual-input agar kontinuitas terjaga
    if (referenceImage && subjectImage) {
      return await generateImageWithReference(instruction, arEnum, subjectImage, referenceImage, token, cb, signal);
    }
    // Jika hanya ada referensi (tanpa subjek karakter), gunakan referensi sebagai subjek img2img
    if (referenceImage && !subjectImage) {
      return await generateImage(instruction, arEnum, referenceImage, token, cb, signal);
    }
    // Jika tidak ada referensi maupun subjek, pakai prompt murni
    if (!subjectImage) {
      return await generateImagePromptOnly(instruction, arEnum, token, cb, signal);
    }
    // Kasus default: hanya subjek dari user
    return await generateImage(instruction, arEnum, subjectImage, token, cb, signal);
  }, []);

  const generateStory = useCallback(async () => {
    if (!theme) return;
    cancelRef.current = false;
    abortControllers.current = [];
    setGenState({ status: 'generating_story', message: 'Menulis skenario dan adegan...' });
    setStoryboard(null);
    let generatedStory: Storyboard | null = null;
    try {
      if (cancelRef.current) { setGenState({ status: 'idle' }); return; }
      
      const prompt = `Create a detailed cinematic storyboard for a 1-minute teaser film, designed for video generation.
Constraints:
- The story is told through a combination of action narration and dialogue.
- EXACTLY 10 scenes.
- EACH scene is 8 seconds long.
- The first two scenes are introductory, establishing the setting and character. They MUST NOT have any 'dialogue_text' (provide an empty string). They must still have narration.
- Dialogue MUST begin from scene 3. EVERY scene from scene 3 to 10 MUST have both a narration describing an action and a subsequent dialogue part.
- Theme (Premise): "${theme}".
- Language: ${language}.
- IMPORTANT: If the story involves multiple characters, clearly distinguish them in 'visual_description' (e.g., 'The Main Character' vs 'The Old Man').

Return JSON ONLY with format:
{
  "title": "Movie Title (${language})",
  "logline": "Logline (${language})",
  "scenes": [
    { 
      "scene_number": 1, 
      "visual_description": "English visual prompt", 
      "narration": "Narration in ${language}", 
      "dialogue_text": "", 
      "duration": "8 detik",
      "characters_present": ["Main Character", "Other Person"] 
    },
    ...
  ]
}`;
      const json = await callChutesJson([{ role: 'system', content: 'You are a scriptwriter. Return only valid JSON. Always use "Main Character" to refer to the protagonist in characters_present list.' }, { role: 'user', content: prompt }]);
      generatedStory = {
          ...json,
          scenes: json.scenes.map((s: any) => ({
              ...s,
              prompt: s.dialogue_text 
                ? `${s.visual_description}. ${s.narration} sambil lipsync: "${s.dialogue_text}"`
                : `${s.visual_description}. ${s.narration}`,
              image_generation_status: 'pending'
          }))
      };
      
      setStoryboard(generatedStory);
      if (cancelRef.current) { setGenState({ status: 'idle' }); return; }
      setGenState({ status: 'generating_images', message: 'Menghasilkan visual adegan...' });

      let previousImageUrl: string | null = null;
      for (const scene of generatedStory!.scenes) {
        if (cancelRef.current) { setGenState({ status: 'idle' }); return; }
        try {
          updateSceneState(scene.scene_number, { image_generation_status: 'generating' });

          // Cek keberadaan karakter
          const chars = Array.isArray(scene.characters_present) ? scene.characters_present : [];
          const hasMainChar = chars.some((c: string) => c.toLowerCase().includes('main') || c.toLowerCase().includes('utama'));
          const isMultiChar = chars.length > 1;

          let imageGenPrompt = scene.visual_description;
          if (isMultiChar) {
            imageGenPrompt += ` SCENE CONTAINS MULTIPLE CHARACTERS: ${chars.join(', ')}.`;
            if (charImage) {
               imageGenPrompt += ` The provided subject image is the MAIN CHARACTER. Ensure OTHER characters look DISTINCTLY DIFFERENT (different face, age, gender) from the Main Character. Do not blend faces.`;
            }
          }

          if (charImage && hasMainChar) {
            imageGenPrompt += ` IMPORTANT: Match the artistic style (cartoon/3D/realistic), character design, body proportions, and height EXACTLY to the provided subject image. Do not change the art style. If the subject image is a cartoon, the output MUST be a cartoon. Keep consistent character scale.`;
          }

          // Siapkan referensi dari gambar sebelumnya jika tersedia
          const refFile = previousImageUrl ? await urlToFile(previousImageUrl, `scene_${scene.scene_number - 1}_ref.png`) : null;

          const controller = new AbortController();
          abortControllers.current.push(controller);
          
          // Logic: Only use charImage as Subject if Main Character is present in the scene.
          // If Main Character is NOT present, do not force subject (prevent face bleed on other chars).
          // Always use refFile for style continuity if available.
          const subjectForThisScene = (charImage && hasMainChar) ? charImage : null;
          
          const url = await generateSceneImageUnified(imageGenPrompt, aspectRatio, subjectForThisScene, refFile, (progress, msg) => {
            // Update pesan status global saat proses gambar
            setGenState(s => ({ ...s, status: 'generating_images', message: msg || 'Menghasilkan visual adegan...' }));
          }, controller.signal);

          updateSceneState(scene.scene_number, { image_generation_status: 'complete', image_url: url });
          previousImageUrl = url;
        } catch (imgErr) {
          console.error(`Failed to generate image for scene ${scene.scene_number}`, imgErr);
          updateSceneState(scene.scene_number, { image_generation_status: 'error' });
        }
      }

      setGenState({ status: 'complete' });
    } catch (error: any) {
      console.error(error);
      setGenState({ status: 'error', message: error?.message || 'Terjadi kesalahan selama pembuatan.' });
    }
  }, [theme, charImage, aspectRatio, generateSceneImageUnified, language]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col font-sans selection:bg-red-900 selection:text-white rounded-3xl overflow-hidden">
      {/* Header internal */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50 supports-[backdrop-filter]:bg-zinc-950/60">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FilmIcon />
            <h1 className="text-lg font-extrabold tracking-tight text-white">Cinema AI</h1>
          </div>
          {genState.status === 'complete' && (
            <button
              onClick={() => {
                setStoryboard(null);
                setGenState({ status: 'idle' });
                setTheme('');
                setCharImage(null);
                setCharPreview(null);
              }}
              className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 hover:text-white transition-all rounded-full border border-zinc-700"
            >
              Proyek Baru
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
        {!storyboard && (
          <div className="max-w-3xl mx-auto space-y-10 animate-fade-in">
            <div className="text-center space-y-6">
              <h2 className="text-4xl font-extrabold text-white tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500">
                Sutradarai Skrip AI Anda untuk Veo
              </h2>
              <p className="text-zinc-400 text-base max-w-xl mx-auto leading-relaxed">
                Hasilkan papan cerita 1 menit dengan visual & skrip. Setiap adegan dilengkapi skrip prompt siap pakai.
              </p>
            </div>

            <div className="bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800/50 space-y-8 shadow-2xl shadow-black/50 backdrop-blur-sm">
              <div className="space-y-3">
                <label htmlFor="theme" className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider">Premis Film</label>
                <textarea
                  id="theme"
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-white placeholder-zinc-600 focus:ring-2 focus:ring-red-600/50 focus:border-red-600 outline-none transition-all resize-none text-lg"
                  placeholder="cth., Seorang penjelajah waktu terjebak di masa lalu..."
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  disabled={isBusy}
                />
                <div>
                  <label className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider">Bahasa</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-3 text-white">
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
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider">Pemeran Utama (Referensi Opsional)</label>
                <div className="flex items-start gap-6">
                  <label className={`flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-2xl border-2 border-dashed border-zinc-700 cursor-pointer hover:border-zinc-500 hover:bg-zinc-800/30 transition-all group ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <div className="p-4 bg-zinc-800 rounded-full group-hover:bg-zinc-700 transition-colors"><UploadIcon /></div>
                    <div className="text-center">
                      <span className="text-base font-medium text-zinc-300 group-hover:text-white block">Klik untuk unggah foto</span>
                      <span className="text-xs text-zinc-500 block mt-1">PNG, JPG hingga 5MB</span>
                    </div>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={isBusy} />
                  </label>
                  {charPreview && (
                    <div className="relative h-40 w-40 rounded-2xl overflow-hidden border-2 border-zinc-700 shadow-lg flex-shrink-0">
                      <img src={charPreview} alt="Pratinjau Karakter" className="h-full w-full object-cover" />
                      <button onClick={() => { setCharImage(null); setCharPreview(null); }} className="absolute top-2 right-2 bg-black/70 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-red-600 transition-all backdrop-blur-md" disabled={isBusy}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-semibold text-zinc-300 uppercase tracking-wider">Rasio Aspek Visual</label>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setAspectRatio('16:9')} className={`py-4 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${aspectRatio === '16:9' ? 'bg-red-600 text-white ring-2 ring-red-500' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`} disabled={isBusy}>16:9 Landscape</button>
                  <button onClick={() => setAspectRatio('9:16')} className={`py-4 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${aspectRatio === '9:16' ? 'bg-red-600 text-white ring-2 ring-red-500' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`} disabled={isBusy}>9:16 Portrait</button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={generateStory} disabled={!theme || isBusy} className={`flex-1 py-5 rounded-2xl font-bold text-xl tracking-wider uppercase transition-all transform active:scale-[0.99] ${!theme || isBusy ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 hover:shadow-red-700/40'}`}>{isBusy ? (genState.message || 'Membuat...') : 'Hasilkan Papan Cerita'}</button>
                {isBusy && (
                  <button type="button" onClick={() => { cancelRef.current = true; try { abortControllers.current.forEach(c => { try { c.abort(); } catch {} }); } catch {}; abortControllers.current = []; setGenState({ status: 'idle' }); }} className="px-3 py-2 rounded-full bg-red-600 text-white border border-red-700/40 hover:bg-red-700 shadow-sm font-bold text-xs" title="Hentikan proses">
                    Stop
                  </button>
                )}
              </div>
              {genState.status === 'error' && (
                <div className="p-4 bg-red-950/50 border border-red-900/50 rounded-xl text-red-300 text-sm flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
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
              <h2 className="text-3xl font-extrabold text-white tracking-tight">{storyboard.title}</h2>
              <p className="text-zinc-400 max-w-2xl mx-auto">{storyboard.logline}</p>
              {isBusy && genState.status === 'generating_images' && (
                <div className="inline-flex items-center gap-2 text-sm text-zinc-400">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  {genState.message}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {storyboard.scenes.map(scene => (
                <SceneCard
                  key={scene.scene_number}
                  scene={scene}
                  onImageClick={setModalImage}
                  inlineMap={inlineVideoMap}
                  onCreateVideo={onCreateInlineVideo}
                  onRegenerateImage={(sceneNumber) => {
                    const target = storyboard.scenes.find(s => s.scene_number === sceneNumber);
                    if (!target) return;
                    const prev = storyboard.scenes.find(s => s.scene_number === sceneNumber - 1);
                    const prevUrl = prev?.image_url || null;
                    updateSceneState(sceneNumber, { image_generation_status: 'generating' });
                    (async () => {
                      try {
                        const refFile = prevUrl ? await urlToFile(prevUrl, `scene_${sceneNumber - 1}_ref.png`) : null;
                        const url = await generateSceneImageUnified(target.prompt || target.visual_description, aspectRatio, charImage, refFile, (p, m) => { setGenState(s => ({ ...s, status: 'generating_images', message: m || 'Menghasilkan visual adegan...' })); });
                        updateSceneState(sceneNumber, { image_generation_status: 'complete', image_url: url });
                      } catch (e) {
                        updateSceneState(sceneNumber, { image_generation_status: 'error' });
                      }
                    })();
                  }}
                  onUpdatePrompt={(sceneNumber, newPrompt) => {
                    updateSceneState(sceneNumber, { prompt: newPrompt });
                  }}
                />
              ))}
            </div>

            {/* Gabungkan Semua */}
            <div className="bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800/50 space-y-4 shadow-2xl shadow-black/50 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wider text-zinc-300">Gabungkan Semua</span>
                <span className="text-xs text-zinc-400">Urutan mengikuti adegan dari pertama hingga terakhir</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                
                <button type="button" onClick={handleNavigateEditorNarasi} disabled={false} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 6h16v12H4z"/><path d="M9 8h6v8H9z"/></svg>
                  Gabungkan Semua
                </button>
                {mergedVideoUrl && (
                  <button type="button" onClick={downloadMergedVideo} className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold">Download Gabungan</button>
                )}
                {!mergedVideoUrl && mergeStatus && <span className="text-xs text-zinc-400">{mergeStatus}</span>}
              </div>
              {mergedVideoUrl && (
                <div className="space-y-2">
                  <video src={mergedVideoUrl} className="w-full h-64 object-contain rounded" controls />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">{mergeStatus}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modalImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 animate-fade-in" onClick={() => setModalImage(null)}>
          <div className="relative">
            <img
              src={modalImage}
              alt="Tampilan adegan yang diperbesar"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl shadow-black/50"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setModalImage(null)}
              className="absolute top-2 right-2 w-9 h-9 bg-white/90 text-zinc-900 border border-zinc-300 rounded-full flex items-center justify-center shadow-md hover:bg-white"
              aria-label="Tutup"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CinemaAI;
