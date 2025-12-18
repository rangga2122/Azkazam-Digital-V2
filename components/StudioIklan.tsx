import React, { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { AspectRatio, GenerationStatus } from '../types';
import { AdStudioIcon, XMarkIcon } from './icons';
import { generateImage } from '../services/imageSandboxApi';

export interface StudioIklanRef {
  regenerate: (index: number) => Promise<void>;
}

interface Props {
  onResultsChange: (urls: string[]) => void;
}

type AdType = 'lifestyle' | 'product-focus';
type AdVibe = 'energetic' | 'cinematic' | 'modern' | 'natural' | 'tech';
type AdLighting = 'studio' | 'dramatic' | 'natural' | 'neon';

const aspectOptions: AspectRatio[] = [AspectRatio.Portrait, AspectRatio.Square, AspectRatio.Landscape];

const adTypeDescriptions: Record<AdType, string> = {
  'lifestyle': 'lifestyle ad, relatable and engaging, set in a modern Indonesian context',
  'product-focus': 'product-focused ad'
};

const vibeDescriptions: Record<AdVibe, string> = {
  energetic: 'energetic and fun vibe, vibrant',
  cinematic: 'cinematic and epic vibe, dramatic',
  modern: 'modern and clean vibe, minimalist',
  natural: 'natural and organic vibe, earthy',
  tech: 'tech and futuristic vibe, innovative'
};

const lightingDescriptions: Record<AdLighting, string> = {
  studio: 'professional studio lighting, even and soft',
  dramatic: 'dramatic lighting, high contrast',
  natural: 'soft natural sunlight',
  neon: 'vibrant neon lighting'
};

const adModifiers: string[] = [
  'dramatic close-up composition, highlighting product details and texture.',
  'aesthetic flat lay composition, surrounded by relevant elements.',
  'in-context shot, showing the product being used naturally.',
  'composition with a beautiful bokeh background, creating a sharp focus on the product.',
  'dynamic composition with water splashes or other moving elements to give a fresh impression.',
  'premium composition, product placed on a minimalist podium or stage.'
];

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

const StudioIklan = forwardRef<StudioIklanRef, Props>(({ onResultsChange }, ref) => {
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [isMergedProduct, setIsMergedProduct] = useState<boolean>(false);

  const [adType, setAdType] = useState<AdType>('lifestyle');
  const [adVibe, setAdVibe] = useState<AdVibe>('cinematic');
  const [adLighting, setAdLighting] = useState<AdLighting>('dramatic');
  const [aspect, setAspect] = useState<AspectRatio>(AspectRatio.Portrait);
  const [productDescription, setProductDescription] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');

  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.Idle);
  const [progressOverall, setProgressOverall] = useState<number>(0);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const abortControllers = useRef<AbortController[]>([]);
  const cancelRef = useRef<boolean>(false);

  const [results, setResults] = useState<string[]>([]);
  useEffect(() => { onResultsChange(results); }, [results, onResultsChange]);

  const canGenerate = useMemo(() => !!productImage, [productImage]);


  const handleProductSelect = useCallback(async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setProductImages([file]);
    setIsMergedProduct(false);
    setProductImage(file);
    const url = await toFilePreview(file);
    setProductPreview(url);
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

  const handleProductSelectMultiple = useCallback(async (list: FileList) => {
    const incoming = Array.from(list || []).filter(f => f.type.startsWith('image/'));
    if (incoming.length === 0) return;
    const next = (() => {
      const map = new Map<string, File>();
      [...productImages, ...incoming].forEach(f => map.set(`${f.name}-${f.size}-${f.type}`, f));
      return Array.from(map.values());
    })();
    setProductImages(next);
    if (next.length === 1) {
      const url = await toFilePreview(next[0]);
      setProductImage(next[0]);
      setProductPreview(url);
      setIsMergedProduct(false);
      return;
    }
    const merged = await mergeImagesContain(next, aspect);
    setProductImage(merged.file);
    setProductPreview(merged.preview);
    setIsMergedProduct(true);
  }, [aspect, productImages]);

  useEffect(() => {
    const remerge = async () => {
      if (productImages.length > 1) {
        const merged = await mergeImagesContain(productImages, aspect);
        setProductImage(merged.file);
        setProductPreview(merged.preview);
        setIsMergedProduct(true);
      }
    };
    remerge();
  }, [aspect, productImages]);

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
    setProductImage(null);
    setProductPreview(null);
    setAdType('lifestyle');
    setAdVibe('cinematic');
    setAdLighting('dramatic');
    setAspect(AspectRatio.Portrait);
    setProductDescription('');
    setCustomPrompt('');
    setStatus(GenerationStatus.Idle);
    setProgressOverall(0);
    setProgressMsg('');
    setErrorMsg('');
    setResults([]);
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
    const prodDesc = productDescription.trim() ? `Product Description: "${productDescription.trim()}".` : '';
    const basePrompt = `product ad, style: ${adTypeDescriptions[adType]}, ${vibeDescriptions[adVibe]}, ${lightingDescriptions[adLighting]}. ${prodDesc} ${customPrompt ? `Additional details: "${customPrompt}"` : 'Visually appealing with strong product focus.'}`;
    return basePrompt;
  };

  const handleGenerate = async () => {
    cancelRef.current = false;
    abortControllers.current = [];
    if (!canGenerate || !productImage) return;
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
      const PARALLEL = 3;
      const total = adModifiers.length;
      for (let i = 0; i < total; i += PARALLEL) {
        if (cancelRef.current) { setStatus(GenerationStatus.Idle); setProgressMsg('Dihentikan.'); return; }
        const batch = adModifiers.slice(i, i + PARALLEL);
        const aspectLabel = aspect === AspectRatio.Portrait ? '9:16' : (aspect === AspectRatio.Square ? '1:1' : '16:9');
        const promises = batch.map((modifier, offset) => {
          const overallIndex = i + offset;
          const finalInstruction = `ultra-realistic 8k product advertisement photo. theme: ${baseInstruction}. specific composition: ${modifier}. sharp focus on the product from the input image. perfect lighting. The final image must have a ${aspectLabel} aspect ratio.`;
          setStatus(GenerationStatus.Uploading);
          setProgressMsg(`Mengunggah & memproses (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(total / PARALLEL)})...`);
          const controller = new AbortController();
          abortControllers.current.push(controller);
          return generateImage(finalInstruction, aspect, productImage, token, (p, m) => {
            const msg = (m || '').toLowerCase();
            const isUpload = msg.includes('unggah') || msg.includes('upload');
            setStatus(isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing);
            setProgressMsg(m || `Memproses (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(total / PARALLEL)})...`);
            const overall = Math.min(100, Math.round((((overallIndex + p / 100)) / total) * 100));
            setProgressOverall(overall);
          }, controller.signal);
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
    if (!productImage) return;
    const token = await getCentralizedToken();
    if (!token) throw new Error('Token VEO3 tidak valid.');

    const modifier = adModifiers[index % adModifiers.length];
    const baseInstruction = buildInstruction();
    const aspectLabel = aspect === AspectRatio.Portrait ? '9:16' : (aspect === AspectRatio.Square ? '1:1' : '16:9');
    const finalInstruction = `ultra-realistic 8k product advertisement photo. theme: ${baseInstruction}. specific composition: ${modifier}. sharp focus on the product from the input image. perfect lighting. The final image must have a ${aspectLabel} aspect ratio.`;
    
    const controller = new AbortController();
    const onProgress = (p: number, m: string) => {};

    const url = await generateImage(finalInstruction, aspect, productImage, token, onProgress, controller.signal);

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
        <AdStudioIcon className="w-6 h-6" />
        <div>
          <h2 className="text-lg md:text-xl font-black">Studio Iklan AI</h2>
          <p className="text-sm text-slate-500">Buat visual iklan produk dengan layout dan pencahayaan profesional.</p>
        </div>
      </div>

      {/* Form */}
      <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-6">
        {/* Product Image */}
        <div className="space-y-2">
          {label('Gambar Produk (Wajib)')}
          {!productPreview ? (
            <div className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer hover:border-veo-primary hover:bg-veo-primary/5"
                 onClick={() => document.getElementById('product-upload')?.click()}>
              <input type="file" id="product-upload" accept="image/*" multiple className="hidden"
                     onChange={(e) => e.target.files && handleProductSelectMultiple(e.target.files)} />
              <p className="text-slate-500">Klik untuk mengunggah gambar produk</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <img src={productPreview} alt="Product" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-slate-700">{isMergedProduct ? 'gabungan-produk.png' : (productImage?.name)}</p>
                <p className="text-xs text-veo-primary font-bold">{isMergedProduct ? 'Gabungan Produk' : 'Gambar Produk'}</p>
              </div>
              <button type="button" onClick={() => { setProductImage(null); setProductPreview(null); setProductImages([]); setIsMergedProduct(false); }}
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
                    className="input-base resize-none" placeholder="Jelaskan detail produk (warna, bahan, fitur) untuk hasil lebih akurat..." />
        </div>

        {/* Jenis Iklan */}
        <div className="space-y-2">
          {label('Jenis Iklan')}
          <div className="flex bg-slate-100 p-1.5 rounded-xl">
            {(['lifestyle','product-focus'] as AdType[]).map(t => (
              <button key={t} type="button" onClick={() => setAdType(t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${adType===t?'bg-white text-veo-primary shadow-sm':'text-slate-600'}`}>{t==='lifestyle'?'Lifestyle':'Product Focus'}</button>
            ))}
          </div>
        </div>

        {/* Vibe */}
        <div className="space-y-2">
          {label('Vibe')}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {(['energetic','cinematic','modern','natural','tech'] as AdVibe[]).map(v => (
              <button key={v} type="button" onClick={() => setAdVibe(v)}
                      className={`py-2 rounded-lg text-sm font-bold border ${adVibe===v?'bg-white border-veo-primary text-veo-primary':'bg-slate-100 border-slate-200 text-slate-600'}`}>{
                        v==='energetic'?'Energetic & Fun': v==='cinematic'?'Cinematic & Epic': v==='modern'?'Modern & Clean': v==='natural'?'Natural & Organic':'Tech & Futuristic'
                      }</button>
            ))}
          </div>
        </div>

        {/* Pencahayaan */}
        <div className="space-y-2">
          {label('Pencahayaan')}
          <div className="flex bg-slate-100 p-1.5 rounded-xl">
            {(['studio','dramatic','natural','neon'] as AdLighting[]).map(l => (
              <button key={l} type="button" onClick={() => setAdLighting(l)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${adLighting===l?'bg-white text-veo-primary shadow-sm':'text-slate-600'}`}>{
                        l==='studio'?'Studio Light': l==='dramatic'?'Dramatic': l==='natural'?'Natural Light':'Neon'
                      }</button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          {label('Rasio Aspek')}
          <div className="flex bg-slate-100 p-1.5 rounded-xl">
            {aspectOptions.map(r => (
              <button key={r} type="button" onClick={() => setAspect(r)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${aspect===r?'bg-white text-veo-primary shadow-sm':'text-slate-600'}`}>{r}</button>
            ))}
          </div>
        </div>

        {/* Prompt Tambahan */}
        <div className="space-y-2">
          {label('Deskripsi Iklan Kustom (Opsional)')}
          <textarea rows={3} value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className="input-base resize-none" placeholder="Contoh: Iklan untuk target audience muda..." />
        </div>

        {/* Action */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleGenerate} disabled={!canGenerate || status===GenerationStatus.Uploading || status===GenerationStatus.Processing}
                  className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-base flex items-center justify-center gap-3 transition-all text-white shadow-lg ${canGenerate && status!==GenerationStatus.Uploading && status!==GenerationStatus.Processing ? 'bg-veo-primary hover:bg-veo-primary/90' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
            {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing) ? <Spinner className="w-5 h-5"/> : <AdStudioIcon className="w-5 h-5"/>}
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
                <h4 className="text-sm font-bold text-red-800 mb-1">Gagal Membuat Iklan</h4>
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

export default StudioIklan;
