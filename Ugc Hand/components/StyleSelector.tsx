
import React, { useRef } from 'react';
import { SceneStyle, AspectRatio, SceneCount, VoiceGender, Language, FileData } from '../types';

interface StyleSelectorProps {
  selectedStyle: SceneStyle;
  onSelectStyle: (style: SceneStyle) => void;
  selectedRatio: AspectRatio;
  onSelectRatio: (ratio: AspectRatio) => void;
  selectedSceneCount: SceneCount;
  onSelectSceneCount: (count: SceneCount) => void;
  selectedVoice: VoiceGender;
  onSelectVoice: (voice: VoiceGender) => void;
  selectedLanguage: Language;
  onSelectLanguage: (lang: Language) => void;
  customBackground: FileData | null;
  onSelectCustomBackground: (data: FileData) => void;
  productDescription: string;
  onUpdateProductDescription: (desc: string) => void;
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({ 
  selectedStyle, 
  onSelectStyle,
  selectedRatio,
  onSelectRatio,
  selectedSceneCount,
  onSelectSceneCount,
  selectedVoice,
  onSelectVoice,
  selectedLanguage,
  onSelectLanguage,
  customBackground,
  onSelectCustomBackground,
  productDescription,
  onUpdateProductDescription
}) => {
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Updated to only include 9:16 and 16:9 as requested
  const ratios: AspectRatio[] = ["9:16", "16:9"];
  
  const sceneCounts: SceneCount[] = [2, 3, 4];
  const voices: VoiceGender[] = ["Wanita", "Pria"];
  const languages: Language[] = [
    'Indonesia', 'Inggris', 'Malaysia', 'Jawa', 'Sunda', 
    'Mandarin', 'Jepang', 'Korea', 'Arab', 'Spanyol'
  ];

  const handleBackgroundUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      const mimeType = result.split(',')[0].split(':')[1].split(';')[0];

      onSelectCustomBackground({
        file,
        preview: result,
        base64,
        mimeType
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full mt-6 space-y-6">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">1. Deskripsi Produk <span className="text-red-600">(Wajib)</span></label>
        <textarea
          value={productDescription}
          onChange={(e) => onUpdateProductDescription(e.target.value)}
          placeholder="Contoh: Tas ransel anti air dengan 3 kompartemen; bahan polyester premium; cocok untuk traveling dan kuliah; warna hitam, navy, abu-abu."
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm resize-none"
          rows={3}
        />
        <p className="text-xs text-gray-500 mt-1">Isi deskripsi agar AI dapat menulis naskah yang relevan.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Style Selector Dropdown */}
        <div>
           <label className="block text-sm font-semibold text-gray-700 mb-2">2. Pilih Gaya Lingkungan</label>
           <div className="relative">
             <select
               value={selectedStyle}
               onChange={(e) => onSelectStyle(e.target.value as SceneStyle)}
               className="w-full p-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent shadow-sm cursor-pointer hover:border-orange-300 transition-colors"
             >
               {Object.values(SceneStyle).map((style) => (
                 <option key={style} value={style}>{style}</option>
               ))}
             </select>
             <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-orange-500">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                 <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clipRule="evenodd" />
               </svg>
             </div>
           </div>

           {/* Custom Background Upload Area */}
           {selectedStyle === SceneStyle.CUSTOM && (
             <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleBackgroundUpload} 
                />
                
                {!customBackground ? (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl p-4 flex flex-col items-center justify-center transition-colors gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                    <span className="text-sm font-semibold">Unggah Gambar Background</span>
                  </button>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-orange-200 group">
                    <img src={customBackground.preview} alt="Custom Background" className="w-full h-32 object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <button 
                         onClick={() => fileInputRef.current?.click()}
                         className="bg-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-gray-100"
                       >
                         Ganti
                       </button>
                    </div>
                  </div>
                )}
             </div>
           )}
        </div>

        {/* Language Selector Dropdown */}
        <div>
           <label className="block text-sm font-semibold text-gray-700 mb-2">3. Bahasa Narasi</label>
           <div className="relative">
             <select
               value={selectedLanguage}
               onChange={(e) => onSelectLanguage(e.target.value as Language)}
               className="w-full p-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent shadow-sm cursor-pointer hover:border-orange-300 transition-colors"
             >
               {languages.map((lang) => (
                 <option key={lang} value={lang}>{lang}</option>
               ))}
             </select>
             <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-orange-500">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                 <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clipRule="evenodd" />
               </svg>
             </div>
           </div>
        </div>
      </div>

      {/* Aspect Ratio Selector - Full Width */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">4. Rasio Video (Aspect Ratio)</label>
        <div className="grid grid-cols-2 gap-3">
          {ratios.map((ratio) => (
            <button
              key={ratio}
              onClick={() => onSelectRatio(ratio)}
              className={`
                px-4 py-3 rounded-lg text-sm font-bold transition-all border flex items-center justify-center gap-2 shadow-sm
                ${selectedRatio === ratio 
                  ? 'bg-orange-600 border-orange-600 text-white shadow-orange-200' 
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                }
              `}
            >
              <span className={`block border-2 border-current rounded-sm
                 ${ratio === '9:16' ? 'w-2 h-3' : ''}
                 ${ratio === '16:9' ? 'w-3 h-2' : ''}
              `}></span>
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* Scene Count - Full Width */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">5. Jumlah Adegan</label>
        <div className="grid grid-cols-3 gap-3">
          {sceneCounts.map((count) => (
            <button
              key={count}
              onClick={() => onSelectSceneCount(count)}
              className={`
                px-4 py-3 rounded-lg text-sm font-bold transition-all border shadow-sm
                ${selectedSceneCount === count 
                  ? 'bg-orange-100 border-orange-500 text-orange-700 ring-2 ring-orange-500' 
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                }
              `}
            >
              {count} Adegan
            </button>
          ))}
        </div>
      </div>

      {/* Voice Gender - Full Width */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">6. Suara Narator</label>
        <div className="grid grid-cols-2 gap-3">
          {voices.map((voice) => (
            <button
              key={voice}
              onClick={() => onSelectVoice(voice)}
              className={`
                px-4 py-3 rounded-lg text-sm font-bold transition-all border flex items-center justify-center gap-2 shadow-sm
                ${selectedVoice === voice 
                  ? 'bg-amber-100 border-amber-500 text-amber-800 ring-2 ring-amber-500' 
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                }
              `}
            >
              {voice === 'Pria' ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              )}
              {voice}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
