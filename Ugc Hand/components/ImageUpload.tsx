import React, { useCallback } from 'react';
import { FileData } from '../types';

interface ImageUploadProps {
  onFileSelect: (data: FileData) => void;
  selectedFile: FileData | null;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onFileSelect, selectedFile }) => {
  
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Extract base64 data and mime type
      const base64 = result.split(',')[1];
      const mimeType = result.split(',')[0].split(':')[1].split(';')[0];

      onFileSelect({
        file,
        preview: result,
        base64,
        mimeType
      });
    };
    reader.readAsDataURL(file);
  }, [onFileSelect]);

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-gray-700 mb-2">1. Unggah Foto Produk</label>
      
      {!selectedFile ? (
        <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer bg-white hover:bg-orange-50 hover:border-orange-400 transition-all group shadow-sm">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <div className="p-4 rounded-full bg-orange-100 mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-8 h-8 text-orange-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
              </svg>
            </div>
            <p className="mb-2 text-sm text-gray-600"><span className="font-semibold text-orange-600">Klik untuk unggah</span> atau tarik file ke sini</p>
            <p className="text-xs text-gray-400">PNG, JPG (MAKS. 5MB)</p>
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </label>
      ) : (
        <div className="relative w-full h-64 rounded-2xl overflow-hidden border border-gray-200 shadow-md group bg-white">
          <img src={selectedFile.preview} alt="Preview" className="w-full h-full object-contain p-2" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
             <button 
                onClick={() => {
                    const input = document.getElementById('file-upload') as HTMLInputElement;
                    if(input) input.value = '';
                    document.getElementById('replace-upload')?.click();
                }}
                className="bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 shadow-lg"
             >
                Ganti Foto
             </button>
             <label id="replace-upload" className="hidden">
                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
             </label>
          </div>
        </div>
      )}
    </div>
  );
};