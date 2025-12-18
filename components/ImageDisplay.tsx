import React from 'react';
import { AspectRatio, GenerationStatus } from '../types';
import { DownloadIcon } from './icons';

interface Props {
  status: GenerationStatus;
  progress: number;
  message: string;
  aspectRatio: AspectRatio;
  imageUrl?: string;
  error?: string;
}

const ImageDisplay: React.FC<Props> = ({ status, progress, message, aspectRatio, imageUrl, error }) => {
  const isPortrait = aspectRatio === AspectRatio.Portrait;

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!imageUrl) return;
    try {
      // Directly handle data URLs
      if (imageUrl.startsWith('data:')) {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = imageUrl;
        a.download = `generated-image-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
        return;
      }

      const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
      const filename = `generated-image-${Date.now()}.jpg`;
      const proxied = `${downloadBase}?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(filename)}`;
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = proxied;
      a.download = filename;
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
    } catch (err) {
      try {
        const resp = await fetch(imageUrl);
        if (!resp.ok) throw new Error('Gagal mengunduh gambar');
        const blob = await resp.blob();
        const local = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = local;
        a.download = `generated-image-${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(local); if (a.parentNode) a.parentNode.removeChild(a); }, 100);
      } catch {}
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className={`glass-panel rounded-3xl overflow-hidden relative flex flex-col
        ${isPortrait ? 'max-w-sm mx-auto w-full aspect-[9/16]' : 'w-full aspect-video'}
        min-h-[300px] sm:min-h-[400px]
        transition-all duration-500 bg-slate-100/50 border-slate-200 shadow-sm`}>
        <div className="flex-1 relative flex items-center justify-center p-6">

          {status === GenerationStatus.Idle && (
            <div className="text-center space-y-4 md:space-y-6 max-w-lg px-4 animate-fadeIn">
              <div className="w-16 h-16 md:w-24 md:h-24 mx-auto bg-white rounded-full flex items-center justify-center border-4 border-dashed border-slate-200">
                {/* Simple photo placeholder */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 md:w-10 md:h-10 text-slate-300">
                  <path d="M19.5 6h-15A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h15a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0019.5 6zM7.5 9a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-3 7.5l3.75-3.75 2.25 2.25 3-3 3.75 3.75h-12.75z" />
                </svg>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Siap Membuat Gambar</h3>
              <p className="text-sm md:text-base text-slate-500 leading-relaxed">Isi instruksi di panel kiri. Unggah gambar subjek (opsional).</p>
            </div>
          )}

          {(status === GenerationStatus.Uploading || status === GenerationStatus.Pending || status === GenerationStatus.Processing) && (
            <div className="text-center space-y-6 w-full max-w-md px-4 animate-fadeIn">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-8 border-slate-200/50"></div>
                <div className="absolute inset-0 rounded-full border-t-8 border-veo-primary animate-spin"></div>
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-black text-slate-800">Sedang Membuat Gambar</h3>
                <p className="text-slate-500 mt-3 h-6 text-sm md:text-base font-medium animate-pulse">{message}</p>
              </div>
              <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden p-1">
                <div className="h-full bg-veo-primary rounded-full transition-all duration-1000 ease-out shadow-sm" style={{ width: `${Math.max(5, progress)}%` }}></div>
              </div>
            </div>
          )}

          {status === GenerationStatus.Failed && (
            <div className="text-center space-y-4 max-w-lg px-4 animate-fadeIn text-red-500">
              <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center border-4 border-red-100">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-red-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-black text-red-600">Gagal Membuat Gambar</h3>
              <p className="text-sm text-red-700 bg-red-50 py-3 px-4 rounded-xl border border-red-100 leading-relaxed break-words">{error || 'Terjadi kesalahan.'}</p>
            </div>
          )}

          {status === GenerationStatus.Completed && imageUrl && (
            <div className="absolute inset-0 w-full h-full bg-black animate-fadeIn group flex items-center justify-center">
              <img src={imageUrl} alt="Generated" className="max-h-full max-w-full object-contain" />
              <div className="absolute top-4 right-4 z-10 opacity-100 transition-opacity duration-300">
                <button
                  onClick={handleDownload}
                  className="bg-black/50 hover:bg-veo-primary/90 backdrop-blur-md text-white p-3 rounded-full shadow-lg border border-white/10 transition-all transform active:scale-95 flex items-center justify-center"
                  title="Download Gambar"
                >
                  <DownloadIcon className="w-6 h-6" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageDisplay;
