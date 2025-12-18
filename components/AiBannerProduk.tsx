import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AspectRatio, GenerationStatus } from '../types';
import { AdStudioIcon, XMarkIcon, UploadIcon } from './icons';
import { generateImage, generateImageWithReference } from '../services/imageSandboxApi';

interface Props {
  onResultsChange: (urls: string[]) => void;
}

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
  } catch (e1) {
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

const designOptions = [
  'Manual',
  'Random',
  'Modern & Elegan',
  'Minimalis Dominan Putih',
  'Mewah (Gelap & Emas)',
  'Cerah & Meriah',
  'Produk Teknologi / Techy',
  'Retro / Klasik 80-an',
  'Futuristik & Neon',
  'Organik / Alam',
  'Fesyen / Gaya Hidup',
  'Gradien Lembut',
  'Industri / Urban',
  'Pemandangan Cyberpunk',
  'Gaya Memphis Ceria',
  'Tampilan Sinematik Dramatis',
  'Geometris Low Poly',
  'Glamor Art Deco',
  'Tekstur Grunge',
  'Suasana Tropis',
  'Alam Mimpi Surealis',
  'Produk di Podium Studio',
  'Gaya Editorial Majalah',
  'Ledakan Warna Cair',
  'Fokus Makro pada Detail',
  'Komposisi Flat Lay',
  'Efek Holografik',
  'Pencahayaan Dramatis'
];

const toFilePreview = (file: File): Promise<string> => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target?.result as string);
  reader.readAsDataURL(file);
});

const AiBannerProduk: React.FC<Props> = ({ onResultsChange }) => {
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [productPreviews, setProductPreviews] = useState<string[]>([]);
  const productInputRef = useRef<HTMLInputElement | null>(null);

  const [modelMode, setModelMode] = useState<'none'|'custom'|'Indonesian woman'|'Indonesian man'|'woman wearing a hijab'|'Caucasian woman'|'Caucasian man'>('none');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  const [designStyle, setDesignStyle] = useState<string>('Modern & Elegan');
  const [manualStyle, setManualStyle] = useState<string>('');
  const [headline, setHeadline] = useState<string>('PROMO PRODUK SPESIAL');
  const [details, setDetails] = useState<string[]>(['Kualitas Premium','Stok Terbatas','Pengiriman Cepat','Garansi Resmi']);
  const [contact, setContact] = useState<string>('WA: 0812-3456-7890');
  const [modelPrompt, setModelPrompt] = useState<string>('');
  const [aspect, setAspect] = useState<AspectRatio>(AspectRatio.Square);
  const [multiplier, setMultiplier] = useState<number>(1);

  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.Idle);
  const [progressOverall, setProgressOverall] = useState<number>(0);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const abortControllers = useRef<AbortController[]>([]);
  const cancelRef = useRef<boolean>(false);

  const canGenerate = useMemo(() => productFiles.length > 0, [productFiles.length]);

  const handleProductFiles = useCallback(async (files: FileList) => {
    const imgs: File[] = [];
    const previews: string[] = [];
    for (let i=0;i<files.length;i++) {
      const f = files[i];
      if (!f.type.startsWith('image/')) continue;
      imgs.push(f);
      const url = await toFilePreview(f);
      previews.push(url);
    }
    setProductFiles(imgs);
    setProductPreviews(previews);
  }, []);

  const handleModelSelect = useCallback(async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setModelFile(file);
    const url = await toFilePreview(file);
    setModelPreview(url);
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

  const buildInstruction = (style: string): string => {
    const styleText = style === 'Manual' ? manualStyle.trim() : style;
    const aspectLabel = aspect === AspectRatio.Portrait ? '9:16' : (aspect === AspectRatio.Square ? '1:1' : '16:9');
    const lines = details.filter((d) => d.trim()).map((d) => `• ${d.trim()}`).join('\n');
    let modelPart = '';
    if (modelMode === 'custom' && modelFile) {
      modelPart = `Integrate the provided human model image exactly. Pose: ${modelPrompt || 'natural pose near product'}. The model must be smaller than the product and must not obscure the headline or important text.`;
    } else if (modelMode !== 'none') {
      modelPart = `Include a photorealistic ${modelMode}. Pose: ${modelPrompt || 'interacting with the product'}. Keep the model smaller than the product and do not obscure important text.`;
    }
    return `Design a high-resolution promotional banner.
Style: "${styleText}".
Aspect Ratio must be ${aspectLabel}.
Tasks:
1) Integrate the uploaded product image.
2) Write headline exactly: "${headline}".
3) Write contact at bottom: "${contact}".
4) Render these bullet points near the product:
${lines}
${modelPart}
Requirements: Clean composition, premium look, legible typography, and professional layout.`;
  };

  const compositionVariants = [
    'balanced center composition, soft studio lighting',
    'diagonal layout, dynamic lighting, subtle shadows',
    'minimalist layout, ample whitespace, crisp typography',
    'color accent background, gradient glow, premium vibe',
    'editorial layout, grid alignment, strong hierarchy',
    'cinematic lighting, depth and contrast, product hero shot'
  ];

  const startOver = () => {
    setProductFiles([]);
    setProductPreviews([]);
    setModelMode('none');
    setModelFile(null);
    setModelPreview(null);
    setDesignStyle('Modern & Elegan');
    setManualStyle('');
    setHeadline('PROMO PRODUK SPESIAL');
    setDetails(['Kualitas Premium','Stok Terbatas','Pengiriman Cepat','Garansi Resmi']);
    setContact('WA: 0812-3456-7890');
    setModelPrompt('');
    setAspect(AspectRatio.Square);
    setMultiplier(1);
    setStatus(GenerationStatus.Idle);
    setProgressOverall(0);
    setProgressMsg('');
    onResultsChange([]);
  };

  const handleStop = () => {
    cancelRef.current = true;
    try { abortControllers.current.forEach(c => { try { c.abort(); } catch {} }); } catch {}
    abortControllers.current = [];
    setProgressMsg('Dihentikan oleh pengguna.');
    setStatus(GenerationStatus.Idle);
  };

  const handleGenerate = async () => {
    cancelRef.current = false;
    abortControllers.current = [];
    if (productFiles.length === 0) {
      setStatus(GenerationStatus.Failed);
      setProgressMsg('Harap unggah gambar produk terlebih dahulu.');
      return;
    }
    if (designStyle === 'Manual' && !manualStyle.trim()) {
      setStatus(GenerationStatus.Failed);
      setProgressMsg('Prompt gaya kosong. Isi gaya desain terlebih dahulu.');
      return;
    }
    if (modelMode === 'custom' && !modelFile) {
      setStatus(GenerationStatus.Failed);
      setProgressMsg('Mode Unggah Model aktif: harap unggah gambar model.');
      return;
    }

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

    const acc: string[] = [];
    const styleForBatch = designStyle === 'Random'
      ? ''
      : designStyle;
    const totalBatches = productFiles.length * multiplier * compositionVariants.length;
    let done = 0;

    for (const file of productFiles) {
      for (let m=0; m<multiplier; m++) {
        if (cancelRef.current) { setStatus(GenerationStatus.Idle); setProgressMsg('Dihentikan.'); return; }
        const base = buildInstruction(styleForBatch || designOptions[Math.max(2, Math.floor(Math.random()*designOptions.length))]);
        const batchPromises = compositionVariants.map((variant) => {
          const instruction = `${base} Composition: ${variant}.`;
          const controller = new AbortController();
          abortControllers.current.push(controller);
          return modelMode === 'custom' && modelFile
            ? generateImageWithReference(instruction, aspect, file, modelFile, token, (p, msg) => {
                const isUpload = (msg||'').toLowerCase().includes('unggah') || (msg||'').toLowerCase().includes('upload');
                setStatus(isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing);
                setProgressMsg(msg || 'Memproses...');
                const overall = Math.min(100, Math.round(((done + p/100) / totalBatches) * 100));
                setProgressOverall(overall);
              }, controller.signal)
            : generateImage(instruction, aspect, file, token, (p, msg) => {
                const isUpload = (msg||'').toLowerCase().includes('unggah') || (msg||'').toLowerCase().includes('upload');
                setStatus(isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing);
                setProgressMsg(msg || 'Memproses...');
                const overall = Math.min(100, Math.round(((done + p/100) / totalBatches) * 100));
                setProgressOverall(overall);
              }, controller.signal);
        });
        try {
          const urls = await Promise.all(batchPromises);
          acc.push(...urls);
          onResultsChange([...acc]);
          done += urls.length;
        } catch (err: any) {
          if (cancelRef.current) {
            setStatus(GenerationStatus.Idle);
            setProgressMsg('Dihentikan.');
            return;
          }
          setStatus(GenerationStatus.Failed);
          setProgressMsg(err?.message || 'Gagal menghasilkan banner.');
          return;
        }
      }
    }

    setStatus(GenerationStatus.Completed);
    setProgressMsg('Selesai!');
    setProgressOverall(100);
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-3xl p-4 md:p-6 flex items-center gap-3">
        <AdStudioIcon className="w-6 h-6" />
        <div>
          <h2 className="text-lg md:text-xl font-black">AI Banner Produk</h2>
          <p className="text-sm text-slate-500">Buat banner promosi profesional dari gambar produk.</p>
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-6">
        <input
          ref={productInputRef}
          id="banner-product-upload"
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleProductFiles(e.target.files)}
        />
        <div className="space-y-2">
          {!productPreviews.length ? (
            <label htmlFor="banner-product-upload" className="group flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-3xl p-8 md:p-10 min-h-[180px] md:min-h-[220px] bg-white cursor-pointer shadow-sm border-veo-primary/20 hover:border-veo-primary/40 hover:bg-veo-primary/5 hover:shadow-md transition-all">
              <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-veo-primary/10 text-veo-primary border border-veo-primary/20">
                <UploadIcon className="w-8 h-8" />
              </span>
              <p className="text-sm md:text-base font-bold text-slate-700">Klik untuk unggah gambar produk</p>
              <p className="text-xs md:text-sm text-slate-500">Anda dapat memilih beberapa gambar sekaligus</p>
            </label>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-3">
                {productPreviews.map((src, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <img src={src} alt="Produk" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label htmlFor="banner-product-upload" className="px-4 py-2.5 rounded-xl bg-veo-primary text-white font-bold text-sm cursor-pointer hover:bg-veo-primary/90 shadow-sm">Tambah Gambar</label>
                <button type="button" onClick={() => { setProductFiles([]); setProductPreviews([]); }} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-red-600 hover:bg-red-50">Hapus Semua</button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Gaya Desain</label>
            <select value={designStyle} onChange={(e) => setDesignStyle(e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900">
              {designOptions.map(o => (<option key={o} value={o}>{o}</option>))}
            </select>
            {designStyle === 'Manual' && (
              <textarea value={manualStyle} onChange={e => setManualStyle(e.target.value)} rows={3} placeholder="Contoh: Poster minimalis gradasi biru lembut, tipografi tebal, layout editorial..." className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-900" />
            )}
          </div>
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Rasio Aspek</label>
            <div className="flex bg-slate-100 p-1.5 rounded-xl">
              {[AspectRatio.Square, AspectRatio.Portrait, AspectRatio.Landscape].map(ar => (
                <button key={ar} type="button" onClick={() => setAspect(ar)} className={`flex-1 py-2 rounded-lg text-sm font-bold ${aspect===ar?'bg-white text-veo-primary shadow-sm':'text-slate-600'}`}>{ar}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Teks Promosi</label>
          <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Headline Utama" className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-900" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {details.map((d, i) => (
              <input key={i} type="text" value={d} onChange={e => setDetails(details.map((v, idx) => idx===i? e.target.value : v))} placeholder={`Poin Keunggulan ${i+1}`} className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-900" />
            ))}
          </div>
          <input type="text" value={contact} onChange={e => setContact(e.target.value)} placeholder="Kontak Utama (WA/Telp)" className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-900" />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Model (Opsional)</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(['none','custom','Indonesian woman','Indonesian man','woman wearing a hijab','Caucasian woman','Caucasian man'] as const).map(m => (
              <button key={m} type="button" onClick={() => setModelMode(m)} className={`px-3 py-2 rounded-lg border text-sm font-bold ${modelMode===m ? 'bg-white border-veo-primary text-veo-primary' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>{m}</button>
            ))}
          </div>
          {modelMode === 'custom' && (
            <div className="space-y-2">
              {!modelPreview ? (
                <div className="border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer hover:border-veo-primary hover:bg-veo-primary/5" onClick={() => modelInputRef.current?.click()}>
                  <input ref={modelInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleModelSelect(e.target.files[0])} />
                  <p className="text-slate-500">Unggah gambar model</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <img src={modelPreview} alt="Model" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-slate-700">Gambar Model</p>
                  </div>
                  <button type="button" onClick={() => { setModelFile(null); setModelPreview(null); }} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              )}
              <input type="text" value={modelPrompt} onChange={e => setModelPrompt(e.target.value)} placeholder="Jelaskan pose/ekspresi model (cth: tersenyum, memegang produk)..." className="w-full bg-white border border-slate-300 rounded-lg p-3 text-slate-900" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4 border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Jumlah Batch (x6):</span>
            <input type="number" min={1} max={10} value={multiplier} onChange={e => setMultiplier(Math.max(1, Math.min(10, parseInt(e.target.value||'1',10))))} className="w-20 bg-white border border-slate-300 rounded-lg p-2 text-center" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleGenerate} disabled={!canGenerate || status===GenerationStatus.Uploading || status===GenerationStatus.Processing || status===GenerationStatus.Pending} className={`px-4 py-2 rounded-2xl font-bold text-white transition-all ${!canGenerate || status!==GenerationStatus.Idle ? 'bg-slate-400' : 'bg-veo-primary hover:bg-veo-primary/90'}`}>Buat Poster!</button>
            {(status===GenerationStatus.Uploading || status===GenerationStatus.Processing || status===GenerationStatus.Pending) && (
              <button type="button" onClick={handleStop} className="px-3 py-2 rounded-full bg-red-600 text-white border border-red-700/40 hover:bg-red-700 shadow-sm font-bold text-xs" title="Hentikan proses">
                Stop
              </button>
            )}
            <button type="button" onClick={startOver} className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700">Reset</button>
          </div>
        </div>

        <div className="space-y-2">
          {status !== GenerationStatus.Idle && (
            <div className="p-3 rounded-xl border bg-white">
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-200/40"></div>
                  <div className="absolute inset-0 rounded-full border-t-4 border-veo-primary animate-spin"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-700">{progressMsg || (status===GenerationStatus.Completed ? 'Selesai!' : status===GenerationStatus.Failed ? 'Gagal' : 'Memproses...')}</p>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-veo-primary rounded-full transition-all" style={{ width: `${Math.max(5, progressOverall)}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiBannerProduk;
