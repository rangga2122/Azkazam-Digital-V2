import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AspectRatio, GenerationStatus, LipsyncResult } from '../types';
import { VideoIcon, XMarkIcon } from './icons';
import { generateLipsyncScriptFromImage } from '../Merger video dan Editor Video/services/geminiService';
import { generateImage, generateImageWithReference, generateImageWithBackground, generateImageWithBackgroundAndReference } from '../services/imageSandboxApi';

interface Props {
  onResultsChange: (items: LipsyncResult[]) => void;
}

const toFilePreview = (file: File): Promise<string> => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target?.result as string);
  reader.readAsDataURL(file);
});

// Helper: konversi URL eksternal ke data URL untuk menghindari masalah CORS saat membuat video
const urlToDataUrl = async (url: string): Promise<string> => {
  // Jika sudah data URL, kembalikan langsung
  if (url.startsWith('data:')) return url;
  
  try {
    // Coba fetch melalui proxy
    const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
    const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent('image.png')}`;
    const resp = await fetch(proxied);
    if (!resp.ok) throw new Error('Proxy fetch failed');
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // Fallback: coba fetch langsung
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Direct fetch failed');
      const blob = await resp.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      // Jika semua gagal, kembalikan URL asli
      return url;
    }
  }
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

const narrativeOptions = [
  'Menjual',
  'Profesional',
  'Formal',
  'Gaul',
  'Humoris',
  'Elegan',
  'Story'
];

// Tipe shot untuk komposisi framing
type ShotType = 'close-up' | 'full-body';

const shotDescriptions: Record<ShotType, string> = {
  'close-up': 'tight crop headshot capturing facial detail and expression',
  'full-body': 'full-body framing showcasing posture and product clearly'
};

// Default pose berdasarkan tipe shot (4 pose agar hasil 4 gambar)
const DEFAULT_POSES_BY_SHOT: Record<ShotType, string[]> = {
  'close-up': [
    'tight headshot, eye-level, shallow depth of field',
    'close-up 3/4 face, soft rim light, commercial look',
    'close-up with product near face, crisp focus',
    'dramatic close-up with catchlight, editorial mood'
  ],
  'full-body': [
    'full-body standing pose, balanced lighting, lifestyle vibe',
    'full-body 3/4 angle, professional lighting, soft shadows',
    'full-body presenting product, cinematic framing, clear visibility',
    'full-body lifestyle pose, premium mood, clean background'
  ]
};

// Preset pose yang bisa dipilih pengguna (maks 4)
const posePresetOptions: { label: string; value: string }[] = [
  { label: 'Menunjuk kamera', value: 'pointing finger towards the camera, engaging CTA gesture' },
  { label: 'Pegang produk dekat wajah', value: 'holding the product near the face, friendly smile, clear focus on item' },
  { label: 'Pose duduk santai', value: 'seated pose with relaxed posture, lifestyle commercial vibe' },
  { label: 'Tunjuk produk di tangan', value: 'presenting the product in hand, arm slightly extended towards camera' },
  { label: 'Pose memanggil', value: 'hand near mouth as if calling attention, playful expression' },
  { label: 'Pose menunjuk CTA', value: 'confident pose with clear CTA pointing gesture towards viewer' },
];

const variantHints: string[] = [
  'bagian 1: hook singkat, satu kalimat, maks 10 kata',
  'bagian 2: masalah/need singkat, satu kalimat, maks 10 kata',
  'bagian 3: solusi/manfaat singkat, satu kalimat, maks 10 kata',
  'bagian 4: CTA kuat singkat, satu kalimat, maks 6 kata'
];

const buildFallbackScript = (style: string, theme: string, part: number, prev?: string): string => {
  const s = (style || '').toLowerCase();
  const t = (theme || 'studio').toLowerCase();
  const hook = t.includes('elegan') ? 'Tampil elegan dan percaya diri.' : 'Bikin tampil makin percaya diri.';
  const need = prev ? `Solusinya ada setelah: ${prev}` : 'Butuh yang nyaman dan berkualitas?';
  const manfaat = prev ? `Manfaatnya nyata: ${prev.replace(/\.$/, '')}.` : 'Rasakan kualitas premium di setiap pemakaian.';
  const cta = 'Coba sekarang.';
  const pick = [hook, need, manfaat, cta][Math.max(0, Math.min(3, part - 1))];
  if (s.includes('gaul')) return pick.replace('Rasakan', 'Rasain').replace('yang', 'yg');
  if (s.includes('humoris')) return pick + ' Serius, ini bikin senyum.';
  if (s.includes('formal')) return pick.replace('Bikin', 'Memberi');
  if (s.includes('profesional')) return pick.replace('Bikin', 'Meningkatkan');
  return pick;
};

const Lipsync: React.FC<Props> = ({ onResultsChange }) => {
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [isMergedProduct, setIsMergedProduct] = useState<boolean>(false);

  const [useModelUpload, setUseModelUpload] = useState<boolean>(false);
  type Gender = 'pria' | 'wanita';
  const [gender, setGender] = useState<Gender>('wanita');
  const [modelImage, setModelImage] = useState<File | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);

  const [style, setStyle] = useState<string>('Menjual');
  const [theme, setTheme] = useState<string>('');
  const [shot, setShot] = useState<ShotType>('full-body');
  const [selectedPoses, setSelectedPoses] = useState<string[]>([]);
  const [extraPose, setExtraPose] = useState<string>('');
  const [language, setLanguage] = useState<string>('id');
  const [productDescription, setProductDescription] = useState<string>('');

  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.Idle);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [progressOverall, setProgressOverall] = useState<number>(0);
  const aspect: AspectRatio = AspectRatio.Portrait;
  const abortControllers = useRef<AbortController[]>([]);
  const cancelRef = useRef<boolean>(false);

  const canGenerate = useMemo(() => {
    if (!productImage) return false;
    if (useModelUpload && !modelImage) return false;
    if (!productDescription.trim()) return false;
    return true;
  }, [productImage, useModelUpload, modelImage, productDescription]);


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

  const startOver = () => {
    setProductImage(null);
    setProductPreview(null);
    setUseModelUpload(false);
    setModelImage(null);
    setModelPreview(null);
    setBackgroundImage(null);
    setBackgroundPreview(null);
    setStyle('Menjual');
    setTheme('');
    setSelectedPoses([]);
    setExtraPose('');
    setStatus(GenerationStatus.Idle);
    setProgressMsg('');
    setProgressOverall(0);
    onResultsChange([]);
  };

  const handleStop = () => {
    cancelRef.current = true;
    try { abortControllers.current.forEach(c => { try { c.abort(); } catch {} }); } catch {}
    abortControllers.current = [];
    setProgressMsg('Dihentikan oleh pengguna.');
    setStatus(GenerationStatus.Idle);
  };

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

  const buildInstruction = (): string => {
    const themeDescription = (theme?.trim() || 'clean studio photography, soft light').trim();
    const aspectLabel = aspect === AspectRatio.Portrait ? '9:16' : (aspect === AspectRatio.Square ? '1:1' : '16:9');
    const shotDesc = shotDescriptions[shot];
    let aiModelDescription = '';
    if (!useModelUpload) {
      aiModelDescription = gender === 'wanita'
        ? 'a beautiful young Indonesian woman in her early 20s, warm brown eyes, friendly natural smile'
        : 'a handsome young Indonesian man in his mid-20s, neat black hair, confident and approachable look';
    }
    const bgText = backgroundImage ? 'Place the product subject into the uploaded background environment, matching lighting and perspective for a natural composite. Keep realistic shadows and avoid blur.' : '';
    const base = useModelUpload
      ? `Create a hyper-realistic, 8k resolution, professional product photograph. The overall style and theme MUST BE: "${themeDescription}". The model is the person from the uploaded reference image; their face must be clear, sharp, and not blurred. The product is the item from the input image. The model must be naturally using/wearing the product. ${bgText} Ensure sharp focus and natural lighting. Use shot framing: ${shotDesc}. The final image must have a ${aspectLabel} aspect ratio.`
      : `Create a hyper-realistic, 8k resolution, professional product photograph. The overall style and theme MUST BE: "${themeDescription}". Use a consistent Indonesian AI model character described as: "${aiModelDescription}" interacting with the product naturally. ${bgText} Ensure sharp focus and natural lighting. Use shot framing: ${shotDesc}. The final image must have a ${aspectLabel} aspect ratio.`;
    return base;
  };

  const handleGenerate = async () => {
    cancelRef.current = false;
    abortControllers.current = [];
    if (!canGenerate || !productImage) return;
    onResultsChange([]);
    setStatus(GenerationStatus.Pending);
    setProgressOverall(0);
    setProgressMsg('Menunggu...');

    const token = await getCentralizedToken();
    if (!token) {
      setStatus(GenerationStatus.Failed);
      setProgressMsg('Token VEO3 belum diatur. Minta admin mengisi token di menu Admin (Token VEO3).');
      return;
    }

    const baseInstruction = buildInstruction();
    const acc: LipsyncResult[] = [];
    const selected: string[] = (selectedPoses.length ? [...selectedPoses] : [...DEFAULT_POSES_BY_SHOT[shot]]);
    if (extraPose.trim()) selected.unshift(extraPose.trim());
    // Batasi ke 4 pose agar hasil 4 foto
    const effective = selected.slice(0, 4);
    const PARALLEL = 2;
    const total = effective.length;
    for (let i = 0; i < total; i += PARALLEL) {
      if (cancelRef.current) { setStatus(GenerationStatus.Idle); setProgressMsg('Dihentikan.'); return; }
      const batch = effective.slice(i, i + PARALLEL);
      const promises = batch.map((mod, offset) => {
        const finalInstruction = `${baseInstruction} Composition: ${mod}.`;
        const overallIndex = i + offset;
        const onProg = (p: number, m: string) => {
          const msg = (m || '').toLowerCase();
          const isUpload = msg.includes('unggah') || msg.includes('upload');
          setStatus(isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing);
          setProgressMsg(m || `Memproses (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(total / PARALLEL)})...`);
          const overall = Math.min(100, Math.round((((overallIndex + p / 100)) / total) * 100));
          setProgressOverall(overall);
        };
        const controller = new AbortController();
        abortControllers.current.push(controller);
        const genImagePromise = backgroundImage
          ? (useModelUpload && modelImage
              ? generateImageWithBackgroundAndReference(finalInstruction, aspect, productImage, modelImage, backgroundImage, token, onProg, controller.signal)
              : generateImageWithBackground(finalInstruction, aspect, productImage, backgroundImage, token, onProg, controller.signal))
          : (useModelUpload && modelImage
              ? generateImageWithReference(finalInstruction, aspect, productImage, modelImage, token, onProg, controller.signal)
              : generateImage(finalInstruction, aspect, productImage, token, onProg, controller.signal));
        return genImagePromise
          .then(async (imageUrl) => {
            // Konversi URL eksternal ke data URL untuk menghindari masalah CORS
            const dataUrl = await urlToDataUrl(imageUrl);
            const result: LipsyncResult = { imageUrl: dataUrl, script: '' };
            acc.push(result);
            onResultsChange([...acc]);
          })
          .catch((err) => {
            console.warn('Generate gambar lipsync gagal', err);
          });
      });
      try {
        await Promise.all(promises);
      } catch (err: any) {
        console.warn('Batch generate lipsync failed', err);
      }
    }

    // Setelah semua gambar selesai, susun skrip secara berurutan agar nyambung dari 1 sampai 4
    const brevity = 'narasi sangat pendek, tepat 1 kalimat, cocok ~2 detik';
    for (let part = 1; part <= acc.length; part++) {
      if (cancelRef.current) { setStatus(GenerationStatus.Idle); setProgressMsg('Dihentikan.'); return; }
      const variant = variantHints[(part - 1) % variantHints.length];
      const prevLine = part > 1 ? (acc[part - 2]?.script || '') : '';
      const desc = productDescription.trim();
      const prompt = `[SEQUENCE_4][PART=${part}] ${variant}; ${theme.trim() || 'studio'}; ${brevity}\nDESKRIPSI PRODUK (WAJIB):\n${desc}` +
        (prevLine ? `\nLANJUTKAN: "${prevLine}"` : '');
      setStatus(GenerationStatus.Processing);
      setProgressMsg(`Menyusun skrip scene ${part}/${acc.length}...`);
      try {
        const text = await generateLipsyncScriptFromImage(
          productImage,
          style,
          prompt,
          useModelUpload ? modelImage || undefined : undefined,
          (message) => setProgressMsg(message),
          language
        );
        acc[part - 1].script = text || '';
        onResultsChange([...acc]);
      } catch (err) {
        console.warn('Generate skrip lipsync gagal', err);
        acc[part - 1].script = buildFallbackScript(style, theme.trim(), part, prevLine);
        onResultsChange([...acc]);
      }
    }

    if (acc.length > 0) {
      setStatus(GenerationStatus.Completed);
      setProgressMsg('Selesai!');
      setProgressOverall(100);
    } else {
      setStatus(GenerationStatus.Failed);
      setProgressMsg('Gagal generate. Coba lagi, pastikan token sudah diisi.');
      setProgressOverall(0);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-4 md:p-6 flex items-center gap-3">
        <VideoIcon className="w-6 h-6" />
        <div>
          <h2 className="text-lg md:text-xl font-black">AI Lipsync Script</h2>
          <p className="text-sm text-slate-500">Buat skrip voiceover singkat dari gambar produk.</p>
        </div>
      </div>

      {/* Form */}
      <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-6">
        {/* Product Image */}
        <div className="space-y-2">
          {label('Gambar Produk (Wajib)')}
          {!productPreview ? (
            <div className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer hover:border-veo-primary hover:bg-veo-primary/5"
                 onClick={() => document.getElementById('lipsync-product-upload')?.click()}>
              <input type="file" id="lipsync-product-upload" accept="image/*" multiple className="hidden"
                     onChange={(e) => e.target.files && handleProductSelectMultiple(e.target.files)} />
              <p className="text-slate-500">Klik untuk mengunggah gambar produk</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <img src={productPreview} alt="Produk" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
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

        {/* Model Options */}
        <div className="space-y-3">
          {label('Model (Opsional)')}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setUseModelUpload(false)}
                    className={`px-3 py-2 rounded-lg border text-sm font-bold ${!useModelUpload ? 'bg-white border-veo-primary text-veo-primary' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>
                AI Model
              </span>
            </button>
            <button type="button" onClick={() => setUseModelUpload(true)}
                    className={`px-3 py-2 rounded-lg border text-sm font-bold ${useModelUpload ? 'bg-white border-veo-primary text-veo-primary' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/></svg>
                Upload Model
              </span>
            </button>
          </div>
          {!useModelUpload && (
            <div className="space-y-2">
              {label('Gender Model')}
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
          )}
          {useModelUpload && (
            <div className="space-y-2">
              {!modelPreview ? (
                <div className="border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer hover:border-veo-primary hover:bg-veo-primary/5"
                     onClick={() => document.getElementById('lipsync-model-upload')?.click()}>
                  <input type="file" id="lipsync-model-upload" accept="image/*" className="hidden"
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
          <div className="space-y-2">
            {label('Background (Opsional)')}
            {!backgroundPreview ? (
              <div className="border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer hover:border-veo-primary hover:bg-veo-primary/5"
                   onClick={() => document.getElementById('lipsync-background-upload')?.click()}>
                <input type="file" id="lipsync-background-upload" accept="image/*" className="hidden"
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
        </div>

        {/* Tipe Shot */}
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
          <p className="text-xs text-slate-500">Pilih close-up untuk wajah/detail, full-body agar produk besar terlihat utuh.</p>
        </div>

        {/* Style & Theme */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            {label('Gaya Narasi')}
            <select value={style} onChange={(e) => setStyle(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900">
              {narrativeOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {label('Bahasa')}
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900">
              <option value="id">Indonesia</option>
              <option value="en">Inggris</option>
              <option value="ms">Malaysia</option>
              <option value="es">Spanyol</option>
              <option value="fr">Prancis</option>
              <option value="ar">Arab</option>
              <option value="hi">Hindi</option>
              <option value="ja">Jepang</option>
              <option value="ko">Korea</option>
              <option value="zh">Mandarin</option>
            </select>
          </div>
          <div className="space-y-2">
            {label('Tema Visual (Opsional)')}
            <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)}
                   className="w-full bg-white border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900"
                   placeholder="Contoh: elegan minimalis, nuansa premium" />
          </div>
        </div>

        <div className="space-y-2">
          {label('Deskripsi Produk (Wajib)')}
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900"
            placeholder="Contoh: Tas ransel anti air dengan 3 kompartemen; bahan polyester premium"
            rows={3}
            required
          />
          <p className="text-xs text-slate-500">Kolom ini wajib diisi untuk menghasilkan skrip yang relevan</p>
        </div>

        {/* Action */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleGenerate} disabled={!canGenerate || status===GenerationStatus.Uploading || status===GenerationStatus.Processing || status===GenerationStatus.Pending}
                  className={`flex-1 py-4 rounded-2xl font-black uppercase tracking-widest text-base flex items-center justify-center gap-3 transition-all text-white shadow-lg ${canGenerate && status!==GenerationStatus.Uploading && status!==GenerationStatus.Processing && status!==GenerationStatus.Pending ? 'bg-veo-primary hover:bg-veo-primary/90' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
            {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing || status===GenerationStatus.Pending) ? <Spinner className="w-5 h-5"/> : <VideoIcon className="w-5 h-5"/>}
            {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing || status===GenerationStatus.Pending) ? `Memproses... ${progressOverall}%` : 'Generate Foto + Skrip'}
          </button>
          {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing || status===GenerationStatus.Pending) && (
            <button type="button" onClick={handleStop}
                    className="px-3 py-2 rounded-full bg-red-600 text-white border border-red-700/40 hover:bg-red-700 shadow-sm font-bold text-xs" title="Hentikan proses">
              Stop
            </button>
          )}
        </div>
        {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing || status===GenerationStatus.Pending) && (
          <p className="text-xs text-slate-500">{progressMsg}</p>
        )}

        {/* Preset Pose & Tambahan */}
        <div className="space-y-2">
          {label('Preset Pose (Opsional)')}
          <div className="flex flex-wrap gap-2">
            {posePresetOptions.map(opt => {
              const active = selectedPoses.includes(opt.value);
              return (
                <button key={opt.value} type="button" onClick={() => {
                  setSelectedPoses(prev => prev.includes(opt.value)
                    ? prev.filter(v => v !== opt.value)
                    : (prev.length < 4 ? [...prev, opt.value] : prev));
                }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${active ? 'bg-white border-veo-primary text-veo-primary' : 'bg-slate-100 border-slate-200 text-slate-600'}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">Pilih maks 4 pose. Jika tidak dipilih, sistem memakai default.</p>
        </div>
        <div className="space-y-2">
          {label('Catatan Pose Tambahan (Opsional)')}
          <input type="text" value={extraPose} onChange={(e) => setExtraPose(e.target.value)}
                 className="w-full bg-white border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900"
                 placeholder="Contoh: pose menunjuk kamera, amanua" />
        </div>

        {status===GenerationStatus.Completed && (
          <div className="flex items-center justify-between mt-3">
            <button type="button" onClick={startOver}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100">Mulai Lagi</button>
            <span className="text-xs text-green-600 font-semibold">Selesai!</span>
          </div>
        )}
      </div>

      {/* Hasil ditampilkan di kolom kanan (App.tsx) */}
    </div>
  );
};

export default Lipsync;
