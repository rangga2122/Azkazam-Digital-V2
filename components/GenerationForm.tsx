import React, { useCallback, useState } from 'react';
import { AspectRatio, GenerateOptions, GenerationStatus, Resolution } from '../types';
import { UploadIcon, XMarkIcon, SparklesIcon } from './icons';

interface Props {
    status: GenerationStatus;
    onSubmit: (optionsList: GenerateOptions[]) => void;
    disabled?: boolean;
    onStop?: () => void;
}

type Mode = 'single' | 'bulk';

interface BulkItem {
    id: string;
    prompt: string;
    image: File | null;
    imagePreview: string | null;
}

const GenerationForm: React.FC<Props> = ({ status, onSubmit, disabled = false, onStop }) => {
    const [mode, setMode] = useState<Mode>('single');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.Landscape);
    const [resolution, setResolution] = useState<Resolution>(Resolution.FHD);

    // Single Mode State
    const [prompt, setPrompt] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Bulk Mode State
    const [bulkItems, setBulkItems] = useState<BulkItem[]>([
        { id: '1', prompt: '', image: null, imagePreview: null }
    ]);

    // Menentukan apakah proses sedang berjalan berdasarkan status, dan disabled untuk kontrol form
    const isBusy =
                   status === GenerationStatus.Uploading ||
                   status === GenerationStatus.Pending ||
                   status === GenerationStatus.Processing;
    const isFormDisabled = disabled || isBusy;

    const handleImageSelect = useCallback((file: File, isBulk: boolean = false, bulkId?: string) => {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (isBulk && bulkId) {
                    setBulkItems(prev => prev.map(item =>
                        item.id === bulkId ? { ...item, image: file, imagePreview: e.target?.result as string } : item
                    ));
                } else {
                    setImage(file);
                    setImagePreview(e.target?.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    }, []);

    // Drag and Drop for Single Mode
    const [isDragging, setIsDragging] = useState(false);
    const onDropSingle = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files?.[0] && !isBusy) handleImageSelect(e.dataTransfer.files[0]);
    }, [handleImageSelect, isBusy]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isBusy) return;

        if (mode === 'single') {
            if (!prompt.trim()) return;
            onSubmit([{ prompt, aspectRatio, resolution, image }]);
            // Data prompt dan image TIDAK dihapus agar bisa regenerate.
            // setPrompt(''); setImage(null); setImagePreview(null);
        } else {
            const validItems = bulkItems.filter(item => item.prompt.trim());
            if (validItems.length === 0) return;

            const optionsList: GenerateOptions[] = validItems.map(item => ({
                prompt: item.prompt,
                aspectRatio,
                resolution,
                image: item.image
            }));
            onSubmit(optionsList);
            setBulkItems([{ id: Math.random().toString(), prompt: '', image: null, imagePreview: null }]);
        }
    };

    // Bulk Helper Functions
    const addBulkRow = () => {
        setBulkItems(prev => [...prev, { id: Math.random().toString(), prompt: '', image: null, imagePreview: null }]);
    };
    const removeBulkRow = (id: string) => {
        if (bulkItems.length > 1) {
             setBulkItems(prev => prev.filter(item => item.id !== id));
        } else {
             setBulkItems([{ id: Math.random().toString(), prompt: '', image: null, imagePreview: null }]);
        }
    };
    const updateBulkPrompt = (id: string, newPrompt: string) => {
        setBulkItems(prev => prev.map(item => item.id === id ? { ...item, prompt: newPrompt } : item));
    };

    return (
        <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-6 md:p-8 space-y-8 h-fit">
            {/* Mode Toggle */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <button type="button" disabled={isFormDisabled} onClick={() => setMode('single')} className={`flex-1 py-3 rounded-xl text-base font-bold transition-all ${mode === 'single' ? 'bg-white text-veo-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'} ${isFormDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>Satu Video</button>
                <button type="button" disabled={isFormDisabled} onClick={() => setMode('bulk')} className={`flex-1 py-3 rounded-xl text-base font-bold transition-all ${mode === 'bulk' ? 'bg-white text-veo-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'} ${isFormDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>Generate Massal (Bulk)</button>
            </div>

            {mode === 'single' ? (
                /* SINGLE MODE Inputs */
                <>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label htmlFor="prompt" className="text-base font-bold text-slate-700 uppercase tracking-wider">Prompt (Deskripsi)</label>
                            <span className={`text-sm font-medium ${prompt.length > 6000 ? 'text-veo-primary' : 'text-slate-400'}`}>{prompt.length}/6500</span>
                        </div>
                        <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={isFormDisabled} maxLength={6500} rows={5}
                            className={`input-base resize-none h-40 text-base leading-relaxed ${isFormDisabled ? 'bg-slate-50 cursor-not-allowed opacity-75' : ''}`} placeholder="Deskripsikan video yang ingin Anda buat secara detail..." />
                    </div>
                    <div className="space-y-3">
                        <span className="text-base font-bold text-slate-700 uppercase tracking-wider block">Gambar Referensi <span className="text-slate-400 font-normal normal-case">(Opsional)</span></span>
                        {!imagePreview ? (
                            <div onDragOver={(e) => { if(!isFormDisabled) { e.preventDefault(); setIsDragging(true); } }} onDragLeave={() => setIsDragging(false)} onDrop={onDropSingle}
                                onClick={() => !isFormDisabled && document.getElementById('image-upload')?.click()}
                                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all group ${isFormDisabled ? 'cursor-not-allowed opacity-60 bg-slate-50 border-slate-200' : 'cursor-pointer'} ${isDragging ? 'border-veo-primary bg-veo-primary/5' : (isFormDisabled ? '' : 'border-slate-300 hover:border-veo-primary hover:bg-slate-50')}`}>
                                <input type="file" id="image-upload" accept="image/*" className="hidden" disabled={isFormDisabled} onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0])} />
                                <div className="flex flex-col items-center gap-3 text-slate-500 group-hover:text-veo-primary">
                                    <UploadIcon className="w-10 h-10" />
                                    <p className="text-base font-medium">Klik atau geser gambar ke sini</p>
                                </div>
                            </div>
                        ) : (
                            <div className={`relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-3 flex items-center gap-4 ${isBusy ? 'opacity-75' : ''}`}>
                                <img src={imagePreview} alt="Reference" className="w-20 h-20 object-cover rounded-xl border border-slate-200" />
                                <div className="flex-1 min-w-0"><p className="text-base font-medium truncate text-slate-700">{image?.name}</p><p className="text-sm text-veo-primary font-medium">Gambar Terpasang</p></div>
                                <button type="button" disabled={isFormDisabled} onClick={() => { setImage(null); setImagePreview(null); }} className={`p-3 bg-white border border-slate-200 rounded-xl transition-all ${isFormDisabled ? 'cursor-not-allowed text-slate-300' : 'hover:bg-red-50 text-slate-400 hover:text-red-500'}`}><XMarkIcon className="w-6 h-6" /></button>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                /* BULK MODE Inputs */
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-3 custom-scrollbar">
                     <p className="text-base text-slate-600 bg-slate-100 p-4 rounded-2xl">Tambahkan banyak prompt sekaligus. Setiap baris akan masuk antrian secara terpisah. <b>Dua video akan diproses sekaligus.</b></p>
                    {bulkItems.map((item, index) => (
                        <div key={item.id} className={`p-5 bg-slate-50 rounded-3xl border border-slate-200 space-y-4 relative group shadow-sm ${isBusy ? 'opacity-75' : ''}`}>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-veo-primary uppercase tracking-wider bg-veo-primary/10 px-3 py-1 rounded-lg">Video {index + 1}</span>
                                {bulkItems.length > 1 && (
                                    <button type="button" disabled={isFormDisabled} onClick={() => removeBulkRow(item.id)} className={`p-2 rounded-full transition-all ${isFormDisabled ? 'cursor-not-allowed text-slate-300' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}><XMarkIcon className="w-5 h-5" /></button>
                                )}
                            </div>
                            <textarea
                                value={item.prompt}
                                disabled={isFormDisabled}
                                onChange={(e) => updateBulkPrompt(item.id, e.target.value)}
                                placeholder={`Prompt untuk Video ${index + 1}...`}
                                className={`input-base h-28 resize-none text-base ${isFormDisabled ? 'cursor-not-allowed bg-slate-100' : ''}`}
                            />
                            <div>
                                {!item.imagePreview ? (
                                    <label className={`inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl transition-all text-sm font-bold text-slate-500 ${isFormDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-veo-primary hover:text-veo-primary'}`}>
                                        <UploadIcon className="w-5 h-5" />
                                        <span>+ Gambar Referensi (Opsional)</span>
                                        <input type="file" accept="image/*" disabled={isFormDisabled} className="hidden" onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], true, item.id)} />
                                    </label>
                                ) : (
                                    <div className="inline-flex items-center gap-3 bg-white p-2 rounded-xl border-2 border-veo-primary/30 pr-4">
                                        <img src={item.imagePreview} className="w-10 h-10 rounded-lg object-cover border border-slate-200" alt="" />
                                        <span className="text-sm font-medium truncate max-w-[150px] text-slate-700">{item.image?.name}</span>
                                        <button type="button" disabled={isFormDisabled} onClick={() => setBulkItems(prev => prev.map(i => i.id === item.id ? { ...i, image: null, imagePreview: null } : i))} className={`p-1 rounded-full ${isFormDisabled ? 'cursor-not-allowed text-slate-300' : 'text-slate-400 hover:text-red-500 hover:bg-slate-100'}`}><XMarkIcon className="w-5 h-5" /></button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    <button type="button" disabled={isFormDisabled} onClick={addBulkRow} className={`w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 font-bold text-base transition-all ${isFormDisabled ? 'cursor-not-allowed opacity-60' : 'hover:border-veo-primary hover:text-veo-primary hover:bg-veo-primary/5'}`}>+ Tambah Video Lain</button>
                </div>
            )}

            {/* Shared Settings */}
            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                <div className="space-y-3">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Rasio Aspek</span>
                    <div className="flex bg-slate-100 p-1.5 rounded-xl">
                        {(Object.values(AspectRatio) as AspectRatio[]).map((r) => (
                            <button key={r} type="button" disabled={isFormDisabled} onClick={() => setAspectRatio(r)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${aspectRatio === r ? 'bg-white text-veo-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'} ${isFormDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>{r}</button>
                        ))}
                    </div>
                </div>
                 <div className="space-y-3">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Resolusi</span>
                    <div className="flex bg-slate-100 p-1.5 rounded-xl">
                        {(Object.values(Resolution) as Resolution[]).map((r) => (
                            <button key={r} type="button" disabled={isFormDisabled} onClick={() => setResolution(r)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${resolution === r ? 'bg-white text-veo-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'} ${isFormDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>{r}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center gap-2">
              <button
                  type="submit"
                  disabled={isFormDisabled || (mode === 'single' && !prompt.trim()) || (mode === 'bulk' && !bulkItems.some(i => i.prompt.trim()))}
                  className={`flex-1 py-5 rounded-2xl font-black uppercase tracking-widest text-lg flex items-center justify-center gap-3 transition-all duration-300 text-white shadow-lg
                      ${isFormDisabled || (mode === 'single' && !prompt.trim()) || (mode === 'bulk' && !bulkItems.some(i => i.prompt.trim()))
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                          : 'bg-veo-primary hover:bg-veo-primary/90 hover:shadow-veo-primary/30 hover:scale-[1.01] active:scale-[0.99]'
                      }
                  `}
              >
                  {!isBusy && <SparklesIcon className="w-6 h-6" />}
                  {isBusy ? 'Sedang Memproses...' : (mode === 'bulk' ? `Antrikan ${bulkItems.filter(i => i.prompt.trim()).length} Video` : 'Mulai Generate')}
              </button>
              {isBusy && (
                <button type="button" onClick={() => onStop && onStop()} className="px-3 py-2 rounded-full bg-red-600 text-white border border-red-700/40 hover:bg-red-700 shadow-sm font-bold text-xs" title="Hentikan proses">Stop</button>
              )}
            </div>
        </form>
    );
};

export default GenerationForm;
