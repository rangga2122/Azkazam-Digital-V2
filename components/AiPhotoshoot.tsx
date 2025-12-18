import React, { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { AspectRatio, GenerationStatus } from '../types';
import { PhotoshootIcon, XMarkIcon } from './icons';
import { generateImage, generateImageWithReference, generateImageWithBackground, generateImageWithBackgroundAndReference } from '../services/imageSandboxApi';

export interface AiPhotoshootRef {
  regenerate: (index: number) => Promise<void>;
}

interface Props {
  onResultsChange: (urls: string[]) => void;
}

type Gender = 'pria' | 'wanita';
type ShotType = 'close-up' | 'full-body';

const aspectOptions: AspectRatio[] = [AspectRatio.Portrait, AspectRatio.Square, AspectRatio.Landscape];

// Pose modifiers dipisah per tipe shot agar hasil konsisten dengan pilihan user
const POSES_BY_SHOT: Record<ShotType, string[]> = {
  'full-body': [
    'full-body standing pose, balanced lighting, lifestyle vibe',
    'full-body 3/4 angle, professional lighting, soft shadows',
    'full-body presenting product, cinematic framing, clear visibility',
    'full-body lifestyle pose, premium mood, clean background',
    'full-body seated pose, relaxed expression, soft rim light',
    'full-body fashion pose, cinematic framing, well-balanced highlights',
  ],
  'close-up': [
    'tight headshot, eye-level, shallow depth of field',
    'close-up 3/4 face, soft rim light, commercial look',
    'close-up with product near face, crisp focus',
    'dramatic close-up with catchlight, editorial mood',
    'portrait close-up with creamy bokeh, perfect skin tone',
    'macro‑style detail near face highlighting product texture',
  ],
};

// Tema visual diubah menjadi dropdown lengkap seperti pada Rupa Foto AI

const shotDescriptions: Record<ShotType, string> = {
  'close-up': 'tight crop headshot capturing facial detail and expression',
  'full-body': 'full-body framing showcasing posture and outfit'
};

// Aturan tegas untuk masing-masing shot agar model tidak menyimpang
const shotRules: Record<ShotType, string> = {
  'full-body': 'STRICT REQUIREMENT: show the subject from HEAD TO TOE (entire body). DO NOT crop out legs or feet. DO NOT zoom into the face. Keep enough distance so the full body is clearly visible.',
  'close-up': 'STRICT REQUIREMENT: tight close-up (head-and-shoulders). DO NOT show full body or legs. Frame closely around the face and upper chest with shallow depth of field.',
};

const label = (text: string) => (
  <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{text}</span>
);

const Spinner = ({ className = 'w-6 h-6' }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2"/>
    <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
  </svg>
);

const toFilePreview = (file: File): Promise<string> => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target?.result as string);
  reader.readAsDataURL(file);
});

const AiPhotoshoot = forwardRef<AiPhotoshootRef, Props>(({ onResultsChange }, ref) => {
  const [subjectImage, setSubjectImage] = useState<File | null>(null);
  const [subjectPreview, setSubjectPreview] = useState<string | null>(null);
  const [subjectImages, setSubjectImages] = useState<File[]>([]);
  const [isMergedSubject, setIsMergedSubject] = useState<boolean>(false);
  const subjectInputRef = useRef<HTMLInputElement | null>(null);

  const [useAiModel, setUseAiModel] = useState<boolean>(true);
  const [modelImage, setModelImage] = useState<File | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);

  const [gender, setGender] = useState<Gender>('wanita');
  const [hijab, setHijab] = useState<boolean>(false);
  const [shot, setShot] = useState<ShotType>('full-body');
  const [visualTheme, setVisualTheme] = useState<string>('clean studio photography, soft light');
  const [aspect, setAspect] = useState<AspectRatio>(AspectRatio.Portrait);
  const [productDescription, setProductDescription] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');

  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.Idle);
  const [progressOverall, setProgressOverall] = useState<number>(0);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const abortControllers = useRef<AbortController[]>([]);
  const cancelRef = useRef<boolean>(false);

  const [results, setResults] = useState<string[]>([]);

  useEffect(() => { onResultsChange(results); }, [results, onResultsChange]);

  const canGenerate = useMemo(() => {
    if (!subjectImage) return false;
    if (!useAiModel && !modelImage) return false;
    return true;
  }, [subjectImage, useAiModel, modelImage]);


  const handleSubjectSelect = useCallback(async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setSubjectImages([file]);
    setIsMergedSubject(false);
    setSubjectImage(file);
    const url = await toFilePreview(file);
    setSubjectPreview(url);
  }, []);

  const mergeImagesContain = async (files: File[], ratio: AspectRatio): Promise<{ file: File; preview: string }> => {
    const size = ratio === AspectRatio.Portrait ? { w: 1080, h: 1920 } : ratio === AspectRatio.Square ? { w: 1200, h: 1200 } : { w: 1920, h: 1080 };
    const canvas = document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.w, size.h);

    const urls = await Promise.all(files.map(f => toFilePreview(f)));
    const imgs = await Promise.all(urls.map(u => new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = u as string; })));

    const count = imgs.length;
    const pad = Math.round(Math.min(size.w, size.h) * 0.04);

    const drawContain = (img: HTMLImageElement, x: number, y: number, maxW: number, maxH: number) => {
      const r = Math.min(maxW / img.width, maxH / img.height);
      const dw = Math.max(1, Math.floor(img.width * r));
      const dh = Math.max(1, Math.floor(img.height * r));
      const dx = x + Math.floor((maxW - dw) / 2);
      const dy = y + Math.floor((maxH - dh) / 2);
      ctx.drawImage(img, dx, dy, dw, dh);
    };

    if (count === 1) {
      drawContain(imgs[0], pad, pad, size.w - pad * 2, size.h - pad * 2);
    } else if (count === 2) {
      if (ratio === AspectRatio.Portrait) {
        const tileW = size.w - pad * 2;
        const tileH = Math.floor((size.h - pad * 3) / 2);
        drawContain(imgs[0], pad, pad, tileW, tileH);
        drawContain(imgs[1], pad, pad * 2 + tileH, tileW, tileH);
      } else {
        const tileW = Math.floor((size.w - pad * 3) / 2);
        const tileH = size.h - pad * 2;
        drawContain(imgs[0], pad, pad, tileW, tileH);
        drawContain(imgs[1], pad * 2 + tileW, pad, tileW, tileH);
      }
    } else if (count === 3) {
      if (ratio === AspectRatio.Landscape) {
        const tileW = Math.floor((size.w - pad * 4) / 3);
        const tileH = size.h - pad * 2;
        drawContain(imgs[0], pad, pad, tileW, tileH);
        drawContain(imgs[1], pad * 2 + tileW, pad, tileW, tileH);
        drawContain(imgs[2], pad * 3 + tileW * 2, pad, tileW, tileH);
      } else {
        const topH = Math.floor((size.h - pad * 3) * 0.55);
        const tileW = Math.floor((size.w - pad * 3) / 2);
        drawContain(imgs[0], pad, pad, tileW, topH);
        drawContain(imgs[1], pad * 2 + tileW, pad, tileW, topH);
        const bottomH = size.h - topH - pad * 3;
        drawContain(imgs[2], pad, pad * 2 + topH, size.w - pad * 2, bottomH);
      }
    } else {
      const cols = ratio === AspectRatio.Portrait ? 2 : ratio === AspectRatio.Square ? 2 : 3;
      const rows = Math.ceil(count / cols);
      const tileW = Math.floor((size.w - pad * (cols + 1)) / cols);
      const tileH = Math.floor((size.h - pad * (rows + 1)) / rows);
      for (let i = 0; i < count; i++) {
        const rIdx = Math.floor(i / cols);
        const cIdx = i % cols;
        const x = pad + cIdx * (tileW + pad);
        const y = pad + rIdx * (tileH + pad);
        drawContain(imgs[i], x, y, tileW, tileH);
      }
    }

    const blob: Blob = await new Promise((resolve) => canvas.toBlob(b => resolve(b as Blob), 'image/png', 0.92));
    const file = new File([blob], `gabungan-produk.png`, { type: 'image/png' });
    const preview = await toFilePreview(file);
    return { file, preview };
  };

  const handleSubjectSelectMultiple = useCallback(async (list: FileList) => {
    const incoming = Array.from(list || []).filter(f => f.type.startsWith('image/'));
    if (incoming.length === 0) return;
    const next = (() => {
      const map = new Map<string, File>();
      [...subjectImages, ...incoming].forEach(f => map.set(`${f.name}-${f.size}-${f.type}`, f));
      return Array.from(map.values());
    })();
    setSubjectImages(next);
    if (next.length === 1) {
      const url = await toFilePreview(next[0]);
      setSubjectImage(next[0]);
      setSubjectPreview(url);
      setIsMergedSubject(false);
      return;
    }
    const merged = await mergeImagesContain(next, aspect);
    setSubjectImage(merged.file);
    setSubjectPreview(merged.preview);
    setIsMergedSubject(true);
  }, [aspect, subjectImages]);

  useEffect(() => {
    const remerge = async () => {
      if (subjectImages.length > 1) {
        const merged = await mergeImagesContain(subjectImages, aspect);
        setSubjectImage(merged.file);
        setSubjectPreview(merged.preview);
        setIsMergedSubject(true);
      }
    };
    remerge();
  }, [aspect, subjectImages]);

  const handleModelSelect = useCallback(async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setModelImage(file);
    const url = await toFilePreview(file);
    setModelPreview(url);
  }, []);

  const handleBackgroundSelect = useCallback(async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setBackgroundImage(file);
    const url = await toFilePreview(file);
    setBackgroundPreview(url);
  }, []);

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

  const startOver = () => {
    setSubjectImage(null);
    setSubjectPreview(null);
    setSubjectImages([]);
    setIsMergedSubject(false);
    setUseAiModel(true);
    setModelImage(null);
    setModelPreview(null);
    setBackgroundImage(null);
    setBackgroundPreview(null);
    setGender('wanita');
    setHijab(false);
    setShot('full-body');
    setVisualTheme('clean studio photography, soft light');
    setAspect(AspectRatio.Portrait);
    setProductDescription('');
    setPrompt('');
    setStatus(GenerationStatus.Idle);
    setProgressOverall(0);
    setProgressMsg('');
    setErrorMsg('');
    onResultsChange([]);
  };

  const handleStop = () => {
    cancelRef.current = true;
    try { abortControllers.current.forEach(c => { try { c.abort(); } catch {} }); } catch {}
    abortControllers.current = [];
    setProgressMsg('Dihentikan oleh pengguna.');
    setErrorMsg('');
    setStatus(GenerationStatus.Idle);
  };

  const buildInstruction = (): string => {
    const themeDescription = (prompt?.trim() || visualTheme).trim();
    const aspectLabel = aspect === AspectRatio.Portrait ? '9:16' : (aspect === AspectRatio.Square ? '1:1' : '16:9');

    let aiModelDescription = '';
    if (useAiModel) {
      if (gender === 'wanita') {
        aiModelDescription = hijab
          ? 'a beautiful young Indonesian woman in her early 20s, wearing a modern and stylish light-grey hijab, with warm brown eyes and a friendly, gentle smile'
          : 'a beautiful young Southeast Asian woman in her early 20s, with long, flowing dark brown hair, soft brown eyes, and a natural, radiant smile';
      } else {
        aiModelDescription = 'a handsome young Indonesian man in his mid-20s, with short, neat black hair, a friendly expression, and a confident but approachable look';
      }
    }

    const shotDesc = shotDescriptions[shot];
    const bgText = backgroundImage ? 'Place the product subject into the uploaded background environment, matching lighting and perspective for a natural composite. Keep realistic shadows and avoid blur.' : '';
    const prodDesc = productDescription.trim() ? `Product Description: "${productDescription.trim()}".` : '';
    const base = useAiModel
      ? `Create a hyper-realistic, 8k resolution, professional product photograph. The overall style and theme MUST BE: "${themeDescription}". The product is the item from the input image. ${prodDesc} The model MUST be consistently depicted as: "${aiModelDescription}". The model is naturally using/wearing the product. ${bgText} Shot: ${shotDesc}. ${shotRules[shot]} Ensure sharp focus and natural lighting. The final image must have a ${aspectLabel} aspect ratio.`
      : `Create a hyper-realistic, 8k resolution, professional product photograph. The overall style and theme MUST BE: "${themeDescription}". The model is the person from the uploaded reference image, and their face must be clear, in sharp focus, and not blurred. The product is the item from the input image. ${prodDesc} The model must be wearing/using the product naturally. ${bgText} Shot: ${shotDesc}. ${shotRules[shot]} Ensure sharp focus and natural lighting. The final image must have a ${aspectLabel} aspect ratio.`;

    return base;
  };

  const handleGenerate = async () => {
    cancelRef.current = false;
    abortControllers.current = [];
    if (!subjectImage) {
      setStatus(GenerationStatus.Failed);
      setErrorMsg('Harap unggah gambar produk terlebih dahulu.');
      setProgressMsg('Gagal');
      return;
    }
    if (!useAiModel && !modelImage) {
      setStatus(GenerationStatus.Failed);
      setErrorMsg('Mode Upload Model aktif: harap unggah gambar model.');
      setProgressMsg('Gagal');
      return;
    }
    setResults([]);
    setStatus(GenerationStatus.Pending);
    setProgressOverall(0);
    setProgressMsg('Menunggu...');
    setErrorMsg('');

    try {
      const token = await getCentralizedToken();
      if (!token) {
        setStatus(GenerationStatus.Failed);
        setErrorMsg('Token VEO3 belum diatur. Minta admin mengisi token di menu Admin (Token VEO3).');
        setProgressMsg('Gagal');
        return;
      }

      const baseInstruction = buildInstruction();
      const acc: string[] = [];
      const selectedPoses = POSES_BY_SHOT[shot];
      const PARALLEL = 3;
      const total = selectedPoses.length;
      for (let i = 0; i < total; i += PARALLEL) {
        if (cancelRef.current) { setStatus(GenerationStatus.Idle); setProgressMsg('Dihentikan.'); return; }
        const batch = selectedPoses.slice(i, i + PARALLEL);
        const promises = batch.map((mod, offset) => {
          const finalInstruction = `${baseInstruction} Composition: ${mod}.`;
          const overallIndex = i + offset;
          const controller = new AbortController();
          abortControllers.current.push(controller);
          return (backgroundImage
            ? (useAiModel || !modelImage
                ? generateImageWithBackground(finalInstruction, aspect, subjectImage, backgroundImage, token, (p, m) => {
                    const msg = (m || '').toLowerCase();
                    const isUpload = msg.includes('unggah') || msg.includes('upload');
                    setStatus(isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing);
                    setProgressMsg(m || `Memproses (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(total / PARALLEL)})...`);
                    const overall = Math.min(100, Math.round((((overallIndex + p / 100)) / total) * 100));
                    setProgressOverall(overall);
                  }, controller.signal)
                : generateImageWithBackgroundAndReference(finalInstruction, aspect, subjectImage, modelImage!, backgroundImage, token, (p, m) => {
                    const msg = (m || '').toLowerCase();
                    const isUpload = msg.includes('unggah') || msg.includes('upload');
                    setStatus(isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing);
                    setProgressMsg(m || `Memproses (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(total / PARALLEL)})...`);
                    const overall = Math.min(100, Math.round((((overallIndex + p / 100)) / total) * 100));
                    setProgressOverall(overall);
                  }, controller.signal))
            : (useAiModel || !modelImage
                ? generateImage(finalInstruction, aspect, subjectImage, token, (p, m) => {
                    const msg = (m || '').toLowerCase();
                    const isUpload = msg.includes('unggah') || msg.includes('upload');
                    setStatus(isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing);
                    setProgressMsg(m || `Memproses (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(total / PARALLEL)})...`);
                    const overall = Math.min(100, Math.round((((overallIndex + p / 100)) / total) * 100));
                    setProgressOverall(overall);
                  }, controller.signal)
                : generateImageWithReference(finalInstruction, aspect, subjectImage, modelImage!, token, (p, m) => {
                    const msg = (m || '').toLowerCase();
                    const isUpload = msg.includes('unggah') || msg.includes('upload');
                    setStatus(isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing);
                    setProgressMsg(m || `Memproses (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(total / PARALLEL)})...`);
                    const overall = Math.min(100, Math.round((((overallIndex + p / 100)) / total) * 100));
                    setProgressOverall(overall);
                  }, controller.signal))
          );
        });
        try {
          const urls = await Promise.all(promises);
          acc.push(...urls);
          setResults(prev => [...prev, ...urls]);
        } catch (err: any) {
          console.warn('Batch generate failed', err);
        }
      }

      setStatus(GenerationStatus.Completed);
      setProgressMsg('Selesai!');
      setProgressOverall(100);
    } catch (err: any) {
      const errorMessage = err?.message || 'Terjadi kesalahan. Silakan coba lagi.';
      setStatus(GenerationStatus.Failed);
      setErrorMsg(errorMessage);
      setProgressMsg('Gagal');
    }
  };

  const regenerateOne = async (index: number) => {
    if (!subjectImage) return;
    const token = await getCentralizedToken();
    if (!token) throw new Error('Token VEO3 tidak valid.');

    const selectedPoses = POSES_BY_SHOT[shot];
    const mod = selectedPoses[index % selectedPoses.length];
    const baseInstruction = buildInstruction();
    const finalInstruction = `${baseInstruction} Composition: ${mod}.`;

    const controller = new AbortController();
    // Do not clear other abort controllers, just track this one locally or if we want global cancel support, add to ref.
    
    let url = '';
    const onProgress = (p: number, m: string) => { /* Optional: emit progress event or ignore */ };

    if (backgroundImage) {
      if (useAiModel || !modelImage) {
        url = await generateImageWithBackground(finalInstruction, aspect, subjectImage, backgroundImage, token, onProgress, controller.signal);
      } else {
        url = await generateImageWithBackgroundAndReference(finalInstruction, aspect, subjectImage, modelImage!, backgroundImage, token, onProgress, controller.signal);
      }
    } else {
      if (useAiModel || !modelImage) {
        url = await generateImage(finalInstruction, aspect, subjectImage, token, onProgress, controller.signal);
      } else {
        url = await generateImageWithReference(finalInstruction, aspect, subjectImage, modelImage!, token, onProgress, controller.signal);
      }
    }

    setResults(prev => {
      const next = [...prev];
      next[index] = url;
      return next;
    });
  };

  useImperativeHandle(ref, () => ({
    regenerate: regenerateOne
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-4 md:p-6 flex items-center gap-3">
        <PhotoshootIcon className="w-6 h-6" />
        <div>
          <h2 className="text-lg md:text-xl font-black">AI Photoshoot</h2>
          <p className="text-sm text-slate-500">Gunakan gambar produk sebagai subjek; hasil mirip sesi foto komersial.</p>
        </div>
      </div>

      {/* Form */}
      <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-6">
        {/* Subject Image */}
        <div className="space-y-2">
          {label('Gambar Produk (Wajib)')}
          {!subjectPreview ? (
            <div className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer hover:border-veo-primary hover:bg-veo-primary/5"
                 onClick={() => subjectInputRef.current?.click()}>
              <input ref={subjectInputRef} type="file" id="photoshoot-subject-upload" accept="image/*" multiple className="hidden"
                     onChange={(e) => e.target.files && handleSubjectSelectMultiple(e.target.files)} />
              <p className="text-slate-500">Klik untuk mengunggah gambar produk</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <img src={subjectPreview} alt="Subject" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-slate-700">{isMergedSubject ? `gabungan-produk.png` : (subjectImage?.name)}</p>
                <p className="text-xs text-veo-primary font-bold">{isMergedSubject ? 'Gabungan Produk' : 'Gambar Produk'}</p>
              </div>
              <button type="button" onClick={() => { setSubjectImage(null); setSubjectPreview(null); setSubjectImages([]); setIsMergedSubject(false); }}
                      className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Product Description */}
        <div className="space-y-2">
          {label('Deskripsi Produk (Opsional)')}
          <textarea rows={2} value={productDescription} onChange={(e) => setProductDescription(e.target.value)}
                    className="input-base resize-none" placeholder="Jelaskan produk Anda (warna, material, bentuk) agar hasil lebih akurat..." />
        </div>

        {/* Model Options */}
        <div className="space-y-3">
          {label('Model')}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setUseAiModel(true)}
                    className={`px-3 py-2 rounded-lg border text-sm font-bold ${useAiModel ? 'bg-white border-veo-primary text-veo-primary' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>
                AI Model
              </span>
            </button>
            <button type="button" onClick={() => setUseAiModel(false)}
                    className={`px-3 py-2 rounded-lg border text-sm font-bold ${!useAiModel ? 'bg-white border-veo-primary text-veo-primary' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/></svg>
                Upload Model
              </span>
            </button>
          </div>
          {!useAiModel && (
            <div className="space-y-2">
              {!modelPreview ? (
                <div className="border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer hover:border-veo-primary hover:bg-veo-primary/5"
                     onClick={() => modelInputRef.current?.click()}>
                  <input ref={modelInputRef} type="file" id="photoshoot-model-upload" accept="image/*" className="hidden"
                         onChange={(e) => e.target.files?.[0] && handleModelSelect(e.target.files[0])} />
                  <p className="text-slate-500">Unggah gambar model</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <img src={modelPreview} alt="Model" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-slate-700">{modelImage?.name}</p>
                    <p className="text-xs text-slate-500">Gambar Model</p>
                  </div>
                  <button type="button" onClick={() => { setModelImage(null); setModelPreview(null); }}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          )}

        {useAiModel && (
          <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                {label('Gender')}
                <div className="flex bg-slate-100 p-1.5 rounded-xl">
                  {(['wanita','pria'] as Gender[]).map(g => (
                    <button key={g} type="button" onClick={() => setGender(g)}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold ${gender===g?'bg-white text-veo-primary shadow-sm':'text-slate-600'}`}>
                      <span className="flex items-center justify-center gap-2">
                        {g==='wanita' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 7a4 4 0 1 0-8 0"/><path d="M12 14v8"/><path d="M8 21h8"/></svg>
                        )}
                        {g}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {label('Hijab')}
                <div className="flex bg-slate-100 p-1.5 rounded-xl">
                  {[true,false].map(v => (
                    <button key={String(v)} type="button" onClick={() => setHijab(v)}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold ${hijab===v?'bg-white text-veo-primary shadow-sm':'text-slate-600'}`}>
                      <span className="flex items-center justify-center gap-2">
                        {v ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 0 0-6 6v10h12V9a6 6 0 0 0-6-6Z"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18"/><path d="M12 3a6 6 0 0 0-6 6"/></svg>
                        )}
                        {v?'Ya':'Tidak'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Shot & Theme */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            {label('Tipe Shot')}
            <div className="flex bg-slate-100 p-1.5 rounded-xl">
              {(['full-body','close-up'] as ShotType[]).map(s => (
                <button key={s} type="button" onClick={() => setShot(s)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold ${shot===s?'bg-white text-veo-primary shadow-sm':'text-slate-600'}`}>
                  <span className="flex items-center justify-center gap-2">
                    {s==='full-body' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="3" width="8" height="18" rx="2"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/></svg>
                    )}
                    {s}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {label('Tema Visual')}
            <select id="theme-select" value={visualTheme} onChange={e => setVisualTheme(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900">
              <optgroup label="Studio Profesional">
                <option value="clean studio photography, soft light">Studio Bersih</option>
                <option value="minimalist, solid bright color background">Studio Minimalis</option>
                <option value="cinematic, dramatic lighting, film grain">Gaya Cinematic</option>
                <option value="vintage, retro filter, 90s fashion style">Gaya Vintage</option>
              </optgroup>
              <optgroup label="Latar Belakang (Outdoor)">
                <option value="in a beautiful flower garden">Di taman bunga</option>
                <option value="on the beach at sunset">Di pantai saat senja</option>
                <option value="on a mountain peak with a scenic view">Di puncak gunung</option>
                <option value="on a city street at night with neon lights">Di jalanan kota malam hari</option>
                <option value="in the middle of a lush green rice field">Di tengah sawah</option>
                <option value="in front of a majestic waterfall">Di depan air terjun</option>
              </optgroup>
              <optgroup label="Latar Belakang (Indoor)">
                <option value="in a modern and aesthetic coffee shop">Di kafe modern</option>
                <option value="inside a luxurious shopping mall">Di dalam mal mewah</option>
                <option value="in a quiet and grand library">Di perpustakaan</option>
                <option value="in a contemporary art gallery">Di galeri seni</option>
                <option value="in a minimalist studio with simple props">Di studio minimalis (props)</option>
                <option value="in front of classic architectural building">Di depan arsitektur klasik</option>
              </optgroup>
            </select>
          </div>
        </div>

        {/* Background (Opsional) di bawah Tipe Shot */}
        <div className="space-y-2">
          {label('Background (Opsional)')}
          {!backgroundPreview ? (
            <div className="border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer hover:border-veo-primary hover:bg-veo-primary/5"
                 onClick={() => backgroundInputRef.current?.click()}>
              <input ref={backgroundInputRef} type="file" id="photoshoot-background-upload" accept="image/*" className="hidden"
                     onChange={(e) => e.target.files?.[0] && handleBackgroundSelect(e.target.files[0])} />
              <p className="text-slate-500">Unggah gambar background</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <img src={backgroundPreview} alt="Background" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-slate-700">{backgroundImage?.name}</p>
                <p className="text-xs text-slate-500">Gambar Background</p>
              </div>
              <button type="button" onClick={() => { setBackgroundImage(null); setBackgroundPreview(null); }}
                      className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          {label('Rasio Aspek')}
          <div className="flex bg-slate-100 p-1.5 rounded-xl">
            {aspectOptions.map(r => (
              <button key={r} type="button" onClick={() => setAspect(r)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${aspect===r?'bg-white text-veo-primary shadow-sm':'text-slate-600'}`}>
                <span className="flex items-center justify-center gap-2">
                  {r===AspectRatio.Portrait ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="7" y="3" width="10" height="18" rx="2"/></svg>
                  ) : r===AspectRatio.Square ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="7" width="18" height="10" rx="2"/></svg>
                  )}
                  {r}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Tambahan */}
        <div className="space-y-2">
          {label('Catatan Gaya Tambahan (Opsional)')}
          <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                    className="input-base resize-none" placeholder="Contoh: warna hangat, suasana premium, senyuman natural" />
        </div>

        {/* Action */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleGenerate} disabled={!canGenerate || status===GenerationStatus.Uploading || status===GenerationStatus.Processing}
                  className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-base flex items-center justify-center gap-3 transition-all text-white shadow-lg ${canGenerate && status!==GenerationStatus.Uploading && status!==GenerationStatus.Processing ? 'bg-veo-primary hover:bg-veo-primary/90' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
            {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing) ? <Spinner className="w-5 h-5"/> : <PhotoshootIcon className="w-5 h-5"/>}
            {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing) ? `Memproses... ${progressOverall}%` : 'Generate'}
          </button>
          {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing || status===GenerationStatus.Pending) && (
            <button type="button" onClick={handleStop}
                    className="px-3 py-2 rounded-full bg-red-600 text-white border border-red-700/40 hover:bg-red-700 shadow-sm font-bold text-xs" title="Hentikan proses">
              Stop
            </button>
          )}
        </div>
        {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing) && (
          <p className="text-xs text-slate-500">{progressMsg}</p>
        )}

        {status===GenerationStatus.Failed && errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-red-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-red-800 mb-1">Gagal Membuat Foto</h4>
                <p className="text-sm text-red-700 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
            <button type="button" onClick={startOver}
                    className="w-full px-4 py-2 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 font-medium">
              Coba Lagi
            </button>
          </div>
        )}

        {status===GenerationStatus.Completed && (
          <div className="flex items-center justify-between mt-3">
            <button type="button" onClick={startOver}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100">Mulai Lagi</button>
            <span className="text-xs text-green-600 font-semibold">Selesai!</span>
          </div>
        )}
        </div>

      {/* Hasil ditampilkan di kolom kanan (App.tsx) pada desktop, dan di bawah pada mobile */}
    </div>
  );
});

AiPhotoshoot.displayName = 'AiPhotoshoot';

export default AiPhotoshoot;
