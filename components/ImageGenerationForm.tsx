import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AspectRatio, GenerationStatus } from '../types';
import { UploadIcon, XMarkIcon, SparklesIcon } from './icons';

interface Props {
  status: GenerationStatus;
  disabled?: boolean;
  onSubmit: (payload: { instruction: string; aspectRatio: AspectRatio; subjectImage?: File | null }) => void;
  onStop?: () => void;
}

const ImageGenerationForm: React.FC<Props> = ({ status, disabled = false, onSubmit, onStop }) => {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.Portrait);
  const [instruction, setInstruction] = useState('');
  const [subjectImage, setSubjectImage] = useState<File | null>(null);
  const [subjectPreview, setSubjectPreview] = useState<string | null>(null);
  const [subjectImages, setSubjectImages] = useState<File[]>([]);
  const [isMergedSubject, setIsMergedSubject] = useState<boolean>(false);

  const isBusy =
    status === GenerationStatus.Uploading ||
    status === GenerationStatus.Pending ||
    status === GenerationStatus.Processing;
  const isFormDisabled = disabled || isBusy;

  const toFilePreview = (file: File): Promise<string> => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.readAsDataURL(file);
  });

  const handleImageSelect = useCallback(async (file: File) => {
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
    const file = new File([blob], `gabungan-subjek.png`, { type: 'image/png' });
    const preview = await toFilePreview(file);
    return { file, preview };
  };

  const handleImageSelectMultiple = useCallback(async (list: FileList) => {
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
    const merged = await mergeImagesContain(next, aspectRatio);
    setSubjectImage(merged.file);
    setSubjectPreview(merged.preview);
    setIsMergedSubject(true);
  }, [aspectRatio, subjectImages]);

  const [isDragging, setIsDragging] = useState(false);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (!isFormDisabled && e.dataTransfer.files && e.dataTransfer.files.length) {
      handleImageSelectMultiple(e.dataTransfer.files);
    }
  }, [handleImageSelectMultiple, isFormDisabled]);

  const subjectInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;
    if (!instruction.trim()) return;
    onSubmit({ instruction, aspectRatio, subjectImage });
  };

  useEffect(() => {
    const remerge = async () => {
      if (subjectImages.length > 1) {
        const merged = await mergeImagesContain(subjectImages, aspectRatio);
        setSubjectImage(merged.file);
        setSubjectPreview(merged.preview);
        setIsMergedSubject(true);
      }
    };
    remerge();
  }, [aspectRatio, subjectImages]);

  return (
    <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-6 md:p-8 space-y-8 h-fit">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label htmlFor="instruction" className="text-base font-bold text-slate-700 uppercase tracking-wider">Instruksi (Deskripsi)</label>
          <span className={`text-sm font-medium ${instruction.length > 4000 ? 'text-veo-primary' : 'text-slate-400'}`}>{instruction.length}/4000</span>
        </div>
        <textarea id="instruction" value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={isFormDisabled} maxLength={4000} rows={5}
          className={`input-base resize-none h-40 text-base leading-relaxed ${isFormDisabled ? 'bg-slate-50 cursor-not-allowed opacity-75' : ''}`} placeholder="Contoh: buatkan model memegang produk saya untuk iklan." />
      </div>

      <div className="space-y-3">
        <span className="text-base font-bold text-slate-700 uppercase tracking-wider block">Gambar Subjek <span className="text-slate-400 font-normal normal-case">(Opsional)</span></span>
        {!subjectPreview ? (
          <div onDragOver={(e) => { if(!isFormDisabled) { e.preventDefault(); setIsDragging(true); } }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}
               onClick={() => !isFormDisabled && subjectInputRef.current?.click()}
               className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all group ${isFormDisabled ? 'cursor-not-allowed opacity-60 bg-slate-50 border-slate-200' : 'cursor-pointer'} ${isDragging ? 'border-veo-primary bg-veo-primary/5' : (isFormDisabled ? '' : 'border-slate-300 hover:border-veo-primary hover:bg-slate-50')}`}>
            <input ref={subjectInputRef} type="file" id="imagegen-subject-upload" accept="image/*" multiple className="hidden" disabled={isFormDisabled} onChange={(e) => e.target.files && handleImageSelectMultiple(e.target.files)} />
            <div className="flex flex-col items-center gap-3 text-slate-500 group-hover:text-veo-primary">
              <UploadIcon className="w-10 h-10" />
              <p className="text-base font-medium">Klik atau geser gambar ke sini (opsional)</p>
            </div>
          </div>
        ) : (
          <div className={`relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-3 flex items-center gap-4 ${isBusy ? 'opacity-75' : ''}`}>
            <img src={subjectPreview} alt="Subject" className="w-20 h-20 object-cover rounded-xl border border-slate-200" />
            <div className="flex-1 min-w-0"><p className="text-base font-medium truncate text-slate-700">{isMergedSubject ? 'gabungan-subjek.png' : (subjectImage?.name)}</p><p className="text-sm text-veo-primary font-medium">{isMergedSubject ? 'Gabungan Subjek' : 'Gambar Subjek'}</p></div>
            <button type="button" disabled={isFormDisabled} onClick={() => { setSubjectImage(null); setSubjectPreview(null); setSubjectImages([]); setIsMergedSubject(false); }} className={`p-3 bg-white border border-slate-200 rounded-xl transition-all ${isFormDisabled ? 'cursor-not-allowed text-slate-300' : 'hover:bg-red-50 text-slate-400 hover:text-red-500'}`}><XMarkIcon className="w-6 h-6" /></button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Rasio Aspek</span>
        <div className="flex bg-slate-100 p-1.5 rounded-xl">
          {(Object.values(AspectRatio) as AspectRatio[]).map((r) => (
            <button key={r} type="button" disabled={isFormDisabled} onClick={() => setAspectRatio(r)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${aspectRatio === r ? 'bg-white text-veo-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'} ${isFormDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>{r}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isFormDisabled || !instruction.trim()}
          className={`flex-1 py-5 rounded-2xl font-black uppercase tracking-widest text-lg flex items-center justify-center gap-3 transition-all duration-300 text-white shadow-lg
            ${isFormDisabled || !instruction.trim()
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
              : 'bg-veo-primary hover:bg-veo-primary/90 hover:shadow-veo-primary/30 hover:scale-[1.01] active:scale-[0.99]'
            }
          `}
        >
          {!isBusy && <SparklesIcon className="w-6 h-6" />}
          {isBusy ? 'Sedang Memproses...' : 'Generate Gambar'}
        </button>
        {isBusy && (
          <button
            type="button"
            onClick={() => onStop && onStop()}
            className="px-3 py-2 rounded-full bg-red-600 text-white border border-red-700/40 hover:bg-red-700 shadow-sm font-bold text-xs"
            title="Hentikan proses"
          >
            Stop
          </button>
        )}
      </div>
    </form>
  );
};

export default ImageGenerationForm;
